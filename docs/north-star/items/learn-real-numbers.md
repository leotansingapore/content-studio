# Real numbers from your accounts

`learn-real-numbers` | learn | phase 7 | status: partial | /north-star#learn-real-numbers

## Leo asked

8 Oct 2026: "an all in one tool for my social media management, and for each person too". Each person's own numbers, read from their own accounts, are the measuring half of that.

## How the best do it

Fastlane reads numbers from the connected account and shows them first on Home. With one TikTok connected (@activity_tracker_io), the Pace card read "views a day, Sun" and "No views yet." The sidebar's "Analytics" item carries a "Growth" plan tag and was not opened in the recording, so its per-post screens are unverified.

![Fastlane 0:04](../../../public/north-star/fastlane/t004.webp)

Its homepage says the learning loop reads results against the account's own averages ([usefastlane.ai](https://usefastlane.ai)). In the recording, asked "what can you do", Senna says: "I make short-form content, post it, read the numbers, and do more of what worked."

![Fastlane 5:13](../../../public/north-star/fastlane/t313.webp)

Others:

- Sandcastles lets you verify your own accounts, if you want to, for a personal analytics dashboard: 1, 3, 5 or 20 verified accounts by plan, refreshed on demand every 12 hours (Pro), 6 hours (Visionary) or 1 hour (Titan) ([plans](https://help.sandcastles.ai/plans)).
- Blotato shows top posts by views, likes or comments, and per-post numbers with snapshot history, on 8 platforms but not LinkedIn ([site](https://www.blotato.com/)).
- Virlo keeps a snapshot per check with `delta_*` fields against the one before, and returns the latest 1 to 365 checks ([docs](https://dev.virlo.ai/docs/tracking)).
- Later keeps 3 months of history on Starter, 1 year on Growth and 2 years on Scale; audience analytics needs 100 or more followers ([pricing](https://later.com/pricing/)).
- Instagram's own Edits app shows skip rate, like rate, share rate, a retention graph and a follower versus non-follower split for Reels over 7 to 60 days, free ([overview](https://posteverywhere.ai/blog/what-is-instagram-edits)).
- Submagic's API returns per-post analytics for published projects and account totals against the prior period with a daily series ([docs](https://docs.submagic.co/llms.txt)).
- Revid.ai sends per-post views and engagement back to its dashboard after posting, depth unverified ([features](https://www.revid.ai/features/repurpose-viral-videos)).

## What we have today

- Analytics, "Your real numbers" (`src/components/RealNumbers.tsx`, `src/lib/realNumbers.ts`), shows only while Social accounts is on (`socialConnectShown()`, server allowlist `SOCIAL_CONNECT_USERS`). "Use my real numbers" calls `pullNumbers`: the `social` function, action `metrics`, up to 5 pages of 100 posts for the last 366 days, each with impressions, reach, views, likes, comments, shares and saves (`supabase/functions/social/metrics.ts`, paid-boosted posts left out). `pullFollowers` reads daily follower counts.
- Each pulled post (`MetricsPost`) keeps only the first 300 characters of its text (`str` in `metrics.ts`). The file says its shapes come from Zernio's openapi.json and were not yet seen against a live key, so whether an outside post's `id` stays the same between pulls is unverified.
- `matchPulled` puts a post's numbers on the draft that sent it with Post it for me (same Zernio post id) through `setDraftNumbers`, into `draft.zernio.numbers`. `withReal` in `src/lib/analytics.ts` then uses them in place of typed numbers on every Analytics card and in the Monday email.
- Every other post is listed under "Posted outside the app ({n})". A post the adviser copied and posted by hand, then marked posted, stays there and never reaches its draft.
- Once used, the card pulls again on each Analytics visit (`content-studio-realnumbers-<scoped>` = "1"). Nothing refreshes them anywhere else.
- My posts (`src/pages/DraftsPage.tsx`, around line 620) shows four typed inputs (Impressions, Reactions, Comments, Shares) on posted rows even when real numbers exist. Analytics' "Add your numbers" table (`AnalyticsPage.tsx`, around line 772, reading `d.zernio?.numbers` only) shows them read-only with "real numbers: 1,500 views, 900 reach". A draft sent with Post it for me also shows `ZernioStatus` (in `src/components/PostItForMe.tsx`), a status chip that opens the live links; it shows no numbers.
- `numbersLine` and `extraLine` live in `src/lib/realNumbers.ts`; `timeAgo` ("3h ago") lives in `src/lib/accountAudit.ts`.
- `upsertDraft` keeps only the extra draft fields it names (`zernio` is one) when Write saves, and `duplicateDraft` deletes a fixed list of keys, so a new field must be added to both. `AnalyticsPage` does not call `useScrollToHash`.
- Cap: `social-read` 300 a day per user, one use per `social` call.

Status partial: the pull works for allowlisted accounts and lands on Post it for me drafts, but hand-posted drafts never get numbers, My posts does not show them, and they refresh only from Analytics.

## Build

Four changes, all for `leoOnly(email)` first, on top of the server's `SOCIAL_CONNECT_USERS` check.

### Screens and states

1. Keep them fresh. A module-level job `refreshRealNumbers(userId, { force })` in `src/lib/realNumbers.ts` (outside React, one run at a time per brand, listeners like `runCheck` in `src/lib/following.ts`) pulls when the last pull is over 6 hours old, or always with `force`. For Leo, Home, My posts and Analytics call it on open. It does what `RealNumbers.pull()` does today (pull, match, `setDraftNumbers`, remember), keeps the last pull's outside posts in memory for the page, then calls `recordPull` from `learn-pace`. `RealNumbers.tsx` switches to the job, so a pull started on Home finishes even if the user moves on. Other sign-ins keep today's rhythm: Analytics calls the job with `force` on every visit, and the "Update" button always forces.

2. Numbers on each post. In My posts, a posted draft with real numbers shows a read-only line where the four inputs are now:

   ```
   1,500 views, 900 reach, 42 likes, 6 comments, 3 shares. Updated 3h ago   [Type my own]
   ```

   It uses `numbersLine(n, ["views", "reach", "likes", "comments", "shares", "saves"])` from `src/lib/realNumbers.ts` and `timeAgo(at)` from `src/lib/accountAudit.ts`. "Type my own" reveals the inputs; typed numbers stay stored, and the real ones still win in Analytics. A linked draft whose pulled numbers are all zero (`numbersLine` returns "") reads "No numbers yet". The `ZernioStatus` chip in `PostItForMe.tsx` adds "{n} views" after its label once `zernio.numbers.views` is above 0.

3. Match hand-posted drafts. After each pull, `matchByHand(drafts, outside, notMine)` in `src/lib/realNumbers.ts` looks for the draft behind each outside post:
   - Candidates are drafts that are posted, on the same platform, have no `zernio.postId` and no `live` link, and whose posted day (`postedAt`, else `scheduledFor`) is within 3 days of the post's `publishedAt`. Each is scored with `wordOverlap(toPlainText(d.draft).slice(0, post.text.length), post.text)` from `src/lib/nearDuplicate.ts`. The cut matters: `post.text` holds at most 300 characters, and this word overlap (Jaccard) against a whole long LinkedIn draft scores low even when it is the same post. `d.draft` already starts with the hook.
   - Exactly one candidate at overlap 0.7 or more gets linked at once (`by: "auto"`).
   - Otherwise, candidates at 0.3 or more go to Jev in one call (up to 10 pairs, mode `same-post`, below). A pair at 0.7 or more links (`by: "jev"`) when it is the only one above 0.7 for that post.
   - When Jev returns null, is over its cap or links nothing, the post stays outside.
   - Linking writes `draft.live` and its numbers. `matchPulled` then matches `zernio.postId` against `MetricsPost.zernioPostId` first and `live.postId` against `MetricsPost.id` second, so the numbers stay current on every later pull.

4. Link or unlink by hand. In Analytics' "Posted outside the app" list each post gets "Link to a post". It opens a picker (`?link=<postId>`) of up to 10 posted drafts on that platform within 7 days, sorted by overlap, plus "None of these" (which adds the post to `notMine`). The outside list is not stored, so a cold load of `?link=` forces a pull first and shows "Reading your numbers..." until it lands; a post that is not in the pull removes the param and shows the toast "That post isn't in your latest numbers." A linked draft shows "Numbers from your {Instagram} post" with "Unlink" in My posts, which clears `live` and adds the post to `notMine` so the matcher does not link it again.

States:

- Refreshing: a muted chip "Updating your numbers..." in the My posts header within 400 ms; Home shows nothing extra (PaceCard has its own line).
- Done: lines on posts, "Updated {time}" in the chip's place for 3 seconds, then nothing.
- Failed pull: the chip reads "Couldn't update your numbers." with "Try again"; the last numbers stay.
- No analytics on the Zernio plan (402 `no_analytics`): the chip shows the server's "Analytics isn't on this Zernio plan." and the job does not run again for 24 hours.
- Over the daily cap (429): the chip shows the server's message; the last numbers stay.
- Not connected (no accounts): My posts is unchanged; the job stops until an account is connected.
- Matching: silent. Toast on a Jev or auto link only when My posts is open: "Numbers linked to "{hook}"" with "Undo".
- Picker: list, "Link", "None of these"; saving shows "Linked" inside 400 ms.
- Refused: other sign-ins keep today's behaviour exactly; `same-post` answers 404 `{ code: "not_enabled" }`.

### Copy

- Post line: "{numbers}. Updated {3h ago}", "No numbers yet", link "Type my own"
- Linked line: "Numbers from your {Instagram} post", button "Unlink"
- PostItForMe chip addition: "{n} views"
- Chip: "Updating your numbers...", "Updated {time}", "Couldn't update your numbers.", "Try again"
- Outside list: button "Link to a post"; picker title "Which post is this?", buttons "Link", "None of these"; saved "Linked"; cold load "Reading your numbers..."; toast "That post isn't in your latest numbers."
- Toast: "Numbers linked to "{hook}"", "Undo"
- The InfoTip on the Your real numbers heading changes to "Posts you put out yourself are matched to their drafts too."

### Data

- `DraftEntry` in `src/lib/draftHistory.ts` gains:

```ts
live?: {
  postId: string;              // MetricsPost.id
  platform: string;
  url: string | null;
  by: "auto" | "jev" | "you";
  numbers?: Numbers & { at: string };
};
```

  `setDraftNumbers` writes to `zernio.numbers` or `live.numbers`, whichever link the draft has, and `withReal` reads `d.zernio?.numbers ?? d.live?.numbers`. So do the "Add your numbers" table in `AnalyticsPage.tsx` (around line 772) and `postsFrom` in `notify/logic.ts` (line 115), so the Monday email counts hand-posted drafts too. Add `"live"` to the keys `duplicateDraft` deletes, and keep it in `upsertDraft` the way `zernio` is kept (`if (prev?.live && !entry.live)`), or the next edit in Write unlinks the post.
- `content-studio-realnumbers-<scoped(userId)>` changes from "1" to JSON `{ on: true, at: ISO | null, notMine: string[] (300 kept), pausedUntil?: ISO }`. `realNumbersOn` still treats a stored "1" as on.
- No table, no migration, no schema change.

### AI and cost

- Jev, through a new `writing-judge` mode `same-post`, body `{ mode: "same-post", pairs: [{ key, draft: string (600 chars), live: string (300 chars, all `MetricsPost.text` holds), platform }] }` (1 to 10 pairs). The server answers 404 unless `leoOnly(user.email)` passes (`supabase/functions/_shared/leoOnly.ts`, from `plan-goal`), checked after sign-in and before `consumeUsage`. The mode is left out of the whole-request 422 English check, and a null from Jev gives the use back with `refundUsage`. Matching runs on its own with no button, so there is no price chip.
- One noul per pair, id = `key`. Instructions: "Is `live` the published version of `draft`, the same post with at most light edits such as added hashtags, a sign-off or a changed line?" True: "Yes: same topic, same points in the same order, mostly the same sentences". False: "No: a different post, even if it covers the same subject".
- Link at 0.7 or more (proposed, `SAME_POST_MIN` in `logic.ts`), and only when one pair per live post clears it. Text that is not mostly English skips Jev. Null means no link.
- New cap in `usageCaps.ts`: `"post-match": 20` a day per user. A full call is about 4,000 input tokens, under US$0.0002.
- Each refresh makes 1 to 5 `social` `metrics` calls plus 1 `followers` call under the existing `social-read` cap of 300 a day, and the 6-hour rule allows at most 4 automatic refreshes a day. Zernio bills a flat plan with no per-read price (unverified), and nothing in this item calls an LLM.

### Deep links

- `/analytics#real-numbers` scrolls to the Your real numbers card (add `id="real-numbers"` and `scroll-mt-20`); `learn-pace` links here. `AnalyticsPage` needs `useScrollToHash(userId !== null)`; whichever of `learn-format-winners`, `learn-attribution` and this item ships first adds it.
- `/analytics?link=<postId>#real-numbers` opens the picker for that outside post (push; closing removes it). Add `link` to `links.analytics`.
- `/drafts?status=posted` lists posted drafts with their numbers (existing param).
- Add the anchor and `link` to the `/analytics` rows in `docs/deep-links.md`.

## Done when

- [ ] On Leo's sign-in, opening Home pulls real numbers when the last pull is over 6 hours old, and a second open within 6 hours does not.
- [ ] Leaving Home mid-pull still finishes the pull (the job runs outside React).
- [ ] A posted draft with real numbers shows the read-only line in My posts; "Type my own" shows the inputs with the typed numbers kept.
- [ ] A hand-posted draft whose live text overlaps at 0.75 links on the next pull with no Jev call; one at 0.5 goes to Jev and links when Jev answers 0.8.
- [ ] "Link to a post" and "Unlink" work, and an unlinked post is never linked again by the matcher.
- [ ] The Monday email and every Analytics card count linked drafts' numbers.
- [ ] 402, 429 and failed pulls show their chip text and keep the last numbers.
- [ ] Editing a linked draft in Write keeps its link and numbers.
- [ ] `/analytics?link=<postId>#real-numbers` on a cold load pulls, then opens the picker for that post.
- [ ] Other sign-ins see no change and no new calls: Analytics still pulls on every visit for them.
- [ ] Checked by eye at 390 px and 1440 px.
- [ ] `src/data/northStar.ts` item flipped (status and `ours`) in the same commit, and this spec's status line ticked.

## Tests

- `src/lib/realNumbers.test.ts`: `matchPulled` matches by `zernio.postId` then `live.postId`. `matchByHand` keeps the 3-day window and same platform, cuts the draft to the live text's length (a 1,500-character draft whose first 300 characters match links), auto-links only a single candidate at 0.7 or more, sends 0.3 to 0.7 candidates to Jev, skips `notMine` and drafts already linked. `shouldRefresh` honours 6 hours, `force` and `pausedUntil`. A stored "1" still reads as on.
- `src/lib/draftHistory.test.ts`: `setDraftNumbers` writes to `live.numbers` for a hand-linked draft; `upsertDraft` keeps `live` through an edit; duplicating a draft drops `live`.
- `src/lib/analytics.test.ts`: `withReal` uses `live.numbers` when there is no `zernio.numbers`.
- `supabase/functions/notify/logic.test.ts`: a draft with `live.numbers` counts in `weekReport`.
- `supabase/functions/writing-judge/logic.test.ts` and `index.test.ts`: `same-post` builds one noul per pair, links only a single pair at 0.7 or more, answers 404 for a non-Leo email before any counter moves, consumes `post-match`, and gives it back when Jev returns null.

## Open questions

- Turning Social accounts on for everyone is Leo's call; the Zernio team cap (`ZERNIO_MAX_ACCOUNTS`) sets how many advisers can connect.
- Outside posts are matched by `MetricsPost.id`, which has not been checked against a live Zernio key. If ids change between pulls, a hand link drops on the next pull; the first two pulls on Leo's account settle it.
- Server gate: this spec uses `_shared/leoOnly.ts` (`plan-goal`); `find-competitors` picks a `NORTH_STAR_USERS` uid secret. Use whichever ships first.
- 0.7 overlap and 0.7 Jev are starting numbers. Run the matcher on Leo's last 3 months, read every link and miss, then set them.
- Per-post history (views on day 1, day 2) would give the velocity ShortsIntel ranks by, at the price of more storage per post, and `learn-post-grade` is the item that should decide whether it is worth it.
- Retention and skip rate (what Edits shows) do not appear in Zernio's analytics fields we read today (unverified for the current API).

## Related

publish-accounts, publish-schedule, learn-pace, learn-post-grade, learn-format-winners, remix-own-winners, learn-attribution
