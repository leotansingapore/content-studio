-- Tests for 015_link_in_bio.sql. Run AFTER 011 and 015 are applied, as the
-- migration owner:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/015_link_in_bio.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. A failed check raises
-- "FAIL <n> ..." and aborts. A clean run ends with NOTICE
-- "link-in-bio tests: all passed".

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

-- Saves A's 'me' page with one link whose url is p_url; used for the URL rules.
create function public.cs_test_save_url(p_url text) returns void
language sql as $$
  select null::void from public.cs_save_bio_page('me', 'ada-tan', 'Ada Tan', '', null,
    jsonb_build_array(jsonb_build_object('label', 'Link', 'url', p_url)))
$$;

grant execute on function public.cs_test_assert(boolean, text) to anon, authenticated, service_role;
grant execute on function public.cs_test_expect_error(text, text, text) to anon, authenticated, service_role;
grant execute on function public.cs_test_save_url(text) to authenticated;

-- A ...e1 owns the page. B ...e2 is another adviser.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000', ('7e57c0de-0000-4000-8000-0000000000' || s)::uuid,
       'authenticated', 'authenticated', 'cs-test-' || s || '@example.test', '', now(), '{}', '{}', now(), now()
from unnest(array['e1', 'e2']) s;

-- ---------------------------------------------------------------------------
-- 0. Catalog and anon
-- ---------------------------------------------------------------------------

select public.cs_test_assert(
  not has_table_privilege('anon', 'public.cs_bio_pages', 'select,insert,update,delete,truncate')
  and not has_table_privilege('anon', 'public.cs_bio_clicks', 'select,insert,update,delete,truncate')
  and not has_table_privilege('authenticated', 'public.cs_bio_pages', 'insert,update,delete,truncate')
  and not has_table_privilege('authenticated', 'public.cs_bio_clicks', 'insert,update,delete,truncate')
  and has_table_privilege('authenticated', 'public.cs_bio_pages', 'select'),
  '0.1 anon holds nothing; authenticated may only select');
select public.cs_test_assert(
  not has_function_privilege('anon', 'public.cs_save_bio_page(text, text, text, text, text, jsonb, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.cs_delete_bio_page(text)', 'execute')
  and not has_function_privilege('anon', 'public.cs_bio_page_public(text)', 'execute')
  and not has_function_privilege('anon', 'public.cs_bio_click(text, uuid, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.cs_bio_page_public(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.cs_bio_click(text, uuid, boolean)', 'execute')
  and has_function_privilege('service_role', 'public.cs_bio_page_public(text)', 'execute')
  and has_function_privilege('service_role', 'public.cs_bio_click(text, uuid, boolean)', 'execute'),
  '0.2 anon executes nothing; the public functions are service_role only');
select public.cs_test_assert(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('cs_save_bio_page', 'cs_delete_bio_page', 'cs_bio_page_public', 'cs_bio_click')),
  '0.3 every function is SECURITY DEFINER with search_path pinned');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select public.cs_test_expect_error($$select count(*) from public.cs_bio_pages$$,
  '%permission denied%', '0.4 anon cannot read pages');
select public.cs_test_expect_error($$select count(*) from public.cs_bio_clicks$$,
  '%permission denied%', '0.5 anon cannot read clicks');
select public.cs_test_expect_error($$select public.cs_bio_page_public('ada-tan')$$,
  '%permission denied%', '0.6 anon cannot call the page reader');
select public.cs_test_expect_error($$select public.cs_bio_click('ada-tan', gen_random_uuid())$$,
  '%permission denied%', '0.7 anon cannot call the click counter');
reset role;

-- ---------------------------------------------------------------------------
-- 1. A builds a page
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000e1","role":"authenticated"}';

select set_config('cs_test.page', public.cs_save_bio_page(
  'me', '  Ada-Tan ', E'  Ada\tTan  ', 'Financial adviser, Singapore',
  'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
  '[{"label":"  Book a call ","url":"https://calendly.com/ada"},
    {"label":"WhatsApp me","url":"https://wa.me/6591234567?text=Hi"}]'::jsonb
)::text, true);

