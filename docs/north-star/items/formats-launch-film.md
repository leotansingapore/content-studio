# Launch film from your brand and app

`formats-launch-film` | formats | phase 7 | status: missing | /north-star#formats-launch-film

## Status

Missing. Leo picked this on 24 Oct 2026, with huashu-motion (github.com/alchaincyf/huashu-motion, MIT, v0.3.1) as the reference: on his sign-ins, a commercial-grade product launch film of 15 to 60 s, drawn in code from the brand's colours, logo, fonts and Media screens, with music and sound on the beats, edited by clicking a frame and typing, rendered and exported in the browser, with no paid video model.

Nothing in Content Studio makes a film like this today. The export pipeline, the brand kit, Media, the voiceover and the sound cues it needs all exist (below). Checked against origin/main 6c7cbbbf on 24 Oct 2026.

## What huashu-motion and the others do

### huashu-motion

Its README promises "Commercial-grade product launch films, in one go." A coding agent (Claude Code, Codex and others, as an Agent Skill) writes the film; the user watches it in a local studio and points at frames.

How a film is made (`skills/huashu-motion/SKILL.md`):

1. Read the product first. `om grab <folder|url>` pulls real screenshots, the logo, images, and the colours and typefaces the site really uses into `materials/`. "The logo on screen is the real file, never redrawn"; interfaces that must move are rebuilt in code, traced over a capture; "Never grey placeholder boxes or an invented UI."
2. One message with defaults the user can correct line by line: where it plays and how long (30 s 16:9 for X, 15 s 9:16 for Douyin, a looping README GIF), the energy, and narration (default none).
3. Three directions "that differ in motion language or material, not just colour", each one real key frame plus a short card. Exactly one is a depth direction (the interface in space). Music is not one of the choices: "users can't judge it from a card."
4. A `treatment.md` with the rhythm sheet before any build, then "Build the hardest shot first."
5. Self-review: `om check`, `om still`, `om qa`, and "write the three notes a demanding director would give, then fix them."
6. Sound, then the studio loop, then `om render`, then `om learn harvest` keeps what the film taught.

The film is one `index.html` (GSAP, Canvas, Three.js, SVG), and "every frame is a function of the code and the time" (README). SKILL.md adds: no `Date.now()`, no unseeded random, no network. In `references/contract.md`, editable values are composition variables, anything pointable has a `data-om-id`, and scenes are timeline labels `scene:<id>`.

The method, as numbers:

- 20 motion languages in `references/library/README.md`, from cursor-demo, card-montage and kinetic-type to data-story and 3d-object, each with what it says and the template to start from; the director picks one from a grid of eight message shapes against four personalities.
- Rules measured "from 21 real launch films (cuts, beats, loudness, energy curves) and 142 high-engagement launch and motion films" (README; the numbers below are from `references/rhythm.md`): a hook within 3 s (14 of 21 films); 15 of 21 launch films cut ten or more times a minute; the densest five seconds sit at about 37 % of the length, 5 to 8 cuts about one per beat; "no stretch longer than about two bars without something new"; tempo 100 to 125 BPM by default (the cool films measured 89 to 130, median 105; `director.md` gives 77 to 130 for the same median); a hit on every landing that matters, "roughly 8-15 per 30 s"; a hold of 1.5 s or more on the mark.
- Product fit from 48 launch videos on X in Oct 2026 (`references/library/product-fit.md`): "A film for a product that generates media (video, voice, UI) is best when the film is itself the demo"; top films often end on the mark with no URL. That sample cuts far less than the 21 above: median 0 hard cuts, 34 of 48 at 3 or fewer, "One object or one UI carries the film."
- 12 starter templates, 27 OFL fonts, 23 sound effects (`cli/lib/sound.js`: pop, tick, click, whoosh, whip, thud, impact, paper, stamp, ding, chime and more).

Music (`references/sound.md`, `cli/lib/composer.js`, `cli/lib/score.js`): either a built-in direction (12 product types, 3 styles each, 13 styles such as pulse, lofi, funk, cinematic, piano, synthwave) or composer mode, where the agent writes an ABC-notation score whose `!mark:name!` lines land on the `scene:name` labels, with `!hit!`, `!rise(!`, `!stop(!` and `!stutter(!` for the drop, risers, tape stops and beat repeats. `cli/lib/dsp.js` says it plainly: "every function is deterministic given its rng, so the same source always gives the same file." Everything is synthesized in plain JS; an optional pack of about 55 MB of CC0 and CC-BY samples adds a real piano, strings and drum kits, and without it `score.js` falls back to synth voices. Alone, music sits at -18 LUFS and the master is normalized to -14 LUFS, limited at -1.5 dB. Under a voice the bed sits about 12 LU below the voice and the master is not normalized; the music ducks 10 dB while words are spoken, and the band around 2.2 kHz is carved a further 5 dB (`sound.js` `duck`, lines 206 to 222, and the levels, lines 442 to 452).

Point to edit (`cli/lib/inbox.js`, `studio/studio.js`): press C, click the frame, type. The comment stores `t`, `x`, `y` in composition pixels, `target` (the smallest visible `data-om-id` under the pointer), the scene, an excerpt of the element and the current variables, appended to `.om/inbox.jsonl`. The agent runs `om inbox --wait`, `om look <id>` (the frame plus a close-up of the spot), edits only that place, and replies with `om done <id> --note "..."` in one line; "not quite" sends it back with the thread. Every version lands in `.om/history/`, so `om undo` always works. For another frame size, `om fork` (`cli/lib/fork.js`) copies the project and drops the re-layout into the agent's inbox as its next job, because "A new aspect ratio is a new layout, not a crop."

Render (`cli/lib/render-om.js`): local Chrome seeks each frame and streams it into FFmpeg, up to 8 browsers at once; "A 30-second film renders in about 12-15 s on my 14-core Mac." It needs Node 22, Chrome and FFmpeg and was "Tested on macOS only so far."

A JSON route already inside it: the clip runtime (`runtime/clip/clip.js`, MIT, from huashu-art-motion) draws "one parameterized explainer animation (a JSON spec) drawn on a canvas", read from `<script type="application/json" id="clip-spec">{"grammar", "duration", "data", "cues"}`, with 8 grammars such as `t2_keynote_ui` (glass cards, a screenshot with a highlight box, a big number counting up) and `y5_kinetic_type`. `t2_keynote_ui` puts the words left and a phone screenshot right in a wide frame; in a tall one the title shrinks to a header and the cards fill the height below it (its header comment, in Chinese). Its card icons are 9 line drawings in the grammar file (clock, phone, layers, chart, code, check, play, bolt, lock) plus `UI.icon` in `runtime/clip/lib/ui.js` (wave, memory, agent).

