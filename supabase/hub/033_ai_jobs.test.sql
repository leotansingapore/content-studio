-- Tests for 033_ai_jobs.sql. Run AFTER 033 is applied, as the migration owner, on a throwaway or local database:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/033_ai_jobs.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. Never run it through the Management API (it does not honour
-- the rollback). A failed check raises "FAIL <n> ..." and aborts. A clean run ends with NOTICE "ai job tests: all passed".
-- Two workers claiming at once is checked by 033.concurrency.sh.

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

-- two owners: a's three jobs (the oldest filed 20 minutes ago, past any pickup window), b's one
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000a001'), ('00000000-0000-0000-0000-00000000b002');
insert into public.cs_ai_jobs (id, owner_id, kind, request, created_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', 'write', '{"topic": "stale"}', now() - interval '20 minutes'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000a001', 'hooks', '{"topic": "older"}', now() - interval '30 seconds'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000a001', 'write', '{"topic": "newer"}', now() - interval '5 seconds'),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000b002', 'write', '{"topic": "theirs"}', now() - interval '40 seconds');

-- 1-6: what a row may hold
select public.cs_test_expect_error(
  $$insert into public.cs_ai_jobs (owner_id, kind, request) values ('00000000-0000-0000-0000-00000000a001', 'carousel', '{}')$$,
  '%cs_ai_jobs_kind_check%', '1 a kind the desk does not make');
select public.cs_test_expect_error(
  $$insert into public.cs_ai_jobs (owner_id, profile_id, kind, request) values ('00000000-0000-0000-0000-00000000a001', '../x', 'write', '{}')$$,
  '%cs_ai_jobs_profile_id_check%', '2 a brand id with a path in it');
select public.cs_test_expect_error(
  $$insert into public.cs_ai_jobs (owner_id, kind, request) values ('00000000-0000-0000-0000-00000000a001', 'write', jsonb_build_object('topic', repeat(md5(random()::text), 3000)))$$,
  '%cs_ai_jobs_request_check%', '3 a request over 64 KB');
select public.cs_test_expect_error(
  $$update public.cs_ai_jobs set status = 'done', done_at = now() where id = '10000000-0000-0000-0000-000000000002'$$,
  '%cs_ai_jobs_state_check%', '4 done with no answer');
select public.cs_test_expect_error(
  $$update public.cs_ai_jobs set status = 'claimed' where id = '10000000-0000-0000-0000-000000000002'$$,
  '%cs_ai_jobs_state_check%', '5 claimed with no worker or time');
select public.cs_test_expect_error(
  $$update public.cs_ai_jobs set status = 'failed', done_at = now() where id = '10000000-0000-0000-0000-000000000002'$$,
  '%cs_ai_jobs_state_check%', '6 failed with no reason');

-- 7-12: claiming
select public.cs_test_assert(
  (select count(*) = 0 from public.cs_claim_ai_job('mac', array['00000000-0000-0000-0000-00000000ffff']::uuid[], 120)),
  '7 nothing for an owner with no jobs');
select public.cs_test_assert(
  (select id = '10000000-0000-0000-0000-000000000002' and status = 'claimed' and worker = 'mac' and claimed_at is not null
     from public.cs_claim_ai_job('mac', array['00000000-0000-0000-0000-00000000a001']::uuid[], 120)),
  '8 the oldest queued job inside the window, not the stale one and not the other owner''s older one');
select public.cs_test_assert(
  (select id = '10000000-0000-0000-0000-000000000003' from public.cs_claim_ai_job('mac-2', array['00000000-0000-0000-0000-00000000a001']::uuid[], 120)),
  '9 the next claim takes the next job');
select public.cs_test_assert(
  (select count(*) = 0 from public.cs_claim_ai_job('mac', array['00000000-0000-0000-0000-00000000a001']::uuid[], 120)),
  '10 a job past the pickup window is never handed out');
select public.cs_test_assert(
  (select count(*) = 0 from public.cs_claim_ai_job('mac', array['00000000-0000-0000-0000-00000000b002']::uuid[], 10)),
  '11 a shorter window leaves a 40-second-old job alone');
select public.cs_test_assert(
  (select status = 'queued' from public.cs_ai_jobs where id = '10000000-0000-0000-0000-000000000001'),
  '12 the stale job is still queued, for script-desk to fail');
update public.cs_ai_jobs set status = 'done', done_at = now(), result = '{"text": "{}"}' where id = '10000000-0000-0000-0000-000000000002';

-- 13-18: who can do what
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000a001", "role": "authenticated"}';
select public.cs_test_assert((select count(*) = 3 from public.cs_ai_jobs), '13 an owner reads their own jobs');
select public.cs_test_assert((select count(*) = 0 from public.cs_ai_jobs where owner_id = '00000000-0000-0000-0000-00000000b002'), '14 and nobody else''s');
select public.cs_test_expect_error(
  $$insert into public.cs_ai_jobs (owner_id, kind, request) values ('00000000-0000-0000-0000-00000000a001', 'write', '{}')$$,
  '%permission denied%', '15 a signed-in user can''t file a job from the browser');
select public.cs_test_expect_error(
  $$update public.cs_ai_jobs set error = 'x' where id = '10000000-0000-0000-0000-000000000003'$$,
  '%permission denied%', '16 or answer one');
select public.cs_test_expect_error(
  $$select * from public.cs_claim_ai_job('mine', array['00000000-0000-0000-0000-00000000a001']::uuid[], 120)$$,
  '%permission denied%', '17 or claim one');
reset role;
set local role anon;
select public.cs_test_expect_error($$select count(*) from public.cs_ai_jobs$$, '%permission denied%', '18 anon reads nothing');
reset role;

-- 19: deleting a user removes their jobs
delete from auth.users where id = '00000000-0000-0000-0000-00000000b002';
select public.cs_test_assert((select count(*) = 0 from public.cs_ai_jobs where owner_id = '00000000-0000-0000-0000-00000000b002'), '19 a deleted user''s jobs go with them');

do $$ begin raise notice 'ai job tests: all passed'; end $$;
rollback;
