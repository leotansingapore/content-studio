-- Schedules slideshow campaigns (030): every 5 minutes pg_cron asks slide-campaigns to make the runs due in the next
-- 20 minutes and hand each to the account's TikTok drafts for its posting time. The call is skipped when no live
-- campaign is due, so a quiet tick costs one indexed read.
-- pg_cron reads schedules in UTC here (cron.timezone is GMT on academy); the campaigns' own times carry their zone.
--
-- Security model
--   * slide-campaigns is deployed --no-verify-jwt and refuses a cron call without x-slide-campaigns-secret matching
--     its secret SLIDE_CAMPAIGNS_SECRET. The job reads that header from Vault (cs_slide_campaigns_secret) when it
--     runs, so the value is never in this file or in cron.job.
--   * Nothing here creates a table or a function, and nothing is granted.
-- Before applying: put the secret in Vault by hand, never in this repo (the macOS keychain item
-- cs-slide-campaigns-secret, the same value set as the edge secret):
--   echo "select vault.create_secret(:'s', 'cs_slide_campaigns_secret', 'slide-campaigns cron header');" |
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v s="$(security find-generic-password -s cs-slide-campaigns-secret -a leo -w)"
-- This file refuses to schedule anything while that Vault secret is missing or empty.
-- Idempotent: the job is unscheduled by name first. One transaction; lock_timeout gives up after 3 seconds.

begin;
set local lock_timeout = '3s';

do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'cs_slide_campaigns_secret' and coalesce(decrypted_secret, '') <> ''
  ) then
    raise exception 'Put cs_slide_campaigns_secret in Vault first (see the header of 031).';
  end if;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'slide-campaigns-tick';

select cron.schedule('slide-campaigns-tick', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://hgdbflprrficdoyxmdxe.supabase.co/functions/v1/slide-campaigns',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-slide-campaigns-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cs_slide_campaigns_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  )
  where exists (
    select 1 from public.cs_slide_campaigns
    where status = 'live' and next_run_at <= now() + interval '20 minutes'
  );
$$);

commit;
