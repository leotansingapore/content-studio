-- Tracked short links and public campaign reports (gaps g39, g40). An adviser
-- makes a short link for any web address (an offer, a guide, a form), puts
-- /t/<slug> in a post, a DM or their bio, and sees how many taps it got per
-- day and how many different people tapped. Links can share a campaign name;
-- a campaign can have a public report page, switched on and off by its owner.
-- Used by a future tracked-link edge function and app screen; design and the
-- edge function's contract: docs/tracked-links.md.
--
-- Depends on 011_team_review.sql (cs_clean_label, cs_generate_invite_code)
-- and pg_cron (as 005 and 016).
--
-- Security model
--   * anon gets nothing: no table privilege, no function EXECUTE. Visitors
--     reach a link or a report only through the tracked-link edge function
--     (deployed --no-verify-jwt), which holds the service key and calls the
--     two service_role-only functions below.
--   * The redirect looks the URL up by slug on the server. It never redirects
--     to a URL taken from the request, so it is not an open redirect. Saved
--     URLs follow 015: http(s), a host of letters, digits, dots and hyphens
--     and an optional port, and no spaces, control characters or backslashes
--     after it; javascript:, data:, user@host and backslash tricks cannot be
--     stored. The edge function re-parses the URL and redirects to url.href.
--   * Unique people: the edge function sends a visitor key, the SHA-256 of the
--     app's own per-recipient ?r= token when the link carries a well-formed
--     one, else of the IP address and user agent. The raw IP never reaches
--     the database. The database stores only SHA-256(salt, scope, key): the
--     salt is 32 random bytes made when this file is first applied, readable
--     by no client role and not by service_role; the scope is the link's
--     campaign (or the link itself when it has none), so one person counts
--     once per campaign and the same person cannot be matched across
--     campaigns. Visitor rows are dropped 90 days after the first tap; a
--     person who comes back after that counts again.
--   * Slugs: the app's own route names and words like admin, api, login or
--     help are reserved. A released slug is held so nobody else can pick up
--     an address still printed in a post. One trigger writes every hold, on
--     any delete or rename of a link, including the cascade when an account
--     is deleted. A slug released by its owner is held for 30 days, and the
--     owner can take it back. A slug released because its account was
--     deleted is held for good: nobody can take it back, the account's posts
--     and bio links may stay up long after it is gone, and the rows are
--     bounded (100 per deleted account). Holds keep no foreign key to
--     auth.users, so they outlive the account. Saves and releases take
--     advisory locks per slug in sorted order, so a release and a grab
--     cannot race.
--   * Reports: off until the owner switches one on, which makes a random
--     20-character report slug (100 bits). Switching off deletes the slug, so
--     an old report link never works again; switching on later makes a new
--     one. A report shows the campaign name, total taps, people, the last 7
--     Singapore days and each link's label, address without its query string
--     or fragment, taps and people. No slug, id, account or owner detail.
--   * The owner reads their links, campaigns and daily counts through RLS
--     (SELECT only) and writes only through the SECURITY DEFINER functions.
--   * Every function pins search_path = public, pg_temp. Oversized raw input
--     is refused before any normalising regex runs.
--   * Caps: 100 links per account, labels and campaign names 1-60 characters,
--     URLs up to 2,048. Taps are counted up to 5,000 per link per Singapore
--     day (the redirect still works after that). New people are counted up to
--     1,000 per account per Singapore day, so visitor rows stay under about
--     91,000 per account. A campaign exists while it has a link.
--
-- Grants, one by one
--   tables cs_tracked_links, cs_tracked_link_campaigns, cs_tracked_link_days
--     revoke all from public, anon, authenticated: undoes Supabase's default
--       ALL grant; no client role can write.
--     grant select to authenticated: for RLS reads of the caller's own rows.
--   tables cs_tracked_link_visitors, cs_tracked_link_slug_holds
--     revoke all from public, anon, authenticated, and no policy: only the
--       definer functions and the prune job touch them.
--   table cs_tracked_link_salt
--     revoke all from public, anon, authenticated and service_role, and no
--       policy: only the definer click function reads it.
--   functions
--     cs_tracked_link_lock_slugs: internal helper, revoked from public, anon
--       and authenticated.
--     cs_tracked_link_hold_slug: trigger function (SECURITY DEFINER, so it
--       writes the hold whoever deletes), revoked from public, anon and
--       authenticated.
--     cs_save_tracked_link, cs_delete_tracked_link, cs_set_tracked_link_report:
--       revoked from public and anon, granted to authenticated.
--     cs_tracked_link_click, cs_tracked_link_report_public: revoked from
--       public, anon and authenticated, granted to service_role only.
--
-- Policies
--   cs_tracked_links_owner_read: owner_id = auth.uid().
--   cs_tracked_link_campaigns_owner_read: owner_id = auth.uid().
--   cs_tracked_link_days_owner_read: days of a link the caller owns.
--
-- Cron: tracked-link-prune runs daily at 04:23 UTC and deletes visitor rows
-- whose first tap is more than 90 Singapore days old and slug holds older
-- than 30 days (a deleted account's holds never age). It posts nothing and
-- reads no secret.
--
-- Locks: the two foreign keys to auth.users take SHARE ROW EXCLUSIVE on
-- auth.users for the length of this transaction; it is short, and
-- lock_timeout gives up after 3 seconds rather than queue sign-ins behind it.
-- Run it again later if it times out.
--
-- Idempotent: safe to run again (the salt is made once and kept). One
-- transaction; gives up after 3 seconds waiting for a lock.

begin;
set local lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.cs_tracked_link_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  -- Null while the public report is off.
  report_slug text unique check (report_slug ~ '^[a-z0-9]{20}$'),
  created_at timestamptz not null default now()
);
create unique index if not exists cs_tracked_link_campaigns_name_key
  on public.cs_tracked_link_campaigns (owner_id, lower(name));

