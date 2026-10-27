-- Post to a Telegram group or channel (docs/north-star/items/publish-telegram.md, on ns/phase7). One Content Studio
-- bot that everyone shares: Connect Telegram makes a one-time code, the bot ties the person's group or channel to
-- their brand (supabase/functions/telegram-hook), and posts wait here until the send tick sends them between 09:00
-- and 21:00 Singapore time.
--
--   cs_telegram_chats   one row per connect: the code (hashed), who tapped Start, then the chat once tied.
--   cs_telegram_posts   the queue: one row per post per chat.
--   cs-telegram-media   private bucket for the post's pictures or video, <owner>/<profile>/<uuid>.<ext>.
--   cs_telegram_claim_due(limit, now)   the send tick's claim: due posts, one per chat, 09:00 to 21:00 only.
--   cs_telegram_tick_due(now)           whether the cron should call the tick at all.
--   telegram-send       pg_cron, every minute, calls telegram-hook only when cs_telegram_tick_due().
--
-- Security model
--   * The bot token is the edge secret TELEGRAM_BOT_TOKEN only; nothing here stores a token.
--   * The one-time code is never stored: code_hash is its sha256 (hex). It expires 15 minutes after it is made
--     (code_expires_at).
--   * A code someone else made can't tie your chat to their account. Connect Telegram makes the code and a nonce
--     kept in that browser (nonce_hash here), and cancels the brand's earlier waiting code. /start <code> notes the
--     first Telegram user who taps it (tg_user_id, unconfirmed; a later Start gets nothing) and answers only with a
--     Confirm button (Telegram's login_url) back to /accounts. There, signed in, in the browser holding the nonce, the
--     `telegram` function checks Telegram's signed login against the bot token (under 5 minutes old), shows "Connect
--     Telegram as <name> (@username)?", and only Connect confirms the code (confirmed_at, tg_user_name, login_hash)
--     when the session is the account that made it and the login is that same Telegram user. Each login is used
--     once (login_hash, unique), and a Telegram user holds one confirmed waiting connect at a time. Only that
--     Telegram user's pick or admin change ties a chat, and a row can't be live without a confirmed login
--     (cs_telegram_chats_confirmed). Nothing personal is sent in Telegram. The app shows who connected each chat
--     (tg_user_name) beside Disconnect.
--   * Rows are written only by the edge functions with the service role. The owner may read their own rows (the
--     page polls its connect row every 3 s, and lists its chats and posts); anon has no grant at all.
--   * The bucket is private with no storage.objects policy: files go up through signed upload URLs made by the
--     `telegram` function and are read by the hook through 1-hour signed URLs at send time.
--   * Both functions are service_role only; the claim also refuses outside 09:00 to 21:00 Singapore time, so a bug
--     in the tick can't send at night.
--   * Deleting a user deletes their rows (on delete cascade). Their files stay in the bucket until the 7-day cleanup
--     of their posts, which the cascade removes first: delete <owner>/ from the bucket by hand for a deleted user.
--
-- Grants
--   tables cs_telegram_chats, cs_telegram_posts
--     revoke all from public, anon, authenticated: undoes Supabase's default ALL grant.
--     grant select to authenticated: RLS reads of the caller's own rows.
--     grant select, insert, update, delete to service_role.
--   functions: revoke execute from public, anon, authenticated; grant to service_role.
--
-- Policies
--   cs_telegram_chats_owner_read, cs_telegram_posts_owner_read: owner_id = auth.uid().
--
-- BEFORE APPLYING (the integrator, read-only, on the academy project):
--   1. The names must be free (check-live-name-before-migration); every line must return null or no rows:
--        select to_regclass('public.cs_telegram_chats'), to_regclass('public.cs_telegram_posts');
--        select proname from pg_proc where proname in ('cs_telegram_claim_due', 'cs_telegram_tick_due');
--        select id from storage.buckets where id = 'cs-telegram-media';
--        select jobname from cron.job where jobname = 'telegram-send';
--   2. An independent review of this file and 026_telegram.test.sql (migration-review-before-apply).
--   3. The cron secret in Vault, never in this repo. The value is the edge secret TELEGRAM_CRON_SECRET (keep it in
--      the keychain as cs-telegram-cron-secret). psql interpolates a variable only in a statement it reads, so pipe
--      the statement in:
--        echo "select vault.create_secret(:'s', 'cs_telegram_cron_secret', 'telegram-send cron header');" |
--          psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v s="$(security find-generic-password -s cs-telegram-cron-secret -a leo -w)"
--      This file refuses to run while that Vault secret is missing or empty.
--   4. Deploy telegram-hook before applying: the job calls it from the first due post.
-- Then run 026_telegram.test.sql (it rolls back).
--
-- pg_cron reads schedules in UTC here (cron.timezone is GMT on academy); the hours live in the SQL, not the schedule.
--
-- Idempotent: safe to run again. One transaction. The foreign keys to auth.users take SHARE ROW EXCLUSIVE on
-- auth.users for this short transaction; lock_timeout gives up after 3 seconds; run it again later if it times out.

begin;
set local lock_timeout = '3s';

do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'cs_telegram_cron_secret' and coalesce(decrypted_secret, '') <> ''
  ) then
    raise exception 'Put cs_telegram_cron_secret in Vault first (see the header of 026).';
  end if;
