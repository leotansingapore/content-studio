-- Tests for 019_tracked_links.sql. Run AFTER 011 and 019 are applied, as the
-- migration owner:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/019_tracked_links.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. A failed check raises
-- "FAIL <n> ..." and aborts. A clean run ends with NOTICE
-- "tracked links tests: all passed".

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

-- Points A's URL-check link at p_url; used for the URL rules.
create function public.cs_test_save_url(p_url text) returns void
language sql as $$
  select null::void from public.cs_save_tracked_link(
    current_setting('cs_test.url_link')::uuid, null, 'URL check', p_url)
$$;

-- A visitor key as the edge function sends it: 64 lowercase hex characters.
create function public.cs_test_key(p_person text) returns text
language sql immutable as $$ select encode(sha256(convert_to(p_person, 'UTF8')), 'hex') $$;

grant execute on function public.cs_test_assert(boolean, text) to anon, authenticated, service_role;
grant execute on function public.cs_test_expect_error(text, text, text) to anon, authenticated, service_role;
grant execute on function public.cs_test_save_url(text) to authenticated;
grant execute on function public.cs_test_key(text) to service_role;

-- A ...b1 owns the links. B ...b2 is another adviser.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000', ('7e57c0de-0000-4000-8000-0000000000' || s)::uuid,
       'authenticated', 'authenticated', 'cs-test-' || s || '@example.test', '', now(), '{}', '{}', now(), now()
from unnest(array['b1', 'b2']) s;

-- ---------------------------------------------------------------------------
-- 0. Catalog and anon
-- ---------------------------------------------------------------------------

select public.cs_test_assert(
  not exists (
    select 1
    from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where c.relname in ('cs_tracked_links', 'cs_tracked_link_campaigns', 'cs_tracked_link_days',
                        'cs_tracked_link_visitors', 'cs_tracked_link_slug_holds', 'cs_tracked_link_salt')
      and c.relnamespace = 'public'::regnamespace
      and (a.grantee in (0, 'anon'::regrole)
           or (a.grantee = 'authenticated'::regrole
               and (a.privilege_type <> 'SELECT'
                    or c.relname in ('cs_tracked_link_visitors', 'cs_tracked_link_slug_holds', 'cs_tracked_link_salt'))))),
  '0.1 public and anon hold nothing; authenticated holds only SELECT on links, campaigns and days');
select public.cs_test_assert(
  has_table_privilege('authenticated', 'public.cs_tracked_links', 'select')
  and has_table_privilege('authenticated', 'public.cs_tracked_link_campaigns', 'select')
  and has_table_privilege('authenticated', 'public.cs_tracked_link_days', 'select')
  and not has_table_privilege('service_role', 'public.cs_tracked_link_salt', 'select,insert,update,delete,truncate,references,trigger'),
  '0.2 owners can read their three tables; not even service_role can read the salt');
select public.cs_test_assert(
  not has_function_privilege('anon', 'public.cs_save_tracked_link(uuid, text, text, text, text)', 'execute')
  and not has_function_privilege('anon', 'public.cs_delete_tracked_link(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.cs_set_tracked_link_report(uuid, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.cs_tracked_link_click(text, text, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.cs_tracked_link_report_public(text)', 'execute')
  and not has_function_privilege('anon', 'public.cs_tracked_link_lock_slugs(text[])', 'execute')
  and not has_function_privilege('authenticated', 'public.cs_tracked_link_lock_slugs(text[])', 'execute')
  and not has_function_privilege('anon', 'public.cs_tracked_link_hold_slug()', 'execute')
  and not has_function_privilege('authenticated', 'public.cs_tracked_link_hold_slug()', 'execute')
  and not has_function_privilege('authenticated', 'public.cs_tracked_link_click(text, text, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.cs_tracked_link_report_public(text)', 'execute')
  and has_function_privilege('authenticated', 'public.cs_save_tracked_link(uuid, text, text, text, text)', 'execute')
  and has_function_privilege('authenticated', 'public.cs_delete_tracked_link(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.cs_set_tracked_link_report(uuid, boolean)', 'execute')
  and has_function_privilege('service_role', 'public.cs_tracked_link_click(text, text, boolean)', 'execute')
  and has_function_privilege('service_role', 'public.cs_tracked_link_report_public(text)', 'execute'),
  '0.3 anon executes nothing; owners get the three owner functions; the public two are service_role only');
select public.cs_test_assert(
  (select count(*) = 7
     and bool_and(coalesce(p.proconfig @> array['search_path=public, pg_temp'], false))
     and bool_and(p.prosecdef = (p.proname <> 'cs_tracked_link_lock_slugs'))
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('cs_tracked_link_lock_slugs', 'cs_tracked_link_hold_slug', 'cs_save_tracked_link', 'cs_delete_tracked_link',
                       'cs_set_tracked_link_report', 'cs_tracked_link_click', 'cs_tracked_link_report_public')),
  '0.4 every function pins search_path; all but the lock helper are SECURITY DEFINER');
