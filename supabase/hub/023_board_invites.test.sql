-- Tests for 022_board_members.sql and 023_board_invites.sql together (023 reshaped 022's table, so 022's own
-- test no longer applies). Run AFTER 023 is applied, as the migration owner:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/023_board_invites.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. A failed check raises "FAIL <n> ..." and aborts.
-- A clean run ends with NOTICE "board invites tests: all passed".

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

grant execute on function public.cs_test_assert(boolean, text) to anon, authenticated, service_role;
grant execute on function public.cs_test_expect_error(text, text, text) to anon, authenticated, service_role;

-- O ...e1 owns the board. M ...e2, N ...e3 and P ...e4 are advisers.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000', ('7e57c0de-0000-4000-8000-0000000000' || s)::uuid,
       'authenticated', 'authenticated', 'cs-test-' || s || '@example.test', '', now(), '{}', '{}', now(), now()
from unnest(array['e1', 'e2', 'e3', 'e4']) s;

-- ---------------------------------------------------------------------------
-- 0. Catalog: nobody but the service role reaches either table or the claim
-- ---------------------------------------------------------------------------

select public.cs_test_assert(
  not has_table_privilege('anon', 'public.cs_board_invites', 'select,insert,update,delete,truncate,references,trigger')
  and not has_table_privilege('authenticated', 'public.cs_board_invites', 'select,insert,update,delete,truncate,references,trigger')
  and not has_table_privilege('anon', 'public.cs_board_members', 'select,insert,update,delete,truncate,references,trigger')
  and not has_table_privilege('authenticated', 'public.cs_board_members', 'select,insert,update,delete,truncate,references,trigger'),
  '0.1 anon and authenticated hold nothing on either table');
select public.cs_test_assert(
  has_table_privilege('service_role', 'public.cs_board_invites', 'select') and has_table_privilege('service_role', 'public.cs_board_invites', 'insert')
  and has_table_privilege('service_role', 'public.cs_board_invites', 'update') and has_table_privilege('service_role', 'public.cs_board_members', 'update'),
  '0.2 service_role reads and writes');
select public.cs_test_assert(
  (select relrowsecurity from pg_class where oid = 'public.cs_board_invites'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.cs_board_members'::regclass)
  and not exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('cs_board_invites', 'cs_board_members')),
  '0.3 RLS on with no policies on both');
select public.cs_test_assert(
  not has_function_privilege('anon', 'public.cs_board_claim(text, uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.cs_board_claim(text, uuid, text)', 'execute')
  and has_function_privilege('service_role', 'public.cs_board_claim(text, uuid, text)', 'execute'),
  '0.4 only service_role may call the claim');
select public.cs_test_assert(
  not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cs_board_members'
              and column_name in ('invite_hash', 'invite_expires_at')),
  '0.5 members no longer carry invite columns');

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000e2","role":"authenticated"}';
select public.cs_test_expect_error($$select count(*) from public.cs_board_invites$$, '%permission denied%', '0.6 an adviser cannot read invites');
select public.cs_test_expect_error($$select public.cs_board_claim(repeat('a', 64), '7e57c0de-0000-4000-8000-0000000000e2', 'me')$$,
  '%permission denied%', '0.7 an adviser cannot call the claim directly');
reset role;

-- ---------------------------------------------------------------------------
-- 1. Links
-- ---------------------------------------------------------------------------

set local role service_role;
insert into public.cs_board_invites (owner_id, role, brands, token_hash, expires_at, max_uses) values
  ('7e57c0de-0000-4000-8000-0000000000e1', 'commenter', '{activitytracker}', repeat('a', 64), now() + interval '7 days', null),
  ('7e57c0de-0000-4000-8000-0000000000e1', 'approver',  '{activitytracker}', repeat('b', 64), now() + interval '7 days', 1),
  ('7e57c0de-0000-4000-8000-0000000000e1', 'viewer',    '{leo}',             repeat('c', 64), now() - interval '1 minute', null),
  ('7e57c0de-0000-4000-8000-0000000000e1', 'viewer',    '{leo}',             repeat('d', 64), now() + interval '7 days', null);
update public.cs_board_invites set revoked_at = now() where token_hash = repeat('d', 64);

select public.cs_test_expect_error(
  $$insert into public.cs_board_invites (owner_id, role, brands, token_hash, expires_at) values ('7e57c0de-0000-4000-8000-0000000000e1', 'owner', '{leo}', repeat('e', 64), now())$$,
  '%cs_board_invites_role_check%', '1.1 owner is not a role a link can give');
select public.cs_test_expect_error(
  $$insert into public.cs_board_invites (owner_id, role, brands, token_hash, expires_at) values ('7e57c0de-0000-4000-8000-0000000000e1', 'viewer', '{}', repeat('e', 64), now())$$,
  '%cs_board_invites_brands_check%', '1.2 a link needs at least one brand');
