-- Tests for 032_working_library.sql. Run AFTER 032 is applied, as the migration owner:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/032_working_library.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. A failed check raises "FAIL <n> ..." and aborts. A clean
-- run ends with NOTICE "working library tests: all passed".

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

insert into public.cs_working_slideshows (id, url, author, niche, slides, views, hidden) values
  ('7690261477093149958', 'https://www.tiktok.com/@yourgolfbro/photo/7690261477093149958', 'yourgolfbro', 'golf', 1, 26304, false),
  ('7690261477093149959', 'https://www.tiktok.com/@someone/photo/7690261477093149959', 'someone', 'golf', 3, 10, true);

-- 1-3: what a row may hold
select public.cs_test_expect_error(
  $$insert into public.cs_working_slideshows (id, url, author, niche, slides) values ('1', 'https://www.tiktok.com/@a/photo/1', 'a', 'golf', 1)$$,
  '%cs_working_slideshows_id_check%', '1 an id that is not a TikTok post id');
select public.cs_test_expect_error(
  $$insert into public.cs_working_slideshows (id, url, author, niche, slides) values ('76902614770931499', 'https://evil.example/x', 'a', 'golf', 1)$$,
  '%cs_working_slideshows_url_check%', '2 a link that is not a TikTok post');
select public.cs_test_expect_error(
  $$insert into public.cs_working_slideshows (id, url, author, niche, slides) values ('76902614770931499', 'https://www.tiktok.com/@a/photo/76902614770931499', 'a', 'golf', 0)$$,
  '%cs_working_slideshows_slides_check%', '3 no slides');

-- 4-6: signed in reads only what isn't hidden, and writes nothing
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000a001", "role": "authenticated"}';
select public.cs_test_assert((select count(*) from public.cs_working_slideshows where id in ('7690261477093149958', '7690261477093149959')) = 1, '4 hidden rows stay out');
select public.cs_test_expect_error($$update public.cs_working_slideshows set views = 0$$, '%permission denied%', '5 a client cannot change a row');
select public.cs_test_expect_error($$delete from public.cs_working_slideshows$$, '%permission denied%', '6 a client cannot delete');
reset role;

-- 7: signed out reads nothing
set local role anon;
select public.cs_test_expect_error($$select count(*) from public.cs_working_slideshows$$, '%permission denied%', '7 anon reads nothing');
reset role;

-- 8: the bucket is public, 2 MB, webp only
select public.cs_test_assert((select public and file_size_limit = 2097152 and allowed_mime_types = array['image/webp'] from storage.buckets where id = 'cs-working'), '8 public webp bucket');

-- 9-11: the catalog: row security on, the one read policy, and no storage policy naming the bucket
select public.cs_test_assert((select relrowsecurity from pg_class where oid = 'public.cs_working_slideshows'::regclass), '9 row security on');
select public.cs_test_assert((select count(*) from pg_policies where schemaname = 'public' and tablename = 'cs_working_slideshows') = 1, '10 one policy');
select public.cs_test_assert(not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and (coalesce(qual, '') || coalesce(with_check, '')) like '%cs-working%'), '11 no storage policy for cs-working');
select public.cs_test_assert(not has_table_privilege('anon', 'public.cs_working_slideshows', 'select') and not has_table_privilege('authenticated', 'public.cs_working_slideshows', 'insert'), '12 grants: anon none, signed in read only');

do $$ begin raise notice 'working library tests: all passed'; end $$;
rollback;