end $$;

create table if not exists public.cs_telegram_chats (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- src/lib/profiles.ts ids: "me" or p + base-36 characters (as 018).
  profile_id text not null check (profile_id ~ '^[a-z0-9]{1,40}$'),
  -- sha256 of the one-time code, hex; the code itself is never stored
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  code_expires_at timestamptz not null,
  -- the Telegram user who tapped Start with the code; once their signed login is verified for the account that
  -- made it: their @name or first name for "Added by", when, and that login's hash (each login is used once)
  tg_user_id bigint,
  tg_user_name text check (char_length(tg_user_name) <= 64),
  confirmed_at timestamptz,
  login_hash text unique check (login_hash ~ '^[0-9a-f]{64}$'),
  -- sha256 of the nonce kept in the browser that pressed Connect Telegram; the confirm works only there
  nonce_hash text check (nonce_hash ~ '^[0-9a-f]{64}$'),
  -- the chat, once tied (Telegram ids fit 52 bits)
  chat_id bigint,
  chat_type text check (chat_type in ('group', 'supergroup', 'channel')),
  title text check (char_length(title) <= 255),
  username text check (username ~ '^[A-Za-z0-9_]{1,64}$'),
  is_forum boolean not null default false,
  -- a forum topic picked with /here; null posts to General
  topic_id integer check (topic_id > 0),
  topic_name text check (char_length(topic_name) <= 128),
  -- pending: a started connect; connected; cant_post: the bot lost its posting right; removed: the bot was taken
  -- out in Telegram; disconnected: Disconnect in the app, or replaced by a newer connect of the same chat
  status text not null default 'pending' check (status in ('pending', 'connected', 'cant_post', 'removed', 'disconnected')),
  -- why the last chat picked during this connect wasn't tied (the row stays pending)
  refusal text check (refusal in ('not_admin', 'cant_post')),
  created_at timestamptz not null default now(),
  connected_at timestamptz,
  removed_at timestamptz,
  check (status in ('pending', 'disconnected') or chat_id is not null),
  constraint cs_telegram_chats_confirmed check (
    (confirmed_at is null or (tg_user_id is not null and login_hash is not null and nonce_hash is not null))
    and (status in ('pending', 'disconnected') or confirmed_at is not null)
  )
);

-- one brand has one live row per chat
create unique index if not exists cs_telegram_chats_one_live on public.cs_telegram_chats (owner_id, profile_id, chat_id) where status = 'connected';
create index if not exists cs_telegram_chats_chat on public.cs_telegram_chats (chat_id) where chat_id is not null;
create index if not exists cs_telegram_chats_started on public.cs_telegram_chats (tg_user_id, created_at desc) where status = 'pending';
create index if not exists cs_telegram_chats_owner on public.cs_telegram_chats (owner_id, profile_id, created_at desc);

create table if not exists public.cs_telegram_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null check (profile_id ~ '^[a-z0-9]{1,40}$'),
  chat_row uuid not null references public.cs_telegram_chats(id) on delete cascade,
  -- the browser's key for one send: a retried schedule never makes two posts
  client_key uuid not null,
  text text not null default '' check (char_length(text) <= 4096),
  -- paths in cs-telegram-media: all pictures (an album from 2), or one video
  media text[] not null default '{}' check (cardinality(media) <= 10),
  send_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'sending', 'posted', 'failed', 'cancelled')),
  attempts smallint not null default 0,
  sending_at timestamptz,
  message_ids bigint[] not null default '{}',
  link text check (link ~ '^https://t\.me/'),
  -- the plain reason for failed or cancelled
  error text check (char_length(error) <= 300),
  sent_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, client_key, chat_row),
  -- a waiting post has something to send; a finished one may lose its files to the 7-day cleanup
  check (status <> 'scheduled' or char_length(text) > 0 or cardinality(media) > 0)
);

