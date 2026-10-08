-- Compliance preview links (gap s24). An adviser shares a read-only snapshot of
-- a post with someone who has no account (a manager or compliance officer).
-- That person opens /review/<token>, reads the post and leaves comments under
-- a typed name; the adviser reads the comments in the app, replies, or shares
-- a new version (a new link). Used by the preview-link edge function and
-- src/lib/previewLinks.ts.
--
-- Depends on 011_team_review.sql (cs_clean_label, cs_review_normalize).
--
-- Security model
--   * The token is the only credential. 32 bytes from two gen_random_uuid()
--     calls (pg_strong_random, 244 random bits), base64url, 43 characters.
--     It is returned once by cs_create_preview_link and never stored: the
--     table holds sha256(token) only.
--   * A link is live while revoked_at is null and expires_at is in the future
--     (default 14 days, at most 30). Revoking is a server-side update, so it
--     never depends on a synced localStorage key.
--   * anon gets nothing: no table privilege, no function EXECUTE. The public
--     page reaches the data only through the preview-link edge function
--     (deployed --no-verify-jwt), which holds the service key and calls the
--     two service_role-only functions below with the raw token from the URL.
--   * authenticated users read their own links and the comments on them
--     through RLS (SELECT only) and write only through the SECURITY DEFINER
--     functions, which check auth.uid() themselves.
--   * Caps: 50 new links per adviser per rolling 24 hours; 50 comments per
--     link per rolling 24 hours and 300 per link in total (both sides count);
--     names 1-80 characters, comments 1-2,000, post text 1-20,000. The
--     comment cap is counted under a row lock on the link, so concurrent
--     posts cannot overshoot it. The honeypot and request-size limit live in
--     the edge function.
--
-- Grants, one by one
--   tables cs_preview_links, cs_preview_comments
--     revoke all from public, anon, authenticated: undoes Supabase's default
--       ALL grant on new tables (pg_default_acl), so no role can write.
--     grant select to authenticated: needed for RLS reads; the policies limit
--       rows to the caller's own links. service_role keeps its default grant
--       (it bypasses RLS anyway and is only used by the edge function).
--   sequence cs_preview_comments_id_seq
--     revoke all from public, anon, authenticated: inserts happen only inside
--       the definer functions.
--   functions
--     cs_preview_token_hash: revoked from public, anon, authenticated
--       (internal helper).
--     cs_create_preview_link, cs_revoke_preview_link, cs_reply_preview_link:
--       revoked from public and anon, granted to authenticated.
--     cs_preview_link_view, cs_preview_link_comment: revoked from public,
--       anon and authenticated, granted to service_role only.
--
-- Policies
--   cs_preview_links_owner_read: a user reads rows where owner_id = auth.uid().
--   cs_preview_comments_owner_read: a user reads comments whose link they own.
--   No INSERT/UPDATE/DELETE policies (and no privileges for them).
--
-- Idempotent: safe to run again.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.cs_preview_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  draft_id text not null check (char_length(draft_id) between 1 and 200),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Snapshot at share time: what the reviewer reads, whatever happens to the draft later.
  sender_name text not null check (char_length(sender_name) between 1 and 80),
  title text not null default '' check (char_length(title) <= 200),
  platform text not null check (platform ~ '^[a-z0-9-]{1,40}$'),
  format text not null check (format ~ '^[a-z0-9-]{1,40}$'),
  content text not null check (char_length(content) between 1 and 20000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint cs_preview_links_expiry_window
    check (expires_at > created_at and expires_at <= created_at + interval '30 days')
);

-- "My links" in the app, the daily create cap, and the superseded check.
create index if not exists cs_preview_links_owner_idx
  on public.cs_preview_links (owner_id, created_at desc);

