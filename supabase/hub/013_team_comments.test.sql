-- Tests for 013_team_comments.sql. Run AFTER 011 and 013 are applied, as the
-- migration owner:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/013_team_comments.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. A failed check raises
-- "FAIL <n> ..." and aborts. A clean run ends with NOTICE
-- "team comment tests: all passed".

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

grant execute on function public.cs_test_assert(boolean, text) to anon, authenticated;
grant execute on function public.cs_test_expect_error(text, text, text) to anon, authenticated;

-- L ...c1 leader of team A    M ...c2 member, the author    P ...c3 member
-- Q ...c4 member              O ...c5 outsider               B ...c6 leader of team B
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000', ('7e57c0de-0000-4000-8000-0000000000' || s)::uuid,
       'authenticated', 'authenticated', 'cs-test-' || s || '@example.test', '', now(), '{}', '{}', now(), now()
from unnest(array['c1', 'c2', 'c3', 'c4', 'c5', 'c6']) s;

-- ---------------------------------------------------------------------------
-- Setup: team A with L, M, P, Q; team B with B; M submits a draft
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c1","role":"authenticated"}';
select set_config('cs_test.team_a', public.cs_create_team('Agency A', 'Lee Leader')::text, true);
select set_config('cs_test.code_a', (select code from public.cs_team_invites where team_id = current_setting('cs_test.team_a')::uuid), true);

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c6","role":"authenticated"}';
select public.cs_create_team('Agency B', 'Bo Leader');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c2","role":"authenticated"}';
select public.cs_join_team(current_setting('cs_test.code_a'), 'Mei Author');
select set_config('cs_test.sub', (public.cs_submit_for_review('draft-1', 'linkedin', 'text-post', 'My post about CPF.', '[]')).id::text, true);

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c3","role":"authenticated"}';
select public.cs_join_team(current_setting('cs_test.code_a'), 'Pat Peer');
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c4","role":"authenticated"}';
select public.cs_join_team(current_setting('cs_test.code_a'), 'Quinn Quiet');

reset role;

-- ---------------------------------------------------------------------------
-- 0. Catalog
-- ---------------------------------------------------------------------------

select public.cs_test_assert(
  not has_table_privilege('anon', 'public.cs_review_comments', 'select,insert,update,delete,truncate')
  and not has_table_privilege('anon', 'public.cs_review_mentions', 'select,insert,update,delete,truncate')
  and not has_table_privilege('authenticated', 'public.cs_review_comments', 'insert,update,delete,truncate')
  and not has_table_privilege('authenticated', 'public.cs_review_mentions', 'insert,update,delete,truncate')
  and has_table_privilege('authenticated', 'public.cs_review_comments', 'select'),
  '0.1 anon holds nothing; authenticated may only select');
select public.cs_test_assert(
  not has_function_privilege('anon', 'public.cs_add_review_comment(uuid, text, uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.cs_mark_review_mentions_seen(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.cs_can_read_review_thread(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.cs_review_mentioned(uuid)', 'execute')
  and not has_sequence_privilege('authenticated', 'public.cs_review_comments_id_seq', 'usage,update'),
  '0.2 anon executes nothing; nobody client-side uses the sequence');
select public.cs_test_assert(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=public'])
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('cs_add_review_comment', 'cs_mark_review_mentions_seen',
                       'cs_can_read_review_thread', 'cs_review_mentioned')),
  '0.3 every function is SECURITY DEFINER with search_path pinned');

-- ---------------------------------------------------------------------------
-- 1. anon
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select public.cs_test_expect_error($$select count(*) from public.cs_review_comments$$,
  '%permission denied%', '1.1 anon cannot read comments');
select public.cs_test_expect_error($$select count(*) from public.cs_review_mentions$$,
  '%permission denied%', '1.2 anon cannot read mentions');
select public.cs_test_expect_error(format('select public.cs_add_review_comment(%L, %L)', current_setting('cs_test.sub'), 'hi'),
  '%permission denied%', '1.3 anon cannot comment');
reset role;

-- ---------------------------------------------------------------------------
-- 2. A peer who is not mentioned sees nothing
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c3","role":"authenticated"}';
select public.cs_test_assert((select count(*) from public.cs_review_submissions) = 0,
  '2.1 a teammate cannot read another member''s submission');
select public.cs_test_expect_error(format('select public.cs_add_review_comment(%L, %L)', current_setting('cs_test.sub'), 'hi'),
  '%can''t comment on this post%', '2.2 a teammate who is not in the thread cannot comment');

