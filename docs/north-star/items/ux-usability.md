# Every core job in two presses

`ux-usability` | ux | phase 9 | status: partial | /north-star#ux-usability

## Leo asked

27 Oct 2026: "do also have a UX goal within the north-star too. can refer to mobbin for references, or reference apps, or competitor apps too". His table's row for this item: "Usability: Can people complete the task easily? (Schedule a follow-up without hunting through menus.)"

## The bar

Each of the 8 core jobs starts within 2 presses of Home on a laptop and 3 taps on a phone, finishes in no more steps than Fastlane needs for it, and works on the first try.

The 8 core jobs, one per north-star phase (phase 4 is setup, so review takes its place):

| Job | Phase | Its first working screen |
| --- | --- | --- |
| J1 Find a proven post | 2 | Top posts with ranked posts on screen (/swipe) |
| J2 Remix it | 1 | The remix sheet showing a price |
| J3 Make a format | 3 | A format's make page (/make/slideshow) |
| J4 Plan a campaign | 5 | Step 1 of the wizard (/campaigns/new) |
| J5 Review drafted posts one at a time | 5 | A campaign's queue at "Post 1 of" |
| J6 Schedule a made post | 7 | The post's schedule controls |
| J7 See what worked | 7 | Analytics with What wins |
| J8 Ask the agent | 6 | A sent message on /agent/<id> |

