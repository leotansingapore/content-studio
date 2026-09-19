-- Team review (v1): agency leaders approve consultants' posts before they go
-- out, and keep a record of what was approved (MAS digital advertising
-- guidelines, in force 25 Mar 2026). Used by src/lib/teamReview.ts and /team.
--
-- Security model
--   * RLS is on for every table. Clients get SELECT only; there are no client
--     INSERT/UPDATE/DELETE policies and those privileges are revoked.
--   * Every state change goes through a SECURITY DEFINER function below that
--     checks auth.uid() itself and writes its audit event in the same
--     transaction.
--   * Triggers make submission content immutable and the audit trail
--     append-only for every role that is subject to triggers, including the
--     service role and these functions.
--   * Submissions and events keep the author/actor id and name but have no
--     foreign key to auth.users, so the record outlives a deleted account.
--
-- Hashing uses core sha256() (PostgreSQL 11+), so pgcrypto is not needed. The
-- text is normalised first (CRLF/CR -> LF, spaces/tabs/newlines trimmed from
-- both ends); normalizeReviewText() in src/lib/teamReview.ts must stay
-- identical.
--
-- Idempotent: safe to run again.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.cs_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Kept apart from cs_teams so RLS can show the code to leaders only.
create table if not exists public.cs_team_invites (
  team_id uuid primary key references public.cs_teams(id) on delete cascade,
  code text not null unique check (code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.cs_team_members (
  team_id uuid not null references public.cs_teams(id) on delete cascade,
  -- unique: a person belongs to at most one team in v1.
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (role in ('leader', 'member')),
  display_name text not null check (char_length(display_name) between 1 and 80),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.cs_review_submissions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.cs_teams(id) on delete restrict,
  author_id uuid not null,
  author_name text not null,
  draft_id text not null check (char_length(draft_id) between 1 and 200),
  platform text not null check (platform ~ '^[a-z0-9-]{1,40}$'),
  format text not null check (format ~ '^[a-z0-9-]{1,40}$'),
  content text not null check (char_length(content) between 1 and 20000),
  compliance_flags jsonb not null default '[]'::jsonb
    check (jsonb_typeof(compliance_flags) = 'array'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'changes_requested')),
  reviewer_id uuid,
  reviewer_name text,
  review_comment text check (char_length(review_comment) <= 2000),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint cs_review_submissions_reviewed_shape
    check ((status = 'pending') = (reviewed_at is null and reviewer_id is null)),
  constraint cs_review_submissions_changes_need_comment
    check (status <> 'changes_requested' or char_length(btrim(coalesce(review_comment, ''))) > 0),
  constraint cs_review_submissions_no_self_review
    check (reviewer_id is null or reviewer_id <> author_id)
);

create index if not exists cs_review_submissions_queue_idx
  on public.cs_review_submissions (team_id, status, submitted_at desc);
create index if not exists cs_review_submissions_author_idx
  on public.cs_review_submissions (author_id, submitted_at desc);
-- One open submission per draft; resubmitting waits for the leader's answer.
create unique index if not exists cs_review_submissions_one_pending
  on public.cs_review_submissions (team_id, author_id, draft_id)
  where status = 'pending';

create table if not exists public.cs_review_events (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.cs_teams(id) on delete restrict,
  actor_id uuid,
  actor_name text not null,
  submission_id uuid references public.cs_review_submissions(id) on delete restrict,
  kind text not null check (kind in (
    'team_created', 'member_joined', 'member_left',
    'submitted', 'approved', 'changes_requested'
  )),
  detail jsonb not null default '{}'::jsonb,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create index if not exists cs_review_events_team_idx
  on public.cs_review_events (team_id, created_at desc);

-- Wrong invite codes, for the guess limit in cs_join_team. No policies.
create table if not exists public.cs_team_join_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index if not exists cs_team_join_attempts_user_idx
  on public.cs_team_join_attempts (user_id, attempted_at desc);

alter table public.cs_teams enable row level security;
alter table public.cs_team_invites enable row level security;
alter table public.cs_team_members enable row level security;
alter table public.cs_review_submissions enable row level security;
alter table public.cs_review_events enable row level security;
alter table public.cs_team_join_attempts enable row level security;

-- Clients read through RLS and write only through the functions below.
revoke all on table
  public.cs_teams, public.cs_team_invites, public.cs_team_members,
  public.cs_review_submissions, public.cs_review_events, public.cs_team_join_attempts
  from public, anon, authenticated;
grant select on table
  public.cs_teams, public.cs_team_invites, public.cs_team_members,
  public.cs_review_submissions, public.cs_review_events
  to authenticated;
revoke all on sequence
  public.cs_review_events_id_seq, public.cs_team_join_attempts_id_seq
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.cs_review_normalize(p_text text) returns text
language sql immutable parallel safe set search_path = public as $$
  select regexp_replace(
    replace(replace(coalesce(p_text, ''), E'\r\n', E'\n'), E'\r', E'\n'),
    '^[ \t\n]+|[ \t\n]+$', '', 'g'
  )
$$;

create or replace function public.cs_review_hash(p_text text) returns text
language sql immutable parallel safe set search_path = public as $$
  select encode(sha256(convert_to(public.cs_review_normalize(p_text), 'UTF8')), 'hex')
$$;

-- Single-line, control-character-free label (team and display names).
create or replace function public.cs_clean_label(p_text text) returns text
language sql immutable parallel safe set search_path = public as $$
  select btrim(regexp_replace(coalesce(p_text, ''), '[[:cntrl:]]+', ' ', 'g'))
$$;

-- 10 characters from a 32-symbol alphabet without 0/O/1/I (50 bits).
-- gen_random_uuid() draws from pg_strong_random(). Bytes 6 and 8 carry the
-- UUID version/variant bits and are skipped; 256 is a multiple of 32, so
-- byte % 32 has no bias.
create or replace function public.cs_generate_invite_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_positions constant int[] := array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11];
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_code text := '';
  i int;
begin
  foreach i in array v_positions loop
    v_code := v_code || substr(v_alphabet, get_byte(v_bytes, i) % 32 + 1, 1);
  end loop;
  return v_code;
end $$;

-- Requested name, else the account's name, else the email's local part.
create or replace function public.cs_member_display_name(p_uid uuid, p_requested text)
returns text
language sql stable set search_path = public as $$
  select left(coalesce(
    nullif(public.cs_clean_label(p_requested), ''),
    (select coalesce(
       nullif(public.cs_clean_label(u.raw_user_meta_data ->> 'full_name'), ''),
       nullif(public.cs_clean_label(u.raw_user_meta_data ->> 'name'), ''),
       nullif(split_part(u.email, '@', 1), ''))
     from auth.users u where u.id = p_uid),
    'Team member'
  ), 80)
$$;

-- Appends one audit event. Membership events hash a snapshot of the event
-- itself; submission events carry the submission's content hash.
create or replace function public.cs_log_event(
  p_team_id uuid,
  p_actor_id uuid,
  p_actor_name text,
  p_submission_id uuid,
  p_kind text,
  p_detail jsonb,
  p_content_hash text
) returns bigint
language plpgsql set search_path = public as $$
declare
  v_detail jsonb := coalesce(p_detail, '{}'::jsonb);
  v_id bigint;
begin
  insert into public.cs_review_events
    (team_id, actor_id, actor_name, submission_id, kind, detail, content_hash)
  values (
    p_team_id, p_actor_id, p_actor_name, p_submission_id, p_kind, v_detail,
    coalesce(p_content_hash, public.cs_review_hash(jsonb_build_object(
      'team_id', p_team_id, 'actor_id', p_actor_id, 'actor_name', p_actor_name,
      'kind', p_kind, 'detail', v_detail
    )::text))
  )
  returning id into v_id;
  return v_id;
end $$;

-- RLS helpers. SECURITY DEFINER avoids policy recursion on cs_team_members;
-- both only ever describe the caller.
create or replace function public.cs_my_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from public.cs_team_members where user_id = auth.uid()
$$;

create or replace function public.cs_is_team_leader(p_team_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cs_team_members
    where team_id = p_team_id and user_id = auth.uid() and role = 'leader'
  )
$$;

-- ---------------------------------------------------------------------------
-- Integrity triggers (apply to every role except superusers disabling them)
-- ---------------------------------------------------------------------------

create or replace function public.cs_review_submissions_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Review submissions are part of the audit record and cannot be deleted.'
      using errcode = '42501';
  end if;
  if (new.id, new.team_id, new.author_id, new.author_name, new.draft_id, new.platform,
      new.format, new.content, new.compliance_flags, new.content_hash, new.submitted_at)
     is distinct from
     (old.id, old.team_id, old.author_id, old.author_name, old.draft_id, old.platform,
      old.format, old.content, old.compliance_flags, old.content_hash, old.submitted_at) then
    raise exception 'A submission is locked once submitted. Submit the draft again instead.'
      using errcode = '42501';
  end if;
  if old.status <> 'pending' then
    raise exception 'This submission has already been reviewed.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists cs_review_submissions_guard on public.cs_review_submissions;
create trigger cs_review_submissions_guard
  before update or delete on public.cs_review_submissions
  for each row execute function public.cs_review_submissions_guard();

create or replace function public.cs_review_events_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  raise exception 'The review audit trail is append-only.' using errcode = '42501';
end $$;

drop trigger if exists cs_review_events_append_only on public.cs_review_events;
create trigger cs_review_events_append_only
  before update or delete on public.cs_review_events
  for each row execute function public.cs_review_events_guard();

drop trigger if exists cs_review_events_no_truncate on public.cs_review_events;
create trigger cs_review_events_no_truncate
  before truncate on public.cs_review_events
  for each statement execute function public.cs_review_events_guard();

drop trigger if exists cs_review_submissions_no_truncate on public.cs_review_submissions;
create trigger cs_review_submissions_no_truncate
  before truncate on public.cs_review_submissions
  for each statement execute function public.cs_review_events_guard();

-- ---------------------------------------------------------------------------
-- State changes (the only client write path)
-- ---------------------------------------------------------------------------

create or replace function public.cs_create_team(p_name text, p_display_name text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_name text := public.cs_clean_label(p_name);
  v_display text;
  v_team_id uuid;
  v_tries int := 0;
begin
  if v_uid is null then
    raise exception 'Sign in to create a team.' using errcode = '42501';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'Give your team a name of 1 to 80 characters.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cs_team_membership:' || v_uid::text, 0));
  if exists (select 1 from public.cs_team_members where user_id = v_uid) then
    raise exception 'You are already in a team. Leave it before creating a new one.';
  end if;

  v_display := public.cs_member_display_name(v_uid, p_display_name);

  insert into public.cs_teams (name, owner_id) values (v_name, v_uid)
  returning id into v_team_id;

  loop
    begin
      insert into public.cs_team_invites (team_id, code)
      values (v_team_id, public.cs_generate_invite_code());
      exit;
    exception when unique_violation then
      v_tries := v_tries + 1;
      if v_tries >= 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.cs_team_members (team_id, user_id, role, display_name)
  values (v_team_id, v_uid, 'leader', v_display);

  perform public.cs_log_event(
    v_team_id, v_uid, v_display, null, 'team_created',
    jsonb_build_object('team_name', v_name, 'role', 'leader'), null
  );
  return v_team_id;