select public.cs_test_assert(
  (select slug = 'ada-tan' and display_name = 'Ada Tan' and published
     and jsonb_array_length(links) = 2
     and links -> 0 ->> 'label' = 'Book a call'
     and (links -> 0 ->> 'id') ~ '^[0-9a-f-]{36}$'
   from public.cs_bio_pages),
  '1.1 slug lowercased, name and labels cleaned, every link gets an id');
select set_config('cs_test.link_1', (select links -> 0 ->> 'id' from public.cs_bio_pages), true);
select set_config('cs_test.link_2', (select links -> 1 ->> 'id' from public.cs_bio_pages), true);

select public.cs_test_expect_error($$select public.cs_save_bio_page('me', 'ab', 'Ada', '', null, '[]')$$,
  '%3 to 40 lowercase%', '1.2 a 2-character slug is refused');
select public.cs_test_expect_error($$select public.cs_save_bio_page('me', '-ada', 'Ada', '', null, '[]')$$,
  '%3 to 40 lowercase%', '1.3 a slug starting with a hyphen is refused');
select public.cs_test_expect_error($$select public.cs_save_bio_page('me', 'ada tan', 'Ada', '', null, '[]')$$,
  '%3 to 40 lowercase%', '1.4 a slug with a space is refused');
select public.cs_test_expect_error($$select public.cs_save_bio_page('me', 'ada_tan', 'Ada', '', null, '[]')$$,
  '%3 to 40 lowercase%', '1.5 a slug with an underscore is refused');
select public.cs_test_expect_error($$select public.cs_save_bio_page('ME!', 'ada-tan', 'Ada', '', null, '[]')$$,
  '%valid id%', '1.6 a malformed profile id is refused');
select public.cs_test_expect_error($$select public.cs_save_bio_page('me', 'ada-tan', '  ', '', null, '[]')$$,
  '%Add your name%', '1.7 a blank name is refused');
select public.cs_test_expect_error($$select public.cs_save_bio_page('me', 'ada-tan', 'Ada', '', 'data:image/svg+xml;base64,PHN2Zz4=', '[]')$$,
  '%PNG, JPEG or WebP%', '1.8 an SVG photo is refused');
select public.cs_test_expect_error($$select public.cs_save_bio_page('me', 'ada-tan', 'Ada', '', 'https://example.com/me.jpg', '[]')$$,
  '%PNG, JPEG or WebP%', '1.9 a photo URL is refused (data URLs only)');
select public.cs_test_expect_error($$select public.cs_save_bio_page('me', 'ada-tan', 'Ada', '', null, '{"a":1}')$$,
  '%up to 20 links%', '1.10 links must be an array');
select public.cs_test_expect_error($$select public.cs_save_bio_page('me', 'ada-tan', 'Ada', '', null, '["x"]')$$,
  '%malformed%', '1.11 each link must be an object');
select public.cs_test_expect_error(
  format('select public.cs_save_bio_page(%L, %L, %L, %L, null, %L)', 'me', 'ada-tan', 'Ada', '',
    (select jsonb_agg(jsonb_build_object('label', 'L' || g, 'url', 'https://example.com/' || g)) from generate_series(1, 21) g)),
  '%up to 20 links%', '1.12 21 links refused');
select public.cs_test_expect_error($$select public.cs_save_bio_page('me', 'ada-tan', 'Ada', '', null, '[{"label":" ","url":"https://example.com"}]')$$,
  '%label of up to 60%', '1.13 a blank label refused');
select public.cs_test_expect_error(
  format('select public.cs_save_bio_page(%L, %L, %L, %L, null, %L)', 'me', 'ada-tan', 'Ada', '',
    jsonb_build_array(jsonb_build_object('label', repeat('x', 61), 'url', 'https://example.com'))),
  '%label of up to 60%', '1.14 a 61-character label refused');

