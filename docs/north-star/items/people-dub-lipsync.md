# Fix a line, speak another language

`people-dub-lipsync` | people | phase 4 | status: partial | /north-star#people-dub-lipsync

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Leo's Fastlane recording shows no dubbing, line fixing or eye contact tool, and the research found none on its public pages.

Fix one line without a reshoot:
- Riverside VideoDub: fix a typo or rewrite a line in the transcript, and the audio for that line is made again in the same voice with lip sync (plan and credits unverified). An adviser would use it to swap out one phrase compliance flagged, with no reshoot. ([ai](https://riverside.com/ai))
- Descript Regenerate: highlight a section and press "Regenerate", which by default remakes "Audio & video" (the visual performance too) or only "Audio only". Changing what was said needs an authorised custom AI speaker, it works in English only, and it asks for consent the first time video is regenerated. ([help](https://help.descript.com/script-editing/regenerate-overview.md))
- VEED personal avatars: edit the script and only the changed sections are made again. ([blog](https://veed.io/blog/introducing-personal-avatars-by-veed))

Dub into another language with lip sync:
- HeyGen video translation takes an uploaded file or a YouTube link and gives voice cloning and lip sync in 175+ languages with a brand glossary, plus translation proofreading on Pro. ([home](https://www.heygen.com/), [pricing](https://www.heygen.com/pricing))
- Captions (incl. Mirage) Lipdub: All Tools > "Lipdub" > "Import Video", confirm the original language, choose a target and generate; "Add more" adds languages and "Export All" saves them. About 31 targets, Chinese (Simplified and Traditional) and Tamil among them. ([help](https://captions.ai/help/docs/captions/lipdub.md))
- VEED AI Dubbing has lipsync as a beta toggle, 6 hours a year on Pro, and a lipsync run that can take hours and drops to 1080p; on Enterprise you upload a transcript and "Proofread" it before dubbing, which is the control a regulated adviser needs. ([help](https://support.veed.io/en/articles/10406623-how-to-use-the-ai-dubbing-tool))
- Kapwing: dubbing about 10 credits per 30 s, lip sync 30 credits a minute on Pro or Business, voice cloned from the speaker only on Business. ([faq](https://www.kapwing.com/help/dubbing-faqs/), [credits](https://www.kapwing.com/help/how-do-kapwing-credits-work/))
- Klap dubs 29 languages with lip sync on by default, and a review notes visible drift in Asian languages. ([review](https://kompozy.io/reviews/klap))
- Arcads translates into 30+ languages with lip sync for 240 credits. ([credits](https://help.arcads.ai/en/articles/13725589-how-are-credits-counted))
- OpusClip dubs 25 languages at 10 credits a minute, cloning the voice from the source, with no lip sync mentioned. ([help](https://help.opus.pro/docs/article/video-dubbing.md))
- Descript: AI Tools > Repurpose > "Translate", tick "Dub speech", give each speaker a stock voice and turn on "Lip sync" if wanted; each language becomes its own composition. Dubbing covers 30 languages, lip sync is on Creator and above, and proofreading the translation is Business and Enterprise only. ([dubbing](https://help.descript.com/repurpose/dubbing.md), [pricing](https://www.descript.com/pricing))
- Riverside AI Translation: 30+ languages with lip sync on or off, voices cloned for up to 4 speakers, under 60 minutes of input and about 20 minutes of processing per minute of video; Business plan only. ([translation](https://riverside.com/ai-translation), [pricing](https://riverside.com/pricing))
- Zebracat translates an uploaded video into 25+ languages with lip sync on Super Cat and above, and InVideo's avatars speak 50+ languages with lip sync (credits not published). ([Zebracat](https://www.zebracat.ai/features/ai-automated-video-editing), [InVideo](https://invideo.io/make/ai-avatar-generator/))

Eye contact:
- Captions (incl. Mirage) "Eye Contact" finds gaze breaks and re-aims the eyes at the lens while keeping blinks, on iOS and desktop only. ([help](https://captions.ai/help/docs/visual/eye-contact.md))
- Descript "Eye Contact" under Effects handles one face and skips turned heads. ([help](https://help.descript.com/effects-animations-transitions/eye-contact.md))
- Riverside adjusts the gaze to the camera even while you read a script, on Pro and above. ([ai](https://riverside.com/ai), [pricing](https://riverside.com/pricing))
- VEED gives one free use; Kapwing charges 30 credits a minute on Pro. ([VEED](https://support.veed.io/en/articles/11172032-eye-contact), [Kapwing](https://www.kapwing.com/tools/adjust/eye-contact))
- OpusClip lists eye contact correction on Pro; how it works in the editor is unverified. ([pricing](https://www.opus.pro/pricing))
- Submagic lists "AI eye contact correction"; the plan it needs is unclear (unverified). ([feature](https://www.submagic.co/features/ai-eye-contact))

## What we have today

- "Dub it" in `/edit` (`src/pages/VideoEditPage.tsx`, Voiceover row): Chinese, Malay or Tamil (`DUB_LANGS` in `supabase/functions/text-voice/logic.ts`). The kept caption lines are translated (`video-assist` mode `translate`, cap `video-translate` 30), spoken in one premade ElevenLabs voice (`text-voice` mode `dub`, `eleven_turbo_v2_5` with `language_code`, speed 1.15, cap `ai-voice`), and each line is laid where the original started (`dubPlacement` in `src/lib/videoEdit.ts`, `layDub` in `src/lib/videoMedia.ts`). The dub becomes the project's voiceover with `volume: 0`, so the filmed sound is muted and Undo brings it back. There is no lip sync, and the voice is not the speaker's.
- Captions can be translated into zh, ms and ta without dubbing.
- The Words tab fixes caption spelling and cuts words, but has no way to change what is said.
- "You speaking" makes avatar videos as up to 4 Speak slices of at most 9.5 s, cut at quiet moments (`sliceVoiceover`). `finishAvatar` in `src/lib/aiVideo.ts` downloads the slice clips, joins them on the device (`startJoin`) and keeps none of them, and nothing records which words each slice holds. One wrong line means making the whole video again (up to 88 Higgsfield credits, about US$5.50).
- The avatar's voiceover comes from `speak()` (`src/lib/textVoice.ts`), text-voice's plain MP3 answer with no word times. Only the dub path asks ElevenLabs `with-timestamps` (`dubUrl`).
- Compliance today is `scanCompliance` in `src/lib/compliance.ts`: "warn" flags show amber, "error" flags red, and nothing blocks.
- The editor's "Touch-up" (`settings.touchUp`, "Skin and eye touch-up" on the start screen) smooths skin and brightens eyes; nothing moves the gaze.
- No lip-sync model for filmed footage is wired in, and none is in the Higgsfield platform routes this repo uses.

## Build

Three parts that need no new vendor, then two that do. Parts A and B run on what is paid for today. Part C needs a cloned voice, so it waits for people-my-voice step 2 and the paid ElevenLabs plan Leo has not approved yet.

Part A, fix a line in an AI avatar video. Keep each Speak slice and the words it holds, so a changed line remakes only its slices.

Part B, dub an AI avatar video into Chinese, Malay or Tamil with real lip sync. Translate the script, speak it in the language, and run Speak again on the same face; the lips follow the new audio because Speak animates from it.

Part C, fix a line in a filmed video. Re-voice the selected words in your cloned voice (people-my-voice) and cover the picture over them with a B-roll cutaway, so no lip sync is needed.

Parts D and E need Leo: lip sync on filmed footage, and an eye contact fix. Neither has a provider in the repo.

### Screens and states

Part A, in `/edit` for a project made by "You speaking" (`VideoProject.ai.kind === "avatar"`, Leo only), a "Script" card above the timeline:

```
Script                                        [ Fix a line ]
Most people don't need more products.   0:00-0:08
They need a plan they understand.       0:08-0:17  <- edited
...
Remakes 1 part of 3. About 22 credits (US$1.38).   [ Remake changed parts ]
```

1. Idle: the script split into its slices with times. Editing a slice's words marks it "edited". The card shows only when the video's face is saved (`ai.person` "mine" or a saved presenter), since a one-off photo is not kept to run Speak on again.
2. Ready: "Remakes {k} part(s) of {n}. About {credits} credits (US${x})." The voiceover for changed slices is made first and played back before anything is paid.
3. Making: "Remaking part {i} of {k}..." The job runs outside React and resumes after a reload.
4. Done: the new slices replace the old ones in the joined video, captions are redone for them, and Undo puts the old video back (the old slices stay on the device until the project is deleted). Toast: "Line fixed. Undo brings the old one back."
5. Refused: a slice that grows past 9.5 s ("That line runs {n}s. Keep each part under 9.5 seconds, or split it."), over the `ai-video` cap.
6. Flagged: `scanCompliance` runs on the new words before anything is paid. A flag shows its chip under the line; an "error" flag also turns the button into "Make it anyway" with the line "Check the flagged words first." It warns and does not block, per the recommendation; blocking is a team leader's switch that belongs with trust-compliance-check.
7. Failed: "Couldn't remake that part. Try again." with the uses given back and the old video left in place.

Part B, the same card's menu "Make it in another language" > Chinese, Malay or Tamil:
1. Translating: "Translating..." through the existing `translate` mode. `scanCompliance` has English rules only, so it runs on the English lines before they are translated, and any flag stays on its English line in the review.
2. Review: the translated lines are shown next to the English and can be edited, with the line "Check the {language} before it's made. It costs about {credits} credits (US${x})." and the button "Make the {language} video". This is the proofread step VEED keeps for enterprise.
3. Making: the voiceover in the language (the clone from people-my-voice when saved, otherwise the voice the video used) is sliced again and Speak runs per slice on the same face. The result is saved as a new project called "{name} ({language})".
4. Done: the toast "Your {language} video is ready." carries the action "Open it".
5. Refused or failed: same as part A, plus "Translate it first." when there is nothing to make.

Part C, in the Words tab, a third mode "Say it again" (`mode=say`, Leo only) beside "Fix spelling" (`fix`) and "Cut words" (`cut`). The existing `fix` mode stays a spelling fix.
1. Tap the first and last word to replace, as "Cut words" does; a bar shows "Say it again".
2. Type the new words; the bar shows "Your voice says it. A cutaway covers your mouth." and "Make it".
3. Making: "Making your line..." (TTS in the clone, then a cutaway picked by the existing `broll` logic for that span, or a punch-in when nothing fits).
4. Done: the old words are cut, the new audio and cutaway are laid in, Undo restores. Toast: "Line replaced."
5. Refused: no saved voice ("Save your voice first, so the new line sounds like you." linking to `/people?tab=voice`), a new line over 15 s ("Keep the new line under 15 seconds.").
6. Flagged: as in part A, a compliance "error" flag asks for "Make it anyway" and does not block.

The existing "Dub it" stays as it is for everyone.

### Copy

- Part A: "Script" / "Fix a line" / "edited" / "Remakes {k} part of {n}." / "Remakes {k} parts of {n}." / "About {credits} credits (US${x})." / "Remake changed parts" / "Remaking part {i} of {k}..." / "Line fixed. Undo brings the old one back." / "That line runs {n}s. Keep each part under 9.5 seconds, or split it." / "Check the flagged words first." / "Make it anyway" / "Couldn't remake that part. Try again." / "The parts are on the device you made it on."
- Part B: "Make it in another language" / "Chinese" / "Malay" / "Tamil" / "Translating..." / "Check the {language} before it's made. It costs about {credits} credits (US${x})." / "Make the {language} video" / "Your {language} video is ready." / "Open it" / "Translate it first."
- Part C: "Say it again" / "Your voice says it. A cutaway covers your mouth." / "Make it" / "Making your line..." / "Line replaced." / "Save your voice first, so the new line sounds like you." / "Keep the new line under 15 seconds."

### Data

- `VideoProject` (`src/lib/videoProjects.ts`, synced in `content-studio-videoprojects-<scoped>`) uses the shared `ai` field that people-ai-labels defines (`kind: "avatar"`, `person`, `who`, `voice`, `madeAt`). This item adds three optional fields to it:
  ```ts
  voiceId?: VoiceId;                    // the premade voice used, so a remade slice sounds the same; absent for "mine"
  lang?: "en" | "zh" | "ms" | "ta";
  slices?: { text: string; start: number; end: number; clip: string }[]; // clip = deviceFiles key "ai-slice-<project>-<i>-<v>"
  ```
  `finishAvatar` saves each downloaded slice with `putFile` before the join and hands `ai` to the new project through `JoinExtra` (people-ai-labels).
- Slice clips and the slice voiceovers stay on the device in IndexedDB, like every video file. On another device "Fix a line" shows "The parts are on the device you made it on."
- Each slice's words: for a premade voice, text-voice's speech request takes a new option `timestamps: true` (Leo only) that answers `{audio, alignment}` from `with-timestamps`, as the dub mode does, and slice edges map to characters. For a recorded voice (people-my-voice step 1) one `video-assist ?mode=transcribe` call gives the word times. None of this needs a schema change.

### AI and cost

- Part A: Speak per changed slice, 11 Higgsfield credits a slice up to 4.5 s and 22 above (US$0.69 or US$1.38), against up to 88 credits for a full remake. One `ai-video` use per remake, whatever the number of slices, plus one `ai-voice` use for the new voiceover.
- Part B: one `video-translate` use, one `ai-voice` use and one `ai-video` use; Speak costs what a new avatar video costs (up to 88 credits for 30 s). Chinese, Malay and Tamil run through `eleven_turbo_v2_5` today; check each in the clone before turning part B on, since a cloned voice in another language is unverified for quality.
- Part C: one `ai-voice` use; the cutaway uses the existing `broll-picks` cap and Pexels (free).
- Jev: part C reuses the B-roll Jev questions already in `video-assist/broll.ts`. Nothing new is judged.
- Compliance: the new words run through `scanCompliance` before anything is paid. Every flag warns; an "error" flag asks for a second press ("Make it anyway").
- No new caps; all three parts use `ai-video`, `ai-voice`, `video-translate` and `broll-picks` as they stand.
- Parts D and E: no cost until a provider is chosen.

### Deep links

- `/edit?p=<project>&script=1` opens the Script card (part A) (new param `script`, push).
- `/edit?p=<project>&script=1&lang=zh` opens part B's review for Chinese (`lang`: zh, ms, ta; replace).
- `/edit?p=<project>&tab=words&mode=say` opens part C (a new value of the existing `mode` param, replace; `fix` and `cut` keep their meaning).
- `src/lib/links.ts` `edit` builder gets `script`, `lang` and `mode: "say"`; `docs/deep-links.md` gets the rows.

## Done when

- [ ] Leo edits one line of a 3-part avatar video, sees "Remakes 1 part of 3" with its price, and the remade video differs only in that part.
- [ ] Undo after a fix brings back the old video.
- [ ] Leo makes a Chinese version of an avatar video, edits one translated line first, and the lips in the new video follow the Chinese audio.
- [ ] With a saved voice, Leo replaces three words in a filmed video; the new words are in his voice over a cutaway.
- [ ] A compliance "error" flag on the new words shows its chip and needs "Make it anyway" before the paid call.
- [ ] Other accounts see `/edit` and "Dub it" exactly as before.
- [ ] Checked by eye at 390 px and 1440 px; `npm run build` and the full `npx vitest run` pass.
- [ ] `src/data/northStar.ts` item `people-dub-lipsync` flipped with its `ours` line, in the same commit.

## Tests

- `src/lib/aiVideo.test.ts`: slice edges map to the right words from a `with-timestamps` alignment; `changedSlices` finds only the edited slice; a slice over 9.5 s after an edit is refused.
- `src/lib/videoEdit.test.ts`: replacing slice 2 of 3 keeps slices 1 and 3 at their times.
- `text-voice/logic.test.ts`: `parseVoiceRequest` keeps `timestamps: true` and the URL becomes `with-timestamps`; without it the request is as before; the dub body still works as before.
- A `VideoEditPage` test: "Say it again" without a saved voice shows the save-your-voice message and makes no call; `mode=say` is ignored (falls back to `fix`) for a non-Leo email.

## Open questions

- Leo: lip sync for filmed footage (part D) needs a video lip-sync provider. None is wired; check whether Higgsfield offers one on this account (unverified) before any new vendor.
- Leo: eye contact (part E) also needs a provider; none is wired, and a home-made gaze fix on the device would be a large build.
- Should "Dub it" on filmed videos use your cloned voice once it exists? This spec leaves "Dub it" alone; turning it on is a one-line change in the voice picker.
- How long to keep old slice clips for Undo on the device; this spec keeps them until the project is deleted, which costs device space on long projects.
- The first draft blocked a paid remake on a red compliance flag. The recommendation says compliance warns by default and a team leader can switch a rule to block; this spec warns with a second press, and Leo can ask for the block instead.

## Related

people-my-voice, people-my-face, people-ai-labels, edit-video, edit-translate, edit-captions, trust-compliance-check, formats-talking-head
