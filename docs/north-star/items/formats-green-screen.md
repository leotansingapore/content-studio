# Green screen videos

`formats-green-screen` | formats | phase 3 | status: partial | /north-star#formats-green-screen

## Leo asked

19 Oct 2026: "the idea is that one can remix any content format and the ai will regenerate"

He did not name this format; it comes from his Fastlane recording and the competitor research.

## How the best do it

### Fastlane

Three of Fastlane's 42 formats are green screens, each "About 210 credits a post":

| Card | Description, verbatim | Requirement |
| --- | --- | --- |
| "Talking Head Green Screen" | "AI avatar composited into the corner of a demo video" | "Needs a demo video" |
| "Notes Green Screen" | "A presenter with a mic talks over an iOS Notes list" | none |
| "Pixar Green Screen" | "An animated expert in the corner explains while scenes change behind them" | none |

![Fastlane 1:26](../../../public/north-star/fastlane/t086.webp)

The Notes preview is a phone notes page titled "How I Stopped Overspending" with tick boxes, "Wait 24 hours before any buy over $50", "Move savings out on payday, not month end" and "Log every coffee and takeaway for one week", and a woman standing in front of the lower half (the card's description says she has a mic). The Talking Head Green Screen preview is a man cut out in the lower part of the frame over a travel app's screen.

![Fastlane 1:29](../../../public/north-star/fastlane/t089.webp)

The animated one puts a cartoon expert in the bottom corner of a 3D office scene; that style belongs to `formats-animated`, and the name is a studio's trademark, so we never use it. Leo did not open these create pages, so their options are unverified. Fastlane's activity log lists "Saved a green screen" by "Blitz" with "No credits used", but it shows the same for a saved slideshow and a saved wall of text, both 5-credit formats, so it says nothing sure about the green screen's price (notes-4 2.16). A related card, "Green Screen Mobile with App" (81 credits, "Needs an app"), is covered in `formats-hook-demo`.

### Others

- Descript removes the background with no physical screen ("Green Screen" effect) and puts an uploaded image or stock background behind the person, or leaves it see-through; an "All Scenes" toggle applies it across the video, and "Chroma Key" handles a real green screen ([help](https://help.descript.com/effects-animations-transitions/green-screen.md)).
- Edits (Instagram, by Meta) has a free green screen in its camera and as a video layer: pick a photo or a video as the background, then pinch to place the person ([guide](https://primalvideo.com/video-creation/editing/how-to-use-the-new-instagram-edits-app-step-by-step/), [edits](https://edits.instagram.com/)).
- Revid.ai's "Remove Avatar Background" sets the talking avatar picture-in-picture over B-roll for 20 credits ([avatars](https://www.revid.ai/llm/revid-ai-avatars-and-podcasts.md), [costs](https://www.revid.ai/llm/revid-ai-credit-costs.md)).
- Klap's reframe lays out split screen, picture-in-picture and screencast layouts automatically ([klap](https://klap.app)).
- Icon lists "Green Screen" as one of its 18 ad formats ([formats](https://icon.com/formats)).

## What we have today

Checked against origin/main 08537d1, rechecked 2026-10-20.

- The editor's face tab has "Behind you" with "As filmed", "Blur", "Colour" and "Picture", and the tip "Found on this device, frame by frame. Best with one person." (`src/pages/VideoEditPage.tsx`). The person is found by MediaPipe's `selfie_segmenter` (250 KB, about 7 ms a frame, reading a 256 px wide copy) in `src/lib/faceVision.ts`. `paintEffects` calls the private `paintBackdrop(g, x, y, w, h, s, b, picture?: HTMLImageElement)`, which draws the backdrop behind them in preview and export alike, keeping a copy of the frame in the scratch canvas `front`. `Backdrop` in `src/lib/videoEdit.ts` is `blur | colour | picture`. `sanitizeBackdrop` accepts a picture only with a key matching `/^bd-[a-z0-9-]{4,60}$/i` (the editor writes `bd-<project id>-<time>`), and a picture is kept on the device it was added on.
- Effects reach the export through `fx` (`Frame["fx"]` in `src/lib/videoMedia.ts`), called with the canvas and a rectangle only. The real-time export draws with `drawFrame`; the fast export (`src/lib/fastExport.ts`) does too, and reads B-roll files frame by frame with a `FrameReader` (`broll.at(t)`), not a playing `<video>`.
- The "Slides and me" frame (`fit: "slides"`) lays a screen recording across the top with the speaker's face below, for one recording that already holds both.
- AI presenters speaking a script exist ("You speaking", see `formats-talking-head`); their background is a soft blurred office or home, which the segmenter can cut out.
- `src/lib/carouselRender.ts` already turns an SVG into a PNG (`svgToPng`), which can draw a notes card.

So it is partial: a person over a still picture works on your own footage, but there is no video behind the person, no made notes list, no corner placement, no AI presenter in this layout and no format page.

## Build

Page `/make/green-screen`, component `src/components/make/GreenScreen.tsx`. The page gathers the parts and opens an editor project; the compositing is the editor's, extended as below, so preview, export and later edits all use one path.

### Screens and states

```
Who talks         [ My video | AI presenter ]
                  [Pick a video]  One person facing the camera works best.
Behind them       [ A note list | My demo video | A picture ]
   Note list:     Title  [ How I stopped overspending ]
                  Items  [ Wait 24 hours before any buy over $50 ] [+ Add item]   [ Write it for me ]
Where they stand  [ Bottom | Corner ]
------------------------------------------------------------------
About US$0.02 a post        28 left today        [ Make the video ]
```

With "AI presenter", the script, voice, setting and length controls of `formats-talking-head` appear under the toggle and the chip shows that format's price. "My demo video" and "A picture" pick files that stay on this device. A preview card on the right redraws the background (the note card, the demo's first frame or the picture) with a grey person shape in the chosen spot as soon as anything changes, so the layout is visible before anything is made.

Making, with your own video: "Drawing your note...", then "Putting it together...", then the editor opens. Your own video is not re-recorded: it goes to the editor through `handToEditor(file, extra)`, the hand-off from `formats-wall-of-text`. With an AI presenter: the talking-head job from `formats-talking-head` runs with this page's `extra`, then the same. Leaving the page does not stop either job.

Done: the editor opens on the project on its face tab (`/edit?p=<id>&tab=face`, through `extra.tab`) with `backdrop` and `stand` already set in `extra.settings`, and the toast "Your green screen is ready. Export it when it looks right."

Failed: when the segmenter finds nobody in the first seconds, the page says "We couldn't find a person in this video. Use a clip with one person facing the camera." While the model loads the first time, "Getting the cut-out ready on this device..." shows. A writer failure shows "Couldn't write the list. Try again in a minute." and the use comes back. AI presenter failures use the talking-head messages.

Refused: "That topic can't be turned into a list that's safe to post. Try another."

Over the daily cap: the server's line for whichever cap is full (`remix-make`, or `ai-video` on the presenter path), with the button disabled.

Not Leo: `NotFoundPage`.

### Copy

| Where | Words |
| --- | --- |
| Page | Title "Green screen". One line "You in front of a list, a demo or a picture." |
| Who | "Who talks", "My video", "AI presenter", "Pick a video", "One person facing the camera works best." |
| Behind | "Behind them", "A note list", "My demo video", "A picture" |
| Note list | "Title", "Items", "+ Add item", "Write it for me", placeholder "Like how I stopped overspending" |
| Place | "Where they stand", "Bottom", "Corner" |
| Footer | "About US$0.02 a post" (own video) or the talking-head price, "<n> left today", button "Make the video" |
| Steps | "Drawing your note...", "Putting it together..." |
| Done toast | "Your green screen is ready. Export it when it looks right." |
| Editor, Behind you | a fifth chip "Video", and a "Where you stand" row with "Full", "Bottom", "Corner" |

### Data

- `Backdrop` in `src/lib/videoEdit.ts` gains `{kind: "video", key}`, a device file key (`putFile`) for a video that plays muted and loops behind the person; `sanitizeBackdrop` in `faceVision.ts` accepts it with the same `bd-` key rule as a picture, so both keys are written as `bd-<id>`.
- `EditSettings` gains `stand?: "bottom" | "corner"` (unset means full frame, today's look). Bottom scales the person to 70% of the frame height, anchored to the bottom edge and centred; corner scales them to 45% of the frame width, anchored bottom left with a 4% margin.
- The note card is drawn by a new pure `src/lib/notesCard.ts` (layout to SVG, like `carouselLayout.ts`) at 1080x1920: an off-white page, the title in bold, then up to 6 items with round tick boxes. It is a plain notes look with no phone status bar and no Apple app chrome. It becomes a PNG with `svgToPng`, goes into device files under a `bd-` key, and the backdrop is `{kind: "picture", key}`.
- Everything stays on the device; an export saves the caption to My posts as today. No synced data and no schema change.

### AI and cost

- The list: `remix` mode `make` with `as: "notes"`, a shape this item adds to `supabase/functions/remix/logic.ts`. Input: a topic or a `RemixSource`, `brandPack(userId)` as remembered, and the voice from `voiceForClone`. Output: `{refuse, reason, title, items: [3 to 6 strings]}`, the title at most 8 words and each item at most 12 words, under that function's compliance block (no promised returns, no product names, no invented numbers). Cap `remix-make`, 1 to 2 US cents.
- The cut-out: on the device, free, as today.
- The AI presenter path costs what `formats-talking-head` costs (15 s about US$2.75) with its caps.
- Drawing a video backdrop: `Frame["fx"]` gains a third argument, the output time `out`, which `drawFrame` already knows and passes in preview, real-time export and fast export alike. The `fx` built in `VideoEditPage.tsx` takes the backdrop frame for `out % duration` from one of two places. In the preview and the real-time export it is a hidden muted `<video>` kept in step the way `syncBroll` keeps B-roll (exact when paused, within 0.25 s while playing). In the fast export it is a `FrameReader` over the backdrop file, opened the way `fastExport.ts` opens B-roll files, with the file passed in a new `FastArgs.backdropFile`. `paintEffects` and `paintBackdrop` in `faceVision.ts` take any `CanvasImageSource` instead of only an `HTMLImageElement`. For `stand`, the masked person is drawn to the scratch canvas `front` that `paintBackdrop` already uses, then drawn back scaled into the bottom or corner box over the backdrop.
- No Jev question; the user chooses everything here.

### Deep links

- `/make/green-screen?who=presenter` (default `mine`), `?behind=demo` or `picture` (default `notes`), `?stand=corner` (default `bottom`); all replace history. `?source=<kind>:<id>` writes the list from a source.
- The editor opens at `/edit?p=<id>&tab=face`, which exists today.
- Builder `links.makeFormat("green-screen", ...)`, a row in `docs/deep-links.md`.

## Done when

- [ ] For Leo, a phone selfie video plus a written note list gives a 9:16 video of the person in front of the note, opened in the editor, at no paid cost beyond the list.
- [ ] A demo video can sit behind the person, playing in step with the edit in preview and export.
- [ ] Bottom and corner placements look right at 9:16 and 4:5, checked by eye.
- [ ] An AI presenter can stand in front of each background.
- [ ] Editing an existing project offers the new "Video" chip and the "Where you stand" row.
- [ ] Older projects still open with their backdrop unchanged.
- [ ] No person found, a failed list and over the cap each show their message.
- [ ] Checked at 390 px and 1440 px; `npm run build` and the full `npx vitest run` pass; the `src/data/northStar.ts` item is flipped.

## Tests

- `src/lib/notesCard.test.ts`: 6 items of 12 words fit inside the card at 1080x1920 with a fake `measure`, a long title wraps to at most 2 lines, and an empty item list draws the title alone.
- `src/lib/videoEdit.test.ts` and the backdrop sanitizer: `{kind: "video", key}` with a `bd-` key and `stand` are kept, a key without `bd-` is dropped, and settings saved before these fields load unchanged.
- A pure `standBox(stand, frameW, frameH, personW, personH)` returns a box inside the frame for both placements at 9:16 and 4:5.
- `drawFrame` with a spy `fx`: it is called with `out` as its third argument, and an `fx` written for two arguments still works.
- `supabase/functions/remix/logic.test.ts`, `as: "notes"`: 3 to 6 items, word limits, the MAS lines in the prompt, `refuse` passed through.

## Open questions

- A person over an article is in this item's scope, but neither the recording nor the research shows a competitor doing it (unverified). A picture of an article from a link needs a page screenshot service, which is a new vendor, so for now the user uploads a screenshot as "A picture". Leo decides on a vendor.
- Should the note card look like a real phone notes app? The default here is a plain look of our own, which keeps clear of copying Apple's design; Leo can choose otherwise.

## Related

formats-talking-head, formats-hook-demo, brand-demo-videos, formats-animated, people-presenters, edit-video, formats-gallery