select public.cs_test_expect_error($$select public.cs_test_save_url('javascript:alert(1)')$$,
  '%starting with https%', '1.15 javascript: refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('JavaScript://example.com/%0Aalert(1)')$$,
  '%starting with https%', '1.16 javascript:// refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('data:text/html,<script>alert(1)</script>')$$,
  '%starting with https%', '1.17 data: refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('https://bank.com@evil.example/login')$$,
  '%starting with https%', '1.18 a user@host URL refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('https://exa mple.com')$$,
  '%starting with https%', '1.19 a URL with a space refused');
select public.cs_test_expect_error($$select public.cs_test_save_url(E'https://example.com/\nx')$$,
  '%starting with https%', '1.20 a URL with a newline refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('ftp://example.com')$$,
  '%starting with https%', '1.21 ftp refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('//example.com')$$,
  '%starting with https%', '1.22 a scheme-relative URL refused');
select public.cs_test_expect_error(format('select public.cs_test_save_url(%L)', 'https://example.com/' || repeat('a', 2030)),
  '%starting with https%', '1.23 a URL over 2,048 characters refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('https://example.com\@evil.example/')$$,
  '%starting with https%', '1.23b a backslash after the host refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('https://example.com\evil.example')$$,
  '%starting with https%', '1.23c a backslash in the host refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('https://exa_mple.com/')$$,
  '%starting with https%', '1.23d a host with an underscore refused');
select public.cs_test_expect_error($$select public.cs_test_save_url('https://bücher.example/')$$,
  '%starting with https%', '1.23e a non-ASCII host refused (punycode works)');
select public.cs_test_expect_error($$select public.cs_test_save_url('https://example.com:123456/')$$,
  '%starting with https%', '1.23f a 6-digit port refused');
select public.cs_test_save_url('https://xn--bcher-kva.example:8443/a?b=c#d');
select public.cs_test_save_url('https://example.com');
select public.cs_test_save_url('HTTP://Example.com/path?q=1#top');
select public.cs_test_expect_error($$select public.cs_save_bio_page('me', 'admin', 'Ada', '', null, '[]')$$,
  '%reserved%', '1.23g admin is reserved');
select public.cs_test_expect_error($$select public.cs_save_bio_page('me', 'Review', 'Ada', '', null, '[]')$$,
  '%reserved%', '1.23h review is reserved');
select public.cs_test_expect_error($$select public.cs_save_bio_page('me', 'team', 'Ada', '', null, '[]')$$,
  '%reserved%', '1.23i app routes are reserved');
select public.cs_test_expect_error(format('select public.cs_save_bio_page(%L, %L, %L, %L, null, %L)', 'me', 'ada-tan', repeat(' ', 401) || 'Ada', '', '[]'),
  '%far too long%', '1.23j an oversized raw name is refused before normalising');

-- Put the real page back (the URL checks above replaced its links).
select public.cs_save_bio_page('me', 'ada-tan', 'Ada Tan', 'Financial adviser, Singapore',
  'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
  jsonb_build_array(
    jsonb_build_object('id', current_setting('cs_test.link_1'), 'label', 'Book a call', 'url', 'https://calendly.com/ada'),
    jsonb_build_object('id', current_setting('cs_test.link_2'), 'label', 'WhatsApp me', 'url', 'https://wa.me/6591234567?text=Hi'),
    jsonb_build_object('id', current_setting('cs_test.link_2'), 'label', 'Dup id', 'url', 'https://example.com/dup'),
    jsonb_build_object('id', 'not-a-uuid', 'label', 'Bad id', 'url', 'https://example.com/bad')));
select public.cs_test_assert(
  (select links -> 0 ->> 'id' = current_setting('cs_test.link_1')
     and links -> 1 ->> 'id' = current_setting('cs_test.link_2')
     and links -> 2 ->> 'id' <> current_setting('cs_test.link_2')
     and (links -> 3 ->> 'id') ~ '^[0-9a-f-]{36}$'
   from public.cs_bio_pages),
  '1.24 ids sent back are kept; repeated or malformed ids are replaced');

