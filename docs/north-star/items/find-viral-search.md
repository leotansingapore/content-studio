# Search any public post

`find-viral-search` | find | phase 2 | status: missing | /north-star#find-viral-search

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane searches only what it has already collected, in two places. Radar has a box "Search anything: a word, a hook, a brand, a feeling" with the line "Any word works, results show as you type. Try" and chips made from ad copy ("teams use", "use apollo", "money upfront"). It covers the ads of tracked competitors and brands in your space, "144+ ads from 85 brands" in Leo's workspace (notes-3.md F8). Studio > Library has a second box over 44 niche posts and ads, "Search posts and ads, like hydration before 5pm". Neither reaches posts outside its own library.

![Fastlane 3:37, Radar's search box and suggestion chips](../../../public/north-star/fastlane/t217.webp)

![Fastlane Library: the inspiration search over the niche library](../research/fastlane-pdf/lib-tile-00.webp)

Tools that do search beyond a fixed library:

- Revid.ai searches TikTok, YouTube Shorts and Instagram Reels across a 3M+ video database, free even on free accounts. It sorts by engagement rate (weighted over raw views), likes, comments or recency, filters by length, platform and date, plays each post in place with its transcript, and keeps a daily feed matched to your topics ([features](https://www.revid.ai/features/repurpose-viral-videos), [pricing](https://www.revid.ai/llm/revid-ai-pricing-plans.md)). Its library stores the transcript and an AI description of the visuals for about 2.77M items, with an entry bar of 1,000 likes on Instagram or 25,000 views on YouTube ([ai-instructions](https://revid.ai/ai-instructions)).
- Taplio's search box takes a topic or a whole sentence over 4M+ LinkedIn posts, with filters "Published on", "Content", "Creator", "Keywords" and "Sort by", and suggested topic cards that run a search in one click ([help](https://intercom.help/taplio/en/articles/17173501-finding-post-inspiration-with-taplio)).
- Viral.app filters by keyword, brand, region, date range, minimum views and outlier factor (Pro and up) ([UGC trends](https://viral.app/ugc-trend-discovery)).
- 1of10 narrows outliers by outlier score, views, date, subscriber count (for example channels under 100k), length and language, and saves the filter for later searches ([advanced filters](https://1of10.com/features/advanced-filters/)).
- ViewStats scores each video against its expected reach and searches by topic or views, on Pro at about USD 49.99 a month per a review ([Pro](https://www.viewstats.com/pro-upgrade), [review](https://vidpros.com/viewstats-pro-review-a-growth-hack-for-your-youtube-channel/)).
- Virlo's agent search takes keywords, an intent and platforms (TikTok, Instagram, YouTube) and returns breakout creators and recurring themes, keeping findings apart from ideas to test; usage-based from USD 5 ([agency](https://virlo.ai/solutions/agency)). Its hook search costs USD 0.25 a request ([hooks](https://dev.virlo.ai/docs/hooks)).
- Eden searches a topic across 7 platforms and badges posts doing about 10x their creator's normal ([Eden](https://eden.so/)).

The pattern: type a topic, get posts from several platforms ranked by how far they beat their account's normal, then open, save or remix one.

## What we have today

- `/swipe` searches only bundled data. The Top posts box ("Search ideas, captions, creators (e.g. CPF, objection, retirement)") filters about 140 Instagram posts from 47 hand-picked Singapore creators (`src/data/topPosts.json`); the Ads tab box filters 21 ads (`searchAds` in `src/lib/adsSwipe.ts`).
- `/following` (`supabase/functions/track-accounts`, cap `track-accounts` 10) reads one named Instagram or TikTok account at a time. There is no keyword search.
- `/analytics` Creator lookup (`src/components/CreatorLookup.tsx`) reads one Instagram handle through `analyze-ig-creator`. That function is not in `supabase/functions/`; this repo keeps only a copy under `supabase/snapshots/functions/analyze-ig-creator`.
- Paid search plumbing that already exists: Apify (`APIFY_API_KEY`, the `clockworks~tiktok-scraper` actor in `clone-reel` and `trend-scout.mjs`), DataForSEO (`mentions`, `youtube-captions`, `market`), Jev, daily caps.
- One keyword search already runs, but only on Leo's Mac at drop time: `scripts/sg-feeds.mjs` searches YouTube with `api-anything call youtube recent q=<query>` (logged out, free) to build "Popular on YouTube in Singapore" on `/trends`. It is not reachable from the app or a server.
- `docs/north-star/research/current-app.md` lists "Viral search / ad library search by keyword" as missing.

Status missing.

## Build

Scope: a Search tab on `/swipe` that searches public TikTok videos and YouTube videos by keyword, on the server, ranked by how far each post beat its account's size, with Remix on every result. Instagram is left out of v1 (see Open questions).

### Screens and states

Files:

- `supabase/functions/viral-search/index.ts` (new): auth, allowlist, caps, the two fetches, Jev, the answer.
- `supabase/functions/viral-search/logic.ts` (new, pure) parses the request, turns each platform's items into one `Found` type, works out the reach ratio, builds the Jev ask and sorts, with its tests in `logic.test.ts` beside it.
- `src/lib/viralSearch.ts` (new): the job outside React (the `runCheck` pattern in `src/lib/following.ts`), the saved searches, `remixUrlFor(found)`.
- `src/components/ViralSearch.tsx` (new) draws everything inside the tab.
- `src/pages/SwipeFilePage.tsx`: a fourth tab "Search", shown only when `leoOnly(email)`; add `"search"` to the `tab` allowed list for those sign-ins only.
- `supabase/functions/_shared/usageCaps.ts`: two caps (AI and cost).

Layout:

```
[ Search TikTok and YouTube (e.g. CPF, first job, insurance myths) ] [ Search  ~US$0.10 ]
8 left today
Recent: [cpf] [first job] [hospital bills]
[All 31] [TikTok 19] [YouTube 12]      Sort [Beat their size v]   Posted [90 days v]
+-------------+ +-------------+ +-------------+
| [cover]     | | [cover]     | | [cover]     |
| TikTok @x   | | YouTube Ch  | | ...         |
| caption...  | | title...    | |             |
| 1.2M views  | | 340K views  | |             |
| 14x their   | | 3 days ago  | |             |
| followers   | |             | |             |
| [Remix] [o] | | [Remix] [o] | |             |
+-------------+ +-------------+ +-------------+
Show 6 less relevant
```

States:

- Empty, nothing searched yet: the box, "8 left today", and one line of suggestions from the brand's Plan topics (`loadPositioning`), such as "Try: CPF, first job, retirement", and no results area below.
- A link with `?q=` that has a saved search under 24 hours old: those results at once, with "Searched 3 hours ago." and a quiet "Search again" button. A link with `?q=` and no saved search fills the box and waits for the tap. Opening a link never spends money.
- Searching: the button reads "Searching..." and is disabled; under it, one row per platform, "TikTok: searching" turning into "TikTok: 19 found", and the line "This takes about a minute. You can leave this page." The job keeps running if the user navigates away, and the results are saved when they arrive.
- Done: the grid, platform chips with counts, sort and period selects. Results Jev judged off-topic sit behind "Show N less relevant".
- Partial: one platform failed or ran out of time. A notice over the grid: "TikTok took too long, so these are YouTube only. Search again to try TikTok." That search still counts once.
- No results: "Nothing found for "cpf". Try a shorter phrase or a single word."
- Over the daily cap: the server's 429 text, "You've used all 10 for today. It resets at 8am Singapore time.", under the box; saved searches stay usable.
- Over the global cap: the server gives the adviser's use back and answers 429 `{ code: "daily_limit", error: "Search is busy today. Try again after 8am Singapore time." }`, the way `ai-video` handles `ai-video-global`. The app shows that text under the box.
- Not allowed (server allowlist): "Search isn't switched on for your account yet."
- Not configured (no key): "Search isn't switched on yet."
- Failed: "Couldn't search right now. Try again in a few minutes." with "Try again". The typed words stay in the box.
- A cover that fails to load (TikTok and YouTube cover links expire): the platform icon on a muted tile.

### Copy

- Tab label: "Search".
- Box placeholder: "Search TikTok and YouTube (e.g. CPF, first job, insurance myths)". Aria label "Search public posts".
- Button: "Search", with a price chip "~US$0.10" and under it "{n} left today" (`useUsesLeft` from `src/lib/aiUsage.ts` on `viral-search`).
- Sort options: "Beat their size" (default), "Most views", "Most engagement", "Newest". Period: "Last 30 days", "Last 90 days" (default), "Any time".
- Card lines: "{compact views} views"; "{n}x their followers" when the ratio is 3 or more; "{relative date}"; the platform and "@handle" or the channel name.
- Card buttons: "Remix" (primary) and an external-link icon button with aria label "Open on TikTok" or "Open on YouTube". When `find-save-anywhere` ships, its Save button sits between them.
- On the Top posts tab, when a search there finds fewer than 5 posts, the line "Only {n} in the hand-picked posts. Search TikTok and YouTube for "{q}"" sits under the grid as a link to `?tab=search&q=`.

### Data

- No table. The server stores nothing about the search.
- `content-studio-search-${scoped(userId)}` (synced, per brand): `{ searches: [{ q, at, results: Found[], failed: { tiktok?: string, youtube?: string } }] }`, newest first, at most 5 searches, at most 40 results each, captions cut to 200 characters, and a sixth search drops the oldest. Rewriting the list is the only delete, so a removed search stays removed.
- `Found`: `{ id: "tiktok:<id>" | "youtube:<id>", platform, url, author, title, caption, cover, views, likes, comments, shares, followers, postedAt, durationSec, ratio, relevance }`, every number nullable.

### AI and cost

Server function `viral-search`, `POST { q, platforms? }`, JWT on, `q` 2 to 60 characters after trimming:

1. `isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)` (from `supabase/functions/market/logic.ts`); anyone else gets 403 `{ code: "not_allowed" }` before any paid call. The `NORTH_STAR_USERS` secret does not exist yet: `find-competitors` creates it with Leo's two uids, and if this item ships first, set it here the way `market` reads `MARKET_USERS` today.
2. `consumeUsage(admin, uid, "viral-search")` then the global counter on `GLOBAL_COUNTER_USER`. New entries in `DAILY_LIMITS`, with a comment like the others:
   - `"viral-search": 10` (per adviser per day)
   - `"viral-search-global": 40` (across everyone; about USD 4 a day at most)
   Refund both with `refundUsage` when both platforms fail.
3. In parallel, each under 70 seconds:
   - TikTok: Apify `clockworks~tiktok-scraper` with a keyword search input and 20 results. Its input field names for a keyword search are unverified, so confirm them on a 5-result run before writing the parser, then keep views, likes, comments, shares, author followers, posted time, duration, cover and URL.
   - YouTube: DataForSEO `serp/youtube/organic/live/advanced` with the keyword, location Singapore (2702), language en, depth 20. The fields for views, channel and publish date are unverified; confirm on one call first.
4. `ratio` = views divided by followers when both are known (TikTok); null for YouTube unless the SERP item gives subscribers. Under "Beat their size", results with no ratio sort after the rest by views, so YouTube results usually sit below TikTok ones.
5. Jev, one call: the state lists the results as numbered lines (platform, author, title or caption, views), and asks one `noul` per result, `r0` to `r39`: "Is result {n} about "{q}" and something a financial adviser in Singapore could learn from or remake for their own clients?" Keep `relevance` on each result; results under 0.4 go behind "Show N less relevant" (proposed threshold). If Jev refuses that many questions in one call, split into calls of 10. Without Jev every result shows.
6. Answer `{ results, failed }`.

Before switching the threshold on for anyone but Leo, run 20 of Leo's real searches with the threshold off, print every result with its relevance, read the ones between 0.3 and 0.6, and set the threshold from that read.

Cost per search, all estimates: Apify 20 TikTok results at USD 0.003 to 0.005 each, about USD 0.06 to 0.10 (unverified, read the actor's price at build time); DataForSEO YouTube SERP, a cent or less (unverified); Jev well under 1 US cent. That is where the chip's "~US$0.10" comes from. A repeat of a saved search within 24 hours is free.

Remix (`remixUrlFor` in `src/lib/viralSearch.ts`):

- TikTok: `/clone?url=<url>` (Clone a reel reads the transcript and pacing).
- YouTube: Write via `links.generate({ pillar: "topic", detail: <title cut to 80>, format: "short-video", ctx })`, where `ctx` gives the title, channel, views and a line "Write my own take on this idea for my clients. Do not copy its wording. No promised returns, no named insurer products, no invented numbers."

### Deep links

- `/swipe?tab=search` opens the tab (Leo only; others fall back to `posts`). Replace.
- `/swipe?tab=search&q=cpf` fills the box and shows the saved results for "cpf" if any. Replace while typing (the `useUrlSearch` behaviour).
- `&platform=tiktok` (`all`, `tiktok`, `youtube`), `&sort=reach` (`reach`, `views`, `engagement`, `newest`; default `reach`), `&posted=30d` (`30d`, `90d`, `any`; default `90d`). Replace.
- `links.swipe` gains `"search"` in `tab` and the params `platform` and `posted`; `sort` already exists. The Top posts tab reads `sort` with its own `SORTS` values, so `ViralSearch` reads it with a separate `allowed` list (`reach`, `views`, `engagement`, `newest`). Add `platform: null` and `posted: null` to the params `setTab` in `SwipeFilePage.tsx` clears (it already clears `q` and `sort`). Add the rows to `docs/deep-links.md`.

## Done when

- [ ] `viral-search` is deployed with JWT on, `APIFY_API_KEY`, the DataForSEO login and `NORTH_STAR_USERS` set; a call from a non-listed account gets 403 and spends nothing.
- [ ] On Leo's sign-in, `/swipe?tab=search&q=cpf` with no saved search fills the box and does not search until "Search" is tapped.
- [ ] A search returns TikTok and YouTube results within about 90 seconds, saved under `content-studio-search-<scope>`; reloading the same link shows them with "Searched ... ago" and spends nothing.
- [ ] Leaving the page mid-search and coming back shows the results.
- [ ] The 11th search in a day shows the cap message, and the counter in `cs_ai_usage` reads 10.
- [ ] Remix on a TikTok result opens `/clone?url=` with that link; on a YouTube result it opens Write with the brief.
- [ ] The Top posts tab shows the "Only {n} in the hand-picked posts" line when a search there finds fewer than 5.
- [ ] Not Leo: no Search tab, and `?tab=search` lands on Top posts.
- [ ] Checked by eye at 390 px and 1440 px; `npm run build` and the full `npx vitest run` pass; `find-viral-search` flipped in `src/data/northStar.ts`.

## Tests

- `supabase/functions/viral-search/logic.test.ts`: request parsing trims, refuses under 2 or over 60 characters and refuses an unknown platform; shaping a TikTok fixture item and a DataForSEO fixture item gives `Found` with nulls where data is missing; `ratio` is null without followers; sorting by reach puts nulls last; the Jev ask has one question per result and the threshold splits results at 0.4.
- `src/lib/viralSearch.test.ts`: saving a sixth search drops the oldest; a saved search under 24 hours is returned for the same query (trimmed, case-insensitive) and one over 24 hours is not; `remixUrlFor` gives `/clone?url=` for TikTok and a Write link without the caption text for YouTube.
- `supabase/functions/_shared/usageCaps.test.ts`: the two new keys exist with 10 and 40.
- `src/lib/links.test.ts`: `links.swipe({ tab: "search", q: "cpf", sort: "reach" })` gives `/swipe?tab=search&q=cpf&sort=reach`.

## Open questions

- What about Instagram? This repo already found that Instagram hashtag feeds return only brand-new, low-engagement posts (`scripts/trend-scout.mjs`), so a keyword search there would rank poorly. Leo decides between leaving Instagram to Following and Creators, or paying for a different Instagram search actor after a test.
- Should results be cached across users? Two advisers searching "CPF" on the same day pay twice. A server cache across users needs a new table, which is a schema change for Leo.
- The price "~US$0.10" is an estimate until the first ten real searches are measured; update the chip from the Apify run costs.

## Related

find-niche-feed, find-outlier-score, find-competitor-posts, find-save-anywhere, find-ai-tagging, find-search-topics, find-trending-formats, remix-any-link, remix-everywhere, business-cost-preview
