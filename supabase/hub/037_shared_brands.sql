-- Shared brands (docs/shared-brands.md). Run by hand, after 036, in a quiet window: the foreign keys to auth.users
-- take a lock that queues academy sign-ins while this waits. lock_timeout gives up after 3 seconds; a timeout is safe
-- to retry. Nothing reads these until the brand-team function and the client that calls them are deployed.
--
-- A shared brand's data stays where it is, in the owner's cs_user_data rows. These tables say who else may reach it,
-- and the functions below are the only way a member reaches it: each decides from the brand row and auth.uid() on
-- every call, never from what the caller says about itself. cs_user_data and its policy are not touched.
--
--   cs_brands          one row per brand an owner has shared: (owner, profile id), unique. Deleting the row is how
--                      a brand stops being shared (members, invites and edits go with it).
--   cs_brand_members   who else is on a brand. Removing or leaving deletes the row.
--   cs_brand_invites   one row per emailed invite: only the sha256 of its one-time token is kept.
--   cs_brand_edits     the last time each member changed each key, for the owner's team list.
--
-- What a member may reach: cs_brand_keys(scope, writable). The key must equal one of the prefixes followed by the
-- brand's scope (the owner id for "me", owner~profile otherwise), character for character. src/lib/sharedBrands.ts
-- holds the same two lists and its test reads this file.
--
-- Grants
--   tables: RLS on, no policies; revoke all from public, anon, authenticated; service_role keeps its own.
--   functions: EXECUTE revoked from public, anon and authenticated on every one (Supabase grants it to both by
--   default), then granted to authenticated on the member-facing ones and to service_role on the invite ones only.
--   Internal helpers carry no grant at all.
--
-- Does not touch auth.users, its trigger, cs_user_data's policy or any existing table's columns.
-- Idempotent: safe to run again (create or replace, if not exists).

begin;
set local lock_timeout = '3s';

create table if not exists public.cs_brands (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- profiles.ts: "me", or "p" + base 36 (addProfile)
  profile_id text not null check (profile_id ~ '^(me|p[a-z0-9]{1,39})$'),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (owner_id, profile_id)
);

create table if not exists public.cs_brand_members (
  brand_id uuid not null references public.cs_brands (id) on delete cascade,
  member_id uuid not null references auth.users (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (brand_id, member_id)
);
create index if not exists cs_brand_members_member on public.cs_brand_members (member_id);

create table if not exists public.cs_brand_invites (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.cs_brands (id) on delete cascade,
  -- shown to the owner and matched at accept as a second lock; never the identity
  email text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 254 and email !~ '\s'),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz
);
create unique index if not exists cs_brand_invites_hash on public.cs_brand_invites (token_hash);
-- one open invite per address per brand; inviting again revokes the old one first
create unique index if not exists cs_brand_invites_open on public.cs_brand_invites (brand_id, email)
  where accepted_at is null and revoked_at is null;
create index if not exists cs_brand_invites_email on public.cs_brand_invites (email, created_at);

create table if not exists public.cs_brand_edits (
  brand_id uuid not null references public.cs_brands (id) on delete cascade,
  member_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  at timestamptz not null default now(),
  primary key (brand_id, member_id, key)
);
create index if not exists cs_brand_edits_member on public.cs_brand_edits (member_id);

alter table public.cs_brands enable row level security;
alter table public.cs_brand_members enable row level security;
alter table public.cs_brand_invites enable row level security;
alter table public.cs_brand_edits enable row level security;
revoke all on table public.cs_brands, public.cs_brand_members, public.cs_brand_invites, public.cs_brand_edits
  from public, anon, authenticated;
grant select, insert, update, delete on table public.cs_brands, public.cs_brand_members, public.cs_brand_invites,
  public.cs_brand_edits to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- Internal helpers (no grant)

create or replace function public.cs_try_jsonb(p text) returns jsonb
language plpgsql immutable set search_path = '' as $$
begin
  return p::jsonb;
exception when others then
  return null;
end $$;

-- The brand's reachable keys. Read-write first; read-only (the brand kit, its fonts, facts and learnings, which the
-- owner's unattended slideshow campaigns and account audit read) only when p_writable is false.
create or replace function public.cs_brand_keys(p_scope text, p_writable boolean) returns text[]
language sql immutable set search_path = '' as $$
  select array_agg(prefix || p_scope order by prefix) from unnest(
    array[ /* read-write */ 'content-studio-drafts-', 'content-studio-plan-', 'content-studio-calnotes-',
      'content-studio-board-', 'content-studio-ideas-', 'content-studio-campaigns-', 'content-studio-goals-',
      'content-studio-angles-', 'content-studio-audiences-', 'content-studio-products-',
      'content-studio-positioning-', 'content-studio-voice-' ]::text[]
    || case when p_writable then '{}'::text[] else
    array[ /* read-only */ 'content-studio-carousel-brand-', 'content-studio-brandfont-', 'content-studio-brandfont2-',
      'content-studio-brandfont3-', 'content-studio-brandfont4-', 'content-studio-brandfont5-',
      'content-studio-facts-', 'content-studio-learnings-' ]::text[] end
  ) as prefix
