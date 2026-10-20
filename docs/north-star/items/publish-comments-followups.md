# First comment and follow-ups

`publish-comments-followups` | publish | phase 7 | status: partial | /north-star#publish-comments-followups

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane shows no first comment or follow-up in the recording or its public captures.

- Publer: icons on each post for "follow-up comments", "auto-share" and "auto-delete", each with "Edit conditions" on post age, engagements and reach joined by AND/OR (for example reach over 1,000 and under 20 interactions). Auto-share reposts to other accounts at the next best time; auto-delete can hide instead on Facebook Pages and YouTube, and presets save per account. Auto actions need Professional; performance conditions need Business; insights sync every 24 hours. [blog](https://publer.com/blog/auto-comment-share-delete-posts-by-performance/)
- FeedHive "Post Conditions": a comment or thread follow-up fires on "Above average" (against your other posts), "Delay" (minutes), "Likes", "Comments", "Impressions" or "Engagement rate" (for example 3.5% after 45 minutes). 10, 100 or unlimited by plan. [docs](https://docs.feedhive.com/planning-and-scheduling/how-to-use-post-conditions)
- Postiz "Plugs": per channel, switch on and set an "Amount of likes"; "Auto Repost Posts" reposts at the threshold and "Auto plug post" adds a follow-up that keeps the promo link out of the original. It checks only posts up to a week old, on X, LinkedIn Pages and Bluesky (Threads gets the plug only). [docs](https://docs.postiz.com/general/automations/plugs)
- Hypefury Autoplugs comment your newsletter, course or site under posts that cross an engagement threshold you set. [site](https://hypefury.com/)
- Buffer schedules a first comment with the post, for example to hold hashtags so the caption stays clean (Essentials and Team). [publish](https://buffer.com/publish)
- Taplio's per-post "Scheduled comment" puts a link in the first comment with an optional delay. [help](https://intercom.help/taplio/en/articles/17173502-taplio-post-boosts)
- Vista Social adds up to 10 "Extra comments" to a post. [page](https://vistasocial.com/social-media-publishing/)
- Supergrow's "Schedule First Comment" posts a follow-up comment (a CTA, hashtags or context) when the LinkedIn post goes live. [site](https://www.supergrow.ai/)

What Zernio can do for us, read from its docs and `openapi.json` on 20 Oct 2026 ([comments](https://docs.zernio.com/comments/reply-to-inbox-post.mdx), [message pricing](https://docs.zernio.com/pricing/messages.mdx), [unpublish](https://docs.zernio.com/posts/unpublish-post.mdx), [TikTok inbox](https://docs.zernio.com/platforms/tiktok/inbox.mdx)):
- `firstComment` on a new post, everywhere we post except TikTok (already used).
- `POST /v1/inbox/comments/{postId}` with `{ accountId, message }` posts a comment on a published post. A Zernio post id works as `postId` (it is resolved to the platform's id). The endpoint sits in Zernio's `engagement` resource group (`x-resource-group` in `https://zernio.com/openapi.json`).
- `Idempotency-Key` replays a successful comment instead of posting it twice, for 24 hours, per key and per path.
- Comment replies are not metered: "replies to comments and reviews" are free on every account.
- TikTok comments work only for accounts connected through TikTok's Business app; the others get 400 `PLATFORM_LIMITATION`.
- Unpublish (delete a live post) does not work on Instagram or TikTok.

## What we have today

- `DraftEntry.firstComment` (`src/lib/draftHistory.ts`). Write fills it only through "Move link to first comment" on a LinkedIn post with a link (`moveLinksToComment` in `src/lib/platformCounters.ts`), then shows a "First comment" box with Copy and the InfoTip "Post this as your own first comment once the post is up." Copy tags the links when the brand kit asks (`tagLinks`).
- Post it for me sends `draft.firstComment` to Zernio on Instagram, Facebook, LinkedIn, Threads and YouTube (`FIRST_COMMENT_PLATFORMS`, up to 1,250 characters, `supabase/functions/social/posts.ts`). The panel never shows it, so it can't be typed or checked there, and it goes without the tagged links.
- No follow-up comment, repost or delete exists.

## Build

Gate: `leoOnly(email)` for the typed first comment and follow-ups. `SOCIAL_CONNECT_USERS` already limits the server side to Leo.

### First comment

- Write's result: "Add a first comment" (any platform but TikTok) opens the existing First comment box as an editable textarea. "Move link to first comment" stays for LinkedIn.
- Schedule step 3 (publish-schedule): a "First comment" textarea, prefilled with `draft.firstComment` and its links tagged when the kit asks, 1,250-character counter, compliance flags (a red flag blocks the send). Hidden when only TikTok is ticked; with TikTok and others ticked, the line "TikTok has no first comment. It goes on the other networks."
- Instagram: "Move hashtags to first comment" shows when the caption ends in hashtags, backed by a new pure `moveHashtagsToComment(text, comment)` beside `moveLinksToComment`.

### Follow-up comment

One per post, set in schedule step 3 under the first comment:

```
+ Add a follow-up
Follow-up comment
| Want the checklist? Comment GUIDE and I'll send it.       |
Post it  ( ) [2] hours after it goes out
         (o) when it reaches [100] [likes v] within [3] days
Starting points: [Link to the full guide] [Questions? Ask below] [Comment GUIDE]
```

- Rules: N hours after it goes out (1 to 72), or likes, comments or views of at least N within D days (1 to 7).
- It posts once, on every picked account on Instagram, Facebook, LinkedIn, Threads or YouTube. TikTok waits (Open questions).
- Starting points fill the box with plain lines and no figures: "Here's the full guide: [your link]", "Questions on this? Ask below and I'll reply.", "Want the checklist? Comment GUIDE and I'll send it." The person adds their own link.
- The text runs through `scanCompliance`; a red flag blocks the send, as on the caption.
- At most 20 waiting follow-ups per brand. At the limit the link reads "20 follow-ups are waiting. One has to finish first."

Who posts it: a new edge function `supabase/functions/social-followups`, built like `social-sweep`. It is deployed `--no-verify-jwt`, refuses a request without the `x-social-followups-secret` header, answers `{enabled:false}` with no `ZERNIO_API_KEY`, and takes `dryRun`. Pure logic goes in `logic.ts`. A pg_cron job runs it hourly from a new `supabase/hub/0NN_social_followups.sql`, modelled on `021_social_sweep.sql` (secret in Vault), applied by hand after an independent review. 0NN is the next free number at build time: 025 today, but the agent-autonomy, business-credits and trust-workspaces specs also name 025. Each run:

1. Reads `cs_user_data` rows with keys `content-studio-followups-%` and skips `content-studio-followups-done-%` (the LIKE matches both), in pages, as notify reads its prefs. A key's user id must equal the row's `user_id`, or the row is skipped.
2. For each waiting rule inside its window: maps (owner, brand) to the Zernio profile through `cs_social_profiles`, runs the post check (H2) against that owner's accounts, and needs the post `published`.
3. Metric rules read the post's numbers through the same scoped read `metrics.ts` uses.
4. When the rule is met: `consumeUsage(owner, "social-followup")`, then `POST /v1/inbox/comments/{postId}` per account with `Idempotency-Key: fu:<uid>:<rule id>:<account id>`. `refundUsage` on failure.
5. Writes the outcome to `content-studio-followups-done-${scope}` (the server is that key's only writer), with `updated_at` now. The done record is what stops a second comment for good; Zernio's key only covers 24 hours.

The app pulls the done key with `refreshCloudKeys` (src/lib/cloudSync.ts) when My posts or Calendar opens, since a plain sync only pulls on sign-in.

States on the post (chip details, `ZernioStatus`):
- Waiting: "Follow-up waiting: at 100 likes, until Fri 24 Oct" or "Follow-up waiting: 2 hours after it goes out", with "Cancel follow-up".
- Sent: "Follow-up posted Tue 21 Oct, 11:00 am", with a link when Zernio returns one.
- Expired: "Follow-up not posted: 64 likes by Fri 24 Oct."
- Failed: "Follow-up failed: {reason}" (Zernio's words, cut to 200 characters).
- Over the daily cap: "Follow-up held: today's 20 are used. It tries again next hour." The rule stays waiting while its window lasts.
- Off: with the function off or the key missing, waiting rules keep waiting and the chip shows them as waiting.

### Copy

- "Add a first comment", "First comment", "Move hashtags to first comment"
- "TikTok has no first comment. It goes on the other networks."
- "+ Add a follow-up", "Follow-up comment", "Post it", "hours after it goes out", "when it reaches", "within", "days", metric options "likes", "comments", "views"
- The three starting points and the limit line, word for word as written above
- The status lines and "Cancel follow-up", word for word as written above

### Data

- `content-studio-followups-${scoped(userId)}`: `{ id: string; draftId: string; postId: string; accountIds: string[]; text: string; rule: { after: number } | { metric: "likes" | "comments" | "views"; min: number; days: number }; startsAt: string; createdAt: string }[]`. Written by the app only, after Zernio returns the post id.
- `content-studio-followups-done-${scoped(userId)}`: `{ [ruleId]: { status: "sent" | "expired" | "failed"; at: string; url?: string; error?: string } }`. Written by the function only.
- First comment stays `DraftEntry.firstComment`. No schema change. The cron SQL is a scheduled job, not a table, but it still goes to Leo for review before it is applied.

### AI and cost

- No model and no Jev question: the rules are numbers and times.
- New cap in `supabase/functions/_shared/usageCaps.ts`: `"social-followup": 20`, commented "A follow-up comment posted by social-followups on a published post; Zernio comments are free."
- Zernio reads (one numbers read per metric rule per hour, for at most 7 days) and comments cost nothing on Zernio.

### Deep links

- The follow-up is a field inside schedule step 3 (`step=caption`, publish-schedule); it has no param of its own.
- The post's status opens with `/calendar?post=<id>` or `/drafts` as today.

## Done when

- [ ] On Leo's sign-in a typed first comment goes out with an Instagram post, with tagged links when the kit asks.
- [ ] Before the first live follow-up: the new Zernio key with `engagement` on is in `ZERNIO_API_KEY` and the cron is applied (both Leo's).
- [ ] "Move hashtags to first comment" moves trailing hashtags and Undo puts them back.
- [ ] A follow-up "2 hours after" on a LinkedIn test post appears under it within the next hourly run, once.
- [ ] A metric follow-up that never reaches its number shows "Follow-up not posted" after its window.
- [ ] A second run of the function never posts the same follow-up twice (the done record, with the idempotency key behind it).
- [ ] `dryRun: true` lists what it would post and posts nothing.
- [ ] `npm run build`, the full `npx vitest run`, the function's Deno tests, and a by-eye check at 390 px and 1440 px pass.
- [ ] `src/data/northStar.ts` item flipped with its `ours` line, in the same commit.

## Tests

- `src/lib/platformCounters.test.ts`: `moveHashtagsToComment` moves trailing tags only, keeps tags inside a sentence, and appends to an existing comment.
- `supabase/functions/social-followups/logic.test.ts`: a key whose user id differs from the row is skipped; an "after 2 hours" rule fires at 2 hours and not before; a metric rule fires at the threshold and expires after its days; a post not yet published waits; someone else's post id fails the post check; the idempotency key is stable per rule and account; over the cap holds the rule.
- `supabase/functions/_shared/usageCaps.test.ts`: the new cap exists.
- `src/lib/followups.test.ts` (new, for the app's reader): status lines for waiting, sent, expired and failed; the 20-rule limit.
- Prove each case bites by breaking the code once.

## Open questions

- Stop for Leo: the app's restricted Zernio key (minted 17 Oct) has the `engagement` group switched off, and `POST /v1/inbox/comments/{postId}` needs `engagement` (`openapi.json`). Zernio keys can't be edited, so Leo's session mints a new restricted key with `engagement` on, swaps `ZERNIO_API_KEY` and revokes the old one. Until then the function answers 403 from Zernio and ships switched off.
- Stop for Leo: the hourly cron migration (`0NN_social_followups.sql`) needs his review and apply.
- Auto-repost and auto-delete are left out. Zernio cannot delete a live Instagram or TikTok post, and of our networks only LinkedIn takes a repost (`platformSpecificData.reshareUrl`, [docs](https://docs.zernio.com/platforms/linkedin.mdx)). Leo decides whether a LinkedIn-only repost is worth building.
- TikTok follow-ups are left out of the first build. Zernio supports them on Business-app TikTok accounts, which @activity_tracker_io should be (publish-tiktok); add TikTok once one live comment proves it.
- How often Zernio refreshes a post's numbers is unverified; if it is daily, metric rules will fire up to a day late, which the first live week will show.

## Related

publish-schedule, publish-auto-dm, publish-inbox, publish-engage, publish-per-network, learn-real-numbers, trust-compliance-check
