# Hook plus demo

`formats-hook-demo` | formats | phase 3 | status: partial | /north-star#formats-hook-demo

## Leo asked

19 Oct 2026: "the idea is that one can remix any content format and the ai will regenerate"

He did not name this format; it comes from his Fastlane recording and the competitor research.

## How the best do it

### Fastlane

Three gallery cards open a post with a hook and then show the product:

| Card | Description, verbatim | Price | Requirement |
| --- | --- | --- | --- |
| "Video Hook & Demo" | "Hook clip + app demo stitched together" | "5 credits a post" | "Needs a demo video" |
| "Speaking Hook & Demo" | "Someone says the hook out loud, then your demo" | "52 credits a post" | "Needs a demo video" |
| "Green Screen Mobile with App" | "A presenter holding a phone with your app on screen" | "81 credits a post" | "Needs an app" |

![Fastlane 1:26](../../../public/north-star/fastlane/t086.webp)

The Video Hook preview is a hand holding a phone with a meal-tracking app; the Speaking Hook preview is a woman with her hand on her head and the caption "Wait.. Claude can do WHAT now??"; the app card shows a woman holding up a phone with a chart app. The requirement lines sit under the price with an orange diamond, so the user knows before clicking.

![Fastlane 3:09](../../../public/north-star/fastlane/t189.webp)

The demo comes from Brand > "Demo videos": "A demo video is a short clip of your product in use. Senna opens it with a hook to make video hook posts." with "Upload videos" and the limits "MP4 or MOV", "Max 100MB" and "Max 30s", over the empty state "No demo videos uploaded yet". A campaign plan without a demo says so: "No video hook posts: there is no demo video. Add one on Brand, on the Demo videos tab."

![Fastlane 5:29](../../../public/north-star/fastlane/t329.webp)

Leo did not open these create pages, so their options are unverified. The low price of the plain video hook (5 credits, the same as a slideshow) suggests the hook clip comes from a library and is not generated. Fastlane's pricing lists a human UGC video library of 100 clips on Growth and 2,000+ on Pro ([pricing](https://usefastlane.ai/pricing), [ugc](https://usefastlane.ai/tools/ai-ugc-video-generator)). Its free hook generator takes 5 fields (Product, Audience, Pain, Outcome, Timeframe) and returns "30 hook structures filled with your words" across 11 hook types such as Story, Contrarian and Mistake; in the app each hook can become a hook plus demo video ([hook-generator](https://usefastlane.ai/tools/hook-generator)).

### Others

