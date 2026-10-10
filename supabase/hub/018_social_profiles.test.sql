-- Tests for 018_social_profiles.sql. Run AFTER 018 is applied, as the
-- migration owner:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/018_social_profiles.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. A failed check raises
-- "FAIL <n> ..." and aborts. A clean run ends with NOTICE
-- "social profiles tests: all passed".

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

-- A ...d1 connects two brand profiles. B ...d2 is another adviser.
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
  not has_table_privilege('anon', 'public.cs_social_profiles', 'select,insert,update,delete,truncate,references,trigger')
  and not has_table_privilege('authenticated', 'public.cs_social_profiles', 'insert,update,delete,truncate,references,trigger')
  and has_table_privilege('authenticated', 'public.cs_social_profiles', 'select')
  and has_table_privilege('service_role', 'public.cs_social_profiles', 'select,insert,update,delete'),
  '0.1 anon holds nothing; authenticated may only select; service_role writes');
select public.cs_test_assert(
  (select relrowsecurity from pg_class where oid = 'public.cs_social_profiles'::regclass)
  and (select count(*) = 1 and bool_and(cmd = 'SELECT' and roles = array['authenticated']::name[])
       from pg_policies where schemaname = 'public' and tablename = 'cs_social_profiles'),
  '0.2 RLS on, and the only policy is SELECT for authenticated');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select public.cs_test_expect_error($$select count(*) from public.cs_social_profiles$$,
  '%permission denied%', '0.3 anon cannot read');
select public.cs_test_expect_error(
  $$insert into public.cs_social_profiles (owner_id, profile_id, zernio_profile_id)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'me', 'aaaaaaaaaaaaaaaaaaaaaaaa')$$,
  '%permission denied%', '0.4 anon cannot insert');
reset role;

-- ---------------------------------------------------------------------------
-- 1. The edge function (service_role) writes the mapping
-- ---------------------------------------------------------------------------

set local role service_role;
insert into public.cs_social_profiles (owner_id, profile_id, zernio_profile_id) values
  ('7e57c0de-0000-4000-8000-0000000000d1', 'me',             '0123456789abcdef01234561'),
  ('7e57c0de-0000-4000-8000-0000000000d1', 'pmg1x2y3zab12',  '0123456789abcdef01234562'),
  ('7e57c0de-0000-4000-8000-0000000000d2', 'me',             '0123456789abcdef01234563');
select public.cs_test_assert((select count(*) from public.cs_social_profiles) = 3,
  '1.1 service_role inserts and reads every row');

select public.cs_test_expect_error(
  $$insert into public.cs_social_profiles (owner_id, profile_id, zernio_profile_id)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'ME!', 'bbbbbbbbbbbbbbbbbbbbbbbb')$$,
  '%cs_social_profiles_profile_id_check%', '1.2 a malformed profile id is refused');
select public.cs_test_expect_error(
  $$insert into public.cs_social_profiles (owner_id, profile_id, zernio_profile_id)
    values ('7e57c0de-0000-4000-8000-0000000000d1', '', 'bbbbbbbbbbbbbbbbbbbbbbbb')$$,
  '%cs_social_profiles_profile_id_check%', '1.3 an empty profile id is refused');
select public.cs_test_expect_error(
  format('insert into public.cs_social_profiles (owner_id, profile_id, zernio_profile_id) values (%L, %L, %L)',
    '7e57c0de-0000-4000-8000-0000000000d1', repeat('p', 41), 'bbbbbbbbbbbbbbbbbbbbbbbb'),
  '%cs_social_profiles_profile_id_check%', '1.4 a 41-character profile id is refused');
select public.cs_test_expect_error(
  $$insert into public.cs_social_profiles (owner_id, profile_id, zernio_profile_id)
    values ('7e57c0de-0000-4000-8000-0000000000d1', E'p1\n', 'bbbbbbbbbbbbbbbbbbbbbbbb')$$,
  '%cs_social_profiles_profile_id_check%', '1.5 a trailing newline in the profile id is refused');

select public.cs_test_expect_error(
  $$insert into public.cs_social_profiles (owner_id, profile_id, zernio_profile_id)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'p2', 'BBBBBBBBBBBBBBBBBBBBBBBB')$$,
  '%cs_social_profiles_zernio_profile_id_check%', '1.6 an uppercase Zernio id is refused');
select public.cs_test_expect_error(
  $$insert into public.cs_social_profiles (owner_id, profile_id, zernio_profile_id)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'p2', 'bbbbbbbbbbbbbbbbbbbbbbb')$$,
  '%cs_social_profiles_zernio_profile_id_check%', '1.7 a 23-character Zernio id is refused');
select public.cs_test_expect_error(
  $$insert into public.cs_social_profiles (owner_id, profile_id, zernio_profile_id)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'p2', 'bbbbbbbbbbbbbbbbbbbbbbbbb')$$,
  '%cs_social_profiles_zernio_profile_id_check%', '1.8 a 25-character Zernio id is refused');
