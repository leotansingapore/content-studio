-- Link-in-bio page (gap s53). An adviser publishes a page at /l/<slug> with
-- their photo, name, a short line and up to 20 links (prefilled from the
-- brand kit), and sees how many people clicked each link. One page per
-- brand profile. Used by the link-in-bio edge function and
-- src/lib/bioPage.ts.
--
-- Depends on 011_team_review.sql (cs_clean_label).
--
-- Security model
--   * The page is public by design: anything saved with published = true is
--     shown to anyone with the slug. The table holds nothing else.
--   * anon gets nothing: no table privilege, no function EXECUTE. Visitors
--     reach the page only through the link-in-bio edge function (deployed
--     --no-verify-jwt), which holds the service key and calls the two
--     service_role-only functions below.
--   * Clicks go through the edge function's redirect, which looks up the
--     link's URL by (slug, link id) on the server. It never redirects to a
--     URL taken from the request, so it is not an open redirect. Saved URLs
--     must be http(s), with a host of letters, digits, dots and hyphens and
--     an optional port, and no spaces, control characters or backslashes
--     after it; javascript:, data:, user@host and backslash tricks cannot be
--     stored. The edge function re-parses the URL with new URL(), requires
--     http/https again and redirects to url.href.
--   * Slugs: the app's own route names and words like admin, api, login,
--     review, help or settings are reserved. A slug that is released (renamed
--     or deleted) is held for 30 days, so nobody else can pick up an address
--     still printed in someone's Instagram bio. The owner can take it back.
--     Changes take advisory locks per slug in sorted order, so a release and
--     a grab cannot race.
--   * The owner reads their pages and click counts through RLS (SELECT only)
--     and writes only through the SECURITY DEFINER functions. Unpublishing or
--     deleting is a server-side change, never a synced localStorage key.
--   * Every function pins search_path = public, pg_temp. Oversized raw input
--     is refused before any normalising regex runs.
--   * Caps: 10 pages per account, 20 links per page, labels 1-60 characters,
--     URLs up to 2,048, name 1-80, line up to 160, photo a PNG/JPEG/WebP data
--     URL up to 350,000 characters (the brand kit's own cap). Click counting
--     stops at 5,000 per link per Singapore day (the redirect still works);
--     the edge function also skips counting obvious bots.
--
-- Grants, one by one
--   tables cs_bio_pages, cs_bio_clicks
--     revoke all from public, anon, authenticated: undoes Supabase's default
--       ALL grant; no client role can write.
--     grant select to authenticated: for RLS reads of the caller's own rows.
--   table cs_bio_slug_holds
--     revoke all from public, anon, authenticated, and no policy: only the
--       definer functions read or write it.
--   functions
--     cs_bio_lock_slugs: internal helper, revoked from public, anon and
--       authenticated.
--     cs_save_bio_page, cs_delete_bio_page: revoked from public and anon,
--       granted to authenticated.
--     cs_bio_page_public, cs_bio_click: revoked from public, anon and
--       authenticated, granted to service_role only.
--
-- Policies
--   cs_bio_pages_owner_read: owner_id = auth.uid().
--   cs_bio_clicks_owner_read: clicks on a page the caller owns.
--
-- Idempotent: safe to run again. One transaction; gives up after 3 seconds
-- waiting for a lock.

begin;
set local lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.cs_bio_pages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- src/lib/profiles.ts ids: "me" or p + base-36 characters.
  profile_id text not null check (profile_id ~ '^[a-z0-9]{1,40}$'),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  headline text not null default '' check (char_length(headline) <= 160),
  photo text check (
    char_length(photo) <= 350000
    and photo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'
  ),
  -- [{id: uuid, label, url}], shaped by cs_save_bio_page.
  links jsonb not null default '[]'::jsonb
    check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 20),
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cs_bio_pages_one_per_profile unique (owner_id, profile_id)
);

create table if not exists public.cs_bio_clicks (
  page_id uuid not null references public.cs_bio_pages(id) on delete cascade,
  link_id uuid not null,
  day date not null,
  count integer not null default 0 check (count >= 0),
  primary key (page_id, link_id, day)
);

-- Slugs released in the last 30 days, kept for their last owner.
create table if not exists public.cs_bio_slug_holds (
  slug text primary key,
  owner_id uuid not null,
  released_at timestamptz not null default now()
);

alter table public.cs_bio_pages enable row level security;
alter table public.cs_bio_clicks enable row level security;
alter table public.cs_bio_slug_holds enable row level security;

revoke all on table public.cs_bio_pages, public.cs_bio_clicks, public.cs_bio_slug_holds
  from public, anon, authenticated;
grant select on table public.cs_bio_pages, public.cs_bio_clicks to authenticated;

-- Locks the given slugs in sorted order (no deadlocks between two saves).
create or replace function public.cs_bio_lock_slugs(p_slugs text[]) returns void
language plpgsql set search_path = public, pg_temp as $$
declare
  v_slug text;
