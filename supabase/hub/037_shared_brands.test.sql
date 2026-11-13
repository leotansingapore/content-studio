-- Tests for 037_shared_brands.sql. Run AFTER 037 is applied, as the migration owner, on a throwaway or local
-- database:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/037_shared_brands.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. Never run it through the Management API (it does not honour
-- the rollback). A failed check raises "FAIL <n> ..." and aborts. A clean run ends with NOTICE "shared brand tests:
-- all passed".
--
-- People: A owns brand P (profile pabc1, in A's brand list), A's default brand "me", and brand G (profile pgone1, NOT
-- in A's list: removed on one of A's devices). M is a member of P, "me" and G. R was a member of P and was removed.
-- S is a stranger. I is invited by email.

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
grant execute on function public.cs_test_assert(boolean, text), public.cs_test_expect_error(text, text, text)
  to anon, authenticated, service_role;

-- as one account, for the statements that follow (until reset role)
create function public.cs_test_as(p_uid uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true)
$$;
grant execute on function public.cs_test_as(uuid) to anon, authenticated, service_role;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'cs-test-owner@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'cs-test-member@example.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'cs-test-removed@example.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'cs-test-stranger@example.test'),
  ('00000000-0000-0000-0000-0000000000a5', 'CS-Test-Invitee@Example.test');

insert into public.cs_user_data (user_id, key, data, updated_at) values
  -- A's brand list holds pabc1 but not pgone1
  ('00000000-0000-0000-0000-0000000000a1', 'content-studio-profiles-00000000-0000-0000-0000-0000000000a1',
   '[{"id":"me","name":"Acme"},{"id":"pabc1","name":"Acme Two"}]', '2026-11-01T00:00:00Z'),
  -- brand P: shared keys, a read-only key, a credential, and a key off the list
  ('00000000-0000-0000-0000-0000000000a1', 'content-studio-drafts-00000000-0000-0000-0000-0000000000a1~pabc1',
   '[{"id":"d1","draft":"one"},{"id":"d2","draft":"held","zernio":{"postId":"z1","status":"scheduled"}},{"id":"d3","draft":"gone","zernio":{"postId":"z3","status":"published"}}]',
   '2026-11-01T00:00:00Z'),
  ('00000000-0000-0000-0000-0000000000a1', 'content-studio-plan-00000000-0000-0000-0000-0000000000a1~pabc1',
   '{"week":"plan v1"}', '2026-11-01T00:00:00Z'),
  ('00000000-0000-0000-0000-0000000000a1', 'content-studio-carousel-brand-00000000-0000-0000-0000-0000000000a1~pabc1',
   '{"name":"Acme Two","profession":"baker"}', '2026-11-01T00:00:00Z'),
  ('00000000-0000-0000-0000-0000000000a1', 'content-studio-mcplink-00000000-0000-0000-0000-0000000000a1~pabc1',
   '{"token":"secret"}', '2026-11-01T00:00:00Z'),
  ('00000000-0000-0000-0000-0000000000a1', 'content-studio-zernio-outbox-00000000-0000-0000-0000-0000000000a1~pabc1',
   '{"ops":[]}', '2026-11-01T00:00:00Z'),
  -- another brand of A's, never shared
  ('00000000-0000-0000-0000-0000000000a1', 'content-studio-plan-00000000-0000-0000-0000-0000000000a1~pother9',
   '{"week":"private"}', '2026-11-01T00:00:00Z'),
  -- the default brand's posts, next to the account's own keys that end in the same bare id
  ('00000000-0000-0000-0000-0000000000a1', 'content-studio-drafts-00000000-0000-0000-0000-0000000000a1',
   '[{"id":"m1","draft":"me post"}]', '2026-11-01T00:00:00Z'),
  ('00000000-0000-0000-0000-0000000000a1', 'content-studio-onboarded-00000000-0000-0000-0000-0000000000a1',
   '"1"', '2026-11-01T00:00:00Z'),
  ('00000000-0000-0000-0000-0000000000a1', 'content-studio-tombstones-00000000-0000-0000-0000-0000000000a1',
   '[{"id":"content-studio-old-x","at":"2026-10-01T00:00:00.000Z"}]', '2026-11-01T00:00:00Z'),
  ('00000000-0000-0000-0000-0000000000a1', 'content-studio-mcplink-00000000-0000-0000-0000-0000000000a1',
   '{"token":"secret-me"}', '2026-11-01T00:00:00Z'),
  -- brand G (removed from A's list)
  ('00000000-0000-0000-0000-0000000000a1', 'content-studio-plan-00000000-0000-0000-0000-0000000000a1~pgone1',
   '{"week":"gone"}', '2026-11-01T00:00:00Z');

insert into public.cs_brands (id, owner_id, profile_id, name) values
  ('00000000-0000-0000-0000-00000000b0b1', '00000000-0000-0000-0000-0000000000a1', 'pabc1', 'Acme Two'),
  ('00000000-0000-0000-0000-00000000b0b2', '00000000-0000-0000-0000-0000000000a1', 'me', 'Acme'),
  ('00000000-0000-0000-0000-00000000b0b3', '00000000-0000-0000-0000-0000000000a1', 'pgone1', 'Gone');
insert into public.cs_brand_members (brand_id, member_id) values
  ('00000000-0000-0000-0000-00000000b0b1', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-00000000b0b2', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-00000000b0b3', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-00000000b0b1', '00000000-0000-0000-0000-0000000000a3');
insert into public.cs_subscriptions (user_id, email, status) values
  ('00000000-0000-0000-0000-0000000000a1', 'cs-test-owner@example.test', 'active');

-- 1-4: the shape: RLS on, no grant to anon or authenticated on any table, a profile id has to be "me" or p + base 36
select public.cs_test_assert(
  (select bool_and(c.relrowsecurity) from pg_class c
   where c.oid in ('public.cs_brands'::regclass, 'public.cs_brand_members'::regclass, 'public.cs_brand_invites'::regclass,
                   'public.cs_brand_edits'::regclass)),
  '1 every table has RLS on');
select public.cs_test_assert(
  not exists (
    select 1 from unnest(array['cs_brands', 'cs_brand_members', 'cs_brand_invites', 'cs_brand_edits']) t,
                  unnest(array['anon', 'authenticated']) r,
                  unnest(array['select', 'insert', 'update', 'delete']) p
    where has_table_privilege(r, 'public.' || t, p)),
  '2 anon and authenticated hold no grant on any table');
select public.cs_test_expect_error(
  $$insert into public.cs_brands (owner_id, profile_id, name) values ('00000000-0000-0000-0000-0000000000a1', 'p_x%', 'X')$$,
  '%violates check constraint%', '3 a profile id with a wildcard is refused');
select public.cs_test_expect_error(
  $$insert into public.cs_brands (owner_id, profile_id, name) values ('00000000-0000-0000-0000-0000000000a1', 'pabc1', 'Again')$$,
  '%duplicate key%', '4 a brand is shared once per owner');

-- 5-7: who may run what. Anon runs nothing; authenticated runs the member-facing functions only, never the invite
-- functions or the helpers; the service role runs the invite functions.
select public.cs_test_assert(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'cs_try_jsonb', 'cs_brand_keys', 'cs_brand_live', 'cs_brand_reach', 'cs_held_changed', 'cs_unsafe_link',
      'cs_my_brands', 'cs_brand_rows', 'cs_brand_swap', 'cs_brand_drop', 'cs_brand_team', 'cs_brand_accept',
      'cs_brand_remove', 'cs_brand_revoke', 'cs_brand_leave', 'cs_brand_forget', 'cs_brand_invite',
      'cs_brand_invite_open', 'cs_member_owner_rows')
      and has_function_privilege('anon', p.oid, 'execute')),
  '5 anon may run none of the functions');
select public.cs_test_assert(
  (select count(*) = 10 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
     and p.proname in ('cs_my_brands', 'cs_brand_rows', 'cs_brand_swap', 'cs_brand_drop', 'cs_brand_team',
                       'cs_brand_accept', 'cs_brand_remove', 'cs_brand_revoke', 'cs_brand_leave', 'cs_brand_forget'))
  and not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
      and p.proname in ('cs_try_jsonb', 'cs_brand_keys', 'cs_brand_live', 'cs_brand_reach', 'cs_held_changed',
                        'cs_unsafe_link', 'cs_brand_invite', 'cs_brand_invite_open', 'cs_member_owner_rows')),
  '6 authenticated runs the ten member-facing functions and nothing else of 037');
