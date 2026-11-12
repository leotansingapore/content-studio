-- Tests for 035_subscriptions.sql. Run AFTER 035 is applied, as the migration owner, on a throwaway or local
-- database:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/035_subscriptions.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. Never run it through the Management API (it does not honour
-- the rollback). A failed check raises "FAIL <n> ..." and aborts. A clean run ends with NOTICE "subscription tests:
-- all passed".

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

insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-0000-0000-00000000b001', 'cs-test-sub-a@example.test', '{"postmosis_subscription": "sub_a"}'),
  ('00000000-0000-0000-0000-00000000b002', 'cs-test-sub-b@example.test', '{}');
insert into public.cs_subscriptions (user_id, email, status, stripe_customer_id, stripe_subscription_id) values
  ('00000000-0000-0000-0000-00000000b001', 'cs-test-sub-a@example.test', 'trialing', 'cus_a', 'sub_a'),
  ('00000000-0000-0000-0000-00000000b002', 'cs-test-sub-b@example.test', 'canceled', 'cus_b', 'sub_b');

-- 1-2: one row per account, and a status is required
select public.cs_test_expect_error(
  $$insert into public.cs_subscriptions (user_id, email, status) values ('00000000-0000-0000-0000-00000000b001', 'x@example.test', 'active')$$,
  '%cs_subscriptions_pkey%', '1 one row per account');
select public.cs_test_expect_error(
  $$insert into public.cs_subscriptions (user_id, email, status) values ('00000000-0000-0000-0000-00000000b002', 'x@example.test', '')$$,
  '%violates%', '2 an empty status is refused');

-- 3-4: the email lookup ignores case and spaces, and says which checkout made the account
select public.cs_test_assert(
  (select user_id = '00000000-0000-0000-0000-00000000b001' and made_by = 'sub_a' from public.cs_account_for_email('  CS-Test-Sub-A@Example.test ')),
  '3 an email finds its account and the subscription that made it');
select public.cs_test_assert(
  (select made_by is null from public.cs_account_for_email('cs-test-sub-b@example.test'))
  and not exists (select 1 from public.cs_account_for_email('cs-test-nobody@example.test')),
  '4 an older account was made by no subscription, and an unknown email has no row');

-- 5: an event is logged once, and a held checkout is one row per subscription with a known reason
insert into public.cs_subscription_events (id, type) values ('evt_test_abc', 'customer.subscription.updated');
select public.cs_test_expect_error(
  $$insert into public.cs_subscription_events (id, type) values ('evt_test_abc', 'customer.subscription.updated')$$,
  '%cs_subscription_events_pkey%', '5 an event is logged once');
insert into public.cs_held_checkouts (stripe_subscription_id, stripe_customer_id, email, status, reason)
  values ('sub_held', 'cus_held', 'cs-test-sub-b@example.test', 'trialing', 'account_without_subscription'),
         ('sub_held_mm', 'cus_held', 'cs-test-sub-b@example.test', 'active', 'customer_mismatch'),
         ('sub_held_2nd', 'cus_held', 'cs-test-sub-b@example.test', 'active', 'second_subscription');
select public.cs_test_expect_error(
  $$insert into public.cs_held_checkouts (stripe_subscription_id, stripe_customer_id, email, status, reason) values ('sub_held2', 'cus_x', 'x@example.test', 'active', 'because')$$,
  '%violates%', '5b a held checkout needs a known reason');

-- 6-9: a signed-in account reads its own row only, and writes nothing
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000b001", "role": "authenticated"}', true);
select public.cs_test_assert(
  (select count(*) = 1 and min(email) = 'cs-test-sub-a@example.test' from public.cs_subscriptions),
  '6 an account reads its own row and nobody else''s');
select public.cs_test_expect_error(
  $$update public.cs_subscriptions set status = 'active'$$, '%permission denied%', '7 an account cannot change its status');
select public.cs_test_expect_error(
  $$insert into public.cs_subscriptions (user_id, email, status) values ('00000000-0000-0000-0000-00000000b001', 'x', 'active')$$,
  '%permission denied%', '7b an account cannot give itself a row');
select public.cs_test_expect_error(
  $$select * from public.cs_subscription_events$$, '%permission denied%', '8 the event log is closed to accounts');
select public.cs_test_expect_error(
  $$select * from public.cs_held_checkouts$$, '%permission denied%', '8b held checkouts are closed to accounts');
select public.cs_test_expect_error(
  $$select * from public.cs_account_for_email('cs-test-sub-b@example.test')$$, '%permission denied%', '9 an account cannot look up emails');
reset role;

-- 10: nor can a visitor
set local role anon;
select public.cs_test_expect_error(
  $$select * from public.cs_subscriptions$$, '%permission denied%', '10 a visitor reads no subscriptions');
select public.cs_test_expect_error(
  $$select * from public.cs_account_for_email('cs-test-sub-a@example.test')$$, '%permission denied%', '10b a visitor cannot look up emails');
reset role;

-- 10c: a held checkout gives its email's account no subscription row
select public.cs_test_assert(
  (select count(*) = 1 from public.cs_subscriptions where email = 'cs-test-sub-b@example.test'),
  '10c holding a checkout writes nothing to cs_subscriptions');

-- 11: deleting the account takes its row
delete from auth.users where id = '00000000-0000-0000-0000-00000000b002';
select public.cs_test_assert(
  not exists (select 1 from public.cs_subscriptions where user_id = '00000000-0000-0000-0000-00000000b002'),
  '11 a deleted account leaves no row');

do $$ begin raise notice 'subscription tests: all passed'; end $$;

rollback;
