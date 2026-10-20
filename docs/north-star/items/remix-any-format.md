# Remix into any format

`remix-any-format` | remix | phase 1 | status: partial | /north-star#remix-any-format

## Leo asked

19 Oct 2026: "the idea is that one can remix any content format and the ai will regenerate"

## How the best do it

Fastlane ties the output to the source by default and lets you break the tie. With an ad attached to the chat composer, the helper under the note box says "This remix makes a video, like the original. Remove it to make something else.", and the "Image", "Video", "Script" and "Campaign" chips are dimmed until the card is removed (4:12). Template trends open the format they came from (a slideshow trend opens Slideshow, a wall of text opens Wall of Text), so Leo's remix of the 8-slide "6 Signs You Are an Abusive Wife (You might not realise)" came back as a 9-slide slideshow about sales prospecting (2:53). Its public tool pages describe one URL turned into a batch across four formats: "AI UGC videos", "Slideshows", "Hook + demo videos" and "Memes", free with no card, paid from $29 a month. [AI TikTok video generator](https://usefastlane.ai/tools/ai-tiktok-video-generator), [AI UGC video generator](https://usefastlane.ai/tools/ai-ugc-video-generator)

![Fastlane 4:12](../../../public/north-star/fastlane/t252.webp)

![Fastlane 2:53](../../../public/north-star/fastlane/t173.webp)

Products that turn one source into other formats:

