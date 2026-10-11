-- Tests for 020_bio_slug_holds.sql. Run AFTER 011, 015 and 020 are applied,
-- as the migration owner:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/020_bio_slug_holds.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. A failed check raises
-- "FAIL <n> ..." and aborts. A clean run ends with NOTICE
-- "bio slug hold tests: all passed".

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

grant execute on function public.cs_test_assert(boolean, text) to authenticated;
grant execute on function public.cs_test_expect_error(text, text, text) to authenticated;

-- A ...c1 owns the pages. B ...c2 is another adviser.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000', ('7e57c0de-0000-4000-8000-0000000000' || s)::uuid,
       'authenticated', 'authenticated', 'cs-test-' || s || '@example.test', '', now(), '{}', '{}', now(), now()
from unnest(array['c1', 'c2']) s;

select public.cs_test_assert(
  (select p.prosecdef and coalesce(p.proconfig @> array['search_path=public, pg_temp'], false)
   from pg_proc p where p.oid = 'public.cs_bio_hold_slug()'::regprocedure)
  and not has_function_privilege('anon', 'public.cs_bio_hold_slug()', 'execute')
  and not has_function_privilege('authenticated', 'public.cs_bio_hold_slug()', 'execute'),
  '0.1 the trigger function is SECURITY DEFINER, pins search_path, and no client role executes it');
select public.cs_test_assert(
  (select count(*) = 1 from cron.job where jobname = 'bio-slug-hold-prune' and schedule = '29 4 * * *'
     and command not like '%net.http_post%' and command not like '%vault%'),
  '0.2 one daily prune job that posts nothing and reads no secret');

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c1","role":"authenticated"}';
select public.cs_save_bio_page('me', 'cleo-old', 'Cleo', '', null, '[]'::jsonb);
select public.cs_save_bio_page('me', 'cleo-tan', 'Cleo', '', null, '[]'::jsonb);
select public.cs_save_bio_page('p2', 'cleo-two', 'Cleo', '', null, '[]'::jsonb);
select public.cs_delete_bio_page('p2');
select public.cs_save_bio_page('p3', 'cleo-three', 'Cleo', '', null, '[]'::jsonb);
select public.cs_save_bio_page('p4', 'cleo-four', 'Cleo', '', null, '[]'::jsonb);
reset role;
select public.cs_test_assert(
  (select count(*) = 2 and bool_and(owner_id = '7e57c0de-0000-4000-8000-0000000000c1' and released_at = now())
   from public.cs_bio_slug_holds where slug in ('cleo-old', 'cleo-two'))
  and (select count(*) = 2 from public.cs_bio_slug_holds),
  '1.1 the owner''s rename and delete still hold for 30 days, once each');
delete from public.cs_bio_pages where slug = 'cleo-four';
select public.cs_test_assert(
  (select owner_id = '7e57c0de-0000-4000-8000-0000000000c1' and released_at = now()
   from public.cs_bio_slug_holds where slug = 'cleo-four'),
  '1.2 a direct delete (service role, admin) of a live account''s page holds its slug for 30 days');

delete from auth.users where id = '7e57c0de-0000-4000-8000-0000000000c1';
select public.cs_test_assert(
  (select count(*) = 2 and bool_and(owner_id = '7e57c0de-0000-4000-8000-0000000000c1'
                                    and released_at = now() + interval '335 days')
   from public.cs_bio_slug_holds where slug in ('cleo-tan', 'cleo-three')),
  '2.1 deleting the account holds each of its page slugs for a year');

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c2","role":"authenticated"}';
select public.cs_test_expect_error($$select public.cs_save_bio_page('me', 'cleo-tan', 'Not Cleo', '', null, '[]'::jsonb)$$,
  '%in use recently%', '2.2 another adviser cannot take a deleted account''s slug');
reset role;

update public.cs_bio_slug_holds set released_at = released_at - interval '364 days' where slug in ('cleo-tan', 'cleo-three');
do $$ begin execute (select command from cron.job where jobname = 'bio-slug-hold-prune'); end $$;
select public.cs_test_assert(
  (select count(*) = 2 from public.cs_bio_slug_holds where slug in ('cleo-tan', 'cleo-three')),
  '3.1 after 364 days the prune job keeps the holds');
set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c2","role":"authenticated"}';
select public.cs_test_expect_error($$select public.cs_save_bio_page('me', 'cleo-tan', 'Not Cleo', '', null, '[]'::jsonb)$$,
  '%in use recently%', '3.2 after 364 days the slug is still held');
reset role;

update public.cs_bio_slug_holds set released_at = released_at - interval '2 days' where slug in ('cleo-tan', 'cleo-three');
do $$ begin execute (select command from cron.job where jobname = 'bio-slug-hold-prune'); end $$;
select public.cs_test_assert(
  not exists (select 1 from public.cs_bio_slug_holds where slug in ('cleo-tan', 'cleo-three')),
  '3.3 after a year the prune job drops the holds');
set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c2","role":"authenticated"}';
select public.cs_test_assert(
  (select slug from public.cs_save_bio_page('me', 'cleo-tan', 'Not Cleo', '', null, '[]'::jsonb)) = 'cleo-tan',
  '3.4 after a year the slug is free again');
reset role;

do $$ begin raise notice 'bio slug hold tests: all passed'; end $$;
drop function public.cs_test_expect_error(text, text, text);
drop function public.cs_test_assert(boolean, text);

rollback;
