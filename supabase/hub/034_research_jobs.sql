-- Research on the script desk's job queue (wave 2). Run AFTER 033. No new table: cs_ai_jobs takes three more kinds,
-- and the claim learns which kinds the worker has room for.
--
--   ig_reels   one Instagram creator's reels grid (the latest 12 reels with their numbers) and their profile
--   ig_reel    one reel's embed page (caption, video, numbers)
--   discover   a creator search: Claude Code with web search only, then each creator found is read
--
-- A row still holds inputs only (a handle, a reel link, a topic). An answer stays under the row's 64 KB check: the
-- worker clips captions and drops what the app doesn't keep, and script-worker refuses an answer over 60,000 bytes.
--
-- cs_claim_ai_job gains p_kinds (null: any kind, so a worker or a script-worker deployed before this keeps working).
-- The worker passes only the kinds it has a free slot for, so slow reads never hold up a script someone waits on.
-- The 3-argument function is replaced by the 4-argument one, and a 3-argument call resolves to it through the
-- default. Grants as 033: execute to service_role only.
--
-- Before applying, check the kind check's live name is cs_ai_jobs_kind_check:
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.cs_ai_jobs'::regclass;
--
-- Idempotent: safe to run again. One transaction; lock_timeout gives up after 3 seconds.

begin;
set local lock_timeout = '3s';

alter table public.cs_ai_jobs drop constraint if exists cs_ai_jobs_kind_check;
alter table public.cs_ai_jobs add constraint cs_ai_jobs_kind_check
  check (kind in ('write', 'hooks', 'breakdown', 'rescript', 'claims', 'ig_reels', 'ig_reel', 'discover'));

drop function if exists public.cs_claim_ai_job(text, uuid[], integer);

-- The oldest queued job of these owners (and, given p_kinds, of those kinds) filed in the last p_pickup_seconds, now
-- claimed by p_worker; no row when there is none. A job past the window is left for script-desk to fail.
create or replace function public.cs_claim_ai_job(p_worker text, p_owners uuid[], p_pickup_seconds integer, p_kinds text[] default null)
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
          and (p_kinds is null or q.kind = any (p_kinds))
          and q.created_at > now() - make_interval(secs => greatest(1, least(p_pickup_seconds, 600)))
        order by q.created_at
        limit 1
        for update skip locked
     )
  returning j.*;
$$;
revoke all on function public.cs_claim_ai_job(text, uuid[], integer, text[]) from public, anon, authenticated;
grant execute on function public.cs_claim_ai_job(text, uuid[], integer, text[]) to service_role;

commit;
