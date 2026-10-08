-- Tests for 017_push_subscription_owner.sql. Run AFTER 016 and 017 are
-- applied, as the migration owner:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/017_push_subscription_owner.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. A failed check raises
-- "FAIL <n> ..." and aborts. A clean run ends with NOTICE
-- "push subscription owner tests: all passed".

begin;

create function public.cs_test_assert(p_ok boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'FAIL %', p_label;
  end if;
end $$;

-- Saves endpoint E with keys made from p_p and p_a, as whoever is signed in.
create function public.cs_test_save_keys(p_p text, p_a text) returns boolean
language sql as $$
  select public.cs_save_push_subscription('https://fcm.googleapis.com/fcm/send/victim-device',
    'B' || repeat(p_p, 86), repeat(p_a, 22))
$$;

grant execute on function public.cs_test_assert(boolean, text) to authenticated;
grant execute on function public.cs_test_save_keys(text, text) to authenticated;

-- A ...b1 owns the device. B ...b2 learns its endpoint URL.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000', ('7e57c0de-0000-4000-8000-0000000000' || s)::uuid,
       'authenticated', 'authenticated', 'cs-test-' || s || '@example.test', '', now(), '{}', '{}', now(), now()
from unnest(array['b1', 'b2']) s;

create temp view cs_test_device as
  select user_id, p256dh, auth from public.cs_push_subscriptions
  where endpoint = 'https://fcm.googleapis.com/fcm/send/victim-device';
grant select on cs_test_device to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b1","role":"authenticated"}';
select public.cs_test_save_keys('a', 'k');
reset role;
select public.cs_test_assert(
  (select user_id = '7e57c0de-0000-4000-8000-0000000000b1' and p256dh = 'B' || repeat('a', 86) from cs_test_device),
  '1 A owns the device with its keys');

-- B sends A's endpoint with keys of its own.
set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b2","role":"authenticated"}';
select public.cs_test_assert(public.cs_test_save_keys('z', 'q'), '2 the attempt returns true like any save, no error');
reset role;
select public.cs_test_assert(
  (select user_id = '7e57c0de-0000-4000-8000-0000000000b1'
      and p256dh = 'B' || repeat('a', 86) and auth = repeat('k', 22) from cs_test_device),
  '3 the wrong keys move nothing: owner and keys unchanged');

-- The public key alone is not enough: the auth secret must match too.
set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b2","role":"authenticated"}';
select public.cs_test_save_keys('a', 'q');
reset role;
select public.cs_test_assert(
  (select user_id = '7e57c0de-0000-4000-8000-0000000000b1' and auth = repeat('k', 22) from cs_test_device),
  '3b the right p256dh with the wrong auth secret moves nothing');

-- The same browser signed in as B presents the same keys: it moves.
set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b2","role":"authenticated"}';
select public.cs_test_save_keys('a', 'k');
reset role;
select public.cs_test_assert(
  (select user_id = '7e57c0de-0000-4000-8000-0000000000b2' from cs_test_device),
  '4 matching keys move the device to the account now signed in');

-- The owner may save new keys for its own device.
set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b2","role":"authenticated"}';
select public.cs_test_save_keys('n', 'm');
reset role;
select public.cs_test_assert(
  (select user_id = '7e57c0de-0000-4000-8000-0000000000b2' and p256dh = 'B' || repeat('n', 86) and auth = repeat('m', 22)
   from cs_test_device),
  '5 the owner can change its own keys');

-- And A, with its old keys, can no longer take it back.
set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b1","role":"authenticated"}';
select public.cs_test_save_keys('a', 'k');
reset role;
select public.cs_test_assert(
  (select user_id = '7e57c0de-0000-4000-8000-0000000000b2' from cs_test_device)
  and (select count(*) = 1 from public.cs_push_subscriptions
       where endpoint = 'https://fcm.googleapis.com/fcm/send/victim-device'),
  '6 stale keys from the previous owner move nothing either');

select public.cs_test_assert(
  (select p.prosecdef and p.proconfig @> array['search_path=pg_catalog, public, pg_temp']
     and not has_function_privilege('anon', p.oid, 'execute')
     and has_function_privilege('authenticated', p.oid, 'execute')
   from pg_proc p where p.oid = 'public.cs_save_push_subscription(text, text, text)'::regprocedure),
  '7 still SECURITY DEFINER, search_path pinned, signed-in users only');

do $$ begin raise notice 'push subscription owner tests: all passed'; end $$;
rollback;