select public.cs_test_assert(
  (select count(*) = 3 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('service_role', p.oid, 'execute')
     and p.proname in ('cs_brand_invite', 'cs_brand_invite_open', 'cs_member_owner_rows')),
  '7 the service role runs the invite functions');

-- 8-17: a member reads exactly the brand's allow-listed keys, of a live brand only
set local role authenticated;
select public.cs_test_as('00000000-0000-0000-0000-0000000000a2');
select public.cs_test_assert(
  (select array_agg(profile_id || ':' || role order by profile_id) = array['me:member', 'pabc1:member']
   from public.cs_my_brands()),
  '8 a member is listed on the live brands only, not on the one removed from the owner''s list');
select public.cs_test_assert(
  (select array_agg(key order by key) from public.cs_brand_rows('00000000-0000-0000-0000-00000000b0b1'))
  = array['content-studio-carousel-brand-00000000-0000-0000-0000-0000000000a1~pabc1',
          'content-studio-drafts-00000000-0000-0000-0000-0000000000a1~pabc1',
          'content-studio-plan-00000000-0000-0000-0000-0000000000a1~pabc1'],
  '9 a member reads the brand''s shared keys and the read-only brand kit: no Connect Claude link, no outbox, no other brand');
select public.cs_test_assert(
  (select array_agg(key order by key) from public.cs_brand_rows('00000000-0000-0000-0000-00000000b0b2'))
  = array['content-studio-drafts-00000000-0000-0000-0000-0000000000a1'],
  '10 the default brand gives its posts only: never the account''s own keys under the same bare id');
