# Their best organic posts

`find-competitor-posts` | find | phase 2 | status: partial | /north-star#find-competitor-posts

## Leo asked

19 Oct 2026: "find ways where one can key in their competitors and the app will scrape their ads and top performing social media posts"

This item is the "top performing social media posts" half. The list of competitors comes from `find-competitors`; "top performing" is measured by `find-outlier-score`.

## How the best do it

Leo's recording shows no feed of competitors' organic posts in Fastlane. Its competitor views are ads only, and its "Remix trending posts" section is a niche feed, covered in `find-niche-feed`.

- Hootsuite's competitive analysis ranks competitors' top posts by "likes, comments, replies, engagement, and more" and tracks the hashtags in them. [Source](https://www.hootsuite.com/platform/competitive-analysis).
- Sandcastles' Videos tab filters a watchlist by channel, keywords, outlier score min and max (3 means three times the channel's usual views), views, engagement % ((likes + comments) / views), posted in the last N days and platform (YouTube Shorts, TikTok, Instagram). Sorts: Newest (default), Oldest, Outlier score, Views, Engagement rate. Watchlists hold 50 to 250 channels and refresh every 12 h on Pro, every 6 h on Visionary and hourly on Titan ([filters](https://help.sandcastles.ai/videos-filter-settings), [plans](https://help.sandcastles.ai/plans)).
- Revid.ai's channel watcher syncs tracked TikTok and YouTube channels daily to find outlier videos to remix: 5 channels on Growth, 50 on Ultra. [Source](https://revid.ai/pricing).
- Shortimize tracks any public account from a handle or a Reel link and pulls its history; unlimited accounts, with stored videos capped at 1,000 (Launch) or 5,000 (Scale). [Source](https://www.shortimize.com/pricing).
- Metricool shows a competitor's recent posts in one place to study style, frequency and topics; sorting by engagement is not described (unverified). [Source](https://metricool.com/competitor-analysis/).
- Panoramata puts competitors' campaigns on a calendar by date, type and channel, with a monthly summary of frequency and themes. [Source](https://www.panoramata.co/feature/content-calendar).

## What we have today

- `/following` (`src/pages/FollowingPage.tsx`, `src/lib/following.ts`, edge fn `track-accounts`, cap `track-accounts` 10 a day): up to 5 public Instagram or TikTok accounts per brand. Each check (Apify, `scrapeAccount` in `supabase/functions/_shared/auditRunner.ts`) keeps a follower snapshot and the 12 newest posts (`POSTS_PER_CHECK`), marks posts new since the last check, and shows followers, growth over 30 days, posts a week (`followStats`) and a "Top post" chip on the post with the most views (likes plus comments where views are hidden). Each post has "Remix" (video to `/clone`, else Write with the caption as a "do not copy" brief) and "Open". `track-accounts` does not give the use back when a check fails.
- `/market` (Leo only) lifts Following posts with 1.5 times their account's average likes plus comments (`outperformers` in `src/lib/market.ts`) and asks Jev whether to act on each.
- `TrackedPost` keeps views, likes and comments only, no shares or saves, so on Following's data an Instagram photo or carousel is judged on likes + comments.
- `followStats` gives growth over the last 30 days of snapshots, posts a week from the dates read, and `best` by raw reach. `applyCheck` replaces the posts each check rather than adding to them, so the stored posts are always the newest read.
- The gate `leoOnly` (`src/lib/leoOnly.ts`) is in the north-star worktree and not on origin/main (checked at f2cb275, 2026-10-20).
- The "Top post" chip uses raw numbers, so a big account's average post beats a small account's breakout. Nothing ranks posts across accounts or ties them to a competitor list, and LinkedIn, YouTube and Facebook pages go unread, which is why the status is partial.

## Build

The "Their posts" view of `/competitors` (`?view=posts`), fed by a new `posts` mode of the `competitors` edge function. Build `find-outlier-score` first: this view sorts by it.

### Screens and states

```
Their posts  212
[ All ] [ Singlife ] [ Josh Tan ] [ Seedly ]       [ Instagram ] [ TikTok ]
Sort: [ Outlier score v ]   (Outlier score, Views, Newest)

Who            Followers   In 21 days   Posts a week   Best lately
Josh Tan (IG)  41.2k       +620         3.5            4.1x their usual
Singlife (TT)  18.0k       +90          1.0            2.3x their usual

+---------+ +---------+ +---------+
| 4.1x their usual   | Too new to judge
| Reel, 12 Oct, Instagram
| caption, two lines...
| 88k views, 2.1k likes, 140 comments
| [Remix] [Open]
We check each account once a week, when you open Competitors.  [Check now] About US$0.10 each
```

States:

- No competitors: "Add a competitor to see their posts here." with a link to Who you watch.
- Competitor with no Instagram or TikTok handle: "Add {name}'s Instagram or TikTok to see their posts." with "Add a handle" (opens `?view=list&edit=<id>`).
- Due: on opening the view, each competitor handle whose last check is 7 or more days old (or never) is checked one at a time as a module-level job in `src/lib/competitorPosts.ts`.
- Checking: "Reading @{handle}, about a minute..." beside that row, shown inside 400 ms; its cards show skeletons.
- Done: the pace table and the post grid.
- Wrong handle or no posts: the `AuditError` message from `scrapeAccount` as it is today ("We couldn't find a public Instagram account called @x. Check the spelling.", or the TikTok one).
- Private account: `scrapeAccount` says "@x is private, so its posts can't be read. Make the account public, then refresh.", which tells the user to change someone else's account. The `posts` mode replaces it with "@{handle} is private, so we can't read its posts." (matched on " is private" in the message), and the row offers "Edit".
- Failed: "Couldn't read that account right now. Try again in a few minutes." The use is refunded; last week's posts stay.
- Over the daily cap: the server's message. Over the global cap: "Account checks are paused for today. They resume at 8am Singapore time."
- Refused (403): "Competitors is not switched on for this account."
- Growth before a second check: "next check" in the growth cell, as Following does.

### Copy

- Heading "Their posts" with a count chip
- Pills: "All", one per competitor, "Instagram", "TikTok"
- Sort label "Sort", options "Outlier score", "Views", "Newest"
- Table headers "Who", "Followers", "In {n} days", "Posts a week", "Best lately"
- Card line "{Reel|Carousel|Photo|Video}, {d Mon}, {Instagram|TikTok}", numbers "{n} views, {n} likes, {n} comments"
- Badges come from `find-outlier-score` ("{x}x their usual", "Too new to judge", "Not enough posts to judge")
- Buttons "Remix", "Open"
- Footer "We check each account once a week, when you open Competitors.", "Check now", chip "About US$0.10 each"
- Progress "Reading @{handle}, about a minute..."
- "Add {name}'s Instagram or TikTok to see their posts.", "Add a handle"
- "@{handle} is private, so we can't read its posts.", "Edit"
- "Couldn't read that account right now. Try again in a few minutes."
- "Account checks are paused for today. They resume at 8am Singapore time."

"Remix" uses `remixUrl` from `src/lib/following.ts` (video to Clone a reel, anything else to Write with "Do not copy its wording") until `remix-everywhere` ships.

### Data

Synced key `content-studio-competitor-posts-<scoped(userId)>`, one object per brand, written whole. It reuses Following's shapes so `applyCheck` and `followStats` work unchanged:

```ts
// src/lib/competitorPosts.ts
import type { FollowedAccount } from "@/lib/following";
export type CompetitorPostsState = Record<string, FollowedAccount>; // key: `${competitorId}:${platform}`
```

Each entry keeps 30 posts (captions cut to 240 characters), 90 follower snapshots and 300 seen ids, about 18 KB, so 24 handles come to about 450 KB per brand. With the ads key that is about 750 KB a brand in localStorage (about 5 MB per site), so the write catches a quota error and keeps the newest 20 posts per handle instead of failing silently. Entries for removed competitors or handles are dropped on the next write. No schema change.

### AI and cost

Mode `posts` of `supabase/functions/competitors/index.ts`, body `{ mode: "posts", platform: "instagram" | "tiktok", handle }`:

1. Gate (`NORTH_STAR_USERS`), `parseTrackRequest` from `track-accounts/logic.ts` for the handle, then `consumeUsage` on `competitor-posts` and on `GLOBAL_COUNTER_USER` for `competitor-posts-global`. When the global counter refuses, give the user's use back and answer 429 `{ code: "global_limit" }` with the "Account checks are paused" line, as `find-competitor-ads` does.
2. `scrapeAccount(platform, handle, APIFY_API_KEY, 33)`, the same Apify actors Following uses.
3. `shapeResult(platform, profile, posts, 30)`: add an optional `max` argument to `shapeResult` in `track-accounts/logic.ts`, default `POSTS_PER_CHECK`, so Following is unchanged. 30 posts give the outlier baseline its 20 settled posts.
4. On `AuditError` or any throw: `refundUsage` on both counters (with the UTC `day` read before the call) and pass the safe message on.

No Jev and no LLM: the ranking is arithmetic from `find-outlier-score`.

Cost, at Free-plan rates read from the actor pages on 2026-10-20: an Instagram check reads 33 posts with `apify~instagram-post-scraper` (US$2.70 per 1,000) and one profile with `apify~instagram-profile-scraper` (US$2.60 per 1,000), about US$0.09. TikTok uses `clockworks~tiktok-scraper`, whose page lists "from US$1.70 per 1,000" without the Free-plan rate, so its 33 posts stay under US$0.10 only if that rate is under US$3 (unverified), and the chip reads "About US$0.10 each" for both. The US$0.75 weekly top-posts run is not a guide here: it reads 6 posts per creator with a different actor (`apify~instagram-scraper`). Caps to add: `competitor-posts` 30 a day per user, `competitor-posts-global` 60 a day on `GLOBAL_COUNTER_USER` (about US$6 a day at most; three full brands need 72 checks a week).

### Deep links

- `/competitors?view=posts`: this view.
- `&c=<competitorId>`, `&platform=instagram|tiktok`, `&sort=views|newest` (outlier score is the default and left out). All replace the history entry.
- Extend the `competitors` builder in `src/lib/links.ts`; add the rows to `docs/deep-links.md`.

## Done when

- [ ] A competitor with an Instagram or TikTok handle shows its last 30 posts within about a minute of being added.
- [ ] The grid sorts by outlier score by default, and by views or newest on request; the choice is in the URL.
- [ ] The pace table shows followers, growth after the second weekly check, posts a week and the best recent ratio.
- [ ] Posts under 48 hours old read "Too new to judge" and never top the outlier sort.
- [ ] Following still reads 12 posts a check (no change for other users).
- [ ] A failed check refunds both counters and keeps last week's posts.
- [ ] `competitor-posts` and `competitor-posts-global` are in `usageCaps.ts`.
- [ ] Checked at 390 px and 1440 px; build and full vitest pass; the north-star item flipped.

## Tests

- `track-accounts/logic.test.ts`: `shapeResult` keeps 12 by default and 30 with `max` 30 (proves Following is untouched).
- `competitors/index.test.ts`: the `posts` mode refunds both counters on an `AuditError` and passes its message, except a private account, which gets the rewritten line without "Make the account public"; 403 before any counter moves; a spent global counter answers 429 `global_limit` and gives the user's use back.
- `src/lib/competitorPosts.test.ts`: keys per competitor and platform, due after 7 days, a removed handle's entry is dropped, the merged feed sorts by outlier rank, views and newest, and young posts sort below scored ones.

## Open questions

- YouTube: the YouTube Data API v3 is free within its quota but needs a key on the project; Leo sets it up or says no.
- LinkedIn company pages and Facebook pages need new Apify actors whose prices are unverified. Leo decides whether they are worth it for advisers.
- Should Following and competitors share one list? This spec keeps Following for creators you admire (`find-creators`) and competitors here.
- A weekly run without opening the page needs pg_cron and server-side storage (a migration). Leo decides.

## Related

find-competitors, find-outlier-score, find-niche-feed, find-creators, find-alerts-digest, remix-everywhere, learn-benchmark
