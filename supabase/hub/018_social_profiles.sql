-- Connected social accounts through Zernio (design: docs/zernio-connection.md).
-- Maps each Content Studio brand profile to one Zernio profile; the adviser's
-- connected accounts, scheduled posts, comment-to-DM automations and metrics live
-- in Zernio under that profile and are read live by the `social` edge function.
--
-- Security model
--   * The Zernio API key is an edge secret only. Zernio accepts any account,
--     post or automation id on the team, so this table is what scopes a caller:
--     the edge function looks up (owner_id = caller, profile_id) here and checks
--     every requested id belongs to that Zernio profile before calling Zernio.
--   * Rows are written only by the edge function with the service role (it
--     creates the Zernio profile, then inserts). No client role can write.
--   * The owner may read their own rows (to show "connected" without a call).
--   * Deleting a user deletes their rows (on delete cascade); disconnecting the
--     accounts in Zernio is the edge function's job, not this table's.
--
-- Grants
--   table cs_social_profiles
--     revoke all from public, anon, authenticated: undoes Supabase's default
--       ALL grant; no client role can write.
--     grant select to authenticated: RLS reads of the caller's own rows.
--
-- Policies
--   cs_social_profiles_owner_read: owner_id = auth.uid().
--
-- Idempotent: safe to run again. One transaction. The foreign key to auth.users
-- takes SHARE ROW EXCLUSIVE on auth.users for this short transaction; lock_timeout
-- gives up after 3 seconds; run it again later if it times out.

begin;
set local lock_timeout = '3s';

create table if not exists public.cs_social_profiles (
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- src/lib/profiles.ts ids: "me" or p + base-36 characters (as 015).
  profile_id text not null check (profile_id ~ '^[a-z0-9]{1,40}$'),
  -- Zernio ids are 24 lowercase hex characters.
  zernio_profile_id text not null unique check (zernio_profile_id ~ '^[a-f0-9]{24}$'),
  created_at timestamptz not null default now(),
  primary key (owner_id, profile_id)
);

alter table public.cs_social_profiles enable row level security;

revoke all on table public.cs_social_profiles from public, anon, authenticated;
grant select on table public.cs_social_profiles to authenticated;

drop policy if exists cs_social_profiles_owner_read on public.cs_social_profiles;
create policy cs_social_profiles_owner_read on public.cs_social_profiles
  for select to authenticated
  using (owner_id = (select auth.uid()));

commit;