- Arcads makes several spoken hooks with the same actor and voice, then "Stitch Videos" joins each hook to the main body and "Text Overlay" adds a headline; stitching and overlays cost 0 credits ([hook variations](https://help.arcads.ai/en/articles/17595001-hook-variations), [credits](https://help.arcads.ai/en/articles/13725589-how-are-credits-counted)). Its "Show Your App" preset, an AI actor holding your app, is 200 credits ([arcads](https://www.arcads.ai/)).
- ReelFarm lists a "hook demo" format among its slideshow formats ([reel.farm](https://reel.farm/), [changes](https://reel.farm/changes)).
- OpusClip's "Auto headline" puts a one-line hook on screen at the start of a clip, styled once in the brand template ([auto-headline](https://help.opus.pro/docs/article/auto-headline.md)).
- Icon names "Product Demo" and "App Walkthrough" among its 18 formats ([formats](https://icon.com/formats)).

## What we have today

Checked against origin/main 08537d1, rechecked 2026-10-20.

- Join takes at `/edit?panel=join` (`src/components/JoinTakes.tsx`): several clips, each trimmed, joined in order on the device by `startJoin` in `src/lib/videoMedia.ts`. The frame is the first take's shape, and a take of another shape fits inside it. Stitching a hook to a demo by hand works today.
- The editor puts a hook on screen for its first seconds (`hook`, `hookSeconds` in `EditSettings`, default 3 s, at most 10), with 3 formula hooks (`HOOKS_PER_SET`) and Jev's pick in `src/components/HookOptions.tsx`.
- Named hook formulas: 21 in `HOOK_FORMULAS` (`src/lib/hookFormulas.ts`), with stable ids such as `contrarian`, `number-reveal`, `mistake`, `myth-bust` and `blunt`, each written for Singapore advisers. `hookFormulaSet(n)` gives the n-th set of 3. Edge functions cannot import from `src/lib`, so the browser sends the formulas with the request: `writeHooks` in `src/lib/hookCard.ts` posts `{id, name, template, example, trap}` for 3 formulas to `video-assist` mode `hooks`. `writing-judge` mode `hooks` takes 2 to 5 hooks with the audience, topic and platform and returns Jev's recommended one, about 560 tokens (cap `writing-judge` 60).
- Stock clips: `stock-media` video search (Pexels, cap `stock-search`), and `video-assist` `montage-pick` for Jev's choice of clip (cap `montage-pick`).
- Seedance 2.5 template clips of 4 or 8 seconds through `ai-video` (4 s at 480p is US$0.82), caps `ai-clip` 2 and `ai-clip-global` 8; the template prompt writer already allows short spoken lines under 8 words, and `seedanceRequest` sends `generate_audio: true`. A template field is checked only for length (`MAX_FIELD`, 200 characters), never for words. `finishAvatar` joins only the clips it downloaded, so nothing can follow the clip today.
- There is no saved demo video. `brand-demo-videos` (phase 4) adds that library.

So it is partial: every piece exists separately, but nothing writes the hook, finds or makes the hook clip and joins it to the demo in one go.

## Build

Page `/make/hook-demo`, component `src/components/make/HookDemo.tsx`, job `src/lib/hookDemoJob.ts` (module level). It uses the shared pieces from `formats-slideshow` and the `"wall"` overlay from `formats-wall-of-text`.

### Screens and states

```
Your demo         [ Pick a video ]   MP4 or MOV, up to 100 MB and 30 seconds. Stays on this device.
                  [demo thumb] screen-recording.mp4  0:24   [Change]
What it shows     [ Like how I log every client call in one place ]   (hidden when a source is set)
Hook              ( ) "I logged every call for 30 days. Here's what changed."   Recommended
                  ( ) "Most people track deals. I track calls."
                  ( ) "Stop guessing why your pipeline is empty."
                  [ Write 3 more ]   or type your own
How the hook plays [ Words on a stock clip | I say it | Someone says it ]
------------------------------------------------------------------
About US$0.02 a post        28 left today        [ Make the video ]
```

The hooks are written when a demo is picked and a topic or source is set (one `remix` call), and Jev's pick is preselected. The options keep the faces rule: your own clip comes before the AI person, and the default is words on stock, which shows no face. "Someone says it" shows "About US$0.84 a post" and "2 left today" from `ai-clip`, and limits the hook to 8 words with the line "Keep it to 8 words, so it fits in 4 seconds." "I say it" asks for a 2 to 5 second upright clip from the device; a sideways clip gets "Use an upright clip for the hook, so the video stays vertical.", because `startJoin` takes the whole video's frame from the first take.

When `brand-demo-videos` exists, "Your demo" lists the saved demos first. Until then the picked file is kept in device files for this session.

The gallery card shows the requirement line "Needs a demo video". When the user has none, the page opens with the demo card highlighted and the main button disabled with the reason "Pick your demo first."

Making: "Writing the hooks..." (when not done yet), then either "Finding a clip..." or the Seedance steps ("Writing the shots...", "Making your video, 0 of 1 part ready. This takes a few minutes."), then "Putting it together...". The job lives outside React, and a paid Seedance clip is kept in `cs-ai-video-pending` for "Try again at no cost". At the join the page pushes `/edit` (the hand-off from `formats-wall-of-text`).

Done: the editor opens on the joined video (`/edit?p=<id>`) with the hook on screen over the first clip and captions off, and the toast "Your hook and demo are ready. Export it when it looks right." (`extra.toast`). The project note records the source when there is one.

Failed: a bad demo file shows "Use an MP4 or MOV under 100 MB and 30 seconds." When no stock clip fits, the page says "No stock clip fits this hook. Try another hook or say it yourself." Seedance failures use today's messages and give the use back. A writer failure shows "Couldn't write the hooks. Try again in a minute."

Refused: "That can't be turned into a hook that's safe to post. Try another topic."

Over the daily cap: the server's line for the full cap (`remix-make` or `ai-clip`), and the main button disabled.

Not Leo: `NotFoundPage`.

### Copy

| Where | Words |
| --- | --- |
| Page | Title "Hook plus demo". One line "A hook that stops the scroll, then your demo." |
| Demo | "Your demo", "Pick a video", "MP4 or MOV, up to 100 MB and 30 seconds. Stays on this device.", "Change", "Pick your demo first." |
| Topic | "What it shows", placeholder "Like how I log every client call in one place", at most 200 characters |
| Hook | "Hook", "Recommended", "Write 3 more", placeholder "Or type your own hook" |
| Play | "How the hook plays", "Words on a stock clip", "I say it", "Someone says it", "Keep it to 8 words, so it fits in 4 seconds.", "The person is made by AI.", "Use an upright clip for the hook, so the video stays vertical." |
| Footer | "About US$0.02 a post" or "About US$0.84 a post", "<n> left today", button "Make the video" |
| Steps | "Writing the hooks...", "Finding a clip...", "Putting it together..." |
| Done toast | "Your hook and demo are ready. Export it when it looks right." |
| Demo gone on resume | "Your demo isn't on this device any more. Pick it again." |

### Data

- A new hidden template in `supabase/functions/ai-video/templates.ts`, id `spoken-hook`: one Singaporean person (or the typed look) facing the phone camera at home or in an office, reacting with surprise or certainty, saying the line once, 4 seconds; required field `line` of at most 8 words; `hidden: true` (the flag `formats-text-over-clip` adds). `TemplateField` gains an optional `maxWords`, which `parseVideoRequest` checks with the message "Keep \"What they say\" to 8 words."
- `TemplateAsk` and `Pending` carry `extra` (from `formats-text-over-clip`). `Pending` also gains `after?: {key: string; end: number}[]`: device file takes that `finishAvatar` reads with `getFile` and joins after the downloaded clip. The demo goes there, so a resumed job still joins it. A missing file fails with "Your demo isn't on this device any more. Pick it again." and keeps the paid clip.
- The joined video is an editor project on the device; an export saves the caption to My posts as today. No synced data and no schema change.
- The last "How the hook plays" choice is the device hint `cs-make-hook-play`.

### AI and cost

- Hooks: `remix` mode `make` with `as: "hooks"`, a shape this item adds to `supabase/functions/remix/logic.ts`. Input: a topic or a `RemixSource`, `brandPack(userId)` as remembered, the voice from `voiceForClone`, the demo's file name and length (the only thing we know about the demo), and `formulas`: the 3 from `hookFormulaSet(n)`, sent as `writeHooks` sends them. "Write 3 more" sends set `n + 1`. Output: `{refuse, reason, hooks: [{text, formula}]}`, three hooks of at most 12 words, each with a different formula id from the ones sent, under that function's compliance block. Cap `remix-make`, 1 to 2 US cents.
- Pick: `writing-judge` mode `hooks` (Jev, about 560 tokens) marks one "Recommended"; when Jev returns nothing the first is preselected and nothing is marked.
- Stock hook: a portrait `stock-media` video search with the hook's topic, then `montage-pick` with the hook as the beat. The clip runs 3 seconds with the hook as a `"wall"` overlay from 0 to 3. Cost about US$0.02 in all.
- Spoken hook: `ai-video` mode `template`, `template: "spoken-hook"`, 4 s, 480p: 4 x US$0.2056 = US$0.82 (13.2 Higgsfield credits), plus the shot-prompt OpenAI call that every template request makes. Caps `ai-clip` and `ai-clip-global`, refunded on failure as today. The template's `line` field is the hook, and `templateSystem`'s existing rule ("Spoken lines: few, each under 8 words") already fits it. The hook text also goes on screen for those 4 seconds.
- Join: `startJoin(name, [hook 0 to 3 or 4 s, demo 0 to min(30, length)], label, {extra: {settings: {captions: false, overlays: [hook overlay]}}})`. The hook clip goes first so the frame is vertical; a landscape demo is shown whole inside it.
- Price chip: `clipCredits(4, "480p") * CREDIT_USD` plus the writer's 2 cents for the spoken path, and the writer's 2 cents alone for the other two.

### Deep links

- `/make/hook-demo?play=spoken` or `mine` (default `stock`); replaces history.
- `?source=<kind>:<id>` writes the hooks from a source's opening; `?topic=<words>` fills the topic.
- The demo is a device file and is never put in a link.
- Builder `links.makeFormat("hook-demo", ...)`, a row in `docs/deep-links.md`.

## Done when

- [ ] For Leo, a 20-second screen recording plus one press gives a stock hook of 3 seconds with the hook on screen, then the demo, opened in the editor.
- [ ] "Someone says it" gives a 4-second AI person saying the hook, then the demo, and the page labels the person as AI.
- [ ] "I say it" joins the user's own upright clip first, and refuses a sideways one with its message.
- [ ] Three hooks are offered with Jev's pick marked, and a typed hook works too.
- [ ] A file over 100 MB or 30 seconds, or not MP4 or MOV, is refused with the message before anything runs.
- [ ] A reload during a Seedance hook resumes at no cost and still joins the demo.
- [ ] Over the cap and a failed job each show their message; a failed paid job gives the use back.
- [ ] Checked at 390 px and 1440 px; `npm run build` and the full `npx vitest run` pass; the `src/data/northStar.ts` item is flipped.

## Tests

- `src/lib/hookDemo.test.ts` (pure): `demoIssue(file, seconds)` refuses a wrong type, over 100 MB and over 30 s; `hookClipIssue(w, h, seconds)` refuses a sideways clip and one outside 2 to 5 s; `joinPlan(hookKind, hookSeconds, demoSeconds)` returns the takes in order, the demo cut at 30 s and the overlay from 0 to the hook's end.
- `supabase/functions/ai-video/templates.test.ts`: `spoken-hook` is hidden, requires `line`, refuses a line over 8 words, and names no brand.
- `supabase/functions/remix/logic.test.ts`, `as: "hooks"`: three hooks, each at most 12 words with a distinct formula id from the `formulas` sent, a request without 3 formulas refused, MAS lines in the prompt, `refuse` passed through.
- `src/lib/hookDemoJob.test.ts`, with `callFn`, `searchStock` and `startJoin` mocked: stock path passes one `"wall"` overlay and the demo second; when Jev returns nothing it takes the first accepted clip; the spoken path stores the demo in `Pending.after`.
- `src/lib/aiVideo.test.ts` (or the closest existing test): `finishAvatar` appends the `after` takes in order, and a `Pending` saved without `after` still resumes.

## Open questions

- Fastlane's cheap hook clips come from a library of real people's UGC clips. Licensing such a library is a new vendor, so Leo decides; until then the hook is stock, AI or the user's own.
- "A presenter holding a phone with your app" is left out of this build. Seedance draws screen text badly ("Labels and logos come out garbled"), and Fastlane's own shot plan for a talking head says "Any screen, sign or page faces away from the camera, with no readable words" (notes-4 2.3). It would need a made presenter holding a blank phone and the demo laid into the screen on the device. Leo decides whether it is worth building.
- An adviser's demo could be a screen recording of an insurer's illustration that names products. The default is the usual compliance warning on the caption only, since we cannot read the video's screen; Leo decides whether demos need review.

## Related

brand-demo-videos, formats-hooks-scripts, formats-green-screen, formats-wall-of-text, formats-talking-head, remix-variations, edit-video, formats-gallery