begin
  for v_slug in select distinct s from unnest(p_slugs) s where s is not null order by s loop
    perform pg_advisory_xact_lock(hashtextextended('cs_bio_slug:' || v_slug, 0));
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Owner (authenticated) functions
-- ---------------------------------------------------------------------------

-- Creates or replaces the caller's page for one profile. p_links is
-- [{id?, label, url}]; a missing, malformed or repeated id gets a new uuid,
-- so a link keeps its click history only while its id is sent back.
create or replace function public.cs_save_bio_page(
  p_profile_id text,
  p_slug text,
  p_display_name text,
  p_headline text,
  p_photo text,
  p_links jsonb,
  p_published boolean default true
) returns public.cs_bio_pages
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_page_limit constant int := 10;
  c_url_re constant text := '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]\\]*)?$';
  -- Admin-ish words and every top-level route in src/App.tsx.
  c_reserved constant text[] := array[
    'admin', 'api', 'login', 'logout', 'signup', 'auth', 'app', 'l', 'review', 'www', 'help',
    'support', 'settings', 'bio', 'mb-studio', 'content-studio',
    'academy', 'analytics', 'board', 'brand', 'calendar', 'carousel', 'clone', 'coach',
    'connect', 'create-guide', 'diagnosis', 'drafts', 'edit', 'fads', 'feedback', 'generate',
    'grid', 'home', 'hub', 'inspiration', 'media', 'plan', 'playbook', 'profiles', 'recruit',
    'reels', 'roadmap', 'swipe', 'team', 'trends', 'tutorial', 'voice', 'welcome'
  ];
  v_uid uuid := auth.uid();
  v_slug text;
  v_old_slug text;
  v_name text;
  v_headline text;
  v_photo text;
  v_links jsonb := '[]'::jsonb;
  v_ids uuid[] := '{}';
  v_item jsonb;
  v_id uuid;
  v_label text;
  v_url text;
  v_row public.cs_bio_pages%rowtype;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if coalesce(p_profile_id, '') !~ '^[a-z0-9]{1,40}$' then
    raise exception 'This profile has no valid id.' using errcode = '22023';
  end if;
  -- Bound the raw input before any regex runs over it.
  if char_length(p_slug) > 200 or char_length(p_display_name) > 400
     or char_length(p_headline) > 1000 or char_length(p_photo) > 350100 then
    raise exception 'Something on this page is far too long. Shorten it and try again.' using errcode = '22023';
  end if;
  v_slug := lower(btrim(coalesce(p_slug, '')));
  v_name := public.cs_clean_label(p_display_name);
  v_headline := public.cs_clean_label(p_headline);
  v_photo := nullif(btrim(coalesce(p_photo, '')), '');
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then
    raise exception 'Use 3 to 40 lowercase letters, numbers or hyphens for your address.' using errcode = '22023';
  end if;
  if v_slug = any (c_reserved) then
    raise exception 'That address is reserved. Try another.' using errcode = '22023';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'Add your name (up to 80 characters).' using errcode = '22023';
  end if;
  if char_length(v_headline) > 160 then
    raise exception 'Keep the line under your name to 160 characters.' using errcode = '22023';
  end if;
  if v_photo is not null and (
       char_length(v_photo) > 350000
       or v_photo !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$') then
    raise exception 'Use a PNG, JPEG or WebP photo under 350 KB.' using errcode = '22023';
  end if;
  if p_links is null or jsonb_typeof(p_links) <> 'array'
     or jsonb_array_length(p_links) > 20 or octet_length(p_links::text) > 100000 then
    raise exception 'Add up to 20 links.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_links) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'The links sent with this page are malformed.' using errcode = '22023';
    end if;
    v_label := public.cs_clean_label(v_item ->> 'label');
    if char_length(v_label) not between 1 and 60 then
      raise exception 'Give each link a label of up to 60 characters.' using errcode = '22023';
    end if;
    v_url := btrim(coalesce(v_item ->> 'url', ''));
    if char_length(v_url) > 2048 or v_url !~* c_url_re then
      raise exception 'Each link must be a web address starting with https://' using errcode = '22023';
    end if;
    v_id := case
      when (v_item ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (v_item ->> 'id')::uuid
    end;
    if v_id is null or v_id = any (v_ids) then
      v_id := gen_random_uuid();
    end if;
    v_ids := v_ids || v_id;
    v_links := v_links || jsonb_build_array(jsonb_build_object('id', v_id, 'label', v_label, 'url', v_url));
  end loop;

  perform pg_advisory_xact_lock(hashtextextended('cs_bio_page:' || v_uid::text, 0));
  select slug into v_old_slug from public.cs_bio_pages where owner_id = v_uid and profile_id = p_profile_id;
  if v_old_slug is null
     and (select count(*) from public.cs_bio_pages where owner_id = v_uid) >= c_page_limit then
    raise exception 'You already have 10 link-in-bio pages. Delete one to make another.' using errcode = '54000';
  end if;

  perform public.cs_bio_lock_slugs(array[v_old_slug, v_slug]);
  if exists (
    select 1 from public.cs_bio_slug_holds
    where slug = v_slug and owner_id <> v_uid and released_at > now() - interval '30 days'
  ) then
    raise exception 'That address was in use recently. Try another.' using errcode = '23505';
  end if;

  begin
    insert into public.cs_bio_pages as p (
      owner_id, profile_id, slug, display_name, headline, photo, links, published
    ) values (
      v_uid, p_profile_id, v_slug, v_name, v_headline, v_photo, v_links, coalesce(p_published, true)
    )
    on conflict (owner_id, profile_id) do update
    set slug = excluded.slug,
        display_name = excluded.display_name,
        headline = excluded.headline,
        photo = excluded.photo,
        links = excluded.links,
        published = excluded.published,
        updated_at = now()
    returning * into v_row;
  exception when unique_violation then
    raise exception 'That address is taken. Try another.' using errcode = '23505';
  end;

  if v_old_slug is not null and v_old_slug <> v_slug then
    insert into public.cs_bio_slug_holds (slug, owner_id, released_at)
    values (v_old_slug, v_uid, now())
    on conflict (slug) do update set owner_id = excluded.owner_id, released_at = excluded.released_at;
  end if;
  return v_row;
end $$;

-- Deletes the caller's page for one profile, with its click counts, and
-- holds its slug for 30 days. Returns whether there was one.
create or replace function public.cs_delete_bio_page(p_profile_id text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_slug text;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cs_bio_page:' || v_uid::text, 0));
  select slug into v_slug from public.cs_bio_pages where owner_id = v_uid and profile_id = p_profile_id;
  if v_slug is null then
    return false;
  end if;
  perform public.cs_bio_lock_slugs(array[v_slug]);
  delete from public.cs_bio_pages where owner_id = v_uid and profile_id = p_profile_id;
  insert into public.cs_bio_slug_holds (slug, owner_id, released_at)
  values (v_slug, v_uid, now())
  on conflict (slug) do update set owner_id = excluded.owner_id, released_at = excluded.released_at;
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- Public page (service_role only, called by the link-in-bio edge function)
-- ---------------------------------------------------------------------------

-- The published page for a slug, or null. Link URLs stay on the server: the
-- page links to the redirect, which counts the click.
create or replace function public.cs_bio_page_public(p_slug text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'slug', p.slug,
    'display_name', p.display_name,
    'headline', p.headline,
    'photo', p.photo,
    'links', coalesce((
      select jsonb_agg(jsonb_build_object('id', e -> 'id', 'label', e -> 'label') order by o)
      from jsonb_array_elements(p.links) with ordinality as x(e, o)
    ), '[]'::jsonb)
  )
  from public.cs_bio_pages p
  where p.slug = lower(p_slug) and p.published
$$;

-- The URL to send the visitor to, or null for an unknown or unpublished
-- page or link. Counts the click unless that link already has 5,000 today
-- (Singapore time); the conditional upsert keeps the cap exact under
-- concurrent clicks. p_count = false (a bot) returns the URL without counting.
create or replace function public.cs_bio_click(p_slug text, p_link_id uuid, p_count boolean default true)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_daily_cap constant int := 5000;
  v_page_id uuid;
  v_url text;
begin
  select p.id, e ->> 'url' into v_page_id, v_url
  from public.cs_bio_pages p
  cross join lateral jsonb_array_elements(p.links) e
  where p.slug = lower(p_slug) and p.published and e ->> 'id' = p_link_id::text
  limit 1;
  if v_url is null then
    return null;
  end if;
  if coalesce(p_count, true) then
    insert into public.cs_bio_clicks as c (page_id, link_id, day, count)
    values (v_page_id, p_link_id, (now() at time zone 'Asia/Singapore')::date, 1)
    on conflict (page_id, link_id, day) do update
      set count = c.count + 1
      where c.count < c_daily_cap;
  end if;
  return v_url;
end $$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on function public.cs_bio_lock_slugs(text[]) from public, anon, authenticated;
revoke all on function public.cs_save_bio_page(text, text, text, text, text, jsonb, boolean) from public, anon;
revoke all on function public.cs_delete_bio_page(text) from public, anon;
grant execute on function public.cs_save_bio_page(text, text, text, text, text, jsonb, boolean) to authenticated;
grant execute on function public.cs_delete_bio_page(text) to authenticated;

revoke all on function public.cs_bio_page_public(text) from public, anon, authenticated;
revoke all on function public.cs_bio_click(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.cs_bio_page_public(text) to service_role;
grant execute on function public.cs_bio_click(text, uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Policies (SELECT only)
-- ---------------------------------------------------------------------------

drop policy if exists cs_bio_pages_owner_read on public.cs_bio_pages;
create policy cs_bio_pages_owner_read on public.cs_bio_pages
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists cs_bio_clicks_owner_read on public.cs_bio_clicks;
create policy cs_bio_clicks_owner_read on public.cs_bio_clicks
  for select to authenticated
  using (exists (
    select 1 from public.cs_bio_pages p
    where p.id = page_id and p.owner_id = (select auth.uid())
  ));

commit;
