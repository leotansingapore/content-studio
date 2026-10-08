-- Tests for 014_approval_rules.sql. Run AFTER 011 and 014 are applied, as the
-- migration owner:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/014_approval_rules.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. A failed check raises
-- "FAIL <n> ..." and aborts. A clean run ends with NOTICE
-- "approval rule tests: all passed". Run 011_team_review.test.sql again
-- afterwards: it must still pass with 014 applied.

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

-- L ...d1 leader of team A   M ...d2 member   P ...d3 member   B ...d5 leader of team B
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000', ('7e57c0de-0000-4000-8000-0000000000' || s)::uuid,
       'authenticated', 'authenticated', 'cs-test-' || s || '@example.test', '', now(), '{}', '{}', now(), now()
from unnest(array['d1', 'd2', 'd3', 'd5']) s;

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d1","role":"authenticated"}';
select set_config('cs_test.team_a', public.cs_create_team('Agency A', 'Lee Leader')::text, true);
select set_config('cs_test.code_a', (select code from public.cs_team_invites where team_id = current_setting('cs_test.team_a')::uuid), true);
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d5","role":"authenticated"}';
select public.cs_create_team('Agency B', 'Bo Leader');
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d2","role":"authenticated"}';
select public.cs_join_team(current_setting('cs_test.code_a'), 'Mei Member');
select set_config('cs_test.sub_1', (public.cs_submit_for_review('draft-1', 'instagram', 'carousel', 'Guaranteed returns!', '[]')).id::text, true);
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d3","role":"authenticated"}';
select public.cs_join_team(current_setting('cs_test.code_a'), 'Pat Peer');
reset role;

-- ---------------------------------------------------------------------------
-- 0. Catalog and anon
-- ---------------------------------------------------------------------------

select public.cs_test_assert(
  not has_table_privilege('anon', 'public.cs_team_approval_rules', 'select,insert,update,delete,truncate')
  and not has_table_privilege('authenticated', 'public.cs_team_approval_rules', 'insert,update,delete,truncate')
  and has_table_privilege('authenticated', 'public.cs_team_approval_rules', 'select')
  and not has_function_privilege('anon', 'public.cs_set_approval_required(uuid, boolean)', 'execute')
  and not has_function_privilege('anon', 'public.cs_review_submission(uuid, text, text)', 'execute'),
  '0.1 anon holds nothing; authenticated may only select');
select public.cs_test_assert(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=public, pg_temp'])
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('cs_set_approval_required', 'cs_review_submission')),
  '0.2 both functions are SECURITY DEFINER with search_path pinned');
select public.cs_test_assert(
  (select bool_and(p.proconfig @> array['search_path=public, pg_temp'])
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('cs_review_normalize', 'cs_review_hash', 'cs_clean_label', 'cs_generate_invite_code',
       'cs_member_display_name', 'cs_log_event', 'cs_my_team_id', 'cs_is_team_leader',
       'cs_review_submissions_guard', 'cs_review_events_guard', 'cs_create_team', 'cs_join_team',
       'cs_leave_team', 'cs_submit_for_review'))
  and (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('cs_review_normalize', 'cs_review_hash', 'cs_clean_label', 'cs_generate_invite_code',
       'cs_member_display_name', 'cs_log_event', 'cs_my_team_id', 'cs_is_team_leader',
       'cs_review_submissions_guard', 'cs_review_events_guard', 'cs_create_team', 'cs_join_team',
       'cs_leave_team', 'cs_submit_for_review')) = 14,
  '0.2b every 011 function now ends its search_path with pg_temp');
