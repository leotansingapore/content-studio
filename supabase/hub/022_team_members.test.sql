-- Tests for 022_team_members.sql. Run AFTER 022 is applied, as the migration owner:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/022_team_members.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. A failed check raises
-- "FAIL <n> ..." and aborts. A clean run ends with NOTICE
-- "team members tests: all passed".

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

-- O ...e1 owns the board. M ...e2 and N ...e3 are advisers.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000', ('7e57c0de-0000-4000-8000-0000000000' || s)::uuid,
       'authenticated', 'authenticated', 'cs-test-' || s || '@example.test', '', now(), '{}', '{}', now(), now()
from unnest(array['e1', 'e2', 'e3']) s;

-- ---------------------------------------------------------------------------
-- 0. Catalog: nobody but the service role reaches the table
-- ---------------------------------------------------------------------------

select public.cs_test_assert(
  not has_table_privilege('anon', 'public.cs_team_members', 'select,insert,update,delete,truncate,references,trigger')
  and not has_table_privilege('authenticated', 'public.cs_team_members', 'select,insert,update,delete,truncate,references,trigger')
  and has_table_privilege('service_role', 'public.cs_team_members', 'select,insert,update,delete'),
  '0.1 anon and authenticated hold nothing; service_role reads and writes');
select public.cs_test_assert(
  (select relrowsecurity from pg_class where oid = 'public.cs_team_members'::regclass)
  and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cs_team_members'),
  '0.2 RLS on with no policies');
select public.cs_test_assert(
  (select count(*) = 2 from pg_indexes where schemaname = 'public' and tablename = 'cs_team_members'
     and indexname in ('cs_team_members_invite_hash', 'cs_team_members_live_member')
     and indexdef like 'CREATE UNIQUE INDEX%' and indexdef like '%WHERE%'),
  '0.3 both partial unique indexes exist');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select public.cs_test_expect_error($$select count(*) from public.cs_team_members$$, '%permission denied%', '0.4 anon cannot read');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000e2","role":"authenticated"}';
select public.cs_test_expect_error($$select count(*) from public.cs_team_members$$, '%permission denied%', '0.5 a signed-in adviser cannot read');
select public.cs_test_expect_error(
  $$insert into public.cs_team_members (owner_id, label, role, invite_hash, invite_expires_at)
    values ('7e57c0de-0000-4000-8000-0000000000e2', 'me', 'approver', repeat('a', 64), now() + interval '7 days')$$,
  '%permission denied%', '0.6 a signed-in adviser cannot add themselves');
reset role;

-- ---------------------------------------------------------------------------
-- 1. Invites, as the edge function writes them
-- ---------------------------------------------------------------------------

set local role service_role;
insert into public.cs_team_members (owner_id, label, role, brands, invite_hash, invite_expires_at) values
  ('7e57c0de-0000-4000-8000-0000000000e1', 'Mei', 'commenter', '{activitytracker}', repeat('a', 64), now() + interval '7 days'),
  ('7e57c0de-0000-4000-8000-0000000000e1', 'Jo',  'approver',  '{activitytracker}', repeat('b', 64), now() + interval '7 days');
select public.cs_test_assert((select count(*) from public.cs_team_members) = 2, '1.1 service_role writes invites');

select public.cs_test_expect_error(
  $$insert into public.cs_team_members (owner_id, label, role, invite_hash, invite_expires_at)
    values ('7e57c0de-0000-4000-8000-0000000000e1', 'X', 'owner', repeat('c', 64), now())$$,
  '%cs_team_members_role_check%', '1.2 owner is not a role a member can hold');
select public.cs_test_expect_error(
  $$insert into public.cs_team_members (owner_id, label, role, invite_hash, invite_expires_at)
    values ('7e57c0de-0000-4000-8000-0000000000e1', '  ', 'viewer', repeat('c', 64), now())$$,
  '%cs_team_members_label_check%', '1.3 a blank name is refused');
select public.cs_test_expect_error(
  $$insert into public.cs_team_members (owner_id, label, role, invite_hash, invite_expires_at)
    values ('7e57c0de-0000-4000-8000-0000000000e1', 'X', 'viewer', 'not-a-hash', now())$$,
  '%cs_team_members_invite_hash_check%', '1.4 an invite hash must be 64 hex characters');