select public.cs_test_expect_error(
  $$insert into public.cs_social_profiles (owner_id, profile_id, zernio_profile_id)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'p2', '../accounts/0123456789ab')$$,
  '%cs_social_profiles_zernio_profile_id_check%', '1.9 a path-shaped Zernio id is refused');
select public.cs_test_expect_error(
  $$insert into public.cs_social_profiles (owner_id, profile_id, zernio_profile_id)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'p2', '')$$,
  '%cs_social_profiles_zernio_profile_id_check%', '1.10 an empty Zernio id is refused');

select public.cs_test_expect_error(
  $$insert into public.cs_social_profiles (owner_id, profile_id, zernio_profile_id)
    values ('7e57c0de-0000-4000-8000-0000000000d2', 'p2', '0123456789abcdef01234561')$$,
  '%cs_social_profiles_zernio_profile_id_key%', '1.11 one Zernio profile cannot map to two owners');
select public.cs_test_expect_error(
  $$insert into public.cs_social_profiles (owner_id, profile_id, zernio_profile_id)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'me', 'cccccccccccccccccccccccc')$$,
  '%cs_social_profiles_pkey%', '1.12 one brand profile maps to one Zernio profile');
select public.cs_test_expect_error(
  $$insert into public.cs_social_profiles (owner_id, profile_id, zernio_profile_id)
    values ('7e57c0de-0000-4000-8000-0000000000ff', 'me', 'dddddddddddddddddddddddd')$$,
  '%cs_social_profiles_owner_id_fkey%', '1.13 a row for an unknown user is refused');

-- The first-connect race: the loser's insert does nothing and reads the winner's id.
with ins as (
  insert into public.cs_social_profiles (owner_id, profile_id, zernio_profile_id)
  values ('7e57c0de-0000-4000-8000-0000000000d1', 'me', 'eeeeeeeeeeeeeeeeeeeeeeee')
  on conflict (owner_id, profile_id) do nothing
  returning 1)
select public.cs_test_assert((select count(*) from ins) = 0
  and (select zernio_profile_id = '0123456789abcdef01234561' from public.cs_social_profiles
       where owner_id = '7e57c0de-0000-4000-8000-0000000000d1' and profile_id = 'me'),
  '1.14 on conflict do nothing keeps the first Zernio id');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Owners read their own rows and write nothing
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d1","role":"authenticated"}';
select public.cs_test_assert(
  (select count(*) = 2 and bool_and(owner_id = '7e57c0de-0000-4000-8000-0000000000d1')
   from public.cs_social_profiles),
  '2.1 the owner reads both of their own rows');
select public.cs_test_assert(
  (select count(*) from public.cs_social_profiles
   where owner_id = '7e57c0de-0000-4000-8000-0000000000d2' or zernio_profile_id = '0123456789abcdef01234563') = 0,
  '2.2 the owner reads none of another adviser''s rows, even by id');

select public.cs_test_expect_error(
  $$insert into public.cs_social_profiles (owner_id, profile_id, zernio_profile_id)
    values ('7e57c0de-0000-4000-8000-0000000000d1', 'p3', 'ffffffffffffffffffffffff')$$,
  '%permission denied%', '2.3 an owner cannot insert, even their own row');
select public.cs_test_expect_error(
  $$update public.cs_social_profiles set zernio_profile_id = '0123456789abcdef01234563'
    where profile_id = 'me'$$,
  '%permission denied%', '2.4 an owner cannot repoint a row at another Zernio profile');
select public.cs_test_expect_error(
  $$delete from public.cs_social_profiles$$,
  '%permission denied%', '2.5 an owner cannot delete rows');
select public.cs_test_expect_error(
  $$truncate public.cs_social_profiles$$,
  '%permission denied%', '2.6 an owner cannot truncate');
select public.cs_test_expect_error(
  $$select 1 from public.cs_social_profiles for update$$,
  '%permission denied%', '2.7 an owner cannot lock rows');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d2","role":"authenticated"}';
select public.cs_test_assert(
  (select count(*) = 1 and bool_and(zernio_profile_id = '0123456789abcdef01234563')
   from public.cs_social_profiles),
  '2.8 the other adviser reads only their own row');

set local request.jwt.claims = '{"role":"authenticated"}';
select public.cs_test_assert((select count(*) from public.cs_social_profiles) = 0,
  '2.9 a token with no sub reads nothing');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Deleting a user deletes their rows only
-- ---------------------------------------------------------------------------

delete from auth.users where id = '7e57c0de-0000-4000-8000-0000000000d1';
select public.cs_test_assert(
  (select count(*) from public.cs_social_profiles where owner_id = '7e57c0de-0000-4000-8000-0000000000d1') = 0
  and (select count(*) from public.cs_social_profiles where owner_id = '7e57c0de-0000-4000-8000-0000000000d2') = 1,
  '3.1 deleting a user cascades to their rows and leaves the other adviser''s');

-- ---------------------------------------------------------------------------

do $$ begin raise notice 'social profiles tests: all passed'; end $$;
drop function public.cs_test_expect_error(text, text, text);
drop function public.cs_test_assert(boolean, text);

rollback;