create table if not exists public.cs_tracked_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.cs_tracked_link_campaigns(id),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  label text not null check (char_length(label) between 1 and 60),
  url text not null check (char_length(url) <= 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cs_tracked_links_owner_idx on public.cs_tracked_links (owner_id);
create index if not exists cs_tracked_links_campaign_idx on public.cs_tracked_links (campaign_id);

-- Taps and new people per link per Singapore day. Counts only; kept while
-- the link exists.
create table if not exists public.cs_tracked_link_days (
  link_id uuid not null references public.cs_tracked_links(id) on delete cascade,
  day date not null,
  clicks integer not null default 0 check (clicks >= 0),
  people integer not null default 0 check (people >= 0 and people <= clicks),
  primary key (link_id, day)
);

-- One row per person per campaign (or per link outside a campaign) for 90
-- days. visitor = SHA-256(salt, scope, the edge function's visitor key).
create table if not exists public.cs_tracked_link_visitors (
  visitor bytea primary key check (octet_length(visitor) = 32),
  -- The link of the first tap; deleting it forgets the person.
  link_id uuid not null references public.cs_tracked_links(id) on delete cascade,
  owner_id uuid not null,
  first_day date not null
);
create index if not exists cs_tracked_link_visitors_owner_day_idx
  on public.cs_tracked_link_visitors (owner_id, first_day);
create index if not exists cs_tracked_link_visitors_link_idx
  on public.cs_tracked_link_visitors (link_id);

-- Released slugs, kept for their last owner for 30 days, or for good
-- (released_at = 'infinity') when the account was deleted. No foreign key:
-- a hold outlives its account.
create table if not exists public.cs_tracked_link_slug_holds (
  slug text primary key,
  owner_id uuid not null,
  released_at timestamptz not null default now()
);

create table if not exists public.cs_tracked_link_salt (
  id boolean primary key default true check (id),
  salt bytea not null check (octet_length(salt) = 32)
);
-- 32 bytes from two random UUIDs (pg_strong_random, 244 random bits). Made
-- once; running this file again keeps it.
insert into public.cs_tracked_link_salt (id, salt)
values (true, uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()))
on conflict (id) do nothing;

alter table public.cs_tracked_link_campaigns enable row level security;
alter table public.cs_tracked_links enable row level security;
alter table public.cs_tracked_link_days enable row level security;
alter table public.cs_tracked_link_visitors enable row level security;
alter table public.cs_tracked_link_slug_holds enable row level security;
alter table public.cs_tracked_link_salt enable row level security;

revoke all on table public.cs_tracked_link_campaigns, public.cs_tracked_links,
  public.cs_tracked_link_days, public.cs_tracked_link_visitors,
  public.cs_tracked_link_slug_holds, public.cs_tracked_link_salt
  from public, anon, authenticated;
revoke all on table public.cs_tracked_link_salt from service_role;
grant select on table public.cs_tracked_link_campaigns, public.cs_tracked_links,
  public.cs_tracked_link_days to authenticated;

-- Locks the given slugs in sorted order (no deadlocks between two saves).
create or replace function public.cs_tracked_link_lock_slugs(p_slugs text[]) returns void
language plpgsql set search_path = public, pg_temp as $$
declare
  v_slug text;
begin
  for v_slug in select distinct s from unnest(p_slugs) s where s is not null order by s loop
    perform pg_advisory_xact_lock(hashtextextended('cs_tracked_link_slug:' || v_slug, 0));
  end loop;
end $$;

-- Holds the slug of every deleted or renamed link: the owner's delete or
-- rename, a direct delete, and the cascade from a deleted account. The slug
-- lock makes a grab wait until the release commits, then see the hold.
create or replace function public.cs_tracked_link_hold_slug() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.slug = old.slug then
    return new;
  end if;
  perform public.cs_tracked_link_lock_slugs(array[old.slug, case when tg_op = 'UPDATE' then new.slug end]);
  insert into public.cs_tracked_link_slug_holds (slug, owner_id, released_at)
  values (old.slug, old.owner_id, case
    when exists (select 1 from auth.users u where u.id = old.owner_id) then now()
    else 'infinity'::timestamptz
  end)
  on conflict (slug) do update set owner_id = excluded.owner_id, released_at = excluded.released_at;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists cs_tracked_links_hold_slug on public.cs_tracked_links;
create trigger cs_tracked_links_hold_slug
  before delete or update of slug on public.cs_tracked_links
  for each row execute function public.cs_tracked_link_hold_slug();

-- ---------------------------------------------------------------------------
-- Owner (authenticated) functions
-- ---------------------------------------------------------------------------

-- Creates a link (p_id null) or edits one of the caller's links. A blank
-- slug keeps the link's current one, or picks a random 10-character slug
-- for a new link. A blank campaign takes the link out of any campaign; a
-- campaign is matched by name, ignoring case, and made when new. Campaigns
-- left with no link are deleted, with their report.
create or replace function public.cs_save_tracked_link(
  p_id uuid,
  p_slug text,
  p_label text,
  p_url text,
  p_campaign text default null
) returns public.cs_tracked_links
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_link_limit constant int := 100;
  c_url_re constant text := '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]\\]*)?$';
  -- 015's list (admin-ish words and every top-level route in src/App.tsx)
  -- plus this feature's own words.
  c_reserved constant text[] := array[
    'admin', 'api', 'login', 'logout', 'signup', 'auth', 'app', 'l', 'review', 'www', 'help',
    'support', 'settings', 'bio', 'mb-studio', 'content-studio',
    'academy', 'analytics', 'board', 'brand', 'calendar', 'carousel', 'clone', 'coach',
    'connect', 'create-guide', 'diagnosis', 'drafts', 'edit', 'fads', 'feedback', 'generate',
    'grid', 'home', 'hub', 'inspiration', 'media', 'plan', 'playbook', 'profiles', 'recruit',
    'reels', 'roadmap', 'swipe', 'team', 'trends', 'tutorial', 'voice', 'welcome',
    't', 'track', 'tracked-link', 'link', 'links', 'report', 'reports', 'campaign', 'campaigns'
  ];
  v_uid uuid := auth.uid();
  v_slug text;
  v_old_slug text;
  v_label text;
  v_url text;
  v_campaign text;
  v_campaign_id uuid;
  v_row public.cs_tracked_links%rowtype;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  -- Bound the raw input before any regex runs over it.
  if char_length(p_slug) > 200 or char_length(p_label) > 400
     or char_length(p_url) > 4096 or char_length(p_campaign) > 400 then
    raise exception 'Something in this link is far too long. Shorten it and try again.' using errcode = '22023';
  end if;
  v_slug := nullif(lower(btrim(coalesce(p_slug, ''))), '');
  v_label := public.cs_clean_label(p_label);
  v_url := btrim(coalesce(p_url, ''));
  v_campaign := nullif(public.cs_clean_label(p_campaign), '');
  if v_slug is not null and v_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then
    raise exception 'Use 3 to 40 lowercase letters, numbers or hyphens for the link address.' using errcode = '22023';
  end if;
  if v_slug = any (c_reserved) then
    raise exception 'That address is reserved. Try another.' using errcode = '22023';
  end if;
  if char_length(v_label) not between 1 and 60 then
    raise exception 'Give the link a label of up to 60 characters.' using errcode = '22023';
  end if;
  if char_length(v_url) > 2048 or v_url !~* c_url_re then
    raise exception 'The link must be a web address starting with https://' using errcode = '22023';
  end if;
  if char_length(v_campaign) > 60 then
    raise exception 'Keep the campaign name to 60 characters.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cs_tracked_links:' || v_uid::text, 0));
  if p_id is not null then
    select slug into v_old_slug from public.cs_tracked_links where id = p_id and owner_id = v_uid;
    if v_old_slug is null then
      raise exception 'That link is gone. Reload and try again.' using errcode = 'P0002';
    end if;
  elsif (select count(*) from public.cs_tracked_links where owner_id = v_uid) >= c_link_limit then
    raise exception 'You already have 100 tracked links. Delete one to make another.' using errcode = '54000';
  end if;
  v_slug := coalesce(v_slug, v_old_slug, lower(public.cs_generate_invite_code()));

  perform public.cs_tracked_link_lock_slugs(array[v_old_slug, v_slug]);
  if exists (
    select 1 from public.cs_tracked_link_slug_holds
    where slug = v_slug and owner_id <> v_uid and released_at > now() - interval '30 days'
  ) then
    raise exception 'That address was in use recently. Try another.' using errcode = '23505';
  end if;

  if v_campaign is not null then
    insert into public.cs_tracked_link_campaigns as c (owner_id, name)
    values (v_uid, v_campaign)
    on conflict (owner_id, lower(name)) do update set name = c.name
    returning id into v_campaign_id;
  end if;

  begin
    if p_id is null then
      insert into public.cs_tracked_links (owner_id, campaign_id, slug, label, url)
      values (v_uid, v_campaign_id, v_slug, v_label, v_url)
      returning * into v_row;
    else
      update public.cs_tracked_links
      set campaign_id = v_campaign_id, slug = v_slug, label = v_label, url = v_url, updated_at = now()
      where id = p_id and owner_id = v_uid
      returning * into v_row;
    end if;
  exception when unique_violation then
    raise exception 'That address is taken. Try another.' using errcode = '23505';
  end;

  delete from public.cs_tracked_link_campaigns c
  where c.owner_id = v_uid
    and not exists (select 1 from public.cs_tracked_links l where l.campaign_id = c.id);
  return v_row;