select public.cs_test_assert(
  (select count(*) = 6 and bool_and(relrowsecurity) from pg_class
   where relnamespace = 'public'::regnamespace
     and relname in ('cs_tracked_links', 'cs_tracked_link_campaigns', 'cs_tracked_link_days',
                     'cs_tracked_link_visitors', 'cs_tracked_link_slug_holds', 'cs_tracked_link_salt'))
  and (select count(*) = 3 and bool_and(cmd = 'SELECT' and roles = array['authenticated']::name[])
       from pg_policies where schemaname = 'public' and tablename like 'cs_tracked_link%'),
  '0.5 RLS is on everywhere; the only policies are three SELECTs for authenticated');
-- The days policy's subquery runs under the links policy too; this keeps its own owner test.
select public.cs_test_assert(
  (select count(*) = 1 from pg_policies
   where tablename = 'cs_tracked_link_days' and qual like '%owner_id = ( SELECT auth.uid()%'),
  '0.5b the daily counts policy checks the owner itself');
select public.cs_test_assert((select count(*) = 1 and bool_and(octet_length(salt) = 32) from public.cs_tracked_link_salt),
  '0.6 one 32-byte salt');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select public.cs_test_expect_error($$select count(*) from public.cs_tracked_links$$,
  '%permission denied%', '0.7 anon cannot read links');
select public.cs_test_expect_error($$select count(*) from public.cs_tracked_link_days$$,
  '%permission denied%', '0.8 anon cannot read counts');
select public.cs_test_expect_error($$select public.cs_tracked_link_click('ada-guide', null)$$,
  '%permission denied%', '0.9 anon cannot call the redirect');
select public.cs_test_expect_error($$select public.cs_tracked_link_report_public('x')$$,
  '%permission denied%', '0.10 anon cannot call the report');
select public.cs_test_expect_error($$select public.cs_save_tracked_link(null, 'anon-link', 'L', 'https://example.com')$$,
  '%permission denied%', '0.11 anon cannot make a link');
reset role;

-- ---------------------------------------------------------------------------
-- 1. A makes links
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b1","role":"authenticated"}';

select set_config('cs_test.l1', (public.cs_save_tracked_link(null, '  Ada-Guide ', E'  Free\tguide ',
  'https://example.com/guide?utm_source=ig&ref=ada#top', '  Spring guide ')).id::text, true);
select public.cs_test_assert(
  (select slug = 'ada-guide' and label = 'Free guide' and campaign_id is not null
          and owner_id = '7e57c0de-0000-4000-8000-0000000000b1'
   from public.cs_tracked_links where id = current_setting('cs_test.l1')::uuid)
  and (select count(*) = 1 and bool_and(name = 'Spring guide' and report_slug is null)
       from public.cs_tracked_link_campaigns),
  '1.1 slug lowercased, label and campaign cleaned, campaign made with its report off');

select set_config('cs_test.l2', (public.cs_save_tracked_link(null, '', 'Book a call',
  'https://calendly.com/ada', 'SPRING GUIDE')).id::text, true);
select public.cs_test_assert(
  (select slug ~ '^[a-z2-9]{10}$' from public.cs_tracked_links where id = current_setting('cs_test.l2')::uuid),
  '1.2 a blank slug gets a random 10-character one');
select public.cs_test_assert(
  (select count(distinct campaign_id) = 1 and count(*) = 2 from public.cs_tracked_links)
  and (select count(*) = 1 from public.cs_tracked_link_campaigns),
  '1.3 a campaign name in another case joins the same campaign');

select set_config('cs_test.l3', (public.cs_save_tracked_link(null, 'ada-form', 'Form',
  'https://forms.example.com/f', '   ')).id::text, true);
select public.cs_test_assert(
  (select campaign_id is null from public.cs_tracked_links where id = current_setting('cs_test.l3')::uuid),
  '1.4 a blank campaign means no campaign');
select set_config('cs_test.url_link', (public.cs_save_tracked_link(null, 'ada-url-check', 'URL check',
  'https://example.com')).id::text, true);

select public.cs_test_expect_error($$select public.cs_save_tracked_link(null, 'ab', 'L', 'https://example.com')$$,
  '%3 to 40 lowercase%', '1.5 a 2-character slug is refused');
select public.cs_test_expect_error($$select public.cs_save_tracked_link(null, '-ada', 'L', 'https://example.com')$$,
  '%3 to 40 lowercase%', '1.6 a slug starting with a hyphen is refused');
select public.cs_test_expect_error($$select public.cs_save_tracked_link(null, 'ada tan', 'L', 'https://example.com')$$,
  '%3 to 40 lowercase%', '1.7 a slug with a space is refused');
