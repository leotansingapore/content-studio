-- Tests for 016_notify.sql. Run AFTER 016 is applied, as the migration owner:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/016_notify.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. A failed check raises
-- "FAIL <n> ..." and aborts. A clean run ends with NOTICE
-- "notify tests: all passed".

begin;

create function public.cs_test_assert(p_ok boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'FAIL %', p_label;
  end if;
end $$;

create function public.cs_test_expect_error(p_sql text, p_like text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not like p_like then
      raise exception 'FAIL %: expected an error like "%", got "%" (%)', p_label, p_like, sqlerrm, sqlstate;
    end if;
    return;
  end;
  raise exception 'FAIL %: expected an error like "%", but the statement succeeded', p_label, p_like;
end $$;

-- Saves an FCM subscription ending in p_tail for whoever is signed in.
create function public.cs_test_save(p_tail text) returns boolean
language sql as $$
  select public.cs_save_push_subscription(
    'https://fcm.googleapis.com/fcm/send/' || p_tail,
    'B' || repeat('a', 86),
    repeat('k', 22))
$$;

grant execute on function public.cs_test_assert(boolean, text) to anon, authenticated, service_role;
grant execute on function public.cs_test_expect_error(text, text, text) to anon, authenticated, service_role;
grant execute on function public.cs_test_save(text) to authenticated;

-- A ...d1 and B ...d2 are two advisers.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000', ('7e57c0de-0000-4000-8000-0000000000' || s)::uuid,
       'authenticated', 'authenticated', 'cs-test-' || s || '@example.test', '', now(), '{}', '{}', now(), now()
from unnest(array['d1', 'd2']) s;

-- ---------------------------------------------------------------------------
-- 0. Catalog and anon
-- ---------------------------------------------------------------------------

select public.cs_test_assert(
  not exists (
    select 1
    from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where c.oid in ('public.cs_push_subscriptions'::regclass, 'public.cs_notify_sent'::regclass,
                    'public.cs_push_subscriptions_id_seq'::regclass)
      and a.grantee in (0, 'anon'::regrole, 'authenticated'::regrole)),
  '0.1 public, anon and authenticated hold no privilege on the tables or the sequence');
select public.cs_test_assert(
  has_table_privilege('service_role', 'public.cs_push_subscriptions', 'select,insert,update,delete')
  and has_table_privilege('service_role', 'public.cs_notify_sent', 'select,insert,delete'),
  '0.2 the service role keeps its access');
select public.cs_test_assert(
  (select bool_and(relrowsecurity) from pg_class
   where oid in ('public.cs_push_subscriptions'::regclass, 'public.cs_notify_sent'::regclass))
  and not exists (select 1 from pg_policies
                  where tablename in ('cs_push_subscriptions', 'cs_notify_sent')),
  '0.3 RLS is on and there is no policy');
select public.cs_test_assert(
  not has_function_privilege('anon', 'public.cs_save_push_subscription(text, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.cs_delete_push_subscription(text)', 'execute')
  and has_function_privilege('authenticated', 'public.cs_save_push_subscription(text, text, text)', 'execute')
  and has_function_privilege('authenticated', 'public.cs_delete_push_subscription(text)', 'execute'),
  '0.4 anon executes nothing; signed-in users may call the two functions');
select public.cs_test_assert(
  (select count(*) = 2 and bool_and(p.prosecdef and p.proconfig @> array['search_path=pg_catalog, public, pg_temp'])
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('cs_save_push_subscription', 'cs_delete_push_subscription')),
  '0.5 both device functions are SECURITY DEFINER with search_path pinned to pg_catalog first');
select public.cs_test_assert(
  (select not p.prosecdef and p.proconfig @> array['search_path=pg_catalog, public, pg_temp']
   from pg_proc p where p.oid = 'public.cs_notify_claim(uuid, text[], interval)'::regprocedure)
  and not has_function_privilege('anon', 'public.cs_notify_claim(uuid, text[], interval)', 'execute')
  and not has_function_privilege('authenticated', 'public.cs_notify_claim(uuid, text[], interval)', 'execute')
  and has_function_privilege('service_role', 'public.cs_notify_claim(uuid, text[], interval)', 'execute'),
  '0.5b the claim function runs as its caller, search_path pinned, service role only');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select public.cs_test_expect_error($$select count(*) from public.cs_push_subscriptions$$,
  '%permission denied%', '0.6 anon cannot read subscriptions');
select public.cs_test_expect_error($$select count(*) from public.cs_notify_sent$$,
  '%permission denied%', '0.7 anon cannot read the sent log');
select public.cs_test_expect_error(
  $$select public.cs_save_push_subscription('https://fcm.googleapis.com/fcm/send/x', 'B' || repeat('a', 86), repeat('k', 22))$$,
  '%permission denied%', '0.8 anon cannot save a subscription');
select public.cs_test_expect_error($$select public.cs_delete_push_subscription('x')$$,
  '%permission denied%', '0.9 anon cannot delete a subscription');
reset role;

-- ---------------------------------------------------------------------------
-- 1. A saves a device
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d1","role":"authenticated"}';

select public.cs_test_assert(public.cs_test_save('dev-a1:APA91b_x-Y'), '1.1 saving returns true');
select public.cs_test_expect_error($$select count(*) from public.cs_push_subscriptions$$,
  '%permission denied%', '1.2 a signed-in user cannot read the table directly');
select public.cs_test_expect_error($$insert into public.cs_push_subscriptions (user_id, endpoint, p256dh, auth)
    values ('7e57c0de-0000-4000-8000-0000000000d2', 'https://fcm.googleapis.com/fcm/send/z', 'B' || repeat('a', 86), repeat('k', 22))$$,
  '%permission denied%', '1.3 a signed-in user cannot insert rows for anyone');
select public.cs_test_expect_error($$select count(*) from public.cs_notify_sent$$,
  '%permission denied%', '1.4 a signed-in user cannot read the sent log');
select public.cs_test_expect_error($$insert into public.cs_notify_sent (user_id, item)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'email:2026-10-05')$$,
  '%permission denied%', '1.5 a signed-in user cannot mark something sent');
reset role;

select public.cs_test_assert(
  (select count(*) = 1 and bool_and(user_id = '7e57c0de-0000-4000-8000-0000000000d1')
   from public.cs_push_subscriptions),
  '1.6 the row belongs to the caller');

-- Every real push service shape is accepted.
set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d1","role":"authenticated"}';
select public.cs_test_assert(public.cs_save_push_subscription(e, 'B' || repeat('a', 86), repeat('k', 22)),
  '1.7 accepted: ' || e)
from unnest(array[
  'https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk-x_y=',
  'https://web.push.apple.com/QGuQyavXutnMH-u0',
  'https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB%2b5x%3d'
]) e;

-- ---------------------------------------------------------------------------
-- 2. What is refused
-- ---------------------------------------------------------------------------

select public.cs_test_expect_error(
  format('select public.cs_save_push_subscription(%L, %L, %L)', e, 'B' || repeat('a', 86), repeat('k', 22)),
  '%push service is not supported%', '2.1 refused endpoint: ' || e)
from unnest(array[
  'http://fcm.googleapis.com/fcm/send/x',
  'https://evil.example.com/fcm/send/x',
  'https://fcm.googleapis.com.evil.com/x',
  'https://fcm.googleapis.com@evil.com/x',
  'https://evil.com/https://fcm.googleapis.com/x',
  'https://a.b.notify.windows.com/w/',
  'https://x.notify.windows.com.evil.com/w/',
  'https://fcm.googleapis.com/fcm/send/a b',
  E'https://fcm.googleapis.com/fcm/send/a\nb',
  'https://fcm.googleapis.com/fcm/send/a\b',
  'https://fcm.googleapis.com/',
  ''
]) e;
select public.cs_test_expect_error($$select public.cs_save_push_subscription(null, 'B' || repeat('a', 86), repeat('k', 22))$$,
  '%push service is not supported%', '2.2 a null endpoint is refused');
select public.cs_test_expect_error(
  $$select public.cs_save_push_subscription('https://fcm.googleapis.com/fcm/send/' || repeat('x', 1000), 'B' || repeat('a', 86), repeat('k', 22))$$,
  '%too long%', '2.3 an oversized endpoint is refused before any regex');
select public.cs_test_expect_error(
  $$select public.cs_save_push_subscription('https://fcm.googleapis.com/fcm/send/x', 'short', repeat('k', 22))$$,
  '%malformed%', '2.4 a short p256dh key is refused');
select public.cs_test_expect_error(
  $$select public.cs_save_push_subscription('https://fcm.googleapis.com/fcm/send/x', 'B' || repeat('a', 85) || '=', repeat('k', 22))$$,
  '%malformed%', '2.5 a p256dh key outside base64url is refused');
select public.cs_test_expect_error(
  $$select public.cs_save_push_subscription('https://fcm.googleapis.com/fcm/send/x', 'B' || repeat('a', 86), null)$$,
  '%malformed%', '2.6 a missing auth secret is refused');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select public.cs_test_expect_error($$select public.cs_test_save('nouser')$$,
  '%Sign in first%', '2.7 no user id, no save');
select public.cs_test_expect_error($$select public.cs_delete_push_subscription('x')$$,
  '%Sign in first%', '2.8 no user id, no delete');
reset role;

select public.cs_test_assert((select count(*) = 4 from public.cs_push_subscriptions),
  '2.9 nothing refused was stored');

-- The table refuses the same endpoints even from the service role.
set local role service_role;
select public.cs_test_expect_error(
  format('insert into public.cs_push_subscriptions (user_id, endpoint, p256dh, auth) values (%L, %L, %L, %L)',
    '7e57c0de-0000-4000-8000-0000000000d1', e, 'B' || repeat('a', 86), repeat('k', 22)),
  '%check constraint%', '2.10 the table refuses: ' || e)
from unnest(array[
  'https://evil.example.com/fcm/send/x',
  'https://fcm.googleapis.com@evil.com/x',
  'https://fcm.googleapis.com.evil.com/x',
  'http://fcm.googleapis.com/fcm/send/x'
]) e;
reset role;

-- ---------------------------------------------------------------------------
-- 3. One endpoint, one account
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d2","role":"authenticated"}';
select public.cs_test_save('dev-a1:APA91b_x-Y');
reset role;

select public.cs_test_assert(
  (select user_id = '7e57c0de-0000-4000-8000-0000000000d2'
   from public.cs_push_subscriptions where endpoint = 'https://fcm.googleapis.com/fcm/send/dev-a1:APA91b_x-Y')
  and (select count(*) = 1 from public.cs_push_subscriptions
       where endpoint = 'https://fcm.googleapis.com/fcm/send/dev-a1:APA91b_x-Y'),
  '3.1 the same browser signed in as B moves the device to B');

-- ---------------------------------------------------------------------------
-- 4. Deleting
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d1","role":"authenticated"}';
select public.cs_test_assert(
  public.cs_delete_push_subscription('https://fcm.googleapis.com/fcm/send/dev-a1:APA91b_x-Y') = false,
  '4.1 A cannot delete the device that is now B''s');
select public.cs_test_assert(
  public.cs_delete_push_subscription('https://web.push.apple.com/QGuQyavXutnMH-u0'),
  '4.2 A deletes its own device');
select public.cs_test_assert(
  public.cs_delete_push_subscription('https://web.push.apple.com/QGuQyavXutnMH-u0') = false,
  '4.3 deleting twice says there was nothing');
reset role;

select public.cs_test_assert(
  exists (select 1 from public.cs_push_subscriptions
          where endpoint = 'https://fcm.googleapis.com/fcm/send/dev-a1:APA91b_x-Y'
            and user_id = '7e57c0de-0000-4000-8000-0000000000d2')
  and not exists (select 1 from public.cs_push_subscriptions
                  where endpoint = 'https://web.push.apple.com/QGuQyavXutnMH-u0'),
  '4.4 B''s device stays, A''s is gone');

-- ---------------------------------------------------------------------------
-- 5. At most 10 devices per account
-- ---------------------------------------------------------------------------

-- A has 2 devices left (Mozilla, Windows). Age them so they are the oldest.
update public.cs_push_subscriptions set updated_at = now() - interval '30 days'
where user_id = '7e57c0de-0000-4000-8000-0000000000d1'
  and endpoint like 'https://updates.push.services.mozilla.com/%';
update public.cs_push_subscriptions set updated_at = now() - interval '20 days'
where user_id = '7e57c0de-0000-4000-8000-0000000000d1'
  and endpoint like 'https://wns2-%';

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d1","role":"authenticated"}';
select public.cs_test_save('cap-' || g) from generate_series(1, 8) g;
reset role;
select public.cs_test_assert(
  (select count(*) = 10 from public.cs_push_subscriptions where user_id = '7e57c0de-0000-4000-8000-0000000000d1'),
  '5.1 ten devices fit');

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d1","role":"authenticated"}';
select public.cs_test_save('cap-9');
reset role;
select public.cs_test_assert(
  (select count(*) = 10 from public.cs_push_subscriptions where user_id = '7e57c0de-0000-4000-8000-0000000000d1')
  and not exists (select 1 from public.cs_push_subscriptions
                  where endpoint like 'https://updates.push.services.mozilla.com/%')
  and exists (select 1 from public.cs_push_subscriptions where endpoint like 'https://wns2-%'),
  '5.2 the 11th drops only the oldest device');

-- Saving a device again refreshes it rather than adding one.
update public.cs_push_subscriptions set updated_at = now() - interval '40 days'
where endpoint = 'https://fcm.googleapis.com/fcm/send/cap-1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d1","role":"authenticated"}';
select public.cs_test_save('cap-1');
reset role;
select public.cs_test_assert(
  (select count(*) = 10 from public.cs_push_subscriptions where user_id = '7e57c0de-0000-4000-8000-0000000000d1')
  and (select updated_at > now() - interval '1 minute' from public.cs_push_subscriptions
       where endpoint = 'https://fcm.googleapis.com/fcm/send/cap-1'),
  '5.3 saving a known device again refreshes it, nothing dropped');

select public.cs_test_assert(
  (select count(*) = 1 from public.cs_push_subscriptions where user_id = '7e57c0de-0000-4000-8000-0000000000d2'),
  '5.4 B''s devices are untouched by A''s cap');

-- ---------------------------------------------------------------------------
-- 6. The sent log claims once
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d1","role":"authenticated"}';
select public.cs_test_expect_error(
  $$select public.cs_notify_claim('7e57c0de-0000-4000-8000-0000000000d1', array['email:2026-10-05'])$$,
  '%permission denied%', '6.0 a signed-in user cannot claim');
reset role;

set local role service_role;
select public.cs_test_assert(
  (select array_agg(c order by c) = array['due:me:p1:2026-10-08T19:30', 'email:2026-10-05']
   from public.cs_notify_claim('7e57c0de-0000-4000-8000-0000000000d1',
     array['email:2026-10-05', 'due:me:p1:2026-10-08T19:30', 'email:2026-10-05']) c),
  '6.1 new items are claimed once each, a repeated item in one call included');
select public.cs_test_assert(
  (select count(*) = 0 from public.cs_notify_claim('7e57c0de-0000-4000-8000-0000000000d1',
     array['email:2026-10-05', 'due:me:p1:2026-10-08T19:30'])),
  '6.2 a second claim returns nothing');
select public.cs_test_assert(
  (select array_agg(c) = array['email:2026-10-05']
   from public.cs_notify_claim('7e57c0de-0000-4000-8000-0000000000d2', array['email:2026-10-05']) c),
  '6.3 another user''s item is separate');
select public.cs_test_assert(
  (select bool_and(sent_at is null) from public.cs_notify_sent),
  '6.4 a fresh claim is not marked sent');
reset role;

-- A run was killed between claim and send 31 minutes ago.
update public.cs_notify_sent set claimed_at = now() - interval '31 minutes'
where user_id = '7e57c0de-0000-4000-8000-0000000000d1';
set local role service_role;
select public.cs_test_assert(
  (select count(*) = 0 from public.cs_notify_claim('7e57c0de-0000-4000-8000-0000000000d1',
     array['due:me:p1:2026-10-08T19:30'])),
  '6.5 a phone-alert claim is final, however old');
select public.cs_test_assert(
  (select array_agg(c) = array['email:2026-10-05']
   from public.cs_notify_claim('7e57c0de-0000-4000-8000-0000000000d1', array['email:2026-10-05'], interval '30 minutes') c),
  '6.6 an unsent email claim older than 30 minutes is taken again');
select public.cs_test_assert(
  (select count(*) = 0 from public.cs_notify_claim('7e57c0de-0000-4000-8000-0000000000d1',
     array['email:2026-10-05'], interval '30 minutes')),
  '6.7 and only once: the retake refreshed claimed_at');
reset role;

update public.cs_notify_sent set claimed_at = now() - interval '29 minutes'
where user_id = '7e57c0de-0000-4000-8000-0000000000d2';
set local role service_role;
select public.cs_test_assert(
  (select count(*) = 0 from public.cs_notify_claim('7e57c0de-0000-4000-8000-0000000000d2',
     array['email:2026-10-05'], interval '30 minutes')),
  '6.8 a claim 29 minutes old is still the other run''s');
update public.cs_notify_sent set sent_at = now(), claimed_at = now() - interval '2 days'
where user_id = '7e57c0de-0000-4000-8000-0000000000d2' and item = 'email:2026-10-05';
select public.cs_test_assert(
  (select count(*) = 0 from public.cs_notify_claim('7e57c0de-0000-4000-8000-0000000000d2',
     array['email:2026-10-05'], interval '30 minutes')),
  '6.9 a sent email is never taken again');
select public.cs_test_expect_error(
  format('select public.cs_notify_claim(%L, array[%L])', '7e57c0de-0000-4000-8000-0000000000d1', repeat('x', 201)),
  '%check constraint%', '6.10 an item over 200 characters is refused');
reset role;

-- ---------------------------------------------------------------------------
-- 7. The jobs
-- ---------------------------------------------------------------------------

select public.cs_test_assert(
  (select count(*) = 1 from cron.job where jobname = 'notify-hourly' and schedule = '0 * * * *'
     and command like '%/functions/v1/notify''%'
     and command like '%x-notify-secret%'
     and command like '%name = ''cs_notify_cron_secret''%'
     and command not like '%delete%'),
  '7.1 one hourly job posts with the Vault secret and does nothing else');
select public.cs_test_assert(
  (select count(*) = 1 from cron.job where jobname = 'notify-sent-prune' and schedule = '41 3 * * *'
     and command not like '%net.http_post%' and command not like '%vault%'),
  '7.2 the prune is its own daily job, independent of the post and the secret');

-- Run the prune job's own command: only rows claimed more than 90 days ago go.
update public.cs_notify_sent set claimed_at = now() - interval '91 days' where item = 'due:me:p1:2026-10-08T19:30';
update public.cs_notify_sent set claimed_at = now() - interval '89 days'
where user_id = '7e57c0de-0000-4000-8000-0000000000d2';
do $$ begin execute (select command from cron.job where jobname = 'notify-sent-prune'); end $$;
select public.cs_test_assert(
  (select count(*) = 2 from public.cs_notify_sent)
  and not exists (select 1 from public.cs_notify_sent where item like 'due:%'),
  '7.3 the prune drops only rows claimed more than 90 days ago');

-- ---------------------------------------------------------------------------
-- 8. Deleting an account takes its rows with it
-- ---------------------------------------------------------------------------

delete from auth.users where id = '7e57c0de-0000-4000-8000-0000000000d1';
select public.cs_test_assert(
  not exists (select 1 from public.cs_push_subscriptions where user_id = '7e57c0de-0000-4000-8000-0000000000d1')
  and not exists (select 1 from public.cs_notify_sent where user_id = '7e57c0de-0000-4000-8000-0000000000d1')
  and exists (select 1 from public.cs_push_subscriptions where user_id = '7e57c0de-0000-4000-8000-0000000000d2'),
  '8.1 an account''s devices and sent log go with it, others stay');

do $$ begin raise notice 'notify tests: all passed'; end $$;
rollback;