select public.cs_test_expect_error(
  $$insert into public.cs_team_members (owner_id, label, role, invite_hash, invite_expires_at)
    values ('7e57c0de-0000-4000-8000-0000000000e1', 'X', 'viewer', repeat('a', 64), now())$$,
  '%cs_team_members_invite_hash%', '1.5 two invites cannot share a hash');
select public.cs_test_expect_error(
  $$insert into public.cs_team_members (owner_id, label, role) values ('7e57c0de-0000-4000-8000-0000000000e1', 'X', 'viewer')$$,
  '%check%', '1.6 an open invite needs a hash and an expiry');
select public.cs_test_expect_error(
  $$insert into public.cs_team_members (owner_id, label, role, modules, invite_hash, invite_expires_at)
    values ('7e57c0de-0000-4000-8000-0000000000e1', 'X', 'viewer', '{reels,billing}', repeat('d', 64), now())$$,
  '%cs_team_members_modules_check%', '1.7 only known modules');

-- ---------------------------------------------------------------------------
-- 2. Claiming: one conditional update, once
-- ---------------------------------------------------------------------------

update public.cs_team_members set member_id = '7e57c0de-0000-4000-8000-0000000000e2', claimed_at = now(), invite_hash = null
where invite_hash = repeat('a', 64) and claimed_at is null and revoked_at is null and invite_expires_at > now();
select public.cs_test_assert(
  (select count(*) = 1 from public.cs_team_members where member_id = '7e57c0de-0000-4000-8000-0000000000e2' and invite_hash is null),
  '2.1 the claim sets the person and clears the hash');

with again as (
  update public.cs_team_members set member_id = '7e57c0de-0000-4000-8000-0000000000e3', claimed_at = now(), invite_hash = null
  where invite_hash = repeat('a', 64) and claimed_at is null and revoked_at is null and invite_expires_at > now()
  returning 1)
select public.cs_test_assert((select count(*) from again) = 0, '2.2 the same link cannot be claimed twice');

select public.cs_test_expect_error(
  $$update public.cs_team_members set member_id = '7e57c0de-0000-4000-8000-0000000000e2', claimed_at = now(), invite_hash = null
    where invite_hash = repeat('b', 64)$$,
  '%cs_team_members_live_member%', '2.3 one person holds one live membership');
select public.cs_test_expect_error(
  $$update public.cs_team_members set member_id = '7e57c0de-0000-4000-8000-0000000000e1', claimed_at = now(), invite_hash = null
    where invite_hash = repeat('b', 64)$$,
  '%check%', '2.4 the owner cannot join their own team');
select public.cs_test_expect_error(
  $$update public.cs_team_members set claimed_at = now(), invite_hash = null where invite_hash = repeat('b', 64)$$,
  '%check%', '2.5 a claimed row needs its person');

-- revoked, then invited again
update public.cs_team_members set revoked_at = now() where member_id = '7e57c0de-0000-4000-8000-0000000000e2';
update public.cs_team_members set member_id = '7e57c0de-0000-4000-8000-0000000000e2', claimed_at = now(), invite_hash = null
where invite_hash = repeat('b', 64);
select public.cs_test_assert(
  (select count(*) = 2 from public.cs_team_members where member_id = '7e57c0de-0000-4000-8000-0000000000e2')
  and (select count(*) = 1 from public.cs_team_members where member_id = '7e57c0de-0000-4000-8000-0000000000e2' and revoked_at is null),
  '2.6 a revoked person can join again; one live row');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Deleting an account deletes its rows
-- ---------------------------------------------------------------------------

delete from auth.users where id = '7e57c0de-0000-4000-8000-0000000000e2';
select public.cs_test_assert(
  (select count(*) from public.cs_team_members where member_id = '7e57c0de-0000-4000-8000-0000000000e2') = 0,
  '3.1 deleting a member deletes their rows');
delete from auth.users where id = '7e57c0de-0000-4000-8000-0000000000e1';
select public.cs_test_assert((select count(*) from public.cs_team_members) = 0, '3.2 deleting the owner deletes the team');

-- ---------------------------------------------------------------------------

do $$ begin raise notice 'team members tests: all passed'; end $$;
drop function public.cs_test_expect_error(text, text, text);
drop function public.cs_test_assert(boolean, text);

rollback;
