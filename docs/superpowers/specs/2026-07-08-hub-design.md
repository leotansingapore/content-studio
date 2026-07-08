# Content Studio Hub — Design Spec (2026-07-08)

## Goal

A paid membership hub inside Content Studio. Leo's clients enter free (email
allowlist); everyone else pays SGD 49/month via Stripe subscription. The hub
serves evergreen guides (editing, videography, trends how-to) plus fresh trend
drops generated every 5 hours by a scheduled trend scout. Clients see tips
tailored specifically to them; paid non-clients see tips for their industry.

Approved decisions:
- Extend the existing Content Studio app (not a new repo).
- Only the new /hub section is gated; the rest of the app is untouched.
- Stripe monthly subscription, SGD 49/month, test mode first.
- Client access via admin-managed email allowlist.
- Evergreen content authored in an in-app admin editor (markdown, Supabase).
- Trend scout runs on Mac launchd every 5h using Claude CLI (Max plan, no API cost).

## Access model

Three roles, resolved at hub entry:

1. **Admin** (Leo): full hub access + /hub/admin pages. Identified by email
   match against an `is_admin` flag on `hub_memberships` (seeded manually).
2. **Client**: email exists in `hub_allowlist`. On first hub visit, a
   membership row with status `client` is created automatically (edge function
   or first-visit upsert), inheriting the allowlist niche.
3. **Subscriber**: active Stripe subscription -> membership status `active`.
   Picks an industry on first hub entry (stored on membership).

Everyone else: hub nav item routes to a paywall page with "Subscribe"
(Stripe Checkout) and "I'm a client" (re-checks their login email against the
allowlist and provisions client access if found).

Existing app pages (Generate, Profiles, Swipe, Coach, ...) are NOT gated.

## Data model (Supabase project hgdbflprrficdoyxmdxe)

All tables prefixed `hub_`, RLS enabled.

- `hub_allowlist`: id, email (unique, citext/lower), client_name, niche,
  brand_notes, created_at. Admin read/write only (service role + admin RLS).
- `hub_memberships`: id, user_id (unique, FK auth.users), status
  ('client' | 'active' | 'canceled' | 'none'), is_admin bool default false,
  industry text, stripe_customer_id, stripe_subscription_id,
  current_period_end, created_at, updated_at. User can read own row; writes
  via service role (webhook/provisioning) except industry which the owner may
  update once/na (owner UPDATE policy limited to industry column via trigger
  or a narrow policy).
- `hub_posts`: id, title, slug (unique), body_md, category
  ('editing' | 'videography' | 'trends' | 'tips'), audience_type
  ('all' | 'industry' | 'client'), audience_value (null | industry slug |
  allowlist email), published bool, created_at, updated_at. Admin write.
  Member read via RLS (see below).
- `hub_trends`: id, niche, title, summary_md, angles_md, source_urls text[],
  audience_type/audience_value (same convention), created_at. Insert via
  service role (scout). Member read via RLS.

**Read RLS for posts/trends** (applies to members with status in
('client','active') or is_admin):
- `audience_type = 'all'`, OR
- `audience_type = 'industry'` AND audience_value = member's industry/niche, OR
- `audience_type = 'client'` AND audience_value = member's email (clients only).
Admin sees everything. Unpublished posts: admin only.

## Stripe (test mode first)

- Edge function `hub-checkout`: authenticated; creates a subscription Checkout
  session for the SGD 49/month price (price id via env), success/cancel URLs
  back to /hub. Reuses stripe_customer_id if present.
- Edge function `hub-stripe-webhook`: verifies signature; on
  `checkout.session.completed` / `customer.subscription.updated` -> upsert
  membership status 'active' + period end; on `customer.subscription.deleted`
  or unpaid -> status 'canceled'.
- Env needed from Leo: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
  HUB_PRICE_ID (created in dashboard, SGD 49/month). Test keys first; going
  live is a key/price swap only.
- Until keys are provided, checkout button shows a "payments launching soon"
  state; allowlist/client flow works end to end without Stripe.

## Frontend (new routes inside existing ProtectedRoute/StudioLayout)

- `HubGate` component: loads membership, renders paywall or hub content.
  Caches membership in context to avoid refetch per page.
- `/hub` — dashboard: latest trend drops for the member's audience + featured
  guides; industry picker modal on first entry for subscribers without one.
- `/hub/trends` — trend feed, newest first (RLS pre-filters), niche filter chips.
- `/hub/guides`, `/hub/guides/:slug` — evergreen library, category filter,
  markdown rendered via `react-markdown` (new dependency, approved).
- `/hub/paywall` — pitch + Subscribe + "I'm a client" check.
- `/hub/admin` — admin only: allowlist CRUD (email/name/niche/brand notes),
  post editor (markdown textarea + live preview + category + audience tagging
  + publish toggle), member list (status, industry, period end).
- Nav: "Hub" item added to StudioLayout. Dark UI matching existing tokens.

## Trend scout (launchd + Claude CLI)

- `~/.local/bin/hub-trend-scout.sh` (+ helper .mjs if needed), state in
  `~/.local/state/hub-scout/` (launchd cannot read ~/Documents — TCC).
- launchd plist `com.leo.hub-trend-scout`, StartInterval 18000 (5h).
- Per run:
  1. Fetch distinct niches: allowlist niches + subscriber industries
     (Supabase REST, service key from `~/.local/state/hub-scout/.env`).
  2. Fetch last ~20 trend titles per niche for dedupe context.
  3. Per niche: `claude -p` (websearch enabled) researches what is trending
     NOW in that niche; returns strict JSON: title, summary_md, angles_md
     (fresh content angles adapted for creators in that niche), source_urls.
     Insert as audience_type 'industry'.
  4. Per allowlisted client: adapt the client's niche drops using their
     brand_notes into client-specific angles; insert as audience_type
     'client' with audience_value = client email.
  5. Cap: max 3 drops per niche per run; skip niche if claude output fails
     JSON parse twice. Log to state dir; ASCII-only output.
- Failure mode: script is idempotent per run; a missed run (Mac asleep) just
  means the next run catches up.

## Testing / verification

- Vite build + eslint clean; no JS console errors on hub pages.
- RLS verified with three test users (client / subscriber / neither) via
  supabase-js queries: each sees exactly their slice.
- Stripe flow in test mode with card 4242...: checkout -> webhook -> status
  'active'; cancel -> 'canceled' -> paywall reappears.
- Scout: one manual run against a seeded niche; verify rows appear and render
  in /hub/trends; then load launchd job and verify a scheduled fire.
- Mobile 390px pass on all hub pages.

## Risks / constraints

- Repo is concurrently edited by another Claude session: commit own files
  promptly, `git fetch` before push, re-verify integrations after.
- Supabase project is shared with Product Compass Hub (shared auth): all hub
  tables are prefixed and RLS-scoped; no changes to existing tables.
- Schema applied via Supabase Management API / SQL (repo has no migrations
  dir); SQL kept in repo under `supabase/hub/` for the record.
- Auto-deploys on push to main; never also run `vercel --prod`.
