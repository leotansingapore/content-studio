# Your face, saved once

`people-my-face` | people | phase 4 | status: missing | /north-star#people-my-face

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane has no saved face of your own. Its AI influencer generator casts stock characters ("the same face fronts every video"), and Kompozy's review says you can only pick from its stock faces ([Fastlane](https://usefastlane.ai/tools/ai-influencer-generator), [Kompozy](https://kompozy.io/reviews/fastlane)). The Library's Media row in Leo's account holds two uploaded face photos, kept as plain media with no consent step or label; who they show and how they got there is not known.

![Fastlane Library, Media row with two face photos](../research/fastlane-pdf/lib-tile-00.webp)

The tools that do offer your own face all ask for a short recording with a spoken or on-camera consent check, and then reuse that face in every video:

- HeyGen Avatar V: record a 15-second webcam clip speaking naturally; it trains one twin with wide, medium and close-up angles from that one recording, lip sync in 175+ languages. Custom avatars: Free 1, Business 5+, Enterprise 10+. Custom avatars need on-camera identity verification from the person shown. ([avatar-v](https://www.heygen.com/avatars/avatar-v), [pricing](https://www.heygen.com/pricing), [home](https://www.heygen.com/))
- Captions (incl. Mirage): "Record yourself" reading a provided script (about 10 s for Mirage Avatar X), upload a selfie, or since Aug 2026 an existing video. "Avatar Looks" saves reusable looks. Max plan: up to 30 twins. Making a twin is iOS and desktop only. ([feature](https://www.captions.ai/features/create-ai-twin), [plans](https://captions.ai/help/docs/subscriptions.md), [availability](https://captions.ai/help/docs/feature-availability.md))
- InVideo AI Twins: Express avatar from a YouTube link or a short upload (60 s on one page, 30 s on another), built in under 5 minutes; Pro avatar from 30+ minutes, 200 credits. You read an on-screen consent code in English on camera; an upload without it is rejected with a prompt to record again. ([help](https://help.invideo.io/en/articles/11388821-how-to-create-an-avatar-by-recording-or-uploading-a-video), [page](https://invideo.io/make/ai-avatar-generator/))
- VEED personal avatar: about 2 minutes on webcam or phone reading a teleprompter, with consent and voice identification built into the recording; ready within a few hours; after a script edit only the changed sections are made again, on a model built with Tavus. Plan: Enterprise per the help center (unverified for current plans). ([blog](https://veed.io/blog/introducing-personal-avatars-by-veed))
- Arcads: one continuous take of at least 2 minutes (2.5 recommended), face fully visible; PRO plan only; 1,600 credits per video. ([help](https://help.arcads.ai/en/articles/13239662-how-to-clone-yourself-into-a-talking-actor))
- CapCut: upload a personal video of 10 seconds to 5 minutes to make a custom avatar; credit cost not published. ([resource](https://www.capcut.com/resource/ai-talking-video))
- Riverside AI Twin: "Smart references" picks a clear reference from recordings you already made; plan and consent flow unverified. ([page](https://riverside.com/ai-twin))
- MakeUGC: custom avatars Starter 0, Growth 1, Pro 3. ([pricing](https://www.makeugc.ai/pricing))

## What we have today

- `/edit?panel=ai&kind=avatar`, "Who speaks" (`src/components/AiVideo.tsx`, `Avatar`): pills "My photo" and "AI presenter". "My photo" takes any picked file for that one video, with the line "Use a photo of yourself, or of someone who agreed to it." Nothing is kept; the next video asks again.
- `supabase/functions/ai-video` mode `avatar`: a photo as `{url}` or `{jpeg}` (base64 up to 2.8M characters, resized to 1280 px by `toJpeg` in `src/lib/aiVideo.ts`), Higgsfield Speak (`v1/speak/higgsfield`, quality mid) per slice of the voiceover. 11 credits a 5 s slice, 22 a 10 s slice, 1 credit = US$0.0625, up to 4 slices and 30 s (88 credits, about US$5.50). Caps `ai-video` 2 and `ai-video-global` 20, both given back when Higgsfield fails the job.
- Template clips with a person photo role send it as the first frame (`SEEDANCE_FRAME`, `ai-video/logic.ts`).
- Brand kit headshot (`/brand`): a 256x256 JPEG data URL in `content-studio-carousel-brand-<scoped>` for carousel footers and the video end card. Too small for Speak and not offered by the avatar.
- `src/lib/faceVision.ts` finds faces on the device (MediaPipe BlazeFace full range, confidence 0.5): `findFaceBox` and `biggestFaces`. Both keep only the biggest face in each picture, so neither can say "one face and no other". The private `faceDetector()` inside them sees every face, and `findFaceTrack` already keeps up to 3 faces per look (at least `MIN_FACE`, 0.045 of the frame width, `src/lib/speakers.ts`) for the speaker crop, so a counting helper is a few lines.
- `makeAvatar(name, photo, voice)` in `src/lib/aiVideo.ts` already takes a Blob or an https link, so a saved face goes in as a Blob made from its data URL.
- `src/lib/coverFrame.ts` already scores frames for sharpness (`sharpness`, the variance of the Laplacian inside the face box) and picks the best (`bestCover`).
- `src/lib/videoMedia.ts` `extractWav` turns any recording into 16 kHz mono WAV, and `stills` cuts frames from a video blob.
- `video-assist` mode `transcribe` (Whisper) under the `video-transcribe` cap; `ai-video` already holds `OPENAI_API_KEY`.
- Signed tokens: `jobToken` and `openJobToken` in `supabase/functions/ai-image/logic.ts` sign a Higgsfield job id for one uid. They lowercase the id, carry it in clear and only open UUIDs, so they cannot carry a consent record. `hmacHex` in the same file is not exported.
- No consent record, no verification, no saved face. `research/current-app.md`: "Saved digital twin / persistent avatar: missing".
- Higgsfield: Soul standard on the platform API takes `custom_reference_id` (the higgsfield MCP's official model list, checked again 20 Oct 2026). How to train that reference through the platform API is unverified; the `higgsfield-soul-id` skill trains one through the CLI and says it needs a paid plan (Basic or above).

## Build

This build saves one verified face photo and makes every AI video start from it. A trained twin that can be put in new settings and outfits (a Soul character) is a later step and needs Leo (Open questions).

It also builds the shared page for the people items: `/people`, "Faces and voices". Tabs in the URL: `face` (default), `voice` (people-my-voice), `presenters` (people-presenters), `labels` (people-ai-labels). Tabs a later item has not built yet are left out of the tab row.

### Screens and states

Page: `src/pages/PeoplePage.tsx`, route `/people` in `src/App.tsx`, nav entry in the Playbook section of `src/lib/nav.ts` after "Brand kit": `{ to: "/people", label: "Faces and voices", owners: LEO_EMAILS }`. The page renders `NotFoundPage` unless `leoOnly(email)`, as `NorthStarPage` does.

Face tab, one main button per state:

1. Empty
   ```
   Your face
   Record 10 seconds once. Your AI videos start from it after that.
   [ Record my face ]
   ```
2. Getting ready: while the browser asks for the camera, the page fetches a code from the server (mode `consent-code`) and then shows the live preview with a face guide, the line to read in large type and the button "Start recording" (phones use the front camera, `facingMode: "user"`). The code is shown with spaces ("4 8 2 1") so it is read one digit at a time.
3. Recording: a 10 s countdown ("Recording, 7s left") and a "Stop" button; the recorder (MediaRecorder, video and audio) stops by itself at 12 s.
4. Finding your face, on the device, shown within 400 ms of Stop: "Finding your face". 12 frames are drawn to canvases the way `findCoverFrame` in `coverFrame.ts` does, the new `facesIn` counts faces in each, and the three sharpest frames with one face (`sharpness`) are cut to 9:16 around it. No server call yet.
5. Pick a photo: the three frames, the sharpest first and preselected, under "Pick the photo your videos start from." and above the button "Save my face".
6. Saving: "Hearing your code". The audio (`extractWav`, 16 kHz mono) and the picked photo go to `ai-video` mode `consent`; the server runs Whisper, matches the code and signs the photo's hash.
7. Done: the photo with a chip "Verified 19 Oct 2026", the line "Used in: You speaking, template clips with a person." and three buttons, "Make a video" (main, opens `/edit?panel=ai&kind=avatar&face=mine`), "Record again" (outline) and "Turn off my face" (ghost). A toast says "Your face is saved."
8. Refused, each with "Record again" (a fresh code):
   - no face, or more than one face (step 4, before any server call)
   - code not heard (step 6)
   - the camera is blocked or missing
   - over the daily cap
9. Failed (network or Whisper down): the recording and the picked photo stay in memory; "Try again" sends them with the same code (the ticket holds for the UTC day).
10. Turned off: after the confirm dialog the tab goes back to the empty state with the line "Your face is off. Record again to turn it back on."

In `src/components/AiVideo.tsx`, `Avatar`, only when `leoOnly(email)`:
- "Who speaks" becomes "My face" (preselected when a face is on), then "AI presenter". The free "My photo" upload is hidden for Leo; it stays for everyone else until Leo turns this on for everyone.
- "My face" with no face saved shows "Save your face first" linking to `/people?tab=face&record=1`.
- In the template form, a template with a person photo role gets a button "Use my face" beside "Photo of the person".

### Copy

- Tab label: "Your face"
- Empty: "Record 10 seconds once. Your AI videos start from it after that." / button "Record my face"
- Line to read: "I'm {first name}. I agree that Content Studio can make videos of my face. My code is {d d d d}." ({first name} is the first word of the brand kit `name`; with no name the line opens "I'm the person on camera.")
- Recorder: "Look at the camera and read the line." / "Start recording" / "Recording, {n}s left" / "Stop"
- Checking: "Finding your face" / "Hearing your code"
- Pick: "Pick the photo your videos start from." / "Save my face" with the price chip "Under US$0.01" (the Whisper check)
- Done: "Verified {d MMM yyyy}" / "Used in: You speaking, template clips with a person." / "Make a video" / "Record again" / "Turn off my face"
- Toast: "Your face is saved."
- Code refused: "We didn't hear the code {code}. Read the line again, a little louder."
- Face refused: "We need one face, looking at the camera, in good light."
- Camera blocked: "Your camera is blocked. Allow it in the address bar, then try again."
- No camera: "No camera found. Open this page on your phone to record." with a Copy link button.
- Over cap: the server's "You've used all 5 for today. It resets at 8am Singapore time."
- Failed: "Couldn't check the recording. Try again in a minute." / "Try again"
- Turn off dialog: "Turn off your face? AI videos stop using it. Videos already made stay as they are." / "Turn it off" / "Keep it"
- Off: "Your face is off. Record again to turn it back on."
- AiVideo: pill "My face"; hint "Save your face first"; template button "Use my face"

### Data

- `content-studio-myface-${userId}`, keyed on the bare uid because a face belongs to the person and every brand of the account uses it; `cloudSync` mirrors it like any other `content-studio-` key, and a new file `src/lib/myFace.ts` holds load, save and turnOff.
  ```ts
  interface MyFace {
    id: string;                 // "face-<base36 time>"
    photo: string;              // 9:16 JPEG data URL, at most 720x1280; quality steps 0.85, 0.75, 0.65 until under MAX_IMAGE_CHARS (350_000, src/lib/carousel.ts); "" once turned off
    photoHash: string;          // sha256 hex of the JPEG bytes, worked out by the server
    consent: { at: string; line: string; heard: string; token: string }; // token from ai-video mode consent
    status: "on" | "off";
    history: { id: string; at: string; status: "on" | "off" | "replaced"; photoHash: string }[]; // append only, newest 20 kept
  }
  ```
- Turning off writes `status: "off"`, a history row and `photo: ""`. The record (hash, consent, history) stays, so the ledger in people-ai-labels never depends on a deletion, and the face itself is no longer synced. Never delete the key (no tombstones in cloudSync).
- The video recording never leaves the device and is dropped after the check. The audio and the picked photo go to `ai-video` for the check and are not stored there. The photo goes to Higgsfield when a video is made, as today.
- No schema change and no storage bucket.

### AI and cost

- New `supabase/functions/_shared/consent.ts`, no Deno or npm imports so vitest covers it, shared by people-my-voice and people-face-swap:
  - `signFor(secret, uid, text)` returns `<base64url(text)>.<hmacHex(secret, uid + ":" + text)>`; `openSigned(secret, uid, token)` returns the text, or null when the token was made for another uid or altered (constant-time compare). Export `hmacHex` from `ai-image/logic.ts` for it. `jobToken` is not used here because it lowercases, and `openJobToken` opens UUIDs only.
  - `newCode()`: 4 digits from `crypto.getRandomValues`.
  - `heardCode(transcript, code)`: strips commas, dots and hyphens, reads numerals and the words zero to nine ("four eight two one" and "4,821" both read as 4821), and passes when the 4 digits appear in order.
- `supabase/functions/ai-video`, two new modes in `logic.ts` (parse) and `index.ts`, signed with the `tokenSecret` the function already derives:
  - `{mode:"consent-code"}` returns `{code, ticket}` with `ticket = signFor(signing, uid, "consent:" + code + ":" + day)` (UTC day, as the caps keep it). Free, no cap.
  - `{mode:"consent", kind:"face", wav, code, ticket, photo}`: `wav` is base64 16 kHz mono WAV of at most 15 s (about 640,000 characters), `photo` the picked JPEG in base64 under 350,000 characters. Opens the ticket for this uid and day, takes one `likeness-check` use, runs Whisper (`whisper-1`, language `en`, with `OPENAI_API_KEY`) and checks `heardCode`. It hashes the photo itself (sha256) and answers `{ok, heard, photoHash, token}`, where `token = signFor(signing, uid, "likeness:face:" + photoHash + ":" + at)`. A Whisper failure gives the use back.
  - Place both after `signing` is derived in `index.ts`. That line runs after the Higgsfield key check, and `parseVideoRequest` runs before sign-in, so each new mode needs its own `case` in the parser and reads `userData.user.email` for the gate.
  - Both refuse with 403 "Not switched on for this account yet." unless `leoOnly(user.email)`. Move `LEO_EMAILS` and `leoOnly` to `supabase/functions/_shared/leoOnly.ts` and re-export them from `src/lib/leoOnly.ts`, the way `src/lib/aiVideo.ts` imports from `ai-video/logic.ts`.
- New cap in `supabase/functions/_shared/usageCaps.ts`: `"likeness-check": 5` with the comment "A face or voice consent recording checked by Whisper (ai-video consent, text-voice clone), about US$0.002 each."
- No Jev here, because hearing a code and counting faces are measurements.
- The face check runs on the device and costs nothing. Add `facesIn(pictures: HTMLCanvasElement[]): FaceBox[][]` beside `biggestFaces` in `faceVision.ts` (same detector, every face at least `MIN_FACE` wide from `src/lib/speakers.ts`). Pass when exactly one face shows in at least 9 of 12 frames and its box is at least 20% of the frame height.
- Videos made with the saved face cost what they cost today, and keep the existing price line "Costs N Higgsfield credits (about US$X)" on "Make the video".

### Deep links

- `/people` (tab face is the default and left out), `/people?tab=face&record=1` opens the recorder (push).
- `/edit?panel=ai&kind=avatar&face=mine` preselects "My face". New param `face`: `mine` or a presenter id (people-presenters), replace.
- Builders in `src/lib/links.ts`: `people({tab, record, presenter})` and `face` on `edit`. Rows in `docs/deep-links.md` for `/people` (tab, record) and `/edit` (face). Add "face", "voice", "presenter", "faces and voices" to the jump-to words in `src/lib/jumpTo.ts`.

## Done when

- [ ] `/people` shows for Leo's two sign-ins only, from the Playbook tabs and Jump to; a typed URL on another account shows the 404 page.
- [ ] A 10 s recording with the code read aloud saves a face; one with the code missing is refused with the code shown.
- [ ] A recording with two faces, or none, is refused before any server call.
- [ ] The saved face shows "Verified" with the date, on both of Leo's devices after a sync.
- [ ] "Turn off my face" keeps the key with `status: "off"`, the hash and the history, and empties `photo`; AI videos stop offering "My face".
- [ ] A consent token from one of Leo's sign-ins does not open for the other.
- [ ] In `/edit?panel=ai&kind=avatar`, Leo sees "My face" preselected, and a video made from it plays in the editor.
- [ ] Other accounts see the avatar panel exactly as before.
- [ ] `likeness-check` is in `DAILY_LIMITS`; the 6th check in a day is refused with the reset time.
- [ ] Checked by eye at 390 px and 1440 px; `npm run build` and the full `npx vitest run` pass.
- [ ] `src/data/northStar.ts` item `people-my-face` flipped with its `ours` line, in the same commit.

## Tests

- `_shared/consent.test.ts`: `signFor` then `openSigned` gives the text back for the same uid and null for another uid or one changed character; `heardCode` reads "4821", "4,821", "4 8 2 1", "four eight two one" and "Four, eight, two, one." as 4821 and refuses "4812".
- `ai-video/logic.test.ts`: the consent request parse (wav size and RIFF header, 4-digit code, missing ticket, photo over 350,000 characters).
- `ai-video/index.test.ts`: a ticket from another uid or another day is refused; a caller outside `LEO_EMAILS` gets 403 before Whisper is called; a cap refusal returns 429; the returned `photoHash` is the sha256 of the photo sent.
- `src/lib/myFace.test.ts`: save writes `status: "on"` and a history row; turnOff keeps the key, hash and history and empties the photo; load returns null for off; a photo over `MAX_IMAGE_CHARS` is refused.
- MediaPipe does not run in vitest, so the pass rule lives in a pure `oneFaceShown(boxes: FaceBox[][])` in `src/lib/myFace.ts` with its own test: 9 of 12 frames with exactly one big enough face passes, 8 fails, and a frame with two faces counts as a miss.
- `src/lib/nav.test.ts` and `navRoutes.test.ts`: `/people` is in the routes list; the More sheet for someone@example.com is unchanged.
- An `AiVideo` test: with a saved face and a Leo email, "My face" is pressed; with another email, "My photo" shows as today.

## Open questions

- Leo: the free photo upload ("or of someone who agreed to it") stays for every other account today. Remove it when this turns on for everyone? Other people's faces are left out of the north star on purpose.
- Leo: train a Soul character from the saved face so you can appear in new settings and outfits. It needs a paid Higgsfield plan (Basic or above per the higgsfield-soul-id skill) and 5 to 20 photos, not one; the platform API route is unverified.
- One face, or several looks like Captions' "Avatar Looks"? This spec keeps one, replaced by recording again.
- The consent recording itself is not kept, only its transcript and time. Keeping the clip needs a private storage bucket, which is a schema and storage change for Leo.

## Related

people-my-voice, people-presenters, people-face-swap, people-ai-labels, people-dub-lipsync, formats-talking-head, remix-your-brand, brand-kit
