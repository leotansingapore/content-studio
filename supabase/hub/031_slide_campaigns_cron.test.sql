-- Tests for 031_slide_campaigns_cron.sql. Run AFTER 031 is applied, as the migration owner:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/hub/031_slide_campaigns_cron.test.sql
--
-- Reads cron.job only, inside a transaction that rolls back. A clean run ends with NOTICE
-- "slide campaign cron tests: all passed".

begin;

do $$
declare j record;
begin
  select * into j from cron.job where jobname = 'slide-campaigns-tick';
  if not found then raise exception 'FAIL 1 the job is scheduled'; end if;
  if j.schedule <> '*/5 * * * *' then raise exception 'FAIL 2 every 5 minutes, got %', j.schedule; end if;
  if j.command not like '%vault.decrypted_secrets%cs_slide_campaigns_secret%' then raise exception 'FAIL 3 the header is read from Vault when it runs'; end if;
  if j.command not like '%/functions/v1/slide-campaigns%' then raise exception 'FAIL 4 it calls slide-campaigns'; end if;
  if j.command not like '%where exists%status = ''live''%' then raise exception 'FAIL 5 it skips the call when nothing is due'; end if;
  if (select count(*) from cron.job where jobname = 'slide-campaigns-tick') <> 1 then raise exception 'FAIL 6 one job, not two'; end if;
  raise notice 'slide campaign cron tests: all passed';
end $$;

rollback;