Proof it does not need an expensive model: a 22 s film made with Claude Code on DeepSeek V4.1 Flash took three rounds of notes, under half an hour and CNY 1.95.

Its own limits: "It can't hear", "It doesn't generate people or live footage", "Results depend on the model."

Licence: code and docs MIT, "Copyright (c) 2026 Huashu" (root `LICENSE`). `runtime/clip/` has its own `LICENSE`, MIT under the alchaincyf copyright line, and a `NOTICE.md` naming its source, huashu-art-motion `scripts/engine/` at commit 57d6760; `motion.js` and `ui.js` sit there. GSAP 3.14.2 ships under the GSAP Standard License, whose Prohibited Uses are "any implementation and/or use of GSAP Products in tools that allow users to build visual animations without code that encourages, induces, or materially assists in creating a solution that competes with Webflow's visual animation building capabilities" (`templates/blank/vendor/GSAP-LICENSE.html`). The "bean Huashu" character in `runtime/clip/lib/toon.js`, with "its appearance in the storytime template and demo films", "is not licensed for other uses" (`THIRD_PARTY.md`). Two grammars call `toon.js`: `y1_kurzgesagt` uses `TOON.flat`, `glow`, `circle` and `vgrad`, and `y4_storytime` draws the character (`TOON.bean`). Films carry a "Made with huashu-motion" corner for their last 1.2 s; MIT asks only for the notice in copied code, not on our output.

### Others

