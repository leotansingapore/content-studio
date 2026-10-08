-- Phone alerts: an endpoint moves to another account only with its keys.
-- Follow-up to 016_notify.sql from the push security review: 016's
-- cs_save_push_subscription moved a device to whoever saved its endpoint
-- next, so a signed-in user who learned someone else's endpoint URL could take
-- the row over with keys of their own. The owner then silently stopped getting
-- alerts and could not delete the row (their delete is scoped to auth.uid()).
--
-- Now a save changes an existing row only when
--   * the caller already owns it (a browser's keys may change), or
--   * the stored p256dh and auth match the ones sent: a real browser re-used
--     by another account presents the same keys for the same endpoint, so the
--     legitimate move still works.
-- Otherwise nothing changes and the call still returns true, so a guess
-- learns nothing. No table change; grants as in 016.
--
-- Idempotent: safe to run again. One short transaction; gives up after 3
-- seconds waiting for a lock.

begin;
set local lock_timeout = '3s';

create or replace function public.cs_save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
) returns boolean
language plpgsql security definer set search_path = pg_catalog, public, pg_temp as $$
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
        updated_at = now()
    where s.user_id = excluded.user_id
       or (s.p256dh = excluded.p256dh and s.auth = excluded.auth);

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

revoke all on function public.cs_save_push_subscription(text, text, text) from public, anon;
grant execute on function public.cs_save_push_subscription(text, text, text) to authenticated;

commit;
