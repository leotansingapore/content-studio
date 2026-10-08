-- Team comments with @mentions (gap s25). Comment threads on a team review
-- submission, with @mentions of teammates and a "mentioned you" indicator on
-- the Team page. Used by src/lib/teamReview.ts and /team.
--
-- Depends on 011_team_review.sql (cs_review_submissions, cs_team_members,
-- cs_my_team_id, cs_is_team_leader, cs_review_normalize,
-- cs_review_events_guard).
--
-- Who reads a thread
--   * the submission's author (also after leaving the team, matching 011,
--     where authors keep reading their own submissions),
--   * current leaders of the submission's team,
--   * current members of that team who are mentioned in the thread; they
--     can also read that one submission (new policy on cs_review_submissions).
--   Other members never see the thread or the post. Only the author or a
--   leader can bring a new reader in: a mentioned member may mention only
--   people who can already read the thread (the author, a leader, or someone
--   already mentioned). So a teammate's draft never spreads further than
--   its author or a leader chose.
--
-- Security model
--   * RLS on both tables, SELECT only for clients; writes only through the
--     SECURITY DEFINER functions below, which check auth.uid() and current
--     team membership themselves.
--   * Comments are append-only (no update, delete or truncate for any role
--     subject to triggers), like the 011 audit trail: they are part of the
--     review record. Mentions change only through cs_mark_review_mentions_seen.
--   * Caps: comment 1-2,000 characters, up to 10 mentions per comment, 60
--     comments per person per rolling hour (counted under a per-user
--     advisory lock).
--   * anon gets nothing.
--
-- Grants, one by one
--   tables cs_review_comments, cs_review_mentions
--     revoke all from public, anon, authenticated: undoes Supabase's default
--       ALL grant; no client role can write.
--     grant select to authenticated: for RLS reads.
--   sequence cs_review_comments_id_seq: revoked from public, anon,
--     authenticated (inserts happen only inside the definer function).
--   functions
--     cs_review_mentioned, cs_can_read_review_thread: used inside RLS
--       policies, so revoked from public and anon and granted to
--       authenticated. Both only describe the caller's own access.
--     cs_add_review_comment, cs_mark_review_mentions_seen: revoked from
--       public and anon, granted to authenticated.
--
-- Policies
--   cs_review_comments_thread_read: rows of threads the caller can read.
--   cs_review_mentions_thread_read: mention rows of threads the caller can
--     read (the client renders who was mentioned and counts its own unseen).
--   cs_review_submissions_mentioned_read (on the 011 table, permissive, so it
--     ORs with the existing author/leader policy): a current team member reads
--     a submission they are mentioned on.
--
-- Idempotent: safe to run again.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.cs_review_comments (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.cs_review_submissions(id) on delete restrict,
  -- No FK to auth.users, as in 011: the record outlives a deleted account.
  author_id uuid not null,
  author_name text not null check (char_length(author_name) between 1 and 80),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists cs_review_comments_thread_idx
  on public.cs_review_comments (submission_id, created_at);
-- Hourly cap.
create index if not exists cs_review_comments_author_idx
  on public.cs_review_comments (author_id, created_at desc);

create table if not exists public.cs_review_mentions (
  comment_id bigint not null references public.cs_review_comments(id) on delete restrict,
  user_id uuid not null,
  submission_id uuid not null references public.cs_review_submissions(id) on delete restrict,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  primary key (comment_id, user_id)
);

-- Thread access checks.
create index if not exists cs_review_mentions_thread_idx
  on public.cs_review_mentions (submission_id, user_id);
-- "Mentioned you" on the Team page.
create index if not exists cs_review_mentions_unseen_idx
  on public.cs_review_mentions (user_id) where seen_at is null;

alter table public.cs_review_comments enable row level security;
alter table public.cs_review_mentions enable row level security;

revoke all on table public.cs_review_comments, public.cs_review_mentions
  from public, anon, authenticated;
grant select on table public.cs_review_comments, public.cs_review_mentions to authenticated;
revoke all on sequence public.cs_review_comments_id_seq from public, anon, authenticated;

drop trigger if exists cs_review_comments_append_only on public.cs_review_comments;
create trigger cs_review_comments_append_only
  before update or delete on public.cs_review_comments
  for each row execute function public.cs_review_events_guard();

drop trigger if exists cs_review_comments_no_truncate on public.cs_review_comments;
create trigger cs_review_comments_no_truncate
  before truncate on public.cs_review_comments
  for each statement execute function public.cs_review_events_guard();

-- ---------------------------------------------------------------------------
-- Access helpers (SECURITY DEFINER: they read across RLS, and only ever
-- answer for the caller)
-- ---------------------------------------------------------------------------

create or replace function public.cs_review_mentioned(p_submission_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cs_review_mentions
    where submission_id = p_submission_id and user_id = auth.uid()
  )
$$;

create or replace function public.cs_can_read_review_thread(p_submission_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cs_review_submissions s
    where s.id = p_submission_id
      and (
        s.author_id = auth.uid()
        or public.cs_is_team_leader(s.team_id)
        or (s.team_id = public.cs_my_team_id() and public.cs_review_mentioned(s.id))
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------

create or replace function public.cs_add_review_comment(
  p_submission_id uuid,
  p_body text,
  p_mentions uuid[] default '{}'
) returns public.cs_review_comments
language plpgsql security definer set search_path = public as $$
declare
  c_hourly_limit constant int := 60;
  v_uid uuid := auth.uid();
  v_body text := public.cs_review_normalize(p_body);
  v_sub public.cs_review_submissions%rowtype;
  v_me public.cs_team_members%rowtype;
  v_mentions uuid[];
  v_row public.cs_review_comments%rowtype;
begin
  if v_uid is null then
    raise exception 'Sign in to comment.' using errcode = '42501';
  end if;

  select * into v_sub from public.cs_review_submissions where id = p_submission_id;
  select * into v_me from public.cs_team_members where user_id = v_uid;
  -- Same message whether the post is missing, in another team or not shared with you.
  if v_sub.id is null
     or v_me.team_id is distinct from v_sub.team_id
     or not (v_sub.author_id = v_uid or v_me.role = 'leader' or public.cs_review_mentioned(v_sub.id)) then
    raise exception 'You can''t comment on this post.' using errcode = '42501';
  end if;

  if char_length(v_body) not between 1 and 2000 then
    raise exception 'Write a comment of up to 2,000 characters.' using errcode = '22023';
  end if;

  v_mentions := array(
    select distinct m from unnest(coalesce(p_mentions, '{}'::uuid[])) m
    where m is not null and m <> v_uid
  );
  if cardinality(v_mentions) > 10 then
    raise exception 'Mention up to 10 people in one comment.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_mentions) m
    where not exists (
      select 1 from public.cs_team_members t where t.team_id = v_sub.team_id and t.user_id = m
    )
  ) then
    raise exception 'You can only mention people in your team.' using errcode = '22023';
  end if;
  -- Only the author or a leader can bring someone new into the thread.
  if v_sub.author_id <> v_uid and v_me.role <> 'leader' and exists (
    select 1 from unnest(v_mentions) m
    where m <> v_sub.author_id
      and not exists (
        select 1 from public.cs_team_members t
        where t.team_id = v_sub.team_id and t.user_id = m and t.role = 'leader'
      )
      and not exists (
        select 1 from public.cs_review_mentions x
        where x.submission_id = v_sub.id and x.user_id = m
      )
  ) then
    raise exception 'Only the author or a team leader can bring someone new into this thread.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cs_review_comment:' || v_uid::text, 0));
  if (select count(*) from public.cs_review_comments
      where author_id = v_uid and created_at > now() - interval '1 hour') >= c_hourly_limit then
    raise exception 'You''ve posted 60 comments in the last hour. Try again a little later.'
      using errcode = '54000';
  end if;

  insert into public.cs_review_comments (submission_id, author_id, author_name, body)
  values (v_sub.id, v_uid, v_me.display_name, v_body)
  returning * into v_row;

  insert into public.cs_review_mentions (comment_id, user_id, submission_id)
  select v_row.id, m, v_sub.id from unnest(v_mentions) m;

  return v_row;