$$;

-- The brand's profile is still in the owner's synced brand list ("me" always is): a brand removed on any of the
-- owner's devices, even by a build that never told the server, stops being reachable.
create or replace function public.cs_brand_live(p_owner uuid, p_profile text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_profile = 'me' or exists (
    select 1
    from public.cs_user_data d
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(public.cs_try_jsonb(d.data)) = 'array' then public.cs_try_jsonb(d.data) else '[]'::jsonb end) p
    where d.user_id = p_owner and d.key = 'content-studio-profiles-' || p_owner::text and p ->> 'id' = p_profile)
$$;

-- The calling account's way into a brand: its owner and scope, if the caller owns it or is on it and it is live.
create or replace function public.cs_brand_reach(p_brand uuid)
returns table (owner_id uuid, scope text, is_owner boolean)
language sql stable security definer set search_path = '' as $$
  select b.owner_id,
         case when b.profile_id = 'me' then b.owner_id::text else b.owner_id::text || '~' || b.profile_id end,
         b.owner_id = (select auth.uid())
  from public.cs_brands b
  where b.id = p_brand
    and (select auth.uid()) is not null
    and (b.owner_id = (select auth.uid())
         or exists (select 1 from public.cs_brand_members m where m.brand_id = b.id and m.member_id = (select auth.uid())))
    and public.cs_brand_live(b.owner_id, b.profile_id)
$$;

-- A post Zernio still holds (zernioOutbox.ts zernioHolds) that is in p_old but not, unchanged, in p_new.
create or replace function public.cs_held_changed(p_old jsonb, p_new jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(p_old) = 'array' then p_old else '[]'::jsonb end) o
    where jsonb_typeof(o) = 'object'
      and coalesce(o #>> '{zernio,postId}', '') <> ''
      and coalesce(o #>> '{zernio,status}', '') not in ('published', 'partial', 'failed', 'cancelled')
      and not exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(p_new) = 'array' then p_new else '[]'::jsonb end) n
        where n = o))
$$;

