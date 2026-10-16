-- People on Leo's posts board (design: docs/team-roles.md). Not the Team review
-- feature's cs_team_members (011): a separate table with its own rules.
-- One row per person Leo invites: their role, the board brands they see and the
-- modules they reach. The row starts as an invite (only a hash of the link's
-- token is kept), and the person's account claims it once.
--
-- Security model
--   * Only the `team-board` edge function touches this table, with the service
--     role. It trusts the caller's auth user id (never the email) and reads the
--     one live row for that id on every request, so revoking takes effect on
--     the next request.
--   * No client role can read or write it: RLS on with no policies, and every
--     grant taken back. Members never see each other or the invite hashes.
--   * Deleting either account deletes the row (on delete cascade).
--
-- Grants
--   table cs_board_members
--     revoke all from public, anon, authenticated: undoes Supabase's default
--       ALL grant. The service role bypasses RLS and keeps its own grants.
--
-- Idempotent: safe to run again, but `if not exists` skips an object that is already there, so a
-- change after this is applied needs a new migration number. One transaction.
-- The foreign keys to auth.users take SHARE ROW EXCLUSIVE on it, which queues
-- sign-ins behind this transaction while it waits for the lock: apply in a quiet
-- window. lock_timeout gives up after 3 seconds; a timeout is safe to retry.

begin;
set local lock_timeout = '3s';

create table if not exists public.cs_board_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- the name Leo gives the person; shown on their notes
  label text not null check (char_length(btrim(label)) between 1 and 60),
  -- null until the invite is claimed
  member_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer', 'commenter', 'editor', 'approver')),
  -- board brand ids (moneybees-reels studio/api/_db.js BRANDS)
  brands text[] not null default '{}' check (cardinality(brands) <= 20),
  modules text[] not null default '{reels}' check (modules <@ array['reels']::text[]),
  -- hex sha256 of the invite token; cleared when claimed
  invite_hash text check (invite_hash ~ '^[0-9a-f]{64}$'),
  invite_expires_at timestamptz,
  claimed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  -- an owner never sits on their own team
  check (member_id is distinct from owner_id),
  -- a claimed row has its person; an open invite has its hash and expiry
  check ((claimed_at is null) = (member_id is null)),
  check (claimed_at is not null or revoked_at is not null or (invite_hash is not null and invite_expires_at is not null))
);

create unique index if not exists cs_board_members_invite_hash on public.cs_board_members (invite_hash)
  where invite_hash is not null;
-- one live membership per person (there is one board), found on every request;
-- a revoked person can be invited again
create unique index if not exists cs_board_members_live_member on public.cs_board_members (member_id)
  where revoked_at is null and member_id is not null;
-- Leo's team list, and the cascades when an account is deleted
create index if not exists cs_board_members_owner on public.cs_board_members (owner_id, created_at);
create index if not exists cs_board_members_member on public.cs_board_members (member_id);

alter table public.cs_board_members enable row level security;

revoke all on table public.cs_board_members from public, anon, authenticated;

commit;