select public.cs_test_assert(
  (select count(*) = 1 from public.cs_brand_rows('00000000-0000-0000-0000-00000000b0b1',
     array['content-studio-plan-00000000-0000-0000-0000-0000000000a1~pabc1',
           'content-studio-mcplink-00000000-0000-0000-0000-0000000000a1~pabc1'])),
  '11 asking for named keys never adds one off the list');
select public.cs_test_expect_error(
  $$select * from public.cs_brand_rows('00000000-0000-0000-0000-00000000b0b3')$$,
  '%not_on_brand%', '12 a brand gone from the owner''s list can''t be reached, though the membership row is there');
select public.cs_test_assert(
  not exists (select 1 from public.cs_user_data where user_id = '00000000-0000-0000-0000-0000000000a1'),
  '13 the owner''s rows stay closed to a member through cs_user_data''s own unchanged policy');
select public.cs_test_assert(
  (select count(*) = 0 from public.cs_user_data where key like 'content-studio-plan-%~pabc1'),
  '14 even the shared keys are reached only through the functions');
select public.cs_test_expect_error(
  $$select * from public.cs_brand_invite_open(repeat('a', 64))$$, '%permission denied%', '15 a member can''t look invites up');
select public.cs_test_expect_error(
  $$select public.cs_brand_invite('00000000-0000-0000-0000-00000000b0b1', '00000000-0000-0000-0000-0000000000a1', 'x@example.test', repeat('b', 64), now() + interval '7 days')$$,
  '%permission denied%', '16 a member can''t file an invite in the owner''s name');
select public.cs_test_expect_error(
  $$select * from public.cs_member_owner_rows('00000000-0000-0000-0000-0000000000a2')$$, '%permission denied%',
  '17 a member can''t read the owners'' subscription rows');

-- 18-26: a member's writes: compare-and-set, the read-write list only, and nothing a browser would run
select public.cs_test_assert(
  public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b1', 'content-studio-plan-00000000-0000-0000-0000-0000000000a1~pabc1',
    '{"week":"plan v2"}', now(), '2026-11-01T00:00:00Z') > '2026-11-01T00:00:00Z',
  '18 a save on the stamp the member last saw lands and returns a newer stamp');
