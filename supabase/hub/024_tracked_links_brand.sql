-- Tracked links per brand (docs/brand-isolation.md). A link and a campaign now belong to one of the
-- adviser's brands (Content Studio profiles: "me" or p + base-36, as 015 and 018), so each brand lists only
-- its own. Every row from before belongs to the default brand "me".
--
-- cs_save_tracked_link gains p_profile (the open brand) and keeps a link's brand when it is edited. Its old
-- five-argument form is dropped; a caller that sends no brand (a tab open from before) files under "me". A campaign name is unique per
-- brand. Reads keep 019's owner-only RLS; the app filters by brand.
--
-- 2026-10-16: 0 links and 0 campaigns live when written. Idempotent; one transaction. Short locks on two
-- small tables; lock_timeout gives up after 3 seconds and a timeout is safe to retry.

begin;
set local lock_timeout = '3s';

alter table public.cs_tracked_links
  add column if not exists profile_id text not null default 'me' check (profile_id ~ '^[a-z0-9]{1,40}$');
alter table public.cs_tracked_link_campaigns
  add column if not exists profile_id text not null default 'me' check (profile_id ~ '^[a-z0-9]{1,40}$');

drop index if exists public.cs_tracked_link_campaigns_name_key;
create unique index if not exists cs_tracked_link_campaigns_brand_name_key
  on public.cs_tracked_link_campaigns (owner_id, profile_id, lower(name));
create index if not exists cs_tracked_links_brand_idx on public.cs_tracked_links (owner_id, profile_id);

drop function if exists public.cs_save_tracked_link(uuid, text, text, text, text);

-- 019's function, plus the brand: a new link takes p_profile, an edited one keeps its own.
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
  c_self_re constant text := '^https?://(consultant-content-studio\.vercel\.app|[a-z0-9-]+\.supabase\.co)\.?(:[0-9]{1,5})?/(t|functions/v1/tracked-link)([/?#]|$)';
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

revoke all on function public.cs_save_tracked_link(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.cs_save_tracked_link(uuid, text, text, text, text, text) to authenticated;

commit;
