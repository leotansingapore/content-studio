# Run as an ad: Content Studio makes it, AdLauncher launches it

Leo picked this on 27 Oct 2026, after the research in
`~/Documents/Content Studio/Competitive Research/_raw/ads-fold-in-research.md`: Content Studio makes and remixes the
ad, and AdLauncher (autoadslauncher.com, repo `~/agency-launchpad-90`) launches it, guards it and reports on it through
its MCP. Nothing of Meta's plumbing is copied here. Leo's sign-ins only (`leoOnly`, `LEO_EMAILS`) until he opens it.

It ships in three phases that each stand alone (connect AdLauncher, "Run as an ad" from /image, results back), with
ad batches in /image after them.

## What AdLauncher gives us (read in its code on 27 Oct)

- MCP at `https://autoadslauncher.com/mcp`. That address reaches v2 only: `supabase/functions/mcp-server` is a proxy to
  `mcp-server-v2` since 28 Aug (`docs/specs/2026-08-28-ai-copilot-agentic-rebuild.md`).
- Stateless calls (`mcp-server-v2/lib/protocol.ts`): one POST per call with `Authorization: Bearer <access token>`,
  `Content-Type: application/json`, `Accept: application/json, text/event-stream`, `MCP-Protocol-Version: 2026-07-28`,
  and, in that protocol era, `Mcp-Method: tools/call` and `Mcp-Name: <tool>` (`validateEraHeaders`: without them the
  call is a 400 HeaderMismatch), and the body
  `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"<tool>","arguments":{...}}}`. Read the answer as
  JSON or as server-sent events; a tool's own failure comes back with `result.isError` and
  `structuredContent: {error, hint, code}`.
- OAuth 2.1, metadata at `https://autoadslauncher.com/.well-known/oauth-authorization-server/mcp`:
  - register `https://autoadslauncher.com/mcp/register` (dynamic registration, public client, no secret, https
    redirect URIs only);
  - authorize `https://autoadslauncher.com/mcp/authorize` (`response_type=code`, PKCE `S256`, `state`,
    `resource=https://autoadslauncher.com/mcp`, `scope`);
  - token `https://autoadslauncher.com/mcp/token` (`authorization_code`, `refresh_token`), a form-encoded body;
    it answers `{access_token, token_type: "Bearer", expires_in: 3600, refresh_token, scope}`;
  - revoke `https://autoadslauncher.com/mcp/revoke` (`token=<refresh token>`; the access token on the same row dies
    with it).
  - Access tokens last 1 hour, refresh tokens 30 days and slide (`mcp-oauth/oauth.ts:35-36`). Every refresh rotates
    the refresh token, and an old one used again after a short grace revokes the whole grant, so the new pair is saved
    on every refresh.
  - AdLauncher sends the browser back with `?code=&state=&iss=`, or `?error=access_denied&error_description=&state=`
    when Leo says no. The scope granted is what Leo leaves ticked on AdLauncher's consent page (the token answer's
    `scope` is saved); `resource` is accepted and ignored (AdLauncher uses its own canonical address).
- Scope we ask for: `core:read core:write meta:launch`. Every tool we call is in the `core` toolset. We never ask for
  `meta:modify` or `creative:generate`.
- The tools we call, and only these: `whoami`, `list-pages`, `list-ad-accounts`, `preflight-launch`,
  `create-campaign`, `get-campaign-status`, `get-campaign-metrics`, `list-leads`.
