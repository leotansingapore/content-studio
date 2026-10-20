# Comment a keyword, get a DM

`publish-auto-dm` | publish | phase 7 | status: partial | /north-star#publish-auto-dm

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane shows no comment-to-DM automation in the recording or the captures.

The pattern is standard across the suites: a keyword comment on one post, or on any post, sends a DM with a link, and a log says who got it.

- Blotato sets keyword triggers on comments or DMs, per post or account-wide, and counts triggered, completed and failed, on Instagram and Facebook only ([source](https://www.blotato.com/)).
- Hootsuite answers a keyword comment with a DM, rotates several public reply wordings, and can delay replies by a few minutes "so they feel personal". It is listed on Professional and above ([source](https://www.hootsuite.com/platform/social-media-inbox), [plans](https://www.hootsuite.com/plans)).
- Metricool's Flows ("Planning" > "Flows" > "+ New Flow") start from templates such as "Turn comments into direct messages", "Reply to direct messages with keywords" and "Turn story replies into direct messages", rotate up to 3 reply variants at random, and wait up to 24 hours before sending. Flows can be saved as a draft or switched on, and Instagram needs a professional account linked to a Facebook Page ([source](https://metricool.com/metricool-flows-dm-automation-tool/)).
- Vista Social's keyword DMs deliver messages, links or offers and can gather emails and leads; its "Quick Automations" wizard sits beside a "Flow Builder", and its AI can build a flow from a description. DM contacts are capped at 10,000, 25,000 or 100,000 by plan ([source](https://vistasocial.com/dm-automations), [pricing](https://vistasocial.com/pricing/)).
- Eden answers a comment keyword with a DM, lets its AI carry the chat after that and counts clicks, with AI DM automation on Pro ([source](https://eden.so/), [pricing](https://eden.so/pricing)).
- Hypefury sends a link, freebie or discount by DM to people who reply with the trigger word on Instagram reels and posts ([source](https://hypefury.com/)). Tweet Hunter does the same on X for people who like or reply, with 3,000, 7,500 or 15,000 auto-DMs a month by plan ([pricing](https://tweethunter.io/pricing)).

## What we have today

Auto-DM is built, behind the social allowlist, and has not yet sent a real DM.

- Page `/recruit/auto-dm` (`src/pages/AutoDmPage.tsx`, `src/lib/autoDm.ts`), listed only while `socialConnectShown()`; server `supabase/functions/social/automations.ts` on Zernio's comment automations, with the ownership checks M1, M2 and H3 from `docs/zernio-connection.md`.
- Triggers: comments, story replies and story mentions. Targets: one of the account's 25 latest posts, or "Every post on this account without its own auto-DM". Up to 10 whole-word keywords or every comment, and "Also answer when they DM the word".
- The DM with "Insert first name", up to 3 other wordings, up to 3 link buttons; the public reply with up to 5 other wordings; the Instagram follower check. TikTok, Threads, LinkedIn and YouTube take the public reply only.
- Three starting points with no figures and no link (`STARTERS`: `Free guide` / GUIDE, `Webinar seat` / SEAT, `15-minute chat` / CHAT), a phone-style preview, and compliance flags where a red flag blocks the save.
- The list shows `DMs sent`, `Read` and `Link taps` totals, and per auto-DM `Sent`, `Delivered` (Facebook only), `Read`, `Link taps`, an On or Paused switch and "Who got it", which filters `All`, `Sent`, `Skipped`, `Failed` with reasons. The server reads Zernio's `dmsFailed` into `stats.failed`, and each row already shows it in red when above 0 (a `Failed` tile on wide screens, `, <n> failed` in the phone line). The totals row has no Failed tile, and the red count does not open Who got it on the Failed filter.
- Write shows `Set up the auto-DM` when the CTA is a comment or DM keyword, linking to `/recruit/auto-dm?keyword=<WORD>` (the word found by `ctaKeyword`, a regex in `src/lib/autoDm.ts`).
- Cap `social-automation-write` 30 a day; listing and logs count on `social-read` 300.
- Live state (memory zernio-live-1017, unverified from code): Zernio is live since 2026-10-17, Post it for me was tested on TikTok, and Auto-DM still waits for an Instagram or Facebook account Zernio can DM from. Leo's Activity Tracker Facebook Page is blocked.

What is missing: the auto-DM is set up on its own page after the post is out, so a remixed post that says "comment GUIDE" goes live with nothing answering. There is no wait before sending, failures are not totalled or one tap from their reasons, and nothing warns about a scheduled post that asks for a keyword with no auto-DM behind it.

## Build

Gate: everything new shows only when `leoOnly(email)`, inside surfaces that already need `socialConnectShown()`. The server accepts the new fields only for `leoOnly(user.email)` (`supabase/functions/_shared/leoOnly.ts`) and ignores them for anyone else.

### 1. Set it up with the post (Post it for me)

In `src/components/PostItForMe.tsx`, when the draft's `ctaType` is `comment-keyword` or `dm-keyword`, a block shows under the caption:

```
[x] Answer everyone who comments  [ GUIDE ]
    DM:  Hi {{first_name}}, thanks for asking! Here's the guide ...   (Free guide words)
    Button: [Get the guide]  [ https://...            ]
    More options on Auto-DM >
```

- The keyword field starts from `ctaKeyword(caption)` and can be edited; with no keyword the block reads `Add the keyword your post asks for.` and the box stays unticked.
- The DM, button title and public reply start from the `Free guide` starter, and the button link starts from the brand's first offer link in the brand kit when it has one. On TikTok, Threads, LinkedIn and YouTube only the public reply shows, with the line `<Platform> can't send DMs, so they get a public reply.`
- Compliance flags run on the DM, the button and the reply, and a red flag disables `Schedule` with `Reword the red flag in the auto-DM first.`
- After `schedule` returns the Zernio post, the page calls `automation-create` once per picked account with the new field `zernioPostId` set to that post's id. Zernio's `postId` binds a per-post automation to a post that is not yet published: "the automation stays pending and arms itself when that post publishes" ([docs](https://docs.zernio.com/comment-automations/create-comment-automation.mdx)).
- The draft keeps the ids in `zernio.autoDm: string[]` (synced), and its chip reads `Auto-post | Auto-DM on`.
- If the automation call fails, the post stays scheduled and a toast says `Scheduled. The auto-DM didn't save: <reason>.` with `Try again`.
- Cancelling the post through the chip also deletes its pending auto-DMs (`automation-delete`), and a failed delete is listed on Auto-DM as `Paused: its post was cancelled.` after a pause call.

Server, `supabase/functions/social/automations.ts`: `automation-create` accepts `zernioPostId` (must match `^[a-f0-9]{24}$`). Before use it goes through the post check (H2: `GET /v1/posts/<id>`, every platform account in the caller's set) and the post must include the automation's account. It is sent as `postId`, with `platformPostId` left out, and `postTitle` is the caption's first 80 characters.

### 2. Wait before sending

The form (and the block above) gains `Send it` with the options `Right away`, `After 2 minutes`, `After 10 minutes`, `After an hour`, stored as `dmDelaySeconds` 0, 120, 600, 3600, with the public reply after the same wait (`commentReplyDelaySeconds`). Zernio allows up to 86,400 seconds and answers 400 when a delay is sent for TikTok, Threads, LinkedIn or YouTube, so the control shows on Instagram and Facebook only ([docs](https://docs.zernio.com/comment-automations/create-comment-automation.mdx)). `AutomationInput` gains `delay: 0 | 120 | 600 | 3600`, checked server-side. Default `After 2 minutes`, following Hootsuite's reason that a short wait reads as a person.

### 3. Failures on the list

- The red count each row already shows (`Failed` tile on wide screens, `, <n> failed` on phones in `src/pages/AutoDmPage.tsx`) becomes a button that opens `?log=<id>&status=failed` through `links.autoDm({ log, status: "failed" })`, with the label `Failed <n>` on both sizes.
- The totals row gains a fourth tile, `Failed`, only when any auto-DM has failures; the grid goes from 3 to 4 columns at 640 px and up and stays 3 plus a wrapped tile on phones.

### 4. Posts asking for a keyword with no auto-DM

`src/lib/autoDm.ts` gets `missingAutoDm(drafts)`: scheduled drafts in the next 14 days with a keyword CTA, a Zernio post and no `zernio.autoDm`. My posts and the Library show on those cards `Asks for a comment keyword. No auto-DM yet.` with `Set it up` (`/recruit/auto-dm?edit=new&keyword=<WORD>&post=<draftId>`). The new `post` param preselects that draft's Zernio post through `zernioPostId`.

### Copy

Exact strings: `Answer everyone who comments`, `Add the keyword your post asks for.`, `More options on Auto-DM`, `<Platform> can't send DMs, so they get a public reply.`, `Reword the red flag in the auto-DM first.`, `Auto-DM on`, `Scheduled. The auto-DM didn't save: <reason>.`, `Try again`, `Paused: its post was cancelled.`, `Send it`, `Right away`, `After 2 minutes`, `After 10 minutes`, `After an hour`, `Failed`, `Failed <n>`, `Asks for a comment keyword. No auto-DM yet.`, `Set it up`.

### Data

- `ZernioLink.autoDm?: string[]` (the interface is in `src/lib/draftHistory.ts`) on the draft in `content-studio-drafts-<scoped(uid)>`. These ids are display hints; every server call checks the automation again (M1).
- Automations, logs and stats stay in Zernio, read live as today. No table and no migration.

### AI and cost

- No model call and no Jev question. The keyword is typed or confirmed by the user in a field; `ctaKeyword` only pre-fills it.
- Zernio: automation DMs are free up to 10,000 sent a month, then metered (`docs/zernio-connection.md`, [pricing](https://zernio.com/pricing)).
- Caps: every create, edit, pause and delete counts on `social-automation-write` (30 a day), which leaves room for one auto-DM per account at schedule time, so no new cap is needed.

### Deep links

- `/recruit/auto-dm?edit=new&keyword=GUIDE&post=<draftId>`: `post` is new, push with `edit`; an unknown or unscheduled draft is ignored.
- `/recruit/auto-dm?log=<id>&status=failed` as today.
- Update `links.autoDm` with `post` and the row in `docs/deep-links.md`.

## Done when

- [ ] A scheduled Instagram post with "comment GUIDE" and the box ticked creates a pending auto-DM bound to its Zernio post, and a test comment of GUIDE after publishing gets the DM (live test on Leo's DM-capable account, once one is connected).
- [ ] An automation call with someone else's Zernio post id answers 404 (function test).
- [ ] A red compliance flag in the auto-DM block disables Schedule with its reason.
- [ ] Cancelling the post removes its pending auto-DM.
- [ ] The delay saves, reloads and reaches Zernio as `dmDelaySeconds`; TikTok auto-DMs never send it.
- [ ] A row's red `Failed <n>` opens Who got it on the Failed filter, and the totals row shows a Failed tile only when some auto-DM has failures.
- [ ] A scheduled post with a keyword CTA and no auto-DM shows the warning in My posts and the Library.
- [ ] Others see none of the new controls, and the server ignores `zernioPostId` and `delay` from them.
- [ ] 390 px and 1440 px checked by eye; build and full vitest pass; the item flips in `src/data/northStar.ts`.

## Tests

- `supabase/functions/social/automations.test.ts`: `zernioPostId` must be 24 hex characters; the post check rejects a post with a foreign account; the body sends `postId` and no `platformPostId`; `delay` maps to both delay fields on Instagram and Facebook and is refused on TikTok; both fields are dropped for a non-Leo caller.
- `src/lib/autoDm.test.ts`: `missingAutoDm` picks only scheduled keyword posts with a Zernio post and no auto-DM inside 14 days; the block's starting words come from the Free guide starter with the keyword kept.
- `src/lib/autoPost.test.ts`: the chip label adds `Auto-DM on` when ids are present.

## Open questions

- `ctaKeyword` is a regex picking a word, a decision that Leo's rules send to Jev. video-assist already asks Jev which of several candidate keywords the speaker meant (`keywordQuestion`); reusing it here is a small follow-up. Leo decides whether it is worth one Jev call per post.
- Gathering emails or phone numbers inside the DM (Vista Social) means storing leads, which is publish-link-in-bio step 2 and a schema change for Leo.
- Should the AI carry on the DM conversation after the first message (Eden)? That is an agent writing to a member of the public in an adviser's name under MAS rules. Leo decides; nothing here does it.

## Related

publish-inbox, publish-link-in-bio, publish-schedule, publish-library, publish-accounts, plan-review-queue, trust-compliance-check, learn-warm-leads, learn-attribution
