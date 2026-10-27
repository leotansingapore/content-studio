-- A brand's own Telegram bot (docs/north-star/items/publish-telegram.md, "Own bot per brand"). The shared Content
-- Studio bot (026) stays the default; a brand may instead post through a bot its owner made in BotFather, so group
-- posts show that bot's name.
--
--   cs_telegram_bots                  one own bot per brand: its Telegram id and @name, the Vault id of its token, the
--                                     sha256 of its webhook secret, status.
--   cs_telegram_chats.bot_id          the bot a connect code was issued for and a chat was tied through (null: shared),
--                                     bound to that bot's row by (owner_id, profile_id, bot_id).
--   cs_telegram_bot_save(...)         stores a token in Vault and the row with it; refuses with null, never an error.
--   cs_telegram_bot_token(bot_id)     reads an active bot's token, for a send or a reply to its webhook.
--   cs_telegram_bots_release_chats()  trigger: deleting a bot disconnects the chats tied through it and cancels their
--                                     waiting posts, in the same statement.
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
--   * A chat names its bot through a composite foreign key (owner_id, profile_id, bot_id) onto the bot's row, so it
--     can only name a bot of its own brand. Deleting a bot (Switch back to the shared bot, or the user deleted)
--     disconnects the chats and codes tied through it, lets go of the bot id, and cancels their waiting posts in the
--     same statement, so a chat never points at a deleted bot or at the same bot added again by someone else. The
--     same delete removes its Vault secret.
--   * The token stays out of the logs because of the server's logging settings. Whether a statement's bind values
--     are logged is decided when the statement is bound, before any function's SET clause applies, so no function
--     can promise it. On academy (read-only check, 27 Oct 2026): log_statement = ddl, log_min_duration_statement = -1,
--     log_min_duration_sample = -1, log_parameter_max_length_on_error = 0, pgaudit.log = none, no role overrides of
--     logging, and auto_explain.log_min_duration = 10000 with statement_timeout = 8s on authenticator, so no API
--     statement runs long enough to be explained. 027_telegram_bots.test.sql 0.5d checks these. Re-check them,
--     read-only, before adding a bot after any change to the project's logging:
--        select name, setting from pg_settings where name in ('log_statement', 'log_min_duration_statement',
--          'log_min_duration_sample', 'log_parameter_max_length_on_error', 'log_min_error_statement', 'pgaudit.log',
--          'auto_explain.log_min_duration');
--        select r.rolname, s.setconfig from pg_db_role_setting s left join pg_roles r on r.oid = s.setrole;
--     Belt and braces on top: the edge function checks the token's shape and that the bot and brand are free before
--     calling cs_telegram_bot_save; the function checks everything again and answers null rather than raising once
--     it holds the token (no unguarded cast, no message with the token); and it runs with log_min_error_statement =
--     panic and log_parameter_max_length_on_error = 0.
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
--        select proname from pg_proc where proname in ('cs_telegram_bot_save', 'cs_telegram_bot_token', 'cs_telegram_bots_forget_token', 'cs_telegram_bots_release_chats');
--        select conname from pg_constraint where conname = 'cs_telegram_chats_bot_fk';
--        select column_name from information_schema.columns where table_schema = 'public' and table_name = 'cs_telegram_chats' and column_name = 'bot_id';
--        select name from vault.secrets where name like 'cs_telegram_bot_%';
--      and the policies on storage.objects are as 026 found them (027 adds none):
--        select polname, polcmd, polroles::regrole[], pg_get_expr(polqual, polrelid) from pg_policy
--        where polrelid = 'storage.objects'::regclass;
--      Postgres 15 or later, and the migration role may set log_min_error_statement in a function's SET clause
--      (a superuser, or GRANT SET ON PARAMETER); both must return true, or cs_telegram_bot_save can't be created:
--        select current_setting('server_version_num')::int >= 150000;
--        select (select rolsuper from pg_roles where rolname = current_user) or has_parameter_privilege('log_min_error_statement', 'SET');
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
  unique (owner_id, profile_id),
  -- what a chat's composite foreign key points at
  unique (owner_id, profile_id, bot_id)
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

