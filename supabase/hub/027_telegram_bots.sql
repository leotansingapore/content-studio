-- A brand's own Telegram bot (docs/north-star/items/publish-telegram.md, "Own bot per brand"). The shared Content
-- Studio bot (026) stays the default; a brand may instead post through a bot its owner made in BotFather, so group
-- posts show that bot's name.
--
--   cs_telegram_bots                  one own bot per brand: its Telegram id and @name, the Vault id of its token, the
--                                     sha256 of its webhook secret, status.
--   cs_telegram_chats.bot_id          the bot a connect code was issued for and a chat was tied through (null: shared).
--   cs_telegram_bot_save(...)         stores a token in Vault and the row with it, in one statement.
--   cs_telegram_bot_token(bot_id)     reads an active bot's token, for a send or a reply to its webhook.
--   cs_telegram_bots_forget_token()   trigger: deleting a bot's row deletes its Vault secret.
--
-- Security model
--   * The token is pasted once into the `telegram` function (add own bot), which checks it with getMe and stores it
--     here through cs_telegram_bot_save; from then on it exists only in Vault (named cs_telegram_bot_<bot id>). It is
--     never returned to a client, logged, or put in one of our URLs.
--   * webhook_secret_hash is the sha256 of the secret_token given to that bot's setWebhook; telegram-hook accepts an
--     update for the bot only when the header's hash matches, compared timing-safe.
--   * Clients may select only the non-secret columns of their own rows (a column-level grant: a REVOKE of single
--     columns is a no-op while a table-wide grant stands, so there is none). token_secret_id and webhook_secret_hash
--     are readable by the service role alone. Rows are written only by the edge functions with the service role.
--   * A bot belongs to one brand of one account (unique bot_id), and a brand has one own bot.
--   * Deleting a row (Switch back to the shared bot, or the user deleted) deletes its Vault secret by trigger.
--   * The functions are service_role only, SECURITY DEFINER with the house search_path. Storage is untouched.
--
-- Grants
--   table cs_telegram_bots
--     revoke all from public, anon, authenticated: undoes Supabase's default ALL grant.
--     grant select (id, owner_id, profile_id, bot_id, username, display_name, status, created_at, updated_at) to
--       authenticated: RLS reads of the caller's own rows, without the secret columns.
--     grant select, insert, update, delete to service_role.
--   cs_telegram_chats.bot_id: covered by 026's table-wide grants (owner reads, service role writes).
--   functions: revoke execute from public, anon, authenticated; save and token granted to service_role.
--
-- Policies
--   cs_telegram_bots_owner_read: owner_id = auth.uid().
--
-- BEFORE APPLYING (the integrator, read-only, on the academy project):
--   1. 026 is applied. The names must be free (check-live-name-before-migration); every line must return null or
--      no rows:
--        select to_regclass('public.cs_telegram_bots');
--        select proname from pg_proc where proname in ('cs_telegram_bot_save', 'cs_telegram_bot_token', 'cs_telegram_bots_forget_token');
--        select column_name from information_schema.columns where table_schema = 'public' and table_name = 'cs_telegram_chats' and column_name = 'bot_id';
--        select name from vault.secrets where name like 'cs_telegram_bot_%';
--      and the policies on storage.objects are as 026 found them (027 adds none):
--        select polname, polcmd, polroles::regrole[], pg_get_expr(polqual, polrelid) from pg_policy
--        where polrelid = 'storage.objects'::regclass;
--   2. An independent review of this file and 027_telegram_bots.test.sql (migration-review-before-apply).
--   3. Deploy the telegram and telegram-hook versions that read cs_telegram_bots after applying; the deployed ones
--      ignore the new column until then.
-- Then run 027_telegram_bots.test.sql (it rolls back).
--
-- Idempotent: safe to run again. One transaction. The foreign key to auth.users takes SHARE ROW EXCLUSIVE on
-- auth.users, and the new column takes ACCESS EXCLUSIVE on cs_telegram_chats, for this short transaction;
-- lock_timeout gives up after 3 seconds; run it again later if it times out.

begin;
set local lock_timeout = '3s';

