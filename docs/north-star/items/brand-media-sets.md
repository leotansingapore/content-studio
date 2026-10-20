# Media sets

`brand-media-sets` | brand | phase 4 | status: partial | /north-star#brand-media-sets

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane shows sets in Studio > Library, which Leo captured as a FireShot page (the screen recording does not reach it). Under "SETS" the line reads "Bundles of your media that a slideshow or video build can draw from." Three buttons sit on the right: "New slideshow set", "New video set" and "Add curated sets". The four preset cards are "Discipline / Habits", "Study / Productivity", "Sports / Fitness" and "Entrepreneur / Hustle", each labelled "Slideshow | curated" with a "Delete" button. The MEDIA block above them reads "16 MB of 10 GB storage used" with filters "All", "Images", "Videos" and an "Upload" button.

![Fastlane Studio > Library, FireShot capture](../research/fastlane-pdf/lib-tile-00.webp)

The recording shows a set in use once. Slideshow > "Remix a trending one" says "Remix keeps the structure of a slideshow that is already doing well and rewrites its words for Activity Tracker over pictures from your boards. It makes no new pictures, so it costs the same as saving a slideshow.", and the footer reads "5 credits" (notes-2.md F9). That "boards" means sets is likely but not shown.

![Fastlane 2:36](../../../public/north-star/fastlane/t156.webp)

