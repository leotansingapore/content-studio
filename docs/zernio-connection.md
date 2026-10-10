# Connected social accounts (Zernio)

Advisers connect their own Instagram, Facebook, TikTok, LinkedIn, YouTube and Threads accounts through Zernio (zernio.com). Leo picked it on 2026-10-10, and the builds after this one use the connection to answer a comment keyword with a DM, to post on schedule and to read real post numbers.

For advisers who connect an account, this reverses the recorded decision in `docs/social-api-app-review.md` that Content Studio never publishes, comments or messages. The Engage drafts stay copy and paste.

Zernio docs: https://docs.zernio.com/llms.txt. Read the page for an endpoint before calling it. Base URL `https://zernio.com/api/v1`, `Authorization: Bearer <key>`. No SDK: plain `fetch` from Deno.

## What is stored where

- One Zernio team, used only by Content Studio, with one API key that lives only in the edge secret `ZERNIO_API_KEY`.
- One Zernio profile per Content Studio brand profile (the `src/lib/profiles.ts` id, `me` or `p...`), named `cs_<owner uuid>_<profile id>` so the name is unique on the team.
- `cs_social_profiles` (`supabase/hub/018_social_profiles.sql`) maps (owner, brand profile) to the Zernio profile id. Only the `social` function writes it, with the service role. Owners may read their own rows. Nothing else is stored on our side: accounts, posts, automations, logs and numbers are read live from Zernio.
- Later builds keep the Zernio post id on the synced draft so My posts and Calendar can show its status. Synced keys are never security state; every server call checks ownership again.

## Scoping: one adviser never reaches another's accounts

Zernio accepts any account, post or automation id on the team, whichever profile it sits in. So the `social` function never passes an id from a request to Zernio before checking it belongs to the caller. The rules (from the independent review of 018 on 2026-10-11), each with a test in `supabase/functions/_shared/zernio.test.ts` or `supabase/functions/social/logic.test.ts`:

- H1, id format first. Every id from a request (accountId, postId, automationId, reconnectAccountId, an automation's postId) must match `^[a-f0-9]{24}$` before any other use, and reaches a URL path only through `encodeURIComponent`. Anything else is a 404. Without this, postId `../accounts/<victim>` would turn a cancel into `DELETE /v1/accounts/<victim>`.
- The caller is the JWT user. The brand profile id comes from the body, and the function looks up (owner_id = caller, profile_id) in `cs_social_profiles`; with no row the answer is a 404.
- M2, the caller's account set: `GET /v1/accounts?profileId=<mapped>&includeOverLimit=true`. Every `_id` must pass the id check and every account's own `profileId` (a string or an object's `_id`) must equal the mapped id, or the whole set fails closed. Requested accountIds must all be in it.
- H2, a post id: `GET /v1/posts/<id>`: `platforms` must be a non-empty array and every entry's accountId (a string or an object's `_id`) must be in the caller's set, else 404. `[].every()` is true, so an empty or missing list fails.
- M1, an automation id: `GET /v1/comment-automations/<id>`: its accountId must be in the caller's set. On create and update the body's accountId and postId get the account and post checks, and the profileId sent is always the mapped one.
- H3, one scoped helper for every list, health and analytics call. It always sets `profileId=<mapped>`, refuses to call those endpoints without it, and filters every returned item again by accountId in the caller's set. A request postId reaches `/v1/analytics` only after the post check.
- H4, idempotency. Zernio matches `Idempotency-Key` on the key alone, per Zernio user, and every adviser shares that user. Send `cs:<jwt uid>:<profile id>:<client uuid>`, check the client part is a UUID, and run the returned post through the post check.
- M4, the first connect: `POST /v1/profiles` with `Idempotency-Key: <profile name>`. On 409 `profile_name_conflict` use `details.existingProfileId`; on a 409 while the same key is in flight, read `GET /v1/profiles?name=<exact name>`. Insert with `on conflict (owner_id, profile_id) do nothing`, read the row back and use the stored id (a mismatch is logged; the other profile is never deleted).
- M3, no profile deletes. Never call `DELETE /v1/profiles`: Zernio moves a deleted profile's remaining accounts to another of the team's profiles, possibly another adviser's. Cleanup disconnects the accounts and leaves the empty profile.
- The OAuth `redirect_url` is built from a constant app origin, never from the request.

## Rollout and money

- Off by default. The function answers 404 `{enabled:false}`, with no Zernio call, unless `ZERNIO_API_KEY` is set and the caller is in `SOCIAL_CONNECT_USERS`. The app hides Social accounts until `status` says enabled (`src/lib/socialConnect.ts`).
- Zernio billing. Two connected accounts are free with no card. With no card, Zernio answers 402 `free_tier_exceeded` at the third. Once a card is added, our caps are the only guard (M5):
  - Before handing out a connect link the function counts the team's accounts (`includeOverLimit=true`) and refuses at `ZERNIO_MAX_ACCOUNTS` (default 2). One adviser may hold 6 across all their brand profiles.
  - A reconnect needs a checked `reconnectAccountId`; anything else is a new connect and is cap-checked.
  - Every `status` and `connect` call starts with a team-wide recount, because a cap checked only when a link is handed out can be beaten: several links collected while under it, a link reused, or a reconnect that Zernio turns into a new account. The recount lists every account on the team (`includeOverLimit=true`), holds each adviser to 6 across their brand profiles (owners mapped through `cs_social_profiles`), then the team to `ZERNIO_MAX_ACCOUNTS`, and disconnects the newest over either cap, whoever owns them. A Zernio id starts with its creation second, so a larger id is a newer account. The owner's Zernio profile gets a note in its description, and their own `status` then says which account went and why.
  - A daily team-wide recount cron is still required before `SOCIAL_CONNECT_USERS` opens beyond Leo: an account over the cap would otherwise keep billing until someone opens Social accounts or connects. The parent session has it queued.
  - Usage caps (`_shared/usageCaps.ts`): `social-connect` 3 a day, `social-read` 300 a day (status, disconnect, and later logs and numbers).
- M6, orphans keep billing. Removing a brand profile in the app disconnects its accounts through `social` first; if that fails, the brand stays. A weekly sweep (later build) disconnects the accounts of any `cs_<uuid>_<pid>` profile with no row (a deleted user).
- M7, the key. Mint it with `disabledResourceGroups` covering every group the function does not call (ads, phone numbers, WhatsApp, commerce, blogs and the rest), which also stops it managing keys. Server platform allowlist: instagram, facebook, tiktok, linkedin, youtube, threads. Never X, which bills per call. `SOCIAL_CONNECT_USERS='*'` only after the daily recount sweep ships.
- Automation DMs are free up to 10,000 sent a month, then metered.

## Secrets (edge, academy project)

| Name | What |
| --- | --- |
| `ZERNIO_API_KEY` | The Zernio team key. Set by Leo's session only. |
| `SOCIAL_CONNECT_USERS` | Comma list of user ids allowed to connect, or `*`. Entries are trimmed; empties ignored. |
| `ZERNIO_MAX_ACCOUNTS` | Team cap on connected accounts, 2 when unset. |

## The `social` edge function

JWT verification on. Deploy: `supabase functions deploy social --project-ref hgdbflprrficdoyxmdxe --use-api`. One function, `action` in the body. Pure logic in `supabase/functions/_shared/zernio.ts` and `supabase/functions/social/logic.ts` (tested); `index.ts` stays thin.

Built (C0):

- `status` with no `profileId`: `{enabled:true}` and nothing else, no Zernio call (the app uses it to show the page).
- `status` `{profileId}`: the recount above, then the brand's accounts with health, any over-cap removals noted on its profile, and the counts against the caps.
- `connect` `{profileId, platform, reconnectAccountId?}`: the recount, then the cap check (skipped for a checked reconnect), then creates or reuses the Zernio profile and returns `authUrl`. Redirect: `https://consultant-content-studio.vercel.app/accounts?connected=<platform>`.
- `disconnect` `{profileId, accountId}` after the account check, or `{profileId, all:true}` for every account in that brand (brand removal).

Later builds: `presign`, `schedule`, `post`, `cancel` (C1, posting); `automations` list, create, update, delete and logs (C2, Auto-DM); `metrics` (C3); the weekly orphan sweep and daily recount cron before the allowlist opens beyond Leo.

## Screens

- Playbook > Social accounts at `/accounts` (built) has a Connect button per platform, each account's health with Reconnect, Disconnect with a confirm, the cap line when full. The open brand profile decides which accounts show.
- Still to come: "Post it for me" on Write, My posts and Calendar, Auto-DM at `/auto-dm`, and "Use my real numbers" on Analytics. DM text and public replies will go through the `src/lib/compliance.ts` flags before they are saved.