end $$;

-- Deletes one of the caller's links with its counts and people, holds its
-- slug for 30 days and deletes its campaign if that was the last link.
-- Returns whether there was one.
create or replace function public.cs_delete_tracked_link(p_id uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_slug text;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cs_tracked_links:' || v_uid::text, 0));
  select slug into v_slug from public.cs_tracked_links where id = p_id and owner_id = v_uid;
  if v_slug is null then
    return false;
  end if;
  perform public.cs_tracked_link_lock_slugs(array[v_slug]);
  -- The trigger holds the slug.
  delete from public.cs_tracked_links where id = p_id and owner_id = v_uid;
  delete from public.cs_tracked_link_campaigns c
  where c.owner_id = v_uid
    and not exists (select 1 from public.cs_tracked_links l where l.campaign_id = c.id);
  return true;
end $$;

-- Switches the public report of one of the caller's campaigns on or off.
-- Returns the report slug while on, null when off. On when already on keeps
-- the slug; off deletes it.
create or replace function public.cs_set_tracked_link_report(p_campaign_id uuid, p_on boolean)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_slug text;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  update public.cs_tracked_link_campaigns
  set report_slug = case
    when coalesce(p_on, false)
    then coalesce(report_slug, lower(public.cs_generate_invite_code() || public.cs_generate_invite_code()))
  end
  where id = p_campaign_id and owner_id = v_uid
  returning report_slug into v_slug;
  if not found then
    raise exception 'That campaign is gone. Reload and try again.' using errcode = 'P0002';
  end if;
  return v_slug;
end $$;

-- ---------------------------------------------------------------------------
-- Public (service_role only, called by the tracked-link edge function)
-- ---------------------------------------------------------------------------

-- The URL to send the visitor to, or null for an unknown slug. Counts the tap
-- unless the link already has 5,000 today (Singapore time); the conditional
-- upsert keeps the cap exact under concurrent taps and holds the day row's
-- lock for the rest of the call. p_visitor is the edge function's visitor key
-- (64 lowercase hex characters, see the header); a new person is counted
-- once per campaign, up to 1,000 new people per account per day, under a
-- per-account advisory lock. p_count = false (a bot) returns the URL without
-- counting; a missing or malformed p_visitor counts the tap but no person.
create or replace function public.cs_tracked_link_click(
  p_slug text,
  p_visitor text,
  p_count boolean default true
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_daily_cap constant int := 5000;
  c_people_cap constant int := 1000;
  v_day date := (now() at time zone 'Asia/Singapore')::date;
  v_link public.cs_tracked_links%rowtype;
  v_counted boolean;
  v_visitor bytea;
  v_new boolean;
begin
  select * into v_link from public.cs_tracked_links where slug = lower(p_slug);
  if not found then
    return null;
  end if;
  if not coalesce(p_count, true) then
    return v_link.url;
  end if;

  insert into public.cs_tracked_link_days as d (link_id, day, clicks)
  values (v_link.id, v_day, 1)
  on conflict (link_id, day) do update
    set clicks = d.clicks + 1
    where d.clicks < c_daily_cap
  returning true into v_counted;
  if v_counted is null or coalesce(p_visitor, '') !~ '^[0-9a-f]{64}$' then
    return v_link.url;
  end if;

  v_visitor := sha256(
    (select salt from public.cs_tracked_link_salt)
    || convert_to(coalesce(v_link.campaign_id, v_link.id)::text || '|', 'UTF8')
    || decode(p_visitor, 'hex'));
  perform pg_advisory_xact_lock(hashtextextended(
    'cs_tracked_link_people:' || v_link.owner_id::text || ':' || v_day::text, 0));
  if (select count(*) from public.cs_tracked_link_visitors
      where owner_id = v_link.owner_id and first_day = v_day) >= c_people_cap then
    return v_link.url;
  end if;
  insert into public.cs_tracked_link_visitors (visitor, link_id, owner_id, first_day)
  values (v_visitor, v_link.id, v_link.owner_id, v_day)
  on conflict (visitor) do nothing
  returning true into v_new;
  if v_new then
    update public.cs_tracked_link_days set people = people + 1
    where link_id = v_link.id and day = v_day;
  end if;
  return v_link.url;
end $$;

-- The public report for a report slug, or null when unknown or switched off:
-- campaign name, total taps and people, the last 7 Singapore days, and each
-- link's label, address (no query string or fragment), taps and people, most
-- tapped first.
create or replace function public.cs_tracked_link_report_public(p_report_slug text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with c as (
    select id, name from public.cs_tracked_link_campaigns
    where report_slug = lower(p_report_slug)
  ),
  l as (
    select l.id, l.label, l.url, l.created_at,
           coalesce(sum(d.clicks), 0) as clicks, coalesce(sum(d.people), 0) as people
    from c
    join public.cs_tracked_links l on l.campaign_id = c.id
    left join public.cs_tracked_link_days d on d.link_id = l.id
    group by l.id
  )
  select jsonb_build_object(
    'campaign', c.name,
    'clicks', (select coalesce(sum(clicks), 0) from l),
    'people', (select coalesce(sum(people), 0) from l),
    'days', (
      select jsonb_agg(jsonb_build_object(
        'day', g.day, 'clicks', coalesce(x.clicks, 0), 'people', coalesce(x.people, 0)) order by g.day)
      from (
        select (now() at time zone 'Asia/Singapore')::date - n as day from generate_series(0, 6) n
      ) g
      left join (
        select d.day, sum(d.clicks) as clicks, sum(d.people) as people
        from public.cs_tracked_link_days d join l on l.id = d.link_id
        group by d.day
      ) x on x.day = g.day
    ),
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
        'label', l.label,
        'url', regexp_replace(l.url, '[?#].*$', ''),
        'clicks', l.clicks,
        'people', l.people) order by l.clicks desc, l.label, l.created_at, l.id)
      from l
    ), '[]'::jsonb)
  )
  from c
