# It does the job Leo opens it for

`ux-utility` | ux | phase 9 | status: partial | /north-star#ux-utility

## Leo asked

27 Oct 2026: "do also have a UX goal within the north-star too. can refer to mobbin for references, or reference apps, or competitor apps too". His table's row for this item: "Utility: Does it solve the right problem? (CRM example: helps salespeople keep track of follow-ups.)"

## The bar

Each week Leo reaches for Content Studio for most of its core jobs, and the posts on the brands he runs in it go out through it, because it solves the problem he opens it for: good posts out on every brand without starting from a blank page.

The core jobs are the 8 in ux-usability: J1 find a proven post, J2 remix it, J3 make a format, J4 plan a campaign, J5 review drafted posts, J6 schedule a made post, J7 see what worked, J8 ask the agent.

| # | Target | Number to hit | Today (27 Oct) |
| --- | --- | --- | --- |
| T1 | Core jobs Leo used in the last 7 days: distinct jobs with at least one /activity row by You or Agent | 6 of 8 | Not read: Leo's rows sync to production, and builder sessions never sign in there. /activity can count only 5 of the 8 today; finding (J1), reviewing (J5) and reading results (J7) leave no row |
| T2 | Posts out through the app: share of a connected account's posts in the last 4 weeks that the app sent or linked to a draft | 80% for each brand Leo runs in the app | ActivityTracker's TikTok, 17 to 21 Oct: 1 of 6. The other 5 show as "Posted outside the app" and came from the moneybees-reels board (live-p7a-post) |
| T3 | Made to out: share of drafts made in the app that are scheduled or posted within 7 days | 70% | Leo's own: not read. The demo device after the dogfood runs: 28 of 52 scheduled (54%), 24 made and never scheduled, 0 marked posted |
| T4 | Leo's own asks covered: share of the cards under each ask in `NS_ASKS` that are live, leaving out the UX ask of 27 Oct, which holds this card | 80% for every ask | Remix any format (19 Oct) 23 of 36; competitors' ads and posts (19 Oct) 6 of 8; all in one, for everyone (8 Oct) 1 of 9; fits each person's market (15 Oct) 4 of 6; launch films (24 Oct) 0 of 3. Of all 133 cards, 56 are live, and 0 of the 14 in Post |
| T5 | Fit to the brand: share of the first 20 posts on Top posts' default Posts tab that find-niche-feed's Jev match keeps for the brand (cut 0.6) | 80% for each brand | Not scored (a Jev read of 20 posts, under US$0.01 a brand). On the ActivityTracker demo brand the Posts tab's topic chips are the fixed adviser list: "Insurance 14", "Career / FA Life 13", "Investment 12" |
| T6 | Jobs Leo still does outside the app that the north star puts inside it and that he has not chosen to keep outside | 0 | 3 seen: team posts answered on Telegram, board posts scheduled from moneybees-reels, and AdvisorOS team posts sent to a Telegram topic by `team-posts`. Open question 4 asks which he keeps |

## How the best do it

Fastlane measures and shows the job, not the features:

