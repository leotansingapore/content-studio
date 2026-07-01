# Analytics integration — real profile auto-sync (spec)

Status: **not built** (blocked on external approvals + credentials). The app
ships with **manual metrics entry** today (`/analytics` + metric fields on
posted posts in `/drafts`). This document is the plan for replacing the manual
step with live auto-sync.

## Why it isn't built yet

Reading a user's own post analytics needs all three of these, none of which the
frontend can provide on its own:

1. **Approved developer apps** (client id + secret) for each platform.
2. **Read scopes that are gated behind platform review** (weeks, and sometimes
   partnership tier).
3. **A backend** to hold the client secret and do the OAuth token exchange +
   scheduled metric pulls. This is a static SPA on Vercel; secrets cannot live
   in the browser.

## What each platform requires

### LinkedIn
- App in the LinkedIn Developer Portal, added to a Company Page.
- OAuth 2.0 (Authorization Code). Client secret stays server-side.
- Scopes: `openid profile` (identity) plus member post + analytics scopes
  (`r_member_social` / the Community Management or Marketing Developer Platform
  scopes). **These require LinkedIn review and, for full post analytics, partner
  approval** — the biggest gate. Personal-profile organic post analytics are
  the hardest to get.
- Endpoints: `/rest/posts` (or `ugcPosts`) for the user's posts,
  `socialActions` / analytics finders for reactions/comments/impressions.

### Instagram
- Requires an **Instagram Business or Creator account linked to a Facebook Page**.
- Meta app + Instagram Graph API, Facebook Login, App Review for
  `instagram_basic`, `instagram_manage_insights`, `pages_show_list`.
- Endpoints: `/{ig-user-id}/media` for posts, `/{media-id}/insights` for
  impressions/reach/engagement.

## Proposed architecture (when credentials exist)

1. **Backend**: Supabase Edge Functions (this project already uses the academy
   Supabase for `generate-social-content`). Add:
   - `oauth-start` → returns the platform authorize URL (state + PKCE).
   - `oauth-callback` → exchanges the code for tokens using the secret, stores
     encrypted tokens in a `social_connections` table keyed by user id.
   - `sync-metrics` (scheduled, e.g. daily) → for each connection, pulls recent
     posts + insights and upserts them.
2. **Secrets**: platform client ids/secrets as Supabase function secrets — never
   in the Vite bundle.
3. **Data model**: reuse `DraftEntry.metrics` (`impressions`/`reactions`/
   `comments`/`shares`) so the existing `/analytics` UI works unchanged; add an
   optional `externalId` + `source: "linkedin" | "instagram" | "manual"` to
   map a synced post back to a draft (fuzzy-match on text if not created here).
4. **Frontend**: swap the disabled "Connect" buttons on `/analytics` for links
   to `oauth-start`; show connection status; keep manual entry as a fallback.

## What we need from you to build it

- A LinkedIn developer app (client id + secret) with the required products
  requested/approved, and a Company Page to attach it to.
- A Meta app (client id + secret) with Instagram Graph API + the insight
  permissions submitted for App Review, and a test IG Business account.
- Confirmation to add Edge Functions + a `social_connections` table to the
  Supabase project (a schema + secrets change).

Until then, manual entry keeps `/analytics` fully functional.
