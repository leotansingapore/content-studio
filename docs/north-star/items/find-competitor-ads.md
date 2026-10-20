# Their ads, checked every week

`find-competitor-ads` | find | phase 2 | status: partial | /north-star#find-competitor-ads

## Leo asked

19 Oct 2026: "find ways where one can key in their competitors and the app will scrape their ads and top performing social media posts"

This item is the "scrape their ads" half. The list of competitors comes from `find-competitors`.

## How the best do it

Fastlane shows a section "Remix a competitor ad" with a count chip "105", the sub line "What Salesforce and Apollo.io are running" and a link "104 of 105 ads | 87 running >". Under the watch bar sit brand pills "All 104", "Salesforce 15", "Apollo.io 20". Four of the six watched competitors get no pill and nothing on screen says why.

![Fastlane 1:22](../../../public/north-star/fastlane/t082.webp)

Each card has a type badge ("Static" or "Video"), the creative (or an image icon and "No preview"), the brand avatar and name, one truncated line of ad copy, a run line such as "3 years running | linkedin" or "21 days running | Meta", and a footer with "Remix" and the price ("12 credits" for a static ad, "130 credits" for a video). The section ends with "See all 104 ads >" and the note "Senna checks your competitors for new Meta ads every week."

![Fastlane 1:24](../../../public/north-star/fastlane/t084.webp)

Others:

- Foreplay Spyder scrapes Meta's Ad Library around the clock for every tracked brand and keeps ads after Meta removes them; brands other users track come with history back to August 2023. Sources: [getting started](https://help.foreplay.co/articles/2758078-getting-started-with-spyder), [Spyder](https://www.foreplay.co/spyder).
- Gethookd Brand Spy: paste a rival's Ad Library URL; every new ad lands in a feed with its launch date and the count of ads live now, plus a format breakdown and daily active-ad counts. One review says a Brand Spy costs 2 credits (unverified on Gethookd's own pages). Sources: [site](https://www.gethookd.ai/), [review](https://dropshippingchampions.com/blog/gethookd-review).
- Swipekit Brand Tracker checks a brand's Ad Library page regularly and charts how many ads it added over time; check frequency unverified. [Source](https://swipekit.app).
- PiPiAds Ad Tracker notifies you when a tracked advertiser pushes new creatives; 2 trackers on Basic, 10 on Advanced. [Source](https://www.pipiads.com/).
- Meta's own Ad Library API returns ads that never reached the EU only when they are political or issue ads, so Singapore commercial ads cannot come from it. [Source](https://developers.facebook.com/docs/graph-api/reference/ads_archive/).

## What we have today

- `/swipe?tab=ads` (`src/components/AdsSwipe.tsx`, `src/lib/adsSwipe.ts`, `src/data/adsSwipe.json`): 21 real Singapore Meta ads from 7 fixed advertisers, 3 each (DBS, Prudential Singapore, Singlife, SleekFlow, Thomson Medical, Virgin Active Singapore, "WATI - WhatsApp Team Inbox"), fetched 2026-10-12. Each has format, headline, body, CTA, start date ("Running N days"), platforms, a saved picture and a Jev hook family. "Write a post like this" opens Write through `buildAdWriteUrl`. Its brief names the advertiser, industry, start date and hook family and quotes the headline and up to 280 characters of the ad's first two lines as context, then tells Write not to reuse the wording, brand or claims and not to recommend a product. `SwipeAd` requires `industry` and `hookFamily`, which a scraped competitor ad does not have.
- The scrape runs on Leo's Mac, not the server: `~/.local/bin/ads-swipe-collect` (launchd `com.leo.ads-swipe`, Mondays 07:00 SGT) reads the Ad Library logged out with api-anything, keeps the 3 longest-running ads per advertiser (`PER_ADVERTISER = 3`, no `{{product.` templates), copies each picture at 720 px because Meta's links expire, has Jev pick the hook family, then `content-studio-drop.sh ads-swipe` runs `scripts/ads-swipe.mjs` to commit `src/data/adsSwipe.json` and `public/ads/`. Meta answers a burst of logged-out reads with a challenge page, which stops the run. Users cannot add an advertiser.
- `APIFY_API_KEY` is set on the project and used by `track-accounts` and the account audit (`supabase/functions/_shared/auditRunner.ts`). Its `apifyItems` is not exported, runs `run-sync-get-dataset-items` with a fixed 90 s timeout (`APIFY_TIMEOUT_SECS`, aborted at 105 s), and throws `AuditError` with audit wording ("Account audits are paused while the scraping account is sorted out...").
- Nothing scrapes the ads of a competitor a user keyed in. Status partial: the weekly scrape and the card exist for a fixed list only.
- The gate `leoOnly` (`src/lib/leoOnly.ts`) is in the north-star worktree and not on origin/main (checked at f2cb275, 2026-10-20).

## Build

The "Their ads" view of `/competitors` (`?view=ads`, the default once a brand has a competitor), fed by a new `ads` mode of the `competitors` edge function that `find-competitors` creates.

### Screens and states

```
Their ads  58                                        58 ads | 41 running >
What Singlife, Prudential Singapore and 2 more are running
[ All 58 ] [ Singlife 22 ] [ Prudential Singapore 30 ] [ Great Eastern 6 ]
Not running Meta ads: Josh Tan, Seedly
+--------+ +--------+ +--------+ +--------+ +--------+
| Video  | | Image  | | Image  | |Carousel| | Video  |
|  [>]   | |        | |No prev.| |        | |  [>]   |
|SL Singl| |PR Prud | |...     | |        | |        |
|copy... | |copy... |
|21 days running | Facebook, Instagram
|[Remix] [Open on Meta]
We check for new Meta ads once a week, when you open Competitors.  [Check now] Up to US$0.18 each
```

Grid: 2 columns at 390 px, 5 at 1440 px, masonry like `/swipe`. Cards fresh since the last check carry "New".

States:

- No competitors: "Add a competitor to see their ads here." with a link to Who you watch.
- Competitor with no Facebook page or Ad Library link: listed under the pills as "Add Singlife's Facebook page to see their ads." with "Add their page" (opens `?view=list&edit=<id>`).
- Due: on opening the view, every competitor whose last check is 7 or more days old (or never) is checked, one at a time, as a module-level job in `src/lib/competitorAds.ts`, so leaving the page keeps it running.
- Checking: skeleton cards for that competitor and "Reading Singlife's ads, about a minute..." (shown inside 400 ms).
- Done: cards, the count line, the pills.
- None found: "Singlife has no Meta ads in Singapore right now." with "Look anywhere" (sets that competitor's `adsCountry` to `ALL` and checks again).
- Page not found on Meta: "That page wasn't found on Meta. Check the link." with "Edit".
- Failed (Apify error or timeout): "Couldn't read Meta's ad library right now. Try again in a few minutes." The use is refunded. Last week's ads stay on screen.
- Daily cap reached (429 `daily_limit`): the server's message. When the across-everyone cap is spent instead, the function answers 429 `{ code: "global_limit" }` with "Ad checks are paused for today. They resume at 8am Singapore time." (`usageRefusal` alone would say "You've used all 60 for today", which is wrong for a user who used none.)
- Refused (403): "Competitors is not switched on for this account."
- Picture expired (Meta's links expire): the card shows an image icon and "No preview" until the next weekly check brings a fresh link.

### Copy

- Heading "Their ads" with a count chip; sub "What {a} and {b} are running" or "What {a}, {b} and {n} more are running"
- Link "{n} ads | {running} running >" to `/swipe?tab=ads` (All), or `/swipe?tab=ads&scope=<competitorId>` when one competitor's pill is selected (the `scope` values `find-ad-library` defines)
- Pills "All {n}", "{name} {n}"; muted line "Not running Meta ads: {names}"
- Badges "Image", "Video", "Carousel", "New"; empty creative "No preview"
- Run line: "{n} days running", "{n} months running" (60 days and over), "{n} years running" (365 and over), "Ran {n} days" when stopped, then " | " and the platforms ("Facebook, Instagram")
- Buttons "Remix", "Open on Meta"
- Footer "We check for new Meta ads once a week, when you open Competitors.", button "Check now", chip "Up to US$0.18 each"
- Progress "Reading {name}'s ads, about a minute..."
- "Add {name}'s Facebook page to see their ads.", "Add their page", "{name} has no Meta ads in Singapore right now.", "Look anywhere"
- Errors as listed under states.

"Remix" opens Write through `buildAdWriteUrl` until `remix-everywhere` ships. Change `buildAdWriteUrl` in `src/lib/adsSwipe.ts` to take a `SwipeAd`-like object whose `industry` and `hookFamily` may be null. A missing industry drops the bracket from the first sentence; a missing hook family drops the "It opens with a ... hook" sentence and sets `detail` to "Like {advertiser}'s ad" (today it reads "{hookFamily} hook, like {advertiser}'s ad", which would print "null hook"). The brief keeps quoting the headline and opening lines as context and keeps forbidding the ad's wording, brand and claims and any product recommendation.

### Data

Synced key `content-studio-competitor-ads-<scoped(userId)>`, one object per brand, written whole:

```ts
// src/lib/competitorAds.ts
export interface CompetitorAd {
  id: string;              // adArchiveID
  format: "image" | "video" | "carousel" | "text";
  headline: string | null; // 120 chars
  body: string;            // 600 chars
  cta: string | null;
  link: string | null;
  image: string | null;    // first image, video poster or first card image (Meta link, expires)
  video: string | null;    // video URL when there is one (expires)
  start: string | null;    // YYYY-MM-DD
  end: string | null;
  active: boolean;
  platforms: string[];     // "facebook", "instagram", "messenger", "threads", "audience_network"
  versions: number;        // collationCount
  hookFamily?: string | null; emotion?: string | null; audience?: string | null; // added by find-ad-library
}
export interface CompetitorAdsEntry {
  checkedAt: string; pageId: string | null; pageName: string | null;
  ads: CompetitorAd[];     // 30 max, running first, then longest running
  seen: string[];          // ad ids from earlier checks, 300 max
  fresh: string[];         // ids new on the latest check
}
export type CompetitorAdsState = Record<string, CompetitorAdsEntry>; // key: Competitor.id
```

About 12 x 30 ads x 800 bytes, under 300 KB per brand. Synced keys live in localStorage (about 5 MB per site in most browsers) before `cloudSync` copies them to `cs_user_data`; with `find-competitor-posts` a full brand holds about 750 KB, so three full brands sit near 2.2 MB. Write through a helper that catches a quota error and keeps the newest 20 ads per competitor rather than failing silently. Entries for removed competitors are dropped on the next write. The `pageId` a run returns is saved onto the competitor (`fbPageId`) so later runs use the country filter, and none of this needs a schema change.

### AI and cost

Mode `ads` of `supabase/functions/competitors/index.ts`, body `{ mode: "ads", competitorId, name, fbPageId, facebook, country }`:

1. Gate (`NORTH_STAR_USERS`), then `consumeUsage(admin, uid, "competitor-ads")` and `consumeUsage(admin, GLOBAL_COUNTER_USER, "competitor-ads-global")`.
2. Start URL, built by `adLibraryUrl()` in `competitors/logic.ts`: with a page id, `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=<SG|ALL>&view_all_page_id=<id>&search_type=page&media_type=all`; with only a handle, `https://www.facebook.com/<handle>`.
3. Apify actor `apify~facebook-ads-scraper` through `run-sync-get-dataset-items`: export `apifyItems` from `_shared/auditRunner.ts` unchanged (90 s run timeout, which fits the edge function's roughly 150 s) and map any `AuditError` to this function's copy, since its messages talk about audits, with input `{ startUrls: [{ url }], resultsLimit: 30, activeStatus: "all", sorting: "most recent" }`. Its page lists `activeStatus` and `sorting` without their exact values, so read those from the input schema before the first run; results arrive only when the run ends ([actor page](https://apify.com/apify/facebook-ads-scraper)).
4. `shapeAds(items)` in `logic.ts`: map `adArchiveID` (the sample also shows `adArchiveId`; accept both), `pageID` (or `pageId`), `pageName`, `isActive`, `startDate`, `endDate`, `publisherPlatform`, `collationId`, `collationCount` and `snapshot.{title, body.text, ctaText or ctaType, linkUrl, displayFormat, images, videos, cards}` (field casing from the actor's sample; confirm on the first run and save that run, text trimmed, as `competitors/fixtures/facebook-ads.json`). `startDate` and `endDate` arrive as numeric Unix timestamps (the actor also adds `startDateFormatted`); convert them to `YYYY-MM-DD` in Singapore time. Keep one ad per `collationId`, drop dynamic catalog templates whose body contains `{{product.`, trim text, sort running first then longest running.
5. Any failure after the counters moved: `refundUsage(admin, uid, "competitor-ads", day)` and `refundUsage(admin, GLOBAL_COUNTER_USER, "competitor-ads-global", day)`, with `day` read before the call.

No Jev and no LLM in this mode. Labels come later from `find-ad-library`.

Cost: Apify bills per ad: US$5.80 per 1,000 on Free, US$5.00 on Starter, US$4.20 on Scale, US$3.40 on Business ([actor page](https://apify.com/apify/facebook-ads-scraper), read 2026-10-20). A check reads 30 ads at most, so it costs US$0.174 or less (chip "Up to US$0.18 each"). 12 competitors a week is US$2.09 or less per brand.

Caps to add to `DAILY_LIMITS`: `competitor-ads` 15 a day per user; `competitor-ads-global` 60 a day on `GLOBAL_COUNTER_USER` (US$10.44 a day at most across everyone).

### Deep links

- `/competitors` or `/competitors?view=ads`: this view (`ads` is the default once a competitor exists, so links leave it out).
- `?c=<competitorId>`: one competitor's pill (replace).
- `?running=only`: running ads only (replace).
- Extend the `competitors` builder in `src/lib/links.ts` with `c` and `running`; add the rows to `docs/deep-links.md`.

## Done when

- [ ] A competitor with a Facebook page shows up to 30 of its Meta ads within about a minute of being added.
- [ ] Opening the view a week later checks it again by itself; new ads carry "New".
- [ ] "Check now" checks the selected competitor (or every due one under "All") and shows its price chip.
- [ ] Pills, the count line and the "Not running Meta ads" line match the stored ads.
- [ ] A stopped ad reads "Ran N days"; a running one "N days running".
- [ ] "Remix" opens Write with the ad's structure only; "Open on Meta" opens `https://www.facebook.com/ads/library/?id=<id>`.
- [ ] A failed Apify run refunds both counters and keeps last week's ads on screen.
- [ ] `competitor-ads` and `competitor-ads-global` are in `usageCaps.ts`.
- [ ] Each brand keeps its own ads; a removed competitor's ads disappear.
- [ ] Checked at 390 px and 1440 px; build and the full vitest run pass; the north-star item flipped.

## Tests

- `competitors/logic.test.ts`: `adLibraryUrl` for page id with SG and ALL, and for a handle; `shapeAds` on the saved fixture (collation dedupe, catalog template dropped, platforms lowercased, text trimmed, a numeric `startDate` becomes `YYYY-MM-DD`, missing snapshot fields give nulls and no throw).
- `competitors/index.test.ts`: user cap then global cap; a thrown Apify error refunds both; 403 before any counter moves.
- `src/lib/competitorAds.test.ts`: due after 7 days; the first check marks nothing new, the second marks only unseen ids; `seen` capped at 300; the run label (days, months, years, "Ran"); removing a competitor drops its entry; counts for pills.
- `src/lib/adsSwipe.test.ts`: `buildAdWriteUrl` with a null industry and hook family has no "null" or "undefined" in `ctx` or `detail`, and still carries "Do not reuse its wording, brand or claims"; the existing case for a drop ad is unchanged.
- `competitors/index.test.ts`: a spent global counter answers 429 with `code: "global_limit"` and the "Ad checks are paused" text, and the user's counter is given back.

## Open questions

- A real weekly run without opening the page needs a pg_cron entry and a place the job can write. The pattern exists: `supabase/hub/005_social_audits.sql` schedules `refresh-social-audits` hourly with a Vault secret. A new `cron.schedule` is a new file in `supabase/hub/`, so Leo decides; this spec checks on open instead.
- Meta's picture links expire. Copying them into Supabase Storage needs a new bucket. Leo decides.
- LinkedIn, Google and TikTok ad libraries: each needs its own Apify actor and price check. LinkedIn's library has no API and blocks fast browsing ([source](https://moda.app/blog/linkedin-ad-library)); Google's Transparency Center covers Singapore. Leo picks which to add next.
- Apify plan rate: which of the four rates applies to Leo's account decides the true cost per check.
- Should the Mac's weekly SG drop move onto this function once it runs from the server? It would end the dependency on the Mac being on.

## Related

find-competitors, find-ad-library, find-ad-detail, find-alerts-digest, remix-everywhere, remix-fit-check, business-cost-preview, learn-benchmark
