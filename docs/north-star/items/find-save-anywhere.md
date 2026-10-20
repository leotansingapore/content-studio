# Save from anywhere into boards

`find-save-anywhere` | find | phase 2 | status: partial | /north-star#find-save-anywhere

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane has nothing like this in Leo's recording: Studio > Library lets you "Hide" an inspiration card, and its "Sets" are bundles of your own media for a build, so there is no way to bring in a post found elsewhere (lib-tile-00 and 01).

The ad-intel tools all do it, in three ways (a button on the source page, the phone's share sheet, and a pasted link), and then give you boards to sort what was saved.

- Foreplay's Chrome extension puts a save button on each ad in the Facebook Ad Library, Instagram's feed, TikTok's Ad Library (EU only), Top Ads and feed, LinkedIn's Ad Library and YouTube Shorts. A dropdown on the button picks a board, the button turns green when saved, and an ad saved with no board goes to the uncategorised Swipe File. It is desktop only and needs an active plan ([help](https://help.foreplay.co/articles/7011049-chrome-extension)). "Board Settings" sets a default board for the whole page ([same](https://help.foreplay.co/articles/7011049-chrome-extension)).
- Foreplay also takes saves by Instagram DM. You type your Instagram username in Settings (no account access), pick a board, then send posts to @foreplay_co and they land in your Swipe File ([help](https://help.foreplay.co/articles/7008295-connect-your-instagram-account)).
- Foreplay keeps a saved ad's media after the Ad Library link expires or the ad stops ([help](https://help.foreplay.co/articles/9834159-saving-and-sharing-ads)). Folders hold boards, and one ad can sit on several boards ([help](https://help.foreplay.co/articles/7615429-folders-and-boards)). A board's Share button copies a public link anyone can view without an account ([same](https://help.foreplay.co/articles/7615429-folders-and-boards)).
- Motion's iPhone app adds Motion to the iOS share sheet, so a post saves from Instagram or TikTok while scrolling and syncs to the web ([help](https://help.motionapp.com/en/articles/9898283-creative-research-deep-dive)). On the web, a bookmark icon on any card saves it; "Create Board" needs a name, and boards group into folders ([help](https://help.motionapp.com/en/articles/12589123-getting-started-with-inspo-in-motion)).
- Taplio's free extension adds "Save post" inside LinkedIn, and saved posts group into Collections ([help](https://intercom.help/taplio/en/articles/17173501-finding-post-inspiration-with-taplio)).
- MagicBrief's Chrome extension puts a purple "Save Ad" button on the Facebook and TikTok ad libraries, saves to "My Ads" or a chosen board, and keeps ads after they stop running. Boards nest into sub-boards and share by a private or public link ([extension](https://support.magicbrief.com/articles/3250283307-using-the-chrome-extension), [boards](https://support.magicbrief.com/articles/5294178688-creating-ad-boards)).
- Atria's "Save to Atria" extension does the same on Meta and TikTok, into boards and sub-boards with tags, and transcribes saved video ads ([Chrome Web Store](https://chromewebstore.google.com/detail/infjhonlkjogibobndibmeneioojcffl), [docs](https://docs.tryatria.com/reference/list_saved_library_ads.md)).
- Gethookd keeps saved ads after they leave Meta's library, in unlimited folders by project, client or concept, with notes ([Gethookd](https://www.gethookd.ai/), [review](https://dropshippingchampions.com/blog/gethookd-review)).
- AuthoredUp imports the LinkedIn posts you saved before installing it, so the swipe file starts full ([AuthoredUp](https://authoredup.com/)).
- Eden saves from YouTube, Substack, X, Threads, LinkedIn, Instagram and TikTok into boards, and transcribes saved videos ([Eden](https://eden.so/)).
- BigSpy caps saved creatives at 20 on Free, 100 on Starter and 500 a seat on Growth ([pricing](https://bigspy.com/pricing)).
- Viralfindr tags each saved post with its original poster so a repost can credit them ([Viralfindr](https://viralfindr.com)).

## What we have today

- Bookmarks per brand in `src/lib/savedItems.ts`: key `content-studio-saved-${scoped(userId)}` holding three id lists, `inspiration`, `creators` and `topPosts`. Save buttons exist on `/inspiration`, `/profiles` and the top-post drawer (`PostDetailDrawer.tsx`, "Save" / "Saved"), and a "Saved" chip filters each of those pages. `/playbook` (`PlaybookPage.tsx`) also lists the first 6 saved inspiration posts and saved creators.
- Only items that ship inside the app can be saved. There is no way to save a pasted link, an ad, a trend, a Following post or anything found outside the app; no boards; no notes; no share target in `public/manifest.webmanifest`; no browser extension.
- What a saved post could be read with already exists and is open to every sign-in: `clone-reel` with `{ url, style: true }` reads a public Instagram reel or post or a TikTok video through Apify without OpenAI, caches it in `cs_reel_sources` (caption, transcript, numbers, duration) and returns it as a `CloneSource`. It counts against `reel-style` (20 a day) only when it scrapes (`supabase/functions/clone-reel/index.ts`, built for "Copy a reel's style" in the video editor). The cache rule is `cacheDecision` in `logic.ts`: a TikTok video or an Instagram picture post read in the last 24 hours is served free from the cache; an Instagram reel is scraped and charged on every read, because its video link expires; anything older than 24 hours is read again and charged. `parseReelUrl` in its `logic.ts` validates those links: Instagram `/p/`, `/reel/`, `/reels/`, `/tv/`, and TikTok `/@user/video/<id>`, `/t/<code>`, `vm.` and `vt.` links. It does not accept TikTok `/photo/` links. `embedUrlFor` in `src/lib/embed.ts` plays them.

Status partial: per-brand bookmarks on three in-app lists, nothing from outside.

## Build

Scope: a Saved page with boards; a Save button that files any in-app post, ad or trend into a board; and a box to paste any link. All of it shows only on Leo's sign-ins (`leoOnly(email)`). The page also handles a `/saved?url=` landing, so the Android share target is one manifest line away, but that line waits for Leo because a manifest cannot be gated per user (Open questions). The browser extension also waits for Leo.

### Screens and states

Files:

- `src/lib/boards.ts` (new): the store, `parseSaveLink`, add, move, remove, the read job, `remixUrlFor(item)`.
- `src/pages/SavedPage.tsx` (new): the page.
- `src/components/SaveButton.tsx` (new): Save with a board picker, used on cards and drawers.
- `src/App.tsx`: `const SavedPage = lazy(() => import("@/pages/SavedPage"))` and `<Route path="/saved" element={<SavedPage />} />` in the studio block.
- `src/lib/nav.ts`: in the `discover` section, after Following, `{ to: "/saved", label: "Saved", icon: Bookmark, owners: LEO_EMAILS }` (the pattern `/north-star` uses). The page itself renders `NotFoundPage` when `!leoOnly(email)`, since a typed URL skips the nav.
- `public/manifest.webmanifest`: no change in v1. The `share_target` under Data is added only after Leo answers the Open question.
- No new server function: reads call the existing `clone-reel` `style: true` path (AI and cost).
- `SaveButton` goes on (Leo-only, beside each card's existing buttons): `PostDetailDrawer.tsx`, the ad cards (`AdsSwipe.tsx`, or `AdLibrary.tsx` once `find-ad-library` ships) and the ad drawer from `find-ad-detail`, the trend card in `TrendsPage.tsx`, each post in `FollowingPage.tsx`, and the result cards of `find-viral-search` and `find-trending-formats` when they ship. In the top-post drawer it also calls `toggleSaved(..., "topPosts", key)`, so the existing "Saved" chip on `/swipe` keeps working.

Saved page:

```
Saved
[ Paste a link to a post or ad                        ] [Unsorted v] [ Save ]
[All 37] [Unsorted 5] [Hooks to try 12] [Client stories 20] [+ New board]
[All] [Instagram] [TikTok] [YouTube] [Ads] [Links]     [ Search saved posts ]
+-------------+ +-------------+ +-------------+
| [cover]     | | [IG tile]   | | [cover]     |
| TikTok @x   | | Instagram @y| | Meta ad DBS |
| caption ... | | Reading...  | | headline    |
| 1.2M views  | |             | | 45 days     |
| [Remix] [..]| | [Remix] [..]| | [Remix] [..]|
+-------------+ +-------------+ +-------------+
```

The board strip scrolls sideways on a phone and is a left column at 1024 px and up. The "..." menu holds "Move to board", "Add a note", "Open original" and "Remove". Tapping a card opens it (`?item=`): the post playing through `embedUrlFor` (Instagram, TikTok) or the saved picture, the note box, a checklist of boards, "Remix", "Open original", "Remove", and the breakdown from `find-ai-tagging` once that ships.

`SaveButton`: a Bookmark icon button reading "Save". Tap saves to the last board used on this device (`cs-saved-board`, default Unsorted) and turns into "Saved" with a chevron. The chevron opens a list of boards with checkboxes and "New board"; a board picked alone saves to it. Tapping "Saved" itself removes the item, with Undo.

States:

- Empty page: "Nothing saved yet." with the link "Browse top posts" (`/swipe`), under the paste box.
- Empty board: "No posts in this board yet."
- No search or filter matches: "No saved posts match." with "Clear".
- Saving a pasted link: the button reads "Saving..." for the local write, then the card appears at the top of the grid within 400 ms and the box clears.
- Reading (Instagram and TikTok video links): the card shows a "Reading the post" chip while `clone-reel` with `style: true` runs as a job outside React (the `runCheck` pattern in `src/lib/following.ts`). Caption, author and numbers fill in when it lands.
- Read done: the chip goes.
- Read failed: chip "Couldn't read it" and a "Try again" text button. The item stays saved as a link.
- Over the daily read cap (`clone-reel` answers 429 `daily_limit` on `reel-style`): chip "Reads used up today. Try again after 8am." The item stays saved.
- Link only (a TikTok photo slideshow, YouTube, LinkedIn, a Meta Ad Library link, any other web page): chip "Link only" and the title is the user's note or the link's host and path. Reading those sites belongs to `remix-any-link`, which does it when the user remixes the item.
- Bad link: under the box, "That isn't a link we can save. Copy it from the app's Share button and paste it here." The typed text stays.
- Already saved: "Already saved." with "Show it", which opens the item.
- 500 items in this brand: "You have 500 saved posts in this brand. Remove some to save more." Save is disabled until then. Never drop old items to make room.
- 20 boards: "New board" is disabled with the tip "You can have up to 20 boards."
- Removing an item: it goes at once, and a toast "Removed." offers "Undo" for 6 seconds (`ToastAction`, as on `DraftsPage.tsx`).
- Deleting a board: confirm "Delete "Hooks to try"? Its 12 posts stay in All." Buttons "Delete board" and "Cancel".
- Link landing (`/saved?url=...` or `?text=...`, what an Android share target or an iPhone Shortcut would open): the link is read out of the shared text, saved to `cs-saved-board`, and the page shows the item open with "Saved to Unsorted." and "Move". The share params are then removed from the URL (replace), so a reload does not save twice. Signed out, `ProtectedRoute` sends the user to `/auth` with the full path in `state.from`, and `Auth.tsx` returns there after sign-in, so the save still happens.

### Copy

- Page title: "Saved". Browser tab: "Saved - Content Studio".
- The paste box reads "Paste a link to a post or ad" (aria label "Link to save") and its button says "Save".
- Board picker default: "Unsorted". "New board" opens an inline input, placeholder "Board name", 40 characters, Enter to create; a duplicate name says "You already have a board called that."
- Platform chips: "All", "Instagram", "TikTok", "YouTube", "Ads", "Links", with the search box beside them reading "Search saved posts".
- The card's status chip reads one of "Reading the post", "Couldn't read it", "Reads used up today. Try again after 8am." or "Link only", and has no chip once the read is done.
- Item drawer: note placeholder "Why you saved it, or what to keep when you remix"; saves on blur and after 1 s of no typing. Boards heading "Boards". Buttons "Remix", "Open original", "Remove".
- `SaveButton`: "Save", "Saved"; menu heading "Save to"; "New board".

### Data

One synced key per brand, `content-studio-boards-${scoped(userId)}`:

```
{ "boards": [{ "id": "b-lq3k9z", "name": "Hooks to try", "createdAt": "2026-10-20T03:12:00Z" }],
  "items": [{
    "key": "link:tiktok:7412345678901234567",   // a RemixSource key (remix-source-trail)
    "kind": "top-post" | "ad" | "trend" | "format" | "follow" | "link",
    "url": "https://www.tiktok.com/@x/video/7412345678901234567",
    "platform": "instagram" | "tiktok" | "youtube" | "meta-ad" | "linkedin" | "x" | "facebook" | "web",
    "title": "", "caption": "", "author": "", "cover": "/covers/ABC.jpg",
    "numbers": { "views": 1200000, "likes": 40100, "comments": 312 },
    "postedAt": "2026-10-11", "savedAt": "2026-10-20T03:12:00Z",
    "boards": ["b-lq3k9z"], "note": "",
    "read": "pending" | "done" | "failed" | "capped" | "none" } ] }
```

- `key` uses the key shapes from `remix-source-trail`, so a saved post, its teardown and the drafts remixed from it share one id: `top:<advisorId>-<shortCode>`, `ad:<adId>`, `follow:<platform>:<postId>`, `trend:<trendId>`, `format:<id>` for a format template (`find-trending-formats`), and `link:<platform>:<id>` for anything from outside (pasted or searched), with `link:web:<first 12 hex of the link's SHA-1>` for a plain web page. The item keeps its own snapshot of url, author, caption and numbers, so it still shows after a weekly drop rotates the post out.
- An item whose `boards` list is empty counts as Unsorted. Deleting a board removes its id from items and the board from the list; items are never deleted with it.
- Captions are cut to 300 characters, which keeps the whole key near 500 KB at the 500-item cap (cloudSync pushes the key whole on every change). Transcripts never enter the synced key: when a read lands, its transcript goes into the device-only cache `cs-transcripts-${scoped(userId)}` (a map of item key to text, newest 60 kept), which `find-ai-tagging` reads.
- Platform chips map to platforms: Instagram, TikTok and YouTube to their own; "Ads" to `meta-ad`; "Links" to `linkedin`, `x`, `facebook` and `web`.
- `cover` is only set for in-app sources whose picture we already commit (`/covers`, `/ads`, `/format-trends`). Outside covers expire, so external cards use the platform tile or the live embed.
- Caps in code: 20 boards and 500 items per brand.
- The whole store is one key, rewritten on every change, so a removed item stays removed on every device (no tombstones needed, as with Following).
- Device hint: `cs-saved-board` holds the last board used.
- `parseSaveLink(text)` finds the first `http(s)` link in the text (a share often wraps it in words) and returns `{ platform, url, id }`. Its table is `remix-any-link`'s routing table; once that item ships, call its `parseRemixLink` instead of keeping a second copy:
  - Instagram `/p/`, `/reel/`, `/reels/`, `/tv/` and TikTok video, `/t/`, `vm.` and `vt.` links go through `parseReelUrl` from `clone-reel/logic.ts`.
  - TikTok `/@user/photo/<id>` gives `tiktok` with `read: "none"` (Link only), since `parseReelUrl` refuses photo links. Do not widen `parseReelUrl` here: Clone a reel uses it too.
  - YouTube `watch?v=`, `/shorts/<id>` and `youtu.be/<id>` give `youtube`.
  - `facebook.com/ads/library/?id=<digits>` gives `meta-ad`.
  - `linkedin.com/posts/...` and `/feed/update/urn:li:activity:<digits>` give `linkedin`; `x.com` or `twitter.com` status links give `x`; Facebook `/posts/`, `/reel/` and `fb.watch` give `facebook`.
  - Any other https link gives `web`, and the parser refuses non-http schemes, links with a username or password, IP hosts, and anything over 2,000 characters.
- After Leo's answer only: `public/manifest.webmanifest` gains `"share_target": { "action": "/saved", "method": "GET", "params": { "title": "title", "text": "text", "url": "url" } }`. It works in Chrome on Android once the app is installed. Safari on iPhone has no share target support (unverified for the newest iOS), so iPhone users copy the link and paste it.

### AI and cost

- No AI in saving. Reading a post is a scrape.
- Reads call `clone-reel` with `{ url, style: true }` through `callFn` from `src/lib/edgeFn.ts`, unchanged: read through Apify, cache in `cs_reel_sources`, no OpenAI, charged to the existing `reel-style` cap (20 a day) only when it scrapes. `clone-reel` has no `refundUsage` call today, so a scrape that fails with no cached row still uses one read; giving it back is a small fix in that function that helps every mode, and is worth doing in the same change. Keep `caption`, `author`, `metrics`, `postedAt`, `durationSec` and `isVideo` from the answer and ignore `videoUrl`. No new mode, no new cap and no server gate are needed, since `style: true` is already open to every sign-in.
- The `reel-style` cap is shared with "Copy a reel's style" in the video editor. If saving starts to crowd that out, add a `"save-read"` cap then (see Open questions).
- Cost per scraped read: one result from `apify~instagram-reel-scraper` or `clockworks~tiktok-scraper`, about USD 0.003 to 0.005 (unverified; Apify pay-per-result). Expect most reads to scrape: every Instagram reel does, and the cache only helps for a TikTok or Instagram picture post someone read in the last 24 hours.
- Keep `transcript` from the answer for the device cache above, and skip the read entirely for an in-app item (a top post, ad, trend or format already carries its text).
- Remix (`remixUrlFor` in `src/lib/boards.ts`) reuses what exists, in this order:
  - once `remix-everywhere` ships, every item opens its Remix sheet with `?remix=<key>`;
  - until then a top post goes through `buildRemixUrl` (looked up from the `top:` key), an ad through `buildAdWriteUrl`, a trend through `buildTrendRemixUrl`, and an Instagram or TikTok video to `/clone?url=`;
  - any other link goes to `/clone?url=` once `remix-any-link` reads it, and before that to Write with a `ctx` holding the link, the caption or title, the note, and "Write my own take on this. Do not copy its wording. No promised returns, no named insurer products, no invented numbers."

### Deep links

- `/saved` shows All. `/saved?board=b-lq3k9z` one board, `/saved?board=unsorted` the unsorted ones. Replace.
- `/saved?platform=tiktok` (`instagram`, `tiktok`, `youtube`, `ad`, `link`) and `/saved?q=cpf`. Replace.
- `/saved?item=link%3Atiktok%3A7412345678901234567` opens an item. Push; Back closes it. An unknown id is dropped quietly.
- `/saved?url=<link>` (and `text`, `title`) is the link landing; consumed once, then removed with replace.
- Add `saved: (o: { board?, platform?, q?, item? })` to `links` in `src/lib/links.ts`, and a `/saved` block to `docs/deep-links.md`.

## Done when

- [ ] On Leo's sign-in, Discover shows "Saved"; on any other sign-in it does not, and `/saved` shows the not-found page.
- [ ] Pasting an Instagram reel link saves it at once, the card shows "Reading the post", and within about a minute it shows the caption and numbers.
- [ ] Pasting the same link again says "Already saved."
- [ ] A YouTube link saves as "Link only" and its Remix opens Write with the brief.
- [ ] Save on a top post, an ad and a trend files each into the board picked, and the top post also shows under `/swipe?saved=only`.
- [ ] A new board, a move, a note, a remove with Undo, and a board delete that keeps its posts all work and survive a reload and a second device's sync.
- [ ] Opening `/saved?text=Check%20this%20https%3A%2F%2Fvt.tiktok.com%2FZS123%2F` on Leo's sign-in saves that link once, shows it open, and a reload does not save it twice.
- [ ] Once `reel-style` is used up for the day (20 uncached reads, shared with the video editor), a new save shows "Reads used up today. Try again after 8am." and the item stays saved.
- [ ] Pasting a TikTok `/photo/` link saves it as "Link only" with no read.
- [ ] Checked by eye at 390 px and 1440 px; `npm run build` and the full `npx vitest run` pass; `find-save-anywhere` flipped in `src/data/northStar.ts`.

## Tests

- `src/lib/boards.test.ts` (new): `parseSaveLink` on each link type above, on a link buried in share text ("Check this out https://vt.tiktok.com/ZS... #fyp"), and on the refusals; adding the same URL twice keeps one item; the 501st item and the 21st board are refused; deleting a board keeps its items and clears the id; moving and noting rewrite one item only; a corrupt stored value loads as an empty store; `remixUrlFor` returns `/clone?url=` for a TikTok video and a Write link without the caption's words for a web link.
- `src/lib/boards.test.ts` also covers the read job with a faked `callFn`: it sends `{ url, style: true }`, fills caption, author and numbers from the answer, puts the transcript in `cs-transcripts-<scope>` and never in the synced key, sets `read: "capped"` on a 429 `daily_limit` and `read: "failed"` on any other error, never sends a TikTok photo link, and never reads an in-app item. The "Links" chip shows `linkedin`, `x`, `facebook` and `web` items.
- If the refund fix lands in `clone-reel`, its index tests cover one failed scrape with no cached row giving the `reel-style` use back.
- `src/lib/nav.test.ts`: add `/saved` to the `routes` list; the More sheet for `someone@example.com` is unchanged. `src/lib/navRoutes.test.ts` passes with the new route in the nav.
- `src/lib/links.test.ts`: `links.saved({ board: "unsorted", q: "cpf" })`.

## Open questions

- A browser extension that puts Save on Instagram, TikTok and the Ad Library, as Foreplay and Motion do. It is a separate codebase with a Chrome Web Store listing and its own sign-in. Leo decides if and when.
- Keeping media. Foreplay stores each saved ad's video and pictures because source links die. Doing that here means a storage bucket and its cost, which is Leo's call.
- The Android share target. A web manifest is the same for every user, so once `share_target` ships, every adviser who installed the app sees Content Studio in their phone's share sheet, and anyone but Leo lands on the not-found page. Add it now and accept that, or wait until Saved is on for everyone? Leo decides.
- iPhone. Without a share target, the iPhone path is copy and paste. An iOS Shortcut that opens `/saved?url=` is possible but needs Leo to want it.
- Should the old per-page "Saved" lists (inspiration, creators, top posts) fold into boards for everyone later? This spec keeps both and writes to both for top posts.
- Reads share the `reel-style` cap of 20 a day with the video editor. That is plenty while it is Leo-only. If saving opens to more people, a separate `"save-read"` cap in `usageCaps.ts` (and a `read` flag on `clone-reel` to charge it) keeps the two apart.

## Related

find-ai-tagging, find-ad-detail, find-viral-search, find-trending-formats, find-competitor-posts, remix-any-link, remix-source-trail, remix-everywhere, brand-media-library, publish-library
