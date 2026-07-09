-- Cross-device sync store for the app's per-user workspace data (drafts, plan,
-- coach, playbook, voice, academy progress). One row per localStorage key.
-- Written by src/lib/cloudSync.ts; last write wins. Idempotent.
create table if not exists public.cs_user_data (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  data text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.cs_user_data enable row level security;

drop policy if exists cs_user_data_owner on public.cs_user_data;
create policy cs_user_data_owner on public.cs_user_data
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
