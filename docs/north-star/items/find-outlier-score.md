# Outlier score: what beat its own normal

`find-outlier-score` | find | phase 2 | status: partial | /north-star#find-outlier-score

## Leo asked

19 Oct 2026: "find ways where one can key in their competitors and the app will scrape their ads and top performing social media posts"

The outlier score is how this app decides what "top performing" means: a post judged against its own account's usual numbers, not against raw views.

## How the best do it

Fastlane has no outlier score; its trending cards show raw views and likes ("357.5K views", "6.4K likes").

- ShortsIntel publishes the fullest rule: the multiple of the creator's median views over the last 20 videos by posted time, with videos under 48 hours old and the scored video left out of that median. Confidence is high with 5 or more usable videos; below that it falls back to a follower-size benchmark, and the baseline goes stale after 7 days ([source](https://www.shortsintel.com/docs/concepts/scores)).
- Sandcastles: views against the channel's median views over the 90 days before the post went up; "3x means three times the usual views". It is a filter (min, max) and a sort. [Source](https://help.sandcastles.ai/videos).
- Virlo labels each checked video from views divided by the creator's median: `mega_viral` at 10 or more, `viral` 3 to under 10, `above_average` 1.5 to under 3, `average` under 1.5, and no score when no baseline exists. To rank across account sizes it sorts by `ln(outlier_score) x ln(median_views)`, so one lucky video on a tiny account does not top the list ([video outlier](https://dev.virlo.ai/docs/satellite/video-outlier), [hooks](https://dev.virlo.ai/docs/hooks)).
- Vamos shows the score only once a creator has 10 posts, as a badge above views and age, a sort, and an average per format. [Source](https://intercom.help/getvamos/en/articles/16934858-the-outlier-score).
- 1of10 sells research on videos 10x to 100x above their channel's typical views and keeps research free of credits. [Source](https://1of10.com/blog/1of10-review/).
- Shortimize flags Reels at 5x the account's usual views. [Source](https://www.shortimize.com/blog/how-to-benchmark-your-reels-against-competitors).

## What we have today

Four separate rules, each in its own file:

- `supabase/functions/_shared/socialAudit.ts` `computeAudit`: your own posts against your own median, posts under 48 hours (`YOUNG_POST_HOURS`) not judged, views where they exist and likes + comments + shares + saves otherwise, `BREAKOUT_RATIO` 1.5, `WEAK_RATIO` 0.5. The median includes the scored post and every settled post read (up to 30), and falls back to all posts, young ones too, when fewer than 3 are settled. `median` is exported from the same file. Shown in `src/components/AccountAudit.tsx` as the ratio, a Unicode multiplication sign from its `times` helper and "your usual", or "too new to judge".
- `src/lib/postInsights.ts` `outperformance`: engagement against each creator's average (mean, not median, from `buildCreatorAverages`) inside the static `/swipe` drop, which holds 136 posts from 47 creators, about 3 each. A creator with no average scores 1. `BREAKOUT_RATIO` 1.8. Shown on `ReelCard` and `PostDetailDrawer` as a flame and "2.3x" (`ratio.toFixed(1)`).
- `src/lib/market.ts` `outperformers`: likes + comments against the account's average, 1.5 times or more, accounts with 4 or more posts (Leo only).
- `scripts/trend-scout.mjs`: reel views against the creator's median of every reel fetched, at least 1.5x and 5,000 views, for the static trends drop.
- Following's "Top post" chip uses raw views (likes plus comments where views are hidden), so Following has a fifth answer of its own.

Status partial: the idea exists in four places with four different rules, and none of them has a confidence flag or a way to rank posts across accounts of different sizes.

## Build

One pure module that every feed calls, plus one badge component. No server call, no cost.

### Screens and states

The badge sits on every post card that has numbers (competitor posts, the niche feed, and later Following, `/swipe` and Analytics):

```
[flame] 14x their usual      tier mega (10 and over)
[flame] 3.2x their usual     tier viral (3 to under 10)
1.6x their usual             tier above (1.5 to under 3)
About their usual            tier usual (0.5 to under 1.5)
Below their usual            tier below (under 0.5)
Too new to judge             posted under 48 hours ago
Not enough posts to judge    fewer than 3 comparable settled posts
```

With 3 or 4 comparable posts the badge adds "(few posts)" and the sort ranks it below scored posts of the same tier. On your own posts the word is "your" instead of "their". An InfoTip beside the "Outlier score" sort label reads "This post's views against the account's median of its last 20 posts."

### Copy

- "{x}x their usual", "{x}x your usual" (one decimal under 10, whole number from 10, ASCII "x")
- "About their usual", "Below their usual", "Too new to judge", "Not enough posts to judge", "(few posts)"
- Sort option "Outlier score"
- InfoTip "This post's views against the account's median of its last 20 posts."

### Data

New file `supabase/functions/_shared/outlier.ts`, whose only import is `median` from `./socialAudit.ts` (pure, no Deno APIs), so Deno functions and the Vite app both use it. The app imports it by relative path, as `src/components/ProfileScore.tsx` imports `_shared/usageCaps.ts`:

```ts
export const OUTLIER = { youngHours: 48, baselinePosts: 20, minPosts: 3, confidentPosts: 5,
  tiers: { mega: 10, viral: 3, above: 1.5, below: 0.5 } } as const;
export type OutlierTier = "mega" | "viral" | "above" | "usual" | "below";
export interface OutlierPost { id: string; postedAt: string | null; views: number | null;
  likes: number; comments: number; shares?: number | null; saves?: number | null }
export interface Outlier { ratio: number | null; tier: OutlierTier | null; basis: "views" | "interactions" | null;
  baseline: number | null; posts: number; confidence: "high" | "low" | null;
  reason: "young" | "few-posts" | "no-numbers" | null; rank: number }
export function scoreAccount(posts: OutlierPost[], now: number): Record<string, Outlier>;
export function tierOf(ratio: number): OutlierTier;
export function rankOf(ratio: number | null, baseline: number | null): number;
export const times = (ratio: number): string => `${ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10}x`;
```

The rule, for each post of one account:

1. Basis: views when the post has views; likes + comments + shares + saves when it has none (Instagram photos and carousels). The baseline uses only posts on the same basis. Following and competitor posts are stored as `TrackedPost`, which has no shares or saves, so for them the second basis is likes + comments; the audit's `SocialPost` has both.
2. Baseline: the median of the 20 most recent settled posts (posted 48 hours or more before `now`) on that basis, without the scored post itself.
3. A post under 48 hours old gets `ratio: null, reason: "young"`.
4. Fewer than 3 baseline posts: `reason: "few-posts"`. 3 or 4: scored, `confidence: "low"`. 5 or more: `"high"`.
5. A baseline of 0: `reason: "no-numbers"`.
6. `rank = ln(ratio) x ln(max(baseline, 10))` when the ratio is above 1, else 0, which is Virlo's weighting (it scores 0 below the median). A 3x on an account that usually gets 50,000 views (about 11.9) ranks above a 5x on one that gets 200 (about 8.5); ties go to the higher ratio, then the newer post. Null ratios rank last; low confidence ranks after high within a tier.

The badge is `src/components/OutlierBadge.tsx` (props `outlier`, `whose: "their" | "your"`), using `InfoTip` from `src/components/ui/info-tip.tsx` and design tokens (`bg-success/10 text-success` for mega, viral and above, muted for the rest), like `AccountAudit` does now.

Nothing is stored. Scores are computed when a feed renders from the posts already stored. No schema change.

### AI and cost

None. The ratio is arithmetic on public numbers, not a judgment, so it does not go through Jev. No cap, no provider cost.

### Deep links

`/competitors?view=posts` has a `sort` param whose default is the outlier order, so it stays out of links; `sort=views` and `sort=newest` are the others (`find-competitor-posts`). `/swipe?tab=foryou` has no sort control: it always orders by match, then `rank` (`find-niche-feed`). This item adds no URL params of its own.

## Done when

- [ ] `supabase/functions/_shared/outlier.ts` and `src/components/OutlierBadge.tsx` exist with tests.
- [ ] `/competitors?view=posts` (`find-competitor-posts`) and `/swipe?tab=foryou` (`find-niche-feed`) badge and sort with it.
- [ ] `outperformers` in `src/lib/market.ts` (Leo only) uses it: posts with tier `above` or higher, sorted by `rank`.
- [ ] Following, `/swipe` posts, Analytics and `trend-scout.mjs` are unchanged until Leo turns the shared rule on for everyone (below).
- [ ] All badge text is ASCII.
- [ ] Build and full vitest pass; the north-star item flipped with its `ours` line.

## Tests

`supabase/functions/_shared/outlier.test.ts`:

- median on odd and even counts.
- The scored post is not in its own baseline (one huge post scored against nine small ones gives a large ratio, not about 1).
- A 47-hour-old post is `young` and is not in anyone's baseline; a 49-hour-old one is.
- Posts without views compare against interactions only.
- 2 baseline posts give `few-posts`; 3 and 4 give `low`; 5 gives `high`.
- Only the 20 most recent settled posts count (a 21st, older outlier does not move the median).
- A zero baseline gives `no-numbers`, never Infinity or NaN.
- Tier edges: 0.49 below, 0.5 usual, 1.5 above, 3 viral, 10 mega.
- `rankOf`: 3x at baseline 50,000 beats 5x at baseline 200; a 0.8x ratio gives 0, never a negative rank; null ranks last.
- `times`: 3.24 gives "3.2x", 14.6 gives "15x".
- Prove each case bites: flip `youngHours` to 24 locally and the young test must fail.

## Open questions

- Turning the shared rule on for everyone means Analytics, `/swipe` and Following show different numbers from today (the median now leaves out the scored post, and `/swipe` moves from a mean to a median with a 3-post minimum). That is Leo's call, in his words.
- The `/swipe` drop keeps 3 posts per creator (`KEEP = 3` in `scripts/build-top-posts.mjs`) out of 6 read (`RESULTS_PER_PROFILE = 6` in `scripts/refresh-top-posts.mjs`), too few for this rule. Reading and keeping 23 per creator (20 settled plus a few young) multiplies that weekly Apify read by about 4, so Leo decides whether it is worth it.
- Views per hour for posts under 48 hours (ShortsIntel's velocity) would catch a breakout early. Left out until a feed needs it.
- Paid boosts inflate views (Exolyt flags promoted posts). Public scrapes do not say which posts were boosted, so this rule cannot tell.

## Related

find-competitor-posts, find-niche-feed, find-creators, find-viral-search, find-alerts-digest, learn-format-winners, remix-own-winners
