-- Phone alerts and the Monday results email. An adviser switches either on
-- in My Playbook; the choice lives in the synced key
-- content-studio-notify-<user id> (cs_user_data). Every hour pg_cron calls
-- the notify edge function, which reads those keys and the adviser's posts
-- with the service key and sends:
--   * a web push when a scheduled post is due within the hour (once per post
--     and scheduled time),
--   * a web push on Thursday evening when this week's goal still has posts
--     neither out nor scheduled (once a day at most),
--   * the Monday results email at 8:00 Singapore time (once a week).
-- Used by supabase/functions/notify and src/lib/notify.ts.
--
-- Security model
--   * anon gets nothing: no table privilege, no function EXECUTE.
--   * cs_push_subscriptions holds one row per device (browser push
--     endpoint and its two public keys). Clients never read or write the
--     table: they call cs_save_push_subscription and
--     cs_delete_push_subscription (SECURITY DEFINER, search_path pinned),
--     which act only on auth.uid()'s rows. The notify function reads and
--     retires rows with the service key.
--   * Endpoints must be https on a known push service (Google FCM, Mozilla,
--     Apple, Windows), so the function never POSTs to an address a user
--     made up. The function checks the same list again before sending.
--   * An endpoint belongs to one account: saving it again from another
--     account on the same browser moves it to that account, so a shared
--     browser only gets the alerts of whoever switched them on last. The
--     app also deletes this device's row on sign-out.
--   * At most 10 devices per account; saving an 11th drops the oldest.
--   * cs_notify_sent is the sent log, service role only: one row per user
--     and item (due:<profile>:<post>:<time>, goal:<day>, email:<monday>).
--     The function inserts the row BEFORE sending (insert ... on conflict do
--     nothing), so two overlapping runs cannot both send. Rows older than
--     90 days are pruned by the hourly job.
--   * Nobody can make the function email anyone but themselves: it reads the
--     preference only from the key named after the row's own user_id and
--     sends to that user's sign-in email.
--
-- Grants, one by one
--   tables cs_push_subscriptions, cs_notify_sent
--     revoke all from public, anon, authenticated, and no policy: only the
--       definer functions and the service role touch them.
--   functions
--     cs_save_push_subscription, cs_delete_push_subscription: revoked from
--       public and anon, granted to authenticated.
--
-- Cron: notify-hourly at minute 0 posts to the notify function with the
-- shared secret read from Vault (cs_notify_cron_secret), which matches the
-- function secret NOTIFY_CRON_SECRET. The secret is never stored in this
-- file. Deploy the function and set both secrets before applying this.
--
-- Idempotent: safe to run again. One transaction; gives up after 3 seconds
-- waiting for a lock.

begin;
set local lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.cs_push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (
    char_length(endpoint) <= 1024
    and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[A-Za-z0-9._~:/?#@!$&''()*+,;=%-]+$'
  ),
  -- The browser's P-256 public key (65 bytes) and auth secret (16 bytes), base64url.
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{86,88}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{21,24}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cs_push_subscriptions_user_idx
  on public.cs_push_subscriptions (user_id, updated_at desc);

create table if not exists public.cs_notify_sent (
  user_id uuid not null references auth.users(id) on delete cascade,
  item text not null check (char_length(item) between 1 and 200),
  sent_at timestamptz not null default now(),
  primary key (user_id, item)
);

alter table public.cs_push_subscriptions enable row level security;
alter table public.cs_notify_sent enable row level security;

revoke all on table public.cs_push_subscriptions, public.cs_notify_sent
  from public, anon, authenticated;
revoke all on sequence public.cs_push_subscriptions_id_seq
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Owner (authenticated) functions
-- ---------------------------------------------------------------------------

-- Saves this device's push subscription for the caller. Returns true.
create or replace function public.cs_save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_device_limit constant int := 10;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  -- Bound the raw input before any regex runs over it.
  if char_length(p_endpoint) > 1024 or char_length(p_p256dh) > 100 or char_length(p_auth) > 100 then
    raise exception 'This browser sent a subscription that is too long.' using errcode = '22023';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[A-Za-z0-9._~:/?#@!$&''()*+,;=%-]+$' then
    raise exception 'This browser''s push service is not supported.' using errcode = '22023';
  end if;
  if coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{86,88}$' or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{21,24}$' then
    raise exception 'This browser sent a malformed subscription.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cs_push_subs:' || v_uid::text, 0));
  insert into public.cs_push_subscriptions as s (user_id, endpoint, p256dh, auth)
  values (v_uid, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        updated_at = now();

  delete from public.cs_push_subscriptions
  where user_id = v_uid
    and id not in (
      select id from public.cs_push_subscriptions
      where user_id = v_uid
      order by updated_at desc, id desc
      limit c_device_limit
    );
  return true;
end $$;

-- Forgets one of the caller's devices. Returns whether there was one.
create or replace function public.cs_delete_push_subscription(p_endpoint text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  delete from public.cs_push_subscriptions
  where user_id = v_uid and endpoint = p_endpoint;
  get diagnostics v_count = row_count;
  return v_count > 0;
end $$;

revoke all on function public.cs_save_push_subscription(text, text, text) from public, anon;
revoke all on function public.cs_delete_push_subscription(text) from public, anon;
grant execute on function public.cs_save_push_subscription(text, text, text) to authenticated;
grant execute on function public.cs_delete_push_subscription(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Hourly job
-- ---------------------------------------------------------------------------

select cron.unschedule(jobid) from cron.job where jobname = 'notify-hourly';
select cron.schedule(
  'notify-hourly',
  '0 * * * *',
  $$
  delete from public.cs_notify_sent where sent_at < now() - interval '90 days';
  select net.http_post(
    url := 'https://hgdbflprrficdoyxmdxe.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'cs_notify_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);

commit;
