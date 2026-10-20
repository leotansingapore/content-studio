# Conversation skits

`formats-skits` | formats | phase 3 | status: missing | /north-star#formats-skits

## Leo asked

19 Oct 2026: "the idea is that one can remix any content format and the ai will regenerate"

Skits are one of the formats a remix has to be able to land in. No direct ask for skits by name; the rest is from the competitor research.

## How the best do it

### Fastlane

Studio > Content formats lists seven skit formats as 9:16 tiles, each with a muted preview that plays on hover, a one-line description and a price chip, and each tile links to `/v2/studio/create/<slug>`.

![Fastlane 1:28](../../../public/north-star/fastlane/t088.webp)

- "Beginner, Intermediate, Expert": "Three people on a couch pass a mic, each with a sharper take", "About 195 credits a post".
- "Baby Podcast": "Two babies hosting a podcast, deadpan, about your product", "About 210 credits a post".
- "Street Interview": "Impromptu street vox-pop that looks like unedited iPhone footage", "About 195 credits a post".

![Fastlane 1:29](../../../public/north-star/fastlane/t089.webp)

- "Casual Car Ride": "Two friends on a phone call, each filmed driving her own car", "About 210 credits a post". Its preview at 3:12 (below) shows one woman driving, full frame, so the video cuts between the two callers.
- "Podcast": "Two-host podcast video with dialogue and captions", "About 210 credits a post".
- "Two People in the Car": "Two friends on a drive in split screen, the driver with the problem and the passenger with your product", "About 210 credits a post". The preview is a top and bottom split, one driver in each half.

![Fastlane 3:12](../../../public/north-star/fastlane/t192.webp)

- "Replying to Comment": "A creator answers a viewer's comment selfie-style, with the TikTok or Instagram reply sticker on screen", "About 210 credits a post". The preview shows the white reply bubble ("ok but what do you actually put it on besides tacos") over the top of the selfie video. The same frame shows the Podcast preview: one woman at a boom-arm mic with a mug.

At Fastlane's Starter rate (US$20 for 500 credits, competitor index) 195 credits is about US$7.80 and 210 is about US$8.40. The grid note says "Generated video estimates assume a 15-second post; the cost follows the video's length."

The create page for these formats was not opened in the recording. The nearest one seen is Yapper, a one-person talking video, and it shows the pattern a skit page should follow: SCRIPT with a "Generate" button and a word target ("Target 36-48 words"), AVATAR with "Change", SETTING chips, LENGTH chips from "4 seconds" to "60 seconds", a collapsed "More settings" line, and a sticky footer with the price ("210 credits"), the shortfall ("142 credits now, 68 credits short") and "Generate video". The right column plays an example with "Play with sound".

![Fastlane 1:31](../../../public/north-star/fastlane/t091.webp)

### Others

