-- Carousel library (/carousels): Instagram carousels that beat their creator's usual engagement, imported from
-- Top Carousels with its owner's permission (Leo, 30 Oct 2026). One row per carousel, keyed by Top Carousels'
-- own id so a later import updates in place. The importer (~/Documents/Postmosis/carousel-import, service role)
-- is the only writer; every signed-in user reads.
--
-- Security model
--   * RLS on. One policy: authenticated reads rows that aren't hidden. anon reads nothing.
--   * hidden = true takes a carousel out of the app without losing the row. A creator's removal request also
--     deletes their objects from cs-carousels: hiding the row alone leaves the slide addresses working.
--   * The service role bypasses RLS, so its readers (carousel-fit) filter hidden themselves.
--   * cs-carousels is a public bucket of webp slides at <id>/<n>.webp and <id>/cover.webp. No storage.objects
--     policy, so nobody lists it; a slide is reachable only by an address the table gives a signed-in user.
--     2 MB at most, webp only.
--
-- Grants
--   table cs_carousels
--     revoke all from public, anon, authenticated: undoes Supabase's default ALL grant.
--     grant select to authenticated; select, insert, update, delete to service_role.
--
-- Idempotent: safe to run again. One transaction; lock_timeout gives up after 3 seconds.

begin;
set local lock_timeout = '3s';

create table if not exists public.cs_carousels (
  id uuid primary key,
  ig_url text not null check (ig_url ~ '^https://www\.instagram\.com/(p|reel)/[A-Za-z0-9_-]+/?$'),
  creator text not null check (creator ~ '^[A-Za-z0-9._]{1,30}$'),
  title text not null default '' check (char_length(title) <= 500),
  caption text not null default '' check (char_length(caption) <= 5000),
  -- what on-device OCR read off each slide, in slide order
  slide_text text[] not null default '{}' check (cardinality(slide_text) <= 20),
  topic text check (char_length(topic) <= 60),
  format text check (char_length(format) <= 40),
  -- slides stored in the bucket (0 to slides - 1); slide_count is the post's own count
  slides smallint not null check (slides between 1 and 20),
  slide_count smallint check (slide_count between 1 and 20),
  video_positions smallint[] not null default '{}',
  flags text[] not null default '{}',
  likes integer not null default 0 check (likes >= 0),
  comments integer not null default 0 check (comments >= 0),
  engagements integer generated always as (likes + comments) stored,
  -- times the creator's usual likes + comments (baseline)
  multiple numeric(8, 1) not null check (multiple >= 0),
  baseline integer check (baseline >= 0),
  provisional boolean not null default false,
  posted_at timestamptz not null,
  imported_at timestamptz not null,
  -- lower-case creator, title, caption, slide text and topic, written by the importer, for search
  search text not null default '' check (char_length(search) <= 20000),
  hidden boolean not null default false
);

alter table public.cs_carousels enable row level security;

revoke all on table public.cs_carousels from public, anon, authenticated;
grant select on table public.cs_carousels to authenticated;
grant select, insert, update, delete on table public.cs_carousels to service_role;

drop policy if exists cs_carousels_read on public.cs_carousels;
create policy cs_carousels_read on public.cs_carousels for select to authenticated using (not hidden);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cs-carousels', 'cs-carousels', true, 2097152, array['image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

commit;
