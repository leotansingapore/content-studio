# Every post in a batch looks different from the rest

`plan-distinct-batch` | plan | phase 5 | status: partial | /north-star#plan-distinct-batch

## Leo asked

No direct ask. From the Senna research Leo asked SearchBlueprint's Atlas session to share on 27 Oct 2026 (`~/Documents/seo-audit-tool/docs/north-star/research/senna.md`, S12).

## How the best do it

Fastlane's "Claude for Ads" launch video at 1:23 (`claude-for-ads-1m23-andromeda-update.jpg`, kept out of the repo): under "For lap 2, let's run 6 remixes of this winner." Senna adds "And dw, I know about the Andromeda update. They're all visually distinct", over seven cuts of one car-selfie ad with a different person, outfit and car in each. Andromeda is Meta's ad retrieval system, which advertisers read as rewarding varied creative (SearchBlueprint's gloss in senna.md, not Fastlane's words). On Product Hunt, asked how Senna stops ads looking the same after a while, Fastlane's founder answered "it's completely tailored to your product! so all ads are unique".

For an adviser posting organically the risk is the same one at a smaller scale: a 28-post campaign whose slideshows open on the same line, or sit on the same stock picture, reads as one post repeated, and a follower scrolling the grid sees it at once.

Others:

- FastMoss offers Customizable Script Similarity, from close to the viral original to differentiated storytelling (remix-closeness).

## What we have today

Checked against ns/phase7 at 8664c00d on 27 Oct.

- Each remix passes a copy check against its own source after it is written, looking for runs of shared words plus every figure in the original (`supabase/functions/remix/overlap.ts`, remix-closeness); it compares a post with its source and never one post with another.
- A plan rotates hook formulas (`nextFormulaStart`) and skips themes posted lately (`recentThemes`), both in `src/lib/contentPlan.ts` and passed to campaigns through `planOptionsFor`.
- Suggested angles are checked in pairs and against used titles before a campaign is written (plan-angles).
- writing-judge already has a `same-post` mode that asks Jev whether two texts are one post (1 to 10 pairs, cap post-match), used to match hand-posted drafts (`supabase/functions/writing-judge/index.ts`).
- Missing: nothing compares a campaign's written posts with each other, and nothing notices two slideshows built on the same stock picture.

## Build

Gate: `leoOnly` on the campaign page, as today; `NORTH_STAR_USERS` on the server.

### Screens and states

When a campaign's writing finishes, one check runs before the review opens.

```
28 posts, 28 different openings                       [Checked 2 min ago]
Post 9   Too close to post 4: same opening line            [Swap]
Post 15  Same picture as post 3                            [Change picture]
```

- Checking: the review header reads "Checking the posts are all different..." and the queue stays usable.
- Clean: the header reads "28 posts, 28 different openings".
- Flags: each flagged post gets a line under its angle in the queue and in the grid, with Swap (rewrite this post, today's campaign-swap) or, for a picture, Change picture, which opens the slideshow editor where Swap picture already lives (`src/components/slideshow/SlideInspector.tsx`). The other post of the pair is left alone.
- After a Swap the pair is checked again on its own.
- Check unavailable (Jev down or over the cap): the header says nothing about difference, and no post is flagged.

### Copy

- "Checking the posts are all different...", "{n} posts, {n} different openings"
- "Too close to post {m}: same opening line", "Too close to post {m}: same idea", "Same picture as post {m}"
- Buttons "Swap" (as today) and "Change picture".

### Data

- Each `CampaignPost` gains an optional `closeTo?: { n: number; why: "opening" | "idea" | "picture" }`, stored in the campaign as today. Cleared when either post of the pair changes.
- No schema change.

### AI and cost

- Pictures: code only, and only once slideshows are made, since a campaign slideshow has no pictures until its Make. When one is made, its slides' `pictureKey` (`src/lib/slideshowDraw.ts:58`, the saved image or the Pexels URL) is compared with the campaign's other made slideshows, and a shared key flags both.
- Words: a new writing-judge mode `too-close`, shaped like `same-post`. Code first pairs each post with the 3 posts whose hooks share the most words (so 28 posts make at most 42 pairs, sent in batches of 10). Jev then answers one noul per pair: "Would a follower scrolling past both posts take them for the same post: the same opening, the same idea, or the same list?" Flag at 0.75, a first guess to set from a shadow run over Leo's three dogfood campaigns before it ships.
- New cap `batch-check`, 10 a day, under US$0.01 a campaign.

### Deep links

- `/campaigns/<id>?post=<n>` already opens a post; a flagged post's line links to its pair the same way.

## Done when

- [ ] On Leo's sign-in a written campaign shows "{n} posts, {n} different openings" or names each close pair with Swap.
- [ ] Two slideshows on one stock picture are flagged without a model call.
- [ ] Swap clears the flag once the new post passes, and a clean campaign shows no lines.
- [ ] With Jev down the campaign behaves exactly as it does today.
- [ ] `npm run build`, the full `npx vitest run`, and a look at 390 px and 1440 px pass.
- [ ] The item in `src/data/northStar.ts` flipped with its `ours` line in the same commit.

## Tests

- `src/lib/campaigns.test.ts`: the pairing picks the 3 nearest hooks per post and never more than 42 pairs for 28 posts; the picture check flags a shared id and ignores different ones; a change to either post clears `closeTo`.
- `supabase/functions/writing-judge/logic.test.ts`: `too-close` refuses more than 10 pairs and reads 0.75 as the flag line.
- Break each case once to prove it bites.

## Open questions

- When two posts are too close, rewrite one automatically or flag it and wait for Swap? This spec waits for Swap, which keeps the change visible and costs nothing until pressed. Leo decides.
- Should the same check run over a Blitz deck (plan-blitz) and over the last 30 days of posted posts, so a new campaign does not repeat last month's?

## Related

plan-review-queue, plan-campaign, plan-angles, remix-closeness, remix-variations, plan-blitz, plan-proven-mix
