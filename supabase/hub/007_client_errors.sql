-- Crash reports from the app (src/lib/clientErrors.ts). Signed-in users insert
-- rows tagged with their own id; nobody can read them through the API. Read
-- them with the service role or the SQL editor, e.g.
--   select created_at, release, path, message from cs_client_errors
--   order by created_at desc limit 50;
-- Idempotent.
create table if not exists public.cs_client_errors (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  message text not null check (char_length(message) <= 1000),
  stack text check (char_length(stack) <= 4000),
  context text check (char_length(context) <= 4000),
  path text check (char_length(path) <= 500),
  release text check (char_length(release) <= 100),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);

create index if not exists cs_client_errors_created_at
  on public.cs_client_errors (created_at desc);

alter table public.cs_client_errors enable row level security;

drop policy if exists cs_client_errors_insert_own on public.cs_client_errors;
create policy cs_client_errors_insert_own on public.cs_client_errors
  for insert to authenticated
  with check (user_id = auth.uid());