select public.cs_test_assert(
  (select count(*) from pg_constraint where conrelid = 'public.cs_review_submissions'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%approved%') = 1
  and (select count(*) from pg_constraint where conrelid = 'public.cs_review_events'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%team_created%') = 1,
  '0.2c exactly one status check and one kind check remain (the old ones were dropped)');
select public.cs_test_assert(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'cs_team_approval_rules_user_idx'),
  '0.2d the rules table is indexed by user');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select public.cs_test_expect_error($$select count(*) from public.cs_team_approval_rules$$,
  '%permission denied%', '0.3 anon cannot read rules');
select public.cs_test_expect_error($$select public.cs_set_approval_required('7e57c0de-0000-4000-8000-0000000000d2', true)$$,
  '%permission denied%', '0.4 anon cannot set a rule');
reset role;

-- ---------------------------------------------------------------------------
-- 1. Reject outright
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d2","role":"authenticated"}';
select public.cs_test_expect_error(format('select public.cs_review_submission(%L, %L, %L)', current_setting('cs_test.sub_1'), 'rejected', 'no'),
  '%Only a leader%', '1.1 a member cannot reject');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d1","role":"authenticated"}';
select public.cs_test_expect_error(format('select public.cs_review_submission(%L, %L, %L)', current_setting('cs_test.sub_1'), 'rejected', '  '),
  '%reason for rejecting%', '1.2 rejecting needs a reason');
select public.cs_test_expect_error(format('select public.cs_review_submission(%L, %L)', current_setting('cs_test.sub_1'), 'binned'),
  '%approve, request changes or reject%', '1.3 unknown decisions refused');
select public.cs_test_assert(
  (select status = 'rejected' and review_comment = 'We can''t promise returns.' and reviewer_name = 'Lee Leader'
   from public.cs_review_submission(current_setting('cs_test.sub_1')::uuid, 'rejected', ' We can''t promise returns. ')),
  '1.4 the leader rejects with a reason');
select public.cs_test_expect_error(format('select public.cs_review_submission(%L, %L)', current_setting('cs_test.sub_1'), 'approved'),
  '%already been reviewed%', '1.5 a rejection is final');
select public.cs_test_assert(
  (select detail ->> 'comment' = 'We can''t promise returns.' and actor_name = 'Lee Leader'
   from public.cs_review_events where kind = 'rejected'),
  '1.6 the rejection is in the audit trail with its reason');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d2","role":"authenticated"}';
select public.cs_test_assert(
  (select status from public.cs_review_submissions where id = current_setting('cs_test.sub_1')::uuid) = 'rejected',
  '1.7 the author reads the rejection');
select set_config('cs_test.sub_2', (public.cs_submit_for_review('draft-1', 'instagram', 'carousel', 'Returns are not guaranteed.', '[]')).id::text, true);
select public.cs_test_assert(
  (select status from public.cs_review_submissions where id = current_setting('cs_test.sub_2')::uuid) = 'pending',
  '1.8 the author can submit a new version of a rejected draft');
reset role;

select public.cs_test_expect_error(
  format('update public.cs_review_submissions set status = %L, reviewer_id = %L, reviewed_at = now() where id = %L',
    'rejected', '7e57c0de-0000-4000-8000-0000000000d1', current_setting('cs_test.sub_2')),
  '%changes_need_comment%', '1.9 the constraint needs a reason for rejected, even for the table owner');

-- ---------------------------------------------------------------------------
-- 2. Approval rules
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d1","role":"authenticated"}';
select public.cs_test_assert(public.cs_set_approval_required('7e57c0de-0000-4000-8000-0000000000d2', true),
  '2.1 the leader puts M on approval');
select public.cs_set_approval_required('7e57c0de-0000-4000-8000-0000000000d2', true);
select public.cs_test_assert(
  (select count(*) from public.cs_review_events where kind = 'approval_rule_set') = 1
  and (select detail ->> 'display_name' = 'Mei Member' and (detail ->> 'required')::boolean
       from public.cs_review_events where kind = 'approval_rule_set'),
  '2.2 logged once; setting it again changes nothing');
select public.cs_test_assert((select count(*) from public.cs_team_approval_rules) = 1,
  '2.3 the leader reads the team''s rules');
select public.cs_test_expect_error($$select public.cs_set_approval_required('7e57c0de-0000-4000-8000-0000000000d1', true)$$,
  '%yourself on approval%', '2.4 a leader cannot put themselves on approval');
select public.cs_test_expect_error($$select public.cs_set_approval_required('7e57c0de-0000-4000-8000-0000000000d5', true)$$,
  '%Only a leader of this person''s team%', '2.5 a leader cannot set a rule on another team''s member');
select public.cs_test_expect_error($$select public.cs_set_approval_required(gen_random_uuid(), true)$$,
  '%Only a leader of this person''s team%', '2.6 a leader cannot set a rule on a stranger');
select public.cs_test_expect_error(
  $$insert into public.cs_team_approval_rules (team_id, user_id, set_by_name) values (gen_random_uuid(), gen_random_uuid(), 'x')$$,
  '%permission denied%', '2.7 rules cannot be written directly');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d2","role":"authenticated"}';
select public.cs_test_assert(
  (select count(*) from public.cs_team_approval_rules where user_id = auth.uid()) = 1,
  '2.8 the member reads their own rule');
select public.cs_test_expect_error($$select public.cs_set_approval_required('7e57c0de-0000-4000-8000-0000000000d3', true)$$,
  '%Only a leader%', '2.9 a member cannot set rules');
select public.cs_test_expect_error(
  format('delete from public.cs_team_approval_rules where user_id = %L', '7e57c0de-0000-4000-8000-0000000000d2'),
  '%permission denied%', '2.10 a member cannot delete their own rule');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d3","role":"authenticated"}';
select public.cs_test_assert((select count(*) from public.cs_team_approval_rules) = 0,
  '2.11 other members do not see who is on approval');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d5","role":"authenticated"}';
select public.cs_test_assert((select count(*) from public.cs_team_approval_rules) = 0,
  '2.12 another team''s leader sees no rules');
select public.cs_test_expect_error($$select public.cs_set_approval_required('7e57c0de-0000-4000-8000-0000000000d2', false)$$,
  '%Only a leader of this person''s team%', '2.13 another team''s leader cannot lift the rule');

-- Never on another leader or on the team's owner (simulated: there is no
-- promote or transfer function yet).
reset role;
update public.cs_team_members set role = 'leader' where user_id = '7e57c0de-0000-4000-8000-0000000000d3';
set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d1","role":"authenticated"}';
select public.cs_test_expect_error($$select public.cs_set_approval_required('7e57c0de-0000-4000-8000-0000000000d3', true)$$,
  '%Leaders and the team owner%', '2.13b a leader cannot put another leader on approval');
