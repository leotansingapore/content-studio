# Fast enough that nobody waits on the app

`ux-performance` | ux | phase 9 | status: partial | /north-star#ux-performance

## Leo asked

27 Oct 2026: "do also have a UX goal within the north-star too. can refer to mobbin for references, or reference apps, or competitor apps too". His table's row for this item: "Performance: Does it respond quickly enough? (Open a contact or search without disruptive delays.)"

His own law 6 in `~/.claude/UX.md`: "Interfaces feel more productive when feedback appears within about 400ms."

## The bar

On a mid-range phone on a slow 4G line, every core page is usable within 2.5 seconds, every press answers within 400 ms, and nothing on the page jumps.

The test phone is Lighthouse's mobile profile: 150 ms round trips, 1.6 Mbps down, the CPU slowed 4 times. Core pages are the 13 in `ux-accessibility`. Every timing below that a person would feel is taken under the real hostname, `consultant-content-studio.vercel.app`, either on production (signed out) or on a local build mapped to that name (signed in); see the scoring table.

| # | Target | Number to hit | Today (27 Oct) |
| --- | --- | --- | --- |
| P1 | Core Web Vitals at p75 from real visits: LCP, INP, CLS | LCP 2.5 s or less, INP 200 ms or less, CLS 0.1 or less on every core page | no field data; lab on production: /auth LCP 4.7 s, /roadmap 4.2 to 4.3 s; lab on a local build: Home CLS 0.30 |
| P2 | Time to a usable page, signed in, on the test phone with Supabase at 150 ms | Home 1.5 s, other core pages 2.5 s; 0 Auth round trips before the first paint | upper bounds from 127.0.0.1 under heavy load: Home 3.1 s, Calendar 4.1 s, My posts 4.6 s, Write 5.3 s; 5 Auth round trips a load |
| P3 | Press to feedback: time from a press to a visible change | 400 ms or less on every press of the 5 core jobs; event duration 200 ms or less at 4x CPU | route skeletons show at once; click events 48 to 160 ms; hooks' loading line 28 to 50 ms |
| P4 | JavaScript sent before the first page draws, gzipped, as `vite build` reports it (1 kB = 1,000 bytes) | entry 200 kB or less; entry plus any core route 374 kB or less (Russell's 365 KiB) | entry 359 kB; with Write 399 kB, with the video editor 452 kB |
| P5 | Route switch: sidebar press to the new page's heading, on the test phone | 1.0 s or less on every core route | upper bounds from 127.0.0.1: Calendar 1.4 s, Analytics 0.9 s, Studio 0.7 s |
| P6 | Finished media: a talking video from Approve to made, p50 | 4 min or less (Fastlane's 3 min 43 s) | 8 min 23 s and 13 min 13 s on 25 Oct; the second included a 5 min join stall fixed that day |

## How the best do it

- Google's Core Web Vitals call a page good at LCP 2.5 s or less, INP 200 ms or less and CLS 0.1 or less, judged "at the 75th percentile" of real visits on mobile and desktop ([web.dev vitals](https://web.dev/articles/vitals), [INP](https://web.dev/articles/inp)).
- Superhuman builds to "the 100ms rule": "every interaction should be faster than 100ms", from Gmail's creator Paul Buchheit, because 100 ms is the threshold "where interactions feel instantaneous" ([Superhuman blog](https://blog.superhuman.com/superhuman-is-built-for-speed/)). Nielsen's limits say the same in three steps: 0.1 s feels instant, 1 s keeps the flow, and past 10 s people need a progress indicator ([NN/g response times](https://www.nngroup.com/articles/response-times-3-important-limits/)). Leo's 400 ms is the Doherty threshold ([Laws of UX](https://lawsofux.com/doherty-threshold/)).
- Linear syncs every change as it happens; when changes cannot reach the server it stores them on the device and retries, and when many wait it shows "Syncing" beside the workspace name with the number still waiting ([Linear docs](https://linear.app/docs/get-the-app), [sync engine talk](https://linear.app/now/scaling-the-linear-sync-engine)). The person never waits on the network to keep working.
- Notion moved its browser cache to WASM SQLite and cut page navigation time by 20 percent, and by 28, 31 and 33 percent for users in Australia, China and India, where API answers are slower ([Notion engineering](https://www.notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite)). Singapore advisers on mobile data sit in the same place.
- Alex Russell's 2024 budget, for a page to be interactive in 3 seconds on the p75 phone and network over two connections, is about 730 KiB in all, "with no more than 365KiB of compressed JavaScript" ([Performance Inequality Gap 2024](https://infrequently.org/2024/01/performance-inequality-gap-2024/)). That is P4's second number.
- Fastlane, in Leo's recordings: every page and tab draws its header and tabs first, with a named chip over skeleton rows ("Loading your strategy", "Loading workspaces", "Loading Studio"), and the grid fills about a second later (`videos/fastlane-2026-10-20-settings/notes.md` 0:14, 0:57, N10; `videos/fastlane-2026-10-19/notes-2.md`). Its agent shows a running timer while it thinks ("Thinking", "2s", `notes-4.md` 5:05). Its agent answered "what can you do" in 8.1 s and made a talking video in 3 min 43 s (dogfood replay, 25 Oct).
- Mobbin shows the same split. Neon draws its sidebar and the page heading "Computes" and leaves only the table rows as skeletons ([Mobbin, Neon](https://mobbin.com/screens/9b5b1374-c015-495b-abcb-9cce659c741b)); Chronicle names the wait, "Creating storyline...", over its skeleton cards ([Mobbin, Chronicle](https://mobbin.com/screens/fbeab89c-f418-442b-9fa2-ba67efa47c56)). Square greys out the whole page, heading included, so nothing real shows until the data lands ([Mobbin, Square](https://mobbin.com/screens/09371ef3-f0d0-4fc9-8ab1-607ab3d0e4ab)); our `ProtectedRoute` spinner is closer to Square's.
- Buffer, Later and Metricool publish no speed numbers for their apps.

## What we have today

Measured 27 Oct on origin/main 78e49edb, whose entry file `index-DJUBpWvq.js` was the one production served that morning; the build sizes and code lines were checked again at 8664c00d. Load average was 19 to 24 for Lighthouse and 22 to 120 for the local runs, so local milliseconds are upper bounds; the counts are exact. The scripts and raw files lived in a session scratchpad and are not in the repo.

Public pages, Lighthouse 12.6 on production, signed out, simulated throttling, two runs each:

| Page | Mobile score | FCP | LCP | TBT | CLS | Desktop LCP |
| --- | --- | --- | --- | --- | --- | --- |
| /auth | 0.71 | 4.7 s | 4.7 s | 10 to 40 ms | 0 | 1.0 to 1.1 s |
| /roadmap | 0.76 to 0.77 | 3.8 s | 4.2 to 4.3 s | 70 to 90 ms | 0 | 1.0 s |

- The sign-in page downloads 357 KiB of script, the whole app's entry, and Lighthouse estimates 233 KiB of it unused there. Fonts add 191 KiB on /auth (Roboto Serif and Inter) and 47 KiB on /roadmap. The stylesheet blocks the first paint for about 160 ms.
- `Auth`, `PublicRoadmap`, `HomePage` and `StudioLayout` are imported eagerly in `src/App.tsx`, so they and everything they import ride in the entry.

The build at 8664c00d (`vite build`, 305 script files): the entry is 1,137 kB raw and 359 kB gzipped. Gzipped route chunks: Write 39.4 kB, Analytics 35.8, Calendar 20.5, Carousel 20.2, the agent composer 21.8, the video editor 92.8 (plus `mp4box` 44.9 and `vision_bundle` 46.0 when it needs them), North star 100.4.

Signed in, measured on the production build served by `vite preview` (gzip, plain HTTP) at 127.0.0.1, with DevTools throttling, every Supabase call answered by fixtures at a fixed delay (nothing reached production), and everyone else's view, since `?asLeo=1` works only in a dev build. Production's hostname, HTTP/2 and Vercel's edge were not in the loop, so these are not field numbers:

- `ProtectedRoute` waits for a full pull of `cs_user_data` before it draws anything (`src/components/ProtectedRoute.tsx:28`).
- Every page load makes 5 `auth.getUser()` calls (8 to 12 in the dev build). Each is a round trip to Supabase Auth under supabase-js's auth lock, and every table read waits behind that lock. Callers on load include `StudioLayout.tsx:386`, `ProfileSwitcher.tsx:35`, `feedback/AssistantMount.tsx:28` and `HomePage.tsx:190`; `src` has 52 such calls in 42 files outside tests. The academy lost about 230 ms a page on a phone to one of these on 18 Oct. `src/lib/useLeoOnly.ts` already reads the session once with `getSession()` and no lock.
- Every page load also calls 3 edge functions before anything is pressed: `social` status, `team-board` me and `market` status.
- Home draws a simple layout first, then swaps to the full one once `getUser` returns (`HomePage.tsx:190`). At 150 ms per call that swap was a CLS of 0.30, three times the bar. Calendar shifted 0.081; My posts 0.
- First usable page (heading visible) on the test phone with Supabase at 150 ms: Home 3.1 s (LCP 3.4 s), Calendar 4.1 to 4.2 s, My posts 4.6 to 4.9 s, Write 5.3 to 5.8 s.
- Route switches on the test phone, press to new heading: Calendar 1.33 to 1.44 s, Analytics 0.90 to 0.93 s, Studio 0.65 to 0.77 s, Top posts 0.68 s, Home 0.07 to 0.14 s. A skeleton (`RouteSkeleton`, `StudioLayout.tsx:72`, the Suspense fallback at line 733) shows as soon as the press lands, so the 400 ms feedback holds even when the page is late. The press itself took 48 to 160 ms of main thread, Calendar the most.
- Field data: none. `index.html` loads Vercel Web Analytics (`/_vercel/insights/script.js`), which counts visits but not Web Vitals, and which a localhost run skips. PageSpeed Insights' keyless quota was used up, so there is no Google-run number either.

From the paid dogfood runs: the agent answered "what can you do" in 2.35 s against Fastlane's 8.1 s; Try new hooks showed its loading line in 28 to 50 ms; the two talking videos took 13 min 13 s and 8 min 23 s from Approve. The 13 min one sat 5 min behind a wall of text's join (p6 replay D1), which d3e501af fixed on 25 Oct and no live run has re-checked. One Analytics cold load hung 2 minutes with 5 "Lock broken by another request with the 'steal' option" errors, which the run marks as possibly a dev server effect (p7a-post D8); one Zernio numbers read took 27.2 s (D9).

So the status is partial: presses get feedback fast and route skeletons are in place, but first loads miss the bar on a phone, Home jumps, and nobody sees field numbers.

## Build

Who it reaches: items 1 to 7 change how the app loads for every sign-in, with nothing new on screen, and item 1 changes shared code every page uses. They go to everyone only on Leo's yes (first open question); until then each is built and timed on a branch with the scoring script, and the parts that can be (Home's layout, prefetch) sit behind `useLeoOnly()`. Item 8 needs Leo for money or a schema change.

1. One session read (`agent-home`, `publish-accounts`): replace the 5 `getUser()` calls on load with the shared session read in `src/lib/useLeoOnly.ts` (one `getSession()`, no Auth round trip), and add a source test that fails on `auth.getUser(` inside a component's mount effect (the repo has no ESLint). The server still checks the token on every call.
2. Draw from the device first (`agent-home`): `ProtectedRoute` draws the shell from localStorage as soon as a session exists and pulls in the background, the way Neon draws its frame and heading; a page that needs fresh rows says so on its own. `ux-reliability` item 2 needs the same change for outages and owns the sync chip.
3. Home without the swap (`agent-home`, `business-onboarding`): decide first-run from device data, draw one layout from the first frame, and reserve the height of cards that fill later.
4. A smaller entry (`business-onboarding`): lazy-load `Auth` and `PublicRoadmap` in their own chunks and move reference data and `react-markdown` out of the entry, so /auth stops paying for the studio, using `lazy()` as today and never a `manualChunks` object (CLAUDE.md), until the entry is 200 kB gzipped.
5. Fonts (`brand-kit`, where the serif is chosen): load Roboto Serif only on the pages that use it, and only the weights in use.
6. Fewer calls on every page (no card): cache the 3 on-load function answers (social status, team-board me, market status) for the session and refresh them in the background.
7. Prefetch the next page (`publish-calendar`, `edit-text-post`, `publish-library`): after the first page is idle, fetch the Calendar, Write and My posts chunks; on a sidebar hover or touch start, fetch that route's chunk.
8. Field numbers (no card): a Web Vitals reporter (LCP, INP, CLS per route, p75 a week). Two ways, both Leo's call: turn on Vercel Speed Insights (a paid add-on whose price is unverified, loaded as a script tag the way Web Analytics is), or send the numbers to an edge function and a new table (a schema change).
9. Video wait (`formats-talking-head`): the join stall is fixed (d3e501af, 25 Oct); what is left is to start the voice and the presenter picture in parallel and time two videos in the next paid run.

## Done when

- [ ] Lighthouse mobile on production /auth and /roadmap: LCP 2.5 s or less and CLS 0.1 or less, two runs each on a quiet machine.
- [ ] `scripts/ux/perf.mjs` under the real hostname on the test phone: Home usable in 1.5 s, every other core page in 2.5 s, CLS 0.1 or less on all, 0 `auth/v1/user` calls before the first paint.
- [ ] Every press on the 5 core jobs changes the screen within 400 ms in the press script, and no press's event runs longer than 200 ms at 4x CPU.
- [ ] `vite build`: entry 200 kB gzipped or less; entry plus each core route 374 kB or less.
- [ ] Route switches on the test phone: 1.0 s or less on every core route.
- [ ] Once Leo picks a way in item 8: field LCP, INP and CLS at p75 for a week are on a page Leo can open, and meet the bar.
- [ ] Two talking videos in a dogfood run reach made in 4 min or less each.
- [ ] `src/data/northStar.ts` item `ux-performance` flipped with its `ours` line in the same commit.

## Tests

- A source test that fails on `auth.getUser(` in a mount effect (item 1); it fails today on the 4 callers named above.
- A size test, or a script step after `vite build`, that fails when the entry passes 200 kB gzipped (item 4).
- `scripts/ux/perf.mjs` is the timing check; it runs by hand per wave, not in vitest.

## Scoring each build wave

| Script | What it gives | Time | Cost |
| --- | --- | --- | --- |
| `npx vite build --outDir <scratch>` plus a size table from its log | P4 per route | about 40 s under load | US$0 |
| `npx lighthouse@12.6.0` on production /auth and /roadmap, mobile and desktop, 2 runs each, after the deploy has been warmed | P1 lab, signed out | 3 min | US$0 |
| `scripts/ux/perf.mjs` (to write): the build served over HTTP/2 with brotli, Chrome started with `--host-resolver-rules="MAP consultant-content-studio.vercel.app 127.0.0.1:<port>"`, the live `/_vercel/insights/script.js` copied in so the page loads what production loads, Supabase answered by fixtures at 150 ms, test-phone throttling; first load of 4 core pages x 3, then a sidebar walk x 3 | P2, P3 and P5, CLS, Auth round trips | 5 min | US$0 |
| The field report, once item 8 ships | P1 field | read only | US$0 plus Speed Insights' price if chosen |
| The paid dogfood's video timings, only in waves that touch making | P6 | in the run | about US$5.50 for 2 videos |

Rules (from the academy's speed work, `academy-perf-measurement.md`): check `uptime` first and run when the load is under 20, or interleave the old and new build run by run; never run Lighthouse while a crawl or another script runs; warm a fresh deploy before timing it; never sign in to production for a timing. A wave passes when no number gets worse by more than 10 percent and the pages it touched meet their bar, and the card's `ours` line then carries the count, for example "P 2 of 6".

## Open questions

- Leo: items 1 to 7 change how the app loads for everyone (nothing new on screen, but shared code under every page). Ship them to everyone once the scoring script shows the gain, or hold them for your sign-ins? Recommended: everyone, one item per wave, since a load path is hard to split per user; your call.
- Leo: field numbers through Vercel Speed Insights (a paid add-on, price unverified) or through our own table (a schema change)? Recommended: Speed Insights first, because it needs no table, no new code path and no npm package if added as a script tag; switch to a table only if the price is a problem.
- Leo: the test phone is Lighthouse's default profile. Should we buy one cheap Android phone and time the 5 jobs on it once a phase? Recommended: yes (price unverified), since advisers are on phones and lab profiles miss real heat and memory limits.
- The 4-minute video bar depends on Higgsfield's queue as much as on our code; if Higgsfield alone takes longer, P6 moves to "our part 30 s or less".

## Related

agent-home, business-onboarding, publish-accounts, publish-calendar, publish-library, edit-text-post, brand-kit, formats-talking-head, remix-any-format, ux-accessibility, ux-reliability (item 2 is shared), ux-usability (its loading chips), ux-trust

## References

Fetched 27 Oct 2026 with Scrapling; Mobbin screens found through the Mobbin connector the same day. The captures were kept in a session scratchpad and are not in the repo, so each link above is the source.

- [web.dev Core Web Vitals](https://web.dev/articles/vitals), [INP](https://web.dev/articles/inp), [LCP](https://web.dev/articles/lcp)
- [Superhuman, the 100ms rule](https://blog.superhuman.com/superhuman-is-built-for-speed/)
- [NN/g, response times](https://www.nngroup.com/articles/response-times-3-important-limits/); [Laws of UX, Doherty threshold](https://lawsofux.com/doherty-threshold/)
- [Linear, get the app (sync and offline)](https://linear.app/docs/get-the-app); [Linear sync engine](https://linear.app/now/scaling-the-linear-sync-engine)
- [Notion, WASM SQLite](https://www.notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite)
- [Alex Russell, Performance Inequality Gap 2024](https://infrequently.org/2024/01/performance-inequality-gap-2024/)
- Mobbin: [Neon](https://mobbin.com/screens/9b5b1374-c015-495b-abcb-9cce659c741b), [Chronicle](https://mobbin.com/screens/fbeab89c-f418-442b-9fa2-ba67efa47c56), [Square](https://mobbin.com/screens/09371ef3-f0d0-4fc9-8ab1-607ab3d0e4ab)
- Fastlane: `docs/north-star/videos/fastlane-2026-10-19/notes-2.md`, `notes-4.md`, `videos/fastlane-2026-10-20-settings/notes.md`
- Dogfood: `~/Documents/Content Studio/Competitive Research/_raw/dogfood/live-p6replay/results.md`, `live-p7a/results.md`, `live-p7a-post/results.md`
- Memory: `supabase-getuser-holds-auth-lock.md`, `academy-perf-measurement.md`, `seo-audit-measurement-traps.md`
