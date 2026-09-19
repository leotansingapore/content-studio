-- Tests for 011_team_review.sql. Run AFTER the migration is applied, as the
-- migration owner (postgres in the Supabase SQL editor, or psql):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/011_team_review.test.sql
--
-- Everything happens in one transaction that ends in ROLLBACK, so nothing
-- persists: not the test users, not the teams, not the helper functions.
-- Any failed check raises an exception naming the check ("FAIL 8.11 ...")
-- and aborts. A clean run ends with NOTICE "team review tests: all passed".
--
-- Users are impersonated with SET LOCAL ROLE + request.jwt.claims, which is
-- what auth.uid() and RLS read under PostgREST.

begin;

-- ---------------------------------------------------------------------------
-- Helpers (created inside the transaction, dropped before ROLLBACK)
-- ---------------------------------------------------------------------------

create function public.cs_test_assert(p_ok boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'FAIL %', p_label;
  end if;
end $$;

-- Runs p_sql as the current role and requires it to fail with a message
-- matching p_like (LIKE pattern).
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

-- ---------------------------------------------------------------------------
-- Fixtures
--   L  ...a1  leader of team A        M  ...a2  member of team A
--   O  ...a3  outsider (no team)      B  ...a4  leader of team B
--   G  ...a5  guesses invite codes
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '7e57c0de-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated',
   'cs-test-leader@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Test Leader"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '7e57c0de-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated',
   'cs-test-member@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '7e57c0de-0000-4000-8000-0000000000a3', 'authenticated', 'authenticated',
   'cs-test-outsider@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '7e57c0de-0000-4000-8000-0000000000a4', 'authenticated', 'authenticated',
   'cs-test-leader-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '7e57c0de-0000-4000-8000-0000000000a5', 'authenticated', 'authenticated',
   'cs-test-guesser@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

-- ---------------------------------------------------------------------------
-- 0. Hashing matches the client (src/lib/teamReview.test.ts uses the same vectors)
-- ---------------------------------------------------------------------------

select public.cs_test_assert(
  public.cs_review_hash('hello') = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
  '0.1 sha256 known answer (ASCII)');
select public.cs_test_assert(
  public.cs_review_hash('Café — 保险 ✓') = '8e1118666495c640eadac09a634d9366d92cb69555914934358c8c92340a1eac',
  '0.2 sha256 known answer (UTF-8)');
select public.cs_test_assert(
  public.cs_review_hash(E'\r\n  hello \t\n') = public.cs_review_hash('hello'),
  '0.3 normalisation trims spaces, tabs and newlines at both ends');
select public.cs_test_assert(
  public.cs_review_hash(E'a\r\nb\rc') = public.cs_review_hash(E'a\nb\nc'),
  '0.4 CRLF and CR count as LF');
select public.cs_test_assert(
  public.cs_review_hash(E'a\n\nb') <> public.cs_review_hash(E'a\nb'),
  '0.5 inner whitespace is significant');

-- ---------------------------------------------------------------------------
-- 1. anon can do nothing
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select public.cs_test_expect_error($$select public.cs_create_team('Anon team')$$,
  '%permission denied%', '1.1 anon cannot create a team');
select public.cs_test_expect_error($$select public.cs_join_team('ABCDEFGHJK')$$,
  '%permission denied%', '1.2 anon cannot join a team');
select public.cs_test_expect_error($$select public.cs_submit_for_review('d', 'linkedin', 'text-post', 'x', '[]')$$,
  '%permission denied%', '1.3 anon cannot submit');
select public.cs_test_expect_error($$select count(*) from public.cs_teams$$,
  '%permission denied%', '1.4 anon cannot read teams');
select public.cs_test_expect_error($$select count(*) from public.cs_review_submissions$$,
  '%permission denied%', '1.5 anon cannot read submissions');
select public.cs_test_expect_error($$select count(*) from public.cs_review_events$$,
  '%permission denied%', '1.6 anon cannot read events');

reset role;

-- ---------------------------------------------------------------------------
-- 2. Leader L creates team A
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000a1","role":"authenticated"}';

select set_config('cs_test.team_a', public.cs_create_team('  Test Agency  ', 'Lee Leader')::text, true);

select public.cs_test_assert(
  (select name from public.cs_teams where id = current_setting('cs_test.team_a')::uuid) = 'Test Agency',
  '2.1 leader reads own team row; name is trimmed');
select set_config('cs_test.code_a',
  (select code from public.cs_team_invites where team_id = current_setting('cs_test.team_a')::uuid), true);
select public.cs_test_assert(
  current_setting('cs_test.code_a') ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$',
  '2.2 leader reads a 10-character unambiguous invite code');
select public.cs_test_assert(
  (select role from public.cs_team_members where user_id = '7e57c0de-0000-4000-8000-0000000000a1') = 'leader',
  '2.3 creator is the leader');
select public.cs_test_assert(
  (select display_name from public.cs_team_members where user_id = '7e57c0de-0000-4000-8000-0000000000a1') = 'Lee Leader',
  '2.4 requested display name stored');
select public.cs_test_assert(
  (select count(*) from public.cs_review_events
   where team_id = current_setting('cs_test.team_a')::uuid and kind = 'team_created') = 1,
  '2.5 team_created event logged');
select public.cs_test_expect_error($$select public.cs_create_team('   ')$$,
  '%1 to 80 characters%', '2.6 blank team name rejected');
select public.cs_test_expect_error($$select public.cs_create_team('Second team')$$,
  '%already in a team%', '2.7 one team per person');
select public.cs_test_expect_error($$insert into public.cs_teams (name, owner_id) values ('Direct', auth.uid())$$,
  '%permission denied%', '2.8 no direct insert into cs_teams');
select public.cs_test_expect_error(
  format('update public.cs_team_invites set code = %L where team_id = %L', 'ZZZZZZZZZZ', current_setting('cs_test.team_a')),
  '%permission denied%', '2.9 no direct update of the invite code');
select public.cs_test_expect_error(
  format('insert into public.cs_team_members (team_id, user_id, role, display_name) values (%L, %L, %L, %L)',
    current_setting('cs_test.team_a'), '7e57c0de-0000-4000-8000-0000000000a3', 'leader', 'Sneaky'),
  '%permission denied%', '2.10 no direct insert into cs_team_members');
select public.cs_test_expect_error(
  format('update public.cs_team_members set role = %L where user_id = auth.uid()', 'member'),
  '%permission denied%', '2.11 no direct update of roles');

-- ---------------------------------------------------------------------------
-- 3. Leader B creates team B and cannot see team A
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000a4","role":"authenticated"}';

select set_config('cs_test.team_b', public.cs_create_team('Other Agency')::text, true);
select set_config('cs_test.code_b',
  (select code from public.cs_team_invites where team_id = current_setting('cs_test.team_b')::uuid), true);

select public.cs_test_assert(current_setting('cs_test.code_b') <> current_setting('cs_test.code_a'),
  '3.1 each team gets its own code');
select public.cs_test_assert(
  (select count(*) from public.cs_teams where id = current_setting('cs_test.team_a')::uuid) = 0,
  '3.2 another team''s leader cannot read team A');
select public.cs_test_assert(
  (select count(*) from public.cs_team_invites where team_id = current_setting('cs_test.team_a')::uuid) = 0,
  '3.3 another team''s leader cannot read team A''s invite code');
select public.cs_test_assert(
  (select count(*) from public.cs_team_members where team_id = current_setting('cs_test.team_a')::uuid) = 0,
  '3.4 another team''s leader cannot read team A''s roster');
select public.cs_test_assert(
  (select count(*) from public.cs_review_events where team_id = current_setting('cs_test.team_a')::uuid) = 0,
  '3.5 another team''s leader cannot read team A''s events');

-- ---------------------------------------------------------------------------
-- 4. Member M joins team A
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000a2","role":"authenticated"}';

select public.cs_test_assert(
  (select count(*) from public.cs_teams where id = current_setting('cs_test.team_a')::uuid) = 0,
  '4.1 before joining, M cannot read team A');
-- "O" is not in the code alphabet, so this can never match a real team.
select public.cs_test_assert(
  (public.cs_join_team('WRONGCODE9') ->> 'error') = 'invalid_code',
  '4.2 a wrong code fails with invalid_code');
select public.cs_test_assert(public.cs_my_team_id() is null, '4.3 a wrong code joins nothing');
select public.cs_test_assert(
  (public.cs_join_team(
     lower(substr(current_setting('cs_test.code_a'), 1, 5)) || ' - ' || lower(substr(current_setting('cs_test.code_a'), 6)),
     'Mei Member') ->> 'ok')::boolean,
  '4.4 the right code joins, ignoring case, spaces and dashes');
select public.cs_test_assert(
  (select name from public.cs_teams where id = current_setting('cs_test.team_a')::uuid) = 'Test Agency',
  '4.5 member reads own team row');
select public.cs_test_assert(
  (select count(*) from public.cs_team_members where team_id = current_setting('cs_test.team_a')::uuid) = 2,
  '4.6 member reads own team roster');
select public.cs_test_assert(
  (select role from public.cs_team_members where user_id = '7e57c0de-0000-4000-8000-0000000000a2') = 'member',
  '4.7 joiner is a member, not a leader');
select public.cs_test_assert(
  (select count(*) from public.cs_team_invites where team_id = current_setting('cs_test.team_a')::uuid) = 0,
  '4.8 member cannot read the invite code');
select public.cs_test_assert(
  (select count(*) from public.cs_review_events where team_id = current_setting('cs_test.team_a')::uuid) = 0,
  '4.9 member cannot read the audit trail');
select public.cs_test_assert(
  (select count(*) from public.cs_teams where id = current_setting('cs_test.team_b')::uuid) = 0
  and (select count(*) from public.cs_team_members where team_id = current_setting('cs_test.team_b')::uuid) = 0,
  '4.10 member cannot read another team or its roster');
select public.cs_test_expect_error(format('select public.cs_join_team(%L)', current_setting('cs_test.code_b')),
  '%already in a team%', '4.11 cannot be in two teams');

-- ---------------------------------------------------------------------------
-- 5. Member submits a draft
-- ---------------------------------------------------------------------------

select set_config('cs_test.sub_1', (public.cs_submit_for_review(
  'draft-1', 'linkedin', 'text-post',
  E'  Guaranteed returns!\r\nAct now.  \n',
  '[{"ruleId":"guarantee","severity":"warn","message":"Regulated word","match":"Guaranteed"}]'::jsonb
)).id::text, true);

select public.cs_test_assert(
  (select content from public.cs_review_submissions where id = current_setting('cs_test.sub_1')::uuid)
    = E'Guaranteed returns!\nAct now.',
  '5.1 content stored normalised');
select public.cs_test_assert(
  (select content_hash from public.cs_review_submissions where id = current_setting('cs_test.sub_1')::uuid)
    = encode(sha256(convert_to(E'Guaranteed returns!\nAct now.', 'UTF8')), 'hex'),
  '5.2 server hash is sha256 of the normalised text');
select public.cs_test_assert(
  (select status = 'pending' and author_name = 'Mei Member' and jsonb_array_length(compliance_flags) = 1
          and reviewer_id is null and reviewed_at is null
   from public.cs_review_submissions where id = current_setting('cs_test.sub_1')::uuid),
  '5.3 pending, with author name and flags snapshotted');
select public.cs_test_expect_error(
  $$select public.cs_submit_for_review('draft-1', 'linkedin', 'text-post', 'Edited while pending', '[]')$$,
  '%already waiting for review%', '5.4 one pending submission per draft');
select public.cs_test_expect_error(
  $$select public.cs_submit_for_review('draft-2', 'LinkedIn!', 'text-post', 'x', '[]')$$,
  '%platform%', '5.5 malformed platform rejected');
select public.cs_test_expect_error(
  $$select public.cs_submit_for_review('draft-2', 'linkedin', 'text-post', E' \r\n ', '[]')$$,
  '%no post text%', '5.6 blank content rejected');
select public.cs_test_expect_error(
  $$select public.cs_submit_for_review('draft-2', 'linkedin', 'text-post', 'x', '{"a":1}')$$,
  '%malformed%', '5.7 flags must be an array');
select public.cs_test_expect_error(
  $$select public.cs_submit_for_review('draft-2', 'linkedin', 'text-post', 'x', '["x"]')$$,
  '%malformed%', '5.8 flags must be objects');
select public.cs_test_expect_error(
  format('select public.cs_review_submission(%L, %L)', current_setting('cs_test.sub_1'), 'approved'),
  '%leader of this team%', '5.9 a member cannot approve');
select public.cs_test_expect_error(
  format('update public.cs_review_submissions set content = %L where id = %L', 'hacked', current_setting('cs_test.sub_1')),
  '%permission denied%', '5.10 author cannot update content');
select public.cs_test_expect_error(
  format('update public.cs_review_submissions set status = %L where id = %L', 'approved', current_setting('cs_test.sub_1')),
  '%permission denied%', '5.11 author cannot set status through the table');
select public.cs_test_expect_error(
  format('delete from public.cs_review_submissions where id = %L', current_setting('cs_test.sub_1')),
  '%permission denied%', '5.12 author cannot delete a submission');
select public.cs_test_expect_error(
  format($f$insert into public.cs_review_submissions
    (team_id, author_id, author_name, draft_id, platform, format, content, content_hash, status)
    values (%L, auth.uid(), 'x', 'd', 'linkedin', 'text-post', 'x', repeat('a', 64), 'approved')$f$,
    current_setting('cs_test.team_a')),
  '%permission denied%', '5.13 no direct insert of a pre-approved submission');
select public.cs_test_expect_error(
  format($f$insert into public.cs_review_events (team_id, actor_name, kind, content_hash)
    values (%L, 'x', 'approved', repeat('a', 64))$f$, current_setting('cs_test.team_a')),
  '%permission denied%', '5.14 no direct insert of events');

-- ---------------------------------------------------------------------------
-- 6. Outsider O sees and does nothing
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000a3","role":"authenticated"}';

select public.cs_test_assert(
  (select count(*) from public.cs_teams
   where id in (current_setting('cs_test.team_a')::uuid, current_setting('cs_test.team_b')::uuid)) = 0,
  '6.1 outsider reads no team rows');
select public.cs_test_assert(
  (select count(*) from public.cs_team_members where team_id = current_setting('cs_test.team_a')::uuid) = 0,
  '6.2 outsider reads no roster');
select public.cs_test_assert(
  (select count(*) from public.cs_team_invites where team_id = current_setting('cs_test.team_a')::uuid) = 0,
  '6.3 outsider reads no invite code');
select public.cs_test_assert(
  (select count(*) from public.cs_review_submissions where team_id = current_setting('cs_test.team_a')::uuid) = 0,
  '6.4 outsider reads no submissions');
select public.cs_test_assert(
  (select count(*) from public.cs_review_events where team_id = current_setting('cs_test.team_a')::uuid) = 0,
  '6.5 outsider reads no events');
select public.cs_test_expect_error(
  format('select public.cs_review_submission(%L, %L)', current_setting('cs_test.sub_1'), 'approved'),
  '%leader of this team%', '6.6 outsider cannot review');
select public.cs_test_expect_error(
  $$select public.cs_review_submission(gen_random_uuid(), 'approved')$$,
  '%leader of this team%', '6.7 an unknown id gives the same error as a forbidden one');
select public.cs_test_expect_error(
  $$select public.cs_submit_for_review('d', 'linkedin', 'text-post', 'x', '[]')$$,
  '%Join a team%', '6.8 outsider cannot submit');
select public.cs_test_expect_error($$select public.cs_leave_team()$$,
  '%not in a team%', '6.9 outsider has nothing to leave');

-- ---------------------------------------------------------------------------
-- 7. Leader of team B cannot touch team A's submissions
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000a4","role":"authenticated"}';

select public.cs_test_assert(
  (select count(*) from public.cs_review_submissions where id = current_setting('cs_test.sub_1')::uuid) = 0,
  '7.1 another team''s leader cannot read the submission');
select public.cs_test_expect_error(
  format('select public.cs_review_submission(%L, %L)', current_setting('cs_test.sub_1'), 'approved'),
  '%leader of this team%', '7.2 another team''s leader cannot approve');

-- ---------------------------------------------------------------------------
-- 8. Leader L reviews
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000a1","role":"authenticated"}';

select public.cs_test_assert(
  (select count(*) from public.cs_review_submissions where id = current_setting('cs_test.sub_1')::uuid) = 1,
  '8.1 leader reads the team''s submission');
select public.cs_test_assert(
  (select count(*) from public.cs_review_events where team_id = current_setting('cs_test.team_a')::uuid) = 3,
  '8.2 leader reads the audit trail (created, joined, submitted)');
select public.cs_test_expect_error(
  format('select public.cs_review_submission(%L, %L, %L)', current_setting('cs_test.sub_1'), 'changes_requested', '   '),
  '%Add a comment%', '8.3 requesting changes needs a comment');
select public.cs_test_expect_error(
  format('select public.cs_review_submission(%L, %L)', current_setting('cs_test.sub_1'), 'rejected'),
  '%approve or request changes%', '8.4 unknown decision rejected');
select public.cs_test_expect_error(
  format('update public.cs_review_submissions set status = %L where id = %L', 'approved', current_setting('cs_test.sub_1')),
  '%permission denied%', '8.5 leader cannot approve through the table');
select public.cs_test_assert(
  (public.cs_review_submission(current_setting('cs_test.sub_1')::uuid, 'approved', 'Looks fine')).status = 'approved',
  '8.6 leader approves');
select public.cs_test_assert(
  (select reviewer_id = '7e57c0de-0000-4000-8000-0000000000a1' and reviewer_name = 'Lee Leader'
          and review_comment = 'Looks fine' and reviewed_at is not null
   from public.cs_review_submissions where id = current_setting('cs_test.sub_1')::uuid),
  '8.7 reviewer, comment and time recorded');
select public.cs_test_expect_error(
  format('select public.cs_review_submission(%L, %L, %L)', current_setting('cs_test.sub_1'), 'changes_requested', 'Too late'),
  '%already been reviewed%', '8.8 a review is final');
select public.cs_test_expect_error(
  format('delete from public.cs_review_events where team_id = %L', current_setting('cs_test.team_a')),
  '%permission denied%', '8.9 leader cannot delete events');
select public.cs_test_expect_error(
  format('update public.cs_review_events set actor_name = %L where team_id = %L', 'x', current_setting('cs_test.team_a')),
  '%permission denied%', '8.10 leader cannot edit events');

select set_config('cs_test.sub_own', (public.cs_submit_for_review(
  'leader-draft', 'instagram', 'carousel', 'My own post', '[]'::jsonb
)).id::text, true);
select public.cs_test_expect_error(
  format('select public.cs_review_submission(%L, %L)', current_setting('cs_test.sub_own'), 'approved'),
  '%your own submission%', '8.11 leader cannot approve their own submission');

-- ---------------------------------------------------------------------------
-- 9. Author resubmits; leader requests changes
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000a2","role":"authenticated"}';

select public.cs_test_assert(
  (select status from public.cs_review_submissions where id = current_setting('cs_test.sub_1')::uuid) = 'approved',
  '9.1 author sees the approval');
select public.cs_test_assert(
  (select count(*) from public.cs_review_submissions where id = current_setting('cs_test.sub_own')::uuid) = 0,
  '9.2 member cannot read the leader''s own submission');
select set_config('cs_test.sub_2', (public.cs_submit_for_review(
  'draft-1', 'linkedin', 'text-post', 'Edited after approval', '[]'::jsonb
)).id::text, true);

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000a1","role":"authenticated"}';

select public.cs_test_assert(
  (public.cs_review_submission(current_setting('cs_test.sub_2')::uuid, 'changes_requested', 'Add the disclaimer')).status
    = 'changes_requested',
  '9.3 leader requests changes');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000a2","role":"authenticated"}';

select public.cs_test_assert(
  (select review_comment from public.cs_review_submissions where id = current_setting('cs_test.sub_2')::uuid)
    = 'Add the disclaimer',
  '9.4 author reads the leader''s comment');
select public.cs_test_assert(
  (select count(*) from public.cs_review_submissions where author_id = '7e57c0de-0000-4000-8000-0000000000a2') = 2,
  '9.5 author reads all of their submissions');

-- ---------------------------------------------------------------------------
-- 10. Integrity holds even for the owner and service roles
-- ---------------------------------------------------------------------------

reset role;

select public.cs_test_expect_error(
  format('update public.cs_review_submissions set content = %L where id = %L', 'hacked', current_setting('cs_test.sub_1')),
  '%locked once submitted%', '10.1 content is immutable even for the table owner');
select public.cs_test_expect_error(
  format('update public.cs_review_submissions set content_hash = repeat(%L, 64) where id = %L', 'b', current_setting('cs_test.sub_own')),
  '%locked once submitted%', '10.2 hash is immutable while pending');
select public.cs_test_expect_error(
  format('update public.cs_review_submissions set status = %L, reviewer_id = null, reviewed_at = null, review_comment = null where id = %L',
    'pending', current_setting('cs_test.sub_1')),
  '%already been reviewed%', '10.3 a reviewed status cannot be reopened');
select public.cs_test_expect_error(
  format('update public.cs_review_submissions set status = %L, reviewer_id = author_id, reviewed_at = now() where id = %L',
    'approved', current_setting('cs_test.sub_own')),
  '%no_self_review%', '10.4 self-approval is blocked by a constraint too');
select public.cs_test_expect_error(
  format('delete from public.cs_review_submissions where id = %L', current_setting('cs_test.sub_1')),
  '%cannot be deleted%', '10.5 submissions cannot be deleted');
select public.cs_test_expect_error(
  format('delete from public.cs_review_events where team_id = %L', current_setting('cs_test.team_a')),
  '%append-only%', '10.6 events cannot be deleted');
select public.cs_test_expect_error(
  format('update public.cs_review_events set kind = %L where team_id = %L', 'approved', current_setting('cs_test.team_a')),
  '%append-only%', '10.7 events cannot be updated');
select public.cs_test_expect_error('truncate public.cs_review_events',
  '%append-only%', '10.8 events cannot be truncated');

set local role service_role;
select public.cs_test_expect_error(
  format('delete from public.cs_review_events where team_id = %L', current_setting('cs_test.team_a')),
  '%append-only%', '10.9 the service role cannot delete events either');
reset role;

select public.cs_test_assert(
  (select array_agg(kind order by id) from public.cs_review_events
   where team_id = current_setting('cs_test.team_a')::uuid)
  = array['team_created', 'member_joined', 'submitted', 'approved', 'submitted', 'submitted', 'changes_requested'],
  '10.10 every step is logged, in order');
select public.cs_test_assert(
  (select bool_and(content_hash ~ '^[0-9a-f]{64}$' and actor_id is not null and actor_name <> '')
   from public.cs_review_events where team_id = current_setting('cs_test.team_a')::uuid),
  '10.11 every event has an actor, a name and a hash');
select public.cs_test_assert(
  (select bool_and(e.content_hash = s.content_hash)
   from public.cs_review_events e
   join public.cs_review_submissions s on s.id = e.submission_id
   where e.team_id = current_setting('cs_test.team_a')::uuid),
  '10.12 submission events carry the submission''s content hash');
select public.cs_test_assert(
  (select (detail ->> 'comment') = 'Add the disclaimer' and (detail ->> 'author_name') = 'Mei Member'
   from public.cs_review_events
   where team_id = current_setting('cs_test.team_a')::uuid and kind = 'changes_requested'),
  '10.13 the review event records the comment and consultant');

-- ---------------------------------------------------------------------------
-- 11. Leaving
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000a1","role":"authenticated"}';

select public.cs_test_expect_error($$select public.cs_leave_team()$$,
  '%still has members%', '11.1 a leader cannot leave while members remain');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000a2","role":"authenticated"}';

select public.cs_leave_team();
select public.cs_test_assert(public.cs_my_team_id() is null, '11.2 member left');
select public.cs_test_assert(
  (select count(*) from public.cs_teams where id = current_setting('cs_test.team_a')::uuid) = 0
  and (select count(*) from public.cs_team_members where team_id = current_setting('cs_test.team_a')::uuid) = 0,
  '11.3 a former member no longer reads the team or roster');
select public.cs_test_assert(
  (select count(*) from public.cs_review_submissions where author_id = '7e57c0de-0000-4000-8000-0000000000a2') = 2,
  '11.4 a former member still reads their own submissions');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000a1","role":"authenticated"}';

select public.cs_test_assert(
  (select count(*) from public.cs_review_events
   where team_id = current_setting('cs_test.team_a')::uuid and kind = 'member_left') = 1,
  '11.5 member_left logged');
select public.cs_test_assert(
  (select count(*) from public.cs_review_submissions where team_id = current_setting('cs_test.team_a')::uuid) = 3,
  '11.6 the leader keeps the record after a member leaves');
select public.cs_test_expect_error($$select public.cs_leave_team()$$,
  '%review history%', '11.7 a leader cannot walk away from a review history');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000a4","role":"authenticated"}';

select public.cs_leave_team();
select public.cs_test_assert(public.cs_my_team_id() is null,
  '11.8 the leader of an empty team with no history can leave');

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000a3","role":"authenticated"}';

select public.cs_test_expect_error(format('select public.cs_join_team(%L)', current_setting('cs_test.code_b')),
  '%no longer has a leader%', '11.9 nobody can join a team without a leader');

-- ---------------------------------------------------------------------------
-- 12. Guess limit: 10 wrong codes per user per hour
-- ---------------------------------------------------------------------------

set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000a5","role":"authenticated"}';

do $$
begin
  for i in 1..10 loop
    if (public.cs_join_team('WRONGCODE' || i) ->> 'error') is distinct from 'invalid_code' then
      raise exception 'FAIL 12.1 wrong code % was not rejected as invalid_code', i;
    end if;
  end loop;
end $$;

select public.cs_test_assert(
  (public.cs_join_team(current_setting('cs_test.code_a')) ->> 'error') = 'rate_limited',
  '12.2 the 11th attempt is refused, even with the right code');
select public.cs_test_assert(public.cs_my_team_id() is null, '12.3 the guesser did not join');

reset role;

select public.cs_test_assert(
  (select count(*) from public.cs_team_join_attempts where user_id = '7e57c0de-0000-4000-8000-0000000000a5') = 10,
  '12.4 failed attempts are recorded (not rolled back with the call)');
update public.cs_team_join_attempts
set attempted_at = now() - interval '2 hours'
where user_id = '7e57c0de-0000-4000-8000-0000000000a5';

set local role authenticated;
set local request.jwt.claims = '{"sub":"7e57c0de-0000-4000-8000-0000000000a5","role":"authenticated"}';

select public.cs_test_assert(
  (public.cs_join_team(current_setting('cs_test.code_a')) ->> 'ok')::boolean,
  '12.5 the limit lifts once the attempts are over an hour old');
select public.cs_test_assert(
  (select display_name from public.cs_team_members where user_id = '7e57c0de-0000-4000-8000-0000000000a5')
    = 'cs-test-guesser',
  '12.6 display name falls back to the email name');

-- ---------------------------------------------------------------------------

reset role;
do $$ begin raise notice 'team review tests: all passed'; end $$;
drop function public.cs_test_expect_error(text, text, text);
drop function public.cs_test_assert(boolean, text);

rollback;