reset role;
update public.cs_team_members set role = 'member' where user_id = '7e57c0de-0000-4000-8000-0000000000d3';
update public.cs_teams set owner_id = '7e57c0de-0000-4000-8000-0000000000d3' where id = current_setting('cs_test.team_a')::uuid;
set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d1","role":"authenticated"}';
select public.cs_test_expect_error($$select public.cs_set_approval_required('7e57c0de-0000-4000-8000-0000000000d3', true)$$,
  '%Leaders and the team owner%', '2.13c a leader cannot put the team owner on approval');
select public.cs_test_assert(public.cs_set_approval_required('7e57c0de-0000-4000-8000-0000000000d3', false) = false,
  '2.13d turning a rule off is always allowed');
reset role;
update public.cs_teams set owner_id = '7e57c0de-0000-4000-8000-0000000000d1' where id = current_setting('cs_test.team_a')::uuid;
set local role authenticated;

-- Leaving and rejoining does not clear the rule.
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d2","role":"authenticated"}';
select public.cs_leave_team();
select public.cs_join_team(current_setting('cs_test.code_a'), 'Mei Member');
select public.cs_test_assert(
  (select count(*) from public.cs_team_approval_rules where user_id = auth.uid()) = 1,
  '2.14 the rule survives leaving and rejoining');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000d1","role":"authenticated"}';
select public.cs_test_assert(public.cs_set_approval_required('7e57c0de-0000-4000-8000-0000000000d2', false) = false,
  '2.15 the leader lifts the rule');
select public.cs_test_assert(
  (select count(*) from public.cs_team_approval_rules) = 0
  and (select array_agg((detail ->> 'required')::boolean order by id) from public.cs_review_events where kind = 'approval_rule_set')
      = array[true, false],
  '2.16 the rule is gone and both changes are logged in order');
reset role;

-- ---------------------------------------------------------------------------

do $$ begin raise notice 'approval rule tests: all passed'; end $$;
drop function public.cs_test_expect_error(text, text, text);
drop function public.cs_test_assert(boolean, text);

rollback;