- Claude Motion, Anthropic, beta since 8 Oct 2026 on Team and Enterprise only ([launch](https://claude.com/resources/articles/dashboards-and-motion), [help](https://support.claude.com/en/articles/17454997-get-started-with-claude-motion)). Start from Output > Motion or `/motion`. "Claude writes code that animates your text, charts, shapes, and images, so you can change any word, number, or timing. It doesn't use a video generation model, so there's no generated footage and no AI-generated people." Edit by asking ("Slow down the second scene", "Change the Q3 number to 18%") or "Adjust the animation yourself in the editor"; Export > MP4; open it in Adobe, Descript, HeyGen, Higgsfield, invideo, Luma AI or Runway. No separate price: it "counts toward your plan's usage limits", and no maximum length or resolution is published ([layer3labs guide](https://www.layer3labs.io/guides/claude-motion)).
- HyperFrames, HeyGen, Apache-2.0, 71.2k stars ([github](https://github.com/heygen-com/hyperframes)). HTML plus a seekable animation runtime ("GSAP, CSS, Lottie, Three.js, Anime.js, WAAPI, or your own frame adapter"); "The renderer seeks each frame in headless Chrome and encodes the result with FFmpeg, so the same input produces the same video." About 450 registry blocks, a Studio, AWS Lambda rendering. Leo already uses its `hyperframes` skill.
- Jitter, a browser motion design tool ([pricing](https://jitter.video/pricing/), [Superagents](https://jitter.video/changelog/2026-07-09-ai-agents/)). Free exports 720p 30 fps; Pro 1080p 60 fps (about US$19 per editor a month by third-party sites, unverified, the page prints no figure); the next tier adds Brand Kits and 4K 120 fps. Its Superagents turn "one asset into a full campaign with a variety of sizes, formats, and localized versions", then "batch export everything in one click", and "Everything you create with agents stays fully editable."
- Canva Magic Animate ([page](https://www.canva.com/pro/animator/)) is part of Canva Pro. One press animates a whole design: it "chooses motion that matches your content, font choices, images, and colors."
- Fastlane shows no launch film and no motion graphics format among the 40 of its 42 gallery formats Leo's recording names (`docs/north-star/videos/fastlane-2026-10-19/notes-1.md` lines 430 to 453, `notes-3.md` from line 215). The nearest is "Video Hook & Demo", "Hook clip + app demo stitched together", 5 credits, "Needs a demo video". Its generated video formats cost 52 to 210 credits, about US$2 to US$8.40 at the Starter rate.

### What changes what we build

- huashu and HyperFrames both render in headless Chrome with FFmpeg. We have neither on the server, so we take huashu's method (directions, rhythm sheet, score on the beat grid, point to edit) and its MIT synth, and draw with our own renderer.
- Claude Motion sets the bar for edits: change one word, number or timing and nothing else moves. That is a patch to one scene, plus a Fields tab that needs no model.
- Jitter makes many sizes from one design. Our spec is laid out by rules, so 9:16, 1:1 and 16:9 come from one spec at no cost, where huashu's fork needs the agent to re-lay it out.

## What we have today

- Browser export faster than real time, `src/lib/fastExport.ts` (`exportFast`): every output frame is drawn on a 2D canvas (`drawFrame`, `drawIntroCard`, `drawEndCard` from `src/lib/videoMedia.ts`), wrapped in a `VideoFrame`, encoded to H.264 by `VideoEncoder` (`pickEncoder` tries high, main, then baseline profile at 30 fps), the sound rendered offline and encoded to AAC 48 kHz (`encoderDelay` lines it up), and muxed by `mp4-muxer` (pinned 5.2.2 in `package.json`) as `new Muxer({ target: fileSink().target, ... })`, a `StreamTarget` gathered into blobs. Frame `i` is drawn at `i / 30` and stamped `i / 30` s, so the loop never reads a clock. `FrameReader` decodes video files frame by frame with `VideoDecoder` over `src/lib/mp4Demux.ts`. When WebCodecs is missing it returns null and the export records in real time. `pickEncoder` and `encoderDelay` are not exported yet.
- Real-time recorders in `videoMedia.ts`: `startJoin` and `startSlides` draw on a canvas, record `canvas.captureStream(30)` plus the sound with `MediaRecorder` (avc3 MP4 where supported) and hand the file to the editor through the join job. The wall of text (`src/lib/wallJob.ts`) and the narrated video (`src/lib/explainer.ts`, `makeExplainer` in `src/lib/aiVideo.ts`) end there; slideshows are drawn by `src/lib/slideshowDraw.ts`.
- Several sizes in one run: `src/lib/exportVersions.ts`; aspects `9:16`, `4:5`, `1:1`, `16:9` (`Aspect` in `src/lib/videoEdit.ts`). Where the apps cover a 9:16 video: `APP_COVER` in `videoEdit.ts` (Instagram 210 px top, 310 px bottom, 84 px right; TikTok 108, 320 and 120, at 1080x1920). The carousel's `SAFE_9X16 = 250` (`src/lib/carouselDesigns.ts`) is for slides and is smaller than both bottom bands.
- Brand: `CarouselBrand` (`src/lib/carousel.ts`) has `color`, `palette` (up to 3 more named colours, Leo's sign-ins), `logo` (PNG or WebP data URL), `photo`, `name`, `handle`, `role`. The brand font is one WOFF2, TTF or OTF per brand on Leo's sign-ins, registered as "BrandFont" (`src/lib/brandFont.ts`, `leoBrandFont`). `loadBrandArt` (`videoMedia.ts`) makes the canvas-ready `BrandArt` (logo, photo, name, colour, font); it carries no palette, so the film reads `palette` from the brand itself. Caption fonts load from Google Fonts: Archivo Black, DM Sans, Fraunces (`ensureCaptionFonts`). `readableOn` (`src/lib/carouselLayout.ts`) picks readable text on a colour.
- Media: `src/lib/mediaLibrary.ts`. The files sit in IndexedDB (`deviceFiles.ts`) under `cimg-` keys (videos under `cvid-` with a still under the `cimg-` key of the same id), and the index is device-only localStorage, `cs-media-${scoped(userId)}`; nothing syncs. Types `person`, `logo`, `product`, `past-post`, `screen`, `footage`, `other` (`supabase/functions/media-sort/logic.ts`), alt text from the sort. Demo videos (`src/lib/demoVideos.ts`, `demoVideos()`) are Media videos of type `screen` with a `demo` window of 3 to 30 s, a `shows` line and flags `named-product`, `returns`, `personal`; only demo videos carry flags, screen photos do not. Products: `src/lib/products.ts` (ids `pd-...`).
- Words and voice: `brandPack` (`src/lib/remixBrand.ts`), `memoryLine(userId, "videos")` (`src/lib/voiceMemory.ts`). `text-voice` reads text with 7 premade ElevenLabs voices (cap `ai-voice`, about US$0.02); its `dub` mode already calls ElevenLabs `with-timestamps` and turns the alignment into per-line spans (`lineSpans`), but only for Chinese, Malay or Tamil. Eleven Music is wired and hidden (`AI_MUSIC = false`, `src/lib/aiMusic.ts`).
- Sound cues: `playCue` whoosh and pop, `sfxCues` (`src/lib/videoMotion.ts`). Count-up number cards and bar charts: `videoMotion.ts`, `src/lib/videoCharts.ts`.
- Formats gallery: `FormatDef` in `src/data/formats.ts` (`slug`, `name`, `blurb`, `kind`, `group`, `cap`, `price()`, `needs`, lazy `Component`, `ready`), route `/make/:format`, builder `links.makeFormat`. Both `/make` (`MakePage.tsx`) and `/make/:format` (`MakeFormatPage.tsx`) already check `useLeoUser()` and show `NotFoundPage` to anyone else; the gallery lists only entries with `ready: true`, and a page that is not ready still opens for Leo. Campaigns: `CampaignFormat` includes `"ai-video"`, priced `AI_VIDEO` (a 15 s Speak clip plus voice, about US$2.77), with a `made` field (`src/lib/campaigns.ts`).
- Server conventions: Leo-only modes on `video-assist` (`own-words`, `thread`, `keywords`) check `isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)` (from `supabase/functions/market/logic.ts`) and answer 403 `not_enabled` before any count. The use goes back (`refundUsage`) only when OpenAI never answered; an answer that can't be used keeps it (remix, idea-dump). Today's `video-assist` modes call `VIBE_MODEL`, gpt-4.1, through `openaiFetch` with `json_object`. `OPENAI_MODEL` (default `gpt-6-luna`, US$0.10 in and US$0.50 out per million tokens, `_shared/prices.ts`) is reached through `openaiChat` in `_shared/openaiChat.ts`, which media-sort and brand-dna call with a strict `json_schema`. Jev pinned `jev-1.13.0` (`_shared/jev.ts`); `MAS_QUESTION` and `MAS_WARN` (`_shared/mas.ts`), `scanCompliance` (`_shared/compliance.ts`).
- Caps and prices: `DAILY_LIMITS` in `_shared/usageCaps.ts`; `PRICES` in `_shared/prices.ts`, read by the browser through `src/lib/prices.ts`; `priceText` shows any price under a cent as "Under US$0.01". Every cap needs a label in `AI_USE_LABELS` (`src/lib/activity.ts`; `activity.test.ts` checks every key). `PriceChip` (`src/components/PriceChip.tsx`) takes `feature`, `left` and `uses`.
- No animation library is installed (no GSAP, Motion, anime.js or Lottie in `package.json`; `tailwindcss-animate` is CSS only), the app runs no Web Worker yet, and `vercel.json` sets no Content-Security-Policy.

So: the pipe out (canvas frames to MP4) and the inputs exist. The scene renderer, the music engine, directions and point to edit do not.

## What to build

### Two decisions first

The film is a JSON scene spec that our own renderer draws, not JavaScript the model writes.

| | Model writes JS (huashu's way) | Model writes a JSON spec (recommended) |
| --- | --- | --- |
| Security | Arbitrary code from a model steered by Media alt text, notes and source posts. It needs a `sandbox="allow-scripts"` iframe without `allow-same-origin` and a meta CSP of `default-src 'none'` in its `srcdoc`, because the app has no CSP header. An endless loop can still hang the tab, since a sandboxed frame may share the page's process. The memory note on untrusted text records two XSS holes shipped in Catalyst's Opus app on 15 Oct, from model output parsed as HTML and a URL param put into an iframe. | Data checked by one parser (`parseFilm`): known kinds, ids, lengths, colours from the kit, Media keys from the brand's own list, no URLs anywhere. Text is drawn with `fillText` and shown in React as text nodes, never parsed as HTML. |
| Determinism | Model code can call `Date.now()`, `Math.random()`, CSS transitions or `requestAnimationFrame`, and the browser cannot paint DOM into a canvas for export, so the model would have to draw on canvas only and keep huashu's contract by itself. | `drawFilm(g, film, assets, t)` is ours and a pure function of `t` with a seeded random, so preview and export draw the same frame and export steps frames exactly as `exportFast` does. |
| Cost | A huashu film is a whole HTML file; every note rewrites code. | A 30 s spec is about 4,000 to 6,000 tokens; a note patches one scene, about 800 tokens out. |
| Range | Anything a browser draws, including Three.js. | Only the scene kinds we draw. We grow the set one kind at a time. |

Animation: Canvas 2D that we draw ourselves, with no library. Motion and anime.js (both MIT) drive DOM and CSS on their own clock, and the Web Animations API animates DOM; none of them puts pixels on the canvas we encode, and export never sees the DOM. What we need from them is the easing math: port `runtime/clip/lib/motion.js` (103 lines, MIT under `runtime/clip/LICENSE`; eases, beziers, springs, steps and stagger, each a pure function from time to a value, with `clamp` and `lerp` from `util.js` inlined) and `OM.spring`, `OM.springValue` and `OM.random` from `runtime/om.js` (about 40 lines, root MIT). The card icons come from the same folder: the 9 drawings in `grammars/t2_keynote_ui.js` and `UI.icon` in `lib/ui.js`. This adds no npm dependency, which would be a hard stop.

### Screens and states

Page `/make/launch-film`, a new `FormatDef`: slug `launch-film`, name "Launch film", the gallery blurb below, kind `video`, group 1, cap `launch-film`, `price: () => priceOf("launch-film")`, no `needs`, `Component: lazy(() => import("@/components/make/LaunchFilm"))`, `ready: false` until this item ships. Jobs live in `src/lib/film/filmJob.ts` (module level, like `wallJob.ts`, so leaving the page keeps a write, the sound or an export going). The gate is the one `MakeFormatPage` already has: `useLeoUser()`, else `NotFoundPage`; the gallery is Leo-only as well and lists the card once `ready` is true.

Setup, one screen, defaults filled in:

```
Launch film
A 15 to 60 second film of your product, made from your brand kit and app screens.

What are you launching   [ Activity Tracker's AI coach        v ]  (products, or type one line)
What should people remember  [ Your week, planned in one tap ]
App screens              [scr][scr][scr][scr] [+ Add from Media]   Pick up to 8.
Length                   ( 15 s ) (*30 s*) ( 60 s )
Shape                    (*Vertical 9:16*) ( Square 1:1 ) ( Wide 16:9 )
Energy                   (*Fast cuts*) ( One continuous take ) ( Quiet )
Voice                    (*Music only*) ( AI voice reads it )
-----------------------------------------------------------------
Under US$0.01 | 9 left after this           [ Show me 3 directions ]
```

App screens lists the brand's Media items of type `screen`: photos first, the newest 4 preselected, then demo videos from `demoVideos()`, each shown and drawn from the middle frame of its window. With no screens the row says "No app screens yet. The film will use words and your logo." with the link "Add screens in Media" (`/media?type=screen`). A demo video flagged `personal`, `named-product` or `returns` shows its flag chip and "Check this screen before posting." (screen photos carry no flags).

Directions:

```
Pick a direction
[ key frame ]          [ key frame ]          [ key frame ]
Demo                   Claim                  Cards
Your app does it,      Three words slam in,   Each feature lands
tap by tap.            then the app.          as a card, then the proof.
Recommended
                       [ Make this one ]        Show 3 more
```

Each key frame is the direction's hero scene drawn on the device at its key time, so the three cost one writer call. At 390 px they stack; a tap picks, the main button makes it.

The film (the studio):

```
[ player canvas, the film's shape, scaled to fit ]
0:07 / 0:30   [Play]   [ Point to change  C ]   [Undo]
|hook|  app  |features|proof|burst | end |      scene strip, the playhead on it
Notes | Fields
  1  "Make the second card's title shorter"     Changed: "Card 2 now reads Plan your week."   [Not quite]
                                                         [ Export ]
```

Point to change: the button or the C key pauses the film and turns the pointer into a crosshair. A tap resolves to the smallest drawn element under it, with 12 px of slack at 390 px, outlined with its label ("Card 2 title, Features, 0:11"). A note box opens beside it (a bottom sheet at 390 px) with "What should change here?". Send shows a numbered pin and "Changing..." within 400 ms and disables Send; the patch lands, the player redraws at the same time, and the note gets its one-line reply. Undo steps back one version; "Not quite" reopens the note with the thread. A tap on empty frame sends a note about the whole film.

Fields edits without the model and costs nothing: every text, number and label in the spec, the accent and ground roles (kit colours only), each scene's hold in beats, the music (the three styles of the film's product type), and voice on or off. A double tap on a word in the player edits it in place.

Export sheet: "Vertical 9:16", "Square 1:1", "Wide 16:9", "All three", default the film's shape. Progress "Exporting, 40%...", Stop. Done: "Your film is ready." with "Download", "Open in editor" (hands the MP4 to `/edit` through `handToEditor(file, extra, label)` in `videoMedia.ts`, as `startSlides` ends, where captions, Post it for me and My posts already work) and "Make another shape".

States:

- Writing: "Writing 3 directions..." then "Writing your film..." then "Making the music..."; each a step line with the time so far.
- Check notes: when the code check (below) still finds a problem after the server's retry, the film opens and a quiet line lists it ("Nothing happens from 0:12 to 0:16.") with "Fix it" (one `film-edit` use).
- Failed write: "Couldn't write the film. Try again in a minute." Shown when OpenAI never answered; the use goes back.
- Unusable write: "That film didn't come out right. Try again." Shown when the answer still fails `parseFilm` after the server's retry; the use is kept, since OpenAI billed it.
- Failed edit: "Couldn't change only that spot. Try saying it another way." The film is unchanged; the use goes back only when OpenAI never answered.
- Refused: "That can't be made into a film that's safe to post. Try other words."
- Compliance: a flag from `scanCompliance` or `MAS_QUESTION` at `MAS_WARN` shows the warn chip "Check the words before posting." and blocks nothing.
- Screen gone: a Media file not on this device draws as a plain card in the brand colour with "This screen is on another device. Pick it again or swap it."
- Over the cap: the server's line, and the button disabled.
- Export on a browser without WebCodecs: "This browser exports in real time, so a 30 second film takes 30 seconds."

### Copy

| Where | Words |
| --- | --- |
| Gallery card | "Launch film", "A film of your product, made from your brand and app screens." |
| Page | "Launch film", "A 15 to 60 second film of your product, made from your brand kit and app screens." |
| Setup | "What are you launching", placeholder "Like: Activity Tracker's AI coach"; "What should people remember", placeholder "Like: your week, planned in one tap"; "App screens", "Add from Media", "Pick up to 8."; "Length", "15 s", "30 s", "60 s"; "Shape", "Vertical 9:16", "Square 1:1", "Wide 16:9"; "Energy", "Fast cuts", "One continuous take", "Quiet"; "Voice", "Music only", "AI voice reads it" |
| Setup buttons | "Show me 3 directions", "No app screens yet. The film will use words and your logo.", "Add screens in Media", "Check this screen before posting." |
| Directions | "Pick a direction", "Recommended", "Make this one", "Show 3 more" |
| Studio | "Play", "Pause", "Point to change", "What should change here?", "Send", "Changing...", "Changed", "Not quite", "Undo", "Notes", "Fields", "Export" |
| Export | "Export", "All three", "Exporting, <n>%...", "Stop", "Your film is ready.", "Download", "Open in editor", "Make another shape" |
| Steps | "Writing 3 directions...", "Writing your film...", "Making the music..." |
| Errors | as listed under States, including "That film didn't come out right. Try again." |

### Data

- The spec, `supabase/functions/video-assist/filmSpec.ts`: types plus `parseFilm(raw, ctx)`, with no Deno or npm imports so the browser imports the same file (as `mediaLibrary.ts` imports `media-sort/logic.ts`). Shape:

```
{ v: 1, kind: "launch", product: "devtool", energy: "fast", bpm: 120,
  style: 0,                       // the product type's music style, 0 to 2 (huashu's variant)
  font: "brand" | "archivo" | "dm-sans" | "fraunces",
  ground: "ink" | "brand" | "paper", accent: "brand" | "palette:<name>",
  drop: "<scene id>",             // the music's drop and the hero moment
  scenes: [
    { id: "hook", kind: "type", beats: 8, cut: "hard", words: ["Your week.", "Planned.", "In one tap."], key: 2 },
    { id: "app", kind: "screen", beats: 16, cut: "flood", media: "cimg-...", frame: "phone",
      camera: [{ beat: 0, to: "whole" }, { beat: 4, to: [0.1, 0.55, 0.8, 0.2] }],
      tap: [{ beat: 3, at: [0.5, 0.62] }], highlight: { beat: 5, box: [0.1, 0.55, 0.8, 0.2], label: "AI coach" } },
    { id: "features", kind: "cards", beats: 12, cards: [{ icon: "clock", title: "Plan your week", line: "..." }] },
    { id: "proof", kind: "number", beats: 6, value: 12, suffix: " hrs", label: "saved a month" },
    { id: "burst", kind: "montage", beats: 8, anchor: "word", shots: [{ media: "cimg-...", word: "Calls" }] },
    { id: "end", kind: "logo", beats: 10, line: "Your week, planned.", cta: "activitytracker.io" }
  ],                              // 60 beats at 120 bpm: 30 s
  voice: { on: false, lines: { "hook": "..." } } }
```

  Scene kinds and the huashu language each stands for: `type` (kinetic-type: one word or line per beat, the key word slams), `screen` (cursor-demo: a Media screen in a phone or browser frame, camera push to a box, taps, a highlight with a label), `cards` (card-montage, up to 3 cards that spring in with an icon from `t2_keynote_ui`'s set), `number` (data-story: a count-up figure and label, only as typed by the user or written from the brand's own facts in `memoryLine`, never invented), `montage` (a burst of 4 to 8 shots, one per beat, one element locked in place while the rest changes), `logo` (the real logo file or the brand name in the brand font, a line, an optional CTA drawn as plain text). Cuts: `hard`, `flood` (a brand colour wipe), `carry` (the phone frame stays and its screen changes), `whip`.

  `parseFilm` clamps beats so the total lands on the chosen length within one bar, keeps ids unique, caps words (a `type` line at 6 words, a card title at 5, a card line at 12), drops a Media key not in `ctx.media` (the keys the browser sent; Media is device-only, so the server knows only that list), refuses any URL-like string except the `cta` text, and maps colours to kit roles only. The model never writes coordinates in pixels: boxes are 0 to 1 shares of the screen picture, which is how one spec lays out in three shapes.
- Element ids for pointing are derived, not written: `<scene>.<part>` such as `hook.word2`, `app.screen`, `app.highlight`, `features.card2.title`, `end.logo`. The renderer records a box for each one it draws on each frame (as `CLIP.mark` does).
- Synced, per brand: `content-studio-films-${scoped(userId)}`, up to 20 films, newest first, in one array so a delete rewrites it (cloudSync has no tombstones): `{id ("fm-" plus base 36), name, createdAt, updatedAt, setup, directions, spec, notes: [{id, t, x, y, target, scene, text, reply, status, at}], exports: [{shape, at}]}`, with a size cap and a limit line the way `campaigns.ts` has them. Media files never leave the device that holds them, which is why another device shows the screen-gone card.
- Device only: `cs-film-history-<filmId>` keeps the last 30 specs for Undo, and `cs-make-film-setup` the last picks.
- Nothing here needs a table or a schema change.

### Render pipeline

`src/lib/film/`:

- `timeline.ts`, pure: beat length from `bpm` (fast 120, continuous 108, quiet 92, set in code), scene starts on the beat grid, `sceneAt(t)`, every event's time (word landings, cuts, camera starts and stops, taps, card lands, the count-up end, montage cuts), and `rhythmIssues(film)` written from huashu's rules: something visible at frame 0, the first event within 3 s, no gap over 2 bars without an event, for Fast cuts a burst of 4 or more events a bar between 30 % and 60 % of the length, the drop on a bar line, and the logo held 1.5 s or more.
- `layout.ts`, pure: each kind's boxes for a frame size. Tall frames stack words over the phone; square frames shrink the phone to 62 % of the height; wide frames put words left and the phone right, as `t2_keynote_ui` does. Words are sized to fit their box and, at 9:16, kept clear of `APP_COVER` (`videoEdit.ts`): the larger of Instagram's and TikTok's top, bottom and right bands.
- `draw.ts`: `drawFilm(g, film, assets, t, {w, h})` returns the marks it drew. Canvas 2D only, synchronous, the eases from the motion port, `readableOn` for text colour, the brand font through `FontFace` as `brandFont.ts` registers it, after `ensureCaptionFonts()`. A `screen` that is a demo video is drawn from a picture in `assets`: export fetches it first with `await reader.at(t)` from a `FrameReader`, the way `exportFast` does for b-roll; preview draws from a playing `<video>` element.
- `sound.worker.ts`: the huashu synth ported into a module worker (`new Worker(new URL("./sound.worker.ts", import.meta.url), { type: "module" })`, which Vite builds with no plugin): `dsp.js`, `fx.js`, `score.js`, and from `sound.js` the `SFX` table, `duck` and the level steps, leaving its `node:fs`, Chrome and capture imports behind. `samples.js` (which reads `node:fs`) is replaced by a stub that has no pack, so `score.js` takes its synth fallbacks. `composer.js` and `composed.js` are composer mode and wait for it (Music, below). The worker builds the built-in direction with `plan()` from `score.js` on the film's own scene list (`scene:` labels at scene starts, and `product`, `variant`, `bpm`, `drop` and `ending` as `OM.music` takes them, `references/sound.md`), places effects by event kind (whoosh on a camera move, thud on a card, pop on a word, tick on a tap, impact and subdrop on the drop, chime on the logo, a hit on each montage cut), and levels as huashu does: music at -18 LUFS alone, or 12 LU under the voice and ducked under its line spans. It returns music plus effects as a stereo Float32 buffer at 48 kHz, cached by a hash of the timing, music and voice-span fields, so a text edit does not re-render the sound. The export mixes in the voice and evens the whole mix to -14 LUFS with peaks under -1 dB (`integratedLoudness`, `truePeak`, `PEAK_CEILING` in `videoEdit.ts`).
- Preview: the same `drawFilm` on a visible canvas at the screen's size, clocked by an `AudioContext` playing the rendered buffer and the voice; seeking draws at `t`.
- `exportFilm.ts`: the `exportFast` loop without the edit plan. Export `pickEncoder` and `encoderDelay` from `fastExport.ts`, then for frame `i` draw at `i / 30` at 1080x1920, 1080x1080 or 1920x1080, encode H.264 at the Instagram target's 8 Mbps (`EXPORT_TARGETS.reels`), encode the evened mix to AAC 48 kHz stereo behind `encoderDelay`'s lead-in, and mux with `Muxer` on `fileSink().target` with the options `exportFast` passes. "All three" runs the shapes one after another. Without WebCodecs it records in real time with `captureStream(30)` and `MediaRecorder`, as `startSlides` does.
- Targets to measure on the first build (unverified): the sound for 30 s renders in under 10 s in the worker on Leo's Mac, and a 30 s 9:16 export finishes in under 60 s.

### Music

V1 plays huashu's built-in directions, not a model-written score: they are free, deterministic and land on our beat grid by construction. Jev picks the product type from the 12 (`devtool`, `ai`, `hardware`, `consumer`, `cute`, `creative`, `game`, `data`, `explainer`, `calm`, `guofeng`, `hype`, each with its `about` line as the criteria); the three directions take that type's three styles in order (huashu's `variant` 0 to 2), so changing direction also changes the music, and Fields can swap it. This departs from huashu, which picks the music after the direction from the product's character and keeps it off the cards (`references/music.md`); the cards here still show no music. Fallback when Jev returns null: `devtool`, one fixed value, since telling a software brand from an adviser brand would itself be a decision. Composer mode (the model writes ABC with `!mark:` lines) is the step after Leo has heard v1; it needs a prompt change and `composer.js` plus `composed.js` ported into the same worker.

### Point to edit

`video-assist` mode `film-edit` (cap `film-edit`) takes `{film, scene, target, label, t, x, y, note, thread}`: the scene's JSON, the other scenes' ids and beats, the target id and its label, the time inside the scene, the click as shares of the frame, the note, earlier notes and replies on that spot, the kit's colour roles and the brand's Media list (keys and alt text) so it can swap a screen. It returns `{scene, reply}`, or `{film, reply}` for a note on the whole film, or `{refuse, reason}`. The rules in its prompt are huashu's: do what the note asks at that place and time and keep everything else; a timing note changes this scene's beats and later scenes move with it; when the note is ambiguous, pick the most sensible reading, do it, and say which reading in the one-line reply. The server merges the patch, runs `parseFilm` on the merged film and rejects a scene patch that changes another scene's id, kind or position with 422 `unusable` (the use is kept, as OpenAI billed it); the browser runs the same `parseFilm` before it saves. A tap on a screen picture with a note like "zoom into this" gives the model the point as shares of the picture, which is how highlights find buttons without a vision call.

### AI and cost

- All three film modes sit on `video-assist` behind the `NORTH_STAR_USERS` check (403 `not_enabled` before any count) and call `openaiChat` with a strict `json_schema`, as media-sort does, not the `VIBE_MODEL` path the other `video-assist` modes use. Each call has `AbortSignal.timeout(60_000)`, refunds only when OpenAI never answered, and logs `usage.prompt_tokens` and `usage.completion_tokens` (as text-voice logs its cost) so the price can be checked.
- Directions: mode `film-directions` (cap `launch-film`). Input: the setup, `brandPack`, `memoryLine(userId, "videos")`, the product from `products.ts`, the kit's colour roles and font, each picked screen's alt text (a demo video's `shows` line), type and shape, and the house rules distilled from huashu's `director.md`, `rhythm.md` and `library/README.md` (credited in the prompt file's header). Output: three directions, each with a name, one line, a spine kind (`screen`, `type` or `cards`) so they differ in language, colour roles, and one hero scene. About 6,000 tokens in and 2,500 out: about US$0.002 on gpt-6-luna (reasoning tokens bill as output, so a long think could double it). "Show 3 more" is another use.
- Recommended: Jev, type `choice`, instructions: "A brand is posting a short launch film for its product on Instagram, TikTok and LinkedIn. Which direction below would make a viewer most likely to watch to the end and remember what the product does?" with the three one-liners as criteria. Proposed threshold 0.4, set after the first 20 runs are read. Null: no tag.
- Product type for the music: Jev, type `choice` over the 12 types' `about` lines, with the brand summary and product line as the state.
- Film: mode `film` (cap `launch-film`): the chosen direction plus the same inputs; output the full spec. The server runs `parseFilm` and `rhythmIssues`; on a parse failure or an issue it asks once more with the issues listed, inside the same use, and a second failure answers 422 `unusable` with the use kept (remix's "one fixing pass, then a refusal that keeps the use"). About 7,000 in and 5,000 out: about US$0.003, twice that with the retry.
- Edit: about 4,000 in and 800 out: about US$0.001. A whole-film note sends and gets back the whole spec: about US$0.003.
- Voice (optional): a new `text-voice` mode `lines`, Leo only (`isAllowed` and `NORTH_STAR_USERS`, 403 `not_enabled` before the count; text-voice has no such check today). English, the scene lines joined by newlines through the existing `with-timestamps` URL (`dubUrl`), `ttsBody` with no `language_code`, and `lineSpans`, so each line's start and end come back with the audio. Cap `ai-voice`, about US$0.02 for a 30 s script. The line's words are drawn as a caption in the bottom safe area from those spans, with no transcription.
- Compliance: every on-screen word and voice line through `scanCompliance` and Jev `MAS_QUESTION` after each write and edit (Jev is about US$0.00003 a question).
- Music, effects, preview and export run on the device: free.
- New caps in `DAILY_LIMITS` (`_shared/usageCaps.ts`), under a "North star phase 7" comment like the other phases: `launch-film` 10 a day (one for the directions, one for the film, so 5 films), `film-edit` 60 a day. Prices in `PRICES` (`_shared/prices.ts`): `launch-film: about(0.003)` and `film-edit: about(0.001)`, both commented unverified until Leo's first runs report tokens; both read "Under US$0.01" on the chip. Labels in `AI_USE_LABELS` (`src/lib/activity.ts`): "Launch films" and "Launch film changes". No global caps: no prepaid pool is touched except ElevenLabs through the existing `ai-voice` caps.
- A 30 s film with directions, the film and 10 notes: about US$0.015 on gpt-6-luna, about US$0.24 on gpt-4.1, plus US$0.02 with a voice. For comparison, Fastlane's video formats are about US$2 to US$8.40 a post and our AI video slot is about US$2.77.
- `PriceChip` with `feature="launch-film"` on "Show me 3 directions", "Show 3 more" and "Make this one", and `feature="film-edit"` on Send and "Fix it", each with `left` from `useUsesLeft`, so Leo sees "Under US$0.01 | 9 left after this".

### Campaigns

An `"ai-video"` post in a campaign gets "Make it a launch film", which opens `/make/launch-film?campaign=<id>&post=<n>` (the post's 1-based number, as `/campaigns/<id>?post=` uses) with the post's angle as "What should people remember". When "Open in editor" hands the film over, its `JoinExtra.draftId` is `draftIdOf(campaignId, n)` and the post gets `updatePost(userId, campaignId, n, { state: "made", draftId, made: { kind: "video", id: draftId } })`, as `settle` in `campaignActions.ts` does for other videos. The planner itself does not choose launch films (Open questions).

### Made with AI, and licences

- The film has no AI person and, by default, no AI voice; it is the brand's own screens, logo and words drawn in code, so it carries no AI label. With "AI voice reads it" on, the hand-off sets `JoinExtra.ai` to `{ kind: "explainer", voice: "premade", voiceId, madeAt }` (`AiMark` in `src/lib/videoProjects.ts` has no film kind, and `explainer` is its narrated video with no person), so the editor shows the AI voice chip and `withAiLine` ends the caption with `AI_LINE`, "This video uses an AI-made person or voice.", as every AI-voiced video does.
- Ported huashu files keep their copyright line in each file's header. Two licence texts go into `src/lib/film/vendor/huashu/`, copied byte for byte: `LICENSE` (root, "Copyright (c) 2026 Huashu") for the `om.js` and `cli/lib` ports, and `LICENSE-clip` (`runtime/clip/LICENSE`, alchaincyf) for `motion.js` and the icons. That folder's `NOTICE.md` names the source commit, 52467f9 (v0.3.1), and the clip runtime's own source, huashu-art-motion 57d6760.
- Never copied: GSAP or anything under `vendor/gsap*`, `runtime/clip/lib/toon.js`, the `y1_kurzgesagt` and `y4_storytime` grammars that call it, the `storytime` template, any demo film or GIF (`docs/media/`, `examples/`), the sample pack (CC-BY needs credits, about 55 MB), Kokoro and whisper models, and the "Made with huashu-motion" signature (`runtime/om-engine.js`).
- Fonts: the brand's own font, or the three already loaded from Google Fonts; no new font files.

### Deep links

Rows for the North star phase 3 table in `docs/deep-links.md`, in its columns. With no params the page opens Setup with this device's last picks (`cs-make-film-setup`).

| Page | Param | Values | Default | History | Example |
|---|---|---|---|---|---|
| /make/launch-film | length | Leo only. 15, 30, 60 (seconds) | 30 | replace | /make/launch-film?length=15 |
| /make/launch-film | shape | Leo only. 9x16, 1x1, 16x9; with film= and export=open, the export sheet's pick | 9x16 | replace | /make/launch-film?shape=16x9 |
| /make/launch-film | energy | Leo only. fast, continuous, quiet | fast | replace | /make/launch-film?energy=quiet |
| /make/launch-film | voice | Leo only. ai (AI voice reads it) | none | replace | /make/launch-film?voice=ai |
| /make/launch-film | product | Leo only. a product id from src/lib/products.ts; unknown is ignored | none | replace | /make/launch-film?product=pd-mh2k9x |
| /make/launch-film | screens | Leo only. Media keys, comma separated; keys not on this device are dropped | the newest 4 screens | replace | /make/launch-film?screens=cimg-mh2k9x01ab,cimg-mh2k9x02cd |
| /make/launch-film | campaign, post | Leo only. a campaign id and its post's 1-based number: Setup filled from that post | none | replace | /make/launch-film?campaign=c-lq3k9z&post=4 |
| /make/launch-film | film | Leo only. a film id: the studio, or Pick a direction while none is picked | none | push | /make/launch-film?film=fm-mh2k9x01ab |
| /make/launch-film | t | Leo only. seconds into the film, with film | 0 | replace | /make/launch-film?film=fm-mh2k9x01ab&t=7.2 |
| /make/launch-film | tab | Leo only. fields, with film | notes | replace | /make/launch-film?film=fm-mh2k9x01ab&tab=fields |
| /make/launch-film | note | Leo only. a note id, with film: that note open and the player at its time | none | replace | /make/launch-film?film=fm-mh2k9x01ab&note=n3 |
| /make/launch-film | export | Leo only. open, with film: the export sheet; nothing exports on arrival | closed | replace | /make/launch-film?film=fm-mh2k9x01ab&export=open&shape=1x1 |

The shared `source`, `from` and `mention=no` params are read as on every /make page (`MakeFormatPage` resolves `source`); a source's hook fills "What should people remember". No URL starts a paid write: Show me 3 directions, Show 3 more, Make this one and Send are presses. Builder `links.makeFormat("launch-film", {...})`; `length` follows `/make/talking-head`.

### Edge cases

- No logo: the end card draws the brand name in the brand font. No brand font: Archivo Black for type scenes, DM Sans for the rest.
- A brand colour with poor contrast: `readableOn` picks the text colour; the ground role falls back to `ink`.
- A very tall or very wide screen picture: fit inside the frame, never cropped (as `t2_keynote_ui` does).
- 60 s films: up to 10 scenes; the spec refuses more.
- A note that would push the length past 60 s: the parser trims the last hold and the reply says so.
- Two edits at once: Send is disabled while one is running; a second note waits in the list as "Waiting".
- Leaving mid-write or mid-export: the job keeps going; the page shows its step on return. A reload mid-write loses the run, and the server returns the use when OpenAI never answered.

## Done when

- [ ] On Leo's sign-in, `/make/launch-film` with 4 Media screens and the defaults shows 3 directions whose key frames use his kit colours and his screens, and one carries Recommended whenever the logged Jev answer is not null.
- [ ] "Make this one" opens a 30 s film for which `rhythmIssues` returns an empty list (first event within 3 s, no 2-bar gap, logo held 1.5 s or more), and `timeline.test.ts` passes with every scene start and cut on a whole beat at the film's bpm.
- [ ] Point to change on a card title with "make this shorter" changes only that title: `JSON.stringify` of every other scene is identical before and after, and the playhead reads the same time.
- [ ] A timing note ("hold this longer") changes only that scene's `beats`; every later scene start moves by the same whole number of beats, and the sound cache hash changes so the music re-renders.
- [ ] Undo restores the previous spec exactly (`JSON.stringify` equal); Not quite reopens the note with its earlier reply in the thread.
- [ ] A 30 s film exports as MP4 in the browser at 9:16 (1080x1920), 1:1 (1080x1080) and 16:9 (1920x1080), from a 390 px wide window and from 1440 px, and each file plays with sound in Chrome and in QuickTime.
- [ ] Stills taken from the exported 9:16 file at 5, 15 and 25 s, set beside the preview paused at the same times in one screenshot, show the same words and shapes in the same places.
- [ ] The exported mix reads -14 LUFS plus or minus 1 by `integratedLoudness`, with `truePeak` at or under -1 dB, and `clipStats` (`exportCheck.ts`) finds fewer than `CLIP_MIN` clipped places.
- [ ] With `window.VideoEncoder` deleted in devtools before Export, the film still exports, in real time, and the sheet shows "This browser exports in real time, so a 30 second film takes 30 seconds."
- [ ] With AI voice on, the project opened in the editor shows the AI voice chip and its caption ends with `AI_LINE`; with Music only, neither.
- [ ] A film with a flagged demo video, or a line that `scanCompliance` flags, shows its warn chip and still exports.
- [ ] Signed in as a non-Leo account in a tab that never had `?asLeo=1` (or after `?asLeo=0`), `/make` and `/make/launch-film` show the not-found page, and a direct POST to each of `film-directions`, `film` and `film-edit`, and to text-voice `lines`, answers 403 `not_enabled` while that account's `readUsage()` counts stay the same.
- [ ] For one film with 10 notes, the US$ worked out from the logged tokens at the `prices.ts` rates is within 2x of the chip prices summed.
- [ ] `git diff origin/main -- package.json package-lock.json` is empty, and `grep -rliE "gsap|TOON\.|Made with huashu" dist/assets` finds nothing after `npm run build`.
- [ ] Checked at 390 px and 1440 px; `npm run build` and the full `npx vitest run` pass; the `formats-launch-film` entry in `src/data/northStar.ts` (add it if it is not there) gets `status: "live"` and a new `ours` line in the same commit, and `FORMATS` has `ready: true`.

## Tests

- `supabase/functions/video-assist/filmSpec.test.ts`: `parseFilm` keeps a valid spec as is; refuses an unknown kind, a duplicate id, a URL in any text but `cta`, a Media key the brand lacks, a hex colour not in the kit; clamps beats to the chosen length within a bar; caps words per field.
- `src/lib/film/timeline.test.ts`: scene starts sit on beats at each energy's bpm; `rhythmIssues` finds an empty frame 0, a first event after 3 s, a 3-bar gap, a missing burst on Fast cuts, a logo held 1 s; a good fixture returns none.
- `src/lib/film/layout.test.ts`: one spec gives boxes inside each of the three frames, words clear of the `APP_COVER` top, bottom and right bands at 9:16, and a phone screenshot left of the words at 16:9.
- `src/lib/film/draw.test.ts` (a hand-written 2D context stub that records calls; no `canvas` package, vitest runs in node): `drawFilm` at the same `t` twice makes the same calls; the marks at 7.2 s include the `features.card2.title` box; with `Date.now`, `performance.now` and `Math.random` replaced by throwing stubs it still draws.
- `src/lib/film/sound.test.ts` (imports the pure synth module, not the worker): the ported synth gives byte-equal buffers for the same film twice; a text-only change keeps the cache hash; a beats change alters it; the music's sections start at the scene starts and effects land on their event times, each within one sample block.
- `src/lib/film/edit.test.ts`: merging a patch keeps the other scenes byte for byte; a patch that renames another scene is rejected; a timing patch shifts later starts; a whole-film reply replaces the spec.
- `supabase/functions/video-assist/film.test.ts`: the three modes answer 403 `not_enabled` for a non-Leo uid before counting; a request with no screens still writes; the prompt carries the MAS lines; a parse failure retries once, then answers 422 `unusable` with no refund; OpenAI never answering refunds the use; `refuse` passes through.
- `supabase/functions/text-voice/logic.test.ts` and `index.test.ts`: mode `lines` takes English lines and returns one span per line; it counts one `ai-voice` use; a non-Leo uid gets 403 `not_enabled` before the count.
- `src/lib/activity.test.ts` and `supabase/functions/_shared/prices.test.ts` (existing): the two new caps have labels, and `priceText(priceOf("launch-film"))` is "Under US$0.01".
- `src/lib/links.test.ts`: `links.makeFormat("launch-film", {film, t, tab})`.
- A licence test: no file under `src/lib/film/` matches `/gsap|\bTOON\b|toon\.js|Made with huashu/i`, every ported file carries its copyright line, and both licence texts sit in `src/lib/film/vendor/huashu/`.

## Open questions

- Which model writes the films? gpt-6-luna is the app default: about US$0.002 for the directions, US$0.003 for the film and US$0.001 a note, about US$0.015 a film with 10 notes. gpt-4.1 is about US$0.03, US$0.05 and US$0.015, about US$0.24 a film. Claude through the API would be a new paid provider and is not costed here. Recommendation: build on gpt-6-luna and compare three films on gpt-4.1 by eye before choosing, since huashu's own CNY 1.95 film shows a cheap model can do it when the method is in the prompt.
- The other money per film: Jev's three questions (Recommended, product type, MAS per write and edit), about US$0.00003 each at US$0.042 per million input tokens, and the optional AI voice at about US$0.02 through the existing `ai-voice` cap (ElevenLabs; the studio's account spends free characters today). Recommendation: keep both, with the voice off by default (Music only), as Setup has it.
- The caps: `launch-film` 10 and `film-edit` 60 a day put the worst day at about US$0.12 on gpt-6-luna (10 writes that each retry, about US$0.06, plus 60 scene edits, about US$0.06; US$0.24 if every note is on the whole film), or about US$1.90 on gpt-4.1. Recommendation: keep them, and read the logged tokens after Leo's first week.
- Real instruments: host huashu's sample pack (about 55 MB, CC0 and CC-BY with credits on every film's page) for piano, strings and drums, or stay synthesized? Recommendation: synthesized for v1, and decide after hearing three films.
- Should the campaign planner put launch films into AI video slots by itself (about US$0.015 against US$2.77 for a 15 s AI video)? Recommendation: a button on the slot first, the planner later if Leo keeps pressing it.
- Which brands get it? Recommendation: product brands with screens in Media (Activity Tracker, Content Studio, MoneyBees, FINternship) first; adviser brands only once they have screens of their own tools, since an insurer's illustration screen would need the compliance check on every frame.
- A 3D direction (huashu's depth direction with Three.js, which is MIT) is left out: Canvas 2D has no perspective, and the cost of 3D export on a phone is unknown. Recommendation: ship 2D, then decide from the first films whether a depth direction is worth a WebGL renderer.

## Related

`formats-hook-demo`, `formats-animated`, `formats-faceless-video`, `formats-gallery`, `brand-kit`, `brand-media-library`, `brand-demo-videos`, `brand-products`, `brand-voice-memory`, `edit-video`, `edit-by-chat`, `publish-export-share`, `people-ai-labels`, `business-cost-preview`
