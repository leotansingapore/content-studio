-- "Clone a reel" (/clone): a cache of public Instagram reel and TikTok video
-- data read through Apify by the clone-reel edge function, so pasting the same
-- post again skips the scrape. Only the post's link, caption, transcript and
-- public numbers are stored: never video files, and nothing about the
-- consultant (the app keeps their breakdowns and scripts in localStorage).
--
-- Both tables are service role only: RLS is on and there are no policies, so
-- signed-in users can't read or write them directly. Idempotent.

create table if not exists public.cs_reel_sources (
  platform text not null check (platform in ('instagram', 'tiktok')),
  -- Instagram shortcode or TikTok video id.
  post_id text not null check (post_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  url text not null,
  author text not null default '',
  caption text not null default '',
  -- Kept once found. Null when the post has no speech, no subtitles or isn't a video.
  transcript text,
  is_video boolean not null default true,
  posted_at timestamptz,
  duration_sec integer,
  -- {views, likes, comments, shares, saves}; the function re-reads them after 24 hours.
  metrics jsonb,
  metrics_fetched_at timestamptz,
  -- TikTok short links (vm./vt.tiktok.com, tiktok.com/t/) that resolved to this video.
  aliases text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (platform, post_id)
);

create index if not exists cs_reel_sources_aliases_idx
  on public.cs_reel_sources using gin (aliases);

alter table public.cs_reel_sources enable row level security;

-- Apify runs still in progress, by link, so a retry after a timeout waits for
-- the same run instead of paying for a second one. Rows are removed when a run
-- finishes; anything older than a few minutes is ignored.
create table if not exists public.cs_reel_fetches (
  lookup_key text primary key,
  run_id text not null,
  started_at timestamptz not null default now()
);

alter table public.cs_reel_fetches enable row level security;