-- ---------------------------------------------------------------------------
-- 3. The leader comments and mentions P
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c1","role":"authenticated"}';
select public.cs_test_assert(
  (select author_name = 'Lee Leader' and body = 'Pat, you wrote one like this. Thoughts?'
   from public.cs_add_review_comment(current_setting('cs_test.sub')::uuid,
     E'  Pat, you wrote one like this. Thoughts?\r\n',
     array['7e57c0de-0000-4000-8000-0000000000c3', '7e57c0de-0000-4000-8000-0000000000c1']::uuid[])),
  '3.1 the leader comments');
select public.cs_test_assert(
  (select array_agg(user_id) from public.cs_review_mentions) = array['7e57c0de-0000-4000-8000-0000000000c3']::uuid[],
  '3.2 one mention row for P; mentioning yourself is dropped');

-- ---------------------------------------------------------------------------
-- 4. P now reads the post and thread; Q still does not
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c3","role":"authenticated"}';
select public.cs_test_assert(
  (select count(*) from public.cs_review_submissions where id = current_setting('cs_test.sub')::uuid) = 1,
  '4.1 a mentioned teammate reads the submission');
select public.cs_test_assert((select count(*) from public.cs_review_comments) = 1,
  '4.2 a mentioned teammate reads the thread');
select public.cs_test_assert(
  (select count(*) from public.cs_review_mentions where user_id = auth.uid() and seen_at is null) = 1,
  '4.3 P has one unseen mention');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c4","role":"authenticated"}';
select public.cs_test_assert(
  (select count(*) from public.cs_review_submissions) = 0
  and (select count(*) from public.cs_review_comments) = 0
  and (select count(*) from public.cs_review_mentions) = 0,
  '4.4 an unmentioned teammate reads nothing');

-- ---------------------------------------------------------------------------
-- 5. P cannot widen the thread; the author can
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c3","role":"authenticated"}';
select public.cs_test_expect_error(
  format('select public.cs_add_review_comment(%L, %L, %L::uuid[])', current_setting('cs_test.sub'), 'Quinn?',
    '{7e57c0de-0000-4000-8000-0000000000c4}'),
  '%Only the author or a team leader%', '5.1 a mentioned peer cannot bring in someone new');
select public.cs_test_assert(
  (select count(*) from public.cs_add_review_comment(current_setting('cs_test.sub')::uuid, 'Add the disclaimer.',
    array['7e57c0de-0000-4000-8000-0000000000c2', '7e57c0de-0000-4000-8000-0000000000c1']::uuid[])) = 1,
  '5.2 a mentioned peer can mention the author and a leader');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c2","role":"authenticated"}';
select public.cs_test_assert((select count(*) from public.cs_review_comments) = 2,
  '5.3 the author reads the whole thread');
select public.cs_add_review_comment(current_setting('cs_test.sub')::uuid, 'Quinn, can you check too?',
  array['7e57c0de-0000-4000-8000-0000000000c4']::uuid[]);

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c4","role":"authenticated"}';
select public.cs_test_assert(
  (select count(*) from public.cs_review_submissions) = 1 and (select count(*) from public.cs_review_comments) = 3,
  '5.4 the author can bring a teammate in');

-- ---------------------------------------------------------------------------
-- 6. Mentions stay inside the team; outsiders cannot comment
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c1","role":"authenticated"}';
select public.cs_test_expect_error(
  format('select public.cs_add_review_comment(%L, %L, %L::uuid[])', current_setting('cs_test.sub'), 'hi',
    '{7e57c0de-0000-4000-8000-0000000000c5}'),
  '%only mention people in your team%', '6.1 an outsider cannot be mentioned');
select public.cs_test_expect_error(
  format('select public.cs_add_review_comment(%L, %L, %L::uuid[])', current_setting('cs_test.sub'), 'hi',
    '{7e57c0de-0000-4000-8000-0000000000c6}'),
  '%only mention people in your team%', '6.2 another team''s leader cannot be mentioned');
select public.cs_test_expect_error(
  format('select public.cs_add_review_comment(%L, %L, %L::uuid[])', current_setting('cs_test.sub'), 'hi',
    (select array_agg(gen_random_uuid())::text from generate_series(1, 11))),
  '%up to 10 people%', '6.3 more than 10 mentions refused');
select public.cs_test_expect_error(format('select public.cs_add_review_comment(%L, %L)', current_setting('cs_test.sub'), E' \n '),
  '%up to 2,000%', '6.4 an empty comment is refused');
