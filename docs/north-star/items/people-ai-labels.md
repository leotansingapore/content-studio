# AI labels and consent

`people-ai-labels` | people | phase 8 | status: partial | /north-star#people-ai-labels

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane gives it a settings page: under SENNA in Settings, "Post labels" reads "The AI and ad labels platforms show on posts.", though the page itself was not opened in the recording. Its public AI influencer page says platform and regional AI-labelling rules vary and that Fastlane helps with labelling at publish time; how it does that is not described (unverified). ([tool](https://usefastlane.ai/tools/ai-influencer-generator))

![Fastlane 5:46, Settings with Post labels](../../../public/north-star/fastlane/t346.webp)

Labels on the post:
- Metricool: a selector marks a post as AI-generated for Instagram (image, reel, carousel), TikTok Business and YouTube. ([update](https://metricool.com/product-updates-august-2026/))
- Planable: an optional per-post AI content label for Instagram posts, reels and stories. ([release notes](https://releasebot.io/updates/planable))
- Typefully adds "Paid Partnership" and "Made with AI" labels to X posts. ([changelog](https://typefully.com/changelog))
- Superscale adds AI labels where required as part of creative approval. ([site](https://superscale.ai/))

Consent for a likeness:
- HeyGen needs on-camera identity verification from the person in a custom avatar. ([site](https://www.heygen.com/))
- InVideo rejects a twin upload unless the person reads an on-screen consent code in English on camera. ([help](https://help.invideo.io/en/articles/11388821-how-to-create-an-avatar-by-recording-or-uploading-a-video))
- Descript has you read a consent statement aloud before cloning a voice, and asks for consent the first time it regenerates video. ([voice](https://help.descript.com/ai-speech/custom-speaker.md), [regenerate](https://help.descript.com/script-editing/regenerate-overview.md))
- VEED builds consent and voice identification into the twin recording. ([blog](https://veed.io/blog/introducing-personal-avatars-by-veed))

## What we have today

- Write has disclosure chips (`DISCLOSURES` in `src/lib/plainText.ts`): `ai` "AI-assisted" adds "Written with AI assistance.", next to "Paid partnership" and "Sponsored". They are off by default (`useState<DisclosureId[]>([])` in `src/pages/GeneratePage.tsx`), saved on the draft as `disclosure`, and added to the caption on copy and by Post it for me (`postText` in `src/lib/autoPost.ts`, read by `src/components/PostItForMe.tsx`).
- That label speaks about the writing only, and nothing records that a video holds an AI-made person or voice: `saveToPosts` in `src/pages/VideoEditPage.tsx` saves a short-video draft with no disclosure, and `VideoProject` has no field for it.
- An AI video reaches the editor through the join job: `finishAvatar` and `makeTemplateClip` call `startJoin`, `makeExplainer` calls `startSlides` (`src/lib/videoMedia.ts`), and `upload(file, extra)` in `VideoEditPage.tsx` turns the finished file into a new project. `JoinExtra` (`settings`, `note`) is the one way facts ride along today; `startSlides` takes no `extra` yet.
- Post it for me sends no AI flag to the platforms. `platformData` in `supabase/functions/social/posts.ts` sets TikTok's privacy and consent fields and YouTube's visibility and `madeForKids`, nothing else. Whether Zernio passes TikTok's AI-generated content flag or YouTube's altered or synthetic content flag is unverified.
- No consent record exists for any face or voice. The avatar's photo upload only says "Use a photo of yourself, or of someone who agreed to it."
- So the status is partial: a writing disclosure exists, and nothing covers AI people, AI voices or consent.

## Build

The studio knows when it made a person or a voice, so it tags the video at the moment it makes it, carries the mark onto the post, adds the label by default, and keeps one page listing every likeness with its consent. Nothing here guesses whether an uploaded video is AI-made.

Compliance warns by default; blocking a post without its label is a team leader's switch that belongs with trust-compliance-check (Open questions).

### Screens and states

`/people?tab=labels` (page shell from people-my-face, `leoOnly` gate), "AI labels":

```
AI labels for {brand}
[x] Add a line to the caption when a post has an AI person or voice
    "This video uses an AI-made person or voice."
[x] Tell the platform it's AI-made, where it lets us      (TikTok, YouTube)

Who appears in your posts
Your face        Verified 19 Oct 2026    On     3 posts     [ Copy record ]
Your voice       Verified 19 Oct 2026    On     1 post      [ Copy record ]
Mei              AI presenter            On     2 posts
Raj              AI presenter            Removed 18 Oct
```

1. Empty: the two switches, both on, and under them "Nobody appears in your posts yet. Your face, your voice and your presenters show here once you save them." with a link "Save your face" to `/people?tab=face`.
2. List: one row per face, voice and presenter, including turned-off ones, with the post count from this brand's drafts that carry its id.
3. Copy record: copies a plain-text consent record to the clipboard (who, kind, when it was verified, the line read, what was heard, every status change with dates) and toasts "Record copied." It is for a compliance officer who asks.
4. Saving a switch shows "Saved" within 400 ms.

Where the label shows up for a marked video:
- `/edit`: a chip "AI person" or "AI voice" (or both) beside the project name, with the InfoTip "Made by Content Studio's AI. Posts from it get the AI label."
- The draft saved from it: `aiMedia` set, and the disclosure `aiMedia` on unless the brand turned the caption switch off.
- Write and My posts: the disclosure chip row shows "AI person or voice" pressed, and the caption preview ends with the line.
- When a marked post's AI label is switched off by hand, an amber compliance chip says "This post has an AI person or voice and no AI label." It warns and does not block.
- Post it for me: with the platform switch on, TikTok and YouTube entries carry the AI flag (if Zernio supports it), and the screen lists "Marked as AI-made on TikTok and YouTube."

### Copy

- Tab: "AI labels"; heading "AI labels for {brand}"
- Switches: "Add a line to the caption when a post has an AI person or voice" / "Tell the platform it's AI-made, where it lets us"
- Caption line (new `DISCLOSURES.aiMedia`): label "AI person or voice", line "This video uses an AI-made person or voice."
- Ledger: "Who appears in your posts" / "Your face" / "Your voice" / "AI presenter" / "Verified {d MMM yyyy}" / "On" / "Off" / "Removed {d MMM}" / "{n} post" / "{n} posts" / "Copy record" / "Record copied."
- Empty: "Nobody appears in your posts yet. Your face, your voice and your presenters show here once you save them." / "Save your face"
- Editor chips: "AI person" / "AI voice"; InfoTip "Made by Content Studio's AI. Posts from it get the AI label."
- Warning chip: "This post has an AI person or voice and no AI label."
- Post it for me line: "Marked as AI-made on TikTok and YouTube."
- Saved: "Saved"

### Data

- `VideoProject.ai` (`src/lib/videoProjects.ts`), one field shared by the people items, set where the studio makes the media:
  ```ts
  ai?: {
    kind: "avatar" | "explainer" | "template" | "swap" | "dub" | "voiceover";
    person?: "mine" | "presenter" | "generated";  // "generated": explainer or template people with no saved likeness, or a one-off photo
    who?: string;                                 // face id or presenter id
    voice?: "mine" | "premade";                   // unset for a voice recorded on the mic
    madeAt: string;
    voiceId?: string; lang?: string; slices?: unknown[];  // people-dub-lipsync, typed there
    source?: string; agreedAt?: string;                   // people-face-swap
  }
  ```
  `JoinExtra` gains `ai`, and `startSlides` gains the same `opts.extra` that `startJoin` has. `finishAvatar`, `makeTemplateClip` and `makeExplainer` in `src/lib/aiVideo.ts` pass it, and `upload` in `VideoEditPage.tsx` copies `extra.ai` onto the new project. The pending-job record (`cs-ai-video-pending`) carries `ai` too, so a resumed job keeps its mark. In `VideoEditPage.tsx`, "Voiceover from text" and "Dub it" set `voice: "premade"` (kind `voiceover` or `dub` when the project had no `ai`), and a mic recording leaves it as it was.
- `DraftEntry` (`src/lib/draftHistory.ts`) gains `aiMedia?: { person?: boolean; voice?: boolean; who?: string[] }`, copied by `saveToPosts`.
- `DISCLOSURES` gains `aiMedia`; `withDisclosure` and `postText` already add any chosen id, so they stay as they are.
- The brand's switches live in `content-studio-ailabels-${scoped(userId)}` as `{ caption: boolean; platform: boolean }`, both read as true when missing.
- The ledger reads `content-studio-myface-<uid>`, `content-studio-myvoice-<uid>` and `content-studio-presenters-<scoped>`, where turned-off and removed rows stay (`status: "off"` plus history) so the ledger never depends on a deletion.
- None of this needs a schema change; a permanent record that outlives the 50-draft limit belongs to trust-archive.

### AI and cost

- No AI call and no cost: every mark comes from the code path that made the media.
- No Jev question. Detecting AI in uploaded footage is out of scope, and Jev reads text only.
- Platform flags: before building the switch, read Zernio's post API (`docs/zernio-connection.md`, docs.zernio.com) for a TikTok AI-generated content field and a YouTube altered or synthetic content field (both unverified). Add them in `platformData` only where Zernio documents them, and leave the screen line out for platforms without one. Instagram's AI label through the API is unverified; the caption line covers it.
- No new caps.

### Deep links

- `/people?tab=labels`
- `/people?tab=labels&who=<face, voice or presenter id>` scrolls to and highlights that row (replace).
- Builders in `src/lib/links.ts` and rows in `docs/deep-links.md`.

## Done when

- [ ] An avatar video made with Leo's face opens in `/edit` with the "AI person" chip, and the draft saved from it has the AI line at the end of the caption.
- [ ] A video with "Voiceover from text" gets "AI voice"; a video with only a mic recording gets no chip.
- [ ] Switching the caption line off on `/people?tab=labels` stops it being added to new drafts for that brand only.
- [ ] Removing the AI line from a marked draft shows the amber warning, and Copy still works.
- [ ] The ledger lists Leo's face, voice and presenters, including removed ones, and "Copy record" copies the consent history as plain text.
- [ ] With the platform switch on and Zernio support confirmed, a scheduled TikTok or YouTube post carries the AI flag (checked in Zernio's post response).
- [ ] Other accounts see Write's disclosure chips and `/edit` as before.
- [ ] Checked by eye at 390 px and 1440 px; `npm run build` and the full `npx vitest run` pass.
- [ ] `src/data/northStar.ts` item `people-ai-labels` flipped with its `ours` line, in the same commit.

## Tests

- `src/lib/plainText.test.ts`: `withDisclosure(text, ["aiMedia"])` ends with the new line once, and with `["ai", "aiMedia"]` both lines join in `DISCLOSURES` order.
- `src/lib/aiVideo.test.ts`: `finishAvatar` hands `startJoin` an `extra.ai` with `kind: "avatar"`, `person` and `who`; the explainer hands `startSlides` `person: "generated"`; a pending job read back after a reload still carries `ai`.
- `src/lib/aiLabels.test.ts`: missing settings read as both on; a draft with `aiMedia` gets the disclosure unless the caption switch is off; the warning shows only when `aiMedia` is set and the disclosure is missing.
- `src/lib/likenessLedger.test.ts`: the record text lists every history row in date order, and an off face still appears.
- `supabase/functions/social/posts.test.ts` (once Zernio's fields are confirmed): `platformData` is not exported, so test through `postBody` (and `checkSchedule` for the new input field). The TikTok and YouTube entries carry the AI flag only when it was asked for, and other platforms never do.

## Open questions

- Leo: a team leader switch to block or send for review a post whose AI label was removed. It needs the team rules tables (a schema change), so it sits with trust-compliance-check.
- Whether the caption line starts on for everyone when this turns on; this spec defaults it on, since TikTok and YouTube ask for realistic AI content to be labelled.
- Leo: the wording of the caption line. "This video uses an AI-made person or voice." is plain; an adviser's firm may want its own.

## Related

people-my-face, people-my-voice, people-presenters, people-face-swap, people-dub-lipsync, trust-disclosures, trust-compliance-check, trust-archive, publish-per-network