end $$;

-- Clears the caller's "mentioned you" for one thread. Returns how many it cleared.
create or replace function public.cs_mark_review_mentions_seen(p_submission_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  update public.cs_review_mentions
  set seen_at = now()
  where user_id = v_uid and submission_id = p_submission_id and seen_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

revoke all on function public.cs_review_mentioned(uuid) from public, anon;
revoke all on function public.cs_can_read_review_thread(uuid) from public, anon;
revoke all on function public.cs_add_review_comment(uuid, text, uuid[]) from public, anon;
revoke all on function public.cs_mark_review_mentions_seen(uuid) from public, anon;
grant execute on function public.cs_review_mentioned(uuid) to authenticated;
grant execute on function public.cs_can_read_review_thread(uuid) to authenticated;
grant execute on function public.cs_add_review_comment(uuid, text, uuid[]) to authenticated;
grant execute on function public.cs_mark_review_mentions_seen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Policies (SELECT only)
-- ---------------------------------------------------------------------------

drop policy if exists cs_review_comments_thread_read on public.cs_review_comments;
create policy cs_review_comments_thread_read on public.cs_review_comments
  for select to authenticated
  using (public.cs_can_read_review_thread(submission_id));

drop policy if exists cs_review_mentions_thread_read on public.cs_review_mentions;
create policy cs_review_mentions_thread_read on public.cs_review_mentions
  for select to authenticated
  using (public.cs_can_read_review_thread(submission_id));

drop policy if exists cs_review_submissions_mentioned_read on public.cs_review_submissions;
create policy cs_review_submissions_mentioned_read on public.cs_review_submissions
  for select to authenticated
  using (team_id = (select public.cs_my_team_id()) and public.cs_review_mentioned(id));
