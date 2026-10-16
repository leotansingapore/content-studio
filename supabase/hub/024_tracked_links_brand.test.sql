-- Tests for 024_tracked_links_brand.sql. Run AFTER 024 is applied, as the migration owner (019's test still
-- applies; its privilege checks name the six-argument function since 024):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/024_tracked_links_brand.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. A clean run ends with NOTICE
-- "tracked links brand tests: all passed".

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

select public.cs_test_assert(
  to_regprocedure('public.cs_save_tracked_link(uuid, text, text, text, text)') is null
  and not has_function_privilege('anon', 'public.cs_save_tracked_link(uuid, text, text, text, text, text)', 'execute')
  and has_function_privilege('authenticated', 'public.cs_save_tracked_link(uuid, text, text, text, text, text)', 'execute'),
  '0.1 only the brand-aware save remains, for signed-in advisers');
select public.cs_test_assert(
  (select count(*) = 2 from information_schema.columns where table_schema = 'public' and column_name = 'profile_id'
     and table_name in ('cs_tracked_links', 'cs_tracked_link_campaigns') and column_default like '%me%' and is_nullable = 'NO'),
  '0.2 links and campaigns carry a brand, "me" by default');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '7e57c0de-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated',
  'cs-test-c1@example.test', '', now(), '{}', '{}', now(), now());
insert into public.hub_memberships (user_id, email, status) values ('7e57c0de-0000-4000-8000-0000000000c1', 'cs-test-c1@example.test', 'active');

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c1","role":"authenticated"}';

select set_config('cs_test.a', (public.cs_save_tracked_link(null, 'brand-a-link', 'A', 'https://example.com/a', 'Launch', 'pabc123')).id::text, true);
select public.cs_save_tracked_link(null, 'brand-me-link', 'Me', 'https://example.com/m', 'Launch');
select public.cs_test_assert(
  (select profile_id from public.cs_tracked_links where slug = 'brand-a-link') = 'pabc123'
  and (select profile_id from public.cs_tracked_links where slug = 'brand-me-link') = 'me',
  '1.1 a new link takes the open brand, "me" when none is given');
select public.cs_test_assert(
  (select count(*) = 2 from public.cs_tracked_link_campaigns where lower(name) = 'launch')
  and (select count(distinct profile_id) = 2 from public.cs_tracked_link_campaigns where lower(name) = 'launch'),
  '1.2 two brands can each have a campaign of the same name');
select public.cs_save_tracked_link(current_setting('cs_test.a')::uuid, null, 'A edited', 'https://example.com/a2', 'Launch', 'me');
select public.cs_test_assert(
  (select profile_id = 'pabc123' and label = 'A edited' from public.cs_tracked_links where slug = 'brand-a-link')
  and (select c.profile_id = 'pabc123' from public.cs_tracked_links l join public.cs_tracked_link_campaigns c on c.id = l.campaign_id where l.slug = 'brand-a-link'),
  '1.3 an edited link keeps its brand, and its campaign stays in that brand');
select public.cs_test_expect_error(
  $$select public.cs_save_tracked_link(null, 'bad-brand', 'B', 'https://example.com/b', null, 'Not A Brand!')$$,
  '%Pick a brand%', '1.4 a malformed brand id is refused');
reset role;

do $$ begin raise notice 'tracked links brand tests: all passed'; end $$;
drop function public.cs_test_expect_error(text, text, text);
drop function public.cs_test_assert(boolean, text);

rollback;