select public.cs_test_assert(
  public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b1', 'content-studio-plan-00000000-0000-0000-0000-0000000000a1~pabc1',
    '{"week":"stale"}', now(), '2026-11-01T00:00:00Z') is null
  and (select data from public.cs_brand_rows('00000000-0000-0000-0000-00000000b0b1', array['content-studio-plan-00000000-0000-0000-0000-0000000000a1~pabc1'])) = '{"week":"plan v2"}',
  '19 a save on an old stamp is refused and changes nothing');
select public.cs_test_assert(
  public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b1', 'content-studio-calnotes-00000000-0000-0000-0000-0000000000a1~pabc1',
    '[{"id":"n1"}]', now(), null) is not null
  and public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b1', 'content-studio-calnotes-00000000-0000-0000-0000-0000000000a1~pabc1',
    '[{"id":"n2"}]', now(), null) is null,
  '20 a new key is made once; a second "no row yet" save is a conflict, never an overwrite');
select public.cs_test_assert(
  public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b2', 'content-studio-drafts-00000000-0000-0000-0000-0000000000a1',
    '[{"id":"m1","draft":"me post, edited"}]', now(), '2026-11-01T00:00:00Z') is not null,
  '21 a member edits the default brand''s posts');
select public.cs_test_expect_error(
  $$select public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b1', 'content-studio-carousel-brand-00000000-0000-0000-0000-0000000000a1~pabc1', '{"profession":"spammer"}', now(), '2026-11-01T00:00:00Z')$$,
  '%key_not_shared%', '22 the brand kit is read-only for a member (the owner''s unattended campaigns read it)');
select public.cs_test_expect_error(
  $$select public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b1', 'content-studio-mcplink-00000000-0000-0000-0000-0000000000a1~pabc1', '{}', now(), '2026-11-01T00:00:00Z')$$,
  '%key_not_shared%', '23a a member can''t write the Connect Claude link');
select public.cs_test_expect_error(
  $$select public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b2', 'content-studio-tombstones-00000000-0000-0000-0000-0000000000a1', '[]', now(), '2026-11-01T00:00:00Z')$$,
  '%key_not_shared%', '23b nor the owner''s tombstone list, even through the default brand');
select public.cs_test_expect_error(
  $$select public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b1', 'content-studio-plan-00000000-0000-0000-0000-0000000000a1~pother9', '{}', now(), '2026-11-01T00:00:00Z')$$,
  '%key_not_shared%', '23c nor another brand''s key');
select public.cs_test_expect_error(
  $$select public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b1', 'content-studio-zernio-outbox-00000000-0000-0000-0000-0000000000a1~pabc1', '{"ops":[]}', now(), '2026-11-01T00:00:00Z')$$,
  '%key_not_shared%', '23d nor the Zernio outbox the owner''s device sends');
select public.cs_test_expect_error(
  $$select public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b1', 'content-studio-goals-00000000-0000-0000-0000-0000000000a1~pabc1', 'not json', now(), null)$$,
  '%not_json%', '24a a save must be JSON');
select public.cs_test_expect_error(
  $$select public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b1', 'content-studio-goals-00000000-0000-0000-0000-0000000000a1~pabc1', '"' || repeat('x', 500001) || '"', now(), null)$$,
  '%too_big%', '24b a key other than posts holds at most 500,000 characters');
select public.cs_test_expect_error(
  $$select public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b1', 'content-studio-goals-00000000-0000-0000-0000-0000000000a1~pabc1', '{"links":[{"url":" JavaScript:alert(1)"}]}', now(), null)$$,
  '%unsafe_link%', '25a a javascript: link is refused');
select public.cs_test_expect_error(
  $$select public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b1', 'content-studio-goals-00000000-0000-0000-0000-0000000000a1~pabc1', '{"u":"java\tscr\nipt:alert(1)"}', now(), null)$$,
  '%unsafe_link%', '25b so is one split by a tab and a line break');