select public.cs_test_expect_error($$select public.cs_save_tracked_link(null, 'ada_tan', 'L', 'https://example.com')$$,
  '%3 to 40 lowercase%', '1.8 a slug with an underscore is refused');
select public.cs_test_expect_error(format('select public.cs_save_tracked_link(null, %L, %L, %L)', repeat('a', 41), 'L', 'https://example.com'),
  '%3 to 40 lowercase%', '1.9 a 41-character slug is refused');
select public.cs_test_expect_error($$select public.cs_save_tracked_link(null, 'Admin', 'L', 'https://example.com')$$,
  '%reserved%', '1.10 admin is reserved');
select public.cs_test_expect_error($$select public.cs_save_tracked_link(null, 'report', 'L', 'https://example.com')$$,
  '%reserved%', '1.11 report is reserved');
select public.cs_test_expect_error($$select public.cs_save_tracked_link(null, 'team', 'L', 'https://example.com')$$,
  '%reserved%', '1.12 app routes are reserved');
select public.cs_test_expect_error($$select public.cs_save_tracked_link(null, null, ' ', 'https://example.com')$$,
  '%label of up to 60%', '1.13 a blank label is refused');
select public.cs_test_expect_error(format('select public.cs_save_tracked_link(null, null, %L, %L)', repeat('x', 61), 'https://example.com'),
  '%label of up to 60%', '1.14 a 61-character label is refused');
select public.cs_test_expect_error(format('select public.cs_save_tracked_link(null, null, %L, %L, %L)', 'L', 'https://example.com', repeat('c', 61)),
  '%campaign name to 60%', '1.15 a 61-character campaign name is refused');
select public.cs_test_expect_error(format('select public.cs_save_tracked_link(null, null, %L, %L)', repeat(' ', 401) || 'L', 'https://example.com'),
  '%far too long%', '1.16 an oversized raw label is refused before normalising');
select public.cs_test_expect_error(format('select public.cs_save_tracked_link(null, null, %L, %L)', 'L', 'https://example.com/' || repeat('a', 4100)),
  '%far too long%', '1.17 an oversized raw URL is refused before any regex');

select public.cs_test_expect_error($$select public.cs_test_save_url('javascript:alert(1)')$$,
  '%starting with https%', '1.18 javascript: refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('JavaScript://example.com/%0Aalert(1)')$$,
  '%starting with https%', '1.19 javascript:// refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('data:text/html,<script>alert(1)</script>')$$,
  '%starting with https%', '1.20 data: refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('https://bank.com@evil.example/login')$$,
  '%starting with https%', '1.21 a user@host URL refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('https://exa mple.com')$$,
  '%starting with https%', '1.22 a URL with a space refused');
select public.cs_test_expect_error($$select public.cs_test_save_url(E'https://example.com/\nx')$$,
  '%starting with https%', '1.23 a URL with a newline refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('ftp://example.com')$$,
  '%starting with https%', '1.24 ftp refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('//example.com')$$,
  '%starting with https%', '1.25 a scheme-relative URL refused');
select public.cs_test_expect_error(format('select public.cs_test_save_url(%L)', 'https://example.com/' || repeat('a', 2030)),
  '%starting with https%', '1.26 a URL over 2,048 characters refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('https://example.com\@evil.example/')$$,
  '%starting with https%', '1.27 a backslash after the host refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('https://example.com\evil.example')$$,
  '%starting with https%', '1.28 a backslash in the host refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('https://exa_mple.com/')$$,
  '%starting with https%', '1.29 a host with an underscore refused');
select public.cs_test_expect_error($$select public.cs_test_save_url(U&'https://b\00FCcher.example/')$$,
  '%starting with https%', '1.30 a non-ASCII host refused (punycode works)');
select public.cs_test_expect_error($$select public.cs_test_save_url('https://example.com:123456/')$$,
  '%starting with https%', '1.31 a 6-digit port refused');
select public.cs_test_save_url('https://xn--bcher-kva.example:8443/a?b=c#d');
select public.cs_test_save_url('HTTP://Example.com/path?q=1#top');
select public.cs_test_save_url('https://example.com');

-- Editing keeps the slug when none is sent; a new slug holds the old one.
select public.cs_save_tracked_link(current_setting('cs_test.l3')::uuid, null, 'Fact-find form',
  'https://forms.example.com/f2');
select public.cs_test_assert(
  (select slug = 'ada-form' and label = 'Fact-find form' and url = 'https://forms.example.com/f2'
          and updated_at >= created_at
   from public.cs_tracked_links where id = current_setting('cs_test.l3')::uuid),
  '1.32 an edit with a blank slug keeps the address');