create table if not exists public.cs_telegram_bots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- src/lib/profiles.ts ids: "me" or p + base-36 characters (as 018).
  profile_id text not null check (profile_id ~ '^[a-z0-9]{1,40}$'),
  -- the bot's own Telegram user id (the number before the token's colon)
  bot_id bigint not null unique check (bot_id > 0),
  username text not null check (username ~ '^[A-Za-z0-9_]{5,64}$'),
  display_name text not null default '' check (char_length(display_name) <= 128),
  -- vault.secrets.id of the token; never readable by a client
  token_secret_id uuid not null,
  -- sha256 (hex) of the secret_token given to setWebhook; never readable by a client
  webhook_secret_hash text not null check (webhook_secret_hash ~ '^[0-9a-f]{64}$'),
  -- revoked: Telegram no longer takes the token
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, profile_id)
);

alter table public.cs_telegram_bots enable row level security;

revoke all on table public.cs_telegram_bots from public, anon, authenticated;
grant select (id, owner_id, profile_id, bot_id, username, display_name, status, created_at, updated_at)
  on table public.cs_telegram_bots to authenticated;
grant select, insert, update, delete on table public.cs_telegram_bots to service_role;

drop policy if exists cs_telegram_bots_owner_read on public.cs_telegram_bots;
create policy cs_telegram_bots_owner_read on public.cs_telegram_bots
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- the bot a code was issued for and a chat was tied through; null is the shared bot
alter table public.cs_telegram_chats add column if not exists bot_id bigint check (bot_id > 0);
create index if not exists cs_telegram_chats_bot on public.cs_telegram_chats (bot_id) where bot_id is not null;

-- Stores the token in Vault and the row with its id, in one statement: a refused row leaves no secret behind.
create or replace function public.cs_telegram_bot_save(
  p_owner uuid,
  p_profile text,
  p_bot_id bigint,
  p_username text,
  p_display_name text,
  p_token text,
  p_webhook_secret_hash text
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  v_secret uuid;
  v_id uuid;
begin
  -- a BotFather token is "<bot id>:<secret>"; the message never carries the token
  if p_token is null or p_token !~ '^[0-9]{5,15}:[A-Za-z0-9_-]{30,64}$' or split_part(p_token, ':', 1)::bigint is distinct from p_bot_id then
    raise exception 'Not a token for bot %', p_bot_id using errcode = '22023';
  end if;
  v_secret := vault.create_secret(p_token, 'cs_telegram_bot_' || p_bot_id, 'Telegram bot token (027 cs_telegram_bots)');
  insert into public.cs_telegram_bots (owner_id, profile_id, bot_id, username, display_name, token_secret_id, webhook_secret_hash)
  values (p_owner, p_profile, p_bot_id, p_username, coalesce(p_display_name, ''), v_secret, p_webhook_secret_hash)
  returning id into v_id;
  return v_id;
end $fn$;

-- An active bot's token, for a send or a reply to its webhook; null for an unknown or revoked bot.
create or replace function public.cs_telegram_bot_token(p_bot_id bigint)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
  select s.decrypted_secret
  from public.cs_telegram_bots b
  join vault.decrypted_secrets s on s.id = b.token_secret_id
  where b.bot_id = p_bot_id and b.status = 'active';
$fn$;

-- Deleting a bot's row deletes its token from Vault.
create or replace function public.cs_telegram_bots_forget_token()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
begin
  delete from vault.secrets where id = old.token_secret_id;
  return old;
end $fn$;

drop trigger if exists cs_telegram_bots_forget_token on public.cs_telegram_bots;
create trigger cs_telegram_bots_forget_token
  after delete on public.cs_telegram_bots
  for each row execute function public.cs_telegram_bots_forget_token();

revoke all on function public.cs_telegram_bot_save(uuid, text, bigint, text, text, text, text) from public, anon, authenticated;
revoke all on function public.cs_telegram_bot_token(bigint) from public, anon, authenticated;
revoke all on function public.cs_telegram_bots_forget_token() from public, anon, authenticated, service_role;
grant execute on function public.cs_telegram_bot_save(uuid, text, bigint, text, text, text, text) to service_role;
grant execute on function public.cs_telegram_bot_token(bigint) to service_role;

commit;