select public.cs_test_expect_error(format('select public.cs_add_review_comment(%L, %L)', current_setting('cs_test.sub'), repeat('x', 2001)),
  '%up to 2,000%', '6.5 a comment over 2,000 characters is refused');
select public.cs_test_expect_error(format('select public.cs_add_review_comment(%L, %L)', gen_random_uuid(), 'hi'),
  '%can''t comment on this post%', '6.6 an unknown submission gives the same refusal');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c5","role":"authenticated"}';
select public.cs_test_expect_error(format('select public.cs_add_review_comment(%L, %L)', current_setting('cs_test.sub'), 'hi'),
  '%can''t comment on this post%', '6.7 an outsider cannot comment');
select public.cs_test_assert((select count(*) from public.cs_review_comments) = 0,
  '6.8 an outsider reads nothing');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c6","role":"authenticated"}';
select public.cs_test_expect_error(format('select public.cs_add_review_comment(%L, %L)', current_setting('cs_test.sub'), 'hi'),
  '%can''t comment on this post%', '6.9 another team''s leader cannot comment');
select public.cs_test_assert(
  (select count(*) from public.cs_review_comments) = 0 and (select count(*) from public.cs_review_submissions) = 0,
  '6.10 another team''s leader reads nothing');

-- ---------------------------------------------------------------------------
-- 7. Seen state
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c4","role":"authenticated"}';
select public.cs_test_expect_error(
  'update public.cs_review_mentions set seen_at = now() where user_id = auth.uid()',
  '%permission denied%', '7.1 mentions cannot be updated directly');
select public.cs_test_assert(public.cs_mark_review_mentions_seen(current_setting('cs_test.sub')::uuid) = 1,
  '7.2 marking the thread seen clears one mention');
select public.cs_test_assert(
  (select count(*) from public.cs_review_mentions where user_id = auth.uid() and seen_at is null) = 0,
  '7.3 nothing unseen afterwards');
select public.cs_test_assert(
  (select count(*) from public.cs_review_mentions where user_id = '7e57c0de-0000-4000-8000-0000000000c3' and seen_at is null) = 1,
  '7.4 marking seen touches only your own mentions');

reset role;

-- ---------------------------------------------------------------------------
-- 8. Append-only, even for the table owner and service role
-- ---------------------------------------------------------------------------

select public.cs_test_expect_error('update public.cs_review_comments set body = ''edited''',
  '%append-only%', '8.1 comments cannot be edited');
select public.cs_test_expect_error('delete from public.cs_review_comments',
  '%append-only%', '8.2 comments cannot be deleted');
select public.cs_test_expect_error('truncate public.cs_review_comments cascade',
  '%append-only%', '8.3 comments cannot be truncated');
set local role service_role;
select public.cs_test_expect_error('delete from public.cs_review_comments',
  '%append-only%', '8.4 the service role cannot delete comments either');
reset role;

-- ---------------------------------------------------------------------------
-- 9. Hourly cap: 60 comments per person
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c2","role":"authenticated"}';
do $$
begin
  for i in 1..(60 - (select count(*) from public.cs_review_comments where author_id = auth.uid())) loop
    perform public.cs_add_review_comment(current_setting('cs_test.sub')::uuid, 'note ' || i);
  end loop;
end $$;
select public.cs_test_expect_error(format('select public.cs_add_review_comment(%L, %L)', current_setting('cs_test.sub'), 'one more'),
  '%60 comments in the last hour%', '9.1 the 61st comment in an hour is refused');

-- ---------------------------------------------------------------------------
-- 10. Leaving the team
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c3","role":"authenticated"}';
select public.cs_leave_team();
select public.cs_test_assert(
  (select count(*) from public.cs_review_submissions) = 0
  and (select count(*) from public.cs_review_comments) = 0
  and (select count(*) from public.cs_review_mentions) = 0,
  '10.1 a mentioned member who leaves loses the thread and the post');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000c2","role":"authenticated"}';
select public.cs_leave_team();
select public.cs_test_assert(
  (select count(*) from public.cs_review_comments) > 0
  and (select count(*) from public.cs_review_submissions) = 1,
  '10.2 an author who leaves still reads their own post and its thread');
select public.cs_test_expect_error(format('select public.cs_add_review_comment(%L, %L)', current_setting('cs_test.sub'), 'hi'),
  '%can''t comment on this post%', '10.3 an author who left cannot comment');

-- ---------------------------------------------------------------------------

reset role;
do $$ begin raise notice 'team comment tests: all passed'; end $$;
drop function public.cs_test_expect_error(text, text, text);
drop function public.cs_test_assert(boolean, text);

rollback;