create table if not exists public.cs_preview_comments (
  id bigint generated always as identity primary key,
  link_id uuid not null references public.cs_preview_links(id) on delete cascade,
  from_owner boolean not null default false,
  author_name text not null check (char_length(author_name) between 1 and 80),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists cs_preview_comments_link_idx
  on public.cs_preview_comments (link_id, created_at);

alter table public.cs_preview_links enable row level security;
alter table public.cs_preview_comments enable row level security;

revoke all on table public.cs_preview_links, public.cs_preview_comments
  from public, anon, authenticated;
grant select on table public.cs_preview_links, public.cs_preview_comments to authenticated;
revoke all on sequence public.cs_preview_comments_id_seq from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.cs_preview_token_hash(p_token text) returns text
language sql immutable parallel safe set search_path = public as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
$$;

-- ---------------------------------------------------------------------------
-- Adviser (authenticated) functions
-- ---------------------------------------------------------------------------

-- Returns {id, token, expires_at}. The token is shown once; only its hash is kept.
create or replace function public.cs_create_preview_link(
  p_draft_id text,
  p_title text,
  p_platform text,
  p_format text,
  p_content text,
  p_sender_name text default null,
  p_days integer default 14
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c_daily_limit constant int := 50;
  v_uid uuid := auth.uid();
  v_content text := public.cs_review_normalize(p_content);
  v_sender text;
  v_token text;
  v_row public.cs_preview_links%rowtype;
begin
  if v_uid is null then
    raise exception 'Sign in to share a preview link.' using errcode = '42501';
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
    raise exception 'There is no post text to share.' using errcode = '22023';
  end if;
  if char_length(v_content) > 20000 then
    raise exception 'This post is too long to share (20,000 characters at most).' using errcode = '22023';
  end if;
  if p_days is null or p_days not between 1 and 30 then
    raise exception 'A preview link can last 1 to 30 days.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cs_preview_create:' || v_uid::text, 0));
  if (select count(*) from public.cs_preview_links
      where owner_id = v_uid and created_at > now() - interval '1 day') >= c_daily_limit then
    raise exception 'You''ve shared 50 preview links in the last 24 hours. Try again tomorrow.'
      using errcode = '54000';
  end if;

  select left(coalesce(
    nullif(public.cs_clean_label(p_sender_name), ''),
    nullif(public.cs_clean_label(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(public.cs_clean_label(u.raw_user_meta_data ->> 'name'), ''),
    'Your adviser'
  ), 80) into v_sender
  from auth.users u where u.id = v_uid;
  v_sender := coalesce(v_sender, 'Your adviser');

  v_token := translate(
    rtrim(encode(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()), 'base64'), '='),
    '+/', '-_'
  );

  insert into public.cs_preview_links (
    owner_id, draft_id, token_hash, sender_name, title, platform, format, content, expires_at
  ) values (
    v_uid, p_draft_id, public.cs_preview_token_hash(v_token), v_sender,
    left(public.cs_clean_label(p_title), 200), p_platform, p_format, v_content,
    now() + make_interval(days => p_days)
  )
  returning * into v_row;

  return jsonb_build_object('id', v_row.id, 'token', v_token, 'expires_at', v_row.expires_at);
end $$;

-- Turns a link off for good. Idempotent for the owner.
create or replace function public.cs_revoke_preview_link(p_link_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  update public.cs_preview_links
  set revoked_at = coalesce(revoked_at, now())
  where id = p_link_id and owner_id = v_uid;
  if not found then
    raise exception 'That preview link wasn''t found.' using errcode = '42501';
  end if;
end $$;

-- The adviser answers on a live link; the reviewer sees it on the page.
create or replace function public.cs_reply_preview_link(p_link_id uuid, p_body text)
returns public.cs_preview_comments
language plpgsql security definer set search_path = public as $$
declare
  c_daily_limit constant int := 50;
  c_total_limit constant int := 300;
  v_uid uuid := auth.uid();
  v_body text := public.cs_review_normalize(p_body);
  v_link public.cs_preview_links%rowtype;
  v_recent int;
  v_total int;
  v_row public.cs_preview_comments%rowtype;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select * into v_link from public.cs_preview_links
  where id = p_link_id and owner_id = v_uid
  for update;
  if not found then
    raise exception 'That preview link wasn''t found.' using errcode = '42501';
  end if;
  if v_link.revoked_at is not null or v_link.expires_at <= now() then
    raise exception 'This link has expired or been turned off. Share a new version instead.';
  end if;
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'Write a reply of up to 2,000 characters.' using errcode = '22023';
  end if;

  select count(*) filter (where created_at > now() - interval '1 day'), count(*)
  into v_recent, v_total
  from public.cs_preview_comments where link_id = v_link.id;
  if v_recent >= c_daily_limit or v_total >= c_total_limit then
    raise exception 'This link has reached its comment limit. Share a new version to keep going.'
      using errcode = '54000';
  end if;

  insert into public.cs_preview_comments (link_id, from_owner, author_name, body)
  values (v_link.id, true, v_link.sender_name, v_body)
  returning * into v_row;
  return v_row;
end $$;

-- ---------------------------------------------------------------------------
-- Public page (service_role only, called by the preview-link edge function)
-- ---------------------------------------------------------------------------

-- The page for a live token, or null for an unknown, expired or revoked one
-- (the caller cannot tell which). No ids, owner or draft details leave here.
create or replace function public.cs_preview_link_view(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sender_name', l.sender_name,
    'title', l.title,
    'platform', l.platform,
    'format', l.format,
    'content', l.content,
    'shared_at', l.created_at,
    'expires_at', l.expires_at,
    'superseded', exists (
      select 1 from public.cs_preview_links n
      where n.owner_id = l.owner_id and n.draft_id = l.draft_id
        and n.created_at > l.created_at and n.revoked_at is null
    ),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'author_name', c.author_name,
        'from_owner', c.from_owner,
        'body', c.body,
        'created_at', c.created_at
      ) order by c.created_at, c.id)
      from public.cs_preview_comments c where c.link_id = l.id
    ), '[]'::jsonb)
  )
  from public.cs_preview_links l
  where p_token ~ '^[A-Za-z0-9_-]{43}$'
    and l.token_hash = public.cs_preview_token_hash(p_token)
    and l.revoked_at is null
    and l.expires_at > now()
