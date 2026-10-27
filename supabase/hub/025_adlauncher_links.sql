-- AdLauncher connections (design: docs/adlauncher-ads.md). One row per Content Studio sign-in that has
-- connected AdLauncher (autoadslauncher.com) over its MCP's OAuth. The `adlauncher` edge function is the
-- only reader and writer: it keeps the tokens and the PKCE verifier here, encrypted, and calls AdLauncher's
-- MCP for the caller. Plus the private bucket the ad pictures go into before AdLauncher reads them.
--
-- Security model
--   * access_enc, refresh_enc and pending_verifier_enc hold AES-GCM ciphertext made with ADLAUNCHER_TOKEN_KEY
--     (an edge secret), bound to the row's user id and the column. They are never logged and never sent to
--     the browser; a database read alone can't use them.
--   * RLS on with no policies, and no grant to anon or authenticated: only the service role reads or
--     writes. The page learns "connected or not" from the function, never from this table.
--   * Deleting a user deletes their row (on delete cascade). Disconnect revokes the refresh token at
--     AdLauncher (best effort) and deletes the row.
--   * cs-ad-images is a private bucket with no storage.objects policy: nobody lists or reads it except
--     through a signed address the function makes (365 days, so Meta and AdLauncher's thumbnails can
--     fetch the picture). Files sit at <user id>/<random>.jpg or .png, 4 MB at most, JPEG or PNG.
--
-- Grants
--   table cs_adlauncher_links
--     revoke all from public, anon, authenticated: undoes Supabase's default ALL grant.
--     grant select, insert, update, delete to service_role.
--
-- Idempotent: safe to run again. One transaction. The foreign key to auth.users takes SHARE ROW EXCLUSIVE
-- on auth.users for this short transaction; lock_timeout gives up after 3 seconds; run it again later if
-- it times out.

begin;
set local lock_timeout = '3s';

create table if not exists public.cs_adlauncher_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- "v1.<iv>.<ciphertext>", base64url; null once disconnected (a failed refresh keeps the row and its account)
  access_enc text check (char_length(access_enc) <= 8192),
  refresh_enc text check (char_length(refresh_enc) <= 8192),
  expires_at timestamptz,
  refresh_expires_at timestamptz,
  scope text check (char_length(scope) <= 1000),
  -- the whoami summary: organisation, default Page and ad account, currency
  account jsonb check (pg_column_size(account) <= 16384),
  -- a connect in progress: the state sent to AdLauncher and the PKCE verifier, for 10 minutes
  pending_state text check (pending_state ~ '^[A-Za-z0-9_-]{32,128}$'),
  pending_verifier_enc text check (char_length(pending_verifier_enc) <= 1024),
  pending_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cs_adlauncher_links enable row level security;

revoke all on table public.cs_adlauncher_links from public, anon, authenticated;
grant select, insert, update, delete on table public.cs_adlauncher_links to service_role;

-- 4 MB is the function's own limit too; the bucket refuses anything bigger or of another type.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cs-ad-images', 'cs-ad-images', false, 4194304, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

commit;