end $$;

-- Returns {ok:true, team_id, team_name} or {ok:false, error, message}.
-- A wrong code is returned, not raised, so the failed attempt is committed
-- and counts towards the limit of 10 per hour.
create or replace function public.cs_join_team(p_code text, p_display_name text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c_limit constant int := 10;
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_failed int;
  v_team_id uuid;
  v_team_name text;
  v_display text;
begin
  if v_uid is null then
    raise exception 'Sign in to join a team.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cs_team_membership:' || v_uid::text, 0));
  if exists (select 1 from public.cs_team_members where user_id = v_uid) then
    raise exception 'You are already in a team. Leave it before joining another.';
  end if;

  delete from public.cs_team_join_attempts
  where user_id = v_uid and attempted_at < now() - interval '1 day';
  select count(*) into v_failed
  from public.cs_team_join_attempts
  where user_id = v_uid and attempted_at > now() - interval '1 hour';

  if v_failed >= c_limit then
    return jsonb_build_object(
      'ok', false, 'error', 'rate_limited',
      'message', 'Too many wrong codes. Wait an hour, then try again.'
    );
  end if;

  select t.id, t.name into v_team_id, v_team_name
  from public.cs_team_invites i
  join public.cs_teams t on t.id = i.team_id
  where i.code = v_code;

  if v_team_id is null then
    insert into public.cs_team_join_attempts (user_id) values (v_uid);
    return jsonb_build_object(
      'ok', false, 'error', 'invalid_code',
      'message', 'That code doesn''t match a team. Check it with your team leader.',
      'attempts_left', greatest(c_limit - v_failed - 1, 0)
    );
  end if;

  -- Serialise with a leader leaving, then refuse a team with no leader.
  perform 1 from public.cs_teams where id = v_team_id for share;
  if not exists (
    select 1 from public.cs_team_members where team_id = v_team_id and role = 'leader'
  ) then
    raise exception 'This team no longer has a leader, so it can''t take new members.';
  end if;

  v_display := public.cs_member_display_name(v_uid, p_display_name);
  insert into public.cs_team_members (team_id, user_id, role, display_name)
  values (v_team_id, v_uid, 'member', v_display);

  perform public.cs_log_event(
    v_team_id, v_uid, v_display, null, 'member_joined',
    jsonb_build_object('role', 'member'), null
  );
  return jsonb_build_object('ok', true, 'team_id', v_team_id, 'team_name', v_team_name);