- `create-campaign` (`mcp-server-v2/tools/launch.ts:754`): required `name`, `startDate` (ISO date-time), `locations`
  and `adCreative` (`headline` up to 200 characters, `primaryText` up to 2000, optional `description`). We also send
  `pageId`, `adAccountId`, `objective`, `destinationType` (`ON_AD`, `WEBSITE`, `PHONE_CALL` or `MESSENGER`),
  `destinationUrl`, `dailyBudget`, `endDate`, `cta` (Meta's enum, `LEARN_MORE` not "Learn More"), `mediaType: "image"`,
  `imageUrl` and `dryRun`. Locations are `[{ "key": "SG", "type": "country" }]`; AdLauncher never defaults them.
  Budgets are in the account's major units, with a floor of 1 for most currencies (`lib/budget.ts`).
- A lead ad (`ON_AD`) needs `privacyPolicyUrl` (http or https): without it `meta-create-campaign` refuses a new
  instant form with a 400 ("A valid privacy policy URL is required"), and a dry run never reaches that function, so
  Check can't catch a missing one. Sent with no `formQuestions`, the form asks full name, email and phone; we send
  `formQuestions: ["full_name", "email", "phone_number"]` so the check shows them (`formQuestions` requires
  `privacyPolicyUrl`). The thank-you page defaults to "Thank You!", "We will be in touch soon." and a View website
  button to the privacy address. The Page must have accepted Meta's lead ads terms (`preflight-launch` checks it).
- CTAs: a lead ad takes one of 15 (`_shared/cta.ts` `LEAD_FORM_CTA_TYPES`: SIGN_UP, SUBSCRIBE, APPLY_NOW, GET_QUOTE,
  GET_A_QUOTE, LEARN_MORE, GET_OFFER, DOWNLOAD, BOOK_NOW, CONTACT_US, GET_IN_TOUCH, REQUEST_TIME, REGISTER_NOW,
  GET_PROMOTIONS, INQUIRE_NOW); a website ad any of about 110 (`VALID_CTA_TYPES`). The sheet offers LEARN_MORE,
  SIGN_UP, GET_QUOTE, CONTACT_US, BOOK_NOW and APPLY_NOW, which are in both.
- `create-campaign` answers (all runs) `status: "PAUSED"`, `forcedPause`, `pageId`, `pageName`, `adAccountId`,
  `currency`, `budget {kind, amount, effectiveDaily, scheduleDays}`; a dry run adds `dryRun: true`, `campaignId: null`,
  `resolvedLocations`, `leadForm` (questions and privacy address as sent), `wouldCreate {campaign, adSet, creative, ad}`
  and `warnings`; a live one adds `campaignId` (AdLauncher's own `user_campaigns` id), `externalCampaignId` (Meta's),
  `externalAdSetId`, `externalCreativeId`, `externalAdId`, `leadFormId` and `warnings`. The same name again within 10
  minutes, once it has a Meta id, answers `duplicateOf` and makes nothing, so a second press of Create is safe.
  Refusals carry codes such as `below_budget_floor`, `placeholder_copy`, `meta_blocked` and `meta_error`.
- The campaign in AdLauncher's web app is `https://autoadslauncher.com/campaigns/<campaignId>` (the client route); an
  agency sign-in is sent on to `/agency/campaigns/<campaignId>` (`src/components/AuthenticatedApp.tsx:204`), and both
  render `CampaignDetail`, which reads `user_campaigns` by that id.
- `whoami` (frozen outputSchema, `tools/discovery.ts`): `organizationId`, `organizationName`, `role`,
  `credentialScope`, `clientId`, `clientName`, `toolsets`, `grants`, `activeAdAccountId` (no `act_`),
  `activeAdAccountName`, `accountCurrency`, `activePageId`, `activePageName`, `metaTokenExpiresAt`,
  `credentialExpiresAt`. It has no person's name, so the summary is the organisation (and client), the default Page and
  ad account, and the currency.
- `list-pages` answers `{pages: [{pageId, name, isDefault?}]}`; `list-ad-accounts`
  `{adAccounts: [{adAccountId, name, currency, status, source}], warnings?}`.
- `preflight-launch` takes `{pageId, adAccountId, dailyBudget, locations}` (and `templateId` or `blueprintId`, which the
  guard refuses on every tool) and answers `{passed, adAccountId, pageId, pageName, currency, minDailyBudget,
  checks: [{id, name, outcome: "pass" | "fail" | "unknown", detail, fix}]}`.
- `get-campaign-status {campaignId}` (AdLauncher's id or Meta's) answers `{campaignId, externalCampaignId, recordStatus,
  effectiveStatus, configuredStatus, reviewFeedback, ads}`. `get-campaign-metrics` takes AdLauncher's id only, and
  `datePreset` or `startDate` with `endDate` (YYYY-MM-DD; the default `last_7d` ends yesterday); it answers
  `{campaignId, window, rows, totals {spend, leads, impressions, clicks, cpl, ctr}, hasMore}`, and `totals` cover the
  whole window whatever the page size, so we ask for `limit: 1` from the launch day to today.
- Every campaign it creates is PAUSED. `dryRun: true` previews and creates nothing. Budget floors and ceilings are
  AdLauncher's own.
- `imageUrl` must be an https address: the v2 check needs `scheme://` (`lib/validate.ts:116`), so a `data:` URL fails.
  Meta copies the image when the campaign is created; AdLauncher keeps the address for its thumbnails.
- Never call `launch-from-template` or `launch-from-blueprint`: on the older servers a `dryRun` there created a real,
  billed campaign (`tools/launch.ts:5`). The edge function's allowlist keeps them out, and its guard refuses
  `templateId` and `blueprintId` on any tool, and `appendToCampaignId` or `confirm` on `create-campaign` (adding an ad
  set to a campaign that may be running raises what it spends).

## Content Studio pieces

### 1. Table and bucket (`supabase/hub/025_adlauncher_links.sql`)

- `cs_adlauncher_links`, one row per sign-in: `user_id` (primary key, references `auth.users`, cascade delete),
  `access_enc`, `refresh_enc`, `expires_at`, `refresh_expires_at`, `scope`, `account` (jsonb, the whoami summary),
  `pending_state`, `pending_verifier_enc`, `pending_at`, `created_at`, `updated_at`.
- RLS on with no policies, and `revoke all` from `anon` and `authenticated`: only the edge function's service role
  reads it.
- A private storage bucket `cs-ad-images` (`public = false`) with no `storage.objects` policies, so nobody can list or
  read it except through a signed address the function makes.
- `025_adlauncher_links.test.sql` in the shape of `024_tracked_links_brand.test.sql`.
- Tokens and the PKCE verifier are encrypted (AES-GCM) with `ADLAUNCHER_TOKEN_KEY` (32 random bytes, base64, an edge
  secret). They are never logged and never sent to the browser.

### 2. Edge function `supabase/functions/adlauncher` (JWT on)

POST `{ action, ... }`, the caller from their own session as in `social`:

- `status`: connected or not, and the account summary (name, organisation, default Page and ad account, currency).
- `start`: a new `state` and PKCE verifier saved on the caller's row; returns the authorize address built from
  `ADLAUNCHER_CLIENT_ID` and `ADLAUNCHER_REDIRECT_URI` (`https://consultant-content-studio.vercel.app/adlauncher`).
- `finish { code, state }`: the state must match the caller's row and be under 10 minutes old; exchanges the code,
  saves the tokens, calls `whoami` and keeps its summary, clears the pending fields.
- `call { tool, args }`: the tool must be on the allowlist. Refreshes once when under 2 minutes are left and saves the
  new pair. For `create-campaign` it forces `mediaType: "image"`, needs an https `imageUrl`, and refuses any
  `templateId` or `blueprintId`. A tool's answer comes back as `{ok: true, data}` or `{ok: false, error, hint, code}`.
- `image { dataUrl }`: a PNG or JPEG under 4 MB (its first bytes checked), saved at
  `cs-ad-images/<user id>/<random>.jpg` (`.png` for a PNG; the sheet sends JPEG) by the service role; returns a signed
  address valid for 365 days.
- `disconnect`: revokes the refresh token (best effort) and deletes the row.
- When a refresh fails or AdLauncher answers 401 after one, the tokens are cleared (the account summary stays, so the
  page can name it) and the answer is 409 `{code: "reconnect", error: "Reconnect AdLauncher."}`.
- Leo's sign-ins only on the server too: `NORTH_STAR_USERS` (as `remix-link`), so everyone else gets 403 before any
  read. Off (503) until the three AdLauncher secrets are set.

### 3. Page `/adlauncher`

A tile under Settings, Connections: "AdLauncher", hint "Launch ads you make here, paused, in AdLauncher". Owners
`LEO_EMAILS`. It shows one of: not connected (Connect, and one line on what connecting does), coming back from
AdLauncher (`?code=&state=`: finish, then clean the address), connected (account, default Page and ad account,
Disconnect after asking), or an error with Try again.

### 4. "Run as an ad" on /image results

Leo's sign-ins only. A button beside the made picture's download opens a sheet:

- Page and ad account (from `list-pages` and `list-ad-accounts`, defaults from `whoami`);
- goal: Leads (an instant form, `ON_AD`, `OUTCOME_LEADS`) or Website (`WEBSITE` with its address, `OUTCOME_TRAFFIC`);
- headline and primary text filled from the ad's own words, with the 200 and 2000 character limits, and the button
  (one of the six CTAs above);
- for Leads, the privacy policy address (filled from this brand's last lead ad);
- daily budget in the account's currency, and how many days (1 to 90): it starts at midnight tomorrow, Singapore
  time, and ends that many days later;
- location Singapore;
- firm approval code, required when `speakerFor(userId)` is "person" (an adviser's brand) and kept in the campaign
  name and the saved record, while a business brand has no such field.

Check uploads the picture (`image`), runs `preflight-launch`, then `create-campaign` with `dryRun: true`, and shows
what would be created and any problem in AdLauncher's own words; pressing Create paused sends the same call without
the dry run. The done state reads "Created, paused in AdLauncher", links to the campaign there, and says to switch it on in AdLauncher
once the firm has approved it. The copy goes through the same MAS flags Write uses before Check.

Each launch is saved in `content-studio-ad-launches-<scoped user id>` (synced): id, time, AdLauncher campaign id,
Meta campaign id, name, approval code, the /image design and its post (draft) it came from, goal, budget, days,
currency, and the website or privacy address.

### 5. Results (phase 3)

An "Ads" block on /image, under Your images, lists the brand's saved launches with `get-campaign-status` and
`get-campaign-metrics` (spend, leads, cost per lead since the launch day), read when the block opens and at most every
30 minutes per campaign (cached on the device in `cs-ad-results`), one campaign after another so two refreshes never
race.

## Rules

- Nothing here can switch a campaign on, pause it or change its budget: those stay in AdLauncher.
- Leo's sign-ins only. Everyone else sees no button and gets the usual page for /adlauncher.
- Words on screen are plain and score under 15 on `aicheck`.
- Deep links: `/adlauncher`, and the sheet open on /image (listed in `docs/deep-links.md`).

## Tests

- The function's pure parts, all without calling AdLauncher: PKCE (`S256` of the verifier), state expiry, the
  allowlist, the argument guard, the token encryption round trip, refresh timing, and reading JSON and server-sent-event
  answers.
- The sheet: the approval code required for a person's brand, budget above 0, the copy limits, and the launches store.

## Rollout (done by the integrating session)

1. Read the SQL, apply `025` to the hub project, and run its test SQL.
2. Register the client once at `/mcp/register` with `redirect_uris: ["https://consultant-content-studio.vercel.app/adlauncher"]`
   and set `ADLAUNCHER_CLIENT_ID`, `ADLAUNCHER_REDIRECT_URI` and `ADLAUNCHER_TOKEN_KEY` as secrets.
3. Deploy `adlauncher` with JWT on, then push the front end.
4. Leo connects. Test with Check (the dry run) only; Create paused waits for Leo.