select public.cs_test_expect_error(
  $$select public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b1', 'content-studio-goals-00000000-0000-0000-0000-0000000000a1~pabc1', '{"u":"vbscript:x"}', now(), null)$$,
  '%unsafe_link%', '25c and one spelled with a JSON escape');
select public.cs_test_assert(
  public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b1', 'content-studio-goals-00000000-0000-0000-0000-0000000000a1~pabc1',
    '{"text":"Learn javascript: the good parts","u":"https://example.test"}', now(), null) is not null,
  '26 the words "javascript:" inside a sentence are fine');

-- 27-28: stamps never run ahead of the server's clock and never go backwards
select public.cs_test_assert(
  public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b1', 'content-studio-ideas-00000000-0000-0000-0000-0000000000a1~pabc1',
    '[]', '2099-01-01T00:00:00Z', null) <= now() + interval '1 minute',
  '27 a stamp from the future is held to a minute ahead');
select public.cs_test_assert(
  (select public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b1', r.key, '{"week":"plan v3"}', '2000-01-01T00:00:00Z', r.updated_at) > r.updated_at
   from public.cs_brand_rows('00000000-0000-0000-0000-00000000b0b1', array['content-studio-plan-00000000-0000-0000-0000-0000000000a1~pabc1']) r),
  '28 a back-dated save still gets a stamp after the row''s, so the owner''s devices take it');

-- 29-32: a post Zernio holds is the owner's to change
select public.cs_test_expect_error(
  $$select public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b1', 'content-studio-drafts-00000000-0000-0000-0000-0000000000a1~pabc1', '[{"id":"d1","draft":"one"}]', now(), '2026-11-01T00:00:00Z')$$,
  '%held_post%', '29 a member can''t remove a post Zernio holds');
select public.cs_test_expect_error(
  $$select public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b1', 'content-studio-drafts-00000000-0000-0000-0000-0000000000a1~pabc1', '[{"id":"d1","draft":"one"},{"id":"d2","draft":"changed","zernio":{"postId":"z1","status":"scheduled"}}]', now(), '2026-11-01T00:00:00Z')$$,
  '%held_post%', '30 nor change its words');
select public.cs_test_assert(
  public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b1', 'content-studio-drafts-00000000-0000-0000-0000-0000000000a1~pabc1',
    '[{"id":"d0","draft":"new"},{"draft":"held","zernio":{"status":"scheduled","postId":"z1"},"id":"d2"},{"id":"d1","draft":"one, edited"}]',
    now(), '2026-11-01T00:00:00Z') is not null,
  '31 adding and editing other posts, and removing a published one, is fine with the held post kept as it was');
select public.cs_test_expect_error(
  $$select public.cs_brand_drop('00000000-0000-0000-0000-00000000b0b1', r.key, r.updated_at) from public.cs_brand_rows('00000000-0000-0000-0000-00000000b0b1', array['content-studio-drafts-00000000-0000-0000-0000-0000000000a1~pabc1']) r$$,
  '%held_post%', '32 the posts list can''t be removed while it holds one');

-- 33-35: removing a key: compare-and-set, and onto the owner's tombstone list
select public.cs_test_assert(
  public.cs_brand_drop('00000000-0000-0000-0000-00000000b0b1', 'content-studio-plan-00000000-0000-0000-0000-0000000000a1~pabc1',
    '2026-11-01T00:00:00Z') = false,
  '33 a removal on an old stamp is refused');
select public.cs_test_assert(
  (select public.cs_brand_drop('00000000-0000-0000-0000-00000000b0b1', r.key, r.updated_at)
   from public.cs_brand_rows('00000000-0000-0000-0000-00000000b0b1', array['content-studio-plan-00000000-0000-0000-0000-0000000000a1~pabc1']) r),
  '34a a removal on the current stamp goes through');
-- its own statement: a stable function sees the snapshot its statement started with
select public.cs_test_assert(
  not exists (select 1 from public.cs_brand_rows('00000000-0000-0000-0000-00000000b0b1', array['content-studio-plan-00000000-0000-0000-0000-0000000000a1~pabc1'])),
  '34b and the key is gone');
