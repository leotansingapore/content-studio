-- Schedules the connected-accounts safety jobs (supabase/functions/social-sweep,
-- docs/zernio-connection.md M5 and M6). Both must run before SOCIAL_CONNECT_USERS
-- opens beyond Leo.
--   social-sweep-recount  daily at 03:15 Singapore time (19:15 UTC): the team-wide
--     recount, so an account over the per-adviser or team cap stops billing within a
--     day even when nobody opens Social accounts or connects.
--   social-sweep-orphans  Sundays at 03:45 Singapore time (Saturday 19:45 UTC): the
--     Zernio profiles of deleted users lose their pending posts, auto-DMs and
--     accounts (the empty profile stays), and advisers taken off the allowlist who
--     still have accounts are listed for Leo.
-- pg_cron reads schedules in UTC here (cron.timezone is GMT on academy).
--
-- Security model
--   * social-sweep is deployed --no-verify-jwt and refuses any request without the
--     x-social-sweep-secret header matching its secret SOCIAL_SWEEP_SECRET. Each job
--     reads that header from Vault (cs_social_sweep_secret) when it runs, so the value
--     is never in this file or in cron.job.
--   * The jobs send no dryRun: they are the real runs. Test by hand with
--     {"job": "orphans", "dryRun": true}.
--   * Nothing here creates a table or a function, and nothing is granted.
--
-- Before applying: put the secret in Vault by hand, never in this repo. The value is
-- the macOS keychain item cs-social-sweep-secret (the same one set as the edge
-- secret on 2026-10-11). psql interpolates a variable only in a statement it reads,
-- so pipe the statement in:
--   echo "select vault.create_secret(:'s', 'cs_social_sweep_secret', 'social-sweep cron header');" |
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v s="$(security find-generic-password -s cs-social-sweep-secret -a leo -w)"
-- (Through the Management API instead: build that statement with the value in a
-- scratch file, send it, delete the file.) This file refuses to schedule anything
-- while that Vault secret is missing or empty.
--
-- Locks: only rows of cron.job; lock_timeout gives up after 3 seconds rather than
-- wait. Run it again later if it times out.
--
-- Idempotent: both jobs are unscheduled by name first; safe to run again. One
-- transaction.

begin;
set local lock_timeout = '3s';

do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'cs_social_sweep_secret' and coalesce(decrypted_secret, '') <> ''
  ) then
    raise exception 'Put cs_social_sweep_secret in Vault first (see the header of 021).';
  end if;
end $$;

select cron.unschedule(jobid) from cron.job where jobname in ('social-sweep-recount', 'social-sweep-orphans');
select cron.schedule(
  'social-sweep-recount',
  '15 19 * * *',
  $$
  select net.http_post(
    url := 'https://hgdbflprrficdoyxmdxe.supabase.co/functions/v1/social-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-social-sweep-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'cs_social_sweep_secret')
    ),
    body := '{"job": "recount"}'::jsonb,
    -- the function answers when the run is done: a few Zernio calls per account over a cap
    timeout_milliseconds := 120000
  );
  $$
);
select cron.schedule(
  'social-sweep-orphans',
  '45 19 * * 6',
  $$
  select net.http_post(
    url := 'https://hgdbflprrficdoyxmdxe.supabase.co/functions/v1/social-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-social-sweep-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'cs_social_sweep_secret')
    ),
    body := '{"job": "orphans"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

commit;