| # | Target | Number to hit | Today (27 Oct) |
| --- | --- | --- | --- |
| U1 | Presses from Home to each job's first working screen at 1440 by 900 | 2 or fewer for each of the 8 | J1 to J8: 1, 2, 2, 2, 2, 3, 1, 2 (mean 1.9); J6 misses |
| U2 | Taps and scrolls from Home at 390 by 844 | 3 taps or fewer and 0 scrolls for each | 2, 3, 3, 2, 2, 4, 2, 2 taps (mean 2.5); J2 and J6 need a scroll; J6 misses |
| U3 | Steps to finish, against Fastlane's count for the same job | Plan a campaign in 5 confirms; schedule a made post in 3 steps after Schedule; one schedule flow from every entry point | Campaign 5 steps (meets); schedule has two flows: the 3 steps from My posts and Next up, and the Library's Schedule, which opens the calendar instead |
| U4 | First-try success in each dogfood replay: an ask or press counts when the first wording and first press reach the result, with no re-ask, typed workaround or disabled button | 90% or more | 25 Oct replay: 9 of 13 Good lines (69%); 4 of Leo's own phrasings failed first time, all 4 fixed and re-checked 26 Oct |
| U5 | Choices on the first screen: controls on Home's first screen at 1440 by 900; on Top posts at 390 by 844, whether the first post's Remix is on the first screen | Home 35 or fewer (Fastlane's whole Home shows 34 in frame t004, counted by eye); Remix on screen 1 | Home 52; Top posts' first Remix sits at y 1222 of an 844 px screen, under 42 other controls |
| U6 | One name per place: UI strings that name a page by a name nav.ts does not use | 0 | 9: "Schedule it from Pipeline" in two toasts (src/components/recruit/Agent.tsx:153, src/pages/VideoEditPage.tsx:1743), and "Swipe file" for the page nav.ts calls Top posts in 7 places (src/lib/askFor.ts:17, src/lib/agentStarters.ts:18, src/lib/agentPlans.ts:127 and 136, src/components/make/WallOfText.tsx:281, src/components/make/Slideshow.tsx:222, and the tab list's aria-label at src/pages/SwipeFilePage.tsx:268). Separately, 166 lines in src say "My posts" for the page whose tab and heading say "All posts" |

## How the best do it

Fastlane first (Leo's recordings of 19 and 20 Oct, and docs/fastlane-nav-gap.md from his 24 Oct captures):

- Five destinations and one call to action: Home, Strategy, Studio, Radar, Analytics, then "+ Start a chat with Senna". Level 2 is a tab row on the page, level 3 chips on the page.
- Home starts each job in one press. Five tiles, each with a quoted example, and the line "Tap one to start it in the box. Each make shows its price before anything runs." Next up names "THE 1 THING THAT NEEDS YOU" with Open and Schedule on the row ([Fastlane 0:04](../../../public/north-star/fastlane/t004.webp)).
- Plan a campaign is 5 steps with one card open at a time. Done steps collapse to a row with "Change", the steps still to come are greyed, and Confirm stays disabled until the step is complete ("Pick at least 5. 5 more to go"). From the empty angles step at 0:09 to "ADDED TO THE STRATEGY" at 0:28 took 19 seconds of the recording, with the 5 suggested angles back about 4 s after the press ([0:14](../../../public/north-star/fastlane/t014.webp), [0:28](../../../public/north-star/fastlane/t028.webp)).
- Schedule is one modal in 3 steps, "Step 1 of 3 | Where", and Next is disabled with its reason on hover: "Choose an account to post to Instagram." ([1:56](../../../public/north-star/fastlane/t116.webp)).
- The post reviewer puts four round buttons around the preview, Make, Swap, Edit and Skip, with number badges 1 to 4 that are probably keyboard shortcuts; the recording never pressed one, so that part is unverified (notes-1.md, [0:41](../../../public/north-star/fastlane/t041.webp)).
- Every page shows a chip such as "Loading your home" over a skeleton shaped like the page, and the header text paints first (notes-4.md 2.18).
- Its homepage quotes a user: "It took me 60 seconds to create and schedule the video to my TikTok account, all through Fastlane." ([usefastlane.ai](https://usefastlane.ai/))

Scheduling flows on Mobbin, the job that misses U1 and U3 today:

- Later, creating a post ([Mobbin flow](https://mobbin.com/flows/05f0e819-43cc-493e-a41c-322d5bcee58d)): one window from Create Post to "Schedule Post". The account sits at the top, the best time is offered inline ("Use Your Best Time to Post to Improve Engagement" / "Schedule this post for when more of your followers are online"), and the caption, first comment and media share the screen.
- Adobe Express, scheduling a post ([Mobbin flow](https://mobbin.com/flows/5fdad49c-7b31-4139-9344-b98a225c45f2)): Share, then "Share to social media" with Schedule, Publish now and a "Set as draft" switch on one panel, ending on a toast that says where it went: "Your post has been scheduled to your personal calendar for publishing." with "View in calendar".
- Semrush Social Poster, creating a post ([Mobbin flow](https://mobbin.com/flows/c829e358-5bbb-454a-a968-8ec67033b2c6)): "Post now / Schedule / Publish regularly / Save as draft" as tabs on one panel, a live preview beside it with a Calendar tab, and "Schedule & create another" as the second button.

What they share: scheduling is one surface wherever it starts, the time is suggested, the result names where it went with a link there, and the next post can start without leaving. Build items 2 and 3 take those three moves.

Other competitors:

- OpusClip sells speed in press counts: "Resize any video for every platform in 1 click", "Schedule a month's posts to all platforms in 10 minutes" ([opus.pro](https://www.opus.pro/)).
- Buffer starts a post from any page through the phone's share sheet, "with the title and link already included in the composer" ([Buffer help 636](https://support.buffer.com/article/636-buffer-browser-extension-on-the-mobile-app)); in the composer you add channels with "+" and pick a scheduling option ([Buffer help 632](https://support.buffer.com/article/632-scheduling-posts-on-the-buffer-mobile-app)).
- Metricool's homepage counts what it saves in time ("12 hours of their life back") and in presses: "saved replies go out with one click, and recurring posts are handled with templates" ([metricool.com](https://metricool.com/)).

Reference apps:

- Superhuman applies the 100 ms rule: "every action has a blazingly fast shortcut", Cmd+K finds what you need "in seconds when you don't know the shortcut", and customers "report saving an average of three hours per week on email" ([Superhuman blog](https://blog.superhuman.com/superhuman-is-built-for-speed/)).
- Linear's method: "Don't invent terms if possible ... Projects should be called projects." and "Simple first, then powerful" ([linear.app/method](https://linear.app/method/introduction)).
- Things' Quick Find: "start typing ... and instantly you're taken there" ([Things features](https://culturedcode.com/things/features/)).

## What we have today

- Nav (src/lib/nav.ts): 6 sections plus 4 at the foot, 58 pages listed in SECTIONS, all of which Leo's sign-in can see. Phones get Home, Strategy, Chats and More; Radar, Studio and Analytics are behind More, so each costs 2 taps.
- Home (src/pages/HomePage.tsx, card agent-home, live) already has Next up, five Ask the agent tiles and the composer, in Fastlane's layout. It also has three ways into the agent at 1440 px: the header's "Ask the agent" (src/components/home/AgentHome.tsx:85), the sidebar's "Start a chat with the agent" (src/pages/StudioLayout.tsx:544) and the composer itself, with a floating "Agent" button (src/components/agent/AgentDock.tsx) on other pages.
- "Jump to..." with Cmd+K sits in the sidebar (StudioLayout.tsx:560), as Superhuman and Things do it.
- Schedule has two flows. My posts, Next up's single-post row ("Schedule it", src/lib/needsYou.ts:205) and the agent's MADE block open the three steps (src/components/ScheduleSteps.tsx, card publish-schedule). The Library card's "Schedule" (src/components/library/LibraryCard.tsx:182) links to `/calendar?post=<id>&view=month` (src/lib/library.ts:118), the calendar's own date and time boxes. On the demo state that calendar card read "LinkedIn - Scheduled" while the same post sat under "Unscheduled drafts (24)". Those drafts were made before ffec181c (26 Oct, live-p7a-post D1), which puts a post sent through the steps on its day; recheck on fresh drafts before treating it as a live defect.
- Next up's grouped row, "24 posts are made and not scheduled" on the demo data, has only "Open" to `/drafts?status=draft` (needsYou.ts:209).
- Top posts (src/pages/SwipeFilePage.tsx) at 390 px, top to bottom: 8 section tabs, 6 sub-tabs (Posts, For you, Industry news, Ads, Search, Hooks), the "Formats working now" card (3 format tiles, a Topics row and an Angles row, 3 chips each on the demo data), search with a "Filters" button that already folds From, Topic, Angle and Audience behind it with a count, 4 format chips (All, Reels, Carousels, Single posts), Saved, Sort, then the first post. The fold exists; the "Formats working now" card and the always-on format chips are what push the first Remix down.

### Measured baseline, 27 Oct

How: a local dev server of origin/main (78e49edb) with Supabase answered by a mock on 127.0.0.1 (VITE_SUPABASE_URL pointed at it; every table read empty, every write and function call refused), a faked session stored under `sb-127-auth-token` for a local user with Leo's nav, and the demo device state from the 25 Oct replay (live-p6replay/state-end.json, no session in it) so the pages hold real drafts, campaigns and chats. A Playwright script pressed each path from /home and counted presses, scrolls and each control's y position at 1440 by 900 and 390 by 844. Press counts and positions depend only on the build and the seeded state, not on machine speed. Nothing reached production and nothing was spent.

The harness (a mock Supabase in Python, a seeder and the path script) and its raw output (jobs.json, explore-1440.json, job-*.png) sit in a temporary session folder, `ux-research-a/` and `ux-a-scripts/`, which is not in the repo and will not survive. Until build item 1 commits `scripts/ux/paths.mjs`, these numbers cannot be rerun; its first run on the same commit and seed is the baseline of record.

| Job | 1440 px path | Presses | 390 px path | Taps, scrolls |
| --- | --- | --- | --- | --- |
| J1 | Radar | 1 | More, Radar | 2, 0 |
| J2 | Radar, Remix | 2 | More, Radar, Remix | 3, 1 |
| J3 | Studio, Slideshow tile | 2 | More, Studio, Slideshow tile | 3, 0 |
| J4 | Strategy, Plan a campaign | 2 | Strategy, Plan a campaign | 2, 0 |
| J5 | Strategy, Open campaign | 2 | Strategy, Open campaign | 2, 0 |
| J6 | Studio, Library, Schedule | 3 | More, Studio, Library, Schedule | 4, 1 |
| J7 | Analytics | 1 | More, Analytics | 2, 0 |
| J8 | Composer, Enter | 2 | Composer, Send | 2, 0 |

jev-path was tried as a second counter on the same local server (its own Chrome, external hosts blocked). It cannot sign in, so it only works against this faked-session harness, never the live app. It reached 1 of 4 goals: J1 reached /swipe in 1 step; J2 and J4 stopped at step 0 after 24 model calls each without a click, twice; J3 clicked the composer's "Carousel" chip three times and gave up. The page text and control list did not change in 8 s on /home, /swipe, /campaigns or /studio, which points at the harness rather than the app, but that is not proven. Cost of the 7 runs: US$0.027. No target here is scored by jev-path: the Playwright counter is the score.

First try in the dogfood (live-p6replay/results.md, 25 Oct): Good lines 5, 6, 7 and 9 failed. The phrasings that failed were "add Finch as a competitor" (typing a name never enabled Add them), "can you create another one" (lost its subject), "make an explainer video about ..." (read as a talking video twice) and the refusal's cheaper chips (refused again). All four passed on 26 Oct (live-p7a/results.md, step 8).

## Build

Gate: every screen change below shows on Leo's sign-ins only (`useLeoOnly()` in components, `leoOnly(email)` elsewhere) and everyone else keeps today's screens, until Leo says "on for everyone". Item 5's word fixes reach every sign-in, so they wait for open question 5. Nothing here adds a dependency, a table or a paid call.

1. The path counter: `scripts/ux/paths.mjs`, beside ux-accessibility's `scripts/ux/a11y.mjs` and on the same harness: global Playwright, a local dev server, Supabase from a mock or fixtures, the faked session and a seeded device state, all committed under `scripts/ux/` so anyone can rerun them. It prints the U1, U2 and U5 table and writes JSON for the wave's results file. No npm dependency. It touches no card and scores all four UX cards.
2. One schedule flow (cards publish-schedule, publish-calendar, publish-library): the Library card's Schedule and the calendar rail open the same three steps that My posts opens. For the Library that is one line: `scheduleHref` (src/lib/library.ts:118) adds `schedule: 1, step: "where"`, which `links.calendar` already takes for the steps on the calendar. The done screen keeps "Open in calendar", as Adobe Express ends on "View in calendar".
3. J6 in 2 presses (cards agent-home, publish-schedule): Next up's grouped row "<n> posts are made and not scheduled" gets "Schedule the next one", which opens the three steps on the newest made post (the one the row quotes); today it has only Open to /drafts?status=draft. When the steps finish and more made posts wait, the done screen offers "Schedule the next one" beside Done, Semrush's "Schedule & create another" move.
4. Top posts' first screen (cards find-niche-feed, remix-everywhere): at 390 px, "Formats working now" folds to one line ("Formats working now", opens on tap) and the 4 format chips move behind the existing Filters button, which already counts active filters. The 6 sub-tabs stay. The first post and its Remix then sit on screen 1. The URL keeps every filter.
5. One name per place (cards agent-home, publish-library): "Pipeline" goes from the two toasts, every "Swipe file" in U6 becomes "Top posts", and one of "My posts" or "All posts" wins everywhere (open question 2). A test reads the page labels in nav.ts and fails on a UI string that uses a name from a short list of retired names.
6. Home's choices down to 35 (cards agent-home, agent-chat): keep the composer as Home's one way into the agent and drop the header's "Ask the agent" on Home, show the sidebar chats' "More" buttons on hover or focus only, and fold Learn and Feedback into the account menu, as Fastlane folds Support. The nav shape is Leo's 24 Oct Fastlane decision, so moving Learn and Feedback goes to him first (open question 3).
7. First-try defects as a class (cards agent-chat, agent-approvals): each dogfood miss is filed with its exact wording and fixed before the next wave; the replay's ledger tags every ask first-try or not, so U4 is counted, not judged.

## Done when

- [ ] `scripts/ux/paths.mjs` and its harness are in the repo, run on a local dev server in under 5 minutes, spend nothing, and print the 8-job table at both widths.
- [ ] Every job reaches its first working screen in 2 presses or fewer at 1440 by 900 and 3 taps or fewer with no scroll at 390 by 844, on Leo's sign-in.
- [ ] Library, calendar, My posts, Next up and the MADE block all open the same three schedule steps.
- [ ] Home shows 35 or fewer controls on its first screen at 1440 by 900, and Top posts shows the first Remix on the first screen at 390 by 844.
- [ ] The retired-names test passes, with "Pipeline" and "Swipe file" on its list.
- [ ] The next dogfood replay's ledger shows 90% or more of asks working first try.
- [ ] `ux-usability` flipped in `src/data/northStar.ts` with its `ours` line, in the same commit.

## Scoring each build wave

| Script | What it gives | Time | Cost |
| --- | --- | --- | --- |
| `scripts/ux/paths.mjs` | U1, U2 and U5 for both widths | about 3 min | US$0 |
| Retired-names test in `npx vitest run` | U6 | seconds | US$0 |
| The wave's dogfood ledger, tagged per ask | U4 | read only | US$0 beyond the replay's own budget |
| `jev-path` on the 8 goals, once its stale-decision bug is fixed, local harness only | a second count, phrased as a stranger would; never the score | about 2 min | about US$0.01 |

Before Vite starts, run `grep -l 'global.o=' postcss.config.* vite.config.*` as the dogfood drivers do (the 22 Oct postcss worm), and stop if it prints anything. A wave passes when no job's count goes up and every job it touched meets its bar. The card's `ours` line shows the score of targets met, "U 0 of 6" today.

## Open questions

1. Are these the right 8 core jobs? Recommended: yes, one per phase, with review standing in for phase 4's setup, which is done once.
2. "My posts" or "All posts"? Recommended: "My posts". 166 lines in src already say it, against 7 for "All posts" (the nav label and the page heading among them), and Fastlane's Studio uses a plain possessive for the same list ("Your latest", notes-3.md 3:06). Leo decides, since it renames a nav label.
3. Cut the sections to Fastlane's five, or fold Learn and Feedback into the account menu? Recommended: keep the sections and cut presses per job, since the jobs are what Leo feels; fold Learn and Feedback only if Leo agrees, and revisit the sections if U1 or U2 still misses after items 3 and 4.
4. More Mobbin flows: the schedule flows above cover J6. Recommended: add 2 flows each for J2 (remix) and J4 (campaign wizard) at the start of the first phase 9 wave.
5. Item 5's word fixes ("Pipeline", "Swipe file") change what every sign-in reads. Ship them for everyone? Recommended: yes, since both name pages that no longer exist; it is still Leo's call.

## Related

agent-home, agent-chat, agent-approvals, publish-schedule, publish-calendar, publish-library, find-niche-feed, remix-everywhere, plan-campaign, plan-review-queue, ux-workflow-fit, ux-utility, ux-desirability, ux-accessibility, ux-performance

## References

Pages fetched 27 Oct 2026 with Scrapling (`Fetcher.get(url, impersonate="chrome")`). The captures sit in a temporary session folder (`ux-research-a/pages/`) that will not survive, so each quote above carries its URL to re-read. Mobbin flows checked through the Mobbin connector on 27 Oct.

- Fastlane: [usefastlane.ai](https://usefastlane.ai/), [pricing](https://usefastlane.ai/pricing); frames t004, t014, t028, t041 and t116 in `public/north-star/fastlane/`; docs/north-star/videos/fastlane-2026-10-19/notes-1.md, notes-3.md and notes-4.md; docs/fastlane-nav-gap.md.
- Mobbin: [Later](https://mobbin.com/flows/05f0e819-43cc-493e-a41c-322d5bcee58d), [Adobe Express](https://mobbin.com/flows/5fdad49c-7b31-4139-9344-b98a225c45f2), [Semrush](https://mobbin.com/flows/c829e358-5bbb-454a-a968-8ec67033b2c6)
- [OpusClip](https://www.opus.pro/), [Metricool](https://metricool.com/), [Buffer help 632](https://support.buffer.com/article/632-scheduling-posts-on-the-buffer-mobile-app), [Buffer help 636](https://support.buffer.com/article/636-buffer-browser-extension-on-the-mobile-app)
- [Superhuman, built for speed](https://blog.superhuman.com/superhuman-is-built-for-speed/), [Linear method](https://linear.app/method/introduction), [Things features](https://culturedcode.com/things/features/)
- Dogfood: `~/Documents/Content Studio/Competitive Research/_raw/dogfood/live-p6replay/results.md`, `live-p7a/results.md`, `live-p7a-post/results.md` (D1)
