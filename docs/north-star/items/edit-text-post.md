# Text post and caption editor

`edit-text-post` | edit | phase 3 | status: partial | /north-star#edit-text-post

## Leo asked

8 Oct 2026: "an all in one tool for my social media management, and for each person too"

Every remix that ends as words (a text post, a carousel caption, a video caption) opens in Write's editor, so this is the one place each adviser finishes the words before posting.

## How the best do it

Fastlane has no text editor of its own in what Leo recorded. New captions are a chat ask: Home's "ASK SENNA FOR" row has a "Scripts and captions" tile with the example "Write 3 captions for my next post"; the helper says "Tap one to start it in the box", but the click was not recorded.

![Fastlane 0:04](../../../public/north-star/fastlane/t004.webp)

Each planned post in a campaign shows its caption in a "CAPTION | TIKTOK" box beside the preview, with no edit control on the box. A round "Edit" button (pencil) sits by the preview, but Leo only hovered it (notes-1, 0:42), so where it leads is unverified.

![Fastlane 0:41](../../../public/north-star/fastlane/t041.webp)

The "Schedule post" modal says "Any caption you add here carries into the draft", so a caption field sits in a later step, but Leo closed the modal at step 1 of 3 and it was never seen.

![Fastlane 1:56](../../../public/north-star/fastlane/t116.webp)

The text-first tools do it better:

- Typefully: one editor for X, LinkedIn, Threads, Bluesky, Mastodon and Substack Notes, thread splitting, media dragged between posts in a thread, and "realistic per-platform previews in the sidebar with accurate mobile scaling". [typefully.com](https://typefully.com/)
- AuthoredUp: bold, italic, bullet and list styles and emoji, mentions, attachments, and a "Multi-device preview". [authoredup.com](https://authoredup.com/), [pricing](https://authoredup.com/pricing)
- Taplio's composer has an "AI Edit" tab with "Improve this post", "Rewrite the hook", "Fix grammar and spelling" or your own instruction, "Adjust results", and a "History" that restores earlier versions. Growth and Pro. [help](https://intercom.help/taplio/en/articles/17233357-using-taplio-s-ai-for-content-inspiration)
- Agorapulse runs quick actions on a draft: "Shorter", "Longer", "Rephrase", "Translate in...", seven tones from "Promotional" to "Shocking", or "Enter your own prompt"; results go back with "Send to Composer". [help](https://support.agorapulse.com/en/articles/8769298-how-to-use-the-ai-writing-assistant)
- Vamos Docs lets you rewrite, shorten or humanize any selection. [docs](https://docs.getvamos.ai/en/articles/13204779-what-vamos-does)
- Later's Caption Writer returns several caption options from a few keywords, learns tone from past posts, and regenerates 3 new versions in another tone, 1 credit each. [help](https://help.later.com/hc/articles/14711113026327)
- Sprout Social has "Enhance Post by AI Assist" in the composer plus caption suggestions and alt text generation, Professional and above. [features](https://sproutsocial.com/features/social-media-publishing/) Publer's AI Assist also writes alt text for images and inserts hashtag suggestions with "Insert". [blog](https://publer.com/blog/introducing-publer-ai-assist/)
- Hootsuite infers hashtags from the media as well as the caption. [publishing](https://www.hootsuite.com/platform/publishing)

## What we have today

Partial. Write is already a strong single-post editor; it rewrites the whole post only, has two preview looks, and has no alt text.

- Write, `/generate` (`src/pages/GeneratePage.tsx`): the Edit textarea (about line 3482) with the "Rewrite" row: "Shorter", "Longer", "Simpler", "More casual", "More formal" (`REWRITES`, line 473) and "Clean AI tells" (`cleanAiTells` in `src/lib/plainText.ts`). The five rewrites go through `generate-social-content` (academy-hosted, not capped in this repo) and land in the rewrite panel with "Use this" and "Discard" ("Stop" while streaming), then Undo (`undoText`). "Clean AI tells" is a fixed-list transform in the browser that applies at once, with the same Undo. The "ask" rewrite (`/generate?draft=<id>&ask=<words>`) and "Rewrite flagged lines" from the sounds-human check also exist. Every rewrite replaces the whole post.
- Hooks first ("Pick a hook", 21 named formulas, Jev's "Recommended"), "Three variations", "Re-roll 3", "Adapt for" another platform, hashtags (mode `hashtags`, trimmed to the brand kit's policy), first comment for LinkedIn links.
- The preview in `src/components/PostPreview.tsx` draws an Instagram look and one feed card that LinkedIn and Facebook share. The "...more" fold comes from `foldAt` in `src/lib/platformCounters.ts`, which has rules for LinkedIn (210 characters or 3 lines), Instagram (125 or 2) and Facebook (480 or 5) but none for TikTok. A TikTok draft falls through to the LinkedIn card and is passed to `Folded` as `"linkedin"`, so today it is cut at LinkedIn's fold with "...see more". The preview wears the brand kit and sits next to the counter from `readout` and `MAX_CHARS`, and it only ever shows the draft's own platform. Write's platforms are LinkedIn, Instagram, Facebook and TikTok (`PlatformId`); there is no Threads draft.
- Checks: compliance chips (`scanCompliance`), sounds human, predicted score, fact flags, near-duplicate (`nearDuplicate`).
- Alt text lives only in Media (`/media`, `src/lib/mediaLibrary.ts`), as a 250-character `alt` per photo kept on the device and changed with `updateMedia`; AI pictures carry their prompt there and Pexels photos their Pexels description. Write has no alt text box, and Post it for me sends none.
- Captions per network for a video are written in `/edit` (`src/components/PlatformCaptions.tsx`): TikTok, LinkedIn, Facebook, YouTube, X and Threads, each with its own limit in `PLATFORM_RULES` (`supabase/functions/video-assist/captions.ts`, Threads 500 characters). "Save to My posts" there saves a short-video draft, which opens in this same editor.
- `carousel-copy`, behind the carousel's "Tighten with AI", is the OpenAI function this repo owns for short copy. It calls `gpt-4.1` (its own `OPENAI_MODEL` in `logic.ts`) under cap `carousel` 30, takes no `mode` field and gives nothing back on a failed call (no `refundUsage`).
- Drafts have no field-by-field cleaner: `loadDrafts` in `src/lib/draftHistory.ts` casts what is stored, so a new `DraftEntry` field needs its own checked reader.
- Missing: AI on a selected part only, previews on other networks with a real TikTok or Threads look, bold, and alt text suggestions; thread splitting belongs to `formats-text-threads`.

## Build

Four additions to Write's Edit area. No new page.

### 1. Change only the part you select

- Selecting 3 or more words in the Edit textarea shows a bar directly under it. It replaces the Rewrite row while the selection lasts; deselecting brings the Rewrite row back.
- Actions: "Improve", "Shorter", "Sound human", "More casual", "More formal", plus "Bold" from part 3. `edit-snippets` adds "Save as snippet" to the same bar.
- A press sends the selection with the text before and after it to a new `carousel-copy` mode `part`, which returns only the new words for that span. The browser keeps `selectionStart`, `selectionEnd` and the original span, and on "Use this" splices the new words into exactly that range, with `undoText` and Undo behind it.
- If the text inside that range changed while the call ran, nothing is spliced: "The post changed while this was written. Select the part again."
- After the LLM, the server asks Jev whether the new words keep the facts of the old ones (question below). A low answer adds the line "Check this: a fact or number may have changed." It warns and never blocks.
- The adviser's voice summary (`loadVoiceProfile(userId)?.voiceSummary`) goes with the request, cut to 600 characters on the server, so a part rewrite sounds like the rest of the post.

```
Edit
[ ...When your hospital bill arrives, [the co-pay is the part most people forget about] ... ]
Selected: 9 words   [Improve] [Shorter] [Sound human] [More casual] [More formal] [Bold]   Under US$0.01 | 59 left after this
  New: "the co-pay is the bit nobody budgets for"        [Use this] [Discard]
```

### 2. Preview on any network

- Under the preview, a row "Preview on" with chips "LinkedIn", "Instagram", "Facebook", "TikTok", "Threads". It starts on the draft's platform. A pick changes the preview only; the draft's platform and its counter stay.
- The preview sits in a 375 px wide phone frame at every screen size, so the fold and line breaks look as they will on a phone.
- `PostPreview` gains two looks. TikTok: the caption under a 9:16 placeholder (or the attached video's poster) with the handle, no fold, since `foldAt` has no TikTok rule. Threads: name, handle and photo from the brand kit, no fold, and "{n}/500" under it, the limit read from `PLATFORM_RULES.threads.maxChars`. Over it: "Over Threads' 500 characters. Trim it or make it a thread." When `formats-text-threads` has shipped, "make it a thread" links to its panel.
- LinkedIn, Instagram and Facebook reuse `readout` and `foldAt` for the picked network, so a LinkedIn post previewed on Instagram shows where Instagram's "...more" cuts it. The TikTok look replaces today's fall-through, so a TikTok draft stops showing LinkedIn's fold.

### 3. Bold

- "Bold" in the selection bar, shown when the draft's platform is LinkedIn or Facebook. It turns A to Z, a to z and 0 to 9 into Unicode sans-serif bold letters (Mathematical Sans-Serif Bold, U+1D5D4 onward); pressing it on an all-bold selection turns them back. New pure file `src/lib/textStyle.ts`: `toBold`, `fromBold`, `isBold`.
- Every check reads `text.normalize("NFKC")`, which folds bold letters back to plain ones. `scanCompliance` (`src/lib/compliance.ts`) and `nearDuplicate` (`src/lib/nearDuplicate.ts`) do it on their first line, so every caller is covered, including Engage and the carousel; `scanCompliance` returns matched words and no offsets, so nothing else shifts. Write normalises the text it sends to `post-score`, `writing-judge` and fact flags. Without this, "guaranteed" in bold would slip past the compliance chips.
- `cleanAiTells` removes `\p{Cf}` characters (the `INVISIBLE` pattern) and bold letters are `\p{L}`, so they survive it; the tests below pin that down.
- Each bold letter is two UTF-16 units, so `countChars` and `MAX_CHARS` count it twice. That is left as is: it errs toward a shorter post, and how each network counts these letters is unverified.
- InfoTip beside the button: "Screen readers may skip bold letters. Bold a few words only."

### 4. Alt text for pictures

- Under each picture attached in Write (`attachedMedia`, pictures only), an "Alt text" box, filled from the Media item's `alt` when there is one, 250 characters at most.
- "Write it for me" sends the picture (resized to 512 px on the long side, JPEG) and the post's first 600 characters to a new `carousel-copy` mode `alt`, which returns one sentence. It fills the box; the adviser can edit it.
- The text is saved to the Media item (`updateMedia(userId, key, { alt })`, device only) and on the draft as `alts`, which syncs.
- "Copy alt text" copies it for pasting into Instagram's or LinkedIn's alt field by hand. Post it for me does not send it yet (open question).

### Screens and states

- Empty: no selection bar until 3 words are selected. Fewer than 3: the Rewrite row stays.
- Working: the pressed chip shows the orb and "Rewriting..." within 400 ms while the other chips wait, disabled, and the textarea stays editable.
- Ready: the "New:" line appears with "Use this" and "Discard" beside it, and the server has already refused (and refunded) any reply over twice the selection's length, or any longer reply for "Shorter".
- Jev warns: the line "Check this: a fact or number may have changed." sits under "New:".
- Jev null: no warning line; the compliance chips still run on the spliced post.
- Changed meanwhile: "The post changed while this was written. Select the part again."
- Failed: "Couldn't rewrite that part right now. Try again in a minute." The post is untouched and the use is refunded.
- Over the cap: the 429 line from `usageRefusal`, "You've used all 60 for today. It resets at 8am Singapore time." The whole-post Rewrite row still works, since it uses the academy writer.
- Alt text writing: "Writing alt text..." on the button; failed: "Couldn't write alt text right now. Type your own."; over the cap: the 429 line.
- Preview: switching networks is instant (no AI).

### Copy

| Where | String |
| --- | --- |
| Selection bar | "Selected: {n} words", "Improve", "Shorter", "Sound human", "More casual", "More formal", "Bold" |
| Result | "New:", "Use this", "Discard", "Rewriting..." |
| Warnings | "Check this: a fact or number may have changed.", "The post changed while this was written. Select the part again." |
| Errors | "Couldn't rewrite that part right now. Try again in a minute.", "Couldn't write alt text right now. Type your own." |
| Preview | "Preview on", "LinkedIn", "Instagram", "Facebook", "TikTok", "Threads", "{n}/500", "Over Threads' 500 characters. Trim it or make it a thread." |
| Bold InfoTip | "Screen readers may skip bold letters. Bold a few words only." |
| Alt text | "Alt text", placeholder "What the picture shows", "Write it for me", "Writing alt text...", "Copy alt text" |
| Price chip | "Under US$0.01 | {n} left after this" (from `business-cost-preview`'s `PriceChip`) |

### Data

- `DraftEntry.alts?: string[]` in `src/lib/draftHistory.ts`, one per entry in `attached` (same order, up to 250 characters each). `loadDrafts` checks no fields, so a pure `altsFor(entry)` in the same file is how Write reads them: strings only, cut to 250 characters, one per `attached` key, extras dropped and missing ones as "".
- The preview pick lives in the URL (`preview`), with the last pick remembered on the device as `cs-preview-on` (the URL wins, then the remembered pick, then the draft's platform).
- Media alt stays device only, as today.
- No table, no schema change.

### AI and cost

- `carousel-copy` reads `mode` first; a missing `mode` is today's tighten request, so `/carousel` is unchanged.
- Mode `part`. Request `{ mode: "part", before, part, after, action, platform, voice? }`: `before` and `after` up to 3,000 characters each, `part` 3 to 600 characters, `action` one of `improve`, `shorter`, `human`, `casual`, `formal`; the reply is `{ part, same }`.
- Prompt (system): "You edit one part of a social media post by a Singapore financial adviser. Rewrite only PART so it {instruction}. It must read naturally between BEFORE and AFTER. Return only the new PART. Keep every fact, number and ask in PART and add none. Plain spoken English, short sentences, no em dashes, no hashtags. Never promise returns, never say guaranteed or risk-free, never name an insurer or a product, never give personal advice." Instructions per action: improve "is clearer and more specific, in the same voice"; shorter "is about a third shorter"; human "sounds like a person talking, with contractions and plain words and no stock phrases"; casual "is more casual and conversational"; formal "is more formal and polished". The voice summary, when sent, is added as "Match this voice: {voice}".
- Model: `carousel-copy`'s own `OPENAI_MODEL` (`gpt-4.1`, in its `logic.ts`) through `openaiFetch` from `supabase/functions/_shared/openaiChat.ts`, as tighten does. About 400 tokens in and 80 out, under 1 US cent (unverified; log the first 20).
- Jev, after the LLM, one `noul` with state `{ before: part, after: newPart }`: "Does `after` keep every fact, number, promise and ask that `before` has, and add no new fact, number, promise or product name?" Criteria: true "Same facts, numbers and asks, only worded differently." false "A fact, number, promise or ask was changed, dropped or added." Proposed threshold: show the warning under 0.5. Run the first 30 part rewrites in shadow (log the answer, show nothing) and read every one before turning the line on. When Jev returns null the reply carries `same: null` and no warning shows.
- Mode `alt`. Request `{ mode: "alt", jpeg, post }` with `jpeg` a `data:image/jpeg` URL under 200 KB, sent as an `image_url` part (the shape `reel-visuals` builds) with `detail: "low"`; `reel-visuals` itself uses `"high"`, which a one-line description does not need. Prompt: "Write alt text for this picture for people who cannot see it: one sentence, at most 25 words, saying what is shown. Never name or guess who a person is. No brand names, no claims, no hashtags." The server cuts the reply to 250 characters and replaces any em dash. Under 1 US cent a call (unverified; log the first 20).
- New caps in `DAILY_LIMITS` (`supabase/functions/_shared/usageCaps.ts`), each refunded with `refundUsage` on a failed or refused reply (today's tighten path refunds nothing; leave it as is): `"text-part": 60` and `"alt-text": 30`, with a one-line comment each. Add both to `PRICES` in `supabase/functions/_shared/prices.ts` (`business-cost-preview`) as "Under US$0.01". The preview and Bold run in the browser and cost nothing.

### Gate

- The selection bar, "Preview on", Bold and alt text show only when `leoOnly(email)`; everyone else sees today's Edit area.
- `carousel-copy` answers 403 for modes `part` and `alt` unless `isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)` (from `supabase/functions/market/logic.ts`; `NORTH_STAR_USERS` is a new function secret with Leo's two uids), or whichever server gate helper the first north-star item shipped.

### Deep links

| URL | Opens |
|---|---|
| `/generate?draft=<id>&preview=threads` | That draft with the preview on Threads. Values `linkedin`, `instagram`, `facebook`, `tiktok`, `threads`; the draft's own platform is the default and is left out of links. Replace. |

A selection is not a URL state (it is gone on reload by nature). Add `preview` to `links.generate` in `src/lib/links.ts` and a row to `docs/deep-links.md`.

## Done when

- [ ] Selecting a sentence and pressing "Shorter" changes only that sentence; the rest of the post is byte for byte the same.
- [ ] Editing the post while a part rewrite runs gives the "post changed" line and splices nothing.
- [ ] A part rewrite that drops a number shows the Jev warning after shadow mode is switched off.
- [ ] "Preview on" shows the same LinkedIn post as Instagram, Facebook, TikTok and Threads at 375 px, each in its own look and with each network's fold, and the pick survives a reload from the URL.
- [ ] A bolded "guaranteed" still raises the compliance chip.
- [ ] "Write it for me" fills alt text for an uploaded photo, and the text is there on the draft on another device.
- [ ] `/carousel` "Tighten with AI" works exactly as before.
- [ ] Non-Leo accounts see today's Write; the server refuses `part` and `alt` for them.
- [ ] `npm run build` and the full `npx vitest run` pass; checked by eye at 390 px and 1440 px; `src/data/northStar.ts` flipped in the same commit.

## Tests

- `src/lib/textStyle.test.ts`: `toBold` then `fromBold` returns the input; punctuation and spaces are untouched; `isBold` is false on mixed text; `toBold("guaranteed").normalize("NFKC")` is "guaranteed".
- `src/lib/plainText.test.ts`: `cleanAiTells` keeps bold letters.
- A splice helper `spliceRange(text, start, end, expected, replacement)` in `src/lib/textStyle.ts`: returns null when `text.slice(start, end) !== expected`, else the spliced text.
- `supabase/functions/carousel-copy/logic.test.ts`: a request with no `mode` still parses as tighten; `part` parsing (lengths, unknown action refused), the length rule refuses a long reply, em dashes are replaced; `alt` parsing refuses a non-JPEG data URL and cuts the reply to 250 characters.
- `src/lib/draftHistory.test.ts`: `altsFor` keeps strings in `attached` order, cuts each to 250 characters, drops extras past the length of `attached`, fills missing ones with "", and returns all "" for an older draft with no `alts`.
- `src/lib/compliance.test.ts` (new; only `autoDm.test.ts` touches `scanCompliance` today): `scanCompliance(toBold("guaranteed returns"))` raises the same flag as the plain words.
- `src/lib/links.test.ts`: `links.generate({ draft: "d1", preview: "threads" })`.
- The existing caps test in `supabase/functions/_shared/`: the two new caps exist with their values.

## Open questions

- Zernio's media items may accept alt text, which `docs/zernio-connection.md` does not settle. Read Zernio's OpenAPI first; if the field exists, Post it for me should send `alts` with each picture.
- Bold on Instagram and TikTok: the letters show there too, but captions there are short and search matters more. This spec keeps Bold to LinkedIn and Facebook. Leo decides.
- The whole-post rewrites still run on the academy writer, which this repo cannot cap or change. Moving them onto `part` with the whole post selected would put them under a cap; that is a later change.

## Related

formats-text-threads, edit-snippets, edit-score, edit-by-chat, edit-translate, publish-per-network, trust-compliance-check, brand-voice-memory, remix-any-format, business-cost-preview