end $$;

-- Members can always leave. A leader can leave only a team that has no other
-- members and no review history, so the record never loses its only reader.
create or replace function public.cs_leave_team() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_member public.cs_team_members%rowtype;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cs_team_membership:' || v_uid::text, 0));
  select * into v_member from public.cs_team_members where user_id = v_uid;
  if not found then
    raise exception 'You are not in a team.';
  end if;

  if v_member.role = 'leader' and not exists (
    select 1 from public.cs_team_members
    where team_id = v_member.team_id and user_id <> v_uid and role = 'leader'
  ) then
    perform 1 from public.cs_teams where id = v_member.team_id for update;
    if exists (
      select 1 from public.cs_team_members
      where team_id = v_member.team_id and user_id <> v_uid
    ) then
      raise exception 'Your team still has members, so its leader can''t leave.';
    end if;
    if exists (select 1 from public.cs_review_submissions where team_id = v_member.team_id) then
      raise exception 'Your team has a review history, so its leader can''t leave. The record stays with you.';
    end if;
  end if;

  perform public.cs_log_event(
    v_member.team_id, v_uid, v_member.display_name, null, 'member_left',
    jsonb_build_object('role', v_member.role), null
  );
  delete from public.cs_team_members where team_id = v_member.team_id and user_id = v_uid;
