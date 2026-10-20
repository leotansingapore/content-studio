# Pace: views a day and posts out

`learn-pace` | learn | phase 7 | status: partial | /north-star#learn-pace

## Leo asked

No direct ask; from the competitor research.

## How the best do it

In Leo's recording, Fastlane's Home has a "PACE" card at the top right, beside the "Next up" card, and it reads like this from the top down:

- A tag "PACE", a big dot-matrix digit "0", then "views a day, Sun" and "No views yet." Next to it sits a semicircle gauge with boxed scale labels "0", "20", "40", "60", "80", "100" and a red needle resting at 0.
- Three cells under the gauge: "POSTS OUT" with "0 of 0 this week" and "Nothing booked yet"; "AD SPEND THIS WEEK" with "None" and "No ads running. Senna can add them to a campaign."; "CREDITS" with "142 of 500", a fuel bar from E to F, "About 4 days left at last week's spend" and "Refills 28 Oct".

![Fastlane 0:04](../../../public/north-star/fastlane/t004.webp)

While Home loads, the cards are grey skeletons under a chip "Loading your home" (t001), then a pixel wipe reveals them (t003). The same card is in Leo's capture of Home: `../research/fastlane-pdf/013-Home-1.webp`. The account had one TikTok connected (@activity_tracker_io) and no views, so the needle sat at 0 the whole time. What the 0 to 100 scale measures is never shown (unverified).

The target side comes from the campaign wizard. Step 4, "FORMAT AND PACE | 4 OF 5", asks "What gets made, and how often?" with "Every 3 days", "Every 2 days", "1 a day", "2 a day", "3 a day" and "Custom", and sums it up as "28 posts each over 1 month, 28 across 1 account." The review step then shows "Pace: 1 per account a day | 1 month" and "Success looks like: 28 posts, 2 winners".

![Fastlane 0:21](../../../public/north-star/fastlane/t021.webp)

![Fastlane 0:23](../../../public/north-star/fastlane/t023.webp)

Others:

- Virlo stores a snapshot on every check, with `delta_*` fields against the previous check for followers, views and likes, and returns the latest 1 to 365 checks. Their note: delta fields make velocity charts trivial ([docs](https://dev.virlo.ai/docs/tracking)). This spec copies that method for views a day.
- ShortsIntel scores velocity as views per hour since posting over a stated window. Its note: "views per hour catches a breakout before the multiplier does" ([docs](https://www.shortsintel.com/docs/concepts/scores)).
- Motion's home page has a "Performance shifts" section that tracks ads scaling or declining week over week by spend and flags recently launched ads ([FAQ](https://motionapp.com/faq)).
- Submagic's Publishing Stats return totals across all connected accounts against the prior period, plus a daily series, though how its own screen shows them is unverified ([docs](https://docs.submagic.co/llms.txt)).

Fastlane's ad spend cell is left out on purpose: running paid ads is AdLauncher's job.

## What we have today

- Home, `src/pages/HomePage.tsx`, has a section marked `{/* Weekly rhythm */}` in the code (around line 553, no heading on screen). It shows two cards when the person has posts or a goal:
  - "This week": "{posted} / {goal} posted" ("{posted} posted" with no goal), a progress bar (posted, then scheduled in a lighter shade), one row per platform such as "2 posted, 1 scheduled, 1 to do", and at the bottom either "Goal hit for the week. Nice." or, with no goal, a "Set a weekly goal" link. The pencil (aria-label "Edit weekly goal") shows only once a goal is set. It and the link open an inline "Posts per week" editor (0 to 21 per platform, `MAX_WEEKLY_GOAL`) with "Cancel" and "Save goal".
  - A streak card: "{n} weeks" with "Posting streak. Keep it alive.", or "Post once this week to start a streak." at 0.
- The numbers come from `weekProgress(drafts, goals)` in `src/lib/goals.ts`. Goals live in the synced key `content-studio-goals-<scoped(userId)>`. Weeks run Monday to Sunday (`weekOf` in `src/lib/dueDates.ts`), with posted days read in Singapore time (`sgDay` in `goals.ts`).
- Views a day exist nowhere. `pullNumbers` in `src/lib/realNumbers.ts` (the `social` function, action `metrics`, 100 posts a page, at most 5 pages) reads each post's lifetime numbers for the last 366 days, and `pullFollowers` reads daily follower counts. Both run from `RealNumbers.tsx` only when Analytics opens, only after the person pressed "Use my real numbers" once (`content-studio-realnumbers-<scoped>` = "1"), and only for `SOCIAL_CONNECT_USERS`. Every `social` call uses one `social-read` (300 a day), so a pull is up to 6.
- `MetricsPost` (`supabase/functions/social/metrics.ts`) carries `id`, `publishedAt`, `text` (cut to 300 characters) and `numbers` (impressions, reach, views, likes, comments, shares, saves). The file says its shapes come from Zernio's openapi.json and were not yet seen against a live key, so whether `id` stays the same from one pull to the next is unverified.
- Analytics' "This week" card (`weekReport` in `supabase/functions/notify/logic.ts`) sums impressions and engagements of posts posted in the last 7 days against the 7 before. That is a post total, not views per day.
- Spend: nothing in money. `src/lib/aiUsage.ts` `readUsage()` reads today's `cs_ai_usage` rows to show uses left beside AI buttons. Nothing reads more than one day. The table counts per sign-in and UTC day (migration 009), not per brand, and a use is counted before the paid call runs, minus refunds.
- Home does not call `useScrollToHash` (`src/lib/urlState.ts`), so no `/home#...` anchor scrolls today.

Status partial: posts out against the weekly goal is live for everyone. Views a day, the gauge and a spend figure are missing.

## Build

### Screens and states

Leo only. For `leoOnly(email)` (`src/lib/leoOnly.ts`), the "Weekly rhythm" section renders a new `src/components/PaceCard.tsx` where the "This week" card is now, and the streak card stays beside it (`sm:grid-cols-[2fr_1fr]`). When the goal editor is open, the existing editor takes PaceCard's place the way it takes the This week card's place today, and every other sign-in keeps today's cards as they are.

```
PACE (i)                                        Updated 9:40 AM
1,240                    .--------------.
views a day, last 7 days /      |        \
+18% on your usual       0    usual     2,000
-------------------------------------------------------------
POSTS OUT              (pencil) | AI RUNS, LAST 7 DAYS
3 of 5 this week                | 14
2 booked                        | Most: reel clone (6)
```

The gauge is a plain SVG semicircle drawn in PaceCard, with no new dependency. The scale runs from 0 to `gaugeMax`, with a tick labelled "usual" when there is one. The needle uses tokens: `text-success` at or above usual, `text-warning` under 70% of usual, `text-muted-foreground` otherwise.

Views a day, worked out in a new pure file `src/lib/pace.ts`:

- `postViews(p)` is `p.numbers.views || p.numbers.impressions || p.numbers.reach`, since which of the three a network fills varies. Our own `realMetrics` in `supabase/functions/social/metrics.ts` takes the same three in the other order (impressions, then reach, then views) for the app's "impressions"; views go first here because the card counts views.
- `recordPull(state, posts, at)`: for every post that was in the last pull, the gain is `max(0, views now - views then)`. A post that is new since the last pull and was published after it adds all its views. A post that is new but was published before the last pull (it was past the 500 the last pull read, or Zernio had not listed it yet) adds nothing and is only recorded. A post that disappeared (deleted, or older than 366 days) adds nothing. The total gain is spread over the Singapore days between `last.at` and `at`, in proportion to the hours of each day the gap covers, so a pull after 3 days away spreads the gain by hours instead of a spike on one day. `last` becomes this pull. The first pull ever only sets `since` and `last`.
- `viewsADay(state)`: the window is the 7 Singapore days ending on the day of `last.at`. Views a day = the sum of `days` in the window divided by the hours from the later of the window's start and `since` to `last.at`, over 24. Null when `last.at` is under 20 hours after `since`. `since` is the exact time of the first pull, not its day, so two pulls 24 hours apart divide by 24 hours.
- `usualViews(state)`: the same average over the 28 days before that window. Null with fewer than 7 days of history before the window.
- `gaugeMax`: with a usual, `niceCeil(usual * 2)`; without one, `niceCeil(max(viewsADay * 1.5, 100))`. `niceCeil` rounds up to 1, 2 or 5 times a power of ten.
- The change line: `Math.round((viewsADay / usual - 1) * 100)`, shown as "+18% on your usual" or "-12% on your usual"; inside plus or minus 5% it reads "About your usual".

When pulls happen:

- `refreshPace(userId)` in `src/lib/pace.ts` is a module-level job with listeners, built like `runCheck` in `src/lib/following.ts`, so leaving Home does not stop it. Home calls it for Leo when `socialConnectShown()` is true and `last.at` is missing or older than 6 hours. It calls `pullNumbers(activeProfileId(userId))` and then `recordPull`. One run at a time per brand.
- `RealNumbers.tsx` `pull()` on Analytics already calls `pullNumbers`; add one `recordPull` call after it, so either page keeps the state fresh.
- `learn-real-numbers` adds a shared `refreshRealNumbers` job with the same 6-hour rule that also calls `recordPull`. Whichever item ships second makes `refreshPace` a thin call to that job, so Home makes one pull, never two.

Posts out reads `weekProgress(drafts, goals)` as today. With a goal: "{posted} of {goal} this week". The sub-line is "{scheduled} booked" when something is scheduled, "Goal hit" when every platform met its goal, and "Nothing booked yet" when nothing is posted or scheduled. With no goal: "{posted} this week" and the existing "Set a weekly goal" link. The pencil (aria-label "Edit weekly goal") calls the existing `setGoalDraft(goals)`.

AI runs reads a new `readUsageWeek()` in `src/lib/aiUsage.ts`: `cs_ai_usage` rows (`feature, count, day`) with `day >= utcDay(6 days ago)`, which RLS (`cs_ai_usage_read_own`, migration 009) already lets a person read. That is the last 7 UTC days, not the Monday-to-Sunday week Posts out uses, so the cell says "last 7 days". The rows count per sign-in across all brands, because `cs_ai_usage` has no brand column. A pure `weekTotal(rows)` then:

- keeps only features that are keys of `DAILY_LIMITS`, which drops the per-brand `market-check:<profile>` rows and any one-off `claimOnce` rows;
- drops any that end in `-global`, because those across-everyone counters sit on `GLOBAL_COUNTER_USER`, Leo's own 13b28b1d sign-in (`src/lib/leoOnly.ts` names it), and would double count;
- drops the caps that count something other than an AI run, listed as `NOT_AI` in `aiUsage.ts`: `social-connect`, `social-read`, `social-automation-write`, `social-schedule`, `social-presign`, `team-comment`, `feeds`, `stock-search`, `mentions`, `yt-captions`, `track-accounts`, `reel-style` and `reel-video`. Without this, `social-read` (up to 6 per pull, including this card's own pulls) would top the cell.

The cell shows the total, and "Most: {feature with dashes as spaces} ({n})".

States:

- Loading (no stored pace yet): grey bars and a chip "Reading your views..." within 400 ms.
- Not connected (`socialConnectShown()` is false, or the pull returns no accounts): the number is "-", the line reads "Connect an account to see views a day." and an outline button "Connect an account" goes to `/accounts`. Posts out and AI runs still show.
- First day: "Counting from today." with "Views a day shows tomorrow."
- No views: "0" and "No views yet."
- Done: the number, "views a day, last 7 days", the change line, "Updated {h:mm AM}".
- Stale (last pull over 24 hours old): "Updated {Mon 19 Oct}".
- Refreshing with an older number on screen: the number stays and the Updated text reads "Updating...".
- Failed: the last number stays; "Couldn't read your views. Try again in a minute." with a small "Try again".
- No analytics on the Zernio plan (402 `no_analytics`): the server's line "Analytics isn't on this Zernio plan."
- Over the daily cap (429 on `social-read`): the last number stays, with the server's message under it.
- AI runs unreadable (`readUsageWeek` returns null): "-" and "Couldn't read".
- Refused: other sign-ins never render PaceCard and never call `refreshPace`.

### Copy

- Tag: "PACE"
- InfoTip (label "About pace"): "Views your posts gained each day, from your connected accounts."
- Number line: "views a day, last 7 days"
- Change line: "+{n}% on your usual", "-{n}% on your usual", "About your usual"
- Gauge tick: "usual"
- "Updated {time}", "Updated {Mon 19 Oct}", "Updating..."
- "Reading your views..."
- "Connect an account to see views a day." and button "Connect an account"
- "Counting from today." and "Views a day shows tomorrow."
- "No views yet."
- "Couldn't read your views. Try again in a minute." and "Try again"
- Cells: "POSTS OUT", "{n} of {goal} this week", "{n} this week", "{n} booked", "Goal hit", "Nothing booked yet", "Set a weekly goal"
- Cells: "AI RUNS, LAST 7 DAYS", "Most: {feature} ({n})", "Couldn't read"

### Data

- New synced key `content-studio-pace-<scoped(userId)>`, one per brand, written whole:

```ts
// src/lib/pace.ts
export interface PaceState {
  since: string | null;                                   // ISO time of the first pull
  last: { at: string; views: Record<string, number> } | null; // MetricsPost.id -> views at the last pull
  days: Record<string, number>;                           // SG day -> views gained that day, 40 days kept
}
```

  `last.views` holds at most 500 posts (the 5 pages `pullNumbers` reads), about 15 KB.
- Goals stay in `content-studio-goals-` and AI runs are read from `cs_ai_usage`, never stored, so there is no table, no migration and no schema change.

### AI and cost

- No LLM and no Jev. Views a day and the change against usual are arithmetic on numbers Zernio reports.
- Zernio: each refresh is 1 to 5 calls of the `social` function's `metrics` action, under the existing `social-read` cap of 300 a day. The 6-hour rule allows at most 4 refreshes a day from Home, so 20 reads at most, which is why no new cap is added. Zernio bills a flat plan, so a read has no price of its own (unverified against the current invoice).

### Deep links

- `/home#pace` scrolls to the card. Home does not call `useScrollToHash` today: add `useScrollToHash(userId !== null)` to `HomePage` and `id="pace"` with `scroll-mt-20` on the card. Add the anchor to the anchors list in `docs/deep-links.md`.
- The views number links to `/analytics#real-numbers` (anchor added by `learn-real-numbers`; plain `/analytics` until then).
- Posts out links to `links.calendar({ view: "week" })`.
- The card has no state of its own to put in the URL.

## Done when

- [ ] On Leo's sign-in, Home shows PaceCard in place of the This week card; on any other sign-in Home is unchanged and makes no new calls.
- [ ] With seeded pulls 24 hours apart (post A 100 then 160 views, new post B 50 views), the card shows 110 views a day.
- [ ] Pulls 72 hours apart with a gain of 300 spread it by hours (pulls at midnight Singapore time put exactly 100 on each of the 3 days), not 300 on the last day.
- [ ] A post first seen in a pull but published before the previous pull adds nothing that day.
- [ ] The first pull shows "Counting from today."; a deleted post never lowers the number.
- [ ] With 35 days of seeded history, the change line and the "usual" tick appear and match the 28-day average.
- [ ] Opening Home twice within 6 hours makes one pull; opening Analytics records into the same state.
- [ ] Posts out matches the old card's numbers, and the pencil opens and saves the weekly goal.
- [ ] AI runs leaves out `-global`, `market-check:` and every `NOT_AI` row when signed in as 13b28b1d.
- [ ] `/home#pace` scrolls to the card once Home has drawn.
- [ ] Not connected, failed, 402 and 429 each show their line, and the last number stays where there is one.
- [ ] Checked by eye at 390 px and 1440 px, gauge readable in dark and light.
- [ ] `src/data/northStar.ts` item flipped (status and `ours`) in the same commit, and this spec's status line ticked.

## Tests

- `src/lib/pace.test.ts`: `recordPull` adds gains for known posts, adds new posts published after the last pull, adds nothing for new posts published before it, ignores deleted posts and drops, spreads a gap's gain over its Singapore days by hours, and only sets `since` (an ISO time) on the first pull. `viewsADay` divides by the hours from `since` or the window start over 24 (pulls 24 hours apart with a 110 gain give 110) and returns null under 20 hours of history. `usualViews` needs 7 days before the window. `gaugeMax` and `niceCeil` give 200, 500, 1,000, 2,000 for the right inputs. `postViews` falls back from views to impressions to reach.
- Same file: `shouldRefresh(state, now)` is true when `last` is missing or 6 hours old, false otherwise.
- `src/lib/aiUsage.test.ts`: `weekTotal(rows)` drops unknown features, `-global` rows, `market-check:` rows and `NOT_AI` rows, and names the most used feature. Every `NOT_AI` entry is a key of `DAILY_LIMITS`, so renaming a cap fails the test.
- `src/components/PaceCard.test.tsx`: renders the not-connected, first-day, no-views and done states from props, and the pencil calls the goal editor.

## Open questions

- Spend in money. AI runs count uses because the app has no price per feature yet. When `business-credits` sets prices, this cell becomes "spent this week" with a balance. Leo decides credits.
- Paid scrapes (Apify for `track-accounts`, `reel-style`) cost money but are not AI, so `NOT_AI` leaves them out. If Leo wants the cell to mean "paid runs", drop them from the list.
- Zernio may have an account-level daily views series. If it does, use it and drop the snapshot maths (unverified; only daily follower stats are wired today).
- The gains rely on `MetricsPost.id` staying the same between pulls, which nobody has checked against a live key. The first two pulls on Leo's account settle it: if most ids change, every post looks new and the number reads near 0.
- Two devices pulling within the same minute can each add the same gain once, so one day can read high. Acceptable for a Leo-only gauge; revisit before turning it on for anyone else.
- Whether PaceCard replaces the This week card for everyone is Leo's call ("on for everyone").

## Related

plan-goal, agent-home, learn-real-numbers, learn-weekly-report, business-credits, business-cost-preview
