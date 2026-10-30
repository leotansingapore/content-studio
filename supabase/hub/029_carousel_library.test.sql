-- Tests for 029_carousel_library.sql. Run AFTER 029 is applied, as the migration owner:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/029_carousel_library.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. A failed check raises "FAIL <n> ..." and aborts. A clean
-- run ends with NOTICE "carousel library tests: all passed".

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

-- Rows of cs-carousels the current role can list; a role with no grant or policy sees none.
create function public.cs_test_carousel_objects_visible() returns bigint
language plpgsql as $$
declare
  n bigint;
begin
  select count(*) into n from storage.objects where bucket_id = 'cs-carousels';
  return n;
exception when insufficient_privilege then
  return 0;
end $$;

grant execute on function public.cs_test_assert(boolean, text) to anon, authenticated, service_role;
grant execute on function public.cs_test_expect_error(text, text, text) to anon, authenticated, service_role;
grant execute on function public.cs_test_carousel_objects_visible() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 0. Catalog
-- ---------------------------------------------------------------------------

select public.cs_test_assert(
  not has_table_privilege('anon', 'public.cs_carousels', 'select,insert,update,delete,truncate,references,trigger')
  and has_table_privilege('authenticated', 'public.cs_carousels', 'select')
  and not has_table_privilege('authenticated', 'public.cs_carousels', 'insert,update,delete,truncate,references,trigger')
  and has_table_privilege('service_role', 'public.cs_carousels', 'select,insert,update,delete'),
  '0.1 anon holds nothing, authenticated only reads, service_role writes');
select public.cs_test_assert(
  (select relrowsecurity from pg_class where oid = 'public.cs_carousels'::regclass)
  and (select count(*) = 1 from pg_policies where schemaname = 'public' and tablename = 'cs_carousels'),
  '0.2 RLS on, with the one read policy');
select public.cs_test_assert(
  (select public and file_size_limit = 2097152 and allowed_mime_types = array['image/webp']
     from storage.buckets where id = 'cs-carousels'),
  '0.3 cs-carousels is public, 2 MB, webp only');
select public.cs_test_assert(
  not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') like '%cs-carousels%' or coalesce(with_check, '') like '%cs-carousels%')
  ),
  '0.4 no storage.objects policy names cs-carousels, so nobody lists it');

-- ---------------------------------------------------------------------------
-- 1. Rows
-- ---------------------------------------------------------------------------

insert into public.cs_carousels (id, ig_url, creator, title, topic, format, slides, likes, comments, multiple, posted_at, imported_at, hidden)
values
  ('7e57c0de-0000-4000-8000-0000000000c1', 'https://www.instagram.com/p/AbC_12-x/', 'some.creator', 'Shown', 'Business', 'List', 7, 100, 20, 3.4, now(), now(), false),
  ('7e57c0de-0000-4000-8000-0000000000c2', 'https://www.instagram.com/p/DeF34/', 'other_one', 'Hidden', 'Design', 'Story', 5, 10, 1, 1.2, now(), now(), true);

select public.cs_test_assert(
  (select engagements = 120 from public.cs_carousels where id = '7e57c0de-0000-4000-8000-0000000000c1'),
  '1.1 engagements is likes + comments');
select public.cs_test_expect_error(
  $$insert into public.cs_carousels (id, ig_url, creator, slides, multiple, posted_at, imported_at)
    values ('7e57c0de-0000-4000-8000-0000000000c3', 'https://evil.example/p/x/', 'a', 1, 1, now(), now())$$,
  '%cs_carousels_ig_url_check%', '1.2 only an Instagram post address is kept');
select public.cs_test_expect_error(
  $$insert into public.cs_carousels (id, ig_url, creator, slides, multiple, posted_at, imported_at)
    values ('7e57c0de-0000-4000-8000-0000000000c4', 'https://www.instagram.com/p/x/', 'a', 21, 1, now(), now())$$,
  '%cs_carousels_slides_check%', '1.3 at most 20 slides');

-- What the importer uploads: owner null (the service role has no user), so 1.7 and 1.9 test access, not an empty bucket.
insert into storage.objects (bucket_id, name, owner, metadata)
values ('cs-carousels', '7e57c0de-0000-4000-8000-0000000000c1/1.webp', null, '{"mimetype": "image/webp"}');

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000e1","role":"authenticated"}';
select public.cs_test_assert(
  (select count(*) = 1 from public.cs_carousels where id in ('7e57c0de-0000-4000-8000-0000000000c1', '7e57c0de-0000-4000-8000-0000000000c2'))
  and (select title = 'Shown' from public.cs_carousels where id = '7e57c0de-0000-4000-8000-0000000000c1'),
  '1.4 a signed-in user reads a shown carousel and not a hidden one');
select public.cs_test_expect_error(
  $$update public.cs_carousels set title = 'x'$$,
  '%permission denied%', '1.5 nor writes one');
select public.cs_test_expect_error(
  $$insert into public.cs_carousels (id, ig_url, creator, slides, multiple, posted_at, imported_at)
    values ('7e57c0de-0000-4000-8000-0000000000c5', 'https://www.instagram.com/p/x/', 'a', 1, 1, now(), now())$$,
  '%permission denied%', '1.6 nor adds one');
select public.cs_test_assert(public.cs_test_carousel_objects_visible() = 0, '1.7 a signed-in user can''t list the bucket');
reset role;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select public.cs_test_expect_error(
  $$select count(*) from public.cs_carousels$$,
  '%permission denied%', '1.8 anon reads nothing');
select public.cs_test_assert(public.cs_test_carousel_objects_visible() = 0, '1.9 anon can''t list the bucket');
reset role;

do $$ begin raise notice 'carousel library tests: all passed'; end $$;
drop function public.cs_test_carousel_objects_visible();
drop function public.cs_test_expect_error(text, text, text);
drop function public.cs_test_assert(boolean, text);

rollback;
