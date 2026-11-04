-- Tests for 034_research_jobs.sql. Run AFTER 033 and 034 are applied, as the migration owner, on a throwaway or local
-- database:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/034_research_jobs.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. Never run it through the Management API (it does not honour
-- the rollback). A failed check raises "FAIL <n> ..." and aborts. A clean run ends with NOTICE "research job tests: all
-- passed". 033_ai_jobs.test.sql still passes after 034 (it claims with three arguments).

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

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000a001');
-- a write filed first, then a read and a search
insert into public.cs_ai_jobs (id, owner_id, kind, request, created_at) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000a001', 'write', '{"topic": "a"}', now() - interval '20 seconds'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000a001', 'ig_reels', '{"handle": "x", "known": []}', now() - interval '10 seconds'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000a001', 'discover', '{"topic": "b"}', now() - interval '5 seconds');

-- 1-3: the kinds a row may have
insert into public.cs_ai_jobs (owner_id, kind, request) values ('00000000-0000-0000-0000-00000000a001', 'ig_reel', '{"url": "https://www.instagram.com/reel/x/"}');
select public.cs_test_assert((select count(*) = 4 from public.cs_ai_jobs where owner_id = '00000000-0000-0000-0000-00000000a001'), '1 ig_reels, ig_reel and discover are kinds');
select public.cs_test_expect_error(
  $$insert into public.cs_ai_jobs (owner_id, kind, request) values ('00000000-0000-0000-0000-00000000a001', 'carousel', '{}')$$,
  '%cs_ai_jobs_kind_check%', '2 a kind the desk does not make is still refused');
select public.cs_test_assert(
  (select count(*) = 1 from pg_proc where proname = 'cs_claim_ai_job' and pronamespace = 'public'::regnamespace),
  '3 one claim function, not an old and a new one side by side');

-- 4-7: claiming by kind
select public.cs_test_assert(
  (select id = '30000000-0000-0000-0000-000000000002'
     from public.cs_claim_ai_job('mac', array['00000000-0000-0000-0000-00000000a001']::uuid[], 120, array['ig_reels', 'ig_reel', 'discover'])),
  '4 a worker with only a read slot free gets the oldest read, not the older write');
select public.cs_test_assert(
  (select id = '30000000-0000-0000-0000-000000000001'
     from public.cs_claim_ai_job('mac', array['00000000-0000-0000-0000-00000000a001']::uuid[], 120, array['write', 'hooks', 'breakdown', 'rescript', 'claims'])),
  '5 and with a writing slot free, the write');
select public.cs_test_assert(
  (select count(*) = 0 from public.cs_claim_ai_job('mac', array['00000000-0000-0000-0000-00000000a001']::uuid[], 120, array['write'])),
  '6 nothing when no queued job is of those kinds');
select public.cs_test_assert(
  (select id = '30000000-0000-0000-0000-000000000003' from public.cs_claim_ai_job('mac', array['00000000-0000-0000-0000-00000000a001']::uuid[], 120)),
  '7 three arguments still claim any kind, oldest first');

-- 8: who may claim
set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000a001", "role": "authenticated"}';
select public.cs_test_expect_error(
  $$select * from public.cs_claim_ai_job('mine', array['00000000-0000-0000-0000-00000000a001']::uuid[], 120, null)$$,
  '%permission denied%', '8 a signed-in user still can''t claim');
reset role;

do $$ begin raise notice 'research job tests: all passed'; end $$;
rollback;