select public.cs_save_tracked_link(current_setting('cs_test.url_link')::uuid, 'ada-old', 'URL check', 'https://example.com');
select public.cs_save_tracked_link(current_setting('cs_test.url_link')::uuid, 'ada-new', 'URL check', 'https://example.com');
select public.cs_test_expect_error(
  $$select public.cs_save_tracked_link('7e57c0de-0000-4000-8000-00000000ffff', null, 'L', 'https://example.com')$$,
  '%link is gone%', '1.33 editing an unknown link is refused');
reset role;
select public.cs_test_assert(
  (select count(*) = 2
          and bool_and(owner_id = '7e57c0de-0000-4000-8000-0000000000b1' and released_at = now())
   from public.cs_tracked_link_slug_holds where slug in ('ada-url-check', 'ada-old'))
  and (select count(*) = 2 from public.cs_tracked_link_slug_holds),
  '1.35 each rename holds the old slug once, for 30 days; an edit that keeps the slug holds nothing');
set local role authenticated;

set local request.jwt.claims = '{"role":"authenticated"}';
select public.cs_test_expect_error($$select public.cs_save_tracked_link(null, null, 'L', 'https://example.com')$$,
  '%Sign in first%', '1.34 a token with no user makes nothing');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Another adviser
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b2","role":"authenticated"}';
select set_config('cs_test.lb', (public.cs_save_tracked_link(null, 'bo-link', 'Bo', 'https://example.org/bo')).id::text, true);
select public.cs_test_expect_error($$select public.cs_save_tracked_link(null, 'ADA-GUIDE', 'Mine', 'https://example.org')$$,
  '%address is taken%', '2.1 a slug in use cannot be taken');
select public.cs_test_assert(
  (select count(*) = 1 from public.cs_tracked_links)
  and (select count(*) = 0 from public.cs_tracked_link_campaigns),
  '2.2 another adviser reads only their own link and none of A''s campaigns');
select public.cs_test_expect_error(
  format('select public.cs_save_tracked_link(%L, %L, %L, %L)', current_setting('cs_test.l1'), 'stolen', 'Mine', 'https://evil.example'),
  '%link is gone%', '2.3 another adviser cannot edit A''s link by id');
select public.cs_test_assert(public.cs_delete_tracked_link(current_setting('cs_test.l1')::uuid) = false,
  '2.4 another adviser''s delete touches nothing of A''s');
reset role;
select set_config('cs_test.campaign', (select campaign_id::text from public.cs_tracked_links
  where id = current_setting('cs_test.l1')::uuid), true);
set local role authenticated;
select public.cs_test_expect_error(
  format('select public.cs_set_tracked_link_report(%L, true)', current_setting('cs_test.campaign')),
  '%campaign is gone%', '2.5 another adviser cannot switch on A''s report');
select public.cs_test_expect_error($$select public.cs_tracked_link_click('ada-guide', null)$$,
  '%permission denied%', '2.6 a signed-in user cannot call the redirect');
select public.cs_test_expect_error($$select public.cs_tracked_link_report_public('x')$$,
  '%permission denied%', '2.7 a signed-in user cannot call the report');
select public.cs_test_expect_error($$update public.cs_tracked_links set url = 'https://evil.example'$$,
  '%permission denied%', '2.8 links cannot be written directly');
select public.cs_test_expect_error(
  format('insert into public.cs_tracked_link_days (link_id, day, clicks) values (%L, current_date, 99)', current_setting('cs_test.lb')),
  '%permission denied%', '2.9 counts cannot be written directly');
select public.cs_test_expect_error($$insert into public.cs_tracked_link_campaigns (owner_id, name) values (auth.uid(), 'x')$$,
  '%permission denied%', '2.10 campaigns cannot be written directly');
select public.cs_test_expect_error($$select count(*) from public.cs_tracked_link_visitors$$,
  '%permission denied%', '2.11 nobody client-side reads visitors');
select public.cs_test_expect_error($$select count(*) from public.cs_tracked_link_slug_holds$$,
  '%permission denied%', '2.12 nobody client-side reads slug holds');
select public.cs_test_expect_error($$select count(*) from public.cs_tracked_link_salt$$,
  '%permission denied%', '2.13 nobody client-side reads the salt');
reset role;
select public.cs_test_assert(
  (select slug = 'ada-guide' and url like 'https://example.com/guide%' from public.cs_tracked_links
   where id = current_setting('cs_test.l1')::uuid),
  '2.14 A''s link is unchanged');

-- ---------------------------------------------------------------------------
-- 3. Visitors (service_role, as the edge function calls it)
-- ---------------------------------------------------------------------------

set local role service_role;
select public.cs_test_assert(
  public.cs_tracked_link_click('Ada-Guide', public.cs_test_key('v:1.2.3.4|Safari')) = 'https://example.com/guide?utm_source=ig&ref=ada#top',
  '3.1 a tap returns the stored URL');
