-- Tests for 025_adlauncher_links.sql. Run AFTER 025 is applied, as the migration owner:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/025_adlauncher_links.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. A failed check raises "FAIL <n> ..." and aborts. A clean
-- run ends with NOTICE "adlauncher links tests: all passed".

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

-- Rows of cs-ad-images the current role can see; a role with no grant on storage.objects sees none.
create function public.cs_test_ad_images_visible() returns bigint
language plpgsql as $$
declare
  n bigint;
begin
  select count(*) into n from storage.objects where bucket_id = 'cs-ad-images';
  return n;
exception when insufficient_privilege then
  return 0;
end $$;

grant execute on function public.cs_test_assert(boolean, text) to anon, authenticated, service_role;
grant execute on function public.cs_test_expect_error(text, text, text) to anon, authenticated, service_role;
grant execute on function public.cs_test_ad_images_visible() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 0. Catalog
-- ---------------------------------------------------------------------------

select public.cs_test_assert(
  not has_table_privilege('anon', 'public.cs_adlauncher_links', 'select,insert,update,delete,truncate,references,trigger')
  and not has_table_privilege('authenticated', 'public.cs_adlauncher_links', 'select,insert,update,delete,truncate,references,trigger')
  and has_table_privilege('service_role', 'public.cs_adlauncher_links', 'select,insert,update,delete'),
  '0.1 anon and authenticated hold nothing; service_role reads and writes');
select public.cs_test_assert(
  (select relrowsecurity from pg_class where oid = 'public.cs_adlauncher_links'::regclass)
  and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cs_adlauncher_links'),
  '0.2 RLS on, with no policies');
select public.cs_test_assert(
  (select not public and file_size_limit = 4194304 and allowed_mime_types = array['image/jpeg', 'image/png']
     from storage.buckets where id = 'cs-ad-images'),
  '0.3 cs-ad-images is private, 4 MB, JPEG or PNG');
select public.cs_test_assert(
  not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') like '%cs-ad-images%' or coalesce(with_check, '') like '%cs-ad-images%')
  ),
  '0.4 no storage.objects policy names cs-ad-images');

-- ---------------------------------------------------------------------------
-- 1. Rows
-- ---------------------------------------------------------------------------

-- A ...e1 has connected. B ...e2 is another sign-in.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000', ('7e57c0de-0000-4000-8000-0000000000' || s)::uuid,
       'authenticated', 'authenticated', 'cs-test-' || s || '@example.test', '', now(), '{}', '{}', now(), now()
from unnest(array['e1', 'e2']) s;

insert into public.cs_adlauncher_links (user_id, access_enc, refresh_enc, expires_at, refresh_expires_at, scope, account)
values ('7e57c0de-0000-4000-8000-0000000000e1', 'v1.aaaa.bbbb', 'v1.cccc.dddd', now() + interval '1 hour',
        now() + interval '30 days', 'core:read core:write meta:launch', '{"organization": "Test org"}');

-- What the function uploads: owner null (the service role has no user), under the caller's folder.
insert into storage.objects (bucket_id, name, owner, metadata)
values ('cs-ad-images', '7e57c0de-0000-4000-8000-0000000000e1/abc.jpg', null, '{"mimetype": "image/jpeg"}');

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000e1","role":"authenticated"}';
select public.cs_test_expect_error(
  $$select count(*) from public.cs_adlauncher_links$$,
  '%permission denied%', '1.1 the owner can''t read their own row from the browser');
select public.cs_test_expect_error(
  $$update public.cs_adlauncher_links set scope = 'x'$$,
  '%permission denied%', '1.2 nor write it');
select public.cs_test_assert(public.cs_test_ad_images_visible() = 0, '1.3 the owner can''t list or read the bucket');
reset role;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select public.cs_test_assert(public.cs_test_ad_images_visible() = 0, '1.4 anon can''t list or read the bucket');
reset role;

select public.cs_test_expect_error(
  $$update public.cs_adlauncher_links set pending_state = 'short' where user_id = '7e57c0de-0000-4000-8000-0000000000e1'$$,
  '%cs_adlauncher_links_pending_state_check%', '1.5 a malformed state is refused');
update public.cs_adlauncher_links set pending_state = repeat('A', 43), pending_at = now()
where user_id = '7e57c0de-0000-4000-8000-0000000000e1';
select public.cs_test_assert(
  (select pending_state = repeat('A', 43) from public.cs_adlauncher_links where user_id = '7e57c0de-0000-4000-8000-0000000000e1'),
  '1.6 a 43-character state fits');

delete from auth.users where id = '7e57c0de-0000-4000-8000-0000000000e1';
select public.cs_test_assert(
  not exists (select 1 from public.cs_adlauncher_links where user_id = '7e57c0de-0000-4000-8000-0000000000e1'),
  '1.7 deleting the user deletes their connection');

do $$ begin raise notice 'adlauncher links tests: all passed'; end $$;
drop function public.cs_test_ad_images_visible();
drop function public.cs_test_expect_error(text, text, text);
drop function public.cs_test_assert(boolean, text);

rollback;