-- A string anywhere in the value that a browser would run as script in a link: javascript: or vbscript:, after the
-- URL parser's own clean-up (leading and trailing control characters and spaces, and tabs and line breaks anywhere).
create or replace function public.cs_unsafe_link(p_value jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select exists (
    select 1 from jsonb_path_query(p_value, 'strict $.**') s
    where jsonb_typeof(s) = 'string'
      and lower(regexp_replace(regexp_replace(s #>> '{}', '^[\x01-\x20]+', ''), '[\t\n\r]', '', 'g')) ~ '^(javascript|vbscript):')
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- For any signed-in account

create or replace function public.cs_my_brands()
returns table (brand_id uuid, owner_id uuid, profile_id text, name text, role text)
language sql stable security definer set search_path = '' as $$
  select b.id, b.owner_id, b.profile_id, b.name, 'owner'::text
  from public.cs_brands b where b.owner_id = (select auth.uid())
  union all
  select b.id, b.owner_id, b.profile_id, b.name, 'member'::text
  from public.cs_brands b join public.cs_brand_members m on m.brand_id = b.id
  where m.member_id = (select auth.uid()) and public.cs_brand_live(b.owner_id, b.profile_id)
$$;

create or replace function public.cs_brand_rows(p_brand uuid, p_keys text[] default null)
returns table (key text, data text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v record;
begin
  select * into v from public.cs_brand_reach(p_brand);
  if not found then raise exception 'not_on_brand' using errcode = '42501'; end if;
  return query
    select d.key, d.data, d.updated_at from public.cs_user_data d
    where d.user_id = v.owner_id
      and d.key = any (public.cs_brand_keys(v.scope, false))
      and (p_keys is null or d.key = any (p_keys))
    order by d.key;
end $$;

-- Writes one read-write key only if its stamp is still p_seen (null: only if there is no row yet). Returns the stamp
-- written, or null when someone saved first. The stamp never runs ahead of the server's clock and never goes
-- backwards, so every one of the owner's devices takes the change as newer.
create or replace function public.cs_brand_swap(p_brand uuid, p_key text, p_data text, p_stamp timestamptz, p_seen timestamptz)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v record;
  v_old public.cs_user_data;
  v_new jsonb;
  v_at timestamptz;
  v_posts boolean;
  v_max int;
begin
  select * into v from public.cs_brand_reach(p_brand);
  if not found then raise exception 'not_on_brand' using errcode = '42501'; end if;
  if p_key is null or not (p_key = any (public.cs_brand_keys(v.scope, true))) then
    raise exception 'key_not_shared' using errcode = '42501';
  end if;
  v_posts := p_key = 'content-studio-drafts-' || v.scope;
  -- posts lists run long; nothing else needs half a megabyte, and localStorage holds about five in all
  v_max := case when v_posts then 4000000 else 500000 end;
  if p_data is null or char_length(p_data) > v_max then raise exception 'too_big' using errcode = '22023'; end if;
  v_new := public.cs_try_jsonb(p_data);
  if v_new is null then raise exception 'not_json' using errcode = '22023'; end if;
  if public.cs_unsafe_link(v_new) then raise exception 'unsafe_link' using errcode = '22023'; end if;

  select * into v_old from public.cs_user_data d where d.user_id = v.owner_id and d.key = p_key for update;
  if found then
    if p_seen is null or v_old.updated_at <> p_seen then return null; end if;
    if v_posts and public.cs_held_changed(public.cs_try_jsonb(v_old.data), v_new) then
      raise exception 'held_post' using errcode = '42501';
    end if;
    v_at := greatest(least(coalesce(p_stamp, now()), now() + interval '1 minute'), v_old.updated_at + interval '1 millisecond');
    update public.cs_user_data d set data = p_data, updated_at = v_at where d.user_id = v.owner_id and d.key = p_key;
  else
    if p_seen is not null then return null; end if;
    v_at := least(coalesce(p_stamp, now()), now() + interval '1 minute');
    insert into public.cs_user_data (user_id, key, data, updated_at) values (v.owner_id, p_key, p_data, v_at)
      on conflict (user_id, key) do nothing;
    if not found then return null; end if;
  end if;
  insert into public.cs_brand_edits (brand_id, member_id, key, at) values (p_brand, (select auth.uid()), p_key, now())
    on conflict (brand_id, member_id, key) do update set at = excluded.at;
  return v_at;
end $$;

-- Deletes one read-write key if its stamp is still p_seen, and puts it on the owner's tombstone list (cloudSync.ts:
-- {id, at, was}) so the owner's devices drop their copies instead of uploading them again. True when the key is gone
-- (or never was), false when someone saved it since.
create or replace function public.cs_brand_drop(p_brand uuid, p_key text, p_seen timestamptz)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v record;
  v_old public.cs_user_data;
  v_tomb text;
  v_list jsonb;
  v_iso constant text := 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"';
begin
  select * into v from public.cs_brand_reach(p_brand);
  if not found then raise exception 'not_on_brand' using errcode = '42501'; end if;
  if p_key is null or not (p_key = any (public.cs_brand_keys(v.scope, true))) then
    raise exception 'key_not_shared' using errcode = '42501';
  end if;
  select * into v_old from public.cs_user_data d where d.user_id = v.owner_id and d.key = p_key for update;
  if not found then return true; end if;
  if p_seen is null or v_old.updated_at <> p_seen then return false; end if;
  if p_key = 'content-studio-drafts-' || v.scope and public.cs_held_changed(public.cs_try_jsonb(v_old.data), '[]'::jsonb) then
    raise exception 'held_post' using errcode = '42501';
  end if;
  delete from public.cs_user_data d where d.user_id = v.owner_id and d.key = p_key;

  v_tomb := 'content-studio-tombstones-' || v.owner_id::text;
  select public.cs_try_jsonb(d.data) into v_list from public.cs_user_data d
    where d.user_id = v.owner_id and d.key = v_tomb for update;
  -- newest first, one entry per key, at most 1,000 (cloudSync.ts pruneTombs)
  v_list := jsonb_build_array(jsonb_build_object(
      'id', p_key,
      'at', to_char(now() at time zone 'UTC', v_iso),
      -- a millisecond past the removed version, so a copy stamped at it (to the microsecond) counts as removed
      'was', to_char((v_old.updated_at + interval '1 millisecond') at time zone 'UTC', v_iso)))
    || coalesce((
      select jsonb_agg(t order by i) from (
        select t, i from jsonb_array_elements(case when jsonb_typeof(v_list) = 'array' then v_list else '[]'::jsonb end)
          with ordinality as x (t, i)
        where t ->> 'id' is distinct from p_key
        order by i limit 999) kept), '[]'::jsonb);
  insert into public.cs_user_data (user_id, key, data, updated_at) values (v.owner_id, v_tomb, v_list::text, now())
    on conflict (user_id, key) do update
      set data = excluded.data, updated_at = greatest(excluded.updated_at, public.cs_user_data.updated_at + interval '1 millisecond');

  insert into public.cs_brand_edits (brand_id, member_id, key, at) values (p_brand, (select auth.uid()), p_key, now())
    on conflict (brand_id, member_id, key) do update set at = excluded.at;
  return true;
end $$;

-- The brand's team as the caller may see it: the owner sees the owner, every member (with their last edit) and the
-- open invites; a member sees the owner and themselves.
create or replace function public.cs_brand_team(p_brand uuid)
returns table (kind text, id uuid, email text, at timestamptz, expires_at timestamptz, last_edit timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v record;
begin
  select * into v from public.cs_brand_reach(p_brand);
  if not found then raise exception 'not_on_brand' using errcode = '42501'; end if;
  return query
    select 'owner'::text, b.owner_id, u.email::text, b.created_at, null::timestamptz, null::timestamptz
    from public.cs_brands b left join auth.users u on u.id = b.owner_id where b.id = p_brand
    union all
    select 'member'::text, m.member_id, u.email::text, m.added_at, null::timestamptz,
      (select max(e.at) from public.cs_brand_edits e where e.brand_id = m.brand_id and e.member_id = m.member_id)
    from public.cs_brand_members m left join auth.users u on u.id = m.member_id
    where m.brand_id = p_brand and (v.is_owner or m.member_id = (select auth.uid()))
    union all
    select 'invite'::text, i.id, i.email, i.created_at, i.expires_at, null::timestamptz
    from public.cs_brand_invites i
    where i.brand_id = p_brand and v.is_owner and i.accepted_at is null and i.revoked_at is null;
end $$;

-- Takes an invite for the signed-in account: one transaction hashes the token, locks the invite, checks it and adds
-- the member. The email must be the one invited: a second lock against a forwarded link, not the identity.
create or replace function public.cs_brand_accept(p_token text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_inv public.cs_brand_invites;
  v_owner uuid;
  v_email text;
begin
  if v_uid is null then raise exception 'sign_in' using errcode = '42501'; end if;
  if p_token is null or char_length(p_token) not between 20 and 200 then raise exception 'invite_gone'; end if;
  select * into v_inv from public.cs_brand_invites i
    where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if not found or v_inv.accepted_at is not null or v_inv.revoked_at is not null or v_inv.expires_at <= now() then
    raise exception 'invite_gone';
  end if;
  select b.owner_id into v_owner from public.cs_brands b where b.id = v_inv.brand_id;
  if v_owner = v_uid then raise exception 'owner_self'; end if;
  select lower(btrim(u.email)) into v_email from auth.users u where u.id = v_uid;
  if v_email is distinct from v_inv.email then raise exception 'wrong_account'; end if;
  insert into public.cs_brand_members (brand_id, member_id) values (v_inv.brand_id, v_uid) on conflict do nothing;
  update public.cs_brand_invites set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;
  return v_inv.brand_id;
end $$;

create or replace function public.cs_brand_remove(p_brand uuid, p_member uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.cs_brands b where b.id = p_brand and b.owner_id = (select auth.uid())) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  delete from public.cs_brand_members m where m.brand_id = p_brand and m.member_id = p_member;
end $$;

create or replace function public.cs_brand_revoke(p_invite uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.cs_brand_invites i join public.cs_brands b on b.id = i.brand_id
    where i.id = p_invite and b.owner_id = (select auth.uid())) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  update public.cs_brand_invites i set revoked_at = now()
    where i.id = p_invite and i.accepted_at is null and i.revoked_at is null;
end $$;

create or replace function public.cs_brand_leave(p_brand uuid)
returns void
language sql security definer set search_path = '' as $$
  delete from public.cs_brand_members m where m.brand_id = p_brand and m.member_id = (select auth.uid())
$$;

-- The owner removed the brand: it stops being shared before anything local is deleted.
create or replace function public.cs_brand_forget(p_profile text)
returns void
language sql security definer set search_path = '' as $$
  delete from public.cs_brands b where b.owner_id = (select auth.uid()) and b.profile_id = p_profile
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- For the brand-team function only (service role)

-- Files an invite. Locks every brand of the owner (the people cap is per owner), checks the inviter owns this one,
-- refuses the owner's own address, 3 invites to one address a day, and an 11th person across all the owner's brands
-- (members plus open invites; the address being invited again doesn't count twice). Then any open invite for the
-- same address on this brand is revoked, so only the newest link works.
create or replace function public.cs_brand_invite(p_brand uuid, p_inviter uuid, p_email text, p_hash text, p_expires timestamptz)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_people int;
  v_known boolean;
  v_id uuid;
begin
  perform 1 from public.cs_brands b where b.owner_id = p_inviter for update;
  select b.owner_id into v_owner from public.cs_brands b where b.id = p_brand;
  if v_owner is null or v_owner <> p_inviter then raise exception 'not_owner'; end if;
  if exists (select 1 from auth.users u where u.id = p_inviter and lower(btrim(u.email)) = p_email) then
    raise exception 'owner_self';
  end if;
  if (select count(*) from public.cs_brand_invites i where i.email = p_email and i.created_at > now() - interval '1 day') >= 3 then
    raise exception 'recipient_cap';
  end if;
  with people as (
    select lower(btrim(u.email)) as email
    from public.cs_brand_members m join public.cs_brands b on b.id = m.brand_id join auth.users u on u.id = m.member_id
    where b.owner_id = p_inviter
    union
    select i.email from public.cs_brand_invites i join public.cs_brands b on b.id = i.brand_id
    where b.owner_id = p_inviter and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
  )
  select count(*), coalesce(bool_or(email = p_email), false) into v_people, v_known from people;
  if not v_known and v_people >= 10 then raise exception 'team_full'; end if;
  update public.cs_brand_invites i set revoked_at = now()
    where i.brand_id = p_brand and i.email = p_email and i.accepted_at is null and i.revoked_at is null;
  insert into public.cs_brand_invites (brand_id, email, token_hash, invited_by, expires_at)
    values (p_brand, p_email, p_hash, p_inviter, p_expires)
    returning id into v_id;
  return v_id;
end $$;

-- The open, unexpired invite a token hash names, for the join page's first step.
create or replace function public.cs_brand_invite_open(p_hash text)
returns table (invite_id uuid, brand_id uuid, email text, brand_name text, invited_by uuid)
language sql stable security definer set search_path = '' as $$
  select i.id, i.brand_id, i.email, b.name, i.invited_by
  from public.cs_brand_invites i join public.cs_brands b on b.id = i.brand_id
  where i.token_hash = p_hash and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
$$;

-- The subscription rows of the owners of every live brand this account is on (subscription.ts teamCovered). An owner
-- with no row isn't listed: an owner with no row covers nobody.
create or replace function public.cs_member_owner_rows(p_member uuid)
returns table (status text, past_due_since timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.status, s.past_due_since
  from public.cs_brand_members m
  join public.cs_brands b on b.id = m.brand_id
  join public.cs_subscriptions s on s.user_id = b.owner_id
  where m.member_id = p_member and public.cs_brand_live(b.owner_id, b.profile_id)
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Function grants: nothing by default, then exactly what each caller needs.

revoke all on function
  public.cs_try_jsonb(text), public.cs_brand_keys(text, boolean), public.cs_brand_live(uuid, text),
  public.cs_brand_reach(uuid), public.cs_held_changed(jsonb, jsonb), public.cs_unsafe_link(jsonb),
  public.cs_my_brands(), public.cs_brand_rows(uuid, text[]),
  public.cs_brand_swap(uuid, text, text, timestamptz, timestamptz), public.cs_brand_drop(uuid, text, timestamptz),
  public.cs_brand_team(uuid), public.cs_brand_accept(text), public.cs_brand_remove(uuid, uuid),
  public.cs_brand_revoke(uuid), public.cs_brand_leave(uuid), public.cs_brand_forget(text),
  public.cs_brand_invite(uuid, uuid, text, text, timestamptz), public.cs_brand_invite_open(text),
  public.cs_member_owner_rows(uuid)
  from public, anon, authenticated;

grant execute on function
  public.cs_my_brands(), public.cs_brand_rows(uuid, text[]),
  public.cs_brand_swap(uuid, text, text, timestamptz, timestamptz), public.cs_brand_drop(uuid, text, timestamptz),
  public.cs_brand_team(uuid), public.cs_brand_accept(text), public.cs_brand_remove(uuid, uuid),
  public.cs_brand_revoke(uuid), public.cs_brand_leave(uuid), public.cs_brand_forget(text)
  to authenticated;

grant execute on function
  public.cs_brand_invite(uuid, uuid, text, text, timestamptz), public.cs_brand_invite_open(text),
  public.cs_member_owner_rows(uuid)
  to service_role;

commit;