end $$;

create or replace function public.cs_submit_for_review(
  p_draft_id text,
  p_platform text,
  p_format text,
  p_content text,
  p_flags jsonb default '[]'::jsonb
) returns public.cs_review_submissions
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_member public.cs_team_members%rowtype;
  v_content text := public.cs_review_normalize(p_content);
  v_flags jsonb := coalesce(p_flags, '[]'::jsonb);
  v_row public.cs_review_submissions%rowtype;
begin
  if v_uid is null then
    raise exception 'Sign in to submit for review.' using errcode = '42501';
  end if;
  select * into v_member from public.cs_team_members where user_id = v_uid;
  if not found then
    raise exception 'Join a team before submitting posts for review.' using errcode = '42501';
  end if;

  if p_draft_id is null or char_length(p_draft_id) not between 1 and 200 then
    raise exception 'This draft has no id. Open it, save it, and try again.' using errcode = '22023';
  end if;
  if coalesce(p_platform, '') !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'This draft has no valid platform.' using errcode = '22023';
  end if;
  if coalesce(p_format, '') !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'This draft has no valid format.' using errcode = '22023';
  end if;
  if char_length(v_content) = 0 then
    raise exception 'There is no post text to review.' using errcode = '22023';
  end if;
  if char_length(v_content) > 20000 then
    raise exception 'This post is too long to submit (20,000 characters at most).' using errcode = '22023';
  end if;
  if jsonb_typeof(v_flags) <> 'array'
     or jsonb_array_length(v_flags) > 50
     or octet_length(v_flags::text) > 20000
     or exists (select 1 from jsonb_array_elements(v_flags) e where jsonb_typeof(e) <> 'object') then
    raise exception 'The compliance flags sent with this draft are malformed.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.cs_review_submissions
    where team_id = v_member.team_id and author_id = v_uid
      and draft_id = p_draft_id and status = 'pending'
  ) then
    raise exception 'This draft is already waiting for review. You can resubmit after your leader responds.';
  end if;

  begin
    insert into public.cs_review_submissions (
      team_id, author_id, author_name, draft_id, platform, format,
      content, compliance_flags, content_hash
    ) values (
      v_member.team_id, v_uid, v_member.display_name, p_draft_id, p_platform, p_format,
      v_content, v_flags, public.cs_review_hash(v_content)
    )
    returning * into v_row;
  exception when unique_violation then
    raise exception 'This draft is already waiting for review. You can resubmit after your leader responds.';
  end;

  perform public.cs_log_event(
    v_row.team_id, v_uid, v_member.display_name, v_row.id, 'submitted',
    jsonb_build_object(
      'draft_id', v_row.draft_id,
      'platform', v_row.platform,
      'format', v_row.format,
      'flag_count', jsonb_array_length(v_flags),
      'error_flag_count',
        (select count(*) from jsonb_array_elements(v_flags) e where e ->> 'severity' = 'error')
    ),
    v_row.content_hash
  );
  return v_row;
