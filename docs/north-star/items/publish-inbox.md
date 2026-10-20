# Comments and DMs in one inbox

`publish-inbox` | publish | phase 7 | status: partial | /north-star#publish-inbox

## Leo asked

8 Oct 2026: "an all in one tool for my social media management, and for each person too". Answering the comments and messages a post brings in is part of managing the accounts, and today it happens outside the app.

## How the best do it

Fastlane has no inbox in the recording or the captures. Its Home calls itself "your inbox from me", meaning posts waiting for a yes and anything that failed (notes-4 2.9), which is publish-library and agent-home territory.

The social suites all have one:

- Buffer's community inbox covers comments on Instagram, Facebook, LinkedIn, Threads, Bluesky, X, TikTok, Google Business, YouTube and Mastodon. It filters by unanswered, newest, oldest and date range, notifies on new comments and keeps saved replies, and its AI replies draft "in your style" with rephrase, shorten and expand. The inbox is on every plan; AI replies are 5 suggestions a week free and unlimited on paid plans, saved replies 1 free ([source](https://buffer.com/community), [pricing](https://buffer.com/pricing)).
- Planable's inbox add-on gives comments and DMs the statuses open, reply-later and done, with "AI generated replies" and "Sort comments by sentiment", for $9 (or $7.50) per workspace a month ([source](https://planable.io/features/), [pricing](https://planable.io/pricing/)).
- Taplio's Engage > Comments loads comments on posts published through Taplio and offers "Smart Replies" in four tones: "Add Value", "Congratulate", "Agree", "Disagree". It refreshes about every 2 hours ("Refresh" forces it), and on Pro "Search by URL" pulls the last 500 comments of any public post ([source](https://intercom.help/taplio/en/articles/17455795-engage-comments-tab)).
- Hearsay Social, sold to advisers' firms, pushes a nudge tied to one post: "Your LinkedIn post has 2 comments. Reply to them now." ([source](https://info.yext.com/rs/906-IBA-353/images/Hearsay_Social_Datasheet_2022.pdf)).
- Agorapulse runs moderation rules per profile, for example hide a comment that contains a link or an email, and can send replies through an approval step before they go out ([rules](https://support.agorapulse.com/en/articles/10419838-how-to-set-up-automated-moderation-in-the-inbox), [inbox](https://support.agorapulse.com/en/collections/7426820-inbox)).
- Sprout Social's Smart Inbox puts comments, DMs and mentions in one stream with "Collision Detection" when a teammate is already replying ([source](https://sproutsocial.com/features/smart-inbox/)). Ocoya, SocialBee, Metricool, Later, Hootsuite, ContentStudio, Cloud Campaign and Blotato all list a social inbox too ([Ocoya](https://www.ocoya.com/), [SocialBee](https://socialbee.com/features/), [Metricool](https://metricool.com/pricing/), [Later](https://later.com/pricing/), [Hootsuite](https://www.hootsuite.com/platform/social-media-inbox), [ContentStudio](https://contentstudio.io/social-inbox), [Cloud Campaign](https://www.cloudcampaign.com/solutions/insurance-marketing-agencies), [Blotato](https://www.blotato.com/)).

## What we have today

- Reply drafts at `/recruit/engage` (`src/pages/EngagePage.tsx`, `src/components/engage/Replies.tsx`, `Dms.tsx`, `src/lib/engageDrafts.ts`, edge function `supabase/functions/engage-assist`) work on pasted text and never post.
  - Mode `replies` takes a post and its comments, and Jev sorts each comment into potential client, adds something, peer, support or noise. A comment counts as a client from p(client) 0.35 (`CLIENT_MIN`) even when another kind is likelier; noise gets no draft.
  - Modes `dms` and `thread` sort messages into lead, recruiter, peer, favour or spam, flag template sequences, and steer the draft to a goal (call, guide, rapport).
  - Before drafting, Jev asks whether a text should be handled personally (complaint, claim, legal or medical question, press, a minor, harassment, or a topic the adviser adds). From p 0.8 (`ESCALATE_MIN`) it goes to a "Handle yourself" pile with no draft.
  - Caps `engage-replies` 30 and `engage-dms` 30 a day, each run up to 30 items (`MAX_ITEMS`).
- Saved replies with compliance flags (`?tool=snippets`, `src/lib/replySnippets.ts`).
- Connected accounts through Zernio, behind `SOCIAL_CONNECT_USERS` and `ZERNIO_API_KEY` (`supabase/functions/social`, `supabase/functions/_shared/zernio.ts`, `docs/zernio-connection.md`). Every read goes through the scoped helper (rule H3: `profileId=<mapped>`, items filtered again by the caller's account set) and every id is checked first (H1, M2, H2).
- The recorded decisions: `docs/social-api-app-review.md` says the app never comments or messages; `docs/zernio-connection.md` reverses that for connected advisers but adds "The Engage drafts stay copy and paste."
- The live app key "content-studio-app" is a restricted `zrk_` key that keeps accounts, publishing, analytics and messages and disables engagement, contacts, ads, telephony, billing and webhooks (memory zernio-live-1017, not visible in code). Which group Zernio files the comment reads under is not documented, so step 1 may need a new key.
- Nothing reads comments or DMs from a connected account.

## Build

Two steps. Step 1 reads and drafts, and the adviser still sends by hand, which keeps the recorded copy-and-paste decision. Step 2 adds Send, Hide and a phone nudge and waits for Leo.

Gate: the nav entry and page show only when `leoOnly(email)` and `socialConnectShown()`. On the server the new actions answer 404 `{enabled:false}` unless the caller is in `SOCIAL_CONNECT_USERS` (as every `social` action does today) and 403 unless `leoOnly(user.email)` from `supabase/functions/_shared/leoOnly.ts` (create it if no other item has; re-export from `src/lib/leoOnly.ts`).

### Step 1, server

New file `supabase/functions/social/inbox.ts`, wired into `social/index.ts` like `automations.ts`, with these actions (all counted on the existing `social-read` cap, 300 a day):

Zernio pages used: [List commented posts](https://docs.zernio.com/comments/list-inbox-comments.mdx), [Get post comments](https://docs.zernio.com/comments/get-inbox-post-comments.mdx), [List conversations](https://docs.zernio.com/messages/list-inbox-conversations.mdx), [List messages](https://docs.zernio.com/messages/get-inbox-conversation-messages.mdx). Read each page before calling it, as `docs/zernio-connection.md` asks.

- `inbox-posts {profileId, accountId?}`: `GET /v1/inbox/comments` with `profileId=<mapped>` (and a checked `accountId` when given), sorted by date, newest first, 25 rows. Each row is kept only when its account is in the caller's set. Returns `{posts: [{accountId, platform, platformPostId, caption (200 chars), url, thumb, commentCount, at}]}`.
- `inbox-comments {profileId, accountId, postId, cursor?}`: account checked (M2); `postId` must match `^[A-Za-z0-9_:.-]{1,100}$` and reaches the path through `encodeURIComponent`. `GET /v1/inbox/comments/{postId}?accountId=`, 50 a page. Returns `[{id, author, text (1,000 chars), at, likeCount, replyCount, isHidden, isOwn}]` and `nextCursor`.
- `inbox-conversations {profileId, accountId?, cursor?}`: `GET /v1/inbox/conversations` with `profileId=<mapped>`; a conversation stays only when its `accountId` is the caller's. Step 1 covers Instagram and Facebook. Zernio lists DMs for Facebook, Instagram, X, Bluesky, Reddit and Telegram only, so TikTok, LinkedIn, YouTube and Threads have no Messages tab; X is never connected here (M7).
- `inbox-messages {profileId, conversationId, accountId}`: account checked, then `GET /v1/inbox/conversations/{id}?accountId=` and its `accountId` compared again before `GET .../messages` (last 20).
- None of them stores comment or message text on our side. Zernio caches both comment reads for up to 10 minutes and says to use the `comment.received` webhook for anything live; the key has webhooks off, so step 1 reads on page open and on Refresh only, and the page says new comments can lag.

Error mapping, in plain words: Zernio 400 `PLATFORM_LIMITATION` on TikTok gives "TikTok comments need a TikTok Business connection. Reconnect it on Social accounts."; a 403 permission error (the key's groups) gives "Reading comments isn't switched on for this app key yet." and is logged for Leo; anything else gives "Couldn't read your inbox. Try again in a minute."

### Step 1, screens and states

New page `src/pages/InboxPage.tsx` at `/recruit/inbox`, with its logic in `src/lib/inbox.ts`. It is a tab in the recruit section after Reply drafts and before Auto-DM: `{ to: "/recruit/inbox", label: "Inbox", owners: LEO_EMAILS, show: socialConnectShown }`.

```
Inbox                                         [Refresh]
[Comments] [Messages]        [Open 7] [Later 2] [Done]       Account: [All v]
+-----------------------------+------------------------------------------------+
| [thumb] "3 signs your..."   | @jasmine.k  2 h                Potential client |
|  Instagram, 4 open          | "How do I know if my hospital plan is enough?" |
| [thumb] "CPF top-up..."     |  Draft: "Good question. It depends on ..."     |
|  LinkedIn, 2 open           |  [Copy] [Open on Instagram] [Later] [Done]     |
|                             | @tan.wk  5 h                     Handle yourself |
|                             | "My claim got rejected, can I complain?"        |
|                             |  Reason: A turned-down claim       [Later][Done] |
+-----------------------------+------------------------------------------------+
New comments can take up to 10 minutes to show here.
```

- Comments tab: posts with open comments on the left (thumb, first line of caption, platform, `<n> open`), the selected post's comments on the right, oldest open first. At 390 px the post list is a screen of its own and the comments open on tap, with Back returning to the list.
- Drafting: the first time a post's comments are shown, the page sends up to 30 open comments and the caption to `engage-assist` mode `replies` (no new function). Each comment gets a kind chip in the singular of Reply drafts' group headings in `src/components/engage/Replies.tsx` (`Potential client`, `Adds something`, `Peer`, `A like is enough`, `Worth hiding`, `Not sorted`) and a draft, and an escalated one shows `Handle yourself` with `Reason: <topic>` and no draft. Results are kept in memory for the visit and in `sessionStorage` (`cs-inbox-drafts-<scoped>-<postId>`) so going back and forth costs nothing.
- Each comment: `Copy` (copies the draft, toast `Copied. Paste it under their comment.`), `Open on Instagram` (the post's URL; the label follows the platform), `Later`, `Done`. The draft text is editable, and compliance chips from `scanCompliance` show under it as warnings.
- Messages tab: conversations with an unread or open state on the left (name, last line, time); the thread on the right with the last 20 messages, then one draft from `engage-assist` mode `thread` with the goal pills already used on Reply drafts (`Book a call`, `Send a guide`, `Build rapport`), under which sit `Copy`, `Open in Instagram`, `Later` and `Done`.
- States: `Open` is the default; `Later` hides it from Open until the user brings it back; `Done` hides it for good. A new comment or message on a Done conversation reopens it.
- Loading: `Reading your comments...` over 5 skeleton rows; the header and tabs render at once.
- Empty: `No open comments.` / `No open messages.`
- Social off: `Social accounts aren't switched on for you yet.` No accounts: `Connect an account to see its comments and messages.` with the link `Social accounts`.
- Read failed: the mapped message above with `Try again`.
- Drafting failed: the comments still show with `Couldn't write replies right now.` and `Try again`; nothing typed is lost.
- Over the read cap the server answers 429 and the page shows `You've used all 300 account reads for today. It resets at 8am Singapore time.`; over the drafting cap it shows the engage message used today.
- A count on the Recruit rail icon shows the open count from the last read, kept in the device key `cs-inbox-count-<scoped>`, so it needs no network. `StudioLayout.tsx` already passes `count` per section (today only `pipeline` gets `needsYou`); add `recruit` with this count. Leave `countNeedsYou` alone: its badge opens Calendar, where inbox items are not listed.

### Step 2, needs Leo

- `Send` beside `Copy`: `POST /v1/inbox/comments/{postId}` (reply, with `Idempotency-Key: cs:<uid>:<profileId>:<uuid>`), `POST /v1/inbox/conversations/{id}/messages` for DMs. A red compliance flag blocks Send as it blocks Post it for me. New cap `"inbox-send": 60` commented "Replies and DMs sent from the inbox (social inbox.ts). Zernio's messaging is free up to 10,000 sent a month."
- `Hide` on a comment (Facebook, Instagram, Threads, TikTok Business), and an opt-in rule "Hide comments with a link or a phone number from people I don't follow" in the spirit of Agorapulse's rule.
- A phone nudge from the `notify` cron, at most once a post per day: title `<Platform> post: <n> new comments`, body the post's first line, url `/recruit/inbox?post=<platformPostId>`.

### Copy

Exact strings: `Inbox`, `Comments`, `Messages`, `Open`, `Later`, `Done`, `Account`, `All`, `Refresh`, `<n> open`, `Potential client`, `Adds something`, `Peer`, `A like is enough`, `Worth hiding`, `Not sorted`, `Handle yourself`, `Reason: <topic>`, `Copy`, `Open on <Platform>`, `Copied. Paste it under their comment.`, `Reading your comments...`, `No open comments.`, `No open messages.`, `New comments can take up to 10 minutes to show here.`, plus the error lines above.

### Data

- Synced `content-studio-inbox-<scoped(uid)>`: `{ items: { [key]: { s: "later" | "done", at: ISO } } }` where `key` is `c:<accountId>:<commentId>` or `m:<accountId>:<conversationId>`, trimmed to the 500 newest and to 60 days. Only ids and states, never other people's words. Losing a state just reopens an item, so the missing tombstones do no harm.
- Device: `cs-inbox-count-<scoped>` (badge) and `cs-inbox-drafts-<scoped>-<postId>` in sessionStorage.
- No table and no migration.

### AI and cost

- Reads: Zernio includes comments and messaging on its usage plan, so there is no per-read charge; billing is per connected account (2 free, then US$6 a month each up to 10) ([zernio.com/pricing](https://zernio.com/pricing)), and each page read counts once on `social-read`.
- Drafts: the existing `engage-assist` modes with their Jev questions and thresholds, `CLIENT_MIN` 0.35 and `ESCALATE_MIN` 0.8, set from shadow checks on 2026-10-08 and 2026-10-11. No new Jev question: the inbox only changes where the text comes from. About 2 US cents per 30 comments for the words and about 320 Jev input tokens a question, under US$0.001 per run.
- Caps: `engage-replies` (30 runs a day) and `engage-dms` (30) as today. Step 2 adds `inbox-send` (60).

### Deep links

- `/recruit/inbox?tab=messages` (comments, messages; default comments), replace.
- `/recruit/inbox?state=later` (open, later, done; default open), replace.
- `/recruit/inbox?account=<zernio account id>`, replace.
- `/recruit/inbox?post=<platformPostId>` opens that post's comments, push.
- `/recruit/inbox?thread=<conversationId>` opens that conversation, push.
- Add `links.inbox({ tab, state, account, post, thread })` and the rows to `docs/deep-links.md`.

## Done when

- [ ] On Leo's connected Instagram account, a test comment shows in the inbox within 10 minutes, sorted and drafted, and Copy plus Open on Instagram work.
- [ ] A comment about a rejected claim lands under Handle yourself with no draft.
- [ ] Later and Done move items between the pills, survive a reload and sync to a second device.
- [ ] A DM conversation shows its last messages and one draft steered by the chosen goal.
- [ ] Another adviser's account id or conversation id sent in a request answers 404 (test, not live).
- [ ] TikTok without a Business connection shows the TikTok line, and the rest of the inbox still loads.
- [ ] Others see no Inbox tab, and the server answers 403 for a non-Leo caller in the allowlist.
- [ ] 390 px and 1440 px checked by eye; build and full vitest pass; the item flips in `src/data/northStar.ts`.

## Tests

- `supabase/functions/social/inbox.test.ts` with a fake Zernio: rows for an account outside the caller's set are dropped; a bad `postId` is refused before any call; a conversation whose `accountId` is someone else's answers 404; `profileId` is always the mapped one; the TikTok 400 maps to its message.
- `src/lib/inbox.test.ts`: `openItems(comments, states)` leaves later and done out, a new comment reopens a done conversation, `trimStates` keeps 500 and drops entries over 60 days, keys are built the same way on both tabs.
- `src/lib/inbox.test.ts` also covers `inboxBadge(uid)`: it reads `cs-inbox-count-<scoped>`, answers 0 when the key is missing or storage throws, and is 0 for a non-Leo email.
- `usageCaps` test for `inbox-send` once step 2 lands.

## Open questions

- Sending replies and DMs from the app reverses "The Engage drafts stay copy and paste" in `docs/zernio-connection.md`. Leo decides; step 1 ships without it.
- Reading comments may need a new restricted key with Zernio's comments or engagement group switched on. Keys are minted in Leo's session only.
- Mentions need Zernio's Inbox add-on and cover LinkedIn organization pages only, so they are left out until Leo asks.
- The phone nudge means `notify` reads Zernio for each allowed adviser every hour. Leo decides whether that is worth the reads.

## Related

publish-engage, publish-auto-dm, publish-accounts, learn-warm-leads, trust-approval, trust-compliance-check, agent-chat, brand-voice-memory
