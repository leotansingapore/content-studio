-- The script desk's job queue (wave 1). The
-- studio never calls a model for these: the script-desk function files each request as a row holding its inputs only
-- (the dials, a topic or hook, the source reel, the user's Me, Product and audience; no prompt text), a paired worker
-- on Leo's Mac claims it through the script-worker function, builds the request from them and runs it on his own
-- Claude Code (Max plan), and the app reads the answer back.
--
-- Table
--   cs_ai_jobs   one request: who asked (owner_id, profile_id), its kind, the request, where it is (status), the
--                answer or the error, the worker that took it, and when it was filed, claimed and finished.
--
-- Security model
--   * RLS on. An owner reads their own rows; nobody else reads anything. Every write goes through the script-desk
--     function (filing, giving up on a job nobody took) or the script-worker function (claim, done, failed), both
--     on the service role; authenticated has select only, so nobody files a job or answers one from the browser.
--   * cs_claim_ai_job hands the oldest queued job of the given owners, filed within the pickup window, to one
--     worker: `for update skip locked`, so two workers polling at once never get the same row. Execute is
--     service_role only.
--   * A row holds the inputs (a pasted transcript, the user's Me and Product) and the answer.
--     script-desk deletes an owner's rows older than 7 days whenever that owner files a new one, so an owner who
--     stops filing keeps their last rows until they file again. Deleting a user removes their rows (on delete
--     cascade). Owners can read their own rows over the REST API: their own inputs and answers, no prompt text.
--
-- Grants
--   cs_ai_jobs: revoke all from public, anon, authenticated; grant select to authenticated; select, insert, update,
--   delete to service_role. cs_claim_ai_job: revoke all from public, anon, authenticated; execute to service_role.
--
-- Idempotent: safe to run again, until 034 is applied. After 034, never run this again: it would add the 3-argument
-- claim back beside 034's, and every claim would then fail as "not unique". One transaction; lock_timeout 3 seconds.

begin;
set local lock_timeout = '3s';

create table if not exists public.cs_ai_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null default 'me' check (profile_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  kind text not null check (kind in ('write', 'hooks', 'breakdown', 'rescript', 'claims')),
  -- the job's inputs (script-desk logic.ts JobInputs): what the worker builds Claude Code's request from
  request jsonb not null check (pg_column_size(request) <= 64000),
  status text not null default 'queued' check (status in ('queued', 'claimed', 'done', 'failed')),
  -- {text, model, ms}: Claude Code's answer as the worker read it
  result jsonb check (result is null or pg_column_size(result) <= 64000),
  error text check (char_length(error) <= 500),
  worker text check (char_length(worker) <= 80),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  done_at timestamptz,
  -- a claimed job knows who took it and when; a finished one when it finished, and a done one its answer
  constraint cs_ai_jobs_state_check check (
    (status = 'queued' and worker is null and claimed_at is null and done_at is null and result is null)
    or (status = 'claimed' and worker is not null and claimed_at is not null and done_at is null and result is null)
    or (status = 'done' and done_at is not null and result is not null and error is null)
    or (status = 'failed' and done_at is not null and result is null and error is not null)
  )
);
create index if not exists cs_ai_jobs_queued on public.cs_ai_jobs (created_at) where status = 'queued';
create index if not exists cs_ai_jobs_owner on public.cs_ai_jobs (owner_id, created_at desc);

alter table public.cs_ai_jobs enable row level security;
revoke all on table public.cs_ai_jobs from public, anon, authenticated;
grant select on table public.cs_ai_jobs to authenticated;
grant select, insert, update, delete on table public.cs_ai_jobs to service_role;
drop policy if exists cs_ai_jobs_own on public.cs_ai_jobs;
create policy cs_ai_jobs_own on public.cs_ai_jobs for select to authenticated using (owner_id = (select auth.uid()));

-- The oldest queued job of these owners filed in the last p_pickup_seconds, now claimed by p_worker; no row when
-- there is none. A job past the window is left for script-desk to fail: the person stopped waiting for it.
create or replace function public.cs_claim_ai_job(p_worker text, p_owners uuid[], p_pickup_seconds integer)
returns setof public.cs_ai_jobs
language sql
security invoker
set search_path = ''
as $$
  update public.cs_ai_jobs j
     set status = 'claimed', worker = p_worker, claimed_at = now()
   where j.status = 'queued'
     and j.id = (
       select q.id from public.cs_ai_jobs q
        where q.status = 'queued'
          and q.owner_id = any (p_owners)
          and q.created_at > now() - make_interval(secs => greatest(1, least(p_pickup_seconds, 600)))
        order by q.created_at
        limit 1
        for update skip locked
     )
  returning j.*;
$$;
revoke all on function public.cs_claim_ai_job(text, uuid[], integer) from public, anon, authenticated;
grant execute on function public.cs_claim_ai_job(text, uuid[], integer) to service_role;

commit;
