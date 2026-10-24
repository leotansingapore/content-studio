# Rebuild a reel's whole edit

`remix-format-clone` | remix | phase 7 | status: partial | /north-star#remix-format-clone

## Status

Partial. The parts exist one by one: Clone a reel rewrites a reel's script, Copy a reel's style lays its caption look and pace (pause trimming from its cuts a minute, zooms or punch-ins, flash or soft transitions) over a video you already have, talking heads speak with your face or a kept presenter, B-roll is found per line, and a talking head can remake only the parts whose words changed. Cutaways, zooms and pop-ups land on lines Jev picks in your own words, but nothing records where a source reel's cuts, cutaways and on-screen text fall against its words, so nothing can lay that edit on a new video or make versions of it.

## Leo asked

24 Oct 2026, picking this item: give it a reel that is already working and it rebuilds the whole edit, not just the script (shot timing, caption style, B-roll beats and effects, all anchored to the words), and you get a finished video in your brand. Then you swap what you want (the hook, the product, the host, the language) and make variants from the same edit.

## What Hypit and the others do

### Hypit

Hypit (github.com/hypit-ai/hypit, 25,316 stars on 25 Oct by the GitHub API) gives a coding agent such as Claude Code a markup language, SVML, and a runtime. Its README: "Drop in a video, and your agent clones it as a complete workflow: footage, captions, B-roll and effects, all anchored to words instead of seconds", under the tagline "1 command, 100 variants, 100M views". Read from the clone, never run:

