-- "Your account audit" on the Analytics page (Instagram + TikTok).
-- Rows are written only by the audit-social-account and refresh-social-audits
-- edge functions (service role). Signed-in users can read and delete their own
-- audits and read their own snapshots. Idempotent.

create table if not exists public.cs_social_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'tiktok')),
  handle text not null check (handle ~ '^[a-z0-9._]{1,30}$'),
  status text not null default 'pending'
    check (status in ('pending', 'refreshing', 'ready', 'error')),
  error text,
  profile jsonb,
  posts jsonb not null default '[]'::jsonb,
  stats jsonb,
  advice jsonb,
  fetched_at timestamptz,
  refresh_started_at timestamptz,
  last_viewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, platform, handle)
);

create index if not exists cs_social_audits_due_idx
  on public.cs_social_audits (fetched_at)
  where status <> 'refreshing';

alter table public.cs_social_audits enable row level security;

drop policy if exists cs_social_audits_owner_read on public.cs_social_audits;
create policy cs_social_audits_owner_read on public.cs_social_audits
  for select to authenticated using (user_id = auth.uid());

drop policy if exists cs_social_audits_owner_delete on public.cs_social_audits;
create policy cs_social_audits_owner_delete on public.cs_social_audits
  for delete to authenticated using (user_id = auth.uid());

-- One row per successful refresh, for "since last week" changes.
create table if not exists public.cs_social_snapshots (
  id bigint generated always as identity primary key,
  audit_id uuid not null references public.cs_social_audits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  taken_at timestamptz not null default now(),
  followers integer,
  posts_analyzed integer not null,
  median_views numeric,
  median_engagement_rate numeric,
  posts_per_week numeric
);

create index if not exists cs_social_snapshots_audit_idx
  on public.cs_social_snapshots (audit_id, taken_at desc);

alter table public.cs_social_snapshots enable row level security;

drop policy if exists cs_social_snapshots_owner_read on public.cs_social_snapshots;
create policy cs_social_snapshots_owner_read on public.cs_social_snapshots
  for select to authenticated using (user_id = auth.uid());

-- Every refresh started (paid scrape), for the per-user daily cap and cost checks.
-- No policies: service role only.
create table if not exists public.cs_social_audit_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  audit_id uuid references public.cs_social_audits(id) on delete set null,
  source text not null check (source in ('open', 'weekly')),
  at timestamptz not null default now()
);

create index if not exists cs_social_audit_runs_user_idx
  on public.cs_social_audit_runs (user_id, at desc);

alter table public.cs_social_audit_runs enable row level security;

-- Hourly: refresh up to 3 audits that are a week old (see refresh-social-audits).
-- The shared secret is read from Vault (cs_audit_refresh_secret) and matches the
-- function secret AUDIT_REFRESH_SECRET. It is never stored in this file.
select cron.unschedule(jobid) from cron.job where jobname = 'refresh-social-audits-hourly';
select cron.schedule(
  'refresh-social-audits-hourly',
  '23 * * * *',
  $$
  select net.http_post(
    url := 'https://hgdbflprrficdoyxmdxe.supabase.co/functions/v1/refresh-social-audits',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-refresh-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'cs_audit_refresh_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);
