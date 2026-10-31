-- Slideshow campaigns (/design/campaigns): a post formula that makes a new TikTok slideshow on a schedule and sends
-- it to the brand's TikTok drafts, folded in from Volume (tryvolume.app) with its founders' permission (Leo, 31 Oct
-- 2026). Image libraries are the pictures a campaign draws from, one library per slide role (hook, content, CTA).
--
-- Tables
--   cs_image_libraries     a named set of pictures, per owner and brand (profile_id)
--   cs_library_images      one picture: a Pexels link, or an upload in cs-slide-campaigns at <owner>/lib/<uuid>.<ext>
--   cs_slide_campaigns     the formula (spec), the posting times (schedule), where it posts and when next
--   cs_slide_campaign_runs one made slideshow: its words, its PNGs at <owner>/runs/<run>/<n>.png, what Zernio said
--
-- Security model
--   * RLS on. Owners read their own rows; nobody else reads anything. Every write goes through the slide-campaigns
--     function (service role), which checks the spec, the caps and the posting switch; authenticated has select
--     only, so a client can't set a campaign live or point it at an account it doesn't hold.
--   * cs-slide-campaigns is a private bucket (10 MB, png/jpeg/webp). No storage.objects policy: nobody lists or
--     reads it directly; the function hands out short signed links.
--   * Files: a run's row (with its PNG paths) is written before the PNGs, and an upload's row before the upload, so
--     every file has a row. Each cron tick deletes example runs older than 7 days and posted runs older than 14 with
--     their files. Deleting a user removes their rows (on delete cascade) but not their files: remove the
--     <owner>/ folder by hand when an account is deleted.
--
-- Grants
--   all four tables: revoke all from public, anon, authenticated; grant select to authenticated;
--   select, insert, update, delete to service_role.
--
-- Idempotent: safe to run again. One transaction; lock_timeout gives up after 3 seconds.

begin;
set local lock_timeout = '3s';

create table if not exists public.cs_image_libraries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null check (profile_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cs_image_libraries_owner on public.cs_image_libraries (owner_id, profile_id);

create table if not exists public.cs_library_images (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.cs_image_libraries(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- a Pexels photo, or this owner's upload in the bucket
  src text not null,
  -- the photographer and their page, for stock photos
  credit jsonb check (credit is null or pg_column_size(credit) <= 1000),
  created_at timestamptz not null default now(),
  unique (library_id, src),
  constraint cs_library_images_src_check check (char_length(src) <= 500 and (src ~ '^https://images\.pexels\.com/[A-Za-z0-9/._?=&%-]+$' or src ~ ('^' || owner_id::text || '/lib/[0-9a-f-]{36}\.(jpg|png|webp)$')))
);
create index if not exists cs_library_images_library on public.cs_library_images (library_id);
create index if not exists cs_library_images_owner on public.cs_library_images (owner_id);

create table if not exists public.cs_slide_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null check (profile_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  name text not null default 'Untitled campaign' check (char_length(name) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'live', 'paused')),
  -- the formula: topic, hooks, slides, CTA, libraries per role, text styles, look, overlay (slideCampaign.ts)
  spec jsonb not null default '{}' check (pg_column_size(spec) <= 32000),
  -- {"tz": IANA zone, "times": [{"at": "HH:MM", "days": [0..6]}]}
  schedule jsonb not null default '{"tz": "Asia/Singapore", "times": [{"at": "09:00", "days": [0,1,2,3,4,5,6]}]}' check (pg_column_size(schedule) <= 4000),
  -- {"mode": "inbox"}: to the account's TikTok drafts (the only mode today)
  publish jsonb not null default '{"mode": "inbox"}' check (pg_column_size(publish) <= 1000),
  -- the Zernio account it posts to (checked against the owner's own Zernio profile when set)
  account_id text check (account_id ~ '^[0-9a-f]{24}$'),
  account_name text check (char_length(account_name) <= 120),
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_hook text check (char_length(last_hook) <= 200),
  last_error text check (char_length(last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- a live campaign always knows where and when it posts next
  constraint cs_slide_campaigns_live_check check (status <> 'live' or (account_id is not null and next_run_at is not null))
);
create index if not exists cs_slide_campaigns_owner on public.cs_slide_campaigns (owner_id, profile_id);
create index if not exists cs_slide_campaigns_due on public.cs_slide_campaigns (next_run_at) where status = 'live';

create table if not exists public.cs_slide_campaign_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.cs_slide_campaigns(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- preview: made in the studio (Generate); post: made by the schedule and sent to Zernio
  kind text not null check (kind in ('preview', 'post')),
  status text not null check (status in ('made', 'scheduled', 'failed')),
  hook text not null default '' check (char_length(hook) <= 200),
  caption text not null default '' check (char_length(caption) <= 2200),
  -- [{"role": "hook"|"content"|"cta", "text": "..."}]
  slides jsonb not null default '[]' check (pg_column_size(slides) <= 16000),
  -- PNG paths in cs-slide-campaigns, slide order
  files text[] not null default '{}' check (cardinality(files) <= 12),
  scheduled_for timestamptz,
  zernio_post_id text check (char_length(zernio_post_id) <= 80),
  error text check (char_length(error) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists cs_slide_campaign_runs_campaign on public.cs_slide_campaign_runs (campaign_id, created_at desc);
create index if not exists cs_slide_campaign_runs_owner on public.cs_slide_campaign_runs (owner_id);
create index if not exists cs_slide_campaign_runs_age on public.cs_slide_campaign_runs (created_at);

do $$
declare t text;
begin
  foreach t in array array['cs_image_libraries', 'cs_library_images', 'cs_slide_campaigns', 'cs_slide_campaign_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (owner_id = (select auth.uid()))', t || '_own', t);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cs-slide-campaigns', 'cs-slide-campaigns', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

commit;
