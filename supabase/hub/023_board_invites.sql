-- Invite links for Leo's posts board (design: docs/team-roles.md). Leo, 16 Oct: "no need for me to
-- indicate their name". A link now carries only a role and brands; whoever opens it joins with those,
-- under the name on their own account. So the invite moves out of cs_board_members (022) into its own
-- table, and cs_board_members keeps only people who joined.
--
-- Security model
--   * Only the `team-board` edge function touches these tables and calls cs_board_claim, with the service
--     role. RLS on with no policies and every grant taken back, as in 022.
--   * A link is stored only as the sha256 of its token. It works until it expires, is turned off, or
--     reaches max_uses (1 for approver links: an approval posts to Instagram).
--   * cs_board_claim joins one person through one link atomically: it locks the invite row, checks it,
--     adds the member and counts the use in one transaction, so two people can't both take a one-use link.
--
-- 022 was applied on 2026-10-16 with no rows (checked before this was written). This drops its invite
-- columns; the checks that named them go with them.
--
-- Idempotent where Postgres allows; one transaction. The foreign key to auth.users takes SHARE ROW
-- EXCLUSIVE on it, which queues sign-ins while it waits: apply in a quiet window. lock_timeout gives up
-- after 3 seconds; a timeout is safe to retry.

begin;
set local lock_timeout = '3s';

-- first run only (while 022's invite columns are still there): the reshape assumes no rows
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cs_board_members' and column_name = 'invite_hash')
     and exists (select 1 from public.cs_board_members) then
    raise exception '023 expects an empty cs_board_members; move its rows first';
  end if;
end $$;

create table if not exists public.cs_board_invites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer', 'commenter', 'editor', 'approver')),
  brands text[] not null check (cardinality(brands) between 1 and 20),
  modules text[] not null default '{reels}' check (modules <@ array['reels']::text[]),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  -- null: any number of people
  max_uses int check (max_uses is null or max_uses >= 1),
  uses int not null default 0 check (uses >= 0 and (max_uses is null or uses <= max_uses)),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists cs_board_invites_owner on public.cs_board_invites (owner_id, created_at);

alter table public.cs_board_members drop column if exists invite_hash;
alter table public.cs_board_members drop column if exists invite_expires_at;
alter table public.cs_board_members alter column member_id set not null;
alter table public.cs_board_members alter column claimed_at set not null;
alter table public.cs_board_members alter column claimed_at set default now();
alter table public.cs_board_members add column if not exists invite_id uuid references public.cs_board_invites(id) on delete set null;

alter table public.cs_board_invites enable row level security;
revoke all on table public.cs_board_invites from public, anon, authenticated;

-- Joins p_member through the link whose token hashes to p_hash. Returns the new member row, or raises:
--   'invite_gone' (no such link, expired, turned off or used up), 'owner_self' (the owner's own link),
--   'removed' (Leo removed this person after the link was made: only a newer link lets them back),
--   23505 from cs_board_members_live_member (already on the team).
create or replace function public.cs_board_claim(p_hash text, p_member uuid, p_label text)
returns public.cs_board_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.cs_board_invites;
  m public.cs_board_members;
begin
  select * into inv from public.cs_board_invites
  where token_hash = p_hash and revoked_at is null and expires_at > now() and (max_uses is null or uses < max_uses)
  for update;
  if not found then
    raise exception 'invite_gone';
  end if;
  if inv.owner_id = p_member then
    raise exception 'owner_self';
  end if;
  if exists (select 1 from public.cs_board_members
             where owner_id = inv.owner_id and member_id = p_member and revoked_at is not null and revoked_at >= inv.created_at) then
    raise exception 'removed';
  end if;
  insert into public.cs_board_members (owner_id, label, member_id, role, brands, modules, claimed_at, invite_id)
  values (inv.owner_id, left(btrim(p_label), 60), p_member, inv.role, inv.brands, inv.modules, now(), inv.id)
  returning * into m;
  update public.cs_board_invites set uses = uses + 1 where id = inv.id;
  return m;
end $$;

revoke all on function public.cs_board_claim(text, uuid, text) from public, anon, authenticated;
grant execute on function public.cs_board_claim(text, uuid, text) to service_role;

commit;
