# Why each post did well or badly

`learn-post-grade` | learn | phase 7 | status: partial | /north-star#learn-post-grade

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane's homepage says its learning loop reads thumbstop rate, ROAS, hold rate and CPA against the account's own averages, saves winners to memory and makes variations by itself ("Winner found. 6 variations made.") ([usefastlane.ai](https://usefastlane.ai)). Leo's recording never opens Analytics, which carries a "Growth" plan tag, so no frame shows a graded post and the look of it is unverified.

Others:
- Atria's Radar grades each ad on a connected account with a letter (A, B-, C+) in plain English, flags the weak ones and names one fix, such as "open with the pain point" or "rewrite a statement hook as a question". An "Iterate" button then makes new scripts or images from that fix. Radar is on every plan; the metrics behind the grade are unverified ([blog](https://www.tryatria.com/blog/how-to-automatically-score-and-fix-underperforming-ads), [pricing](https://www.tryatria.com/pricing)).
- MagicBrief's Wizard Scores rate your own ads 1 to 100 on Hook (first 1 to 3 s), Hold (4 s to the end), Click and Buy, in bands: above 70 green, 50 to 70 yellow, under 50 red. An ad needs more than US$50 spend to be scored ([help](https://support.magicbrief.com/articles/1258182346-understanding-wizard-scores)).
- Motion shows four play-rate marks per video (25, 50, 75 and 100%) and reads them in plain words: a big drop between two marks means the message is buried, and a strong 75% with a weak 100% means the call to action should come earlier ([help](https://help.motionapp.com/en/articles/8757784-understand-video-drop-off)).
- Foreplay Scores give five 0 to 100 percentiles per ad, per dollar spent, against your own ads on the same Lens brand, among them a Hook Score from the 3-second hook rate and a Watch Score from ThruPlay ([help](https://help.foreplay.co/articles/3072575-foreplay-scores)).
- Exolyt's Content Score compares a video with the account's other videos and counts the followers it brought ([video performance](https://exolyt.com/features/video-performance)).
- Instagram's Edits app shows skip rate, share rate and a retention graph of where viewers drop off, free, for Instagram accounts ([review](https://posteverywhere.ai/blog/what-is-instagram-edits)).

## What we have today

- Analytics "Top posts" (`src/pages/AnalyticsPage.tsx`, around line 1037) ranks posted drafts with numbers by 8 measures and lists the top 5 only (`rankPosts(..., 5, ...)`), with engagement rate, reach past followers and comments per like. Each row is one `<Link>` that opens the post in Write, as are the Best and Weakest rows of the This week card. There is no comparison with your usual and no reason.
- The account audit (`src/components/AccountAudit.tsx`, `computeAudit` in `supabase/functions/_shared/socialAudit.ts`) rates your last 30 scraped Instagram or TikTok posts against your own median (`ratio`, "{ratio}x your usual"): on views when a post has them, else on likes, comments, shares and saves. It skips posts under 48 hours old (`YOUNG_POST_HOURS`) and writes double down, fix and stop advice with an LLM. It works on scraped posts, never on the drafts in My posts.
- `post-score` (Jev, cap 40) predicts engagement out of 10 before posting. Nothing looks back after posting.
- Real numbers from Zernio (`supabase/functions/social/metrics.ts`) carry impressions, reach, views, likes, comments, shares and saves. They carry no watch time or retention, so hook and hold cannot be read today. `realMetrics` maps them to the app's four numbers and drops saves, which stay only in the draft's `zernio.numbers`.
- Engagements in the app are reactions, comments and shares (`engagement` in `src/lib/draftHistory.ts`).
- `writing-judge` already sends some modes to their own cap (`profile` to `profile-score`, `facts` to `fact-check`), which is the pattern for a `grade` mode.
- `getTrackedPosts` and `withReal` in `src/lib/analytics.ts` already merge typed and real numbers per draft.

Status partial: scraped posts get a "your usual" ratio in the audit; posts made in the app get no grade, reason or fix.

## Build

### Screens and states

1. The grade, measured. New `src/lib/postGrade.ts` with `gradePost(post, tracked, now)`. The usual is the median engagements of the other posts on the same network that went out in the last 90 days, have numbers and are at least 48 hours old; with fewer than 5 such posts, or a usual of 0, there is no grade. `ratio = engagements / usual`. The band comes from the unrounded ratio, each lower edge inclusive; the chip shows it rounded to 1 decimal. Bands:

   | Ratio | Band | Chip tone |
   |---|---|---|
   | 2 or more | Well above your usual | primary |
   | 1.25 up to 2 | Above your usual | primary, outline |
   | 0.8 up to 1.25 | About your usual | muted |
   | 0.5 up to 0.8 | Below your usual | warning |
   | under 0.5 | Well below your usual | destructive, outline |

   When this post and at least 5 others have impressions, the panel also shows the impressions ratio.

2. The chip. On Leo's sign-ins, each Top posts row and each Best and Weakest row of the This week card gets a small chip, "{ratio}x your usual", left of the number. A button cannot sit inside the row's `<Link>`, so the row becomes a `div` holding the Link (text and number, still opening the post) and the chip button as siblings, as `remix-own-winners` describes for the same rows. The chip toggles `?grade=<draftId>`. AnalyticsPage keeps `data.user?.email` from its `getUser()` call for the `leoOnly` check. The grade panel opens inline under that row:

   ```
   Well above your usual                                   x
   2.4x your usual engagement on LinkedIn
   412 engagements; your usual is 170 (median of 18 LinkedIn posts)
   3.1x your usual impressions
   Why: the opening line (i)
   Your opening line did the work. Use the same kind of opening next time.
   [ Remix this ]   Open the post
   ```

3. The reason. Above or below the usual (not "About your usual"), the panel asks `writing-judge` mode `grade` once (below) and caches the answer. The fix line comes from a table by reason and direction, with the user's own best post on that network filled in, so no LLM writes it.

   | Reason | Above the usual | Below the usual |
   |---|---|---|
   | hook | "Your opening line did the work. Use the same kind of opening next time." | "The first line didn't stop people. Your best {network} post opened with: \"{best first line}\"." |
   | topic | "This topic lands with your audience. Post on it again from a new angle." | "This topic drew less interest than your usual. Tie it to a question a client asked you." |
   | format | "{Format noun} suit you on {network}. Make the next one a {format noun} too." | "{Format noun} do less well for you on {network}. Your best posts there are {best format noun}." |
   | timing | "It went out at a good time: {weekday}, {time}." | "It went out at a quiet time. Your best {network} posts went out on {best slot}." |
   | ask | "The ending gave people an easy reason to reply. Keep that kind of ending." | "The ending asked for nothing. End with one easy question or a keyword to comment." |

   The best slot is worked out the way Analytics' "Best so far" line is (`bestTime` in `AnalyticsPage.tsx`): `grid = postingTimeGrid(<the network's posts>)`, `rows = grid.hasTimes ? grid.dayparts : grid.days.map((c) => [c])`, `bestCell(rows)`, named with `DAY_LABELS` plus the daypart in lower case ("Tue morning", or "Tue" without times). Move that naming into `src/lib/analytics.ts` as `bestSlotLabel(posts)` so the page and the panel share it. `postingTimeGrid` only places posts with impressions, so `{best slot}` can be missing. The above-usual timing line names the post's own day, and its time only when the post has one.

   The panel only offers Jev a reason whose line it can fill: `timing` needs a best slot, `format` needs posts in at least 2 formats on that network, and `hook` below the usual needs a best post with a first line. The criteria sent to Jev are the ones left.

4. The buttons.
   - Above the usual: "Remix this" opens Write through `ownRemixUrl(draft, standing)` in `src/lib/winners.ts`. That builder belongs to `remix-own-winners`; if it has not shipped, add it as that spec describes and use it here.
   - Below the usual: "Try a new version" opens Write with the draft's pillar, detail, format and platform, `source=own:<draftId>` (Write ignores it until `remix-source-trail` ships), `formula=<best post's hookFormula>` when the reason is `hook`, `format=<best format>` when it is `format`, and this `ctx`:

     ```
     This post of mine got {ratio}x my usual engagement on {network}. The likely reason: {reason name}.
     Write a new version that fixes that: {fix line}. Keep the topic, don't reuse the original wording,
     and keep it compliant for a licensed Singapore financial adviser: no promised returns, no named
     insurer products, no invented numbers. Original: "{first 300 characters}"
     ```

   - On every panel, "Open the post" opens `/generate?draft=<id>`.

5. Hook and hold, only where the platform gives them. Zernio's analytics carry no watch time today. Add this step only after a live Zernio response shows a watch-time or completion field for a video (see Open questions). Then the panel adds "Watched past 3 s: {n}%" and "Watched to the end: {n}%", and Motion's two rules become extra reasons: a big drop between marks is `hook` or buried message, and a strong middle with a weak end points to `ask`.

States:
- Loading the reason: the grade lines draw at once; "Reading why..." sits in the reason line until Jev answers.
- Reason found: the "Why" line and its fix.
- Jev null, below 0.4, or the call failed: "No single reason stands out. Compare it with your best {network} post." with a link to that post.
- About your usual: no Jev call; the panel shows the numbers and "Open the post".
- Not enough posts: the chip reads "Not graded"; the panel says "Not enough {network} posts with numbers to compare yet: 5 needed, you have {n}." with "Add numbers" (`/analytics#add-numbers`).
- Under 48 hours old: "Still collecting numbers. Check back on {day}."
- Over the daily cap (429): the grade shows; the reason line says "Reasons are used up for today. They come back at 8am."
- Post mostly not in English (`writing-judge` answers 422 `not_english` before any cap is used): no reason line; the panel shows the numbers and the buttons. Cache `reason: null, p: null` for that draft so the next view does not ask again.
- No `TYPESAFE_API_KEY` on the deployment (503): same as Jev null.
- Other sign-ins: no chip, and `?grade=` is ignored.

### Copy

- Chip: "{ratio}x your usual"; ungraded: "Not graded"
- Band headings as in the table
- Lines: "{ratio}x your usual engagement on {network}", "{n} engagements; your usual is {usual} (median of {k} {network} posts)", "{ratio}x your usual impressions"
- Reason names: "the opening line", "the topic", "the format", "when it went out", "the ending"
- InfoTip on "Why": "Jev's best guess from the post and your other posts."
- Buttons: "Remix this", "Try a new version", "Open the post", "Add numbers"
- Waiting and fallback lines exactly as in the states above

### Data

- `content-studio-postgrades-<scoped uid>`, synced: `Record<draftId, { band: Band; reason: "hook" | "topic" | "format" | "timing" | "ask" | null; p: number | null; at: string }>`. A reason is asked again only when the band changes. Keep the newest 200 entries.
- The grade itself is never stored; it is recomputed from the numbers on each view.
- No schema change.

### AI and cost

- `writing-judge` gains mode `grade` `{ text, platform, format, posted, words, ratio, direction: "above" | "below", best: { firstLine, format, posted }[] }` returning `{ reason, p }`. Question and threshold go in `writing-judge/logic.ts`, the route in `index.ts`.
- One Jev choice. Instructions: "This post by a Singapore financial adviser got {ratio}x their usual engagement on {platform}. Which ONE thing most likely explains why it did {better|worse} than usual? `best` are their best recent posts on the same network." Criteria:
  - hook: "The opening line: how strongly the first line makes someone stop, compared with the openings of their best posts."
  - topic: "The subject: how much this topic matters to their audience compared with their usual topics."
  - format: "The format or length: whether a post of this kind and length suits this network."
  - timing: "When it went out: the day and time compared with when their best posts went out."
  - ask: "The ending: whether it gave readers a clear, easy reason to comment, save or message."
- Show the reason at p 0.4 or more (proposed; a 5-way random pick sits at 0.2). Before turning it on for anyone else, run it on Leo's last 30 posted drafts, read every reason, and set the threshold from that run.
- Mode `grade` answers 403 `{ code: "not_allowed" }` unless `isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)` (helper in `supabase/functions/market/logic.ts`; the secret holds Leo's two uids and is new, so set it if `find-competitors` has not). A typed URL or a direct call from another account gets nothing.
- New cap in `usageCaps.ts`: `"post-grade": 30`, consumed by mode `grade` instead of `writing-judge` (the ternary on `consumeUsage` in `writing-judge/index.ts` gains it, as `profile` and `facts` already have). `text` is clipped to 1,500 characters and `best` to 3 posts, so a call is under 800 input tokens, under US$0.00004 at US$0.042 per million.

### Deep links

- `/analytics?grade=<draftId>` opens that post's panel under its Top posts row (push; Back closes it). When the post is not in the current Top posts list, the panel opens at the top of the section with the post's hook as its title.
- Add `grade` to the `/analytics` rows in `docs/deep-links.md` and to `links.analytics` in `src/lib/links.ts`.

## Done when

- [ ] With 6 seeded LinkedIn posts with numbers, posted 3 to 60 days ago, the 5 Top posts rows each show a chip, `?grade=<id of the sixth>` opens its panel at the top of the section, and the ratios match a hand count of the medians.
- [ ] A post at 2.4x shows "Well above your usual", a reason and "Remix this"; a post at 0.4x shows "Try a new version", which opens Write with the fix in the brief.
- [ ] A post at 1.0x makes no Jev call.
- [ ] The 31st reason in a day gets 429 and the panel says reasons are used up.
- [ ] Changing a post's numbers enough to change its band asks for a new reason; a small change does not.
- [ ] `/analytics?grade=<id>` opens the panel from a fresh tab, and Back closes it.
- [ ] Other sign-ins see no chip and make no calls.
- [ ] Checked by eye at 390 px and 1440 px.
- [ ] `src/data/northStar.ts` item flipped (status and `ours`) in the same commit, and this spec's status line ticked.

## Tests

- `src/lib/postGrade.test.ts`: the usual is the median of the same network's other posts in 90 days; posts under 48 hours and the post itself are left out; fewer than 5, or a usual of 0, means no grade; each band edge (0.5, 0.8, 1.25, 2) lands in the higher band, and 1.249 is "About your usual" though its chip reads 1.2x.
- Same file: `fixLine(reason, direction, ctx)` fills every placeholder and never returns a line with a leftover brace; `offeredReasons(post, posts)` drops `timing` with no best slot, `format` when the network has one format, and `hook` below the usual with no best first line.
- `src/lib/analyticsBest.test.ts`: `bestSlotLabel` gives the same words as the page's "Best so far" line for the existing fixtures.
- Same file: the "Try a new version" URL carries `source=own:<id>`, the MAS line, and `formula` or `format` only for those reasons, and stays under 1,800 characters.
- `supabase/functions/writing-judge/logic.test.ts`: the `grade` question names better or worse by direction, has the 5 criteria, returns null under 0.4 and for a missing answer.
- `supabase/functions/writing-judge/index.ts` route check (or its logic helper): mode `grade` from a uid outside `NORTH_STAR_USERS` gets 403 and consumes no cap.
- `supabase/functions/_shared/usageCaps.test.ts`: `post-grade` is 30.

## Open questions

- Retention: Instagram's API reports average watch time for Reels and TikTok reports completion rate (unverified through Zernio). Leo or the builder reads one live Zernio analytics response for a video before step 5 is built.
- Followers gained per post, as Exolyt counts it, needs per-post follower data that Zernio does not give today.
- This build grades on engagements (reactions, comments and shares). Leo may prefer saves and shares because they say more about intent; saves exist only on posts that went out through Zernio (`zernio.numbers.saves`), so typed posts would have shares alone. Leo decides.

## Related

learn-weekly-report, learn-real-numbers, learn-format-winners, remix-own-winners, remix-source-trail, edit-score, remix-everywhere