create index if not exists cs_telegram_posts_due on public.cs_telegram_posts (send_at) where status = 'scheduled';
create index if not exists cs_telegram_posts_chat on public.cs_telegram_posts (chat_row) where status in ('scheduled', 'sending');
create index if not exists cs_telegram_posts_owner on public.cs_telegram_posts (owner_id, created_at desc);

alter table public.cs_telegram_chats enable row level security;
alter table public.cs_telegram_posts enable row level security;

revoke all on table public.cs_telegram_chats from public, anon, authenticated;
revoke all on table public.cs_telegram_posts from public, anon, authenticated;
grant select on table public.cs_telegram_chats to authenticated;
grant select on table public.cs_telegram_posts to authenticated;
grant select, insert, update, delete on table public.cs_telegram_chats to service_role;
grant select, insert, update, delete on table public.cs_telegram_posts to service_role;

drop policy if exists cs_telegram_chats_owner_read on public.cs_telegram_chats;
create policy cs_telegram_chats_owner_read on public.cs_telegram_chats
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists cs_telegram_posts_owner_read on public.cs_telegram_posts;
create policy cs_telegram_posts_owner_read on public.cs_telegram_posts
  for select to authenticated
  using (owner_id = (select auth.uid()));

-- The send tick's claim: the earliest due post of each connected chat with nothing still sending, at most 20
-- (and p_limit), locked with skip locked so two ticks never take the same post, then marked sending once.
-- Outside 09:00 to 21:00 Singapore time it claims nothing, whatever the caller asks. p_now is for the tests.
create or replace function public.cs_telegram_claim_due(p_limit integer default 20, p_now timestamptz default now())
returns setof public.cs_telegram_posts
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if extract(hour from p_now at time zone 'Asia/Singapore') not between 9 and 20 then
    return;
  end if;
  return query
  with due as (
    select distinct on (p.chat_row) p.id
    from public.cs_telegram_posts p
    join public.cs_telegram_chats c on c.id = p.chat_row and c.status = 'connected'
    where p.status = 'scheduled' and p.send_at <= p_now
      and not exists (select 1 from public.cs_telegram_posts s where s.chat_row = p.chat_row and s.status = 'sending')
    order by p.chat_row, p.send_at, p.id
  ), picked as (
    select p.id
    from public.cs_telegram_posts p
    where p.id in (select id from due) and p.status = 'scheduled'
    order by p.send_at, p.id
    limit least(greatest(coalesce(p_limit, 0), 0), 20)
    for update of p skip locked
  )
  update public.cs_telegram_posts p
     set status = 'sending', sending_at = p_now, attempts = p.attempts + 1
    from picked
   where p.id = picked.id
  returning p.*;
end $fn$;

-- Whether the cron calls the tick: inside the hours, and a post is due, a send is stuck, or files wait for cleanup.
create or replace function public.cs_telegram_tick_due(p_now timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select extract(hour from p_now at time zone 'Asia/Singapore') between 9 and 20
    and (
      exists (
        select 1 from public.cs_telegram_posts p
        join public.cs_telegram_chats c on c.id = p.chat_row and c.status = 'connected'
        where p.status = 'scheduled' and p.send_at <= p_now
      )
      or exists (select 1 from public.cs_telegram_posts where status = 'sending' and sending_at < p_now - interval '10 minutes')
      or exists (
        select 1 from public.cs_telegram_posts
        where status in ('posted', 'failed', 'cancelled') and cardinality(media) > 0 and finished_at < p_now - interval '7 days'
      )
    );
$fn$;

revoke all on function public.cs_telegram_claim_due(integer, timestamptz) from public, anon, authenticated;
revoke all on function public.cs_telegram_tick_due(timestamptz) from public, anon, authenticated;
grant execute on function public.cs_telegram_claim_due(integer, timestamptz) to service_role;
grant execute on function public.cs_telegram_tick_due(timestamptz) to service_role;

-- 20 MB is Telegram's limit for a video sent by URL; the `telegram` function holds pictures to 5 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cs-telegram-media', 'cs-telegram-media', false, 20971520, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

select cron.unschedule(jobid) from cron.job where jobname = 'telegram-send';
select cron.schedule(
  'telegram-send',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://hgdbflprrficdoyxmdxe.supabase.co/functions/v1/telegram-hook',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-telegram-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'cs_telegram_cron_secret')
    ),
    body := '{"tick": true}'::jsonb,
    timeout_milliseconds := 10000
  )
  where public.cs_telegram_tick_due();
  $$
);

commit;
