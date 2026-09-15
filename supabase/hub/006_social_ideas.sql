-- "Post ideas in your style" on the account audit. Every idea ever suggested is
-- kept, so new batches never repeat one. Written by the suggest-post-ideas edge
-- function (service role). The owner can read their ideas and change only the
-- status column (used / dismissed). Idempotent.

create table if not exists public.cs_social_ideas (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.cs_social_audits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  batch integer not null,
  position smallint not null,
  hook text not null,
  idea text not null,
  format text not null check (format in ('video', 'carousel', 'image')),
  based_on_post_id text,
  why text,
  formula text,
  status text not null default 'new' check (status in ('new', 'used', 'dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists cs_social_ideas_audit_idx
  on public.cs_social_ideas (audit_id, batch desc, position);

create index if not exists cs_social_ideas_user_idx
  on public.cs_social_ideas (user_id, created_at desc);

alter table public.cs_social_ideas enable row level security;

drop policy if exists cs_social_ideas_owner_read on public.cs_social_ideas;
create policy cs_social_ideas_owner_read on public.cs_social_ideas
  for select to authenticated using (user_id = auth.uid());

drop policy if exists cs_social_ideas_owner_status on public.cs_social_ideas;
create policy cs_social_ideas_owner_status on public.cs_social_ideas
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Owners may change the status column only; everything else is the function's.
revoke insert, update, delete on public.cs_social_ideas from anon, authenticated;
grant update (status) on public.cs_social_ideas to authenticated;