select public.cs_tracked_link_click('ada-guide', public.cs_test_key('v:1.2.3.4|Safari'));
select public.cs_test_assert(public.cs_tracked_link_click('nobody-here', null) is null
  and public.cs_tracked_link_click(null, null) is null,
  '3.2 an unknown or missing slug returns nothing');
reset role;
select public.cs_test_assert(
  (select clicks = 2 and people = 1 from public.cs_tracked_link_days where link_id = current_setting('cs_test.l1')::uuid),
  '3.3 two taps by one person: 2 taps, 1 person');

set local role service_role;
select public.cs_tracked_link_click('ada-guide', public.cs_test_key('v:1.2.3.4|Chrome'));
select public.cs_tracked_link_click((select slug from public.cs_tracked_links where id = current_setting('cs_test.l2')::uuid),
  public.cs_test_key('v:1.2.3.4|Safari'));
select public.cs_tracked_link_click('ada-form', public.cs_test_key('v:1.2.3.4|Safari'));
reset role;
select public.cs_test_assert(
  (select clicks = 3 and people = 2 from public.cs_tracked_link_days where link_id = current_setting('cs_test.l1')::uuid),
  '3.4 another visitor key is another person');
select public.cs_test_assert(
  (select clicks = 1 and people = 0 from public.cs_tracked_link_days where link_id = current_setting('cs_test.l2')::uuid),
  '3.5 the same person on another link of the campaign is a tap, not a new person');
select public.cs_test_assert(
  (select clicks = 1 and people = 1 from public.cs_tracked_link_days where link_id = current_setting('cs_test.l3')::uuid),
  '3.6 the same person on a link outside the campaign counts there');

set local role service_role;
select public.cs_test_assert(
  public.cs_tracked_link_click('ada-form', public.cs_test_key('v:9.9.9.9|Bot'), false) = 'https://forms.example.com/f2',
  '3.7 a bot is sent on');
select public.cs_tracked_link_click('ada-form', 'not-a-key');
select public.cs_tracked_link_click('ada-form', upper(public.cs_test_key('v:5.5.5.5|Safari')));
select public.cs_tracked_link_click('ada-form', left(public.cs_test_key('v:5.5.5.5|Safari'), 63));
select public.cs_tracked_link_click('ada-form', null);
reset role;
select public.cs_test_assert(
  (select clicks = 5 and people = 1 from public.cs_tracked_link_days where link_id = current_setting('cs_test.l3')::uuid),
  '3.8 a bot is not counted; a missing or malformed key counts the tap but no person');

select public.cs_test_assert(
  (select count(*) = 3
     and bool_and(coalesce(octet_length(visitor) = 32, false))
     and bool_and(coalesce(visitor <> decode(public.cs_test_key('v:1.2.3.4|Safari'), 'hex'), false))
     and bool_and(coalesce(visitor <> sha256(convert_to(coalesce(l.campaign_id, l.id)::text || '|', 'UTF8') || decode(public.cs_test_key('v:1.2.3.4|Safari'), 'hex')), false))
     and bool_and(v.owner_id = '7e57c0de-0000-4000-8000-0000000000b1')
   from public.cs_tracked_link_visitors v join public.cs_tracked_links l on l.id = v.link_id),
  '3.9 three people stored, each only as a salted 32-byte hash');

set local role service_role;
select public.cs_test_expect_error($$select salt from public.cs_tracked_link_salt$$,
  '%permission denied%', '3.10 the edge function''s role cannot read the salt');
reset role;

-- Daily tap cap: 5,000 per link per Singapore day.
update public.cs_tracked_link_days set clicks = 4999 where link_id = current_setting('cs_test.l1')::uuid;
set local role service_role;
select public.cs_tracked_link_click('ada-guide', public.cs_test_key('v:7.7.7.7|Safari'));
select public.cs_test_assert(
  public.cs_tracked_link_click('ada-guide', public.cs_test_key('v:8.8.8.8|Safari')) like 'https://example.com/guide%',
  '3.11 past the cap the redirect still works');
reset role;
select public.cs_test_assert(
  (select clicks = 5000 and people = 3 from public.cs_tracked_link_days where link_id = current_setting('cs_test.l1')::uuid),
  '3.12 counting stops at 5,000 a day, and no person is counted past it');
select public.cs_test_assert(
  (select bool_and(day = (now() at time zone 'Asia/Singapore')::date) from public.cs_tracked_link_days),
  '3.13 taps are counted by Singapore day');

-- People cap: 1,000 new people per account per Singapore day.
insert into public.cs_tracked_link_visitors (visitor, link_id, owner_id, first_day)
select sha256(convert_to('seed-' || g, 'UTF8')), current_setting('cs_test.l2')::uuid,
       '7e57c0de-0000-4000-8000-0000000000b1', (now() at time zone 'Asia/Singapore')::date
