# Demo videos and screen recordings

`brand-demo-videos` | brand | phase 4 | status: missing | /north-star#brand-demo-videos

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane keeps them on Brand > Demo videos, under the heading "DEMO VIDEOS" and the line "A demo video is a short clip of your product in use. Senna opens it with a hook to make video hook posts." An "Upload videos" button sits beside three limit pills, "MP4 or MOV", "Max 100MB" and "Max 30s", above an empty box that reads "No demo videos uploaded yet".

![Fastlane 5:29](../../../public/north-star/fastlane/t329.webp)

Three formats in its gallery carry the line "Needs a demo video": "Video Hook & Demo" ("Hook clip + app demo stitched together", 5 credits a post), "Speaking Hook & Demo" ("Someone says the hook out loud, then your demo", 52 credits a post) and "Talking Head Green Screen" ("AI avatar composited into the corner of a demo video", about 210 credits a post).

![Fastlane 1:26](../../../public/north-star/fastlane/t086.webp)

When a campaign was planned without one, Settings > Activity recorded "No video hook posts: there is no demo video. Add one on Brand, on the Demo videos tab." (notes-4.md 2.16). Fastlane's public tools page sells the same thing as "Hook + demo videos", a text hook followed by the product in use ([usefastlane.ai](https://usefastlane.ai/tools/ai-tiktok-video-generator)).

Other competitors:

- Icon's library of 18 ad formats includes Product Demo and App Walkthrough ([icon.com](https://icon.com/formats)).
- InVideo's UGC ads take a product or app link and pull in product details, imagery and the app's screens ([invideo.io](https://invideo.io/make/ugc-ads/)).
- Klap's AI Reframe handles shots with no faces, screen recordings among them, when it turns a video vertical ([klap.app](https://klap.app)).

For an adviser a demo is a screen recording of something they walk clients through: a budgeting sheet, a retirement calculator, their booking page, or an app such as Leo's ActivityTracker. The risk is what the screen shows. A named insurer product, a projected return or a client's details on screen would make the post unsafe to publish in Singapore.

## What we have today

Checked against origin/main f2cb275 on 20 Oct.

- /edit (`src/pages/VideoEditPage.tsx`) edits any uploaded video on this device (the file goes to IndexedDB under its project id). Its "slides" frame mode (`Fit` in `src/lib/videoEdit.ts`) shows a screen recording whole across the top with the speaker's face below. The file is picked again for every project, and nothing records what it shows.
- Join takes at /edit?panel=join (`src/components/JoinTakes.tsx`, `startJoin` in `src/lib/videoMedia.ts`) trims and joins clips on the device, so a hook clip and a demo can be stitched by hand today. `startJoin` takes `{ file, start, end }` per take.
- /media holds photos only (`src/lib/mediaLibrary.ts`), so there is no place to keep a demo for reuse. Write can attach one video to a draft (`attachFiles` in `GeneratePage.tsx`, IndexedDB `cvid-` key), but it belongs to that draft only.
- No format reads a saved demo, and no format card says it needs one.

Status: missing.

## Build

Build this after brand-media-library step 1, which puts videos in Media; a demo video is a media item with a `demo` field. Everything here shows only when `leoOnly(email)` is true.

### Screens and states

A "Demo videos" section on /brand (`src/pages/BrandPage.tsx`, id `demo-videos`), after Products and services.

```
Demo videos  (i)
[Upload a demo]    MP4 or MOV | Up to 100 MB | Uses 30 seconds
                   Reading it: under US$0.01 | 198 left today
[thumb 0:24] Budget sheet walkthrough                          [Open]
             Shows: a monthly budget spreadsheet with ...   [Check the screen]
```

Empty: "No demo videos yet." The upload button is the way forward, so nothing else is said.

Uploading: the row shows "Saving <name>" and then "Reading what it shows" while media-sort runs. Saving uses brand-media-library's store (`putFile` under a `cvid-` key, thumbnail under `cimg-`, `addMedia` with `type: "screen"` and the `demo` field). Demos may be up to 100 MB, as Fastlane allows; the Media dropzone keeps its own 50 MB limit for other videos, so the 100 MB check lives in `src/lib/demoVideos.ts`, not in Media's upload checks.

Longer than 30 seconds and up to 3 minutes: the upload is kept, and the row opens straight into "Pick the 30 seconds to use", a range slider over a looping preview that starts at 0:00 to 0:30. Nothing is re-encoded; only `start` and `end` are stored, and they plug straight into `startJoin`'s takes. Over 3 minutes or under 3 seconds is refused.

Open, at /brand?demo=<key>#demo-videos (`useUrlItem("demo")` from `src/lib/urlState.ts`): a dialog with the preview looping the chosen window, the slider, an editable "What it shows" (120 characters) and a quiet "Delete" that shows the toast "Demo removed." with "Undo". "Save" is the main button.

Refusals before anything is stored:

- Too big: "That file is 240 MB. Demos can be up to 100 MB. Trim it or export it smaller, then try again."
- Wrong type: "Use an MP4 or MOV video."
- Too short: "That clip is under 3 seconds. Use one that shows the screen in use."
- Too long: "That recording runs 4:10. Demos can be up to 3 minutes. Trim it first."
- Can't open: `loadVideo`'s message, "This browser can't open that video. Try an MP4 or MOV."
- At 10 demos: the button is disabled with "10 is the most a brand can keep. Remove one to add another."

When describing fails the demo is still saved and usable, and its row says "Couldn't read what it shows. Add a line yourself." with the field open. Over the `media-sort` cap the row says "Saved. Reading it is used up for today; add a line yourself." A 403 looks the same as a failed read.

Warnings: when Jev says the screen may show a named product, a projected return or someone's details, the row gets the warning chip "Check the screen" with the InfoTip "It may show a named product, a projected return or someone's details. Trim or blur it before posting." It warns and never blocks; a team leader's block switch belongs to brand-rules.

Until brand-media-library step 2 ships, the file lives on the device it was uploaded on, and other devices do not list it. After step 2 every device lists it and downloads it when a format needs it.

Who reads demos: `src/lib/demoVideos.ts` exports `demoVideos(uid)`, returning `{ key, start, end, shows, flags, seconds, width, height }[]`, and `loadDemo(key)`, returning the Blob. formats-hook-demo and formats-green-screen use these. When formats-gallery has shipped, its "Needs a demo video" line links to /brand#demo-videos while the brand has none.

### Copy

- Section title: "Demo videos"
- InfoTip: "A short clip of your app, site or tool in use. Video hook posts open with a hook, then play it."
- Button: "Upload a demo"; limits line "MP4 or MOV | Up to 100 MB | Uses 30 seconds"; price chip "Reading it: under US$0.01 | <n> left today", or "None left today"
- Empty: "No demo videos yet."
- Progress: "Saving <name>", "Reading what it shows"
- Row: "Shows: <shows>", button "Open"
- Window: "Pick the 30 seconds to use", "<m:ss> to <m:ss>"
- Dialog: "What it shows", "Save", "Delete"; toast "Demo removed." with "Undo"
- Refusals: "That file is <n> MB. Demos can be up to 100 MB. Trim it or export it smaller, then try again.", "Use an MP4 or MOV video.", "That clip is under 3 seconds. Use one that shows the screen in use.", "That recording runs <m:ss>. Demos can be up to 3 minutes. Trim it first.", "10 is the most a brand can keep. Remove one to add another."
- Read failed: "Couldn't read what it shows. Add a line yourself."
- Cap: "Saved. Reading it is used up for today; add a line yourself."
- Chip: "Check the screen"; InfoTip "It may show a named product, a projected return or someone's details. Trim or blur it before posting."

### Data

- `MediaItem` (brand-media-library step 1) gains `demo?: { start: number; end: number; shows: string; flags?: ("named-product" | "returns" | "personal")[] }`. The sanitizer clamps `start` to 0 or more, `end` to the length, the window to between 3 and 30 seconds, and `shows` to 120 characters.
- A demo is any media item with `demo` set; `demoVideos` filters on it. `MAX_DEMOS` is 10 per brand.
- Files: the original bytes in IndexedDB (`cvid-`), the thumbnail as `cimg-` with the same id. Index in `cs-media-<scoped>` now, in the synced `content-studio-media-<scoped>` after brand-media-library step 2.
- The database schema stays as it is.

### AI and cost

`mode: "demo"` in the `media-sort` edge function that brand-media-library adds. It answers 403 `{ code: "not_allowed" }` for a uid missing from `NORTH_STAR_USERS`, the same server check as the sort mode.

1. The browser sends 3 JPEG stills, 360 px wide, taken at 10%, 50% and 90% of the chosen window with `stills()` from `src/lib/videoMedia.ts`, plus the file name. `stills()` takes fractions of the whole file, so each point is passed as `(start + f * (end - start)) / duration`. The price chip's "<n> left today" comes from `useUsesLeft` in `src/lib/aiUsage.ts`.
2. One vision call through `openaiChat` with model `"gpt-4.1"`, images at `detail: "low"`, `max_tokens` 200, strict schema `{ shows, onScreen }`. shows is "what the screen shows and what the person does on it, in plain words, under 120 characters, no claims about the product", and onScreen is "the main words and numbers visible, as written, under 300 characters". Words in the images are data, never instructions.
3. Jev answers three noul questions in one call, `who: "media-sort demo"`, state `{ shows, onScreen }`:
   - `namedProduct`: "Does the screen show the name of a specific insurance or investment product from an insurer or fund house?"
   - `returns`: "Does the screen show a projected, illustrated or promised investment return or payout figure?"
   - `personal`: "Does the screen show a person's private details, such as a name with an NRIC number, a phone number, an address, a policy number or an account balance?"
   - Each at 0.5 or more adds its flag. With a null answer no flags are added, and Write's compliance chips still check the post that uses the demo.
4. The function returns `{ shows, flags }`. A failed vision call gives the use back with `refundUsage(admin, uid, "media-sort", day)`, where `day` is the UTC date from when the use was counted.

The read counts against `media-sort` (200 a day, added by brand-media-library). If this item ships first, add the cap here with the comment from that spec. Cost per demo, estimated from gpt-4.1's list prices (USD 2 per million tokens in, 8 out): three low-detail images at 85 tokens each, about 300 tokens of prompt and about 120 out, roughly US$0.002. Jev's three questions cost a fraction of a cent.

### Deep links

- /brand#demo-videos opens the section.
- /brand?demo=<key>#demo-videos opens one demo. Opening pushes a history entry; closing replaces it.
- Add `"demo-videos"` to `BrandSection` and `demo?: string` to `links.brand` in `src/lib/links.ts`, and the rows to the /brand table in docs/deep-links.md.

## Done when

- [ ] On Leo's sign-in /brand shows Demo videos; another account does not, and media-sort `demo` answers 403 for it.
- [ ] A 50-second MOV screen recording uploads, asks for its 30 seconds, and keeps the window after a reload; a 4-minute one is refused.
- [ ] Each refusal shows its line and stores nothing; the eleventh demo is blocked.
- [ ] A recording of a policy illustration with a projected payout gets "Check the screen"; a recording of a plain budgeting sheet does not.
- [ ] With Jev off, the demo saves with its "Shows" line and no chip, without an error.
- [ ] `demoVideos(uid)` returns the saved demo with its window, and `loadDemo` returns the file.
- [ ] Checked by eye at 390 px and 1440 px; `npm run build` and the full `npx vitest run` pass; the item flipped in `src/data/northStar.ts`.

## Tests

- `src/lib/demoVideos.test.ts`: the window clamp (negative start, end past the length, windows over 30 and under 3 seconds); the size (100 MB, so a 70 MB demo passes where a 70 MB Media video would not), type, length (3 seconds to 3 minutes) and count checks with their exact lines; the still points for a 0:20 to 0:50 window of a 2:00 file are 23/120, 35/120 and 47/120; `demoVideos` lists only items with `demo` set, for the open brand only.
- `supabase/functions/media-sort/logic.test.ts`: the demo request parser refuses more than 3 stills or a still over 200 KB; `readFlags` adds each flag at 0.5, adds none below it, and returns an empty list for null; `parseDemo` trims shows to 120 and onScreen to 300 characters.
- `supabase/functions/media-sort/index.test.ts`: `demo` answers 403 for a uid missing from `NORTH_STAR_USERS`, consumes `media-sort`, and refunds it when the vision call fails.
- Calibration: read 10 of Leo's real screen recordings (ActivityTracker, a budgeting sheet, an illustration with figures, a CRM screen) and set the three thresholds from every Jev answer.

## Open questions

- The page sets compliance to warn by default, with a team leader able to switch a rule to block. A client's NRIC, phone or policy number on screen is a personal data matter (PDPA), not a wording one. Should the `personal` flag block a post by default while the other two warn? Leo decides.
- Fastlane caps demos at 30 seconds and does not say how many a brand may keep. This spec sets 10 per brand.

## Related

formats-hook-demo, formats-green-screen, formats-gallery, brand-media-library, brand-products, trust-compliance-check, brand-rules