- Creatify's Creative Agent takes a brief or a URL and has format skills `/street-interview` and `/podcast` among `/ugc`, `/cinematic` and `/animated`; Ad Agent is on Pro and up ([creatify.ai/features/agent](https://creatify.ai/features/agent)).
- Icon's 18-format ad library names Street Interview, TikTok Comment Response and Skit, made with human creators: 6 ads free, then US$1,000 a month ([icon.com/formats](https://icon.com/formats)).
- HeyGen has an AI Podcast Generator next to its text, image and PDF to video tools ([heygen.com](https://www.heygen.com/)).
- Revid.ai makes video podcasts from avatars: one "[Alice] line" per turn, a voice and avatar per speaker, and an AI dialogue writer from a topic. Avatars cost per 500 characters: Low 80, Pro 100, Ultra 200 credits ([revid.ai avatars and podcasts](https://www.revid.ai/llm/revid-ai-avatars-and-podcasts.md), [credit costs](https://www.revid.ai/llm/revid-ai-credit-costs.md)).
- Motion's AI tagging files "skit" and "podcast" as visual formats of an ad, which says these are formats ad buyers track ([Motion help](https://help.motionapp.com/en/articles/12461770-getting-started-with-ai-tagging-in-motion)).

## What we have today

No skit format exists. The pieces a skit needs all exist one person at a time:

- The AI video panel has four pills today: "From a template", "Montage", "You speaking", "Explainer" (`KINDS` in `src/components/AiVideo.tsx`).
- You speaking, `/edit?panel=ai&kind=avatar` (`src/components/AiVideo.tsx`, `src/lib/aiVideo.ts`, `supabase/functions/ai-video` modes `presenter`, `avatar`, `status`). "My photo" or "AI presenter". An AI presenter is a free-text description (up to 300 characters, `MAX_LOOK`) that starts on one of six `LOOKS` presets, each a different Singaporean, with "Another look" to cycle them; `presenter` mode makes one Soul v2 picture of it (cap `ai-image` 5). The script is up to 600 characters and 30 seconds. The voiceover is one ElevenLabs call (`text-voice`, 7 premade voices, cap `ai-voice` 10), cut into slices on the device (`sliceVoiceover`) and sent as 24 kHz WAV. Higgsfield Speak animates each slice of up to 9.5 s, at most 4 slices (`MAX_SLICES`): 11 credits for a slice up to 4.5 s, 22 for up to 9.5 s, 1 credit = US$0.0625. Clips are joined on the device (`startJoin` in `src/lib/videoMedia.ts`) and open in the editor with captions. Caps `ai-video` 2 a day and `ai-video-global` 20; a failed job refunds both (`refundFailed`). The `status` mode polls at most 6 tokens a call (`MAX_SCENES`).
- Template clips, `/edit?panel=ai&kind=template&template=<id>` (`supabase/functions/ai-video/templates.ts`). Eight Seedance 2.5 looks. Seedance makes the sound too (`generate_audio: true`), so people in a template clip already speak short lines ("each under 8 words"). 4 or 8 seconds, 480p (US$0.2056 a second) or 720p (US$0.4622 a second). Caps `ai-clip` 2 and `ai-clip-global` 8.
- `text-voice` mode `dub` already speaks a list of lines in one call and returns when each line is said (`lineSpans`), but in one voice only, so a skit with two voices cannot use it as it is.
- The editor's stacked frame mode (`src/lib/stacked.ts`, `drawStacked`) takes one filmed shot with two people side by side and draws one of them in the top half and the other in the bottom half (face tracking finds them, `pairsOf`), so it needs both people in the same source video and cannot place two separate clips one above the other.
- Stickers in the editor (`Overlay` in `src/lib/videoEdit.ts`, kinds text, arrow, circle, underline).
- The compliance chips are `ComplianceChips` inside `src/pages/GeneratePage.tsx`, not exported. `scanCompliance` (`src/lib/compliance.ts`) runs 8 regex rules: the "warn" ones (guarantee, best plan, a bare % return, act now) show an amber chip, while the "error" ones (risk-free, 100% safe, easy money, "AIA is the best") show a red chip and make Post it for me refuse the caption with "Fix the compliance error in the caption first." (`src/components/PostItForMe.tsx`), on top of the team rule that can lock posting until a leader approves (`useDraftReviews`).
- `text-voice` already takes a feeling (Calm, Warm, Energetic, Serious) and a pace (Slower, Normal, Faster) per call (`EMOTIONS`, `PACES` in `supabase/functions/text-voice/logic.ts`), which suits skit lines.
- Seedance template clips can already show two people trading a short line each (the prompt writer keeps people "clearly different from the others"), but no template is written as a skit.

## Build

Two steps. Step 1 is a day of work and ships three skits as 8-second one-take clips. Step 2 makes longer skits that cut between speakers.

### Step 1: one-take skits as templates

Add three entries to `TEMPLATES` in `supabase/functions/ai-video/templates.ts`. They appear in the existing gallery and go through the existing `template` mode, caps and refunds. Two new field keys are needed, `question` and `answer`: add them to `FieldKey` and to `NAMES` ("Question", "Answer").

| id | title | blurb | fields |
|---|---|---|---|
| `street-interview` | Street interview | Someone stops a stranger on the street and asks one question. | `question` "The question" (required, placeholder "How much of your pay do you save?"), `answer` "The answer" (placeholder "Whatever's left. So, nothing"), `scene` "Where" (placeholder "Outside Raffles Place MRT at lunch") |
| `three-levels` | Three levels | Three people on a couch pass a mic, each with a sharper take. | `scene` "The topic" (required, placeholder "How to save on insurance"), `line` "The expert's line" (placeholder "Review your cover every year") |
| `two-host-podcast` | Podcast | Two hosts at mics, one asks and one answers. | `question` "The host's question" (required), `answer` "The guest's answer" |

Each gets `photos: ["person"]` (the first host or the interviewer can be you), warnings ("Keep each line under 8 words, or the lips slip out of sync." and "Two or three lines fit in 8 seconds."), and a `structure`, `guidance` and `avoid` list in the house style. Street interview structure: handheld phone, a microphone held out, a busy Singapore street, the question, a pause, the answer, a laugh or a nod. Avoid: crowds walking through the face, logos on the mic.

The prompt writer's system text already forbids promised returns and named insurers. Add one sentence to `templateSystem` for these three: "Each person speaks only the lines given, in order, and the speakers look clearly different."

### Step 2: cast and cut

A new kind on the AI video panel, `/edit?panel=ai&kind=skit`, with six skit formats. The adviser picks a format, types a topic or arrives from a remix, the lines are written, each person gets a face and a voice, and the video cuts between speakers.

```
Make a video without filming
[From a template] [Montage] [You speaking] [Explainer] [Skit]

Skit
[Street interview] [Three levels] [Podcast] [Car call] [Two in the car] [Reply to a comment]
What it's about  [ Why your hospital plan has a co-pay      ]  [Write the lines]
                                                     Scripts: 9 left today

Who's in it
  A  [Me: add a photo]  [AI presenter v]   voice [Eric v]
  B  [AI presenter: Malay man, late 30s v] voice [Sarah v]

Lines                                    20 s of 30
  1  A  [ So what does a co-pay actually mean?      ]  [up][down][x]
  2  B  [ You pay a slice of every bill yourself.   ]
  ...                                         [+ Add a line]

Costs 55 Higgsfield credits (about US$3.44).
[Make the skit]                                   AI videos: 2 left today
```

"Me" uses the saved face from `people-my-face` once that ships; until then it is the photo picker You speaking has today, with its line "Use a photo of yourself, or of someone who agreed to it." AI presenters come second and carry the AI label.

The six formats and what each changes:

| id | pill | people | layout | setting line for the pictures |
|---|---|---|---|---|
| `street` | Street interview | 2: interviewer, passer-by | cut | A Singapore street by day, the interviewer holds a handheld mic toward the other person |
| `levels` | Three levels | 3 | cut | The same couch and room for all three, a handheld mic |
| `podcast` | Podcast | 2 | cut | A small podcast studio, a microphone on a boom arm in front, warm light |
| `car-call` | Car call | 2 | cut | Each person alone in their own parked car, phone on a dash mount, daylight |
| `car-pair` | Two in the car | 2 | split | Driver and passenger in the same car, seat belts on |
| `reply` | Reply to a comment | 1 | reply | Selfie framing at home, natural light |

Layouts: `cut` joins the line clips in order, full frame. `reply` is one person, with a new `reply` sticker (below) shown for the first 3 seconds. `split` shows both people for the whole video: person A always in the top half and person B always in the bottom half, the speaker's Speak clip playing in their half while the other half holds the first frame of that person's own first clip (Speak keeps the face and framing of the cast photo, so nothing extra is stored or downloaded). The editor's stacked mode cannot do this (see above), so it is new drawing in the join: `JoinExtra` in `src/lib/videoMedia.ts` gets `split?: {who: number[]}` (`who[i]` is the person speaking in take `i`), and `startJoin` draws each frame as two halves, each clip or held frame cropped to its half around the middle with `halfCrop` from `src/lib/stacked.ts`. The finished file is a plain 9:16 video, so the editor needs no new frame mode.

How it runs, all outside React in `src/lib/aiVideo.ts` like the avatar job, so leaving the page keeps it going:

1. Write the lines: `ai-video` mode `skit-script` `{format, topic, source?}` returns `{lines: [{who: 0|1|2, say}]}`. OpenAI writes them (the same `writeJson` helper as the explainer script, gpt-4.1, JSON schema). 2 to 6 lines, each under 15 words, 40 to 80 words in all. The system prompt reuses `SCRIPT_SYSTEM`'s rules (plain spoken English, general education only, no promised returns, no guaranteed or risk-free, no insurer or product names, no personal advice) and adds the format's beat: street interview opens on the question, three levels gets sharper each line, podcast ends on the guest's takeaway, car call opens on the problem, reply to a comment quotes the comment first. With `source` (a remix), it keeps the source's structure and never its words.
2. Faces: each person is "Me" (a photo, as in You speaking) or an AI presenter. An AI presenter is the existing `presenter` mode with a new optional `setting` argument, `presenterBody(look, setting)`: when given, the setting replaces the line "Softly blurred office or home background" so every person sits in the format's setting. One picture per AI person, each taking one `ai-image` use (5 a day, so a three-person skit uses 3), made when the adviser presses Make and shown before any Speak job starts.
3. Voices: a new `text-voice` mode `lines` `{lines: [{say, voice}]}` returns one base64 MP3 per line (the same `ttsBody` call per line, run in parallel) and takes one `ai-voice` use for the whole set. Up to 6 lines and 600 characters in all. The device turns each MP3 into 24 kHz mono WAV with `monoPcm` and `encodeWav`, as `makeAvatar` does today, and measures each line's length from it.
4. Faces speak: a new `ai-video` mode `skit` `{cast: [Photo], lines: [{who, wav, seconds}]}`. One Speak job per line on that person's photo, one seed per person. Same token signing, refund ticket and `status` polling as `avatar`; 6 lines fit the 6 tokens `status` takes. Limits: 2 or 3 people, 2 to 6 lines, each line 0.3 to 9.5 s, 30 s in all, and at most 88 credits (the avatar's ceiling). Over 88 the server answers "Make the lines shorter. This skit would cost more than an AI video is allowed to."
5. Put together on the device with `startJoin`: plain for `cut` and `reply`, with the new `split` option for Two in the car only. The editor opens it with captions and, for `reply`, the reply sticker passed in `extra.settings.overlays` (the way `src/lib/montage.ts` passes its overlays).

The reply sticker: add `"reply"` to `OverlayKind` in `src/lib/videoEdit.ts`. It draws a white rounded bubble with a small grey line "Reply to {name}'s comment" and the comment in bold dark text, under 90 characters. Add it to the Stickers tab as "Comment reply". `drawOverlay` in `src/lib/videoMedia.ts` draws it.

### Screens and states

- Empty: format pills, the topic box, "Write the lines" disabled until 5 characters.
- Writing: "Writing the lines..." with the orb; the topic box and pills are disabled.
- Lines ready: the cast rows and the editable lines. Each line has its speaker chip (A, B, C; tap to change), up, down and remove. A running total "20 s of 30", estimated at 2.6 words a second.
- Over length: the total turns red and Make is disabled: "Cut it to 30 seconds or less."
- Compliance: lines run through `scanCompliance` (`src/lib/compliance.ts`) as they are edited, and through Jev (below) once on Write. A flagged line gets the warn chip: move `ComplianceChips` out of `src/pages/GeneratePage.tsx` into `src/components/ComplianceChips.tsx` and import it in both places. It warns and does not block, unless a team leader set the rule to block (see `trust-compliance-check`).
- Making: steps in order, each under the orb: "Making the faces...", "Making the voices...", "Making the video, 2 of 5 lines...", "Putting your skit together...". The pills, cast and lines are locked.
- Done: the editor opens on the new project with captions. The draft is saved to My posts as a short video, with the source kept (`remix-source-trail`).
- Failed: the job's error in red, and "Try again at no cost" when the paid clips are still pending on the device (the existing `pendingAvatar` path, with `kind: "skit"`, the format and `who` kept in `cs-ai-video-pending` so a split skit can be joined again from its clips alone). When Higgsfield fails a line, `refundFailed` gives both uses back as it does for avatars.
- Safety filter: "The safety filter blocked it. Try another photo or wording."
- Over the daily cap: the server's words, "You've used all 2 for today. It resets at 8am Singapore time." Make is disabled when the uses-left readout says 0.
- Studio cap reached: "Today's AI videos for the whole studio are used up. Try again after 8am Singapore time."
- Not switched on: "AI videos aren't switched on yet." (no Higgsfield key).

### Copy

- Pill: "Skit"
- Format pills: "Street interview", "Three levels", "Podcast", "Car call", "Two in the car", "Reply to a comment"
- Topic placeholder: "What it's about, like why a hospital plan has a co-pay"
- Buttons: "Write the lines", "Write them again", "Make the skit", "+ Add a line"
- Cast: "Who's in it", "Me: add a photo", "AI presenter", "voice"
- Reply format: "The comment you're answering" (placeholder "ok but is term life really enough?")
- Uses left, through the existing `Left` component: "Scripts: N left today", "AI videos: N left today", "AI images: N left today" (shown when the cast has an AI presenter)
- Price line, the existing `cost()` helper: "Costs 55 Higgsfield credits (about US$3.44)."
- AI label under the cast when any AI presenter is used: "AI presenter. Label the post as AI-made." (see `people-ai-labels`)

### Data

- No table and no schema change.
- The paid job tokens stay device-only in `cs-ai-video-pending`, as for avatars.
- The last cast per brand is synced under `content-studio-skit-cast-${scoped(userId)}` as `{format, people: [{kind: "me" | "look", look?: number, voice}]}`, with no photos in it.
- The finished video is a device project like any other; its draft goes to My posts.

### AI and cost

- Lines: OpenAI gpt-4.1 through `writeJson` in `ai-video`, under 1 US cent a call. It takes one use of the existing `ai-video-script` cap (10 a day), shared with the explainer script, so no new cap.
- Jev, once per Write, on the joined lines (`askJev` in `supabase/functions/_shared/jev.ts`, pinned `jev-1.13.0`). Add it as `MAS_QUESTION` in `supabase/functions/ai-video/logic.ts` so the presenter and animated formats can reuse it:
  - type `noul`, instructions: "This is a script a licensed Singapore financial adviser will post on social media. Does any line promise or imply a return or result, call something guaranteed or risk-free, name an insurer or a specific policy, or tell the viewer what they personally should buy?"
  - Proposed threshold: 0.5 shows the warn chip on the whole script. Set the real threshold from a side-by-side run over 50 written scripts against `scanCompliance`, read every disagreement. Null (no key, timeout) falls back to `scanCompliance` alone.
- Faces: `presenter` mode, Soul v2, 0.09 credits (US$0.006) per AI person, one `ai-image` use each (cap 5 a day).
- Voices: ElevenLabs `eleven_turbo_v2_5`, one `ai-voice` use per skit however many lines.
- Video: Speak at 11 credits a line up to 4.5 s, 22 up to 9.5 s. A 20 s skit of five 4-second lines is 55 credits, about US$3.44. The ceiling is 88 credits, US$5.50. It takes one use of `ai-video` and one of `ai-video-global`, like an avatar video, so no new video cap.
- Step 1 templates: 8 s at 480p is about 26 credits (US$1.64), at 720p about 59 credits (US$3.70), on the existing `ai-clip` caps.
- Fastlane charges about 195 to 210 credits, about US$7.80 to US$8.40.

### Deep links

Add to `docs/deep-links.md` and the `edit` builder in `src/lib/links.ts`:

| URL | Opens |
|---|---|
| `/edit?panel=ai&template=street-interview` | Step 1 template form (existing param) |
| `/edit?panel=ai&kind=skit` | The skit form, last format used |
| `/edit?panel=ai&kind=skit&skit=podcast` | The skit form on one format. Values: street, levels, podcast, car-call, car-pair, reply. Unknown values fall back to street. Replace, not push. |

`kind` gains the value `skit`. Closing the AI panel already drops `kind` and `template` (`closePanel` in `src/pages/VideoEditPage.tsx`); add `skit: null` there too. A remix that lands here passes its source through the remix item's own param (see `remix-any-format`), never the source text in the URL.

### Gate

- The Skit pill and the three new templates show only when `leoOnly(email)` (`src/lib/leoOnly.ts`). A typed `kind=skit` URL for anyone else falls back to `template`.
- Server: `skit-script` and `skit` modes refuse anyone else with 403 "That isn't something this can make." Copy the two emails into `supabase/functions/_shared/leoOnly.ts` with a test that the two lists match.

## Done when

- [ ] The three Step 1 templates make an 8 s clip with two or three different people speaking the given lines, checked by eye on Leo's account at 390 px and 1440 px.
- [ ] Each of the six Step 2 formats makes a video that opens in the editor with captions, on Leo's account.
- [ ] Two in the car shows both people the whole time, A on top and B below, with the speaker's half moving and the other half still; Car call cuts between the two drivers full frame; the reply format shows the reply sticker for its first 3 seconds.
- [ ] The price chip shows before Make and matches the credits the server reports.
- [ ] A forced Higgsfield failure refunds both `ai-video` uses (counter checked in `cs_ai_usage`).
- [ ] A script with "guaranteed returns" shows the warn chip.
- [ ] Leaving `/edit` mid-make and coming back shows the job still running; a reload offers "Try again at no cost".
- [ ] Signed in as a non-Leo account, no Skit pill, no new templates, and the server refuses both modes.
- [ ] `src/data/northStar.ts` item flipped with its `ours` line, in the same commit.

## Tests

- `supabase/functions/ai-video/templates.test.ts`: the three new templates exist, have the new field keys, and `templateDetails` labels `question` and `answer`.
- `supabase/functions/ai-video/logic.test.ts`: `parseVideoRequest` for `skit` accepts 2 to 3 people and 2 to 6 lines, refuses a 7th line, a line over 9.5 s, a total over 30 s, a `who` with no person, and a cost over 88 credits; `skitCredits` sums 11 and 22 per line.
- `skit-script` output validation: 2 to 6 lines, each `who` in range, under 80 words in all; anything else is refused and the cap use refunded.
- `supabase/functions/text-voice/logic.test.ts`: `lines` mode refuses more than 6 lines or 600 characters and takes one `ai-voice` use.
- `src/lib/videoEdit.test.ts`: a `reply` overlay survives sanitising; an unknown kind is dropped.
- `src/lib/aiVideo.test.ts`: a skit job joins clips in line order, passes `split` with `who` for `car-pair` and for no other format, keeps `who` in the pending record, and a failed line keeps the paid tokens pending.
- `src/lib/stacked.test.ts`: a new pure `splitRects(W, H, who)` in `src/lib/stacked.ts` returns the speaker's half and the still's half (`who` 0 speaks on top, 1 below); `startJoin` calls it and is not tested directly, since it needs a browser.
- `src/components/ComplianceChips` moved: Write's existing compliance tests still pass.
- `src/lib/links.test.ts`: `links.edit({panel: ["ai"], kind: "skit", skit: "podcast"})` gives `/edit?panel=ai&kind=skit&skit=podcast`.
- A leoOnly test that the client and server email lists match.

## Open questions

- Baby Podcast and talking-baby formats: fun for MoneyBees, odd for an adviser's own page. Include them for Leo's brands only? Leo decides.
- Fastlane makes these as one generated scene with everyone in frame. Ours cuts between single faces. If Leo wants everyone in one frame for 15 s or more, that needs a longer Seedance clip than our 8 s; check Seedance 2.5's longest duration on Higgsfield's `/estimate` first, then ask Leo about the cost.
- The studio's ElevenLabs account is on the free plan with seven premade British-leaning voices. Singaporean voices need a paid plan. Leo decides.

## Related

`formats-gallery`, `formats-talking-head`, `formats-presenter`, `remix-any-format`, `people-my-face`, `people-presenters`, `people-my-voice`, `people-ai-labels`, `edit-video`, `edit-captions`, `trust-compliance-check`, `business-cost-preview`, `remix-source-trail`