from generate_series(1, 1000 - (select count(*)::int from public.cs_tracked_link_visitors) - 1) g;
set local role service_role;
select public.cs_tracked_link_click('ada-form', public.cs_test_key('v:1.0.0.1|Safari'));
select public.cs_tracked_link_click('ada-form', public.cs_test_key('v:1.0.0.2|Safari'));
select public.cs_tracked_link_click('bo-link', public.cs_test_key('v:1.0.0.2|Safari'));
reset role;
select public.cs_test_assert(
  (select clicks = 7 and people = 2 from public.cs_tracked_link_days where link_id = current_setting('cs_test.l3')::uuid)
  and (select count(*) = 1000 from public.cs_tracked_link_visitors where owner_id = '7e57c0de-0000-4000-8000-0000000000b1'),
  '3.14 past 1,000 new people today the tap counts but the person does not');
select public.cs_test_assert(
  (select people = 1 from public.cs_tracked_link_days where link_id = current_setting('cs_test.lb')::uuid),
  '3.15 another adviser''s people are not held by A''s cap');
delete from public.cs_tracked_link_visitors v
using public.cs_tracked_links l
where l.id = v.link_id and l.id = current_setting('cs_test.l2')::uuid;

-- ---------------------------------------------------------------------------
-- 4. Public report
-- ---------------------------------------------------------------------------

set local role service_role;
select public.cs_test_assert(public.cs_tracked_link_report_public(null) is null
  and public.cs_tracked_link_report_public('') is null,
  '4.1 with every report off, no slug finds one');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b1","role":"authenticated"}';
select set_config('cs_test.report', public.cs_set_tracked_link_report(current_setting('cs_test.campaign')::uuid, true), true);
select public.cs_test_assert(current_setting('cs_test.report') ~ '^[a-z2-9]{20}$'
  and (select report_slug = current_setting('cs_test.report') from public.cs_tracked_link_campaigns),
  '4.2 switching on makes a 20-character report slug the owner can read');
select public.cs_test_assert(
  public.cs_set_tracked_link_report(current_setting('cs_test.campaign')::uuid, true) = current_setting('cs_test.report'),
  '4.3 switching on again keeps the same slug');
reset role;

set local role service_role;
select set_config('cs_test.json', public.cs_tracked_link_report_public(upper(current_setting('cs_test.report')))::text, true);
reset role;
select public.cs_test_assert(
  (select v ->> 'campaign' = 'Spring guide'
          and (v ->> 'clicks')::int = 5001 and (v ->> 'people')::int = 3
          and jsonb_array_length(v -> 'days') = 7
          and v -> 'days' -> 6 ->> 'day' = ((now() at time zone 'Asia/Singapore')::date)::text
          and (v -> 'days' -> 6 ->> 'clicks')::int = 5001
          and (v -> 'days' -> 0 ->> 'clicks')::int = 0
          and jsonb_array_length(v -> 'links') = 2
          and v -> 'links' -> 0 ->> 'label' = 'Free guide'
          and v -> 'links' -> 0 ->> 'url' = 'https://example.com/guide'
          and (v -> 'links' -> 0 ->> 'clicks')::int = 5000
          and (v -> 'links' -> 1 ->> 'people')::int = 0
          and (select array_agg(k order by k) from jsonb_object_keys(v) k) = array['campaign', 'clicks', 'days', 'links', 'people']
          and (select array_agg(k order by k) from jsonb_object_keys(v -> 'links' -> 0) k) = array['clicks', 'label', 'people', 'url']
   from (select current_setting('cs_test.json')::jsonb v) x),
  '4.4 the report has the campaign, totals, 7 days and each link, with exactly these fields');
select public.cs_test_assert(
  (select current_setting('cs_test.json') not like '%utm_%'
          and current_setting('cs_test.json') not like '%#top%'
          and current_setting('cs_test.json') not like '%ada-guide%'
          and current_setting('cs_test.json') not like '%7e57c0de%'
          and current_setting('cs_test.json') not like '%cs-test-%'
          and current_setting('cs_test.json') not like '%' || current_setting('cs_test.campaign') || '%'),
  '4.5 the report shows no query string, fragment, link slug, account, email or campaign id');

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b1","role":"authenticated"}';
select public.cs_test_assert(
  public.cs_set_tracked_link_report(current_setting('cs_test.campaign')::uuid, false) is null,
  '4.6a switching off returns no slug');
select public.cs_test_assert((select report_slug is null from public.cs_tracked_link_campaigns),
  '4.6 switching off deletes the report slug');
reset role;
set local role service_role;
select public.cs_test_assert(public.cs_tracked_link_report_public(current_setting('cs_test.report')) is null,
  '4.7 a switched-off report shows nothing');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b1","role":"authenticated"}';
