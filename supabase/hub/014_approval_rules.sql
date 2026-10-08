-- Approval rules (gap s23). Two additions to team review (011):
--   1. A leader can reject a submission outright: a final status next to
--      approved and changes_requested. A reason is required, as for
--      changes_requested. The author may still write a new version and
--      submit it again; the rejected submission itself stays locked.
--   2. A leader can mark a member as "needs approval before posting". For
--      those members the app keeps Copy and Mark posted locked on a post
--      until its latest submission is approved and unchanged. Posting happens
--      outside the app, so the gate is client-side; this table is the record
--      of who is on approval, and every change is logged in cs_review_events.
--
-- Depends on 011_team_review.sql. Changes to 011 objects:
--   * cs_review_submissions: status check gains 'rejected'; the comment check
--     covers rejected too (constraint names kept). Table had 0 rows live on
--     2026-10-08, and every existing row already satisfies the new checks.
--   * cs_review_events: kind check gains 'rejected' and 'approval_rule_set'.
--   * cs_review_submission(uuid, text, text): replaced with the same
--     signature and body except it accepts 'rejected' (live definition was
--     checked identical to the 011 file before this was written).
--
-- Security model
--   * cs_team_approval_rules: one row per (team, member) on approval. RLS
--     SELECT only: the member reads their own rule, leaders read their
--     team's. Other members never see who is on approval.
--   * Rules change only through cs_set_approval_required (leaders of the
--     member's current team; not on themselves), which logs an
--     approval_rule_set event in the same transaction.
--   * A rule is keyed on (team, user), not on membership, so leaving and
--     rejoining the team does not clear it. Rows for people no longer in
--     the team are inert: the app applies the rule for the current team only.
--   * anon gets nothing.
--
-- Grants, one by one
--   table cs_team_approval_rules
--     revoke all from public, anon, authenticated: undoes Supabase's default
--       ALL grant.
--     grant select to authenticated: for RLS reads.
--   functions
--     cs_set_approval_required: revoked from public and anon, granted to
--       authenticated.
--     cs_review_submission: CREATE OR REPLACE keeps 011's privileges; they
--       are restated here (revoke from public, anon; grant to authenticated).
--
-- Policies
--   cs_team_approval_rules_read: user_id = auth.uid() or the caller leads
--     that team.
--
-- Idempotent: safe to run again.

-- ---------------------------------------------------------------------------
-- 1. Reject outright
-- ---------------------------------------------------------------------------

alter table public.cs_review_submissions
  drop constraint if exists cs_review_submissions_status_check;
alter table public.cs_review_submissions
  add constraint cs_review_submissions_status_check
  check (status in ('pending', 'approved', 'changes_requested', 'rejected'));

alter table public.cs_review_submissions
  drop constraint if exists cs_review_submissions_changes_need_comment;
alter table public.cs_review_submissions
  add constraint cs_review_submissions_changes_need_comment
  check (status not in ('changes_requested', 'rejected')
         or char_length(btrim(coalesce(review_comment, ''))) > 0);

alter table public.cs_review_events
  drop constraint if exists cs_review_events_kind_check;
alter table public.cs_review_events
  add constraint cs_review_events_kind_check
  check (kind in (
    'team_created', 'member_joined', 'member_left',
    'submitted', 'approved', 'changes_requested', 'rejected',
    'approval_rule_set'
  ));

-- Same as 011 except: 'rejected' is a decision, and it needs a reason.
create or replace function public.cs_review_submission(
  p_submission_id uuid,
  p_decision text,
  p_comment text default null
) returns public.cs_review_submissions
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_row public.cs_review_submissions%rowtype;
  v_reviewer_name text;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if v_uid is null then
    raise exception 'Sign in to review.' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approved', 'changes_requested', 'rejected') then
    raise exception 'Choose approve, request changes or reject.' using errcode = '22023';
  end if;

  select * into v_row from public.cs_review_submissions where id = p_submission_id for update;
  select display_name into v_reviewer_name
  from public.cs_team_members
  where team_id = v_row.team_id and user_id = v_uid and role = 'leader';
  -- Same message whether the submission is missing or belongs to another team.
  if v_row.id is null or v_reviewer_name is null then
    raise exception 'Only a leader of this team can review this submission.' using errcode = '42501';
  end if;

  if v_row.author_id = v_uid then
    raise exception 'You can''t review your own submission. Another leader has to review it.'
      using errcode = '42501';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'This submission has already been reviewed.';
  end if;
  if p_decision = 'changes_requested' and v_comment is null then
    raise exception 'Add a comment saying what needs to change.' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and v_comment is null then
    raise exception 'Add a reason for rejecting this post.' using errcode = '22023';
  end if;
  if char_length(v_comment) > 2000 then
    raise exception 'Keep the comment under 2,000 characters.' using errcode = '22023';
  end if;

  update public.cs_review_submissions
  set status = p_decision,
      reviewer_id = v_uid,
      reviewer_name = v_reviewer_name,
      review_comment = v_comment,
      reviewed_at = now()
  where id = v_row.id
  returning * into v_row;

  perform public.cs_log_event(
    v_row.team_id, v_uid, v_reviewer_name, v_row.id, p_decision,
    jsonb_build_object(
      'draft_id', v_row.draft_id,
      'author_id', v_row.author_id,
      'author_name', v_row.author_name,
      'comment', v_comment
    ),
    v_row.content_hash
  );
  return v_row;
end $$;

revoke all on function public.cs_review_submission(uuid, text, text) from public, anon;
grant execute on function public.cs_review_submission(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Members who need approval before posting
-- ---------------------------------------------------------------------------

create table if not exists public.cs_team_approval_rules (
  team_id uuid not null references public.cs_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  set_by uuid,
  set_by_name text not null,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

alter table public.cs_team_approval_rules enable row level security;

revoke all on table public.cs_team_approval_rules from public, anon, authenticated;
grant select on table public.cs_team_approval_rules to authenticated;

-- Turns the rule on or off for one member of the caller's team. A no-op
-- (already in that state) changes nothing and logs nothing. Returns the
-- resulting state.
create or replace function public.cs_set_approval_required(p_user_id uuid, p_required boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_leader public.cs_team_members%rowtype;
  v_target public.cs_team_members%rowtype;
  v_changed int;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_required is null then
    raise exception 'Choose on or off.' using errcode = '22023';
  end if;
  if p_user_id is null or p_user_id = v_uid then
    raise exception 'You can''t put yourself on approval.' using errcode = '22023';
  end if;

  -- Serialise with the member joining or leaving (same lock as 011).
  perform pg_advisory_xact_lock(hashtextextended('cs_team_membership:' || p_user_id::text, 0));

  select * into v_leader from public.cs_team_members where user_id = v_uid and role = 'leader';
  select * into v_target from public.cs_team_members where user_id = p_user_id;
  if v_leader.team_id is null or v_target.team_id is distinct from v_leader.team_id then
    raise exception 'Only a leader of this person''s team can change this.' using errcode = '42501';
  end if;

  if p_required then
    insert into public.cs_team_approval_rules (team_id, user_id, set_by, set_by_name)
    values (v_leader.team_id, p_user_id, v_uid, v_leader.display_name)
    on conflict (team_id, user_id) do nothing;
  else
    delete from public.cs_team_approval_rules
    where team_id = v_leader.team_id and user_id = p_user_id;
  end if;
  get diagnostics v_changed = row_count;

  if v_changed > 0 then
    perform public.cs_log_event(
      v_leader.team_id, v_uid, v_leader.display_name, null, 'approval_rule_set',
      jsonb_build_object(
        'user_id', p_user_id,
        'display_name', v_target.display_name,
        'required', p_required
      ),
      null
    );
  end if;
  return p_required;
end $$;

revoke all on function public.cs_set_approval_required(uuid, boolean) from public, anon;
grant execute on function public.cs_set_approval_required(uuid, boolean) to authenticated;

drop policy if exists cs_team_approval_rules_read on public.cs_team_approval_rules;
create policy cs_team_approval_rules_read on public.cs_team_approval_rules
  for select to authenticated
  using (user_id = (select auth.uid()) or public.cs_is_team_leader(team_id));