-- ---------------------------------------------------------------------------
-- 2. Another adviser
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000e2","role":"authenticated"}';
select public.cs_test_expect_error($$select public.cs_save_bio_page('me', 'ADA-TAN', 'Not Ada', '', null, '[]')$$,
  '%address is taken%', '2.1 a slug in use cannot be taken');
select public.cs_test_assert((select count(*) from public.cs_bio_pages) = 0,
  '2.2 another adviser reads none of A''s pages');
select public.cs_test_assert(public.cs_delete_bio_page('me') = false,
  '2.3 another adviser''s delete touches nothing of A''s');
select public.cs_test_expect_error($$select public.cs_bio_page_public('ada-tan')$$,
  '%permission denied%', '2.4 a signed-in user cannot call the page reader');
select public.cs_test_expect_error($$select public.cs_bio_click('ada-tan', gen_random_uuid())$$,
  '%permission denied%', '2.5 a signed-in user cannot call the click counter');
select public.cs_test_expect_error(
  format('update public.cs_bio_pages set display_name = %L', 'Hacked'),
  '%permission denied%', '2.6 pages cannot be written directly');
select public.cs_test_expect_error(
  format('insert into public.cs_bio_clicks (page_id, link_id, day, count) values (gen_random_uuid(), gen_random_uuid(), current_date, 99)'),
  '%permission denied%', '2.7 click counts cannot be written directly');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Visitors (service_role, as the edge function calls it)
-- ---------------------------------------------------------------------------

set local role service_role;

select public.cs_test_assert(
  (select v ->> 'display_name' = 'Ada Tan' and v ->> 'slug' = 'ada-tan'
     and v ->> 'photo' like 'data:image/jpeg;base64,%'
     and jsonb_array_length(v -> 'links') = 4
     and v -> 'links' -> 0 ->> 'label' = 'Book a call'
     and v -> 'links' -> 0 ->> 'id' = current_setting('cs_test.link_1')
     and not (v -> 'links' -> 0 ? 'url')
     and not (v ? 'owner_id') and not (v ? 'id') and not (v ? 'profile_id')
   from (select public.cs_bio_page_public('Ada-Tan') v) x),
  '3.1 the public page has name, photo and link labels, and no URLs or account ids');
select public.cs_test_assert(public.cs_bio_page_public('nobody-here') is null,
  '3.2 an unknown slug shows nothing');

select public.cs_test_assert(
  public.cs_bio_click('ada-tan', current_setting('cs_test.link_1')::uuid) = 'https://calendly.com/ada',
  '3.3 a click returns the stored URL');
select public.cs_bio_click('ada-tan', current_setting('cs_test.link_1')::uuid);
select public.cs_bio_click('ada-tan', current_setting('cs_test.link_1')::uuid, false);
select public.cs_test_assert(
  public.cs_bio_click('ada-tan', gen_random_uuid()) is null,
  '3.4 an unknown link id returns nothing');
select public.cs_test_assert(
  public.cs_bio_click('nobody-here', current_setting('cs_test.link_1')::uuid) is null,
  '3.5 a link id under the wrong slug returns nothing');
reset role;

select public.cs_test_assert(
  (select sum(count) from public.cs_bio_clicks) = 2,
  '3.6 two counted clicks; the bot click and the misses are not counted');

-- Daily cap: 5,000 per link per Singapore day.
update public.cs_bio_clicks set count = 4999 where link_id = current_setting('cs_test.link_1')::uuid;
set local role service_role;
select public.cs_bio_click('ada-tan', current_setting('cs_test.link_1')::uuid);
select public.cs_test_assert(
  public.cs_bio_click('ada-tan', current_setting('cs_test.link_1')::uuid) = 'https://calendly.com/ada',
  '3.7 past the cap the redirect still works');
reset role;
select public.cs_test_assert(
  (select count from public.cs_bio_clicks where link_id = current_setting('cs_test.link_1')::uuid) = 5000,
  '3.8 counting stops at 5,000 a day');
