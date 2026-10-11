-- Tests for 021_social_sweep.sql. Run AFTER 021 is applied, as the migration owner:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/021_social_sweep.test.sql
--
-- One transaction ending in ROLLBACK; nothing persists. A failed check raises
-- "FAIL <n> ..." and aborts. A clean run ends with NOTICE
-- "social sweep tests: all passed".
--
-- Section 2 runs each job's own command, but only against the throwaway stand-in
-- for net.http_post (it records the call in net.cs_standin_calls); on a real
-- database it is skipped, so the test never sends a request.

begin;

create function public.cs_test_assert(p_ok boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'FAIL %', p_label;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. The jobs as scheduled
-- ---------------------------------------------------------------------------

create temp view cs_test_jobs as
select jobname, schedule, regexp_replace(command, '\s+', ' ', 'g') as cmd
from cron.job where jobname in ('social-sweep-recount', 'social-sweep-orphans');

select public.cs_test_assert(
  (select count(*) = 1 from cs_test_jobs where jobname = 'social-sweep-recount' and schedule = '15 19 * * *'),
  '1.1 one recount job, daily at 19:15 UTC (03:15 Singapore)');
select public.cs_test_assert(
  (select count(*) = 1 from cs_test_jobs where jobname = 'social-sweep-orphans' and schedule = '45 19 * * 6'),
  '1.2 one orphans job, Saturdays 19:45 UTC (Sundays 03:45 Singapore)');
select public.cs_test_assert(
  coalesce(current_setting('cron.timezone', true), 'GMT') in ('GMT', 'UTC'),
  '1.3 pg_cron reads the schedules in UTC');
select public.cs_test_assert(
  (select count(*) = 2 and bool_and(
      cmd like '%net.http_post( url := ''https://hgdbflprrficdoyxmdxe.supabase.co/functions/v1/social-sweep'',%'
      and cmd like '%''x-social-sweep-secret'', (select decrypted_secret from vault.decrypted_secrets where name = ''cs_social_sweep_secret'')%'
      and cmd like '%timeout_milliseconds := 10000 %'
      -- one statement, and it is the post
      and cmd ~ '^ ?select net\.http_post\(' and length(cmd) - length(replace(cmd, ';', '')) = 1
      and cmd not ilike '%dryRun%'
      and cmd not ilike '%delete%' and cmd not ilike '%unschedule%')
   from cs_test_jobs),
  '1.4 each job posts to social-sweep with the Vault secret read when it runs, as a real run, and does nothing else');
select public.cs_test_assert(
  (select cmd like '%body := ''{"job": "recount"}''::jsonb%' and cmd not like '%orphans%' from cs_test_jobs where jobname = 'social-sweep-recount')
  and (select cmd like '%body := ''{"job": "orphans"}''::jsonb%' and cmd not like '%recount%' from cs_test_jobs where jobname = 'social-sweep-orphans'),
  '1.5 each job asks for its own job');
select public.cs_test_assert(
  (select count(*) = 1 and bool_and(coalesce(decrypted_secret, '') <> '')
   from vault.decrypted_secrets where name = 'cs_social_sweep_secret')
  and not exists (
    select 1 from cron.job, vault.decrypted_secrets s
    where s.name = 'cs_social_sweep_secret' and position(s.decrypted_secret in cron.job.command) > 0),
  '1.6 the secret is in Vault once and in no job''s command');
select public.cs_test_assert(
  not exists (select 1 from cron.job where command like '%/functions/v1/social-sweep%'
                and jobname not in ('social-sweep-recount', 'social-sweep-orphans'))
  and exists (select 1 from cron.job where jobname = 'notify-hourly'),
  '1.7 no other job calls social-sweep, and the other jobs are still there');

-- ---------------------------------------------------------------------------
-- 2. Running each job (throwaway stand-in only)
-- ---------------------------------------------------------------------------

do $$
declare
  v_job text;
begin
  if to_regclass('net.cs_standin_calls') is null then
    raise notice 'section 2 skipped: net.http_post is real here';
    return;
  end if;
  foreach v_job in array array['recount', 'orphans'] loop
    delete from net.cs_standin_calls;
    execute (select command from cron.job where jobname = 'social-sweep-' || v_job);
    perform public.cs_test_assert(
      (select count(*) = 1
         and bool_and(url = 'https://hgdbflprrficdoyxmdxe.supabase.co/functions/v1/social-sweep'
           and headers = jsonb_build_object('Content-Type', 'application/json', 'x-social-sweep-secret',
                 (select decrypted_secret from vault.decrypted_secrets where name = 'cs_social_sweep_secret'))
           and body = jsonb_build_object('job', v_job)
           and timeout_milliseconds = 10000)
       from net.cs_standin_calls),
      '2.1 the ' || v_job || ' job posts once, with the secret from Vault and its own job');
  end loop;
end $$;

do $$ begin raise notice 'social sweep tests: all passed'; end $$;
rollback;
