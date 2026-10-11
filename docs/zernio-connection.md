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
- H3, one scoped helper for every list, health and analytics call. It always sets `profileId=<mapped>`, refuses to call those endpoints without it, and filters every returned item again by accountId in the caller's set. A request postId reaches `/v1/analytics` only after the post check. Best-time slots carry no account, so that endpoint is read one checked `accountId` at a time and a slot counts as that account's.
- H4, idempotency. Zernio matches `Idempotency-Key` on the key alone, per Zernio user, and every adviser shares that user. Send `cs:<jwt uid>:<profile id>:<client uuid>`, check the client part is a UUID, and run the returned post through the post check.
- M4, the first connect: `POST /v1/profiles` with `Idempotency-Key: <profile name>`. On 409 `profile_name_conflict` use `details.existingProfileId`; on a 409 while the same key is in flight, read `GET /v1/profiles?name=<exact name>`. Insert with `on conflict (owner_id, profile_id) do nothing`, read the row back and use the stored id (a mismatch is logged; the other profile is never deleted).
- M3, no profile deletes. Never call `DELETE /v1/profiles`: Zernio moves a deleted profile's remaining accounts to another of the team's profiles, possibly another adviser's. Cleanup disconnects the accounts and leaves the empty profile.
- The OAuth `redirect_url` is built from a constant app origin, never from the request.

## Rollout and money

