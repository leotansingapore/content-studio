-- The app moves to https://app.postmosis.com (Leo bought postmosis.com on 27 Oct 2026); the old host
-- https://consultant-content-studio.vercel.app keeps working for every link already shared. cs_save_tracked_link refuses
-- a link that points at one of our own tracked addresses (c_self_re, so a link can't loop), and now knows
-- app.postmosis.com and postmosis.com as well as the old host. src/lib/trackedLinks.ts SELF_RE says the same.
--
-- One live function holds the regex: cs_save_tracked_link(uuid, text, text, text, text, text), last defined in 024.
-- 019's five-argument form, the other copy, was dropped by 024. The function below is 024's exactly; only the
-- c_self_re line changes. CREATE OR REPLACE keeps its owner and grants (execute for authenticated only).
--
-- Read-only checks on live, before applying:
--   1. select pg_get_functiondef('public.cs_save_tracked_link(uuid, text, text, text, text, text)'::regprocedure);
--      Its body, between the $function$ markers, must match 024 lines 37-147 (declare ... end) exactly. If it does
--      not, stop: something changed it after 024, and this file would undo that.
--   2. select md5(prosrc) from pg_proc
--       where oid = 'public.cs_save_tracked_link(uuid, text, text, text, text, text)'::regprocedure;
--      ca1d80db1ff680fe7c86de30feda6578 is 024's body. 04384ade43b1857af7d9fe01b215ac7b is this file's (already applied).
--   3. select to_regprocedure('public.cs_save_tracked_link(uuid, text, text, text, text)');
--      null: 019's form is gone, so no other copy of the regex is live.
--   4. select proacl from pg_proc
--       where oid = 'public.cs_save_tracked_link(uuid, text, text, text, text, text)'::regprocedure;
--      authenticated has execute (X); anon and public do not.
--
-- The guard below repeats check 2 inside the transaction and refuses to replace a body it does not know.
-- Idempotent; one transaction. Test: 028_postmosis_host.test.sql.

begin;
set local lock_timeout = '3s';

do $guard$
declare
  v_md5 text;
begin
  select md5(prosrc) into v_md5 from pg_proc
  where oid = to_regprocedure('public.cs_save_tracked_link(uuid, text, text, text, text, text)');
  if v_md5 is distinct from 'ca1d80db1ff680fe7c86de30feda6578'
     and v_md5 is distinct from '04384ade43b1857af7d9fe01b215ac7b' then
    raise exception '028: live cs_save_tracked_link is not 024''s body (md5 %). Diff it against 024 before applying.',
      coalesce(v_md5, 'missing');
  end if;
end $guard$;

-- 024's function; c_self_re also knows app.postmosis.com and postmosis.com.
create or replace function public.cs_save_tracked_link(
  p_id uuid,
  p_slug text,
  p_label text,
  p_url text,
  p_campaign text default null,
  p_profile text default 'me'
) returns public.cs_tracked_links
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c_link_limit constant int := 100;
  c_url_re constant text := '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]\\]*)?$';
  -- Our own tracked-link addresses (app host and the function); add a custom domain here.
  c_self_re constant text := '^https?://(consultant-content-studio\.vercel\.app|(app\.)?postmosis\.com|[a-z0-9-]+\.supabase\.co)\.?(:[0-9]{1,5})?/(t|functions/v1/tracked-link)([/?#]|$)';
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
  v_profile text;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  -- The redirect sits on the app's own host: only members (001) make links.
  if not public.hub_is_member() then
    raise exception 'Tracked links come with a Members Hub membership.' using errcode = '42501';
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
  if v_url ~* c_self_re then
    raise exception 'That is already a tracked link. Paste the address it goes to.' using errcode = '22023';
  end if;
  if coalesce(p_profile, '') !~ '^[a-z0-9]{1,40}$' then
    raise exception 'Pick a brand first.' using errcode = '22023';
  end if;
  if char_length(v_campaign) > 60 then
    raise exception 'Keep the campaign name to 60 characters.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cs_tracked_links:' || v_uid::text, 0));
  if p_id is not null then
    select slug, profile_id into v_old_slug, v_profile from public.cs_tracked_links where id = p_id and owner_id = v_uid;
    if v_old_slug is null then
      raise exception 'That link is gone. Reload and try again.' using errcode = 'P0002';
    end if;
  elsif (select count(*) from public.cs_tracked_links where owner_id = v_uid) >= c_link_limit then
    raise exception 'You already have 100 tracked links. Delete one to make another.' using errcode = '54000';
  end if;
  v_profile := coalesce(v_profile, p_profile);
  v_slug := coalesce(v_slug, v_old_slug, lower(public.cs_generate_invite_code()));

  perform public.cs_tracked_link_lock_slugs(array[v_old_slug, v_slug]);
  if exists (
    select 1 from public.cs_tracked_link_slug_holds
    where slug = v_slug and owner_id <> v_uid and released_at > now() - interval '30 days'
  ) then
    raise exception 'That address was in use recently. Try another.' using errcode = '23505';
  end if;

  if v_campaign is not null then
    insert into public.cs_tracked_link_campaigns as c (owner_id, profile_id, name)
    values (v_uid, v_profile, v_campaign)
    on conflict (owner_id, profile_id, lower(name)) do update set name = c.name
    returning id into v_campaign_id;
  end if;

  begin
    if p_id is null then
      insert into public.cs_tracked_links (owner_id, profile_id, campaign_id, slug, label, url)
      values (v_uid, v_profile, v_campaign_id, v_slug, v_label, v_url)
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

commit;