$$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on function public.cs_tracked_link_lock_slugs(text[]) from public, anon, authenticated;
revoke all on function public.cs_tracked_link_hold_slug() from public, anon, authenticated;
revoke all on function public.cs_save_tracked_link(uuid, text, text, text, text) from public, anon;
revoke all on function public.cs_delete_tracked_link(uuid) from public, anon;
revoke all on function public.cs_set_tracked_link_report(uuid, boolean) from public, anon;
grant execute on function public.cs_save_tracked_link(uuid, text, text, text, text) to authenticated;
grant execute on function public.cs_delete_tracked_link(uuid) to authenticated;
grant execute on function public.cs_set_tracked_link_report(uuid, boolean) to authenticated;

revoke all on function public.cs_tracked_link_click(text, text, boolean) from public, anon, authenticated;
revoke all on function public.cs_tracked_link_report_public(text) from public, anon, authenticated;
grant execute on function public.cs_tracked_link_click(text, text, boolean) to service_role;
grant execute on function public.cs_tracked_link_report_public(text) to service_role;

-- ---------------------------------------------------------------------------
-- Policies (SELECT only)
-- ---------------------------------------------------------------------------

drop policy if exists cs_tracked_links_owner_read on public.cs_tracked_links;
create policy cs_tracked_links_owner_read on public.cs_tracked_links
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists cs_tracked_link_campaigns_owner_read on public.cs_tracked_link_campaigns;
create policy cs_tracked_link_campaigns_owner_read on public.cs_tracked_link_campaigns
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists cs_tracked_link_days_owner_read on public.cs_tracked_link_days;
create policy cs_tracked_link_days_owner_read on public.cs_tracked_link_days
  for select to authenticated
  using (exists (
    select 1 from public.cs_tracked_links l
    where l.id = link_id and l.owner_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- Job
-- ---------------------------------------------------------------------------

select cron.unschedule(jobid) from cron.job where jobname = 'tracked-link-prune';
select cron.schedule(
  'tracked-link-prune',
  '23 4 * * *',
  $$
  with gone as (
    delete from public.cs_tracked_link_visitors
    where first_day < (now() at time zone 'Asia/Singapore')::date - 90
  )
  delete from public.cs_tracked_link_slug_holds where released_at < now() - interval '30 days'
  $$
);

commit;