select public.cs_test_assert(
  public.cs_set_tracked_link_report(current_setting('cs_test.campaign')::uuid, true) <> current_setting('cs_test.report'),
  '4.8 switching on again makes a new slug, so the old link stays dead');
reset role;
set local role service_role;
select public.cs_test_assert(public.cs_tracked_link_report_public(current_setting('cs_test.report')) is null,
  '4.9 the old report slug still shows nothing');
reset role;

-- ---------------------------------------------------------------------------
-- 5. Owner reads counts; moving, deleting and the link cap
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b1","role":"authenticated"}';
select public.cs_test_assert((select sum(clicks) = 5008 from public.cs_tracked_link_days),
  '5.1 the owner reads their own daily counts only');

-- l2 leaves the campaign; l1 is then its last link.
select public.cs_save_tracked_link(current_setting('cs_test.l2')::uuid, null, 'Book a call', 'https://calendly.com/ada', null);
select public.cs_test_assert((select count(*) = 1 from public.cs_tracked_link_campaigns),
  '5.2 a campaign with a link left stays');
select public.cs_test_assert(public.cs_delete_tracked_link(current_setting('cs_test.l1')::uuid) = true,
  '5.3 the owner deletes a link');
select public.cs_test_assert(public.cs_delete_tracked_link(current_setting('cs_test.l1')::uuid) = false,
  '5.4 deleting again finds nothing');
select public.cs_test_assert((select count(*) = 0 from public.cs_tracked_link_campaigns),
  '5.5 a campaign whose last link went is deleted, report and all');
reset role;
select public.cs_test_assert(
  not exists (select 1 from public.cs_tracked_link_days where link_id = current_setting('cs_test.l1')::uuid)
  and not exists (select 1 from public.cs_tracked_link_visitors where link_id = current_setting('cs_test.l1')::uuid)
  and exists (select 1 from public.cs_tracked_link_visitors where link_id = current_setting('cs_test.l3')::uuid),
  '5.6 deleting a link removes its counts and the people first seen on it, and nothing else');
select public.cs_test_assert(
  (select count(*) = 1
          and bool_and(owner_id = '7e57c0de-0000-4000-8000-0000000000b1' and released_at = now())
   from public.cs_tracked_link_slug_holds where slug = 'ada-guide')
  and (select count(*) = 3 from public.cs_tracked_link_slug_holds),
  '5.6b the owner''s delete holds its slug once, for 30 days');

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b1","role":"authenticated"}';
do $$
begin
  while (select count(*) from public.cs_tracked_links) < 100 loop
    perform public.cs_save_tracked_link(null, null, 'Filler', 'https://example.com/f');
  end loop;
end $$;
select public.cs_test_expect_error($$select public.cs_save_tracked_link(null, null, 'One more', 'https://example.com')$$,
  '%100 tracked links%', '5.7 a 101st link is refused');
select public.cs_test_assert(
  (select slug from public.cs_save_tracked_link(current_setting('cs_test.l3')::uuid, 'ada-form-2', 'Form', 'https://forms.example.com/f2')) = 'ada-form-2',
  '5.8 at the cap, an existing link can still be edited (and renamed)');
reset role;

-- ---------------------------------------------------------------------------
-- 6. Released slugs are held for 30 days
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b2","role":"authenticated"}';
select public.cs_test_expect_error($$select public.cs_save_tracked_link(null, 'ada-guide', 'Mine', 'https://example.org')$$,
  '%in use recently%', '6.1 a deleted link''s slug is held from others');
select public.cs_test_expect_error($$select public.cs_save_tracked_link(null, 'ada-old', 'Mine', 'https://example.org')$$,
  '%in use recently%', '6.2 a renamed link''s old slug is held from others');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b1","role":"authenticated"}';
select public.cs_test_assert(
  (select slug from public.cs_save_tracked_link(current_setting('cs_test.l3')::uuid, 'ada-form', 'Form', 'https://forms.example.com/f2')) = 'ada-form',
  '6.3 the owner can take their own released slug back');
reset role;
update public.cs_tracked_link_slug_holds set released_at = now() - interval '31 days' where slug = 'ada-guide';

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b2","role":"authenticated"}';
select public.cs_test_assert(
  (select slug from public.cs_save_tracked_link(null, 'ada-guide', 'Someone else', 'https://example.org')) = 'ada-guide',
  '6.4 after 30 days the slug is free again');
reset role;

-- ---------------------------------------------------------------------------
-- 7. The prune job
-- ---------------------------------------------------------------------------

select public.cs_test_assert(
  (select count(*) = 1 from cron.job where jobname = 'tracked-link-prune' and schedule = '23 4 * * *'
     and command not like '%net.http_post%' and command not like '%vault%'),
  '7.1 one daily prune job that posts nothing and reads no secret');