end $$;

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
  if p_decision is null or p_decision not in ('approved', 'changes_requested') then
    raise exception 'Choose approve or request changes.' using errcode = '22023';
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

-- ---------------------------------------------------------------------------
-- Function privileges. Supabase grants EXECUTE on new functions to anon and
-- authenticated by default, so revoke explicitly.
-- ---------------------------------------------------------------------------

revoke all on function public.cs_review_normalize(text) from public, anon, authenticated;
revoke all on function public.cs_review_hash(text) from public, anon, authenticated;
revoke all on function public.cs_clean_label(text) from public, anon, authenticated;
revoke all on function public.cs_generate_invite_code() from public, anon, authenticated;
revoke all on function public.cs_member_display_name(uuid, text) from public, anon, authenticated;
revoke all on function public.cs_log_event(uuid, uuid, text, uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.cs_review_submissions_guard() from public, anon, authenticated;
revoke all on function public.cs_review_events_guard() from public, anon, authenticated;

-- Used inside RLS policies, so the querying role needs EXECUTE.
revoke all on function public.cs_my_team_id() from public, anon;
revoke all on function public.cs_is_team_leader(uuid) from public, anon;
grant execute on function public.cs_my_team_id() to authenticated;
grant execute on function public.cs_is_team_leader(uuid) to authenticated;

revoke all on function public.cs_create_team(text, text) from public, anon;
revoke all on function public.cs_join_team(text, text) from public, anon;
revoke all on function public.cs_leave_team() from public, anon;
revoke all on function public.cs_submit_for_review(text, text, text, text, jsonb) from public, anon;
revoke all on function public.cs_review_submission(uuid, text, text) from public, anon;
grant execute on function public.cs_create_team(text, text) to authenticated;
grant execute on function public.cs_join_team(text, text) to authenticated;
grant execute on function public.cs_leave_team() to authenticated;
grant execute on function public.cs_submit_for_review(text, text, text, text, jsonb) to authenticated;
grant execute on function public.cs_review_submission(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Policies (SELECT only)
-- ---------------------------------------------------------------------------

-- Members read their own team's row.
drop policy if exists cs_teams_member_read on public.cs_teams;
create policy cs_teams_member_read on public.cs_teams
  for select to authenticated
  using (id = (select public.cs_my_team_id()));

-- Only leaders see the invite code.
drop policy if exists cs_team_invites_leader_read on public.cs_team_invites;
create policy cs_team_invites_leader_read on public.cs_team_invites
  for select to authenticated
  using (public.cs_is_team_leader(team_id));

-- Members read their own team's roster.
drop policy if exists cs_team_members_team_read on public.cs_team_members;
create policy cs_team_members_team_read on public.cs_team_members
  for select to authenticated
  using (team_id = (select public.cs_my_team_id()));

-- Authors read their own submissions; leaders read their team's.
drop policy if exists cs_review_submissions_read on public.cs_review_submissions;
create policy cs_review_submissions_read on public.cs_review_submissions
  for select to authenticated
  using (author_id = (select auth.uid()) or public.cs_is_team_leader(team_id));

-- Only leaders read the audit trail.
drop policy if exists cs_review_events_leader_read on public.cs_review_events;
create policy cs_review_events_leader_read on public.cs_review_events
  for select to authenticated
  using (public.cs_is_team_leader(team_id));
