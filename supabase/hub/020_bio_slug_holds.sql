-- Link-in-bio slug holds when an account is deleted (fixes a 015 gap). 015
-- holds a released slug for 30 days only when the owner renames or deletes a
-- page through its functions; deleting the account cascades to cs_bio_pages
-- with no hold, so anyone could take /l/<slug> while the old bio still links
-- to it. Same rule as 019's tracked links: one trigger holds the slug on every
-- delete or slug change, for 30 days while the account exists and for a year
-- once it is deleted (released_at set 335 days ahead, so 015's 30-day check
-- and the prune below need no change). 015's functions still write their own
-- holds; the trigger writes the same row first, so nothing changes for them.
--
-- Depends on 015_link_in_bio.sql (cs_bio_slug_holds, cs_bio_lock_slugs) and
-- pg_cron.
--
-- Grants: cs_bio_hold_slug is a trigger function (SECURITY DEFINER, so it
-- writes the hold whoever deletes), revoked from public, anon and
-- authenticated.
--
-- Cron: bio-slug-hold-prune runs daily at 04:29 UTC and deletes holds whose
-- 30 days have run out. It posts nothing and reads no secret.
--
-- Idempotent: safe to run again. One transaction; gives up after 3 seconds
-- waiting for a lock.

begin;
set local lock_timeout = '3s';

create or replace function public.cs_bio_hold_slug() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.slug = old.slug then
    return new;
  end if;
  -- A grab of this slug waits until the release commits, then sees the hold.
  perform public.cs_bio_lock_slugs(array[old.slug, case when tg_op = 'UPDATE' then new.slug end]);
  insert into public.cs_bio_slug_holds (slug, owner_id, released_at)
  values (old.slug, old.owner_id, case
    when exists (select 1 from auth.users u where u.id = old.owner_id) then now()
    -- A deleted account's slug is held a year: the 30-day window starts in 335 days.
    else now() + interval '335 days'
  end)
  on conflict (slug) do update set owner_id = excluded.owner_id, released_at = excluded.released_at;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

revoke all on function public.cs_bio_hold_slug() from public, anon, authenticated;

drop trigger if exists cs_bio_pages_hold_slug on public.cs_bio_pages;
create trigger cs_bio_pages_hold_slug
  before delete or update of slug on public.cs_bio_pages
  for each row execute function public.cs_bio_hold_slug();

select cron.unschedule(jobid) from cron.job where jobname = 'bio-slug-hold-prune';
select cron.schedule(
  'bio-slug-hold-prune',
  '29 4 * * *',
  $$delete from public.cs_bio_slug_holds where released_at < now() - interval '30 days'$$
);

commit;