select public.cs_test_assert(
  (select day from public.cs_bio_clicks limit 1) = (now() at time zone 'Asia/Singapore')::date,
  '3.9 clicks are counted by Singapore day');

-- ---------------------------------------------------------------------------
-- 4. Owner reads counts; unpublish; page cap; delete
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000e2","role":"authenticated"}';
select public.cs_test_assert((select count(*) from public.cs_bio_clicks) = 0,
  '4.1 another adviser reads none of A''s clicks');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000e1","role":"authenticated"}';
select public.cs_test_assert((select sum(count) from public.cs_bio_clicks) = 5000,
  '4.2 the owner reads their click counts');

select public.cs_save_bio_page('me', 'ada-tan', 'Ada Tan', '', null,
  jsonb_build_array(jsonb_build_object('id', current_setting('cs_test.link_1'), 'label', 'Book a call', 'url', 'https://calendly.com/ada')),
  false);
reset role;
set local role service_role;
select public.cs_test_assert(public.cs_bio_page_public('ada-tan') is null,
  '4.3 an unpublished page shows nothing');
select public.cs_test_assert(public.cs_bio_click('ada-tan', current_setting('cs_test.link_1')::uuid) is null,
  '4.4 an unpublished page''s links do not redirect');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000e1","role":"authenticated"}';
do $$
begin
  for i in 1..9 loop
    perform public.cs_save_bio_page('p' || i, 'ada-brand-' || i, 'Ada', '', null, '[]');
  end loop;
end $$;
select public.cs_test_expect_error($$select public.cs_save_bio_page('p10', 'ada-brand-10', 'Ada', '', null, '[]')$$,
  '%10 link-in-bio pages%', '4.5 an 11th page is refused');
select public.cs_test_assert(
  (select slug from public.cs_save_bio_page('p9', 'ada-brand-nine', 'Ada', '', null, '[]')) = 'ada-brand-nine',
  '4.6 at the cap, an existing page can still be edited (and renamed)');

select public.cs_test_assert(public.cs_delete_bio_page('me') = true, '4.7 the owner deletes a page');
select public.cs_test_assert(public.cs_delete_bio_page('me') = false, '4.8 deleting again finds nothing');
reset role;
select public.cs_test_assert(
  (select count(*) from public.cs_bio_clicks) = 0 and (select count(*) from public.cs_bio_pages where slug = 'ada-tan') = 0,
  '4.9 deleting a page removes its click counts');

-- ---------------------------------------------------------------------------
-- 5. Released slugs are held for 30 days
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000e2","role":"authenticated"}';
select public.cs_test_expect_error($$select public.cs_save_bio_page('me', 'ada-tan', 'Not Ada', '', null, '[]')$$,
  '%in use recently%', '5.1 a deleted page''s slug is held from others');
select public.cs_test_expect_error($$select public.cs_save_bio_page('me', 'ada-brand-9', 'Not Ada', '', null, '[]')$$,
  '%in use recently%', '5.2 a renamed page''s old slug is held from others');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000e1","role":"authenticated"}';
select public.cs_test_assert(
  (select slug from public.cs_save_bio_page('p9', 'ada-brand-9', 'Ada', '', null, '[]')) = 'ada-brand-9',
  '5.3 the owner can take their own released slug back');
reset role;
update public.cs_bio_slug_holds set released_at = now() - interval '31 days' where slug = 'ada-tan';

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000e2","role":"authenticated"}';
select public.cs_test_assert(
  (select slug from public.cs_save_bio_page('me', 'ada-tan', 'Someone else', '', null, '[]')) = 'ada-tan',
  '5.4 after 30 days the slug is free again');
select public.cs_test_expect_error($$select count(*) from public.cs_bio_slug_holds$$,
  '%permission denied%', '5.5 nobody client-side reads the holds');
reset role;

-- ---------------------------------------------------------------------------

do $$ begin raise notice 'link-in-bio tests: all passed'; end $$;
drop function public.cs_test_save_url(text);
drop function public.cs_test_expect_error(text, text, text);
drop function public.cs_test_assert(boolean, text);

rollback;