update public.cs_tracked_link_visitors set first_day = (now() at time zone 'Asia/Singapore')::date - 91
where link_id = current_setting('cs_test.l3')::uuid;
update public.cs_tracked_link_visitors set first_day = (now() at time zone 'Asia/Singapore')::date - 90
where link_id = current_setting('cs_test.lb')::uuid;
update public.cs_tracked_link_slug_holds set released_at = now() - interval '29 days' where slug = 'ada-old';
insert into public.cs_tracked_link_slug_holds (slug, owner_id, released_at)
values ('stale-hold', '7e57c0de-0000-4000-8000-0000000000b1', now() - interval '31 days');
do $$ begin execute (select command from cron.job where jobname = 'tracked-link-prune'); end $$;
select public.cs_test_assert(
  not exists (select 1 from public.cs_tracked_link_visitors where link_id = current_setting('cs_test.l3')::uuid)
  and exists (select 1 from public.cs_tracked_link_visitors where link_id = current_setting('cs_test.lb')::uuid),
  '7.2 people first seen more than 90 days ago are forgotten, 90 days kept');
select public.cs_test_assert(
  not exists (select 1 from public.cs_tracked_link_slug_holds where slug = 'stale-hold')
  and exists (select 1 from public.cs_tracked_link_slug_holds where slug = 'ada-old'),
  '7.3 holds older than 30 days are dropped, newer ones kept');
select public.cs_test_assert(
  (select clicks = 7 and people = 2 from public.cs_tracked_link_days where link_id = current_setting('cs_test.l3')::uuid),
  '7.4 the daily counts stay after the people behind them are forgotten');

-- ---------------------------------------------------------------------------
-- 8. Deleting an account takes its rows with it
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b1","role":"authenticated"}';
select public.cs_save_tracked_link(current_setting('cs_test.l2')::uuid, null, 'Book a call', 'https://calendly.com/ada', 'Autumn');
reset role;
select set_config('cs_test.a_slugs', (select string_agg(slug, ',') from public.cs_tracked_links
  where owner_id = '7e57c0de-0000-4000-8000-0000000000b1'), true);
delete from auth.users where id = '7e57c0de-0000-4000-8000-0000000000b1';
select public.cs_test_assert(
  not exists (select 1 from public.cs_tracked_links where owner_id = '7e57c0de-0000-4000-8000-0000000000b1')
  and not exists (select 1 from public.cs_tracked_link_campaigns where owner_id = '7e57c0de-0000-4000-8000-0000000000b1')
  and not exists (select 1 from public.cs_tracked_link_days d where d.link_id in (current_setting('cs_test.l2')::uuid, current_setting('cs_test.l3')::uuid))
  and exists (select 1 from public.cs_tracked_links where owner_id = '7e57c0de-0000-4000-8000-0000000000b2')
  and exists (select 1 from public.cs_tracked_link_visitors where owner_id = '7e57c0de-0000-4000-8000-0000000000b2'),
  '8.1 an account''s links, campaigns and counts go with it; the other adviser''s stay');
select public.cs_test_assert(
  (select count(*) = 100
          and count(*) = cardinality(string_to_array(current_setting('cs_test.a_slugs'), ','))
          and bool_and(h.owner_id = '7e57c0de-0000-4000-8000-0000000000b1')
   from unnest(string_to_array(current_setting('cs_test.a_slugs'), ',')) s
   join public.cs_tracked_link_slug_holds h on h.slug = s),
  '8.2 deleting an account holds every one of its 100 slugs');
select public.cs_test_assert(
  (select bool_and(coalesce(h.released_at = 'infinity', false))
   from unnest(string_to_array(current_setting('cs_test.a_slugs'), ',')) s
   join public.cs_tracked_link_slug_holds h on h.slug = s),
  '8.3 a deleted account''s holds never end');
set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000b2","role":"authenticated"}';
select public.cs_test_expect_error($$select public.cs_save_tracked_link(null, 'ada-form', 'Mine', 'https://evil.example')$$,
  '%in use recently%', '8.4 another adviser cannot take a deleted account''s slug');
reset role;
do $$ begin execute (select command from cron.job where jobname = 'tracked-link-prune'); end $$;
select public.cs_test_assert(
  (select count(*) = 100 from unnest(string_to_array(current_setting('cs_test.a_slugs'), ',')) s
   join public.cs_tracked_link_slug_holds h on h.slug = s),
  '8.5 the prune job keeps a deleted account''s holds');

-- ---------------------------------------------------------------------------

do $$ begin raise notice 'tracked links tests: all passed'; end $$;
drop function public.cs_test_key(text);
drop function public.cs_test_save_url(text);
drop function public.cs_test_expect_error(text, text, text);
drop function public.cs_test_assert(boolean, text);

rollback;
