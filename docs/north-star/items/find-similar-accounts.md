# Apps like yours

`find-similar-accounts` | find | phase 2 | status: partial (built 1 Nov 2026, Leo's sign-ins; live check pending) | /north-star#find-similar-accounts

## Leo asked

1 Nov 2026:

- "do our app contain an ability to show us similar competitor tiktok/instagram profiles to reference from?"
- On /swipe?profile=pmvaytr9ayhh1 (the ActivityTracker brand): "think the references here aren't very relevant for the actiivty tracker"
- "am hoping we can see how other apps do their marketing on ig and tiktok there, so we can remix their slideshows/reels/carousells"
- "or ugc content etc"
- "whatever it is, please suggest. we should have alot of references"
- "for example, I think the structured.app is pretty good, saw what they have on tiktok"

Later on 1 Nov, after two real finds, on a brand with no references:

- "do try to dogfood the competitor search. e.g assume I didn't give any references, how would the function search for competitors on its own"
- "somehow, we managed to do so on the /seo-north-star."

He set a monthly cap of US$40 for the whole feature, and keeps naming accounts he likes as references (for ActivityTracker: structured.app, thedoapp, @megrow_app, @routinesieapp), so they can be added by hand.

## How the best do it

- Instagram's own similar accounts: `apify~instagram-profile-scraper` returns them as `relatedProfiles` on each profile (id, full name, private, verified, picture, username). Tiimo's profile returned 36 on 30 Oct, mixed: real planner apps (Structured, Todoist, Sunsama, TickTick, Stoic), ADHD creators and podcasts, and a contact centre. So the list is a good seed but has to be judged. [Source](https://apify.com/apify/instagram-profile-scraper) (fixture `supabase/functions/competitors/fixtures/ig-profile-tiimo.json`).
- Modash: open a reference creator and press "Find Lookalikes" on Instagram, TikTok or YouTube. Content lookalikes match topics, themes and visual styles; audience lookalikes match followers with "similar demographics, interests, and characteristics". Up to 5 reference creators at once, results combined, filters for location, engagement, follower range and platform; it "typically" returns "hundreds of similar creators". [Source](https://help.modash.io/en/articles/5467269-find-lookalikes).
- Sandcastles' Channels page has four modes: Suggested (from the watchlist, or the persona when the watchlist is empty, with "More like this" on hover), Describe (free text plus platform and account size), Search and Add URL. Starter cannot add new channels. [Source](https://help.sandcastles.ai/channels-4-modes).
- Vamos: creator search by topic or account, suggestions grouped by topic with "Follow all", and "Similar creators" for lookalikes. Following is capped at 20 creators on Free, 70 on Pro and 150 on Business. [Source](https://intercom.help/getvamos/en/articles/13004806-watchlists-track-creators-and-competitors), [plans](https://intercom.help/getvamos/en/articles/13004516-plans-credits-and-prices).
- OutlierKit's Competitor Studio maps a niche from one seed channel across thousands of related channels and surfaces the outliers, at 50 credits a run on Pro and Max. [Source](https://outlierkit.com).
- Foreplay's Discovery lists the most popular brands on a Brands tab, where opening one shows the ads its community saved and "Track Brand" sends it to Spyder; it covers ads, not organic accounts. [Source](https://help.foreplay.co/articles/4997820-brands-tab-in-discovery).

## What we have today

- `/competitors` (`find-competitors`, `find-competitor-posts`): up to 12 competitors a brand, each with its Instagram and TikTok posts read weekly, 30 a read, ranked by the outlier score. Someone has to name each one.
- `/swipe` on a brand that isn't an adviser's: News, and on Leo's sign-ins For you (Jev matches the posts and ads the app already holds), Search (one keyword on TikTok and YouTube) and Hooks. Top posts are Singapore finance creators only, which is why ActivityTracker's references don't fit.
- Following: 5 accounts a brand, typed in by hand.
- Nothing finds accounts like the brand by itself. This item adds that.

## Build

A tab "Apps like yours" on `/swipe` (`?tab=similar`) for brands that aren't an adviser's, Leo's sign-ins only, and the default tab there. Adviser brands keep Top posts as they are. On a brand that isn't an adviser's, Leo's page heading and browser title name the open tab, and his Radar tab reads Swipe file, the name over its six tabs (it said News, then Apps like yours, both also the names of its tabs); everyone else's page keeps News or Top posts. The tab has no heading of its own under the page's: its top row is the account count and the month's spend.

### Screens and states

```
Apps like yours  44                                        US$7.21 of US$40 this month
[ Find apps like yours ]  Up to US$6.02 | 2 left after this
[ Add an account you like: @handle or profile link ] [Add]
+------------------+ +------------------+ +------------------+
| Structured       | | Tiimo            | | Dr. Tish         |   (scrolls sideways)
| @structured.app IG | @tiimoapp IG     | | @truly_tish_adhd |
| App or brand 210k| | Added  43.1k     | | Creator 88k      |
| Not this one     | | Not this one     | | Not this one     |
[ All ] [ Slideshows ] [ Carousels ] [ Reels ] [ UGC ]   (i)
+---------+ +---------+ +---------+
| 4.1x their usual
| Carousel, 12 Oct, TikTok
| Structured @structured.app
| caption, two lines...
| [Remix] [Open] [Save]
Reading @tiimoapp, about a minute, 12 more after it...
We read each account's newest posts once a week, when you open this tab.
```

States:

- Empty: "See how apps and creators like yours post on Instagram and TikTok, then remix their best." and the Find button (with the add box under it).
- Finding: the button spins and "Looking on Instagram and TikTok, about two minutes..." shows at once; the job runs outside React, so leaving the page keeps it going.
- Found: "Found 12 new accounts. Reading their posts now." Then the posts come in one account at a time, 30 each on the first read, under "Reading @x, about a minute, n more after it..." with skeleton cards until the first lands.
- Jev answered nothing: "Couldn't judge the accounts right now, so nothing new was kept." The uses stay counted: Apify and OpenAI already answered and billed.
- Nothing new: "No new accounts this time."
- 40 found accounts: the button is off with "You have 40. Take some out with Not this one to find others."
- Over the month: "Apps like yours has used this month's US$40. It starts again on 1 December." (the server's line).
- Over the daily cap: the server's line. Across everyone: "Finding accounts is paused for today. It resumes at 8am Singapore time."
- A filter with nothing in it: "No slideshows yet. Show all".
- An account that turns out private or missing says why on its own card, and the round moves on to the next.
- A linked post that is no longer stored gets "That post is no longer here" and the param drops.

Filters: Slideshows are TikTok photo posts (`isSlideshow`, stored as format carousel), Carousels are Instagram carousels, Reels are videos on either, UGC is any post from an account Jev called a creator. Sorted by the outlier score, then newest.

"Add an account you like" takes an @handle, a bare handle (structured.app reads as a handle here) or an Instagram or TikTok profile link (`parseInput`). A profile link adds at once; a handle asks "Instagram" or "TikTok". Added accounts are kept whatever happens: never judged by Jev, never dropped by the follower floor, never counted toward the 40 found ones, and their posts are read like the rest. Up to 10. They also go to each find as seeds. "Not this one" takes any account and its posts out, and no find brings it back; adding it by hand does.

### Copy

- Tab "Apps like yours"; heading "Apps like yours" with a count chip; "US${x} of US$40 this month"
- Button "Find apps like yours"; progress "Looking on Instagram and TikTok, about two minutes..."
- Box "Add an account you like: @handle or profile link", "Add", "@{handle} on [Instagram] [TikTok]", "Added @{handle}. Reading its posts now.", "That account is already on your list.", "You can add up to 10. Take one out with Not this one first.", "Paste an @handle or an Instagram or TikTok profile link."
- Account card: name, "@{handle} IG|TT", badge "App or brand", "Creator" or "Added", "{n} followers", "Not this one"
- Chips "All", "Slideshows", "Carousels", "Reels", "UGC"
- Footer "We read each account's newest posts once a week, when you open this tab."

### Data

Synced key `content-studio-similar-<scoped(userId)>` (`src/lib/similarAccounts.ts`), one object per brand, written whole:

```ts
interface SimilarState {
  accounts: SimilarEntry[]; // { platform, handle, name, followers, kind, via, addedAt }, added ones first
  posts: Record<string, FollowedAccount>; // key "platform:handle", Following's shape
  dismissed: string[]; // "platform:handle", 200 at most
  month: { spent: number; cap: number } | null; // as the server last said
}
```

Posts go through `applyCheck` unchanged; a weekly read of 10 is merged into the stored 30 by post id first (`mergePosts`), so only posts not held before are marked New. Only what the card shows is stored: captions cut to 150 characters, one follower snapshot, no seen list. 40 accounts of 30 posts with 200 dismissals measure 448 KB (`similarAccounts.test.ts`), under the 600 KB budget. When storage is full the write keeps 20 posts an account. No schema change.

### AI and cost

Mode `similar` of `supabase/functions/competitors/index.ts`, body `{ mode: "similar", brand, seeds: { instagram, tiktok }, exclude }`. `brand` is `brandFacts`; the seeds are the added accounts, then the brand's competitors' handles; `exclude` is every account shown, added or dismissed plus the brand's own handles.

1. Gate (`NORTH_STAR_USERS`), the month guard, then `similar-find` (3 a day) and `similar-find-global` (6 a day) on `GLOBAL_COUNTER_USER`.
2. OpenAI (`OPENAI_MODEL`) writes up to 8 short TikTok searches from the brand's facts (words only).
   Beside it, when the request has fewer than 3 seeds in all, the rivals step: OpenAI proposes up to 8 apps or businesses a buyer compares with the brand (suggest's `proposeMessages`), each site is opened (`readHome`; an invented one doesn't open and is dropped, as is the brand's own), and the Instagram and TikTok handles each home page links to join the seeds. A rival's own accounts are judged by Jev like the rest and come back with via `rival: <name>` and kind `app_or_brand`; they are never Jev's examples (`liked` stays the accounts the user picked). Why: find 2 on ActivityTracker (1 Nov) had no seeds, so Instagram's similar accounts had nothing to start from and only the TikTok searches ran (money and sales creators, one kept, no apps); /seo-north-star starts from the rivals a customer compares, and so does this now. Limits: OpenAI 15 s, then every home page at once 8 s. It runs beside the searches' call, so Apify starts at most 5 s later, and the Apify and Jev deadlines moved 5 s (120 s and 140 s of the ~150 s).
3. In parallel: `apify~instagram-profile-scraper` on up to 12 seed Instagram usernames for their `relatedProfiles`, then a second read of up to 60 of those (public, deduped, minus exclude, one from each seed in turn) for bio, followers, category and link; and `clockworks~tiktok-scraper` once per search, 30 results each, Top search (the "/video" tab returns no slideshows, measured 30 Oct). Each TikTok result's `authorMeta` is a candidate; the TikTok seeds are candidates too.
4. Private accounts, accounts under 1,000 followers, the brand's own name as a handle and anything in `exclude` are dropped before Jev.
5. Jev (`jev-1.13.0`), one call per candidate, text only: noul `similar` and choice `kind` (`app_or_brand`, `creator`). Every decision is logged (handle, bio's first 80 characters, score, kind) so the first real run sets the cut, which starts at 0.6. Top 40 kept.
6. No Apify run answered: both uses go back and the app sees "Couldn't look for accounts right now". Jev answered nothing: nothing new is kept, both uses go back, and the app says so.

Posts: mode `posts` with `scope: "similar"` counts against `similar-posts` (130 a day) and `similar-posts-global` (200), keeps 30 the first time and 10 with `limit: 10` (reading 13 for pinned posts), and refunds on an Apify failure as competitors' posts do, while a read without the scope behaves as it did before.

Month guard: before any similar call, this calendar month's `similar-find-global` and `similar-posts-global` counts for `GLOBAL_COUNTER_USER` in `cs_ai_usage` (`user_id, feature, day, count`, hub 009) are priced at their units; a call that would take the total past US$40 is refused, though landing on exactly US$40 is allowed, and a counter that can't be read refuses as well. Each answer carries `month: { spent, cap }` for the tab's line.

Prices (`_shared/prices.ts`, Free-plan Apify rates, the dearest):

- `similar-find` up to US$1.10: 72 Instagram profiles at US$2.60 per 1,000 (apify.com/apify/instagram-profile-scraper, read 1 Nov) US$0.187; 8 TikTok searches of 30 at US$3.70 per 1,000 plus US$0.001 a run US$0.896; one gpt-6-luna call and up to about 300 Jev questions, under US$0.01; with fewer than 3 seeds, the rivals step's OpenAI call, priced as suggest's are (US$0.01, unverified).
- `similar-posts` up to US$0.123: TikTok 33 x US$3.70 per 1,000 + US$0.001; Instagram 33 posts and a profile, US$0.092 (phase2-build-brief.md, read 20 Oct). A 10-post refresh costs less but is priced the same, so the guard stops early, never late.
- A first find with its 40 post reads is up to about US$6; a brand's weekly refresh is 40 reads, up to about US$4.92. US$40 covers about one brand found and refreshed for a month plus a second brand's find.

### Deep links

- `/swipe?tab=similar`: the tab (the default on Leo's non-adviser brands).
- `&f=slideshows|carousels|reels|ugc` (all is left out), replaces history.
- `&post=<platform>:<post id>`: shown even past the first 24, scrolled to and marked, with Copy link.
- `links.swipe` takes `tab: "similar"` and `f`; rows in `docs/deep-links.md`.

## Done when

- [ ] On ActivityTracker, Find returns about 40 accounts a person would call relevant (planner and habit apps, ADHD and productivity creators), and the logged Jev decisions have been read to set the cut.
- [ ] Their posts arrive within about a minute each, sorted by outlier score; each filter shows the right posts.
- [ ] Remix opens /clone for a video and Write for a slideshow or carousel; Save files the post to a board.
- [ ] An added account stays, has its posts read, and feeds the next find; Not this one never comes back.
- [ ] Opening the tab 7+ days later reads the newest 10 posts per account and marks only the new ones.
- [ ] The tab shows the month's spend, and the server refuses past US$40.
- [ ] Checked at 390 px and 1440 px; build and the related tests pass; the north-star item flipped.

## Tests

- `competitors/logic.test.ts`: candidates from the Tiimo profile and from TikTok results (both real), dedupe and exclude, the follower and private filters, Jev null handling and the 0.6 cut, posts scope routing, the month guard at, under and over US$40, rival handles joining the seeds after the request's (12 a platform at most), and a rival's account marked `rival: <name>` and `app_or_brand` whatever Jev's kind.
- `competitors/index.test.ts`: the similar mode end to end with every provider faked (counters, the two Instagram reads, one TikTok run per search, judged once each, excluded and added accounts never judged, refunds when Apify or Jev never answers), the month guard refusing before any counter, and similar posts on their own caps with 10 posts on a refresh. The rivals step: no seeds runs it, 3 seeds don't, an invented site and the brand's own are never read, a home page with no profile links adds nothing, and a host that never resolves or an OpenAI call that never answers stops at the step's limits.
- `src/lib/similarAccounts.test.ts`: the key, the 40-found cap, the size of 40 accounts of 30 posts, the merge of a weekly read by post id, 30 then 10, due after 7 days, the filters, each added-account rule, Not this one, and a find's note and refusal.
- `src/pages/adviserScreens.test.ts`: Leo's non-adviser brand opens on Apps like yours, headed by the open tab, while everyone else's heading stays; an adviser's never shows it. `src/lib/adviserBrand.test.ts`: Leo's Radar tab for /swipe reads Swipe file there and Top posts on an adviser's brand. `src/components/swipe/AppsLikeYours.test.tsx`: no heading in the tab, the count and the spend on its top row.

## Open questions

- The cut: 0.6 is a start. Read the first run's logged decisions and move it.
- A TikTok seed that no search returns is judged on its name alone, and may fall under the cut. Reading one post per TikTok seed for its bio would cost about US$0.004 each.
- Posts are read one account at a time, about 40 minutes for a first find. Reading two or three at once would finish sooner; say if that matters.
- When Jev answers nothing the uses are given back although Apify was paid, so the month's count can sit under the real spend by up to US$1.10 a time.

## Related

find-competitors, find-competitor-posts, find-outlier-score, find-niche-feed, find-viral-search, find-save-anywhere, remix-everywhere