select public.cs_test_expect_error(
  $$insert into public.cs_board_invites (owner_id, role, brands, token_hash, expires_at) values ('7e57c0de-0000-4000-8000-0000000000e1', 'viewer', '{leo}', repeat('a', 64), now())$$,
  '%cs_board_invites_token_hash_key%', '1.3 two links cannot share a token');
select public.cs_test_expect_error(
  $$insert into public.cs_board_invites (owner_id, role, brands, token_hash, expires_at) values ('7e57c0de-0000-4000-8000-0000000000e1', 'viewer', '{leo}', 'nope', now())$$,
  '%cs_board_invites_token_hash_check%', '1.4 a token hash is 64 hex characters');

-- ---------------------------------------------------------------------------
-- 2. Claiming through cs_board_claim
-- ---------------------------------------------------------------------------

select public.cs_board_claim(repeat('a', 64), '7e57c0de-0000-4000-8000-0000000000e2', '  Mei  ');
select public.cs_board_claim(repeat('a', 64), '7e57c0de-0000-4000-8000-0000000000e3', 'Jo');
select public.cs_test_assert(
  (select count(*) = 2 from public.cs_board_members where role = 'commenter' and brands = '{activitytracker}' and invite_id is not null)
  and (select label from public.cs_board_members where member_id = '7e57c0de-0000-4000-8000-0000000000e2') = 'Mei'
  and (select uses from public.cs_board_invites where token_hash = repeat('a', 64)) = 2,
  '2.1 a shared link lets several people in with its role and brands, and counts them');

select public.cs_board_claim(repeat('b', 64), '7e57c0de-0000-4000-8000-0000000000e4', 'Ann');
select public.cs_test_expect_error($$select public.cs_board_claim(repeat('b', 64), '7e57c0de-0000-4000-8000-0000000000e1', 'x')$$,
  '%invite_gone%', '2.2 a one-use link is used up after one person');
select public.cs_test_expect_error($$select public.cs_board_claim(repeat('c', 64), '7e57c0de-0000-4000-8000-0000000000e4', 'x')$$,
  '%invite_gone%', '2.3 an expired link lets nobody in');
select public.cs_test_expect_error($$select public.cs_board_claim(repeat('d', 64), '7e57c0de-0000-4000-8000-0000000000e4', 'x')$$,
  '%invite_gone%', '2.4 a link Leo turned off lets nobody in');
select public.cs_test_expect_error($$select public.cs_board_claim(repeat('f', 64), '7e57c0de-0000-4000-8000-0000000000e4', 'x')$$,
  '%invite_gone%', '2.5 an unknown token lets nobody in');
select public.cs_test_expect_error($$select public.cs_board_claim(repeat('a', 64), '7e57c0de-0000-4000-8000-0000000000e1', 'x')$$,
  '%owner_self%', '2.6 the owner cannot join their own board');
select public.cs_test_expect_error($$select public.cs_board_claim(repeat('a', 64), '7e57c0de-0000-4000-8000-0000000000e2', 'x')$$,
  '%cs_board_members_live_member%', '2.7 one live membership per person');
select public.cs_test_assert((select uses from public.cs_board_invites where token_hash = repeat('a', 64)) = 2,
  '2.8 a refused claim counts no use');
select public.cs_test_expect_error($$select public.cs_board_claim(repeat('a', 64), '7e57c0de-0000-4000-8000-0000000000e4', '   ')$$,
  '%cs_board_members_label_check%', '2.9 a blank name is refused');

-- removed, then back in through a link
update public.cs_board_members set revoked_at = now() where member_id = '7e57c0de-0000-4000-8000-0000000000e2';
select public.cs_board_claim(repeat('a', 64), '7e57c0de-0000-4000-8000-0000000000e2', 'Mei');
select public.cs_test_assert(
  (select count(*) = 1 from public.cs_board_members where member_id = '7e57c0de-0000-4000-8000-0000000000e2' and revoked_at is null),
  '2.10 a removed person can join again; one live row');
select public.cs_test_expect_error(
  $$update public.cs_board_members set member_id = null where member_id = '7e57c0de-0000-4000-8000-0000000000e3'$$,
  '%null value%', '2.11 a member row always has its person');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Deleting accounts
-- ---------------------------------------------------------------------------

delete from auth.users where id = '7e57c0de-0000-4000-8000-0000000000e3';
select public.cs_test_assert(
  (select count(*) from public.cs_board_members where member_id = '7e57c0de-0000-4000-8000-0000000000e3') = 0,
  '3.1 deleting a member deletes their rows');
delete from auth.users where id = '7e57c0de-0000-4000-8000-0000000000e1';
select public.cs_test_assert(
  (select count(*) from public.cs_board_members) = 0 and (select count(*) from public.cs_board_invites) = 0,
  '3.2 deleting the owner deletes the team and the links');

-- ---------------------------------------------------------------------------

do $$ begin raise notice 'board invites tests: all passed'; end $$;
drop function public.cs_test_expect_error(text, text, text);
drop function public.cs_test_assert(boolean, text);

rollback;
