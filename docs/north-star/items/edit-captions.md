# Caption styles

`edit-captions` | edit | phase 3 | status: partial | /north-star#edit-captions

## Leo asked

No direct ask; from the competitor research.

Every remixed video with a voice gets captions, so the caption look ends up on almost everything the north star makes.

## How the best do it

Fastlane shows captions as one saved choice, not an editor: above the video card in chat sits a row "Captions: Classic" with the grey note "Saved for every video with a voice" (notes-4 2.3), and the made video has burned-in captions a few words at a time ("Sporadic outreach has", t275). Where the style is changed is not in the recording (unverified).

![Fastlane 4:26, Captions: Classic, saved for every video with a voice](../../../public/north-star/fastlane/t266.webp)

![Fastlane 4:35, the made video with its burned-in captions](../../../public/north-star/fastlane/t275.webp)

The caption tools:

- Submagic: pick a template after "Generate Captions" (about 40 s), then change colour, font, weight, size and emoji; words highlight, bounce or fade one at a time. Its API lists 42 templates. A custom dictionary takes up to 100 terms a request and keeps the last 1,000, and vertical exports keep captions inside the platform safe zones ([guide](https://care.submagic.co/en/article/how-to-use-submagic-step-by-step-guide-pafx7o/), [templates](https://docs.submagic.co/api-reference/templates.md), [create project](https://docs.submagic.co/api-reference/create-project.md)).
- OpusClip: an "AI Emoji" toggle adds emoji matched to the caption text, and the "AI Keyword Highlighter" in the brand template colours the spoken word and the important keywords, with a tracker colour and a keyword colour; both on Free ([help](https://help.opus.pro/docs/article/ai-emojis-keywords.md)).
- The Captions app (which includes Mirage): over 30 presets on the web and 100+ on paid plans; text, emphasis and active word colours; "AI Emphasis" underlines, emphasises or supersizes words; emoji added to keywords; words per line and lines per page; save a style as a template ([styles](https://captions.ai/help/docs/captions/styles.md), [pricing](https://www.captions.ai/pricing)).
- Descript styles the "Active word" and the "Future words" apart ([help](https://help.descript.com/visuals/captions.md)).
- Kapwing: a "Safe Zones" overlay for social apps, a characters-per-subtitle slider, and a style saved to the Brand Kit ([help](https://www.kapwing.com/help/add-captions/)).
- CapCut: "Style captions with AI" picks a style for the clip ([caption templates](https://www.capcut.com/resource/caption-template)).
- VEED flags low-confidence words to check, and its Karaoke highlight is English only ([help](https://veed.io/learn/how-to-add-subtitles-or-captions-to-a-video)).
- Seismic Social: the home office defines approved caption styles and the AI writes only inside them ([product page](https://www.seismic.com/products/livesocial/)).

## What we have today

The Captions tab of `/edit` (`tab=style`, `src/pages/VideoEditPage.tsx` around line 1897; styles in `src/lib/videoEdit.ts`):

- Six styles (`STYLES`): Bold, Golden, Minimal, Editorial, TikTok and Documentary, where the words-at-a-time styles light the spoken word.
- Controls for position (top, middle, bottom, or dragged), size from 0.6x to 1.6x, words at once (1 to 6), background (None, Dark box, Highlight word), animation (Pop, Slide up, Typewriter, None), font (Heavy, Clean, Serif), two colours, ALL CAPS and "Numbers in the highlight colour" (`highlightNumbers`, `isNumberWord`).
- A second caption line in Chinese, Malay or Tamil (cap `video-translate` 30).
- Pop-ups, which sit apart from the captions: Jev picks key lines and an emoji, and the LLM writes one line of text that pops up over them (`popups`, `src/lib/videoMotion.ts`; server side `supabase/functions/video-assist/motion.ts`, cap `motion-picks` 20). The emoji come from `EMOJI` in `motion.ts`, ten picked by the feeling of the line (warning, stop, money, growth, result, idea, time, protect, question, hot), through `emojiQuestions` and `withEmoji`.
- The post caption's comment keyword is already a Jev choice over candidate words with a `none` option (`keywordCandidates`, `keywordQuestion`, `readKeyword` in `supabase/functions/video-assist/captions.ts`), the pattern the key-word pick below follows.
- A word list fixed in every video: `content-studio-captionfixes-${scoped(userId)}` (toast "Fixed N words from your list").
- Looks and pace presets (`src/lib/stylePresets.ts`) and saved skills with a default for new videos (`src/lib/videoSkills.ts`, "New videos start with it"). AI-made videos go through the same `upload` path, so the default skill applies to them too.
- An Instagram or TikTok button guide over the preview (`guide=instagram|tiktok`), which does the job of a safe-zone overlay.

Missing: picking the one word in a line that matters (only numbers are lit), emoji inside the captions, a caption-only default, and a way to see that default where videos are made. Whisper also gets finance terms wrong until the adviser adds each fix by hand. One style is named after a platform ("TikTok"), against the north star's plain-names rule.

## Build

Five changes, all inside the existing Captions tab and video-assist.

### 1. Key words

A toggle "Light up key words" under the colour row. When it turns on, the app asks Jev once for the whole video which word in each spoken line carries the meaning. That word is drawn in the highlight colour and 1.2 times bigger in word styles, and underlined in the highlight colour in line styles, while numbers stay lit as before when "Numbers in the highlight colour" is on.

- Client: `editedSentences(words, segs, speed)` gives the lines; for each line the candidates are its words of 3 or more letters that are not in a short stop list, plus any number word, at most 12.
- New video-assist mode `keywords` (logic in a new `supabase/functions/video-assist/keywords.ts`, tested): `POST { mode: "keywords", lines: [{ text, words: string[] }], emoji: boolean }`, at most 80 lines. One question per line, sent in groups of 30 with `batches()` from `video-assist/logic.ts` and `askJev(..., { timeoutMs: 10_000 })` in parallel, as the motion and B-roll modes do (one group alone can pass Jev's 5 s default):
  - id `w<i>`, type `choice`, instructions: "A Singapore financial adviser says this line in a short video: `<line>`. Which one word carries the meaning a viewer must catch, so it is worth showing bigger in the captions?"
  - criteria: each candidate as `"the word \"<w>\""`, plus `none`: "No single word stands out; leave the line plain."
  - Proposed threshold: light the pick when its probability is 0.35 or more and it is not `none`. Set it after running 10 of Leo's edited videos and reading every pick.
- The reply `{ picks: [{ line: i, word: string | null, emoji?: string }] }` is stored on the edit as `keyWords: { at: number; emoji?: string }[]` (the source start time of each lit word).
- Jev returns null: nothing is lit, the toggle turns back off and the line reads "Couldn't pick key words right now. Try again in a minute."

### 2. Emoji on key words

A toggle "Emoji on key words", shown when key words are on. In the same request, for each line whose word is lit, a second question:

- id `e<i>`, type `choice`, instructions: "Which small picture fits this line from a financial adviser's video, if any: `<line>`?"
- criteria: the ten `EMOJI` entries from `video-assist/motion.ts`, each by its `when` line, so captions and pop-ups share one set; plus `none`: "No picture fits, or it would look out of place."
- Proposed threshold: 0.5. At most one emoji every 6 seconds, the strongest picks first.
- The code maps each key to `EMOJI[key].emoji`. The emoji draws right after the lit word at 1.1 times the caption size.
- Brand kit emoji rule (`emojiPolicy` in `src/lib/carousel.ts`): `none` hides the toggle with "Your brand kit says no emoji."; `one` keeps only the single strongest emoji.

### 3. Four more looks and plain names

New `src/lib/captionLooks.ts`: caption-only patches shown as four more tiles in the same style grid (so there is still one place to pick a look):

| id | Label | Patch |
|---|---|---|
| `boxed-word` | Boxed word | Bold, `captionBox: "word"`, font Clean, no caps, 4 words at once |
| `key-word` | Key word | the Outline style (`native`), key words on |
| `two-words` | Two words | Bold, 2 words at once, size 1.3 |
| `typewriter` | Typewriter | Minimal, `captionAnim: "type"` |

The "TikTok" style's label becomes "Outline" and the "TikTok native" preset becomes "Quick and plain"; their ids (`native`) stay, so saved edits and skills are untouched.

### 4. Use for every new video

A button "Use for every new video" at the bottom of the Captions tab. It saves only the caption keys (`captionLookOf(settings)`: style, position, captionY, size, wordsPerCaption, colours, uppercase, captions, highlightNumbers, captionBox, font, captionAnim, keyWordsOn, captionEmoji) into the default skill. If a default skill exists, its caption keys are replaced and the rest kept; if not, a skill "My captions" is made and set as the default. `withLook` already applies only the keys present.

The AI video panel (`src/components/AiVideo.tsx`) and the "Words over a video" panel (edit-text-video) show one line above their Make button, as Fastlane does: "Captions: Bold, saved for every new video."

### 5. Finance words spelled right

The transcribe call in `supabase/functions/video-assist/index.ts` (around line 150) adds to the Whisper prompt it already sends a list of Singapore finance terms: CPF, MediSave, MediShield Life, CareShield Life, Integrated Shield Plan, SRS, HDB, BTO, MAS, ILP, CPF LIFE. It then adds up to 20 of the adviser's own fixed words (the `to` side of their caption fixes), each at most 30 characters. The transcribe body is the WAV itself, so the client sends them as a query parameter beside `lang`: `?mode=transcribe&terms=<comma-separated, URL-encoded>` from `transcribe()` in `src/lib/videoProjects.ts`. The filler sample already in the prompt stays, because the editor needs the fillers to cut them, and the whole prompt stays under 800 characters. It is the same call under the same cap (`video-transcribe` 30), so it costs nothing extra.

### Screens and states

- Key words off (default): nothing changes.
- Picking: the toggle shows "Picking key words..." with the ThinkingOrb, usually 2 to 4 seconds; the preview keeps playing.
- Done: lit words show at once; a line under the toggle "{n} of {m} lines have a key word." Tapping a lit word in the Words tab (fix mode) turns it off for that line; tapping another word in that line lights that one instead.
- Words changed after picking (cuts, fixes): picks whose word was cut drop out quietly; "Pick again" appears.
- Jev unavailable: "Couldn't pick key words right now. Try again in a minute." The use is refunded.
- Over the daily cap: "You've used all 30 for today. It resets at 8am Singapore time.", with "Key words: none left today" beside the toggle.
- Emoji off by brand kit: the toggle is hidden and the line "Your brand kit says no emoji." shows in its place.
- Use for every new video: toast "New videos will start with these captions." with "Undo" (puts the previous default skill back).

### Copy

- "Light up key words", "Picking key words...", "{n} of {m} lines have a key word.", "Pick again", "Key words: {n} left today", "Key words: none left today"
- "Emoji on key words", "Your brand kit says no emoji."
- "Couldn't pick key words right now. Try again in a minute."
- Look tiles "Boxed word", "Key word", "Two words", "Typewriter"; renamed "Outline" and "Quick and plain"
- "Use for every new video"; toast "New videos will start with these captions." with "Undo"
- Panel line "Captions: {look}, saved for every new video."

### Data

- `EditSettings` gains `keyWordsOn?: boolean`, `captionEmoji?: boolean` (both in `LOOK_KEYS` and `applyPatch`) and `keyWords?: { at: number; emoji?: string }[]` (per video, not in `LOOK_KEYS`, sanitized: at most 200 entries, emoji only from the characters in `EMOJI`). They live in the project in `content-studio-videoprojects-${scoped(userId)}`.
- The default caption look is a skill in `content-studio-videoskills-${scoped(userId)}`, as today, so nothing needs a table or a schema change.

### AI and cost

- `keywords` mode: Jev only, no LLM. Up to 160 questions (a word and an emoji per line) of roughly 120 tokens is under 20,000 tokens a video, under US$0.001 at US$0.042 per million.
- New cap in `supabase/functions/_shared/usageCaps.ts`: `"caption-keywords": 30`, comment "Key words and emoji in captions (video-assist keywords): Jev only, a fraction of a cent a video." One use per press, refunded with `refundUsage` when every group comes back null.
- Price shown: as a Jev-only call it shows uses left only ("Key words: {n} left today"), the rule business-cost-preview sets for runs under US$0.005.
- Jev questions and thresholds as above, model pinned `jev-1.13.0` through `supabase/functions/_shared/jev.ts`. Jev reads English best: lines that are not mostly English (`mostlyEnglish` in `supabase/functions/post-score/logic.ts`) are sent with no question and stay plain.
- The Whisper vocabulary rides on the existing transcribe call at no extra cost.
- Server gate: mode `keywords` answers 403 `{ code: "not_allowed" }` and the `terms` parameter is ignored unless `isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)` passes (`isAllowed` from `supabase/functions/market/logic.ts`; the secret holds Leo's two uids, set by whichever north-star item ships first).

### Deep links

- No new params. The Captions tab is `/edit?p=<id>` (`tab=style` is the default), as in `docs/deep-links.md`.

### Gate

The two toggles, the four new tiles, the renamed labels, "Use for every new video", the panel line and the Whisper terms all apply only when `leoOnly(email)`, and everyone else keeps today's tab.

## Done when

- [ ] On a 60-second talking-head video on Leo's account, key words light up in all six styles and the four new looks, and export matches the preview, checked by eye at 390 px and 1440 px.
- [ ] Emoji appear at most once every 6 seconds, never when the brand kit says none, and only one with "one".
- [ ] With Jev mocked to null, the toggle turns back off with the message and the use is refunded.
- [ ] "Use for every new video", then a new upload and a new AI avatar video, both open with that caption look and their own cuts unchanged.
- [ ] "CPF", "MediShield Life" and "CareShield Life" come out spelled right in a test clip that says them.
- [ ] Another account sees today's Captions tab.
- [ ] `npm run build` and the full `npx vitest run` pass; `src/data/northStar.ts` item flipped with its `ours` line in the same commit.

## Tests

- `supabase/functions/video-assist/keywords.test.ts`: the questions have the exact wording; candidates leave out stop words and keep numbers; a pick under 0.35 or `none` gives `word: null`; emoji under 0.5 is dropped; the one-every-6-seconds rule keeps the strongest; a null Jev answer gives no picks.
- `src/lib/videoEdit.test.ts`: `keyWords` sanitizing drops unknown emoji and caps at 200; `lookOf` carries `keyWordsOn` and `captionEmoji` and never `keyWords`; `captionLookOf` holds only caption keys.
- `src/lib/captionLooks.test.ts`: each look applies through `withLook` without touching cuts, hook or frame.
- `supabase/functions/video-assist/logic.test.ts`: the Whisper prompt with terms stays under 800 characters, drops terms over 30 characters, keeps the filler sample, and is the plain filler prompt when the caller is not on `NORTH_STAR_USERS`; mode `keywords` answers 403 for that caller before any Jev call.
- `src/lib/videoProjects.test.ts`: `transcribe(wav, lang, terms)` puts `terms` in the query string, URL-encoded, next to `lang`.

## Open questions

- Plain names: "TikTok" becomes "Outline" for Leo first. Renaming it for everyone is a copy change Leo may want at once. Leo.
- Team-approved caption looks (Seismic Social) belong with trust-team-push, where a leader locks the look for advisers.
- VEED's low-confidence word flag needs per-word confidence, which the Whisper call does not return today (unverified whether `verbose_json` word timestamps carry it).
- Hard stops checked: no schema change, no new npm package, no new paid provider (Jev and Whisper are already wired in) and no auth change.

## Related

edit-video, edit-text-video, edit-slideshow, edit-translate, brand-kit, formats-talking-head, formats-clips, people-dub-lipsync, trust-team-push
