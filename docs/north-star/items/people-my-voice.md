# Your voice

`people-my-voice` | people | phase 4 | status: partial | /north-star#people-my-voice

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Leo's Fastlane recording shows no voice clone, and its public pages found by the research do not mention one (unverified).

The rest of the field clones from a short sample, and the careful ones take consent in the same recording:

- Descript: "Add speaker" > "Create speaker" > "Clone voice to enable AI speech". You read a consent statement aloud on the recording and press "Submit"; minutes later the clone can type new lines, fix a line without re-recording or voice a whole video. Limits: the statement has to be in English, clones are built on US English (accents may drift) and no samples can be added afterwards. ([custom speaker](https://help.descript.com/ai-speech/custom-speaker.md), [pricing](https://www.descript.com/pricing))
- InVideo: "Clone your voice" from a recording of at least 30 seconds, usable in several languages, with the speaker's permission and a stated verification step. Quota and cost are not published (unverified). ([page](https://invideo.io/tools/ai-voice-cloning/))
- Zebracat: "Upload Your Voice" (about a minute) > "Create Your AI Clone" > "Use It Anywhere", 170+ languages; Super Cat 5 clones a month, Unlimited Cat 10. ([page](https://www.zebracat.ai/features/ai-voice-cloning))
- OpusClip Agent Opus: clone from a sample of up to 30 seconds, about 40 languages. ([faq](https://help.opus.pro/agent-opus/article/ao-faq.md))
- VEED: one voice clone per workspace, 5,000 characters per generation, picked under "Voice Clone" in "AI Voice". ([help](https://support.veed.io/en/articles/11662445-how-to-use-text-to-speech))
- Kapwing: "Add new Voice" from a 1 to 5 minute sample, Business plan only; speech is 1 credit per 100 characters. ([voice-over](https://kapwing.com/ai/voice-over-generator), [credits](https://www.kapwing.com/help/how-do-kapwing-credits-work/))
- TopView.ai: Plus 5 free clones, Business 30, Ultra and Team 60, then 2 credits per clone. ([pricing](https://www.topview.ai/pricing))
- Revid.ai: clone or design a voice; its plans page puts cloning on Elite (US$89 a month), while its pricing page says Ultra, so the plan is unverified; speech is 10 credits per 500 characters. ([voices](https://www.revid.ai/llm/revid-ai-voices-and-languages.md), [plans](https://www.revid.ai/llm/revid-ai-pricing-plans.md), [pricing](https://revid.ai/pricing))
- CapCut: a custom voice comes from recording a few sentences, next to 200+ stock voices that include Chinese and Malay. ([text to speech](https://www.capcut.com/tools/text-to-speech))
- Hedra drives a character from a script, your own recording or an ElevenLabs Voice Clone, and allows "only voices you have rights to". ([page](https://www.hedra.com/uses/ai-ugc-video-generator))
- Captions (incl. Mirage) AI Echo: record or upload a voice memo of up to 1 minute and the avatar copies its tone, intonation and pronunciation. ([help](https://captions.ai/help/docs/project/ai-creator.md))

## What we have today

- Every AI voice is an ElevenLabs premade voice: seven in `supabase/functions/text-voice/logic.ts` `VOICES` (Alice, Lily, George, Eric, Matilda, Sarah, Liam) on `eleven_turbo_v2_5`. The comment above `VOICES` says the studio account is on the free ElevenLabs plan, which cannot use Voice Library voices through the API. The plan is still free: "Music for me" stays hidden in `src/lib/aiMusic.ts` because the free plan answers 402 `paid_plan_required` (commit 5dfafc3f). No clone is possible today.
- They are used by "Voiceover from text" and "Dub it" in `/edit` (`src/pages/VideoEditPage.tsx`), the explainer and "You speaking" (`src/components/AiVideo.tsx`), all under the `ai-voice` cap (10 a day). The editor's `VoicePicker` also sets a feeling and a pace (`EMOTIONS` and `PACES` in `text-voice/logic.ts`), sent as ElevenLabs `voice_settings`.
- `text-voice/index.ts` reads every request as JSON (`req.json()` on its first lines), and the function holds only `ELEVENLABS_API_KEY`.
- Your real voice is already usable in one place: "Record from the mic" in the editor's Voiceover row records over a video (`startVoice`, `getUserMedia` audio).
- "You speaking" cannot take your own recording. It only offers "Make the voiceover" with a premade voice, then slices that MP3 (`sliceVoiceover` in `src/lib/aiVideo.ts`) for Higgsfield Speak, which lip-syncs to any 24 kHz WAV slice it is given.
- `/voice` "Your voice" is the written voice profile for posts, which this item does not touch. The spoken voice gets the label "Your speaking voice" to keep them apart.
- So the status is partial: you can lay your own recorded voice over a filmed video, and nothing else.

## Build

Two steps. Step 1 needs no new spend and can ship first. Step 2 needs a paid ElevenLabs plan, which is Leo's decision (Open questions).

### Screens and states

Step 1, your own recording in "You speaking" (`src/components/AiVideo.tsx`, `Avatar`, shown for `leoOnly(email)`):

- The voice pills gain a first pill "My own voice". Picking it swaps "Make the voiceover" for two buttons, "Record it" (main) and "Upload audio" (outline, `accept="audio/*"`).
- While recording, the button reads "Stop, {m:ss}" and the script stays on screen to read from. A small new `src/lib/micRecorder.ts` records it with `getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}})` and the same mime list as `startVoice` in `VideoEditPage.tsx`; stop gives back one Blob and releases the mic. The editor keeps its own recorder, untouched.
- After recording or upload the clip goes through `sliceVoiceover` exactly like a premade voiceover (it decodes any audio the browser can, at 24 kHz mono), so the player, "{n} seconds in {k} parts. Costs N Higgsfield credits (about US$X)." and "Make the video" stay as they are.
- A recording over 30 s gets the existing message "It runs {n} seconds. Cut the script to about 30 seconds." A silent one (no 20 ms frame louder than RMS 0.01) gets "We couldn't hear anything. Record it again."
- No `ai-voice` use is taken, because nothing is generated.

Step 2, a clone of your voice, on `/people?tab=voice` (the page shell is built by people-my-face):

1. Empty: "Your speaking voice" with "Record a minute once. AI voiceovers, dubs and avatar videos can then sound like you." and the button "Record my voice".
2. Recording: the server code from `ai-video` mode `consent-code` (people-my-face) comes first, then the line and a passage to read. A 60 s target with a counter ("0:42 of about 1:00"), a level meter so a silent mic shows at once, and "Stop" once 45 s are in; it stops by itself at 120 s.
3. Checking, within 400 ms: "Checking your recording..." then "Hearing your code" and then "Making your voice, about a minute".
4. Done: "Your voice is ready", a play button with a sample line it made ("Here's how your AI voice sounds."), a chip "Verified {d MMM yyyy}", and buttons "Try it in a video" (main, `/edit?panel=ai&kind=avatar&voice=mine`), "Record again" and "Turn off my voice".
5. Refused:
   - code not heard
   - under 45 s of speech
   - over the daily cap
   - the account has no paid ElevenLabs plan ("Voice cloning isn't switched on yet.")
6. Failed: "Couldn't make your voice. Try again in a minute." keeps the recording in memory for "Try again".
7. Turned off: after a confirm dialog the voice is deleted at ElevenLabs and the tab shows "Your voice is off. Record again to turn it back on."

With a clone saved, every voice picker (`VoicePicker` in `VideoEditPage.tsx`, the pills in `AiVideo.tsx`) shows "My voice" first and preselected for Leo. "Dub it" in Chinese, Malay or Tamil can use it too (people-dub-lipsync).

### Copy

- Step 1: "My own voice" / "Record it" / "Upload audio" / "Stop, {m:ss}" / "We couldn't hear anything. Record it again."
- Tab label: "Your speaking voice"
- Empty: "Record a minute once. AI voiceovers, dubs and avatar videos can then sound like you." / "Record my voice"
- Line to read: "I'm {first name}. I agree that Content Studio can make a copy of my voice. My code is {code}."
- Passage (MAS-safe, no product or return; about 125 words, so with the line it runs close to a minute, where the first 83-word draft ran about 40 s and missed the 45 s floor): "Most people I meet want a plan they understand before they want any product, so I start with three questions. What are you saving for? When do you need it? And if you couldn't work for a year, what would happen to your family? Your answers tell us where to start, and they change as your life does: a new job, a wedding, a first home or a baby can move everything around at once. That's why I sit down with each client once a year. Sometimes we change nothing. If you have a question about your own situation, send me a message and I'll tell you honestly what I think, even when my answer is to wait a while before you do anything."
- Recorder: "Read the line, then the passage, in your normal voice." / "{m:ss} of about 1:00" / "Stop"
- Checking: "Checking your recording..." / "Hearing your code" / "Making your voice, about a minute"
- Done: "Your voice is ready" / "Here's how your AI voice sounds." / "Verified {d MMM yyyy}" / "Try it in a video" / "Record again" / "Turn off my voice"
- Refusals: "We didn't hear the code {code}. Read the line again, a little louder." / "We need about a minute of you talking. Record again and read the whole passage." / "Voice cloning isn't switched on yet." / the cap's "You've used all 2 for today. It resets at 8am Singapore time."
- Failed: "Couldn't make your voice. Try again in a minute."
- Turn off: "Turn off your voice? It's deleted from the voice service, and new voiceovers stop using it. Videos already made stay." / "Turn it off" / "Keep it"
- Picker: "My voice"

### Data

- Step 1 stores nothing new. The recording becomes the voiceover blob, as a made one does.
- Step 2: `content-studio-myvoice-${userId}`, keyed on the bare uid for the same reason as the face (a person's voice serves all their brands); `src/lib/myVoice.ts` holds load, save and turnOff.
  ```ts
  interface MyVoice {
    id: string;                     // "voice-<base36 time>"
    voiceToken: string;             // signFor(signing, uid, "voice:" + elevenLabsVoiceId), _shared/consent.ts
    consent: { at: string; line: string; heard: string; token: string };
    status: "on" | "off";
    history: { id: string; at: string; status: "on" | "off" | "replaced" }[];
  }
  ```
- `cs_user_data` rows are written by the browser, so the server never trusts a voice id from them. It opens `voiceToken` with `openSigned` for the caller's uid, which also stops one account from using another's voice. The ElevenLabs voice id is readable inside the token; it is useless without the studio's API key. `jobToken` cannot be used: it lowercases the id, and ElevenLabs ids are case-sensitive.
- Turning off writes `status: "off"` and a history row after the ElevenLabs delete succeeds. The sample audio is not kept anywhere by the studio.
- No schema change.

### AI and cost

- Step 1: no AI call besides Speak, which costs what it costs today (11 credits a 5 s slice, up to 88 credits, about US$5.50, for 30 s) under `ai-video` and `ai-video-global`.
- Step 2, `supabase/functions/text-voice`:
  - New mode clone: `POST text-voice?mode=clone&code=<code>&ticket=<ticket>` with the recording as the raw body, 24 kHz mono WAV (`encodeWav` from `src/lib/videoMedia.ts`), 45 to 120 s, at most 5.8 MB. A raw body keeps a 2-minute sample out of base64 JSON, as `video-assist ?mode=transcribe` does. Branch on `new URL(req.url).searchParams.get("mode")` before the `req.json()` line, the way video-assist does, or the JSON read eats the body. The server opens the ticket with `openSigned`, takes one `likeness-check` use, sends the first 15 s to Whisper (text-voice needs the `OPENAI_API_KEY` secret added) and checks `heardCode`, both helpers from `_shared/consent.ts` in people-my-face, before it takes one `voice-clone` use and calls `POST https://api.elevenlabs.io/v1/voices/add` (multipart: `name` "cs-{uid first 8}-{time}", `files` the WAV, `remove_background_noise` true) and replies with `{voiceToken, consent: {at, heard, token}}`.
  - New mode `{mode:"forget", voiceToken}`: `DELETE https://api.elevenlabs.io/v1/voices/{id}`.
  - The speech and dub requests accept `voice: "mine"` with `mine: voiceToken`. `parseVoiceRequest` and `parseDubRequest` grow that one option; `ttsUrl` and `dubUrl` take the opened id instead of `VOICES[voice].id`.
  - Every new mode, and `voice: "mine"`, refuses with 403 "Not switched on for this account yet." unless `leoOnly(user.email)`.
- Caps in `usageCaps.ts`: `"voice-clone": 2` (a clone made or made again) and `"likeness-check": 5` (shared with people-my-face). Speech in your voice counts on `ai-voice` like any voiceover.
- Cost: the clone itself is included in a paid ElevenLabs plan; speech uses the plan's character credits like the premade voices. The plan price and how many custom voices it holds are unverified; check elevenlabs.io/pricing before asking Leo. Whisper on a 60 s sample is about US$0.006.
- No Jev: the code match is a measurement, and nothing here picks between options.
- Price chip: "Record my voice" shows "Free with the voice plan"; voiceovers keep the uses-left line they show today.

### Deep links

- `/people?tab=voice`, and `/people?tab=voice&record=1` to open the recorder (push).
- `/edit?panel=ai&kind=avatar&voice=mine` preselects "My own voice" (step 1) or "My voice" (step 2). New param `voice`: `mine` or a premade voice id, replace.
- Builders in `src/lib/links.ts` (`people`, `voice` on `edit`) and rows in `docs/deep-links.md`.

## Done when

- [ ] Step 1: Leo records the script in "You speaking", makes the video, and the avatar's lips follow his recording; no `ai-voice` use is taken.
- [ ] Step 1: other accounts see the voice pills exactly as before.
- [ ] Step 2 (after Leo approves the plan): a 60 s recording with the code makes a voice, and "Try it in a video" speaks a script in it.
- [ ] Step 2: a recording without the code, or under 45 s, is refused before ElevenLabs is called.
- [ ] Step 2: a forged `voiceToken` or another account's token is refused by text-voice.
- [ ] Step 2: "Turn off my voice" deletes it at ElevenLabs and keeps the key with `status: "off"`.
- [ ] Caps added; checked by eye at 390 px and 1440 px; `npm run build` and the full `npx vitest run` pass.
- [ ] `src/data/northStar.ts` item `people-my-voice` flipped with its `ours` line, in the same commit.

## Tests

- `src/lib/micRecorder.test.ts`: the recorder hands back one blob after stop and releases the mic tracks.
- `AiVideo` test: picking "My own voice" hides "Make the voiceover" and shows "Record it" and "Upload audio"; a 31 s upload shows the too-long message and disables "Make the video".
- `text-voice/logic.test.ts`: `parseVoiceRequest` accepts `voice: "mine"` only with a token; `parseCloneRequest` refuses a body that is not RIFF WAV, a WAV under 45 s or over 120 s, and a missing ticket; a voice id with capitals survives `signFor` and `openSigned` unchanged.
- `text-voice/index.test.ts`: a token signed for another uid is refused; a caller outside `LEO_EMAILS` gets 403; when ElevenLabs answers that cloning needs a paid plan, the reply is "Voice cloning isn't switched on yet." and the cap use is given back.
- `src/lib/myVoice.test.ts`: turnOff keeps the key and writes a history row; load returns null when off.

## Open questions

- Leo: upgrade the ElevenLabs account to a paid plan for step 2. It is a new monthly cost, and the price is unverified. The same upgrade would also let "Music for me" be shown (hidden in `src/lib/aiMusic.ts` until then) and open the Voice Library's Singaporean voices.
- Leo: should step 1 ("My own voice") turn on for everyone? It costs nothing extra and keeps advisers in their real voice.
- Whether the clone should be preselected in "Voiceover from text" for Leo or only listed first; this spec preselects it, and either way is a one-line change.

## Related

people-my-face, people-dub-lipsync, people-ai-labels, formats-talking-head, formats-faceless-video, edit-video, edit-translate, brand-voice-memory
