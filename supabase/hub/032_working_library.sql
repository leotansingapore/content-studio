-- What's working (/working): TikTok photo slideshows that beat their creator's usual views, copied in from Volume
-- (tryvolume.app) with its founders' permission (Leo, 1 Nov 2026: "go through their entire app"). One row per
-- slideshow, keyed by the TikTok post id so a later import updates in place. The importer
-- (~/Documents/Postmosis/working-import, service role) is the only writer; every signed-in user reads.
-- Creators own their slides: the app credits @author and links the original post.
--
-- Security model
--   * RLS on. One policy: authenticated reads rows that aren't hidden. anon reads nothing.
--   * hidden = true takes a slideshow out of the app without losing the row. A creator's removal request also
--     deletes their objects from cs-working: hiding the row alone leaves the slide addresses working.
--   * cs-working is a public bucket of webp slides at <id>/<n>.webp. No storage.objects policy, so nobody lists or
--     writes it. The path is the public TikTok post id, so anyone with a post's id can fetch its slides: they are
--     public TikTok pictures already (review 1 Nov: accepted; a random path segment would hide them). 2 MB, webp only.
--
-- Grants
--   table cs_working_slideshows
--     revoke all from public, anon, authenticated: undoes Supabase's default ALL grant.
--     grant select to authenticated; select, insert, update, delete to service_role.
--
-- Idempotent: safe to run again. One transaction; lock_timeout gives up after 3 seconds.

begin;
set local lock_timeout = '3s';

create table if not exists public.cs_working_slideshows (
  id text primary key check (id ~ '^[0-9]{8,25}$'),
  url text not null check (url ~ '^https://www\.tiktok\.com/@[A-Za-z0-9._]{1,40}/(photo|video)/[0-9]{8,25}$'),
  author text not null check (author ~ '^[A-Za-z0-9._]{1,40}$'),
  followers integer check (followers >= 0),
  niche text not null check (niche ~ '^[a-z_]{1,40}$'),
  format text check (char_length(format) <= 40),
  -- the kind of hook (question, list, warning...) and the cover's words
  hook text check (char_length(hook) <= 40),
  hook_text text not null default '' check (char_length(hook_text) <= 500),
  structure text check (char_length(structure) <= 40),
  caption text not null default '' check (char_length(caption) <= 5000),
  summary text not null default '' check (char_length(summary) <= 2000),
  -- what each slide says, in slide order
  slide_text text[] not null default '{}' check (cardinality(slide_text) <= 40),
  -- slides stored in the bucket (1 to slides)
  slides smallint not null check (slides between 1 and 40),
  -- times the creator's usual views
  ratio numeric(8, 2) check (ratio >= 0),
  views bigint not null default 0 check (views >= 0),
  likes bigint not null default 0 check (likes >= 0),
  saves bigint not null default 0 check (saves >= 0),
  shares bigint not null default 0 check (shares >= 0),
  working_now boolean not null default false,
  promotional boolean not null default false,
  needs_person boolean not null default false,
  posted_at timestamptz,
  added_at date,
  -- lower-case author, caption, hook and slide text, written by the importer, for search
  search text not null default '' check (char_length(search) <= 20000),
  imported_at timestamptz not null default now(),
  hidden boolean not null default false
);
create index if not exists cs_working_slideshows_niche_views on public.cs_working_slideshows (niche, views desc);
create index if not exists cs_working_slideshows_niche_saves on public.cs_working_slideshows (niche, saves desc);
create index if not exists cs_working_slideshows_now on public.cs_working_slideshows (working_now, ratio desc);
create index if not exists cs_working_slideshows_niche_ratio on public.cs_working_slideshows (niche, ratio desc nulls last);

alter table public.cs_working_slideshows enable row level security;

revoke all on table public.cs_working_slideshows from public, anon, authenticated;
grant select on table public.cs_working_slideshows to authenticated;
grant select, insert, update, delete on table public.cs_working_slideshows to service_role;

drop policy if exists cs_working_slideshows_read on public.cs_working_slideshows;
create policy cs_working_slideshows_read on public.cs_working_slideshows for select to authenticated using (not hidden);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cs-working', 'cs-working', true, 2097152, array['image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

commit;
