-- Per-user daily caps for paid AI and scraping calls made by edge functions
-- (supabase/functions/_shared/usageCaps.ts). One row per user, feature and
-- UTC day, so caps reset at 08:00 Singapore time. Idempotent.
create table if not exists public.cs_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  day date not null default ((now() at time zone 'utc')::date),
  count integer not null default 0,
  primary key (user_id, feature, day)
);

alter table public.cs_ai_usage enable row level security;

drop policy if exists cs_ai_usage_read_own on public.cs_ai_usage;
create policy cs_ai_usage_read_own on public.cs_ai_usage
  for select to authenticated
  using (user_id = auth.uid());

-- Count one use atomically. Returns the new count, or null once the limit is
-- reached (the conditional update matches nothing). Service role only.
create or replace function public.cs_consume_ai_usage(
  p_user uuid,
  p_feature text,
  p_limit integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_limit is null or p_limit <= 0 then
    return null;
  end if;
  insert into public.cs_ai_usage as u (user_id, feature, day, count)
  values (p_user, p_feature, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, feature, day)
    do update set count = u.count + 1
    where u.count < p_limit
  returning u.count into v_count;
  return v_count;
end;
$$;

revoke all on function public.cs_consume_ai_usage(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.cs_consume_ai_usage(uuid, text, integer) to service_role;