$$;

-- Returns {ok:true, comment} or {ok:false, error, message}; error is
-- not_found, invalid or rate_limited. Never raises for bad input, so the
-- edge function can map each case to a status code.
create or replace function public.cs_preview_link_comment(p_token text, p_name text, p_body text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c_daily_limit constant int := 50;
  c_total_limit constant int := 300;
  v_name text := public.cs_clean_label(p_name);
  v_body text := public.cs_review_normalize(p_body);
  v_link public.cs_preview_links%rowtype;
  v_recent int;
  v_total int;
  v_row public.cs_preview_comments%rowtype;
begin
  if coalesce(p_token, '') ~ '^[A-Za-z0-9_-]{43}$' then
    select * into v_link from public.cs_preview_links
    where token_hash = public.cs_preview_token_hash(p_token)
      and revoked_at is null and expires_at > now()
    for update;
  end if;
  if v_link.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found',
      'message', 'This preview link has expired or been turned off.');
  end if;
  if char_length(v_name) not between 1 and 80 then
    return jsonb_build_object('ok', false, 'error', 'invalid',
      'message', 'Add your name (up to 80 characters).');
  end if;
  if char_length(v_body) not between 1 and 2000 then
    return jsonb_build_object('ok', false, 'error', 'invalid',
      'message', 'Write a comment of up to 2,000 characters.');
  end if;

  select count(*) filter (where created_at > now() - interval '1 day'), count(*)
  into v_recent, v_total
  from public.cs_preview_comments where link_id = v_link.id;
  if v_recent >= c_daily_limit or v_total >= c_total_limit then
    return jsonb_build_object('ok', false, 'error', 'rate_limited',
      'message', 'This link has had too many comments. Ask the adviser for a new link.');
  end if;

  insert into public.cs_preview_comments (link_id, from_owner, author_name, body)
  values (v_link.id, false, v_name, v_body)
  returning * into v_row;

  return jsonb_build_object('ok', true, 'comment', jsonb_build_object(
    'id', v_row.id,
    'author_name', v_row.author_name,
    'from_owner', v_row.from_owner,
    'body', v_row.body,
    'created_at', v_row.created_at
  ));
end $$;

-- ---------------------------------------------------------------------------
-- Function privileges (Supabase grants EXECUTE on new functions to anon and
-- authenticated by default, so revoke explicitly)
-- ---------------------------------------------------------------------------

revoke all on function public.cs_preview_token_hash(text) from public, anon, authenticated;

revoke all on function public.cs_create_preview_link(text, text, text, text, text, text, integer) from public, anon;
revoke all on function public.cs_revoke_preview_link(uuid) from public, anon;
revoke all on function public.cs_reply_preview_link(uuid, text) from public, anon;
grant execute on function public.cs_create_preview_link(text, text, text, text, text, text, integer) to authenticated;
grant execute on function public.cs_revoke_preview_link(uuid) to authenticated;
grant execute on function public.cs_reply_preview_link(uuid, text) to authenticated;

revoke all on function public.cs_preview_link_view(text) from public, anon, authenticated;
revoke all on function public.cs_preview_link_comment(text, text, text) from public, anon, authenticated;
grant execute on function public.cs_preview_link_view(text) to service_role;
grant execute on function public.cs_preview_link_comment(text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Policies (SELECT only)
-- ---------------------------------------------------------------------------

drop policy if exists cs_preview_links_owner_read on public.cs_preview_links;
create policy cs_preview_links_owner_read on public.cs_preview_links
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists cs_preview_comments_owner_read on public.cs_preview_comments;
create policy cs_preview_comments_owner_read on public.cs_preview_comments
  for select to authenticated
  using (exists (
    select 1 from public.cs_preview_links l
    where l.id = link_id and l.owner_id = (select auth.uid())
  ));