Its public slideshow maker turns each angle into "hook slide, one idea per middle slide, closing product slide"; where the pictures come from is not published (unverified, [usefastlane.ai](https://usefastlane.ai/tools/tiktok-slideshow-maker)).

Other competitors:

- In ReelFarm you search Pinterest inside the app, pick 9 to 15 images and press "Create Collection" to make an Image Collection. Its slideshow automations draw from a hook collection and a content collection, and the closing slide can come at random from a collection ([reel.farm](https://reel.farm/guides/automate-tiktok-slideshows-with-ai)).
- Genviral feeds slideshows from image packs (create-pack, add-pack-image) and has every slide checked by eye before it posts ([github.com/fdarkaou/genviral-skill](https://github.com/fdarkaou/genviral-skill)).
- Quso.ai has a Pexels-backed B-roll library of stock videos and images that it matches to the script, with keyword search for the rest ([quso.ai](https://quso.ai/products/b-rolls-library)).
- FMG Suite gives advisers a ready-made video library with a "Video of the Month" automation ([fmgsuite.com](https://fmgsuite.com/features/content/)).

## What we have today

Checked against origin/main f2cb275 on 20 Oct.

- /media (`src/pages/MediaPage.tsx`, `src/lib/mediaLibrary.ts`) keeps photos on this device: files in IndexedDB through `src/lib/deviceFiles.ts` under `cimg-` keys, the index in device-only `cs-media-<scoped>`, at most 300 (`MAX_MEDIA`). It has folders (`?folder=`), search (`?q=`), typed alt text and free Pexels photos with their credit (`StockSearch`, edge function `stock-media`, cap `stock-search` 100; the same search within the hour comes from a per-instance cache and counts nothing). A Pexels photo is saved with Pexels' own alt text (`addStock` in MediaPage); Pexels videos come back with an empty alt, and montage describes them by their page name (`describe` in `src/lib/montage.ts`). `updateMedia` can change only name, folder and alt.
- Carousel slides pick one photo at a time from Media.
- Builds that need many pictures or clips never read Media. The Explainer (/edit?panel=ai&kind=explainer, `makeExplainer` in `src/lib/aiVideo.ts`) writes 3 to 6 scenes (`ai-video-script`), makes the voiceover, then asks ai-video for one Soul v2 picture per scene (`PICTURE_CREDITS` 0.09 each, cap `ai-video` 2 a day; its Make button is disabled when `ai-video` has none left). The Montage (/edit?panel=ai&kind=montage, `src/lib/montage.ts`) searches Pexels per beat and makes up to two video-assist `montage-pick` calls, a first search and a broader one (cap `montage-pick` 20, at most 6 candidates a beat, `MAX_CANDIDATES`, each described in 100 characters or fewer). Clips shorter than their beat are left out first (`chooseClips` in `src/lib/autoBroll.ts`).

Status is partial: a folder is the nearest thing to a set, but it has no kind and no cover, and no build can draw from one.

## Build

Photo sets can ship on their own. Clip sets need videos in Media, which brand-media-library step 1 adds, so build those after it. Everything new shows only when `leoOnly(email)` is true; other accounts keep today's Media page.

### Screens and states

/media gets a view switch, "Library" and "Sets", held in `?view=sets`.

```
Media    [Library] [Sets]
Sets  (i)                       [New photo set] [New clip set] [Add starter sets]
[cover] Money and budgeting   12 photos | starter        [Open] [Remove]
[cover] My office              4 photos                  [Open] [Remove]
[cover] City clips             8 clips | starter         [Open] [Remove]
```

A set is a folder with a kind. Its items are the media whose `folder` equals the set's name, so "Open" goes to /media?folder=<name> and the existing folder view does the rest. A photo sits in one set at a time.

Empty: "No sets yet. Add starter sets, or make one from your photos." The main button is "Add starter sets".

New photo set and New clip set open an inline name field (40 characters) with "Make set". The new set then opens, empty, with an "Add from your library" button. That button opens a grid of the library filtered to the set's kind, with a checkbox per tile, and the confirm button counts them: "Add 5 to <set>".

A set with fewer than 3 items shows "Add at least 3 to use it in a video." and is left out of the build pickers.

Add starter sets opens a sheet of 8 sets (table below), each with 4 preview thumbnails, a count and an "Add" button. Adding one searches Pexels through `searchStock(set.kind === "photos" ? "photo" : "video", query, 1, "portrait")` from `src/lib/stockMedia.ts`, once per query. It takes an even share from each query (4 photos from each of 3 queries; clips 4 and 4, or 3, 3 and 2), skips anything already in Media (matched by its Pexels page link, `credit.url`), and tops up from the next query when one runs short. Each file is downloaded with `downloadStock`; photos are stored with `storePicture` and clips with `putFile`, and each is added with `addMedia` under the set's folder name with its Pexels credit. Photos keep Pexels' alt text, as MediaPage's `addStock` does. Clips get `describe(it)` from `src/lib/montage.ts` as alt text, since Pexels sends none for videos, and `seconds` from the item's `duration`. A line such as "Adding Money and budgeting: 5 of 12" counts up. When it finishes: "Money and budgeting added. 12 photos, credits kept." When a few downloads fail: "Added 10 of 12. Some didn't download." When `stock-search` is used up: "Stock search is used up for today. It resets at 8am Singapore time." A starter set already added shows "Added" on its button.

Remove takes the folder off every item in the set and deletes the set record while the files stay in Media, then shows the toast "Set removed. The photos stay in Media." with "Undo". Rename is inline and renames the folder on every item.

Builds that draw from sets (this item ships the first three):

1. Explainer. Under the scenes, a new row "Pictures" offers "AI pictures" (its credits shown as today) and one pill per photo set with 3 or more photos, labelled "<set> (free)". With a set picked, the app sends the scenes as beats to video-assist `montage-pick` before Make, each with up to 12 of the set's photos as candidates described by their alt text, and Jev picks one per scene. `parsePickRequest` cuts each scene's words to 90 characters, which is enough to judge a match. A set larger than 12 is rotated so each photo is offered at least once. Each scene then shows its photo with "Swap", which opens the set. `makeExplainer` gains an optional `images: Blob[]` (read with `getFile`); when given, it skips the ai-video `explainer` call, so no Soul picture is made and neither `ai-video` nor `ai-video-global` is used. With a set picked, the Make button checks `montage-pick` and `ai-voice` instead of `ai-video`. The cost line changes to "Uses 1 voiceover. Pictures from your set are free."
2. Montage. A row "Clips from" offers "Free stock" and one pill per clip set with 3 or more clips. With a set picked, each beat's candidates come from the set's clips that are at least as long as the beat (`seconds` from brand-media-library), described by their alt text from its sort, and `montage-pick` chooses as today. A beat that nothing fits falls back to the stock search and is labelled "stock" on its beat row.
3. The carousel slide picture picker shows set chips above its grid, which filter by folder.
4. formats-slideshow (its own item) reads sets through `usableSets()` in `src/lib/mediaSets.ts`.

When Jev returns null for a pick (no key, a timeout, or text that is not mostly English, which `montage-pick` never sends to Jev), the scene takes the next unused photo in set order, as montage does today with stock. When Jev answers "none", the explainer has no stock to fall back on, so the scene also takes the next unused photo and its "Swap" button is outlined to draw the eye. Photos with no alt text are offered last and described as "a photo"; the set card suggests "Describe them for better picks" once brand-media-library's sort exists.

Starter sets, plain names, portrait orientation, chosen for SG advisers' posts:

| Set | Kind | Count | Pexels queries |
| --- | --- | --- | --- |
| Money and budgeting | photos | 12 | saving money jar; budget planner notebook; paying bills calculator |
| Family and home | photos | 12 | family at home; parents with children; family dinner table |
| Singapore city | photos | 12 | singapore skyline; singapore street; singapore hdb flats |
| Work and career | photos | 12 | young professional office; laptop desk work; team meeting office |
| Later life | photos | 12 | retired couple; grandparents and grandchildren; senior couple walking |
| Health and fitness | photos | 12 | running outdoors; gym workout; healthy breakfast |
| City clips | clips | 8 | singapore city; city night traffic |
| Everyday clips | clips | 8 | coffee morning; typing on laptop; walking in the city |

### Copy

- View switch: "Library", "Sets"
- Sets InfoTip: "Bundles of your photos or clips that slideshows and videos draw from."
- Buttons: "New photo set", "New clip set", "Add starter sets", "Open", "Remove", "Make set", "Add from your library", "Add <n> to <set>", "Add", "Added", "Swap", "Undo"
- Card line: "<n> photos", "<n> clips", with " | starter" for starter sets
- Empty: "No sets yet. Add starter sets, or make one from your photos."
- Too small: "Add at least 3 to use it in a video."
- Progress: "Adding <set>: <n> of <m>"
- Done: "<set> added. <n> photos, credits kept." (or "<n> clips")
- Partial: "Added <n> of <m>. Some didn't download."
- Cap: "Stock search is used up for today. It resets at 8am Singapore time."
- Removed: "Set removed. The photos stay in Media." (or "The clips stay in Media.")
- Explainer row: "Pictures", pills "AI pictures" and "<set> (free)"; cost line "Uses 1 voiceover. Pictures from your set are free."
- Montage row: "Clips from", pills "Free stock" and "<set>"; beat label "stock"
- Hint: "Describe them for better picks"

### Data

- Set records live in device-only `cs-media-sets-<scoped>`: `[{ name (40), kind: "photos" | "clips", starter?: string, createdAt }]`. They stay on the device because the files do, until brand-media-library step 2 moves them to the synced `content-studio-media-sets-<scoped>` together with the index.
- Membership needs no new field, since it is the existing `MediaItem.folder`.
- `src/data/starterSets.ts` holds the 8 rows above as `{ id, name, kind, count, queries }`.
- `src/lib/mediaSets.ts`: `loadSets`, `saveSets`, `setsWith(items)` (count and cover per set), `usableSets(kind)` (3 or more items), `addStarter(uid, id, onProgress)` (a job outside React so leaving the page keeps it going), `renameSet` and `removeSet`, both of which change each item's folder through `updateMedia`.
- The database schema stays as it is.

### AI and cost

- Starter sets cost nothing: Pexels through `stock-media`, counted against `stock-search` (100 a day) only when the server has not cached the search. All 8 sets take at most 23 searches (18 for the six photo sets, 5 for the two clip sets), and one search returns up to 24 items (`PER_PAGE`). Clips download at about 720p (`pickVideoFile`), so the two clip sets add 16 files to the device. Each item keeps its Pexels credit, which Pexels' published terms ask for (not re-checked for this spec).
- Explainer with a set: no Higgsfield call. Each explainer makes one `montage-pick` call (existing cap 20) instead of N Soul pictures, which saves 0.09 credits a scene (about US$0.006 at `CREDIT_USD` 0.0625) and the wait. The voiceover is unchanged.
- `montage-pick` accepts up to 12 candidates a beat when the request carries `source: "set"` (`MAX_SET_CANDIDATES` 12 in `supabase/functions/video-assist/montage.ts`); stock requests keep 6. Jev still answers one choice per beat between the candidates and "none", but `pickQuestions` asks about stock clips "described by its page name", so with `source: "set"` the question becomes "Which photo or clip, described in words, best shows \`beat\`?" Alt text over 100 characters is cut to 100 by `parsePickRequest`.
- No new caps.

### Deep links

- /media?view=sets opens the sets view (replace). /media?folder=<name> opens one set, as today.
- /edit?panel=ai&kind=explainer&set=<name> and /edit?panel=ai&kind=montage&set=<name> preselect a set. Add `set?: string` to `links.edit` and `view?: "sets"` to `links.media` in `src/lib/links.ts`.
- docs/deep-links.md: add `view` to the /media rows and `set` to the /edit rows.

## Done when

- [ ] On Leo's sign-in /media shows Library and Sets; another account sees today's page with no Sets tab.
- [ ] Adding "Money and budgeting" puts 12 portrait Pexels photos, each with its credit, in a folder of that name; adding it again shows "Added".
- [ ] New photo set, Add from your library, Rename and Remove (with Undo) work, and removing leaves every file in Media.
- [ ] An explainer with a set picked makes no ai-video picture call (network tab), shows one set photo per scene, and the finished video opens in the editor.
- [ ] A montage with a clip set uses the set's clips, and a beat with no fit says "stock".
- [ ] With Jev off, the explainer still fills every scene from the set in order.
- [ ] Checked by eye at 390 px and 1440 px; `npm run build` and the full `npx vitest run` pass; the item flipped in `src/data/northStar.ts`.

## Tests

- `src/lib/mediaSets.test.ts`: `setsWith` counts per folder and picks the newest item as cover; `usableSets` leaves out sets under 3 and sets of the other kind; `renameSet` and `removeSet` change only that folder's items; the rotation gives every photo of a 20-photo set a place among 4 scenes' candidates.
- `src/data/starterSets.test.ts`: 8 sets, unique ids and names, counts 12 or 8, every query non-empty and ASCII.
- `supabase/functions/video-assist/montage.test.ts`: `parsePickRequest` keeps 12 candidates when `source` is `"set"` and 6 otherwise; `pickQuestions` uses the set wording only for `source: "set"`.
- `src/lib/aiVideo.test.ts`: `makeExplainer` with `images` makes no ai-video call (stubbed `callFn`) and still makes the voiceover.
- `src/lib/mediaSets.test.ts`: `addStarter` with a stubbed `searchStock` maps the set kind to "photo" or "video", takes an even share per query and tops up from the next, skips photos already in Media, stops at the count, gives clips their `describe` alt text and `seconds`, and reports partial failures.
- `src/components/AiVideo` explainer: with a set picked, Make is enabled when `ai-video` shows 0 left, and a Jev "none" or null answer still fills the scene from the set.

## Open questions

- Leo decides whether these 8 starter sets fit his advisers or whether some should be swapped, for example for family scenes across Singapore's communities, or HDB life.
- Should a photo be able to sit in more than one set? This spec keeps one folder per photo to reuse today's folders.

## Related

brand-media-library, formats-slideshow, formats-faceless-video, formats-animated, edit-slideshow, edit-carousel, brand-demo-videos
