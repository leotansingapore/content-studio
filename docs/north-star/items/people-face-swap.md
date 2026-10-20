# Your face in a trending video

`people-face-swap` | people | phase 4 | status: missing | /north-star#people-face-swap

## Leo asked

No direct ask for a face swap. It serves the north star Leo set on 19 Oct 2026, "the idea is that one can remix any content format and the ai will regenerate", since Character Swap is one of the formats in Fastlane's gallery.

## How the best do it

Fastlane lists "Character Swap" in its content formats gallery, row 8, between "Two People in the Car" and "Custom". The tile reads "Swap the character in a video using AI", priced "15 credits a second" while the generated video formats are priced per post ("About 195 credits a post" or "About 210 credits a post"), with the orange note "Needs a source video". Its preview is one young woman in a knit sweater, filmed selfie-style. The tile was not opened, so the swap flow itself is unverified. For scale, the Yapper format works out at 210 credits for 15 s, 14 credits a second.

![Fastlane 1:29, content formats with Character Swap](../../../public/north-star/fastlane/t089.webp)

- Revid.ai face swap: upload a source video (one speaker, up to about 2 minutes) and one reference face; it keeps the original voice, timing and motion, with an optional "Replace Voice". It costs 50 credits (Pro) or 100 (Ultra) per started 5 seconds. ([avatars](https://www.revid.ai/llm/revid-ai-avatars-and-podcasts.md), [credit costs](https://www.revid.ai/llm/revid-ai-credit-costs.md))
- Genviral's Video Cloner pitches "put my AI creator in this viral reel" next to a viral library that tells you "which hook to copy next". The flow is not public (unverified). ([site](https://genviral.io))

## What we have today

- Nothing swaps a face. No route in `supabase/functions/ai-video` takes a source video.
- The pieces a swap would reuse already exist:
  - A public Instagram reel comes in through `/clone?url=` (`CloneReelPage.tsx` reads `url` from the address) or the editor's "Copy a reel's style" (`clone-reel` with `{style: true}`, cached in `cs_reel_sources`), which hands back Instagram's video link. `fetchReelVideo` in `src/lib/reelFrames.ts` downloads it; when Instagram refuses the browser, the `clone-reel` relay (cap `reel-video` 20) fetches it instead. TikTok posts come back with `videoUrl: null` (`clone-reel/logic.ts`), so a TikTok video cannot be fetched today.
  - `src/lib/faceVision.ts` finds faces on the device, but `biggestFaces` and `findFaceBox` keep only the biggest face per picture; people-my-face adds `facesIn` to count them.
  - `video-assist ?mode=transcribe` (Whisper, cap `video-transcribe` 30) gives word timings, so the words spoken in a clip can be counted.
  - `src/lib/aiVideo.ts` runs paid Higgsfield jobs outside React, polls them, gives the cap back on failure through a signed refund ticket and opens the result in `/edit` through the join job.
  - `ai-video`'s `upload` helper puts files on Higgsfield's storage, but only from base64 inside the JSON body (photos up to 2.8M characters), which is too small a door for a video clip.
- No Higgsfield route for a video face swap is known on the platform API the repo uses (`https://api.higgsfield.ai`). The higgsfield MCP's official model list (checked 20 Oct 2026) has no route that takes a source video, but it also leaves out routes the repo already uses (Speak, Seedance 2.5), so it proves nothing either way. The Higgsfield CLI's catalogue (`higgsfield-generate` skill, `references/model-catalog.md`) lists Kling 3.0 with "motion transfer" and Gemini Omni Flash with "one video reference" on its web backend; whether either is reachable on this account's platform API is unverified.

## Build

A swap puts your own saved face (people-my-face) into a short trending clip in which nobody talks to camera, such as a reaction, a walk, a "POV" or a text-on-screen trend. The original sound is muted and your remix adds its own words on screen, so nobody else's words are copied and nobody's mouth moves to someone else's speech.

Only your own face goes in, per the recommendation ("face swaps only onto your own face with consent"). AI presenters are left out of this item; see Open questions.

Building this is blocked on a provider. If Higgsfield has a video face swap route on this account, use it (prepaid, already wired). If not, the provider is a new paid vendor and Leo decides. Every step up to "Swap the face" can be built first; until a provider is set, the make step answers "Face swaps aren't switched on yet." and nothing is charged.

### Screens and states

A fifth kind in the AI video panel, "Swap a face" (`kind=swap`), shown only for `leoOnly(email)`, opened from:
- `/clone` results for an Instagram reel: the button "Put my face in it"
- `/swipe`: the post drawer (`src/components/PostDetailDrawer.tsx`, `?post=`) of an Instagram reel, beside its Remix button
- `/following`: beside the "Remix" link of a tracked Instagram video post (`src/pages/FollowingPage.tsx`)
- `/edit` itself: a video of your own already in the project list

The first three go to `/edit?panel=ai&kind=swap&url=<reel link>`. A TikTok link shows "Face swaps work on Instagram reels for now." and stops there.

1. Loading the source: "Getting the video..." with the handle and length when known (`clone-reel` style read, then `fetchReelVideo`).
2. Checking, on the device and with one Whisper call: "Checking it's a video we can swap..." The source must show one face in at least 9 of 12 sampled frames (`facesIn`, the same rule as `oneFaceShown` in people-my-face) and have fewer than 15 spoken words in the trimmed part.
3. Set up:
   ```
   [source preview, muted]          Your face, verified 19 Oct
   Use 0:03 to 0:11  [trim]         [ ] I agree to put my face in this video.
   8 seconds                        About {credits} credits (US${x})
                                    [ Swap the face ]
   ```
   The part is trimmed to at most 10 s. The price chip updates as the trim moves, and the button stays disabled until the box is ticked.
4. Making, within 400 ms: "Sending the video..." and then "Swapping the face, about {n} minutes". The job runs outside React; leaving the page keeps it going, and a reload picks it up (like `pendingAvatar`).
5. Done: the swapped clip opens in `/edit` with its sound muted and the "AI person" mark (people-ai-labels). A toast says "Your face is in. Add your words on screen next." with the action "Write the words", which opens the wall-of-text or caption step of the remix (formats-wall-of-text).
6. Refused, before anything is paid for:
   - no saved face ("Save your face first", linking to `/people?tab=face&record=1`)
   - a TikTok link ("Face swaps work on Instagram reels for now.")
   - two or more faces ("This one has more than one person. Pick a video with one.")
   - talking ("This one has talking in it. Face swaps work on videos with no talking, like a reaction, a walk or a text-on-screen trend.")
   - a source over 60 s ("Pick a clip under a minute.")
   - the box not ticked (the button stays disabled with "Tick the box to go on.")
   - over the daily cap, or the studio's cap
   - no provider ("Face swaps aren't switched on yet.")
7. Failed: "The swap didn't come through. Your use is back." with "Try again". A provider safety block reads "The safety filter blocked it. Try another video."

### Copy

- Entry button: "Put my face in it"
- Panel pill: "Swap a face"
- Loading: "Getting the video..." / "Checking it's a video we can swap..."
- Set up: "Your face, verified {d MMM}" / "Use {m:ss} to {m:ss}" / "{n} seconds" / "I agree to put my face in this video." / "About {credits} credits (US${x})" / "Swap the face"
- Making: "Sending the video..." / "Swapping the face, about {n} minutes"
- Done toast: "Your face is in. Add your words on screen next." / action "Write the words"
- Refusals: "Save your face first" / "Face swaps work on Instagram reels for now." / "This one has more than one person. Pick a video with one." / "This one has talking in it. Face swaps work on videos with no talking, like a reaction, a walk or a text-on-screen trend." / "Pick a clip under a minute." / "Tick the box to go on." / "Face swaps aren't switched on yet." / the caps' own messages, and for the studio cap "Today's face swaps for the whole studio are used up. Try again after 8am Singapore time."
- Failed: "The swap didn't come through. Your use is back." / "Try again" / "The safety filter blocked it. Try another video."

### Data

- The source and the result stay on the device (`putFile` in `src/lib/deviceFiles.ts`), as every video in `/edit` does today.
- The result's `VideoProject` gets the shared `ai` field from people-ai-labels: `{ kind: "swap", person: "mine", who: <face id>, source: <reel link>, agreedAt, madeAt }`, carried through the join job's `JoinExtra`. The source link also feeds remix-source-trail.
- The pending job sits on this device under `cs-ai-swap-pending` (tokens, refund ticket), the same pattern as `cs-ai-video-pending`.
- The consent tick is saved as `agreedAt` in that `ai` field, next to the face's own consent record in `content-studio-myface-<uid>` (people-my-face).
- No schema change.

### AI and cost

- The trimmed part is cut on the device (`startJoin` with one take and `mute: true`), so at most 10 s is sent.
- New `ai-video` mode `{mode:"swap-upload", contentType: "video/mp4" | "video/webm"}`: the server asks Higgsfield's `files/generate-upload-url` (as `upload` does) and hands the browser `{upload_url, upload_headers, public_url, videoToken}` with `videoToken = signFor(signing, uid, "swapsrc:" + public_url)` (`_shared/consent.ts`, people-my-face). The browser PUTs the clip straight to storage, which keeps the video out of the JSON body. Whether that storage accepts a PUT from a browser (CORS) is unverified; today only the server PUTs to it. Test it first with one 1 KB file. If the browser is refused, send the trimmed clip as the raw body of `ai-video?mode=swap-upload` (as `video-assist ?mode=transcribe` takes its WAV, read before `req.json()`), at most 10 s and 8 MB, and let the server upload it.
- New `ai-video` mode `{mode:"swap", video: public_url, videoToken, face: {jpeg}, faceToken, seconds}`:
  - `videoToken` must open for this uid and name this `video`.
  - `faceToken` is the consent token from people-my-face. The server hashes the JPEG it was sent (sha256) and refuses unless the token opens for this uid and names that hash. Only a face its owner verified can go in.
  - `seconds` is 1 to 10. The server takes `ai-swap` then `ai-swap-global` before calling the provider, and gives both back on failure through the same signed refund ticket as `ai-clip` (add `"ai-swap": "ai-swap-global"` to `REFUNDS`).
  - It refuses with 403 "Not switched on for this account yet." unless `leoOnly(user.email)`, and with 503 "Face swaps aren't switched on yet." while no provider route is set, before any cap use.
- Checks before paying: faces counted on the device (free); words counted from one `video-assist ?mode=transcribe` call on the trimmed part (about US$0.001, `video-transcribe` cap). Both are measurements, so no Jev question here. Whether a source suits the brand is remix-fit-check's job.
- Caps to add in `usageCaps.ts`: `"ai-swap": 2` and `"ai-swap-global": 6`, with the comment naming the provider and its per-second price once chosen.
- Cost: unknown until the provider is chosen. For scale, Fastlane prices it at 15 of its credits a second and Revid at 50 to 100 credits per started 5 s. The price chip must show the provider's real per-second cost, worked out like `clipCredits` in `ai-video/logic.ts`.

### Deep links

- `/edit?panel=ai&kind=swap&url=<reel link>` opens the swap with that source (push). `kind=swap` joins `template`, `montage`, `avatar` and `explainer` in the `kind` param.
- `/edit?panel=ai&kind=swap&p=<project>` uses one of your own videos as the source.
- The `edit` builder in `src/lib/links.ts` gets `kind: "swap"` and `url`; `docs/deep-links.md` gets the rows.

## Done when

- [ ] Leo pastes a public Instagram reel with one person and no talking into `/clone`, presses "Put my face in it", and the swap screen shows the source, his verified face and a price.
- [ ] A TikTok link, a source with two people, or one with talking is refused before any paid call, with the messages above.
- [ ] A face JPEG whose hash does not match its consent token is refused by `ai-video`.
- [ ] With a provider switched on: the swapped clip opens in `/edit` muted, with the AI person mark set, and a failed swap gives both cap uses back.
- [ ] Without a provider: "Swap the face" answers "Face swaps aren't switched on yet." and nothing is charged.
- [ ] Nobody outside Leo's sign-ins sees "Put my face in it" or the "Swap a face" pill, and the server refuses them.
- [ ] Checked by eye at 390 px and 1440 px; `npm run build` and the full `npx vitest run` pass.
- [ ] `src/data/northStar.ts` item `people-face-swap` flipped with its `ours` line, in the same commit.

## Tests

- `ai-video/logic.test.ts`: `parseVideoRequest` for `swap` refuses `seconds` of 0 or 11, a missing `faceToken` or `videoToken`, and a non-https video link.
- `ai-video/index.test.ts`: a non-Leo caller gets 403; with no provider route the answer is 503 and no cap use is taken; a face whose sha256 differs from the token's hash is refused; a `videoToken` made for another link is refused; a provider failure gives back `ai-swap` and `ai-swap-global` once.
- `src/lib/swapCheck.test.ts`: the source check passes 10 of 12 frames with one face and 8 spoken words, and refuses 2 faces, 20 words, 61 s and a TikTok link.
- An `AiVideo` test: the tick box gates "Swap the face".

## Open questions

- Leo: the provider. Use Higgsfield if it has a video face swap route on this account (unverified; Kling 3.0 motion transfer and Gemini Omni Flash are the names to ask about); anything else is a new paid vendor.
- Leo: is it fine to swap into another creator's footage at all, given they own the clip even with their face and words gone? A safer start is stock clips and the user's own footage only; this spec allows public Instagram reels as Fastlane allows source videos, and labels the result AI.
- Leo: should a labelled AI presenter (people-presenters) be swappable too? The recommendation says "face swaps only onto your own face with consent", so this spec leaves presenters out; adding them later is one more "Who goes in" choice.
- The 10 s limit keeps the cost down; Fastlane's limit is not known.

## Related

people-my-face, people-presenters, people-ai-labels, remix-intent, remix-any-link, remix-fit-check, remix-source-trail, formats-wall-of-text, formats-text-over-clip