reset role;
select public.cs_test_assert(
  (select (d.data::jsonb -> 0 ->> 'id') = 'content-studio-plan-00000000-0000-0000-0000-0000000000a1~pabc1'
      and (d.data::jsonb -> 0 ->> 'was') is not null
      and (d.data::jsonb -> 1 ->> 'id') = 'content-studio-old-x'
      and d.updated_at > '2026-11-01T00:00:00Z'
   from public.cs_user_data d where d.key = 'content-studio-tombstones-00000000-0000-0000-0000-0000000000a1'),
  '35 the removal is first on the owner''s tombstone list, the old entries kept, the row stamped newer');
select public.cs_test_assert(
  (select count(*) = 6 from public.cs_brand_edits where member_id = '00000000-0000-0000-0000-0000000000a2'),
  '36 the member''s changes are on record, one row per brand and key');

-- 37-40: the team as each side sees it, and owner-only actions
set local role authenticated;
select public.cs_test_as('00000000-0000-0000-0000-0000000000a2');
select public.cs_test_assert(
  (select array_agg(kind || ':' || email order by kind) from public.cs_brand_team('00000000-0000-0000-0000-00000000b0b1'))
  = array['member:cs-test-member@example.test', 'owner:cs-test-owner@example.test'],
  '37 a member sees the owner and themselves, not the other members or the invites');
select public.cs_test_expect_error(
  $$select public.cs_brand_remove('00000000-0000-0000-0000-00000000b0b1', '00000000-0000-0000-0000-0000000000a3')$$,
  '%not_owner%', '38 a member can''t remove anyone');
select public.cs_brand_forget('pabc1');
select public.cs_test_assert(
  exists (select 1 from public.cs_my_brands() where profile_id = 'pabc1'),
  '39 a member''s forget touches nothing: it only ever deletes the caller''s own brand rows');
select public.cs_test_expect_error(
  $$select public.cs_brand_revoke('00000000-0000-0000-0000-000000000000')$$, '%not_owner%', '40 a member can''t turn invites off');

-- 41-44: a removed member and a stranger reach nothing
reset role;
delete from public.cs_brand_members where member_id = '00000000-0000-0000-0000-0000000000a3';
set local role authenticated;
select public.cs_test_as('00000000-0000-0000-0000-0000000000a3');
select public.cs_test_assert(not exists (select 1 from public.cs_my_brands()), '41 a removed member is on no brand');
select public.cs_test_expect_error(
  $$select * from public.cs_brand_rows('00000000-0000-0000-0000-00000000b0b1')$$, '%not_on_brand%', '42a a removed member reads nothing');
select public.cs_test_expect_error(
  $$select public.cs_brand_swap('00000000-0000-0000-0000-00000000b0b1', 'content-studio-goals-00000000-0000-0000-0000-0000000000a1~pabc1', '{}', now(), null)$$,
  '%not_on_brand%', '42b nor writes');
select public.cs_test_as('00000000-0000-0000-0000-0000000000a4');
select public.cs_test_expect_error(
  $$select * from public.cs_brand_team('00000000-0000-0000-0000-00000000b0b1')$$, '%not_on_brand%', '43a a stranger sees no team');
select public.cs_test_expect_error(
  $$select public.cs_brand_drop('00000000-0000-0000-0000-00000000b0b1', 'content-studio-goals-00000000-0000-0000-0000-0000000000a1~pabc1', now())$$,
  '%not_on_brand%', '43b nor removes anything');
select public.cs_test_expect_error(
  $$select public.cs_brand_accept('not-a-real-token-but-long-enough')$$, '%invite_gone%', '44 a made-up token takes nothing');
reset role;

-- 45-46: a visitor reaches nothing at all
set local role anon;
select public.cs_test_expect_error($$select * from public.cs_brands$$, '%permission denied%', '45a a visitor reads no brands');
select public.cs_test_expect_error($$select * from public.cs_brand_invites$$, '%permission denied%', '45b nor invites');
select public.cs_test_expect_error($$select * from public.cs_my_brands()$$, '%permission denied%', '46a nor calls the member functions');
select public.cs_test_expect_error(
  $$select * from public.cs_brand_rows('00000000-0000-0000-0000-00000000b0b1')$$, '%permission denied%', '46b nor reads a brand''s rows');
