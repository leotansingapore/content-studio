# You against your competitors

`learn-benchmark` | learn | phase 7 | status: partial | /north-star#learn-benchmark

## Leo asked

19 Oct 2026: "find ways where one can key in their competitors and the app will scrape their ads and top performing social media posts". This view puts the posts scraped for those keyed-in competitors next to your own account.

## How the best do it

Fastlane does not show this in Leo's recording. Studio's watch bar counts "6 of 12" competitors and Radar shows "Your competitors 6" and "+ Add competitor", all for their Meta ads. Analytics, which carries a small "Growth" tag (most likely the plan it needs, unverified), was not opened. No side-by-side of accounts was seen.

Planable has the clearest version. Its Analytics add-on has a Competitor tab, synced daily, with a side-by-side comparison, trend charts, the competitors' top posts by engagement and CSV export. August 2026 brought "Format performance" (average engagement per post by format) and a "Positioning matrix" that drops each account into one of four boxes by posting volume against payoff: "Efficient", "Leading", "Quiet" and "Grinding". The source never says which box means what, so the reading below comes from the names (unverified). Pricing: US$14 or US$12 a workspace a month for the add-on, included in Enterprise; the lower figure is probably yearly billing, unverified ([release notes](https://releasebot.io/updates/planable), [pricing](https://planable.io/pricing/)). One glance and you know whether to post more or post better.