- Each of the three examples ships with three variants and its total model bill: "GOAT DEBATE", a 20 s football tier list, cost US$1.15; "DAILY CREATINE", an 18 s two-host podcast, US$1.07; "NICE RIDE", a 26 s street interview, US$1.09 (the root README.md; the examples' own READMEs give no cost). Seedance 2 Mini makes the 720p footage and GPT Image 2 the stills, Fish Audio designs the voices (`examples/interview/README.md`) and WhisperX times the words, all "concurrently rendered in 64 headless Chromium processes".
- In `examples/interview/reference.svml` the script marks `@{bitcoin!}` just before the word, and the reveal sound, the colour flash and the emoji board all fire at the time WhisperX finds for that word in the generated take. `swap-lang.svml` puts the same marker before "Bitcoin." in Spanish and every effect moves with it, while `||` ends a caption cue (`skills/hypit/references/production/script-syntax.md`).
- The skill reads a reference before it builds anything, writing `ANALYSIS.md` on why the whole piece works and `TIMELINE.md` with timed sections that name each element, the word it serves and "what the choice does for the viewer" (`skills/hypit/references/creation/reference-video.md`). It reads from a transcript plus frame grids labelled with the words.
- On swaps it says to transform the role rather than the pixels: "A product may be a prop, a screen, a demonstration, a claim, and the final CTA. Transform the role across every real manifestation" (`transformations.md`).
- Reuse is spelled out: after a first build, a second render that changes only captions or graphics "contains no new image, voice, video or alignment requests" (`examples/interview/README.md`). Every variant (`swap-host`, `swap-lang` and `swap-ride` in `examples/interview`, `swap-item` and `swap-app` in `examples/podcast`) is a separate source that shares the recipes.
- Placement is measured on the new footage: head-following captions use freshly measured face boxes, the old video's 783-frame tracking is never carried over (`examples/interview/README.md`), and "absence of evidence never becomes a guessed position" (`packages/caption-fine/README.md`). One caption recipe fixes where a caption sits, how it looks and when it moves.

No Hypit code, no SVML parser, no Hypit name and no Hypit logo go into the app, and nothing is installed from its repo, because its licence bans the way Content Studio would use them. LICENSE calls it "a modified version of the Apache License 2.0". Clause 1a forbids using "the Hypit source code, or any derivative work of it, to operate a multi-tenant environment" without written permission, and any setup where two or more outside parties hold separate workspaces counts as one. Clause 1b forbids supplying it or a derivative "for commercial gain". Content Studio is a paid service where many advisers and businesses hold their own workspaces, so it would break both. Clause 1c makes anyone who does use it keep its name and logo on what users see, and the Apache terms underneath grant no right to use its name or marks (section 6), so neither appears anywhere. This spec learns from the approach only: none of SVML's syntax, and the data shape below is our own. The repo already holds SeeCut to the same rule in `supabase/functions/video-assist/watch.ts` ("none of its code or prompts are here"). Our anchors are plain JSON of our own, an event number plus a word position, and the `[[3]]` tokens in the writer's output are a prompt device that the validator strips before anything is saved.

### Fastlane

On Radar, a video ad's "What Remix does" box reads "Senna breaks the video down, writes a script and storyboard for Activity Tracker, then makes it with Seedance. You see it before anything posts.", with a fit warning when needed: "Not recommended: it is packed with text, and text-heavy remixes often come back jumbled." (4:01, notes-3 F9). The chat composer then shows "Remix, 130 credits", about US$5.20 at the Starter rate of US$20 for 500 credits, charged once at the press (4:12, F10). Trending posts show "Remix, 390 credits", about US$15.60 (F5a). The US$20 for 500 is the homepage's Starter; Fastlane's /pricing page lists Starter at US$29 for 250, which would make a remix US$15.08 (`docs/north-star/research/competitors/remix-ugc.md`). Leo never pressed it, so the result is unverified.

![Fastlane 4:01](../../../public/north-star/fastlane/t241.webp)

![Fastlane 4:12](../../../public/north-star/fastlane/t252.webp)

### Others

- MakeUGC Ad Remake: "Upload an ad that's already working and a photo of your product. MakeUGC rebuilds the same hook, pacing and style around what you sell." "100 credits per video on Seedance 2.0, in 9:16 or other formats, up to the length you pick" (its sample is 10 s); "Your own ads, or ads you have the rights to use... don't upload someone else's footage to copy their brand, people or product." Batch Mode runs x1, x5, x10 or custom, each "its own variation, like a different hook" ([ad remake](https://www.makeugc.ai/ad-remake-feature), [batch](https://www.makeugc.ai/batch-mode-feature)).
- Creatify AdClone "analyzes hook patterns, pacing, and CTA placement, then rebuilds" the ad, says it "doesn't copy word-for-word", and outputs 9:16, 16:9 and 1:1 together, where "Each video ad costs 2-20 credits depending on length and complexity". You start from trending ads, from product-matched ads or with "Clone your own ads"; the page never says whether captions or B-roll carry over ([ad clone](https://creatify.ai/features/ad-clone)).
- Arcads: new spoken hooks with the same actor and voice joined by "Stitch Videos" for 0 credits; "Replace Actor" keeps script, timing and scene for 500 credits (800 on the credits page); "Translate Video" in 176 language and accent options at "240 credits per started 30 seconds of video, per language"; its rules ban "Cloning or modifying the image or voice of creators" ([hooks](https://help.arcads.ai/en/articles/17595001-hook-variations), [credits](https://help.arcads.ai/en/articles/13725589-how-are-credits-counted), [translate](https://help.arcads.ai/en/articles/17595031-how-do-i-translate-a-video-ad-into-other-languages-in-arcads), [prohibited](https://help.arcads.ai/en/articles/9276579-which-content-type-are-prohibited)).
- Higgsfield Marketing Studio "Ad Reference": "upload a high-performing ad and recreate its concept, scene composition, pacing, and hook with your own product", about US$2 per 8 s at 720p, 15 s at most. Its own recipe for 100 ads is 5 hooks x 5 products x 4 languages; per 10 s at 720p, Marketing Studio is 60 credits (US$3.00), Genjutsu object swap or motion transfer 71.5 (US$3.58), Lipsync 58 (US$2.90) in 18 languages, and the page admits "there's no batch button built in" ([make 100 ads](https://higgsfield.ai/blog/make-100-creative-ads), [100 variations](https://higgsfield.ai/blog/100-plus-ad-variations-ai)).
- Captions, now run by Mirage (its help pages sit on mirage.app), has Remix Video make one video per actor added, with "Generate a different hook" or "Translate". Mirage's Tesseract is, like Hypit, driven by your own coding agent: "Give your agent the MP4", and its sample prompt asks it to "Match the shot order, pacing, layouts, typography" in an editable project whose footage is "supplied or separately generated" ([remix](https://captions.ai/help/mirage/step-3-generate-edito-share/remix-video), [tesseract](https://mirage.app/tesseract/use-cases/recreate-video)).

What this changes for us: the paid tools keep the structure and regenerate everything else, and none of their public pages says the captions, cutaways and effects land on the new words. Hypit and Tesseract get there with an agent at the keyboard, which our users will never do, so in Content Studio the app itself has to read the edit and lay it down again. Hypit and Arcads both sell variants with one change each (a new host, a new language, a new item), and that is the shape used here.

Raw captures: the scratchpad `research-clone/` folder of the 24 Oct session (outside the repo).

## What we have today

Checked against main 6c7cbbbf on 24 Oct 2026, and again on 25 Oct.

- Clone a reel (`/clone`, `src/pages/CloneReelPage.tsx`, `src/lib/reelClone.ts`, `supabase/functions/clone-reel`) reads an Instagram reel (Apify `apify~instagram-reel-scraper`) or a TikTok (`clockworks~tiktok-scraper`) into `CloneSource` (caption, transcript as plain text with no times, duration, and Instagram's `videoUrl`; TikTok gives no file), then a breakdown, versions and a shot list per beat. Caps `reel-clone` 20, `reel-visuals` 20. Leo's sign-ins get "Make the video" and "Make it as a talking head" on a result. An Instagram video is never served from the cache (`cacheDecision` always refreshes it, because its link expires), so every read hands back a fresh `videoUrl`; this is the path that is live today.
- Frames and pacing: `src/lib/reelFrames.ts` downloads the reel in the browser (`fetchReelVideo`, relayed by clone-reel on cap `reel-video` 20 when the CDN refuses CORS, 80 MB at most), finds cuts from 24 px greyscale differences (`detectCuts`, one threshold, 0.14) and picks up to 10 frames. From those frames `supabase/functions/reel-visuals/logic.ts` writes the format, the hook visual, a pacing note and a shot for each beat, and it reads the on-screen text with its times.
- Copy a reel's style (`src/components/ReelStyleCopy.tsx` in the editor's Vibe edit box, `src/lib/reelStyle.ts`), live for every sign-in since 9 Oct (5a7d8011) and wired end to end: clone-reel `{style: true}` reads the post (cap `reel-style` 20, about US$0.01), the tab downloads and measures the video (`measureReel`: cuts and zooms a minute, punch-ins by `scaleJump`, flash or dip at up to 24 cuts, hook seconds, and at most 12 frames, 5 of them from the opening seconds), reel-visuals mode `style` describes captions and framing (cap `reel-visuals` 20, about US$0.02), Jev picks the look (`ReelLook`: style, case, box, position, words at once, captions on or off, framed, top half), and `withReelStyle` applies one recipe with Undo. When zooms or pop-ups come on, Jev picks key lines in your own words (`motion-picks`). The chip sums the three. A TikTok copies only the pace, since it shares no file. It copies rates and a look, never where the reel put anything against its words.
- Teardown (`remix` mode `teardown`, cap `remix-teardown` 40): hook, pattern, 3 to 8 beats, payoff, CTA and a `dontReuse` list per source key. The closeness floor (`supabase/functions/remix/overlap.ts`: `sharedRuns`, `reusedItems`) runs after every remix write.
- Word times: `video-assist?mode=transcribe` (Whisper with word timestamps, cap `video-transcribe` 30, about US$0.006 a minute). An AI video opened with `JoinExtra.said` is captioned by `scriptWords` in `src/lib/subtitleImport.ts`, which spreads the words evenly over the length. text-voice's `dub` mode already asks ElevenLabs `with-timestamps` and turns the character alignment into line spans (`lineSpans`), not word times; the plain voiceover request (no mode) returns only the MP3.
- The editor (`src/pages/VideoEditPage.tsx`, `src/lib/videoEdit.ts`) draws everything a reel's edit is made of, timed in seconds on the source timeline: `broll[]` with one `brollLayout` for all of them (full, top or side), `overlays[]` (text callouts, blocks, arrows), `hook` and `hookSeconds`, `motion.lines` (key lines with `keyZooms`, and `pop` text with `popups`), `keyWords`, `numberCards` (a switch that draws a card wherever a figure is said), one `transition` for the whole video ("soft" or "flash"), `punchIn`, `sfx`, `music` and `musicDrop`, captions (style, position, words at once, box, font, animation), `fit` (including stacked and slides layouts), a green screen (`backdrop` and `stand`), logo and end card. Export runs on the device, in four sizes (`src/lib/exportVersions.ts`).
- B-roll: "Add B-roll for me" (`src/components/AutoBroll.tsx`, `src/lib/autoBroll.ts`, video-assist mode `broll`, cap `broll-picks` 20): Jev picks the lines and says whether each needs a scene clip, an idea card or the named product, the model writes the stock search or card text; AI clips when stock has nothing (`ai-broll` 3, about US$0.13 each).
- People: `/make/talking-head` (`src/lib/talkingHeadJob.ts`) speaks a script with your verified face (`src/lib/myFace.ts`) or a kept presenter (`src/lib/presenters.ts`) through Higgsfield Speak, 11 credits a part up to 4.5 s and 22 above, parts under 9.5 s, 30 s at most; 15 s is US$2.75. The narrated video (`makeExplainer`, stock first) has no face.
- Remaking parts: `src/lib/avatarScript.ts` and `remakeParts` in `src/lib/aiVideo.ts` remake only the Speak parts whose words changed, and the same face can say the script in Chinese, Malay or Tamil as a new video (people-dub-lipsync A and B). Every remake counts on `ai-video` (2 a day) and `ai-video-global` (20 a day).
- AI marks: `AiMark` on `VideoProject` (`src/lib/videoProjects.ts`) puts "AI person" and "AI voice" chips in the editor and ends the caption with `AI_LINE`, "This video uses an AI-made person or voice." (commit 00d0c51c). Its `kind` is avatar, explainer, template or dub; only the avatar paths set a mark today, so a narrated video or a "Voiceover from text" gets no chip yet (people-ai-labels adds kind `voiceover`).
- Prices: every capped call has a price in `supabase/functions/_shared/prices.ts` or sits in its `NO_PRICE` list (Jev-only, free and relay caps), shown by `PriceChip` with `priceOf` and `sumPrices` (`src/lib/prices.ts`).
- Versions: remix-variations specs `DraftEntry.set`, `otherFormulas` in a new `src/lib/variants.ts` and the hook test in My posts; none is built yet (`src/lib/draftHistory.ts` has no `set`, and `variants.ts` does not exist).

## What to build

Leo-only. The page renders through `MakeFormatPage`, which already gates on `useLeoUser()` and shows NotFound to anyone else; the entry buttons and the Versions panel check `useLeoOnly()`. Every new server mode checks `NORTH_STAR_USERS` (403 `not_enabled`): remix already does, while reel-visuals and text-voice have no gate today, so their new `edit` mode and `timestamps` option add one. Build after remix-variations' `set` field and `otherFormulas`, or build those two as its spec describes if this lands first.

### Screens and links

A new format page `/make/same-edit`, entry with `slug: "same-edit"` in `src/data/formats.ts` ("Same edit, your version", group 3, `cap: "ai-video"`, a new `needs: "reel-video"` whose `NEED_LINES` line is "Needs a reel's video: Instagram or an upload"), component `src/components/make/SameEdit.tsx`, job `src/lib/sameEditJob.ts` (module level, outside React). Ways in: "Rebuild this edit" on a Clone a reel result that has a video, and on an uploaded video read through Remix a post. Remix a post keeps only an upload's read, never the file (`src/lib/remixLink.ts`), so an upload source asks for the file again and accepts it only when its sha1 matches the key.

Reading (one press, "Read the edit", cap and price on the button):

```
Reading the reel...        Finding the cuts...        Hearing the words...        Reading the shots...
```

The edit (the plan, shown before anything is paid for):

```
[source video, this device only]   The edit                                 From @handle's reel, 0:38
                                   0:00  Hook      speaker | text: hook, 6 words | zoom
                                   0:04  Point 1   speaker | cutaway | text: label, 3 words
                                   0:12  Point 2   cutaway | cutaway | number card
                                   0:25  Ask       speaker | text: ask, 4 words
                                   Captions: Bold, 3 words, bottom, box.  22 cuts a minute.  Music under the voice.
                                   Not rebuilt: split screen at 0:18
------------------------------------------------------------------------------------------------
Who's on camera   [ You | Mei Ling (AI) | No face | I'll film it ]
Voice             [ Alice | Lily | ... ]
Length            [ 0:15 | 0:30 ]   The original is 0:38, so each beat gets a shorter share.
How close         [ Loose | Balanced | Close ]
------------------------------------------------------------------------------------------------
About US$2.79        2 left today        [ Make my version ]
```

Tapping a row plays the source from that beat. "Who's on camera" starts on You when a verified face exists, else I'll film it; an AI presenter is never preselected, and picking one shows "The person is made by AI." The press asks first under the button, as remix-any-format settled on 20 Oct: "This makes a video and uses about US$2.79 of video credit. Make it?" with "Make it" and "Not now". The read was paid at "Read the edit", so it is not in this price.

Making: "Writing your version...", "Making the voiceover...", the talking head's own steps, "Finding the cutaways, 2 of 4...", "Putting it together...". At the join the page pushes `/edit?p=<id>` with the plan laid in. Toast: "Your version is ready. Change anything, then export." With I'll film it, the script is saved as a short-video draft and the page shows "Film it, then upload the take here." Uploading at `/edit?plan=<id>&version=<vid>` captions the take as today and offers "Lay the edit over this take".

Versions: a "Versions" button in the editor on a project made from a plan opens `/edit?p=<id>&versions=1`, the same pattern as the Script card's `script=1` (`panel` on /edit already names the start screen's panels, which opening a project drops):

```
Versions of this edit                                                     3 made
New hook       [x] "Most advisers check CPF once a year..."   Recommended
               [ ] "I asked 40 clients one question..."
               [ ] "Stop guessing what your CPF covers"        [ Write 3 more ]
Your offer     [ ] Free 15-minute review   [ ] Hospital plan check
Who's on it    [ ] You   [x] Arjun (AI)
Language       [ ] Chinese   [x] Malay   [ ] Tamil
-------------------------------------------------------------------------------
3 versions, about US$6.97        3 uses                         [ Make 3 versions ]
```

Each ticked box is one version with one change. With today's `ai-video` cap of 2 a day, the button above is disabled with "This needs 3 uses and 1 is left today." (`reasonText`) until Leo answers the first open question. Done lists "Version 2: new hook | Open" per version, each its own editor project, all saved in My posts as one set of kind `versions`, with "Make it a hook test" turning it into kind `hook-test` and opening `/drafts?set=<id>` (both from remix-variations).

Every view and open item sits in the address, so these rows go into `docs/deep-links.md` under "Formats (Leo only)", each with an example URL as the other rows have and a builder in `src/lib/links.ts` (`links.makeFormat` for the page, new `versions`, `plan` and `version` fields on `links.edit`). `/drafts?set=` is remix-variations' row:

| URL | Param | Values | Default | History |
| --- | --- | --- | --- | --- |
| /make/same-edit | source | a RemixSource key with a video: `clone:instagram:<id>`, `upload:<sha1>` | none | replace |
| /make/same-edit | plan | a saved plan id: its edit, no new read | none | push |
| /make/same-edit | who | mine, a kept presenter's id, none, film | You when verified, else film | replace |
| /make/same-edit | voice | a voice id | the brand's voice | replace |
| /make/same-edit | close | loose, close | balanced | replace |
| /make/same-edit | beat | the selected row, 1-based | none | replace |
| /edit | versions | 1, with p on a project made from a plan: the Versions panel open | closed | push |
| /edit | plan, version | the upload screen ready to lay that plan over a filmed take | none | push |

### How a reel's edit is read

Measuring runs on the device, so the source's footage and sound leave it only as frames for the vision call and sound for Whisper.

1. The video: `fetchReelVideo` on a fresh `videoUrl` (clone-reel's style read, cap `reel-style`, plus `reel-video` when clone-reel has to relay the file) or the uploaded file. Refused over 80 MB or 90 s.
2. Shots and cut times: `measureReel` from `src/lib/reelStyle.ts` (cuts on a 0.5 s scan, zooms, flash or dip at up to 24 cuts) with one change: an option to take one frame 0.4 s after every cut, up to 24, in place of `styleFrameTimes`, which today keeps at most 12 frames and spends 5 of them on the opening seconds.
3. Words with times: the reel's sound to `video-assist?mode=transcribe`. The words are kept in memory for anchoring and the closeness check and never saved.
4. Faces: `src/lib/faceVision.ts`'s MediaPipe detector, through a small new export beside `findFaceBox` that counts faces on one frame, runs on each shot's frame. A face covering over 6 percent of the frame counts as a speaker shot. The detector finds boxes, not who is who, so a reel counts as two-person only when two faces share a frame; two hosts cut one after the other read as one speaker, which is how the plan rebuilds them anyway.
5. Sound, measured on the decoded audio and then thrown away with the rest of the track: loudness in the gaps between words means a music bed, a quiet gap of 0.4 s or more before a line is a drop, and a sharp peak within 0.15 s of a cut means sound effects.
6. What each shot shows: a new reel-visuals mode `edit`, on cap `edit-read` instead of `reel-visuals`, takes up to 24 frames (one per shot; `style` allows 12, `MAX_FRAMES`) and returns, per frame, one sentence on what is on screen (no names, brands or handles), the framing (close, mid, wide, framed, top card), and the text overlays word for word with their place (top, middle, bottom), plus today's `style` description of the captions and layout. One gpt call with images, about US$0.04 (unverified).
7. Decisions, in one Jev call (`supabase/functions/_shared/jev.ts`, `jev-1.13.0`):
   - `shot_<i>`, choice: "What does this shot show?" over speaker, cutaway, screen, text_card, product. State: the frame's sentence, the words said during the shot, whether a face was measured. Kept at 0.5 or more; below that, or when Jev is null, a measured face means speaker and no face means cutaway.
   - `text_<j>`, choice: "What job does this on-screen text do?" over hook, label, number, list, ask, caption_repeat; an overlay that only repeats the speech, or one Jev gives no answer for, stays out of the plan.
   - `beat_<s>`, choice per spoken sentence: "Which beat of the breakdown does this sentence carry?" over the teardown's beats. Code keeps them in order, since a sentence can never go back to an earlier beat, and a null answer falls back to splitting the beats by word share.
   - `role_<b>`, choice per middle beat: "What does this beat do?" over point, proof, product. The first beat is always the hook and the last is the ask when the teardown's CTA is not "None"; a null answer is a point.
   - The caption look comes from today's `ReelLook` questions in `reel-visuals/style.ts`, asked in the same call.
   Because the vision model writes its sentences in English, Jev's questions stay in English whatever language the reel is in. Calibrate the 0.5 on the first 10 reels by reading every answer between 0.3 and 0.7.
8. The plan: `planFromRead` (pure, `src/lib/editPlan.ts`) turns the cuts, shots, overlays, answers and sound into beats and events, each event placed as a share of the way through its beat. It needs the teardown; when the source has none, the read runs `teardown` first on its own cap.

### The data shape

`src/lib/editPlan.ts`, with the validators shared by the remix function the way `reel-visuals/logic.ts` types are imported today:

```ts
export interface EditPlan {
  v: 1;
  id: string;                 // "ep-" + base36 time
  source: string;             // RemixSource key
  at: string;
  read: {
    seconds: number;
    aspect: "9:16" | "4:5" | "1:1" | "16:9";
    wpm: number | null;
    look: ReelLook | null;    // reel-visuals/style.ts
    cutsPerMin: number | null;
    music: { bed: boolean; drops: number } | null;
    sfx: boolean;
    people: 1 | 2;
    cutaways: "full" | "top" | "side"; // the editor has one brollLayout per video, so the most common one
    skipped: string[];        // what the plan does not carry: "split screen at 0:18"
  };
  beats: { role: "hook" | "point" | "proof" | "product" | "ask"; share: number; shots: { kind: ShotKind; at: number; framing: Framing }[] }[]; // 2 to 8
  events: PlanEvent[];        // at most 40; event k is marker [[k]] in a version's script
}

export type ShotKind = "speaker" | "cutaway" | "screen" | "text_card" | "product";
export type Framing = "close" | "mid" | "wide" | "framed" | "top-card";
/** Beat b, a share of the way through it in the source (0 to 1), and how long it lasted there as a share of the beat. */
export interface Place { b: number; at: number; span: number }

export type PlanEvent =
  | { kind: "cutaway"; place: Place; picture: "stock" | "ai" | "mine" }
  | { kind: "text"; place: Place; role: "hook" | "label" | "number" | "list" | "ask"; words: number; y: number }
  | { kind: "zoom"; place: Place }
  | { kind: "popup"; place: Place }
  | { kind: "cut"; place: Place; as: "hard" | "flash" | "dip" };

export interface Version {
  id: string;
  of?: string;                // the version it changes
  change?: "hook" | "offer" | "host" | "lang";
  host: { kind: "mine" } | { kind: "presenter"; id: string } | { kind: "none" } | { kind: "film" };
  voice: VoiceId;
  lang: "en" | "zh" | "ms" | "ta";
  offer: string | null;
  lines: string[];            // our words, one per beat, markers removed
  marks: { k: number; line: number; word: number }[];
  texts: { k: number; text: string }[];       // on-screen text and pop-up lines
  searches: { k: number; search: string }[];
  caption: string;
  project?: string;           // the editor project, on the device that made it
  draft?: string;             // its My posts draft, inside the set
  at: string;
}
```

The plan holds no words from the creator: no transcript, no overlay text, no shot sentences. Only roles, counts, shares and the look. Stored in `content-studio-edit-plans-<scoped uid>` as `{ plan, versions }[]`, newest 20 plans and 24 versions a plan, synced by cloudSync; helpers `loadPlans`, `savePlan`, `addVersion`. `VideoProject` gains `plan?: { id: string; version: string }`, and `JoinExtra` gains `words?: Word[]` so the editor captions from real times with no transcribe; none of this needs a table or a schema change.

### Writing the script and laying the edit

- Writing: `remix` mode `make` with a new `as: "edit"`. Input: the plan's beats with role, target seconds and a word budget (target seconds x the source's words a second, held to 2.4 to 3.2 for a face), and per beat the markers it holds and what each needs ("a cutaway starts here", "on-screen label, 3 words", "a figure the viewer sees", "zoom", "a pop-up line"); the teardown; `brandPack` with the offer; the close level; the voice; and, for an adviser's brand, `MAS_LINE` when remix fit gave `masSafe`, as every remix gets today. Output: `{ lines, texts, searches, caption }`, each line carrying its `[[k]]` markers. The validator refuses a missing, repeated or out-of-order marker, a line more than 25 percent off its budget, a text more than 2 words off its count, and a search over 3 words; one retry inside the same use. Cap `remix-make`, about US$0.02.
- Word times of the new voice: text-voice's plain voiceover request takes `timestamps: true`, calls the `with-timestamps` endpoint the dub already uses (`dubUrl`), turns its character times into words, and answers `{ audio, words }` for the same `ai-voice` use. Speak parts are joined in order, so the voice's times are the video's times, and a filmed take is transcribed as today.
- Laying it: `compilePlan(plan, version, words, seconds)` (pure) returns `Partial<EditSettings>`. Marker k sits before word w, so event k starts at that word's start; a marker the writer dropped falls back to the beat's start plus `at` times the beat's new length. An event lasts `span` of the new beat, clipped to the beat's end. Then: cutaways to `broll[]` (stock downloaded by autoBroll's path; AI only when picked), `read.cutaways` to `brollLayout` (full leaves it unset); text with role hook to `hook` and `hookSeconds`; label, list and ask to `overlays[]`; a number event switches `numberCards` on when its line holds a figure from the brand's facts (the card then shows as the figure is said), else it becomes a label; zooms to `motion.lines` with `keyZooms`; pop-ups to `motion.lines[].pop` with `popups`; the more common of flash and dip to `transition` (dip is "soft"); `sfx`, `musicDrop` and the pause limit from the cuts a minute as `withReelStyle` sets it; captions from `look`. Logo and end card follow the brand kit (`withKit` in `src/lib/videoEdit.ts`). The editor already draws every one of these, so export needs no new code.

### How the swaps work

| Part | First version | New hook | Your offer | Who's on it | Language |
| --- | --- | --- | --- | --- | --- |
| Words | written | hook beat rewritten | product and ask beats rewritten | kept | translated, with the English meaning shown |
| Voice | made | hook line voiced | changed lines voiced | kept, cut from the base video's sound | made in zh, ms or ta |
| Picture | Speak, narrated, or your take | parts covering the hook remade (`remakeParts`) | parts covering the changed lines remade | every part remade with the new face | every part remade (real lip sync, people-dub-lipsync B) |
| Captions | from the voice's times | re-timed | re-timed | kept | the new words |
| Cutaways | found | kept | product beats searched again, or the brand's own media | kept | kept |
| On-screen text | written | hook text rewritten | product labels rewritten | kept | translated (edit-translate) |
| Zooms, cuts, look, music | laid | re-anchored | re-anchored | kept | re-anchored |

- New hook: three hooks from the formulas after the base's own (`otherFormulas`, remix-variations), Jev's pick marked by `writing-judge` mode `hooks`.
- Your offer: the brand kit's other offers (`offerNames` in `src/lib/remixBrand.ts`); the row is hidden when the kit has one.
- Who's on it: your verified face and the kept presenters, never a new face made here. Not offered on a filmed base, since replacing a filmed face is people-face-swap.
- Language: Chinese, Malay or Tamil. Each version shows its lines with their English meaning before the paid step. On a filmed base it is "Dub it" (a premade voice, no lip sync).
- A version starts from the base project's current settings, so stickers and cutaways placed by hand outside the changed lines stay where they are.

### Variants: how many and what they cost

At most 6 versions a press, one change each; cross products (5 hooks x 4 languages) are not offered. Each row is what one press spends, for a 15 s video unless it says otherwise, from `priceOf` and `sumPrices`, shown in the footer `PriceChip` before the press and asked once as on the first version:

| Run | About |
| --- | --- |
| Reading the edit, once a source, at its own press | US$0.07 (reel-style 0.01, transcribe 0.004, edit-read 0.05, teardown 0.01 when missing) |
| First version, your face or a presenter, 15 s | US$2.79 (Speak 44 credits = US$2.75 at US$0.0625 a credit, writing 0.02, voice 0.02) |
| First version, your face or a presenter, 30 s | up to US$5.54 (Speak 77 to 88 credits; the chip shows 88, as `scriptEstimate` does) |
| First version, no face, 30 s | US$0.04 (writing, voice; stock clips are free) |
| First version, I'll film it | US$0.03 (writing, then the take's transcribe) |
| New hook (one 7.5 s part remade, 22 credits) | US$1.42 |
| Your offer (one or two parts) | US$1.42 to US$2.79 |
| Who's on it (every part, voice kept) | US$2.75 |
| Language (every part, `video-translate` 0.03 and voice) | US$2.80 |
| Any version of a no-face or filmed video | US$0.02 to US$0.05 |

Caps: a new `edit-read` 10 a day (vision plus Jev, about US$0.05, refunded on failure, priced in `prices.ts` so the guard test passes). Everything else is today's: `reel-style` 20, `reel-video` 20 when relayed, `video-transcribe` 30, `remix-teardown` 40, `remix-make` 30, `ai-voice` 10, `video-translate` 30, `writing-judge` 60, `stock-search` 100, `ai-broll` 3, and `ai-video` 2 a day with `ai-video-global` 20 for every Speak run, first or remade. That allows two talking-head runs a day, the first version included, until Leo answers the first open question. Fewer uses left than ticked boxes disables the button with `reasonText`'s line, "This needs 3 uses and 1 is left today."

### Edge cases

- A TikTok link has no video file: "TikTok doesn't share the video file, so its edit can't be read. Upload the video, or remix its words." with "Remix its words" opening the Remix sheet.
- Over 90 s or 80 MB: "Pick a reel under 90 seconds." A face version stops at 30 s, a no-face one at 60 s; a longer source keeps every beat with a shorter share each, and the length row says so.
- When Whisper hears no words, the edit has nothing to anchor to, so the page stops before any paid step with "This reel has no spoken words to build on. Try Wall of text or Montage for reels like this." and links to both.
- Two people talking: the plan rebuilds it with one person and says "It has two people talking. Your version has one, so their lines become yours."
- Text in most shots: the remix-fit-check warning shows above the button, and the press still works.
- Cut detection misses on dark or busy reels (the threshold note in `reelFrames.ts`): fewer shots show in the plan; the editor fixes what is missing.
- The writer drops a marker: one retry, then the share fallback above.
- The voice runs long: the talking head's price check stops before Speak and shows the real price.
- A reload or leaving the page: the plan is saved before any paid call, and a paid Speak job resumes from `cs-ai-video-pending` at no cost.
- A plan opened on another device: its versions' videos stay on the device that made them; the panel says "This video is on another device. Open it there to make versions."
- A kept presenter deleted later: gone from "Who's on it"; versions already made keep their AI mark.
- No stock fits a cutaway: it is left out and the done toast says "2 cutaways had no stock clip. Add them in B-roll."
- The original has music under the voice: never copied; the toast adds "The original has music under the voice. Add yours in Music."
- Effects the plan does not carry are listed under "Not rebuilt" and left out: camera shake, which the editor cannot draw, and a split with a screen recording or a green screen, which it can draw (`fit: "slides"`, `backdrop` and `stand`) but only from the adviser's own recording or picture, added by hand in the editor.

### Compliance for an adviser's brand

- Never the creator's footage, face, voice, music, words or on-screen text. The plan stores none of them, and the output is made from new material only.
- The remix-closeness floor runs over every line and every on-screen text: no run of 6 words (4 at Loose) shared with the source's words or its overlays (both sent with the request, never stored), none of the teardown's `dontReuse` items, and Jev's `copied_claim` flag. A remix's flags show on the done step as they do in the sheet.
- The remix compliance block holds as it is: no promised returns, no named insurer products and no invented numbers. A number card appears only when its figure comes from the brand's own facts, and the compliance chips in `src/lib/compliance.ts` warn on the script before the voiceover is paid for.
- An adviser's brand (speaker person) gets its MAS lines: `MAS_LINE` in the writer's prompt when remix fit flagged `masSafe`, and the shared MAS question (`supabase/functions/_shared/mas.ts`, warn at `MAS_WARN` 0.5) asked of the script and its on-screen texts. Today remix skips that question when a make has a source, so `as: "edit"` is added to the cases that ask it. It warns and never blocks, as everywhere else; a business brand gets `MAS_LINE_BUSINESS` and no question.
- For an adviser the offer is a service from the brand kit, such as a review or a plan check, and the writer keeps today's remix rule: "Do not state a price or promise a result".
- Your face is used only after the read-aloud check.
- Presenters are invented Singaporeans from people-presenters, never a likeness of someone real, and a request that names a real person is refused there before anything is paid.
- Each version's draft carries its source (remix-source-trail), which keeps the optional "Idea from @handle." line working.
- Language versions show the English meaning of every line before anything is paid, as edit-translate does.

### Made-with-AI labels

- Each version made with your face or a presenter gets its own `AiMark` (kind avatar, person mine or presenter, voice premade, `lang`), so the editor shows "AI person" and "AI voice" and the caption ends with "This video uses an AI-made person or voice." once.
- A no-face version with a premade voice gets `AiMark` kind `voiceover`, voice premade, so it shows "AI voice" and the same line. `AiMark` has no `voiceover` kind yet; this adds it exactly as people-ai-labels specifies, and no other part of that item. A filmed version gets no line unless a dub is added (kind `dub`, which exists).
- The page shows "The person is made by AI." under a presenter pick, as the talking head does.
- Platform flags (TikTok's AI-generated label, Meta's AI info) through Zernio wait on people-ai-labels, phase 8.

## Done when

- [ ] On Leo's sign-in, an Instagram reel of 30 to 60 s with a talker, cutaways and on-screen text reads into a plan where every cut it lists sits within 0.5 s of a cut found by stepping through the reel, and each row's shot kind matches the frame (checked on 3 reels).
- [ ] The saved plan JSON contains no 4-word run from the reel's transcript or overlays (checked by `sharedRuns` on those 3).
- [ ] "Make my version" with a kept presenter gives a 15 s video in the editor with captions in the reel's look, its cutaways, labels and zooms within 0.3 s of their marked words, and the AI chips and line.
- [ ] The same plan with I'll film it lays the edit over an uploaded take, its cutaways, labels and zooms within 0.3 s of their marked words.
- [ ] An adviser brand's version shows Jev's MAS warning when its script promises a result, and a no-face version shows the "AI voice" chip and the AI line.
- [ ] A new-hook version remakes only the parts under the hook, and the network panel shows one Speak job.
- [ ] A Malay version shows its English meaning before the press and comes back with Malay captions and the same cutaways.
- [ ] Every press shows its price before it runs and asks once; over a cap the button is disabled with its reason; a failed Speak job gives the use back.
- [ ] A TikTok link, a reel with no words and a 2-minute reel each show their line and spend nothing.
- [ ] A reload during a make resumes at no cost, and the plan survives a reload and shows on a second device.
- [ ] Other sign-ins see no entry and get the not-found page at `/make/same-edit`.
- [ ] Checked at 390 px and 1440 px; `npm run build` and the full `npx vitest run` pass; the `remix-format-clone` item in `src/data/northStar.ts`, added there if it is still missing (it is not in the file on 25 Oct), is flipped with its `ours` line.

## Tests

- `src/lib/editPlan.test.ts`: `planFromRead` keeps beats in order, caps events at 40, and its JSON holds none of the fixture transcript's words; `compilePlan` puts each event in its EditSettings field and starts it at its marked word; a dropped marker uses the share fallback; `partsToRemake(version, change)` returns the parts under the hook, the parts under changed lines, or every part.
- `supabase/functions/remix/logic.test.ts`, `as: "edit"`: the validator refuses a missing, repeated or out-of-order marker, a line 30 percent over budget and a text 3 words over; the closeness check runs over the texts. `index.test.ts`: an `as: "edit"` make for a person brand asks the MAS question though it has a source.
- `supabase/functions/reel-visuals/logic.test.ts`: the edit request takes 24 frames and refuses 25; the prompt says no names, brands or handles; overlays keep their place. `index.test.ts`: mode `edit` answers 403 `not_enabled` outside `NORTH_STAR_USERS` and counts `edit-read`, not `reel-visuals`.
- `src/lib/reelStyle.test.ts`: the per-cut frame option takes one frame after each cut, at most 24.
- `supabase/functions/text-voice/logic.test.ts`: an alignment fixture becomes words whose times cover the audio.
- `supabase/functions/_shared/usageCaps.test.ts`: `edit-read` is 10; the price guard test passes.
- `src/lib/links.test.ts`: `links.makeFormat("same-edit", { source, who: "none" })` and `links.edit({ p, versions: true })` giving `/edit?p=<id>&versions=1`.

## Open questions

- Money, and the call on the card: a talking-head version runs Speak again, about US$1.42 for a new hook, US$2.75 for a new host and US$2.80 for a language on a 15 s video, while `ai-video` allows only 2 a day, the first version included. My recommendation is a new `edit-version` cap of 6 a day per adviser for Speak runs made from a plan, with every run still counted on `ai-video-global` 20 so the prepaid pool stays protected, but the spend is Leo's to approve.
- Money again: this spec allows 6 versions a press with one change each. Cross products like Higgsfield's 5 hooks x 5 products x 4 languages would come to about US$280 at the face prices, so I would keep one change each until a hook test shows that versions win.
- Seedance could perform the footage instead of Speak, which is the Hypit and Fastlane look: 8 s clips at US$1.64 (480p) or US$3.70 (720p) put a 24 s version at US$4.93 to US$11.10, with Seedance's own voice and no word times until the take is transcribed. I recommend staying on Speak for phase 7 and trying a single clip only when Leo asks for it.
- Swapping the face in Leo's own filmed take belongs to people-face-swap, which is waiting on a provider. Higgsfield's web app lists Genjutsu object swap and motion transfer at 71.5 credits (US$3.58) per 10 s, but nobody has confirmed its API offers them, so that item should check the model list before choosing, and make no paid call until Leo agrees.
- Meta Ad Library video ads are someone else's paid creative, and remix-closeness already left Close on ads for Leo to rule on; until he does, I would keep this to Instagram reels and uploads.
- A Chinese, Malay or Tamil version could post with warnings only, as edit-translate does, or wait for a second press. I would keep warnings only, the same as edit-translate.


## Leo's answers (25 Oct 2026)

- Cap: talking-head versions get their own cap of 6 a day (`edit-version`), so a day's worst case is about US$16.50, beside ai-video's 2 a day.

## Related

remix-teardown, remix-closeness, remix-variations, remix-fit-check, remix-source-trail, remix-your-brand, formats-talking-head, formats-faceless-video, edit-video, edit-captions, edit-translate, people-dub-lipsync, people-presenters, people-my-face, people-face-swap, people-ai-labels, business-cost-preview
