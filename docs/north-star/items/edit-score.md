# Score before posting

`edit-score` | edit | phase 7 | status: partial | /north-star#edit-score

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane shows no score on a post or clip before it goes out. Nothing in Leo's recording (notes-1 to notes-4) or the Studio > Library captures rates a draft; its Home "PACE" gauge counts views a day after posting. So the reference is the clip tools and the text schedulers below.

- FeedHive scores post text 0 to 100 before publishing, with a histogram of similar posts and four bands: "low", "mid-low", "mid-high", "high". Its model learned from 1.5M+ FeedHive posts ranked by engagement rate (engagements over views), which is why it works for small accounts too. Time, images and threads are ignored and there are no fixes; pricing calls it "AI performance prediction". [how it works](https://docs.feedhive.com/planning-and-scheduling/how-engagement-prediction-works), [pricing](https://feedhive.com/pricing)
- OpusClip gives each clip a 0 to 99 "Virality Score" built from four factors (Hook, Flow, Value, Trend), sorted highest first, on Starter and Pro only. The factors are not shown as sub-scores. [help](https://help.opus.pro/docs/article/virality-score.md)
- Quso.ai (formerly Vidyo.ai) scores clips 75 to 99 in tiers (95-99 exceptional down to 75-79 "average and may need improvement") on Trends, Hook and Flow, Engagement and Shareability, and says it is a prediction, not a guarantee. The floor of 75 makes every clip look shippable. [help](https://quso.ai/help/virality-scrore)
- VEED scores each clip out of 10 on Flow, Impact, Clarity and Relevance. [blog](https://www.veed.io/blog/introducing-clips-by-veed)
- Vizard returns `viralScore` (0 to 10) with `viralReason`, a written reason why it may engage. [API docs](https://docs.vizard.ai/docs/retrieve-video-clips.md) Klap does the same with `virality_score_explanation`; its scale is unverified. [Klap docs](https://docs.klap.app/endpoints/projects)
- Atria grades ads that are already running on a connected ad account with a letter (A, B-, C+) in plain English and names one fix ("open with the pain point"); an "Iterate" button makes new variations from that fix. It grades after spend, not before posting. [blog](https://www.tryatria.com/blog/how-to-automatically-score-and-fix-underperforming-ads)
- Creatify's Performance Agent has a "Three-persona panel" that "grades the cut and names the fix" before spend. [creatify.ai](https://creatify.ai/features/performance-agent)
- OutlierKit scores a video's hook strength, curiosity loops, pacing, emotional triggers and payoff for 10 credits. [outlierkit.com](https://outlierkit.com)
- Taplio lists "Live reach prediction before you publish" in its composer (unverified beyond the homepage). [taplio.com](https://taplio.com/) AuthoredUp shows a readability grade as you write and suggests grade 8 or lower. [authoredup.com](https://authoredup.com/)

What to take: named factors beat one bare number (VEED, OpusClip), a written reason per weak factor (Vizard), and a fix button tied to the reason (Atria). None of them checks MAS wording; ours sits beside the compliance chips.

## What we have today

Partial. Every draft in Write can be scored, but always as a text post; nothing outside Write shows a score.

- Write, `/generate` (`src/pages/GeneratePage.tsx`, state about line 1211, panel about line 3872): "Predict engagement" runs `post-score` (`supabase/functions/post-score/index.ts`, logic in `logic.ts`). The panel shows for any draft over 30 characters (`craftCheck`), whatever its format, so carousel, short-video and story drafts are scored with the text-post questions. The server refuses text under 40 characters with "Write a bit more before scoring it." and over 5,000.
- Jev (`jev-1.13.0`) answers five `noul` questions (`SCORE_QUESTIONS`); `composeScore` weighs them into a score out of 10 (first line 3, one idea 2, something concrete 2, clear ask 1.5, easy to read 1.5) and lists up to 3 factors that pulled it down. Each shows a fixed tip from `FACTORS`. Panel title "Predicted engagement", the score as "6.1/10" with no band word, InfoTip "Five checks on this draft, weighed out of 10. A guide, not a promise of reach." Colours: 7.5 and up green, 5 and up primary, under 5 amber. Nothing pulled down: "Nothing big is holding it back."
- About 820 Jev input tokens a score (US$0.00004). Cap `post-score` 40 a day. `mostlyEnglish` needs 80% Latin letters, else 422 "The score reads English posts only." Malay is written in Latin letters, so a Malay post passes this check and gets scored by a model that reads English best.
- Scores are cached on the device only, `cs-postscore-${scoped(userId)}`, 40 kept, keyed by `textKey(platform, text)` (`src/lib/postScore.ts`). My posts, the calendar and Post it for me never see them.
- Drafts have no field-by-field cleaner: `loadDrafts` in `src/lib/draftHistory.ts` parses the stored list and casts it, so any field added to `DraftEntry` arrives exactly as another device wrote it. Saved carousels are different: `sanitizeSaved` in `src/lib/carousel.ts` rebuilds each record and drops fields it does not know.
- Also in Write: the Coach rules check out of 100 (no AI), the sounds-human check (`HumanCheck`, `writing-judge`) with "Clean AI tells" and "Rewrite flagged lines", fact flags, compliance chips. The rewrite panel (`rewriteFields`, id `ask` for a free instruction) goes through `generate-social-content` (academy-hosted, no cap in this repo) and offers "Use this", "Discard" and Undo.
- `/carousel` has no score. Saved carousels (`SavedCarousel` in `src/lib/carousel.ts`, `content-studio-carousels-`) hold slides and an optional `draftId`, and no caption.
- Video: Find clips scores each clip out of 100 with Jev (`src/components/ClipFinder.tsx`, "how well it stands alone and how strongly it opens"). "Watch it like a viewer" on a finished export (`src/lib/watchCut.ts`, video-assist mode `watch`, Gemini, about US$0.07 a 40 s reel, cap `video-watch` 30) lists moments a viewer would trip on: "Slow start", "Nothing happens", "Hard to read" and others.
- Missing: questions worded for a carousel or a short-video script, a score in `/carousel`, a button that applies the fix, the score anywhere outside Write, and any check of whether the score predicts real results.

## Build

Four parts, all on top of `post-score`. No new provider, no new cap, no schema change.

### 1. One score for text posts, carousels and video scripts

- `post-score` request gains `format: "text-post" | "carousel" | "short-video"`. Missing means `text-post`, so today's caller is unchanged.
- `supabase/functions/post-score/logic.ts`: `SCORE_QUESTIONS` becomes `scoreQuestions(format)`. The five factor ids and weights stay, so `composeScore`, the cache and the colours stay. Each format words the questions for its shape (below). `scoreState(text, platform, format)` adds `format` to the state Jev reads.
- `FACTORS[id].tip` becomes `tipFor(id, format)` with one fixed tip per format. Labels stay except `readable`, which reads "Easy to follow" for video.
- What Write sends: the draft's own format. `story` drafts score as `text-post`. For non-Leo accounts Write keeps sending no format, as today.
- What gets scored:
  - Carousel in `/carousel`: the slides as "Slide 1: <title>. <body>" lines, then the caption of the linked draft when the carousel has a `draftId`. Built in the browser by `carouselScoreText(slides, caption?)` in `src/lib/postScore.ts`. `first_line` is slide 1. A carousel-format draft in Write is scored as its text, with `format: "carousel"`.
  - Short video: the script (HOOK, BODY and CTA lines as Write keeps them, `splitScriptCaption` in `src/lib/scriptCaption.ts`), then the caption. `first_line` is the hook line.
- Where it shows: Write's existing panel, and `/carousel` under the slide strip with the same panel and "Predict engagement" button.
- A translated version (`edit-translate`, a draft with `lang`) is never sent for scoring, since Malay passes the Latin-letter check. Its panel shows "Scores run on the English version." instead of the button.

### 2. Fix this

- Every factor line under the score gets a "Fix this" button.
- In Write it runs the existing rewrite path with id `ask` and the fixed instruction `FIX_ASK[format][id]` (below), so the result lands in the rewrite panel with "Use this" and "Discard" and nothing is replaced until the adviser picks it. No new AI call type: the rewrite goes through `generate-social-content` as every rewrite does. The panel title, which `rewriteLabel` sets to "Your change" for `ask`, reads "Fix: {label}" for a fix ("Fix: First line"), so `rewriteLabel` takes the label as a second argument.
- After "Use this" on a fix, Write scores the new text once by itself and the panel shows "Was 6.1, now 7.8". That is one more `post-score` use. Any later edit needs the button again, as today.
- In `/carousel`, "Fix this" shows only on `readable`, and runs the existing "Tighten with AI" (`carousel-copy`, cap `carousel` 30), which shortens every slide. Tighten never drops or merges a slide, so it cannot fix `oneIdea`; that factor and the other three show the tip only, and the adviser fixes the words in the slide boxes.

### 3. The score outside Write

- `DraftEntry` (`src/lib/draftHistory.ts`) gains `score?: { v: number; down: FactorId[]; key: string; at: string }`, where `key` is `textKey(platform, text)` at scoring time. Write saves it on the draft when it scores a saved draft. It syncs with the draft (`content-studio-drafts-`).
- Since `loadDrafts` checks no fields, a pure `currentScore(entry)` in `src/lib/postScore.ts` is the only way anything reads it: it returns the score when `v` is a number from 0 to 10, `down` holds known factor ids (at most 3) and `key` equals `textKey(platform, text)` of the text now, and null otherwise. A score whose `key` no longer matches the text is treated as missing everywhere.
- `SavedCarousel` gains the same `score`, with `key` = `textKey(platform, carouselScoreText(...))`. `sanitizeSaved` drops unknown fields, so it must keep a well-formed `score` or the field is lost on the next load.
- My posts (`src/pages/DraftsPage.tsx`): each row with a current score gets a small chip, "7.8/10", coloured as in Write, that opens `links.generate({ draft, section: "score" })`.
- Post it for me (`src/components/PostItForMe.tsx`, `PostItForMePanel`): above the send button, the chip when there is a current score; otherwise a quiet link "Score it first" that scores this text and shows the result in place, without ever blocking the send.
- The device cache `cs-postscore-` stays for text that is not saved yet.

### 4. How the score did (Leo only)

A card at the foot of `/analytics`, id `score-check`, from a pure function `scoreVsResults(drafts)` in `src/lib/postScore.ts`:

- It takes posted drafts with numbers and a current score (`currentScore`), runs each through `withReal` from `src/lib/analytics.ts` (which puts `zernio.numbers` in place of typed `metrics`), keeps only posts with impressions above 0 (`engagementRate` is 0 when impressions are unknown, which would drag either half down), splits them at the median score, and returns `{ n, ratio }`: the higher half's mean `engagementRate` divided by the lower half's, as `getTrackedPosts` works it out.
- Fewer than 10 such posts: "Needs 10 posted posts with numbers." and a button "Score my last 30 posts". It scores up to 30 posted drafts that have numbers and no current score, one `post-score` use each, showing "Scoring 12 of 30" with Cancel, and stops with the cap's own line once today's uses run out.
- This is the check Leo's Jev rule asks for: read it before changing any weight or band. Record the first result in this spec.

### Screens and states

```
Predicted engagement   6.1/10  Fair   (i)
  First line: Open with the number, the surprise or the question...   [Fix this]
  Clear ask: End with one clear ask: comment a word, send you a DM...  [Fix this]
```

- Empty: "Predict engagement" button, as today, in Write and in `/carousel`.
- Too short: under 40 characters the button is disabled and the line under it reads "Write a bit more before scoring it." (today the button shows from 31 characters and the server sends that line back).
- Not English: "The score reads English posts only." A translated version shows "Scores run on the English version."
- Scoring: "Scoring..." with the orb, shown within 400 ms; the result usually returns in 1 to 3 s.
- Done: the score and its band word, then up to 3 lines that each carry a "Fix this" button. When nothing pulled it down the panel says "Nothing big is holding it back."
- Fixing: the rewrite panel streams as usual while the score panel says "Fixing the first line..." with the factor's label in lower case.
- Fixed: the score panel shows "Was 6.1, now 7.8", or "Was 6.1, now 5.4. Discard it to keep the old one." when the new score is lower, with Undo from the rewrite panel.
- Failed: "Couldn't score it right now. Try again in a minute." (today's string), with the button back.
- Jev down: 503 "The score is unavailable for a moment. Try again shortly." The Coach rules check and the compliance chips still show.
- Over the cap: the 429 line from `usageRefusal`, "You've used all 40 for today. It resets at 8am Singapore time."
- Stale: an edit after scoring hides the score and shows the button again (the cache is per text).

### Copy

| Where | String |
| --- | --- |
| Button | "Predict engagement", "Scoring..." |
| Band words | "Strong" (7.5 and up), "Fair" (5 to 7.4), "Weak" (under 5) |
| Fix | "Fix this", "Fix: {label}" (rewrite panel title), "Fixing the {label}...", "Was {a}, now {b}", "Was {a}, now {b}. Discard it to keep the old one." |
| Chip | "{v}/10", aria-label "Predicted engagement {v} out of 10" |
| Post it for me | "Score it first" |
| Translated version | "Scores run on the English version." |
| Analytics card | Title "How the score did"; "Of your {n} posted posts with numbers, the higher-scored half got {r}x the engagement of the lower half."; "Needs 10 posted posts with numbers."; "Score my last 30 posts"; "Scoring {i} of {n}"; "Cancel" |
| InfoTip (unchanged) | "Five checks on this draft, weighed out of 10. A guide, not a promise of reach." |

Tips for the new formats (`tipFor`):

| Factor | Carousel tip | Short-video tip |
| --- | --- | --- |
| hook | "Put the number, the surprise or the question on the cover. The cover decides if anyone swipes." | "Say the number, the surprise or the question in the first 3 seconds, and put it on screen too." |
| oneIdea | "Keep the carousel to one idea, one point per slide." | "Keep the video to one idea. Give the other points their own videos." |
| specific | "Give one slide a number, a client story with no names, or a step they can take today." | "Add one concrete thing: a number, a client story with no names, or a step they can take today." |
| cta | "End on a slide with one clear ask: comment a word, send you a DM, or save it." | "End with one clear ask, said out loud and in the caption." |
| readable | "Keep each slide to a short title and two short sentences at most." | "Cut the slow parts and end soon after the last point." (label "Easy to follow") |

`FIX_ASK` instructions sent as the `ask` rewrite (text post and short video):

- hook: "Rewrite only the first line so it opens with a number, a surprise or the question the reader is asking. Keep every other line word for word."
- oneIdea: "Cut the points that are not about the main idea. Keep the first line and the call to action."
- specific: "Add one concrete detail: a step the reader can take today or a short client story with no names. Do not add any number that is not already in the post."
- cta: "Rewrite only the last line as one clear ask: comment a word, send a DM or save the post. Keep every other line word for word."
- readable: "Break it into short lines of one or two sentences and cut what is not needed. Keep every point, fact and number."

The `specific` fix forbids new numbers on purpose (MAS: no invented numbers). `rewriteFields` already tells the writer to keep everything the instruction does not ask to change, so the hook fix still keeps the rest of the post.

### Data

- `DraftEntry.score` and `SavedCarousel.score` as above, synced with their records. `currentScore` (drafts) and `sanitizeSaved` (carousels) accept `v` from 0 to 10 with one decimal, `down` with known ids only and at most 3, `key` as a string under 40 characters, and `at`.
- The device cache `cs-postscore-${scoped(userId)}` stays as it is.
- No table, no schema change.

### AI and cost

- Jev only, through `askJev` in `post-score`, pinned `jev-1.13.0`. Same five `noul` questions; the carousel and video wordings:
  - hook, carousel: "Would the cover slide in `first_line` make someone scrolling `platform` stop and swipe to the next slide?" Video: "Would the opening line in `first_line`, said in the first 3 seconds of a `platform` video, make someone keep watching?"
  - oneIdea, carousel: "Do the slides in `post` follow one clear idea, with one point per slide?" Video: "Does the script in `post` stick to one clear idea from start to finish?"
  - specific (both): "Does `post` give the viewer something concrete: a number, a real example, a short story, or a step they can take?"
  - cta, carousel: "Does the last slide or the caption in `post` ask the reader to do one specific thing next?" Video: "Does the script or caption in `post` end by asking the viewer to do one specific thing next?"
  - readable, carousel: "Can each slide in `post` be read in about 3 seconds on a phone: a short title and at most two short sentences?" Video: "Does the script in `post` move quickly, with no slow stretch, and end soon after its last point?"
  - Criteria follow today's pattern: `true` describes the strong case, `false` the weak one, in one line each.
- Thresholds: keep today's (`no` under 0.5, `doubtful` 0.5 to 0.75, bands 7.5 and 5). Before changing them, run part 4 and read the results. Jev null on any answer returns 503, as today.
- Cost: about US$0.00004 a score. A fix adds one rewrite through `generate-social-content` (academy-hosted, not capped in this repo) and one more score. "Score my last 30 posts" is at most US$0.0012.
- Caps: the existing `post-score` 40 covers all of it. No new cap in `usageCaps.ts`.
- Price chip: `post-score` is a Jev-only call, so it goes on `NO_PRICE` in `business-cost-preview`'s `supabase/functions/_shared/prices.ts` and its buttons show uses left only, no price. "Score my last 30 posts" shows "{k} uses, {n} left after this".

### Gate

- `format` other than `text-post`, "Fix this", the band words, the chips in My posts and Post it for me, the `/carousel` panel and the Analytics card show only when `leoOnly(email)` (`src/lib/leoOnly.ts`).
- On the server, `post-score` checks `isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)` (from `supabase/functions/market/logic.ts`) and answers 403 for any `format` other than `text-post` when it fails. `NORTH_STAR_USERS` is a new function secret holding Leo's two uids (the `MARKET_USERS` pattern). If another north-star item has already shipped a server gate helper, use that one.

### Deep links

Write's `?panel=` opens dialogs (shortcuts, Post it for me) and pushes, so the score panel, which sits inline, uses an anchor like the reading pages do.

| URL | Opens |
|---|---|
| `/generate?draft=<id>#score` | That draft in Write, scrolled to the score panel once the draft has drawn. It never scores by itself on load. |
| `/carousel?carousel=<id>#score` | That saved carousel, scrolled to its score panel. |
| `/analytics#score-check` | The "How the score did" card, as `/analytics#recruit-numbers` does today. |

Add an optional `section?: "score"` to `links.generate` and `links.carousel` in `src/lib/links.ts` (written as `#score`, the way `links.brand` writes its section), and rows to `docs/deep-links.md`.

## Done when

- [ ] A text post, a carousel and a short-video script each get a score out of 10 with format-worded tips, on Leo's account.
- [ ] "Fix this" on the first line puts a rewrite in the panel, "Use this" applies it, and the panel shows "Was {a}, now {b}".
- [ ] In `/carousel`, "Fix this" shows on `readable` only and runs Tighten with AI.
- [ ] A scored draft shows its chip in My posts and in Post it for me on another device, and the chip disappears once the text changes.
- [ ] A scored carousel keeps its score after a reload.
- [ ] "Score it first" in Post it for me scores without leaving the panel and never blocks sending.
- [ ] A Malay version from `edit-translate` shows "Scores run on the English version." and makes no call.
- [ ] The Analytics card shows a ratio for Leo's posted posts, and that first ratio is written into this spec.
- [ ] Non-Leo accounts see today's Write and get 403 for other formats.
- [ ] `npm run build` and the full `npx vitest run` pass; checked by eye at 390 px and 1440 px; `src/data/northStar.ts` flipped in the same commit.

## Tests

- `supabase/functions/post-score/logic.test.ts`: `parseScoreRequest` keeps `text-post` as the default and rejects unknown formats; `scoreQuestions` returns the five ids for every format with the format's wording; `tipFor` has a tip for every id and format.
- `src/lib/postScore.test.ts`: `carouselScoreText` writes "Slide N:" lines then the caption, and no caption line when there is none; `scoreVsResults` returns null under 10 posts, splits at the median, ignores scores whose `key` no longer matches the text, skips posts with no impressions, and uses `zernio.numbers` over typed metrics.
- `src/lib/postScore.test.ts`: `currentScore` returns the score for a matching key, null after the text changes, null for a `v` over 10 or an unknown factor id, and null for an older draft with no `score`.
- `src/lib/carousel.test.ts`: `sanitizeSaved` keeps a well-formed `score` and drops a broken one.
- `supabase/functions/post-score/index.test.ts` (or the logic gate helper): a non-allowed uid gets 403 for `carousel` and 200 for `text-post`.
- `src/lib/links.test.ts`: `links.generate({ draft: "d1", section: "score" })` is `/generate?draft=d1#score`, and `links.carousel({ carousel: "c1", section: "score" })` is `/carousel?carousel=c1#score`.

## Open questions

- Should the band words follow FeedHive's four bands instead of three? This spec keeps three because the colours already have three steps. Leo decides.
- A video score from the cut itself (pace, captions, the first frame) needs Gemini watching the file, about US$0.07 a run. "Watch it like a viewer" already does that after export, so this spec scores the script only. Leo decides whether a pre-export watch is worth the cost.
- If part 4 shows the higher-scored half does no better, the weights need retuning from Leo's own posts. That retune is a later change and needs his read of the numbers.

## Related

remix-compare, remix-variations, learn-post-grade, learn-format-winners, edit-text-post, edit-carousel, edit-video, trust-compliance-check, publish-schedule, plan-review-queue, edit-translate, business-cost-preview