- Home leads with what needs you and how the week is going: "NEXT UP | THE 1 THING THAT NEEDS YOU", then Pace with "POSTS OUT 0 of 0 this week" and "Nothing booked yet" ([Fastlane 0:04](../../../public/north-star/fastlane/t004.webp)).
- A campaign states its outcome before it starts: the review step reads "Success looks like: 28 posts, 2 winners" ([0:23](../../../public/north-star/fastlane/t023.webp)).
- Settings > Activity is "Everything that ran, forever.", filtered by All, Senna, You, Autopilot, Corrections, Scheduled runs and Strategy, with rows such as "Plan added", "Video made", "Paid for a video" and "Competitor added" ([5:42](../../../public/north-star/fastlane/t342.webp), notes-4.md 2.16). That log is how a person sees what they used the product for.
- Its homepage claims "70,000+ businesses" and quotes a user who made and scheduled a TikTok video in 60 seconds ([usefastlane.ai](https://usefastlane.ai/)).

Other competitors sell utility as time back or as the next action:

- Buffer's Insights end in a button that starts the fix: "Revise Posting Schedule" opens "Adjust Your Schedule", "Boost Posting Frequency" opens "Create a Post" ([buffer.com/analyze](https://buffer.com/analyze), from docs/north-star/research/competitors/social-suites.json).
- Metricool: "Every week, thousands of Social Media Managers get 12 hours of their life back", and "Join over 4 million professionals who use Metricool" ([metricool.com](https://metricool.com/)).
- Hootsuite: "Over 25 million users have used Hootsuite to post, track, and out-perform their competitors on social media" ([hootsuite.com](https://www.hootsuite.com/)).
- OpusClip: "Used by 20M+ creators and businesses" and "Schedule a month's posts to all platforms in 10 minutes" ([opus.pro](https://www.opus.pro/)).

Reference apps:

- Linear's method asks for purpose-built tools ("Flexible software lets everyone invent their own workflows, which eventually creates chaos as teams scale") and "Say no to busy work" ([linear.app/method](https://linear.app/method/introduction)).
- Superhuman puts utility in hours: "Save 4+ hours every week on email and scheduling" on its homepage, and customers "report saving an average of three hours per week on email" ([superhuman.com](https://superhuman.com/), [blog](https://blog.superhuman.com/superhuman-is-built-for-speed/)).

No Mobbin screens are cited here yet; this card measures use, which screens do not show.

## What we have today

- /activity (src/pages/ActivityPage.tsx, src/lib/activity.ts, card agent-activity, partial) logs Leo's runs as synced rows with a who (`you`, `agent`, `claude`, `autopilot`, `schedule`) and one of 8 kinds: `post`, `make`, `remix`, `brand`, `learning`, `plan`, `run`, `connect` (activity.ts:17 and 18). There is no kind for saving or finding a post, for a review decision, or for reading results, and the page has no weekly summary. A row whose kind is not in that list is dropped when read (activity.ts:113).
- Real numbers (src/lib/realNumbers.ts, card learn-real-numbers) already split a connected account's posts into "shows real numbers" and "Posted outside the app", which is T2's raw count. `matchOutside` (realNumbers.ts:136) already links an outside post to its Content Studio draft by word overlap, with Jev deciding the close calls. On 26 Oct, Leo's ActivityTracker TikTok read "1 post shows real numbers" and "Posted outside the app (5)" (live-p7a-post/results.md). Board posts have no Content Studio draft, so the matcher has nothing to link them to.
- Home's Next up (card agent-home) groups "24 posts are made and not scheduled" on the demo data, which is T3's gap made visible, as Fastlane's Home does.
- The north star itself (src/data/northStar.ts) holds Leo's asks and each card's status, and `rollup()` there already counts statuses, so T4 is computed from the repo for free.
- Top posts' Posts tab takes its topics from one fixed list (src/lib/postLabels.ts, `TOPICS`, starting Insurance, Investment, CPF, Retirement, Estate Planning, Money Habits) whatever the brand, so a business brand such as ActivityTracker gets adviser topics. Its For you tab (card find-niche-feed, live) already scores posts with Jev against what the brand sells (cut 0.6, cap `niche-match`): on 21 Oct ActivityTracker kept 7 of 8 Pipedrive posts and 0 of 8 finance posts. The brand's own topics exist too, read from its website (src/lib/brandRead.ts, card brand-from-website).
- Outside the app: Leo answers team posts on Telegram, the posts board (moneybees-reels) schedules his brand posts, and AdvisorOS team posts go to a Telegram topic.

### Measured baseline, 27 Oct

- T4 and the status counts were read from `NS_ITEMS` and `NS_ASKS` at origin/main 8664c00d with a short tsx script: 56 live, 72 partial and 5 missing of 133. Rerun it any time; it reads the repo only.
- T3's demo figures and T5's topic chips came from the local harness described in ux-usability (mock Supabase, faked session, the 25 Oct replay's device state); /drafts read "All (52) Drafts (24) Scheduled (28) Posted (0)". Drafts sent through the schedule steps before ffec181c (26 Oct, live-p7a-post D1) kept "Draft", so this count may run low.
- T2 is the 26 Oct posting dogfood's own reading of Leo's account. T1 and Leo's T3 need his session and were not read.

## Build

Gate: everything below shows on Leo's sign-ins only (`useLeoOnly()`, `leoOnly(email)`) until Leo says "on for everyone". No schema change and no new dependency: the new numbers live in synced `content-studio-` rows.

1. A "This week" strip on /activity (cards agent-activity, learn-pace): jobs used (x of 8), days used (days with at least one row by You, which ux-desirability's D5 reads), posts out through the app against outside it per brand, and made to out. Leo sees it on his own device; it also writes those numbers to a synced row so the north-star page can show them on Leo's sign-in.
2. The three missing kinds (card agent-activity): `find` when a post is saved or a remix starts, `review` when a campaign post is made, swapped or skipped or a card is approved, and `learn` when a grade or What wins is opened. They join `ActivityKind` and the read list in activity.ts, are logged from the same Leo-only switch as today, and go in the same synced rows. A device on an older build drops the new kinds when it reads them, which is harmless.
3. Finish the "all in one" ask (cards publish-schedule, publish-calendar, publish-accounts, publish-tiktok, publish-per-network). Of the blockers the 26 Oct posting dogfood named, the calendar day of a post scheduled through the steps (D1) was fixed the same day in ffec181c. What is left: the TikTok app update behind code 40002 (D2), a step on Leo's phone, and Instagram not connected on ActivityTracker, which Leo connects on /accounts. The rest is those cards' own Done when lists.
4. Count the board's posts as the app's when they are the app's (card learn-real-numbers): give `matchOutside` the board's posted cards as a second set of candidates, so a board post that matches by words counts as through the app, and "Posted outside the app" keeps only posts made elsewhere. The board is reached through `team-board`; whether it returns posted cards with their words is unverified, so check that before building, and a new board endpoint is a change on the moneybees-studio side.
5. Brand-fit Top posts (cards find-niche-feed, brand-from-website): for a business brand, the Posts tab's topic chips come from the brand's own topics (brandRead.ts), and the Posts tab ranks with the For you tab's cached Jev scores, so this adds no new paid call and no new cap. The adviser list stays for advisers.
6. Weekly read (no card): the integrator records T4 from the repo every wave, and Leo's strip numbers once a week in the wave's results file.

## Done when

- [ ] /activity shows "This week" with jobs used, days used, posts out through the app per brand, and made to out, on Leo's sign-in only.
- [ ] Saving a post, deciding on a campaign post and opening What wins each add one row of the new kinds (a vitest over activity.ts proves each kind is kept on read).
- [ ] Four weeks of Leo's strip show 6 or more of 8 jobs a week and 80% or more posts through the app on each brand he runs in it. Leo reads these off his strip.
- [ ] Every ask in `NS_ASKS` other than the UX ask has 80% or more of its cards live.
- [ ] Top posts on a business brand shows that brand's topics, and 16 or more of its first 20 posts pass find-niche-feed's Jev match.
- [ ] `ux-utility` flipped in `src/data/northStar.ts` with its `ours` line, in the same commit.

## Scoring each build wave

| Check | What it gives | Time | Cost |
| --- | --- | --- | --- |
| A short script over `NS_ITEMS` and `NS_ASKS` | T4 | seconds | US$0 |
| Leo's "This week" strip, read from his device or the north-star page | T1, T2, T3 | 1 min of Leo's time, weekly | US$0 |
| A script that sends find-niche-feed's `matchAsk` (supabase/functions/competitors/logic.ts) to Jev for the first 20 Posts-tab posts of each brand Leo runs, with the brand's public facts and `TYPESAFE_API_KEY` from the shell; no sign-in | T5 | about 1 min | under US$0.01 a brand |
| The wave's results file lists what Leo did outside the app that week | T6 | read only | US$0 |

The integrator never signs in as Leo or reads his rows from production; Leo's numbers come from Leo. A wave passes when T4 does not fall and no other number it can see goes down. The card's `ours` line shows the score of targets met, "T 0 of 6" today.

## Open questions

1. Which brands count for T2? Recommended: the brands with an account connected in /accounts, so a brand Leo only experiments on does not drag the number.
2. Do board posts count as "through the app"? Recommended: count them once the matcher links them to a board card or a Content Studio draft, since the board is Leo's own tool, and keep the 80% bar on unlinked posts only.
3. Is 6 of 8 jobs a week the right bar for a busy week? Recommended: yes, as a 4-week average, since J5 and J4 run in bursts around campaigns.
4. T6: which outside jobs should move in? Recommended: none by force. Telegram answers fit how Leo works (see ux-workflow-fit), so mark both Telegram jobs as kept; move only the board's scheduling once publish-calendar and publish-tiktok are live. Leo decides.

## Related

agent-activity, agent-home, learn-pace, learn-real-numbers, publish-schedule, publish-calendar, publish-accounts, publish-tiktok, publish-per-network, find-niche-feed, brand-from-website, trust-team-push, ux-usability, ux-workflow-fit, ux-desirability, ux-trust

## References

Pages fetched 27 Oct 2026 with Scrapling. The captures sit in a temporary session folder (`ux-research-a/pages/`) that will not survive, so each quote above carries its URL.

- Fastlane: [usefastlane.ai](https://usefastlane.ai/); frames t004, t023 and t342 in `public/north-star/fastlane/`; docs/north-star/videos/fastlane-2026-10-19/notes-1.md F5.5 and notes-4.md 2.16
- [Buffer Analyze](https://buffer.com/analyze), [Metricool](https://metricool.com/), [Hootsuite](https://www.hootsuite.com/), [OpusClip](https://www.opus.pro/)
- [Linear method](https://linear.app/method/introduction), [Superhuman](https://superhuman.com/), [Superhuman blog](https://blog.superhuman.com/superhuman-is-built-for-speed/)
- Dogfood: `~/Documents/Content Studio/Competitive Research/_raw/dogfood/live-p7a-post/results.md` (learn-real-numbers, D1, D2); fix ffec181c (26 Oct)