- Off by default. Unless `ZERNIO_API_KEY` is set and the caller is in `SOCIAL_CONNECT_USERS`, the function makes no Zernio call: the bare `status` probe answers 200 `{enabled:false}` (so no browser logs a failed request for it) and every other action answers 404 `{enabled:false}`. The app hides Social accounts until `status` says enabled (`src/lib/socialConnect.ts`).
- Zernio billing. Two connected accounts are free with no card. With no card, Zernio answers 402 `free_tier_exceeded` at the third. Once a card is added, our caps are the only guard (M5):
  - Before handing out a connect link the function counts the team's accounts (`includeOverLimit=true`) and refuses at `ZERNIO_MAX_ACCOUNTS` (default 2). One adviser may hold 6 across all their brand profiles.
  - A reconnect needs a checked `reconnectAccountId`; anything else is a new connect and is cap-checked.
  - Every `status` and `connect` call starts with a team-wide recount, because a cap checked only when a link is handed out can be beaten: several links collected while under it, a link reused, or a reconnect that Zernio turns into a new account. The recount lists every account on the team (`includeOverLimit=true`), holds each adviser to 6 across their brand profiles (owners mapped through `cs_social_profiles`), then the team to `ZERNIO_MAX_ACCOUNTS`, and disconnects the newest over either cap, whoever owns them. A Zernio id starts with its creation second, so a larger id is a newer account. The owner's Zernio profile gets a note in its description, and their own `status` then says which account went and why.
  - The same recount runs daily from the `social-sweep` function (below), so an account over a cap stops billing within a day even when nobody opens Social accounts or connects. It must be scheduled (021) before `SOCIAL_CONNECT_USERS` opens beyond Leo.
  - Usage caps (`_shared/usageCaps.ts`): `social-connect` 3 a day, `social-read` 300 a day (status, disconnect, the Auto-DM list, posts and logs, a post's status, cancel, TikTok creator info, and each page of numbers, follower counts and best times), `social-automation-write` 30 a day (creating, editing, pausing and deleting an auto-DM), `social-schedule` 30 a day (scheduling a post, trying a failed one again), `social-presign` 30 a day (one per file uploaded).
- M6, orphans keep billing. Removing a brand profile in the app disconnects its accounts through `social` first; if that fails (any error, "Not enabled." too), the brand stays. The removal goes through for an adviser taken off `SOCIAL_CONNECT_USERS`; with `ZERNIO_API_KEY` unset it is refused (503) while the brand has a row, and a brand with no row is let go. A weekly sweep (`social-sweep`, below) clears any `cs_<uuid>_<pid>` profile with no row (a deleted user).
- M7, the key. Mint it with `disabledResourceGroups` covering every group the function does not call (ads, phone numbers, WhatsApp, commerce, blogs and the rest), which also stops it managing keys. Server platform allowlist: instagram, facebook, tiktok, linkedin, youtube, threads. Never X, which bills per call. `SOCIAL_CONNECT_USERS='*'` only after the daily recount sweep ships.
- Automation DMs are free up to 10,000 sent a month, then metered.

## Secrets (edge, academy project)

| Name | What |
| --- | --- |
| `ZERNIO_API_KEY` | The Zernio team key. Set by Leo's session only. |
| `SOCIAL_CONNECT_USERS` | Comma list of user ids allowed to connect, or `*`. Entries are trimmed; empties ignored. |
| `ZERNIO_MAX_ACCOUNTS` | Team cap on connected accounts, 2 when unset. |
| `SOCIAL_SWEEP_SECRET` | The `x-social-sweep-secret` header pg_cron sends to `social-sweep`; the same value is in Vault as `cs_social_sweep_secret`. |

## The `social` edge function

JWT verification on. Deploy: `supabase functions deploy social --project-ref hgdbflprrficdoyxmdxe --use-api`. One function, `action` in the body. Pure logic in `supabase/functions/_shared/zernio.ts` and `supabase/functions/social/logic.ts` (tested); `index.ts` stays thin.

Built (C0):

- `status` with no `profileId`: `{enabled:true}` or `{enabled:false}` and nothing else, always 200, no Zernio call (the app uses it to show the page).
- `status` `{profileId}`: the recount above, then the brand's accounts with health, any over-cap removals noted on its profile, and the counts against the caps.
- `connect` `{profileId, platform, reconnectAccountId?}`: the recount, then the cap check (skipped for a checked reconnect), then creates or reuses the Zernio profile and returns `authUrl`. Redirect: `https://consultant-content-studio.vercel.app/accounts?connected=<platform>`.
- `disconnect` `{profileId, accountId}` after the account check, or `{profileId, all:true}` for every account in that brand (brand removal).

Built (C2, Auto-DM), in `supabase/functions/social/automations.ts` (Zernio's comment-automations; Zernio runs them):

- `automations` `{profileId}`: the brand's accounts and its automations, listed with `profileId=<mapped>` and each kept only when its accountId is the caller's (H3), with stats.
- `account-posts` `{profileId, accountId}`: the account's 25 latest platform posts (`GET /v1/accounts/{id}/posts`), for the post picker. Account checked first.
- `automation-create` `{profileId, accountId, automation}`: account checked, then the fields (below); the body's `profileId` is always the mapped one; a chosen post must be among the account's 25 latest; keywords match as whole words (`matchMode: word`).
- `automation-update` `{profileId, automationId, automation}` or `{..., active}` (pause): the automation check (M1) first, then the same field checks; the post binding is sent only when it changed.
- `automation-delete`, `automation-logs` `{profileId, automationId, skip?}` (50 a page): the automation check first.
- Fields: trigger comment, story_reply or story_mention; 0 to 10 keywords of up to 50 characters, empty only for a story mention or with Every comment; the DM with up to 3 other wordings (640 characters with link buttons, else 1000); up to 3 link buttons with your own http(s) link and a 20-character title; the public reply with up to 5 other wordings (Zernio's limit); also answer a DM of the keyword; the Instagram follower check (`audience` follower + verify). TikTok, Threads, LinkedIn and YouTube take the public reply only: a DM there is refused by us in plain words before Zernio's 400.

Built (C1, Post it for me), in `supabase/functions/social/posts.ts` (shapes from Zernio's openapi.json and platform pages, 2026-10-11; not yet seen against a live key):

- `presign` `{profileId, filename, contentType, size}`: JPG, PNG or WebP up to 8 MB, MP4 or MOV up to 300 MB (Instagram's Reel cap; the app's 8 Mbps exports reach it at about 5 minutes); a plain file name with its own ending. `POST /v1/media/presign`; returns `uploadUrl` (PUT, 1 hour) and `publicUrl`, both https. Needs the brand's Zernio profile (a first connect).
- `schedule` `{profileId, accountIds, clientKey, content, captions?, mediaUrls, scheduledFor | now:true, firstComment?, tiktok?, youtube?}`: every account checked (M2); one video or up to 10 pictures, https links ending in jpg, jpeg, png, webp, mp4 or mov; `scheduledFor` an ISO time with an offset at least a minute ahead (Zernio publishes a past time inside the call). `now` is sent as a minute ahead, so Zernio publishes in the background and a slow video never times out the call. Per platform: the caption limit (Threads 500, Instagram and TikTok 2,200, LinkedIn 3,000, YouTube 5,000), media required on Instagram, TikTok and YouTube, one video on YouTube (title up to 100 characters, visibility, `madeForKids: false`), TikTok's privacy level and comment, duet and stitch switches with `contentPreviewConfirmed` and `expressConsentGiven` (TikTok's legal requirement), a photo post's caption in `description`; no WebP on Instagram, Threads or LinkedIn, no MOV on Threads; `firstComment` everywhere but TikTok. `timezone: Asia/Singapore`. H4 key `cs:<uid>:<profile id>:<client uuid>`; the post Zernio hands back (new or replayed) passes the post check before it is returned.
- `post` `{profileId, postId}`: the post check (H2), then its status and each platform's status, link and reason.
- `cancel` `{profileId, postId}`: the post check; a post live on any platform is refused in plain words, otherwise `DELETE /v1/posts/{id}`.
- `retry` `{profileId, postId}`: the post check; only a failed or partly failed post; `POST /v1/posts/{id}/retry`, and the post it returns is checked again.
- `tiktok-creator-info` `{profileId, accountId, mediaType}`: the account check, TikTok only; the privacy levels the creator allows and which switches they turned off, so the screen offers only those.

Media upload (`src/lib/autoPost.ts`): the browser asks `presign` for each file, PUTs the file straight to the `uploadUrl` with its `Content-Type` and shows the bytes sent, then sends the `publicUrl`s with the post. A file that went up stays up for the rest of that send, so a failed upload retries only what is left.

Not yet checked: whether Zernio's storage answers a browser PUT from `https://consultant-content-studio.vercel.app` (CORS). It can't be tried without the key. With the key set, the first real upload answers it: a blocked PUT shows "The upload didn't go through" and the browser console names CORS. If it is blocked:

1. First ask Zernio support to allow our origin for PUT with `Content-Type` on their upload bucket. Nothing changes in the app.
2. Pictures (8 MB or less, which covers every carousel slide): relay them through `social` to `POST /v1/media/upload-direct` (25 MB, key auth, kept 7 days). Supabase caps an edge function's request body, so this route is for pictures only.
3. Videos: upload to a Supabase Storage bucket on the academy project with a signed upload URL (our storage already answers our origin), and send that object's public https link in `mediaUrls` (Zernio downloads any public https link). That needs a new bucket and a cleanup after the post goes out, so Leo approves it first.

Also unverified against live Zernio: every response shape above (from openapi.json), that `publicUrl` ends with the file's own ending (the schedule check reads the media type from it), and how long Zernio keeps an uploaded file for a post scheduled weeks ahead.

Built (C3, real numbers), in `supabase/functions/social/metrics.ts` (shapes from Zernio's openapi.json, 2026-10-11; not yet seen against a live key). Analytics is included on Zernio's usage-based plans; a legacy plan answers 402 (posts) or 403 (followers), shown as "Analytics isn't on this Zernio plan."

- `metrics` `{profileId, from?, to?, accountIds?, page?}`: a page of 100 posts published from `from` to `to` (YYYY-MM-DD, up to 366 days; Zernio's default 90 days to today), newest first, from `GET /v1/analytics` with `profileId=<mapped>` and, when exactly one account is asked for, its checked `accountId`. Each post is kept only when every account in its `platforms` is the caller's (or in `accountIds`, each checked first); a post with paid delivery (`isAd`) is left out. Each carries its own id, the Zernio post it came from (`latePostId`) when it went out through Zernio, the platform, account, published time, text, link and views, reach, impressions, likes, comments, shares and saves. Returns the brand's accounts, `page` and `pages`.
- `metrics` `{profileId, postId}`: one post's numbers. The post check (H2) first, because `/v1/analytics` also takes other ids; then the same scoped read with `postId`.
- `followers` `{profileId, from?, to?, accountIds?}`: daily follower counts per account from `GET /v1/accounts/follower-stats` (a year back by default), with `accountIds` from the caller's set. Zernio sends the counts keyed by account id beside the account list; each list is attached to its own account before the filter, so a count for anyone else's account is never read.
- `best-time` `{profileId, accountIds?}`: Zernio's best day and UTC hour per account from `GET /v1/analytics/best-time`, one call per checked account, because a slot names no account. Not shown in the app: it reads the same published posts the pulled numbers bring in, in UTC and by raw engagement rather than rate, so a second best time beside ours would disagree without adding anything.

## The `social-sweep` edge function (safety jobs)

Deployed `--no-verify-jwt`, like `notify`: it refuses anything without the `x-social-sweep-secret` header matching `SOCIAL_SWEEP_SECRET`, and with no `ZERNIO_API_KEY` it answers `{enabled:false}` and does nothing. Body `{job: "recount" | "orphans", dryRun?: boolean}`; `dryRun: true` only reads and answers what it would do (its Zernio client refuses every write). Every run answers its counts and each write that went through (`done`); logs carry counts only. Pure logic in `supabase/functions/social-sweep/logic.ts` (tested), reusing `_shared/zernio.ts` and the `social` recount.

- `recount` (daily, 03:15 Singapore time): the team-wide recount above, with every mapping row read in pages until one comes back empty.
- `orphans` (weekly, Sunday 03:45): reads Zernio's profiles (`GET /v1/profiles?includeOverLimit=true`), then the mapping rows. A profile named `cs_<uuid>_<brand>` that no row names, neither by its Zernio id nor by its owner and brand, belonged to a deleted user: its pending posts (draft, scheduled, failed, partial, cancelled; never published or publishing) and its auto-DMs are deleted, then its accounts disconnected. A post or auto-DM counts as the profile's only when every account it names is in that profile's checked account set (M2, H3). The empty profile stays (M3: the sweep's client refuses `DELETE /v1/profiles`). A profile it can't read is left alone that week. It also lists, and never changes, mapped advisers taken off `SOCIAL_CONNECT_USERS` (while that is not `*`) who still have accounts (`offList`), for Leo to decide.

The two cron jobs are in `supabase/hub/021_social_sweep.sql`, applied by hand after an independent review. Test with `{"job": "orphans", "dryRun": true}`.

## Screens

- Playbook > Social accounts at `/accounts` (built) has a Connect button per platform, each account's health with Reconnect, Disconnect with a confirm, the cap line when full. The open brand profile decides which accounts show.
- Recruit > Auto-DM at `/recruit/auto-dm` (built, `src/pages/AutoDmPage.tsx`, listed only while social is on) lists the open brand's auto-DMs with their post, keywords, an On/Paused switch, Sent / Read / Clicked (Delivered on Facebook only: Instagram sends no receipt) and "Who got it". The form: account, Any post or one of its 25 latest, keywords or Every comment, the DM with "Insert first name", other wordings, link buttons, the public reply, "Also answer when they DM the word", the Instagram follower check, three starting points (a free guide, a webinar seat, a 15-minute chat) and a phone-style preview. The DM, its buttons and the public replies run through the `src/lib/compliance.ts` flags; a red flag blocks the save. The starting points carry no figures and no link: the adviser types their own.
- Post it for me (built, `src/components/PostItForMe.tsx`, shown only while social is on) on a dated post in My posts, on the Calendar post editor and on Write's saved result: the brand's connected accounts on the post's platform, its carousel slides (drawn as PNGs), its imported media link or a picked file, its day and time (09:00 when it has no time; Now when the time has passed), the caption as Copy would paste it with the platform's counter and the compliance flags (a red flag blocks it, as on Auto-DM), TikTok's privacy levels and switches from the creator's own settings, a YouTube title. A team member whose leader must approve their posts sees the button disabled with the team rule's reason beside it. Uploads show their progress; a failed upload keeps what was picked and already sent. The draft then carries a chip: Scheduled (Singapore time), Posting, Posted (a link per platform; the post is marked posted), Partly posted, Failed (Zernio's reason, Retry), Cancel post while nothing is live. My posts and Calendar ask Zernio about up to 10 posts whose time has passed when they open. On the calendar, a post going out through Zernio carries its chip on the week card and the Upcoming row (Auto-post, Posted, Failed...), and a coloured dot on the month grid's one-line card.
- Analytics > Your real numbers (built, `src/components/RealNumbers.tsx`, `src/lib/realNumbers.ts`, shown only while social is on). "Use my real numbers" reads the last 12 months of the open brand's posts (up to 5 pages of 100) and each account's daily follower counts. A post whose Zernio post id is a draft's (Post it for me) puts its numbers on that draft's Zernio link (`zernio.numbers`); typed metrics are never changed. `withReal` in `src/lib/analytics.ts` and notify's `postsFrom` read the real numbers first, so the stat cards, insights, best time per platform, the This week card and the Monday email use them. Add your numbers shows them read-only with views, reach and saves. Every other post Zernio returns is listed as posted outside the app and kept out of the cards, since it can't be told apart from a hand-posted draft that already has typed numbers. Follower counts join an audit panel's growth chart when the connected account is the audited one (same platform and handle), else get their own chart in the card: a point a day up to a month, then a point a week. Once used, each visit to Analytics pulls again (`content-studio-realnumbers-<scope>`).
