-- Tests for 028_postmosis_host.sql. Run AFTER 028 is applied, as the migration owner (019's and 024's tests still
-- apply):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/028_postmosis_host.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. A failed check raises "FAIL <n> ..." and aborts. A clean run
-- ends with NOTICE "postmosis host tests: all passed".

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

-- Points the test link at p_url.
create function public.cs_test_save_url(p_url text) returns void
language sql as $$
  select null::void from public.cs_save_tracked_link(
    current_setting('cs_test.url_link')::uuid, null, 'URL check', p_url)
$$;

grant execute on function public.cs_test_assert(boolean, text) to anon, authenticated, service_role;
grant execute on function public.cs_test_expect_error(text, text, text) to anon, authenticated, service_role;
grant execute on function public.cs_test_save_url(text) to authenticated;

select public.cs_test_assert(
  (select md5(prosrc) = '04384ade43b1857af7d9fe01b215ac7b' from pg_proc
     where oid = 'public.cs_save_tracked_link(uuid, text, text, text, text, text)'::regprocedure),
  '0.1 the live body is 028''s');
select public.cs_test_assert(
  to_regprocedure('public.cs_save_tracked_link(uuid, text, text, text, text)') is null
  and not has_function_privilege('anon', 'public.cs_save_tracked_link(uuid, text, text, text, text, text)', 'execute')
  and has_function_privilege('authenticated', 'public.cs_save_tracked_link(uuid, text, text, text, text, text)', 'execute'),
  '0.2 one save function, still for signed-in advisers only');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '7e57c0de-0000-4000-8000-0000000000d1', 'authenticated', 'authenticated',
  'cs-test-d1@example.test', '', now(), '{}', '{}', now(), now());
insert into public.hub_memberships (user_id, email, status) values ('7e57c0de-0000-4000-8000-0000000000d1', 'cs-test-d1@example.test', 'active');

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d1","role":"authenticated"}';

select set_config('cs_test.url_link', (public.cs_save_tracked_link(null, 'host-check', 'URL check', 'https://example.com')).id::text, true);

-- Our own /t/ addresses, on every host, are refused: a tracked link can't point at another one.
select public.cs_test_expect_error($$select public.cs_test_save_url('https://app.postmosis.com/t/ada-guide')$$,
  '%already a tracked link%', '1.1 the new app host''s /t/ address refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('https://postmosis.com/t/ada-guide')$$,
  '%already a tracked link%', '1.2 the bare domain''s /t/ address refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('HTTPS://App.Postmosis.Com.:443/t/x?r=1')$$,
  '%already a tracked link%', '1.3 refused in any case, with a trailing dot or a port');
select public.cs_test_expect_error($$select public.cs_test_save_url('https://consultant-content-studio.vercel.app/t/ada-guide')$$,
  '%already a tracked link%', '1.4 the old host''s /t/ address still refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('https://hgdbflprrficdoyxmdxe.supabase.co/functions/v1/tracked-link/ada-guide')$$,
  '%already a tracked link%', '1.5 the tracked-link function address still refused');

-- Other pages on our hosts, and look-alike hosts, are ordinary links.
select public.cs_test_save_url('https://app.postmosis.com/tutorial');
select public.cs_test_save_url('https://app.postmosis.com/l/ada-tan');
select public.cs_test_save_url('https://postmosis.com/pricing');
select public.cs_test_save_url('https://consultant-content-studio.vercel.app/l/ada-tan');
select public.cs_test_save_url('https://app.postmosis.com.evil.example/t/x');
select public.cs_test_save_url('https://notpostmosis.com/t/x');
select public.cs_test_assert(
  (select url from public.cs_tracked_links where slug = 'host-check') = 'https://notpostmosis.com/t/x',
  '2.1 other pages and look-alike hosts save');
reset role;

do $$ begin raise notice 'postmosis host tests: all passed'; end $$;
drop function public.cs_test_save_url(text);
drop function public.cs_test_expect_error(text, text, text);
drop function public.cs_test_assert(boolean, text);

rollback;
