-- Example videos per trend drop: real public videos showing the trend in action,
-- so members have a filming reference. Filled by the scout. Idempotent.
alter table public.hub_trends
  add column if not exists example_video_urls text[] not null default '{}';