reset role;

-- 47-53: invites, filed by the service role for an owner
set local role service_role;
select public.cs_test_expect_error(
  $$select public.cs_brand_invite('00000000-0000-0000-0000-00000000b0b1', '00000000-0000-0000-0000-0000000000a2', 'cs-test-invitee@example.test', repeat('1', 64), now() + interval '7 days')$$,
  '%not_owner%', '47 only the brand''s owner can invite');
select public.cs_test_expect_error(
  $$select public.cs_brand_invite('00000000-0000-0000-0000-00000000b0b1', '00000000-0000-0000-0000-0000000000a1', 'cs-test-owner@example.test', repeat('1', 64), now() + interval '7 days')$$,
  '%owner_self%', '48 an owner can''t invite themselves');
select public.cs_brand_invite('00000000-0000-0000-0000-00000000b0b1', '00000000-0000-0000-0000-0000000000a1',
  'cs-test-invitee@example.test', encode(sha256(convert_to('first-token-0123456789', 'UTF8')), 'hex'), now() + interval '7 days');
select public.cs_brand_invite('00000000-0000-0000-0000-00000000b0b1', '00000000-0000-0000-0000-0000000000a1',
  'cs-test-invitee@example.test', encode(sha256(convert_to('second-token-0123456789', 'UTF8')), 'hex'), now() + interval '7 days');
select public.cs_test_assert(
  (select count(*) = 1 from public.cs_brand_invites where email = 'cs-test-invitee@example.test' and revoked_at is null)
  and (select count(*) = 1 from public.cs_brand_invite_open(encode(sha256(convert_to('second-token-0123456789', 'UTF8')), 'hex')))
  and not exists (select 1 from public.cs_brand_invite_open(encode(sha256(convert_to('first-token-0123456789', 'UTF8')), 'hex'))),
  '49 inviting the same address again turns the first link off: only the newest works');
select public.cs_brand_invite('00000000-0000-0000-0000-00000000b0b2', '00000000-0000-0000-0000-0000000000a1',
  'cs-test-invitee@example.test', encode(sha256(convert_to('third-token-0123456789', 'UTF8')), 'hex'), now() + interval '7 days');
select public.cs_test_expect_error(
  $$select public.cs_brand_invite('00000000-0000-0000-0000-00000000b0b2', '00000000-0000-0000-0000-0000000000a1', 'cs-test-invitee@example.test', repeat('4', 64), now() + interval '7 days')$$,
  '%recipient_cap%', '50 one address gets 3 invites a day at most');
-- the owner already has M (a member) and the invitee (an open invite): 8 more fill the team
do $$ begin
  for i in 1..8 loop
    perform public.cs_brand_invite('00000000-0000-0000-0000-00000000b0b1', '00000000-0000-0000-0000-0000000000a1',
      'cs-test-filler-' || i || '@example.test', lpad(to_hex(i), 64, 'f'), now() + interval '7 days');
  end loop;
end $$;
select public.cs_test_expect_error(
  $$select public.cs_brand_invite('00000000-0000-0000-0000-00000000b0b2', '00000000-0000-0000-0000-0000000000a1', 'cs-test-eleventh@example.test', repeat('5', 64), now() + interval '7 days')$$,
  '%team_full%', '51 an owner has 10 people at most across every brand');
select public.cs_test_assert(
  public.cs_brand_invite('00000000-0000-0000-0000-00000000b0b2', '00000000-0000-0000-0000-0000000000a1',
    'cs-test-filler-1@example.test', repeat('6', 64), now() + interval '7 days') is not null,
  '52 someone already counted can be invited to another brand of the owner''s');
select public.cs_test_assert(
  (select count(*) = 2 and bool_and(status = 'active') from public.cs_member_owner_rows('00000000-0000-0000-0000-0000000000a2')),
  '53 the subscription row of a member''s owner, once per live brand they share (the removed brand is left out)');
reset role;