- Hypefury: "Write once, publish twice", turning posts into Instagram images, Reels, TikTok videos or LinkedIn carousels in one click, and threads into LinkedIn posts or carousels. [hypefury.com](https://hypefury.com/)
- Blotato: one TikTok into an Instagram post and a tweet, or three YouTube videos into a blog post, a LinkedIn post and a tweet, on AI credits by plan. [pricing](https://www.blotato.com/pricing)
- Contentdrips: "Tweet to Photos", "Tweet to Instagram Posts", "Tweet To Carousel Generator". [contentdrips.com](https://contentdrips.com/)
- Supergrow: paste a YouTube video, an article or a PDF and get "multiple post formats from a single source" in your voice, on Pro and up. [supergrow.ai](https://www.supergrow.ai/), [pricing](https://www.supergrow.ai/pricing)
- Eden (2026 entrant): "Boost" a saved swipe into variations across formats, lengths and platforms, each platform with its own words. [eden.so](https://eden.so/)
- Creatify Ad Clone outputs 9:16, 16:9 and 1:1 at once, 2 to 20 credits a video. [ad clone](https://creatify.ai/features/ad-clone)
- Cutting a long video into clips (Kapwing Repurpose Studio at 2 credits a minute, Descript "Create clips" with 1 to 20 clips) is the other common shape, and it belongs to formats-clips. [Kapwing](https://www.kapwing.com/help/how-to-use-kapwings-repurpose-tool/), [Descript](https://help.descript.com/repurpose/create-clips-from-your-content)

## What we have today

- Write (/generate) can turn a remix brief into a text post, a carousel's text, a short-video script or story frames, because `format` is a Write param. Only some remix links set it: top posts from the post type (`generatorFormat` in src/lib/topPosts.ts), the account audit from the post's format, /trends from the kit's `format`, and hub trends always `short-video`. The ads, following, market and live creator-lookup links set no format, so Write opens on its default, a text post. The user can change it in the brief, but there is no format choice on the remix itself.
- Repurpose (src/lib/repurpose.ts, /drafts) turns the adviser's own draft into a LinkedIn post, LinkedIn carousel, IG carousel, IG Reel, TikTok script or Facebook post, as text, one at a time, by opening Write with a ctx brief.
- One long piece (src/components/LongPiece.tsx on /coach, idea-dump mode "long", cap `repurpose-long` 20) turns a transcript or newsletter into 5 text posts in one run. It is the only many-from-one maker today, and all five are text posts.
- The carousel maker (/carousel?draft=) renders any draft into 1080x1350 slides with the brand kit. The AI video panel (/edit?panel=ai, src/components/AiVideo.tsx, src/lib/aiVideo.ts) makes "You speaking" avatar videos (a photo picked each time under "My photo", or an AI presenter made from one of six LOOKS) and explainers. Nothing feeds it a script: `/edit` has no param for one (src/lib/links.ts `edit`), and its jobs (`makeAvatar`, `makeExplainer`) already run outside React and refund through `ai-video` status checks.
- So a remix can end as text in any of Write's four formats, and nothing makes a carousel, a video or several formats from one press.

## Build

Build after remix-everywhere, inside its Remix sheet, so the `leoOnly` gate and the REMIX_USERS check cover it. A "Make" row in the sheet picks one to three output formats. The `remix` function writes each one in its own shape, and the job hands each to the maker that already exists.

### The formats in phase 1

| `as` | Chip | What the job does | Opens | Price shown | Caps |
| --- | --- | --- | --- | --- | --- |
| `post` | "Text post" | make, save a text-post draft | `/generate?draft=<id>` | none | remix-make |
| `carousel` | "Carousel" | make with 4 to 9 slides, save a carousel draft written as "Slide 1:", "Slide 2:" lines | `/carousel?draft=<id>` | none | remix-make |
| `script` | "Script to film" | make with beats, save a short-video draft with `storyboard` | `/generate?draft=<id>` | none | remix-make |
| `speaking` | "You speaking" | make a script of at most 70 words, save it, then `speak` (src/lib/textVoice.ts), then `sliceVoiceover` and `makeAvatar(name, face, voiceover)` (src/lib/aiVideo.ts) | `/edit?panel=ai&kind=avatar` | "Up to US$5.50" | remix-make, ai-voice, ai-video, ai-video-global |
| `explainer` | "Explainer video" | make 3 to 6 scenes `{ say, picture }`, save them, then `makeExplainer(name, scenes, voice)` | `/edit?panel=ai&kind=explainer` | "About US$0.05" | remix-make, ai-voice, ai-video, ai-video-global |

The face for `speaking` and the voice for both video formats come from remix-your-brand (your saved face first, a labelled AI presenter second). Until that ships, `speaking` makes a new AI presenter with `makePresenter(look)` and a random look from LOOKS, labels it "AI presenter", and uses the voice "alice". `makePresenter` returns nothing: when it resolves, the picture's link is in `aiJob().url`, and that string goes to `makeAvatar` as the photo. The presenter counts against `ai-image` (5 a day, about US$0.006). The brand kit headshot is never used, because BrandPage stores it as a 256 x 256 square.

Formats that other items add as chips when they ship: "Slideshow" (formats-slideshow), "Wall of text" (formats-wall-of-text), "Static ad" (formats-static-ad), "Meme" (formats-memes). Until then they are not shown.

The default is `defaultOutput(source)` from remix-everywhere: a video gives "Script to film", a carousel gives "Carousel", anything else gives "Text post". Paid formats are never preselected.

Platform on the saved draft: the source's platform when Write supports it (instagram, tiktok, linkedin, facebook), else the brand's `positioning.platform`. Carousels use instagram, scripts use the source's platform when it is tiktok or instagram, else instagram.

### Screens and states

```
Make   [Text post] [Carousel *] [Script to film]
       [You speaking  Up to US$5.50] [Explainer video  About US$0.05]
       Pick up to 3.
...
[ Remix into 2 formats                   26 left today ]
```

- The sheet opens with one chip selected. Pressing another chip adds it, and pressing a selected one removes it, unless it is the only one left; a fourth pick is ignored and the line under the row turns to "Pick up to 3." in the warning colour.
- "You speaking" and "Explainer video" cannot both be picked in one press (one AI video runs at a time, `aiBusy()` in src/lib/aiVideo.ts); picking one dims the other with the hint "One video at a time."
- While another AI video is being made anywhere in the app, both video chips are disabled with "Another video is being made. Try again when it's done."
- Over the `ai-video` cap, both video chips are disabled with "No videos left today."
- The button label counts the picks: "Remix" for one, "Remix into 2 formats" or "Remix into 3 formats" for more. Its chip shows the remix uses left, and, with a video format picked, the video price too: "Up to US$5.50 | 1 of 2 videos left".
- Making: one step line per format ("Writing your carousel", then "Writing your script"), then for video formats the AiVideo job's own steps ("Making the voiceover...", "Making the pictures, 2 of 5 ready..."), which the pill on every page also shows.
- Done: one row per format with its hook and its own "Open" button; the first row's button is the primary one. A video row says "Opening in the video editor" and its "Open" goes to `/edit?panel=ai&kind=avatar` or `kind=explainer`, where the editor takes the finished join (`onJoinJob` and `endJoin` in src/lib/videoMedia.ts, read by VideoEditPage) and opens it with captions. The join waits in memory until the editor takes it, wherever the job started; confirm that once with a job started from /swipe.
- A failure in one format does not stop the others: its row shows "This one didn't go through. Nothing was used for it." with "Try again".
- A "You speaking" voiceover that comes back over 30.5 s (the same `vo.seconds > MAX_AVATAR_SECONDS + 0.5` test AiVideo uses) stops before `makeAvatar`, so no video use is spent. The row shows "The script runs <n> s, over the 30-second limit. Shorten it, then try again." with "Open the script", and the saved script draft stays.

### Copy

| Where | String |
| --- | --- |
| Row label | "Make" |
| Chips | "Text post", "Carousel", "Script to film", "You speaking", "Explainer video" |
| Price tags | "Up to US$5.50", "About US$0.05" |
| Limits | "Pick up to 3.", "One video at a time.", "Another video is being made. Try again when it's done.", "No videos left today.", "This needs <k> uses and <n> are left today." |
| Button | "Remix", "Remix into 2 formats", "Remix into 3 formats" |
| Steps | "Writing your text post", "Writing your carousel", "Writing your script", "Writing your video script" |
| Done row | "<Format> ready", "Opening in the video editor", "Open" |
| Row failure | "This one didn't go through. Nothing was used for it.", "Try again" |
| Too long | "The script runs <n> s, over the 30-second limit. Shorten it, then try again.", "Open the script" |
| "What Remix does" format words | "a text post", "a carousel", "a script and shot list", "a video of you saying it", "an explainer video" |

### Data

- Each format is its own DraftEntry carrying the same `source` snapshot and its own `remix.as`. Video formats save the script draft first, so the words survive a failed video.
- The avatar and explainer clips follow today's AiVideo path: made by Higgsfield, joined on the device, opened as a project in /edit (device only, as today).
- No new storage key and no schema change.

### AI and cost

- The `make` request gains `as`, and `supabase/functions/remix/logic.ts` validates one output shape for each of its five values: `post { hook, body, cta, hashtags }`, `carousel { hook, slides: { title, body }[4..9], cta }`, `script { hook, beats: ShotBeat[4..8], caption, cta }`, `speaking { script (at most 70 words, no stage directions, so the voiceover stays under MAX_AVATAR_SECONDS, 30 s, in supabase/functions/ai-video/logic.ts), caption }`, `explainer { scenes: { say, picture }[3..6], caption }`. Scene limits match MIN_SCENES and MAX_SCENES in supabase/functions/ai-video/logic.ts.
- One OpenAI call per format through `openaiChat`, about 1 to 2 US cents each (unverified, log the first 20). Three formats use three `remix-make` counts, so the button is disabled with "This needs 3 uses and 2 are left today." when fewer are left (the business-cost-preview wording).
- `speaking`: ElevenLabs turbo v2.5 through text-voice (`ai-voice`, 10 a day), then Higgsfield Speak at 11 credits per 5 s slice or 22 per 10 s slice (SPEAK_CREDITS), at most 4 slices, so at most 88 credits = US$5.50 at CREDIT_USD 0.0625. The estimate before pressing is "Up to US$5.50"; the done row shows the real figure from `avatarCredits`.
- `explainer`: Soul v2 at 0.09 credits a picture (PICTURE_CREDITS), at most 6 pictures, about US$0.03, plus the voiceover; the tag rounds up to "About US$0.05". The scenes come from the remix call, so `writeExplainer` and its `ai-video-script` cap are not used.
- Both video formats count against the existing `ai-video` (2 a day) and `ai-video-global` (20 a day) caps, and a failed video is refunded the way AiVideo already refunds it, so this item adds no cap of its own beyond `remix-make` and asks Jev nothing.

### Deep links

`?remix=<key>&as=carousel` or `?remix=<key>&as=post,script` sets the formats as a comma list and replaces the history entry; the source's default is left out and unknown values are dropped. Results open at `/generate?draft=<id>`, `/carousel?draft=<id>`, `/edit?panel=ai&kind=avatar` and `/edit?panel=ai&kind=explainer`. Add `as` to the remix row in docs/deep-links.md.

## Done when

- [ ] From one /swipe reel, one press with "Carousel", "Text post" and "Script to film" picked gives three drafts, each opening ready in its maker.
- [ ] A /swipe carousel remixed as "You speaking" ends as a captioned avatar video open in /edit, with the real credit figure on the done row.
- [ ] An ad remixed as "Explainer video" ends as an explainer open in /edit.
- [ ] The video chips are disabled with the right line when another video is running and when the `ai-video` cap is used up.
- [ ] One failing format leaves the others done and refunds its own count.
- [ ] `as` in the URL survives a reload.
- [ ] Build, full vitest, 390 px and 1440 px; northStar.ts flipped.

## Tests

- `supabase/functions/remix/logic.test.ts`: each `as` has a validator that rejects the wrong shape (a carousel with 2 or 10 slides, a speaking script over 70 words, an explainer with 2 or 7 scenes).
- `src/lib/remix.test.ts`: `carouselDraftText(slides, cta)` writes "Slide N:" lines that `splitDraftIntoSlides` (src/lib/carousel.ts) turns back into the same number of slides; `platformFor(source, as, positioning)` covers each case; `formatsAllowed` blocks two video formats together.
- `src/lib/remixJob.test.ts`: with `makeAvatar` and `speak` mocked, a `speaking` run saves the script draft before calling them, and a failure in `speak` leaves the draft saved and the row failed.

## Open questions

- Should "You speaking" stop after the script for a yes before the paid video, the way agent-approvals would? This spec runs it in one press with "Up to US$5.50" on the button, as Fastlane does with "Remix, 130 credits". Leo decides.
  Decided for phase 1 (20 Oct 2026, the build brief's money rule): any press that makes a video asks first, under the button, before anything is spent: "This makes a video and uses up to US$5.56 of video credit. Make it?" with "Make it" and "Not now" (the explainer reads "about US$0.08"). It asks once per press, after the script is chosen, not between the script and the video.
- 20 Oct 2026 (phase-1 build): the video prices come from the price table, so they read "Up to US$5.56" (the most an avatar costs plus its voiceover and the AI presenter picture) and "About US$0.08" (six explainer pictures plus the voiceover), not the spec's "Up to US$5.50" and "About US$0.05". "What Remix does" says "a video of an AI presenter saying it" until people-my-face saves a face.
- 20 Oct 2026: a video row's failure after its script is saved keeps "Open the script" beside "Try again"; "Try again" puts that one format back in the sheet so its own press, and its ask-first, run it again.
- Should a video source default to a paid video format instead of "Script to film"? This spec never preselects a paid format.

## New evidence (20 Oct 2026)

The acceptance test for phase 1: [dogfood on activity-tracker.io](../dogfood-activity-tracker.md).

## Related

remix-everywhere, remix-intent, remix-your-brand, remix-variations, formats-gallery, formats-slideshow, formats-wall-of-text, formats-static-ad, formats-talking-head, people-my-face, business-cost-preview