-- the bot a code was issued for and a chat was tied through; null is the shared bot. Bound to that bot's row: a chat
-- can only name a bot of its own brand (MATCH SIMPLE: a null bot_id, the shared bot, isn't checked).
alter table public.cs_telegram_chats add column if not exists bot_id bigint check (bot_id > 0);
create index if not exists cs_telegram_chats_bot on public.cs_telegram_chats (owner_id, profile_id, bot_id) where bot_id is not null;
alter table public.cs_telegram_chats drop constraint if exists cs_telegram_chats_bot_fk;
alter table public.cs_telegram_chats add constraint cs_telegram_chats_bot_fk
  foreign key (owner_id, profile_id, bot_id) references public.cs_telegram_bots (owner_id, profile_id, bot_id);

-- Stores the token in Vault and the row with its id. Every refusal is a null, never an error, and everything that could
-- refuse is checked before the secret is made. The server's logging settings are what keep the call's bind values out
-- of the logs (see the header); the SET clause is belt and braces.
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
set log_min_error_statement = panic
set log_parameter_max_length_on_error = 0
as $fn$
declare
  v_secret uuid;
  v_id uuid;
begin
  -- a BotFather token is "<bot id>:<secret>" for this very bot; the cast only runs on a short run of digits
  if p_token is null or p_token !~ '^[0-9]{5,15}:[A-Za-z0-9_-]{30,64}$'
     or p_bot_id is null or p_bot_id <= 0
     or (case when split_part(p_token, ':', 1) ~ '^[0-9]{5,15}$' then split_part(p_token, ':', 1)::bigint end) is distinct from p_bot_id
     or p_owner is null or not exists (select 1 from auth.users where id = p_owner)
     or p_profile is null or p_profile !~ '^[a-z0-9]{1,40}$'
     or p_username is null or p_username !~ '^[A-Za-z0-9_]{5,64}$'
     or char_length(coalesce(p_display_name, '')) > 128
     or p_webhook_secret_hash is null or p_webhook_secret_hash !~ '^[0-9a-f]{64}$'
     or exists (select 1 from public.cs_telegram_bots where bot_id = p_bot_id or (owner_id = p_owner and profile_id = p_profile))
     or exists (select 1 from vault.secrets where name = 'cs_telegram_bot_' || p_bot_id) then
    return null;
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

-- Deleting a bot first lets go of its chats, in the same statement: the chats and codes tied through it are
-- disconnected with bot_id cleared (so the foreign key holds and nothing points at a re-added bot), and their waiting
-- posts are cancelled.
create or replace function public.cs_telegram_bots_release_chats()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
begin
  update public.cs_telegram_posts p
     set status = 'cancelled', error = 'Disconnected', finished_at = now()
   where p.status = 'scheduled'
     and p.chat_row in (
       select c.id from public.cs_telegram_chats c
       where c.owner_id = old.owner_id and c.profile_id = old.profile_id and c.bot_id = old.bot_id
     );
  update public.cs_telegram_chats c
     set status = 'disconnected', removed_at = coalesce(c.removed_at, now()), bot_id = null
   where c.owner_id = old.owner_id and c.profile_id = old.profile_id and c.bot_id = old.bot_id;
  return old;
end $fn$;

drop trigger if exists cs_telegram_bots_release_chats on public.cs_telegram_bots;
create trigger cs_telegram_bots_release_chats
  before delete on public.cs_telegram_bots
  for each row execute function public.cs_telegram_bots_release_chats();

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
revoke all on function public.cs_telegram_bots_release_chats() from public, anon, authenticated, service_role;
grant execute on function public.cs_telegram_bot_save(uuid, text, bigint, text, text, text, text) to service_role;
grant execute on function public.cs_telegram_bot_token(bigint) to service_role;

commit;