-- 54-55: the owner sees the whole team and turns an invite off
set local role authenticated;
select public.cs_test_as('00000000-0000-0000-0000-0000000000a1');
select public.cs_test_assert(
  (select count(*) filter (where kind = 'member') = 1 and count(*) filter (where kind = 'invite') = 9
     and bool_or(kind = 'member' and last_edit is not null)
   from public.cs_brand_team('00000000-0000-0000-0000-00000000b0b1')),
  '54 the owner sees every member with their last edit, and the open invites');
select public.cs_brand_revoke((select id from public.cs_brand_team('00000000-0000-0000-0000-00000000b0b1')
  where kind = 'invite' and email = 'cs-test-filler-2@example.test'));
select public.cs_test_assert(
  (select count(*) filter (where kind = 'invite') = 8 from public.cs_brand_team('00000000-0000-0000-0000-00000000b0b1')),
  '55 a revoked invite leaves the list');

-- 56-60: taking an invite
select public.cs_test_expect_error(
  $$select public.cs_brand_accept('second-token-0123456789')$$, '%owner_self%', '56 the owner can''t take an invite to their own brand');
select public.cs_test_as('00000000-0000-0000-0000-0000000000a4');
select public.cs_test_expect_error(
  $$select public.cs_brand_accept('second-token-0123456789')$$, '%wrong_account%', '57 an account under another email can''t use a forwarded link');
select public.cs_test_as('00000000-0000-0000-0000-0000000000a5');
select public.cs_test_expect_error(
  $$select public.cs_brand_accept('first-token-0123456789')$$, '%invite_gone%', '58 a link that was replaced is dead');
select public.cs_test_assert(
  public.cs_brand_accept('second-token-0123456789') = '00000000-0000-0000-0000-00000000b0b1',
  '59a the invited account (email case and spaces ignored) takes the invite');
select public.cs_test_assert(
  exists (select 1 from public.cs_my_brands() where profile_id = 'pabc1' and role = 'member'),
  '59b and is on the brand');
select public.cs_test_expect_error(
  $$select public.cs_brand_accept('second-token-0123456789')$$, '%invite_gone%', '60a a link works once');
reset role;
update public.cs_brand_invites set expires_at = now() - interval '1 second'
  where token_hash = encode(sha256(convert_to('third-token-0123456789', 'UTF8')), 'hex');
set local role authenticated;
select public.cs_test_as('00000000-0000-0000-0000-0000000000a5');
select public.cs_test_expect_error(
  $$select public.cs_brand_accept('third-token-0123456789')$$, '%invite_gone%', '60b an expired link is dead');

-- 61-62: leaving, and the owner removing a brand
select public.cs_brand_leave('00000000-0000-0000-0000-00000000b0b1');
select public.cs_test_assert(not exists (select 1 from public.cs_my_brands()), '61 a member who leaves is on no brand');
select public.cs_test_as('00000000-0000-0000-0000-0000000000a1');
select public.cs_brand_forget('pabc1');
select public.cs_test_as('00000000-0000-0000-0000-0000000000a2');
select public.cs_test_assert(
  (select array_agg(profile_id) = array['me'] from public.cs_my_brands()),
  '62 a brand the owner removes is gone for its members at once');
reset role;
select public.cs_test_assert(
  not exists (select 1 from public.cs_brand_members where brand_id = '00000000-0000-0000-0000-00000000b0b1')
  and not exists (select 1 from public.cs_brand_invites where brand_id = '00000000-0000-0000-0000-00000000b0b1')
  and exists (select 1 from public.cs_user_data where key = 'content-studio-drafts-00000000-0000-0000-0000-0000000000a1~pabc1'),
  '63 removing the share takes its members and invites, and leaves the owner''s data to the owner''s own removal');

-- 64: deleting the owner's account takes their brands
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';
select public.cs_test_assert(
  not exists (select 1 from public.cs_brands where owner_id = '00000000-0000-0000-0000-0000000000a1'),
  '64 a deleted owner leaves no brand behind');

do $$ begin raise notice 'shared brand tests: all passed'; end $$;

rollback;