Agorapulse spells out its sections: "Manage competitors" > "+ Add competitor" (a Facebook page URL or an Instagram username), then "Competitors benchmark" (followers, posts, total and average engagement), "Top content" (6 best posts across all profiles, sortable by Likes, Comments, Shares, Engagement), "Publishing" (Reels, Carousels, Videos, Photos, Links, Texts) and "Engagement per post type". It covers Instagram business accounts and Facebook, backfills 30 days, and includes 1 competitor on Standard and Professional and 6 on Advanced ([help](https://support.agorapulse.com/en/articles/9952765-competitors-report-explained)).

Others:

- Hootsuite's watchlist compares posts, posting frequency, average engagement, audience growth, follower count, average post length and hashtags per post. Standard allows 5 competitors, Professional and Advanced 20 ([competitive analysis](https://www.hootsuite.com/platform/competitive-analysis), [plans](https://www.hootsuite.com/plans)).
- Publer: "Competitor Analysis" > "Add Competitor", up to 10 per social account on the Business plan, with posts, follower growth, engagement, reach and a "Photos & Videos vs. Links & Text Updates" split. The default period is the last 7 days ([blog](https://publer.com/blog/publer-competitor-analysis/)).
- Metricool shows "Followers and Likes", "Posts", "Interactions" and "Extra Stats" per competitor, with 5 competitors free and up to 100 from Starter ([competitor analysis](https://metricool.com/competitor-analysis/), [pricing](https://metricool.com/pricing/)).
- Sprout Social's Instagram Competitors Report shows each competitor's stats with a "Competitor Average" and their most popular posts and hashtags; Professional lists "extensive competitor, tag and paid insights" ([competitive analysis](https://sproutsocial.com/competitive-analysis/), [pricing](https://sproutsocial.com/pricing/)).
- Panoramata scores each competitor on activity, volume and consistency and ranks them ([site](https://www.panoramata.co/)).
- Virlo's posting-cadence endpoint returns posts per week and month, average days between posts and posts by weekday ([docs](https://dev.virlo.ai/docs/tracking)).
- Exolyt's Brand Comparison puts accounts side by side with growth in likes, followers and videos (details unverified) ([features](https://exolyt.com/features/brand-comparison)).
- ContentStudio lists competitors' audience size, publishing activity, engagement rate and content-type breakdown next to yours, on Advanced and above ([page](https://contentstudio.io/social-media-competitor-analysis)).

## What we have today

- Following (`/following`, `src/pages/FollowingPage.tsx`, `src/lib/following.ts`) tracks up to 5 public Instagram or TikTok accounts per brand (`MAX_FOLLOWED`) through `track-accounts` (Apify, cap `track-accounts` 10 a day). Each check keeps the 12 newest posts (`POSTS_PER_CHECK`) and one follower snapshot a day, 90 kept. `followStats` gives followers, growth over 30 days, posts a week (post count over the span of the posts read) and the best post. Each account has its own card; there is no table and no row for you.
- A followed post (`TrackedPost` in `supabase/functions/track-accounts/logic.ts`) carries views, likes and comments only, with no shares or saves.
- The account audit on `/analytics` (`src/components/AccountAudit.tsx` under the heading "Your account audit", `src/lib/accountAudit.ts`, table `cs_social_audits`, one row per user, platform and handle, with snapshots in `cs_social_snapshots`) reads your own Instagram or TikTok handle's last 30 posts and refreshes at most every 20 hours (`REFRESH_COOLDOWN_HOURS`). The row keeps those posts (`AuditRow.posts`, `RatedPost[]` with shares and saves) beside `profile` and `stats`. `computeAudit` in `supabase/functions/_shared/socialAudit.ts` works out followers, median views, median engagement rate (interactions are likes, comments, shares and saves, a null counted as 0; Instagram divides by followers, TikTok by views) and posts a week (posts in the last 28 days over 4 when the posts reach back that far, else the span between the oldest and newest), a different rule from the one in `followStats`.
- Analytics' This week card lists followed accounts that moved ("@rival gained 120 followers (5,400 now), 3 new posts", `moverLine` in `supabase/functions/notify/logic.ts`).
- `research/current-app.md` marks competitor benchmarks partial: "no side-by-side benchmark report".
- Planned, not built: `find-competitors` adds the Leo-only `/competitors` page and the list in `content-studio-competitors-<scoped(userId)>`; `find-competitor-posts` adds weekly reads of each competitor's last 30 posts into `content-studio-competitor-posts-<scoped(userId)>` (a `Record<string, FollowedAccount>` keyed `${competitorId}:${platform}`, so `followStats` works on it unchanged) with a pace table ("Who", "Followers", "In {n} days", "Posts a week", "Best lately").

Status partial: every number exists for you (audit) and for followed accounts (Following), but nothing puts you and them in one table, and there is no chart.

## Build

A fourth view on the Leo-only `/competitors` page: "You vs them", `?view=compare`. Build `find-competitors` and `find-competitor-posts` first; this view reads their data and adds no paid call. Component `src/components/competitors/CompareView.tsx`, logic in `src/lib/benchmark.ts`.

### Screens and states

```
[ Their ads ] [ Their posts ] [ Who you watch ] [ You vs them ]
[ Instagram ] [ TikTok ]                                   Sort: [ Engagement v ]

Who            Followers   In 30 days   Posts a week   Median views   Engagement
You            3,120       +140 (+5%)   2.0            1,800          4.1%
Josh Tan       41,200      +620 (+2%)   3.5            9,400          2.3%
Singlife       18,000      +90          1.0            2,100          0.8%
Seedly         62,500      next check   5.5            12,000         1.9%

          Engagement
  Efficient   |   Leading
       (You)  |      (JT)
  ------------+--------------  Posts a week
  Quiet       |   Grinding
       (SL)   |      (SD)
Your posts land well but you post less than most. Post more often.
```

Rows:

- You: read your own audit row for the chosen platform. Take the handle from `loadSocialAccounts(userId)` (`src/lib/socialAccounts.ts`) and select from `cs_social_audits` by `platform` and `handle` (RLS already limits the read to your rows, as `loadAudit` does), and take followers from `profile.followers` and growth from `loadSnapshots(audit.id)`, the latest followers minus the oldest snapshot inside 30 days. The view never starts an audit refresh; that stays on Analytics with its 20-hour rule.
- Each competitor handle on that platform: the `content-studio-competitor-posts-` entry under `${competitorId}:${platform}`. Followers and growth come from `followStats` in `src/lib/following.ts`.
- Posts a week, median views and engagement come from one call shape for both sides: `computeAudit(posts, platform, followers, now).stats`. Competitor posts are mapped from `TrackedPost` to `SocialPost` with shares, saves and duration null and `pinned` and `collab` false. Your `audit.posts` go through the same call with `shares` and `saves` set to null, because competitor posts never carry them and `computeAudit` counts them in interactions. So the You row's engagement can read lower than the audit card on Analytics, which counts shares and saves; the InfoTip says so. `followStats.perWeek` is not used here, so both sides share the 28-day rule.
- The You row stays pinned on top with a `bg-primary/5` background; the others sort by the chosen column (`?sort=`), highest first.

Quadrant chart (inline SVG, no new dependency):

- x is posts a week and y is engagement rate. Both split lines sit at the median of every row that has both numbers, you included.
- The four boxes are named Planable's way, in plain words: "Leading" (more posts, more engagement), "Efficient" (fewer posts, more engagement), "Grinding" (more posts, less engagement) and "Quiet" (fewer posts, less engagement).
- Dots carry initials; yours reads "You" in `text-primary`. The SVG is `aria-hidden`, because the table carries the same numbers and the line under the chart names your box.
- The line under the chart is fixed text per box. Placing a dot is arithmetic on a median split, so it needs no Jev call:
  - Leading: "You post more than most and get more back per post. Keep the pace."
  - Efficient: "Your posts land well but you post less than most. Post more often."
  - Grinding: "You post more than most but get less back per post. Remix their best posts before adding more." The phrase "their best posts" links to `?view=posts`, which sorts by outlier score by default.
  - Quiet: "You post less and get less back than most. Start with one more post a week." The phrase "one more post a week" links to `/home?goal=change` (`plan-goal`), or to `/home` until that ships.

Entry point: on `/analytics`, under the "Your account audit" heading, a link "Compare with your competitors" to `/competitors?view=compare`, shown only for `leoOnly(email)`.

States:

- No competitors: "Add a competitor to compare yourself." with a link "Who you watch" (`?view=list`).
- No competitor handles on this platform: "None of your competitors has an {Instagram} handle yet." with "Add a handle" (`?view=list`).
- You missing: with no handle saved, the You row reads "Add your {Instagram} handle in Analytics to put yourself here." and links to `/analytics`; with a handle but no audit yet it reads "Open your audit in Analytics once to put yourself here."
- Competitor not read yet: "Checking..." while the `find-competitor-posts` job runs, else "Not checked yet".
- Under 3 posts in a row: its views and engagement read "-", and an InfoTip beside them says "Too few posts to judge".
- Growth before a second check: "next check", the way Following shows it.
- Fewer than 3 rows with both numbers: no chart, just the line "The chart shows once 3 accounts have numbers."
- Audit read failed (a Supabase error): "Couldn't read your audit." in the You row, with "Try again".
- Refused: the page is Leo-only (`find-competitors` gate), so other sign-ins get the 404 page. No paid call exists here, so there is no cap state.

### Copy

- Tab: "You vs them"
- Platform pills: "Instagram", "TikTok"
- Sort label "Sort", options "Engagement", "Followers", "Growth", "Posts a week", "Median views"
- Headers: "Who", "Followers", "In 30 days", "Posts a week", "Median views", "Engagement"
- InfoTip on "Engagement": "Likes and comments per follower on Instagram, per view on TikTok."
- Row names: "You", then each competitor's name
- Cells: "+{n} (+{p}%)", "next check", "-", "Checking...", "Not checked yet"
- Box names: "Leading", "Efficient", "Grinding", "Quiet"
- The four lines above, and "The chart shows once 3 accounts have numbers."
- Empty and error lines as listed under States; Analytics link "Compare with your competitors"

### Data

- Nothing new is stored. The view reads `content-studio-competitors-` and `content-studio-competitor-posts-` (from the two find items) and your own rows in `cs_social_audits` and `cs_social_snapshots`.
- The platform and sort live in the URL.
- No table, no migration, no schema change.

### AI and cost

- No LLM and no Jev: every figure is arithmetic on stored public numbers, and the box is a median split.
- No provider call, no new cap and no paid button, so no price chip. The weekly competitor reads (`competitor-posts`, about US$0.10 a check per `find-competitor-posts`) and the audit refresh are paid by the items that own them.

### Deep links

- `/competitors?view=compare` opens the view.
- `&platform=tiktok` (default `instagram`) and `&sort=followers|growth|pace|views` (default `engagement`, left out) both replace the history entry. `?view=posts` also has a `sort` param with other values (`views`, `newest`), so switching views drops `sort`; `platform` carries over.
- Extend the `competitors` builder in `src/lib/links.ts` (added by `find-competitors`) with `platform` and `sort`, and add the rows to `docs/deep-links.md`.

## Done when

- [ ] `/competitors?view=compare` shows a You row and one row per competitor handle on the chosen platform, for Leo only.
- [ ] Your engagement and a competitor's come from the same `computeAudit` call shape; a test feeds both the same posts (yours with shares and saves filled in) and gets the same number.
- [ ] The quadrant places seeded accounts in the right boxes and prints the matching line for You.
- [ ] Sort and platform survive a reload and a copied link.
- [ ] Every empty state above renders with its link.
- [ ] Opening the view starts no audit refresh and no competitor read (network tab shows only Supabase selects).
- [ ] The Analytics link shows for Leo only.
- [ ] Checked by eye at 390 px (table scrolls inside its card, chart stays square) and 1440 px.
- [ ] `src/data/northStar.ts` item flipped (status and `ours`) in the same commit, and this spec's status line ticked.

## Tests

- `src/lib/benchmark.test.ts`: `toSocialPost` fills nulls and keeps views, likes and comments; `youPosts` nulls shares and saves on audit posts; `compareRows` pins You first and sorts the rest by each column; posts a week for both rows comes from `computeAudit`, not `followStats`; growth uses the oldest snapshot inside 30 days; rows with under 3 posts get no engagement.
- Same file: `quadrantOf(row, medians)` covers all four boxes and ties (a tie on a median counts as "more"); `quadrantLine` returns the exact copy for each box; the chart is hidden under 3 complete rows.
- `src/components/competitors/CompareView.test.tsx`: the no-competitors, no-handle and no-audit states render their lines and links.

## Open questions

- Following (creators you admire) and competitors are separate lists. Leo may want followed creators in this table too; one flag would add them.
- LinkedIn and Facebook pages are not compared, because nothing reads them yet (`find-competitor-posts` leaves that to Leo).
- Instagram engagement per follower punishes big accounts. If Leo prefers per view for reels, switch the basis for both sides at once.
- A share-of-voice or industry average needs data we do not collect. Not in this build.

## Related

find-competitors, find-competitor-posts, find-outlier-score, learn-weekly-report, find-alerts-digest, learn-reports-export
