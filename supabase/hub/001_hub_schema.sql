-- Content Studio Hub schema. Prefix hub_. Applied 2026-07-08 via Management API.
create extension if not exists citext;

create table if not exists public.hub_allowlist (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  client_name text not null,
  niche text not null,
  brand_notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.hub_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email citext not null,
  status text not null default 'none' check (status in ('none','client','active','canceled')),
  is_admin boolean not null default false,
  industry text,
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hub_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  body_md text not null default '',
  category text not null check (category in ('editing','videography','trends','tips')),
  audience_type text not null default 'all' check (audience_type in ('all','industry','client')),
  audience_value text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hub_trends (
  id uuid primary key default gen_random_uuid(),
  niche text not null,
  title text not null,
  summary_md text not null,
  angles_md text not null,
  source_urls text[] not null default '{}',
  audience_type text not null default 'industry' check (audience_type in ('all','industry','client')),
  audience_value text,
  created_at timestamptz not null default now()
);

alter table public.hub_allowlist enable row level security;
alter table public.hub_memberships enable row level security;
alter table public.hub_posts enable row level security;
alter table public.hub_trends enable row level security;

-- SECURITY DEFINER helpers avoid self-referencing RLS recursion.
create or replace function public.hub_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from hub_memberships where user_id = auth.uid()), false)
$$;

create or replace function public.hub_membership_status() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select status from hub_memberships where user_id = auth.uid()), 'none')
$$;

create or replace function public.hub_is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select public.hub_is_admin() or public.hub_membership_status() in ('client','active')
$$;

create or replace function public.hub_my_industry() returns text
language sql stable security definer set search_path = public as $$
  select industry from hub_memberships where user_id = auth.uid()
$$;

create or replace function public.hub_my_email() returns citext
language sql stable security definer set search_path = public as $$
  select email from hub_memberships where user_id = auth.uid()
$$;

-- Client self-provisioning: if the logged-in user's email is allowlisted,
-- upsert a 'client' membership inheriting the allowlist niche.
create or replace function public.hub_claim_client_access() returns text
language plpgsql security definer set search_path = public as $$
declare
  my_email citext;
  row_allow hub_allowlist%rowtype;
begin
  select lower(u.email)::citext into my_email from auth.users u where u.id = auth.uid();
  if my_email is null then return 'no-auth'; end if;
  select * into row_allow from hub_allowlist where email = my_email;
  if not found then return 'not-allowlisted'; end if;
  insert into hub_memberships (user_id, email, status, industry)
    values (auth.uid(), my_email, 'client', row_allow.niche)
    on conflict (user_id) do update
      set status = 'client', industry = row_allow.niche, email = excluded.email, updated_at = now();
  return 'client';
end $$;

-- Subscriber industry picker (owner-controlled column update without a broad UPDATE policy).
create or replace function public.hub_set_industry(p_industry text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update hub_memberships set industry = p_industry, updated_at = now()
    where user_id = auth.uid();
end $$;

revoke all on function public.hub_claim_client_access() from anon;
revoke all on function public.hub_set_industry(text) from anon;

-- Policies
create policy hub_allowlist_admin_all on public.hub_allowlist
  for all using (public.hub_is_admin()) with check (public.hub_is_admin());

create policy hub_memberships_own_read on public.hub_memberships
  for select using (user_id = auth.uid() or public.hub_is_admin());

create policy hub_posts_admin_all on public.hub_posts
  for all using (public.hub_is_admin()) with check (public.hub_is_admin());

create policy hub_posts_member_read on public.hub_posts
  for select using (
    published and public.hub_is_member() and (
      audience_type = 'all'
      or (audience_type = 'industry' and audience_value = public.hub_my_industry())
      or (audience_type = 'client' and lower(audience_value) = lower(public.hub_my_email()::text))
    )
  );

create policy hub_trends_member_read on public.hub_trends
  for select using (
    public.hub_is_admin() or (
      public.hub_is_member() and (
        audience_type = 'all'
        or (audience_type = 'industry' and audience_value = public.hub_my_industry())
        or (audience_type = 'client' and lower(audience_value) = lower(public.hub_my_email()::text))
      )
    )
  );
-- No insert/update policies on memberships/trends: writes go through
-- SECURITY DEFINER RPCs or the service role (webhook + scout).
