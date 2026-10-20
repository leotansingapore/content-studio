# Carousel editor

`edit-carousel` | edit | phase 3 | status: partial | /north-star#edit-carousel

## Leo asked

19 Oct 2026: "the idea is that one can remix any content format and the ai will regenerate"

Most remixed posts become carousels, and the adviser then fixes them slide by slide. No direct ask for the editor itself; the rest is from the competitor research.

## How the best do it

Fastlane has no carousel editor of its own. Its photo carousel is the slideshow, and that editor (one slide at a time, Slide and Text tabs, add and delete slide) is specced in `edit-slideshow`. The carousel tools:

- Taplio's carousel generator has tabs "Content" (images), "Settings" (text formatting), "Color Palette" or "Use custom colors", "Preview", drag to reorder and "Reset"; it suggests a hook slide, body slides and a CTA, 7 to 10 slides, and exports a PDF ([help](https://intercom.help/taplio/en/articles/17173404-how-to-use-the-carousel-generator)). Its composer also has "AI Edit" with "Improve this post", "Rewrite the hook", a custom instruction and a "History" that restores earlier versions ([help](https://intercom.help/taplio/en/articles/17233357-using-taplio-s-ai-for-content-inspiration)).
- Supergrow's carousel maker (Pro) is described by a third party as drag-and-drop with click-to-edit text on the slide, 50+ mobile-first templates and a brand kit; the template count and brand kit are unverified on the vendor page ([pricing](https://www.supergrow.ai/pricing), [tooliverse](https://tooliverse.ai/tools/supergrow)).
- Genviral regenerates one slide at a time (`regenerate-slide`) and has every slide checked by eye before posting ([genviral-skill](https://github.com/fdarkaou/genviral-skill)).
- aiCarousels keeps fonts legible with "Smart Auto-Resize" and offers "Predefined Colors & Fonts"; a third party says it has no custom hex colours or single fonts ([aicarousels.com](https://www.aicarousels.com/), [gtm directory](https://thegtmdirectory.com/tools/aicarousels)).
- ReelFarm sets colour, size, alignment and width per text item and an overlay opacity on the picture ([guide](https://reel.farm/guides/automate-tiktok-slideshows-with-ai)).
- PostNitro exports a PNG per slide, a PDF for LinkedIn, MP4 and an editable design; downloads are 5 a month on Free with a watermark, 30 on Starter, unlimited above ([pricing](https://postnitro.ai/pricing)).

## What we have today

The carousel maker `/carousel` (`src/pages/CarouselPage.tsx`, 1,384 lines; `src/lib/carousel.ts`, `src/lib/carouselLayout.ts`, `src/lib/carouselRender.ts`):

- Every slide is a card in one long list: "Hook" or "Title" with a word counter (6 words on the cover, `COVER_HOOK_WORDS`), "Text" with a counter (40 words, `WORDS_PER_SLIDE`), a role chip (Cover, Point, Call to action, Recap), compliance flags (`scanCompliance`), an overflow line ("Too much text to fit, so the slide cuts it off. Shorten it."), and picture buttons ("Add a picture", "From media", "Remove picture").
- Reorder with up and down arrows (`moveSlide`), delete (`removeSlide`, at least 2), "Add a slide" (at most 10, `MAX_SLIDES`).
- "Tighten with AI" rewrites every slide at once (`tightenSlides` in `src/lib/carouselCopy.ts` calling `carousel-copy`, gpt-4.1, MAS rules in the prompt, cap `carousel` 30) and adds a recap slide when the carousel has 4 to 9 slides (`recapFits`); "Undo AI changes" brings back the version before it. The function counts the use before the call and does not give it back when OpenAI fails (no `refundUsage` in `carousel-copy/index.ts`).
- The "Topic" tab writes a carousel from a topic or a pasted article with one streamed post (`streamOnePost`), saves it to My posts and splits it into slides.
- A deleted saved carousel already has a toast with "Undo" (`deleteSaved`); a deleted slide does not.
- The preview grid on the right is 2 across; tapping a slide scrolls to its card.
- The look: brand colour, three fonts, three papers, left or centred, text size. Saved carousels per brand in `content-studio-carousels-${scoped(userId)}` (latest 20) reopen with their edits; work in progress is kept in `cs-carousel-work-${scoped(userId)}` (sessionStorage).

Missing: on a phone the preview sits below up to ten cards, far from the field being typed in; there is no way to rewrite one slide; deleting a slide or retyping one cannot be undone (only the AI rewrite has Undo); and there is no duplicate (designs and sizes belong to formats-carousel-designs).

## Build

Four changes on the existing page. The Design and Size rows from formats-carousel-designs sit in the same toolbar when both ship; this item does not build them.

### 1. One slide at a time

A view switch above the slides, "All slides" (today's list) and "One at a time". In "One at a time" the slide's picture is drawn large, with its fields directly under it:

```
[All slides] [One at a time]                         Undo  Redo
        <   +-------------------+   >
            |   slide 3 of 7    |
            +-------------------+
            o o * o o o o
Title  [ The 3 CPF top-ups people forget          ]
Text   [ ...                                       ] 31/40 words
[Rewrite this slide v]  [Duplicate]  [Move left] [Move right]  [Delete]
```

- Prev and next buttons and the dots move between slides; arrow keys do too when no field has focus.
- On phones (under `lg`) "One at a time" is the default; on large screens "All slides" stays the default.
- The fields, flags, overflow line and picture buttons are the same components the list uses, pulled out of the list item into `src/components/carousel/SlideFields.tsx` so both views share them.

### 2. Rewrite one slide

"Rewrite this slide" opens a small menu: "Shorter", "Plainer words", "Stronger hook" (cover slide only), "Your own ask..." (a 200-character field). The result shows under the fields as a suggestion with its own compliance chips and "Use this" | "Keep mine", so the adviser's words are never replaced without a tap. "Use this" goes on the undo stack.

Server: `carousel-copy` gains `mode: "ask"`:

- Request `{ mode: "ask", ask: string, index?: number, platform, slides: [{ texts: string[] }] }`, 2 to 10 slides with 1 to 6 texts each. For a carousel, text 1 is the title and text 2 the body. The generic shape lets edit-slideshow's boxes and edit-by-chat use the same mode.
- With `index`, only that slide comes back; without it, every slide comes back in the same order and count. Reply `{ slides: [{ texts }], reply: string }`, where `reply` is one plain sentence saying what changed.
- `buildAskPrompt` in `supabase/functions/carousel-copy/logic.ts` reuses the MAS rules already in `buildCarouselPrompt` (no promised returns, no "risk-free", no named insurer or product, no invented numbers) and treats `ask` and the slide texts as material, never instructions. `validateAsk` checks counts, at most 14 words in a title, 40 in other texts, no em dashes.
- "Stronger hook" on the cover asks the LLM for three hooks, and Jev picks one with the question Write already uses: `hookState`, `hookQuestions` and `readHookPick` in `supabase/functions/writing-judge/logic.ts`, called the way video-assist `hooks.ts` does (`hooksState`, `hooksPick`), with the other slides' words as the topic. When Jev returns null, a tie or the hooks are mostly not English (`mostlyEnglish`), the first hook is used.
- The use is counted before the OpenAI call and given back with `refundUsage(admin, uid, "edit-ask", day)` when the call fails or the reply does not validate.

### 3. Undo and redo for everything

A history stack in the page (20 steps, in memory) for every slide change: typing (one step per pause of 800 ms), reorder, add, duplicate, delete, picture, AI rewrite. "Undo" and "Redo" buttons in the toolbar, Cmd or Ctrl+Z and Shift+Cmd or Ctrl+Z. Deleting a slide also shows a toast "Slide 4 deleted" with "Undo". The existing "Tighten with AI" Undo keeps working, as one step on the same stack.

### 4. Duplicate

"Duplicate" copies the slide with a new id right after it (`duplicateSlide` in `src/lib/carousel.ts`), disabled at 10 slides.

### Screens and states

- Rewriting: the suggestion area shows the ThinkingOrb and "Rewriting slide 3..."; the fields stay editable.
- Suggestion ready: the new title and text with chips, "Use this" (primary) and "Keep mine".
- Nothing to rewrite: the menu is disabled on an empty slide with "Add words first."
- Over the daily cap: the server's words, "You've used all 60 for today. It resets at 8am Singapore time.", and the menu shows "Rewrites: none left today".
- Not switched on (503): "Rewriting isn't switched on yet."
- Failed or unusable reply: "Couldn't rewrite that slide. Try again in a minute." The use is refunded (`refundUsage`).
- Undo at the start of history and Redo at the end: disabled.
- At 10 slides: "Duplicate" and "Add a slide" disabled with the existing line "10 slides is the most a carousel should have."

### Copy

- View switch "All slides", "One at a time"
- "Undo", "Redo"
- "Rewrite this slide", "Shorter", "Plainer words", "Stronger hook", "Your own ask...", placeholder "Say what to change, like: end on a question"
- "Rewriting slide {n}...", "Use this", "Keep mine"
- "Add words first.", "Rewrites: {n} left today", "Rewrites: none left today"
- "Rewriting isn't switched on yet.", "Couldn't rewrite that slide. Try again in a minute."
- "Duplicate", "Move left", "Move right", "Delete"
- Toast "Slide {n} deleted" with "Undo"

### Data

- No new stored data and no schema change: the view and slide live in the URL, the history is in memory, and saved carousels keep their shape (`SavedCarousel` unchanged).

### AI and cost

- `carousel-copy` mode `ask`: one gpt-4.1 call through the function's existing `openaiFetch` path, roughly 700 tokens in and 100 out, about US$0.002 a rewrite (estimate from list prices; unverified against the bill). "Stronger hook" adds one Jev call through `writing-judge` logic, a fraction of a cent.
- New cap in `supabase/functions/_shared/usageCaps.ts`: `"edit-ask": 60`, with the comment "Change carousel or slideshow words by asking (carousel-copy mode ask), about 0.2 US cents a call." edit-by-chat uses the same cap when it changes a carousel or a slideshow. A new key in `DAILY_LIMITS` needs no SQL: `cs_consume_ai_usage` counts any feature name.
- Jev rule for the hook pick: `readHookPick` asks the choice twice (as written and reversed) and takes the leader only when it beats the runner-up by `PICK_MARGIN` 0.2; otherwise null and the first hook. That is today's rule in Write and `hooks.ts`, set from a shadow check on 2026-10-08, so no new threshold.
- Price shown: the "Rewrite this slide" button carries business-cost-preview's `PriceChip` with feature `edit-ask` once that ships (add `edit-ask` at about US$0.002 to its price table). Until then the line "Rewrites: {n} left today" sits beside the button.
- Server gate: mode `ask` answers 403 `{ code: "not_allowed" }` unless `isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)` passes (`isAllowed` from `supabase/functions/market/logic.ts`, the `MARKET_USERS` pattern; the secret holds Leo's two uids). That is the server gate the other north-star specs use; whichever item ships first sets the secret.

### Deep links

| URL | Opens |
|---|---|
| `/carousel?carousel=<id>&view=one` | That carousel, one slide at a time |
| `/carousel?carousel=<id>&view=one&slide=3` | On slide 3 (1-based; 1 left out) |
| `/carousel?carousel=<id>&view=all` | The list view, written only on phones where `one` is the default |

View and slide changes replace the history entry. Add `view` and `slide` to `links.carousel` in `src/lib/links.ts` and rows to `docs/deep-links.md`.

### Gate

The view switch, Undo and Redo, Duplicate and "Rewrite this slide" show only when `leoOnly(email)`. Everyone else keeps today's page.

## Done when

- [ ] On Leo's account at 390 px, a 7-slide carousel opens one slide at a time with the fields under the picture; at 1440 px the list stays the default. Checked by eye.
- [ ] Each rewrite option returns a suggestion in under 10 seconds, "Use this" applies it and Undo takes it back.
- [ ] "Stronger hook" picks one of three hooks through Jev, and still works with Jev mocked to null.
- [ ] Deleting a slide, then Undo, brings it back with its picture.
- [ ] A 61st rewrite in a day gets the cap message; a forced bad reply refunds the use.
- [ ] Another account sees today's page with no new controls.
- [ ] `npm run build` and the full `npx vitest run` pass; `src/data/northStar.ts` item flipped with its `ours` line in the same commit.

## Tests

- `supabase/functions/carousel-copy/logic.test.ts`: `parseCarouselRequest` accepts mode `ask` with and without `index`, refuses an index out of range, more than 6 texts, an empty ask; `validateAsk` refuses a wrong count or a title over 14 words; the prompt contains the MAS lines and marks the ask as material. The existing source-reading test (it already finds `consumeUsage(admin, uid, "carousel")` in `index.ts`) also checks that mode `ask` consumes `edit-ask`, calls `refundUsage` on a failed or unusable reply, and checks `NORTH_STAR_USERS` before any OpenAI call.
- `src/lib/carousel.test.ts`: `duplicateSlide` inserts after and gives a new id; refuses at 10.
- `src/lib/carouselHistory.test.ts` (new, for the pure undo stack in `src/lib/carouselHistory.ts`): push, undo, redo, a push after undo drops redo, 20 steps kept.
- `src/lib/links.test.ts`: `links.carousel({ carousel: "c1", view: "one", slide: 3 })`.

## Open questions

- Drag to reorder (Taplio) is left out: the arrows work on phones and keyboards, and HTML drag does not work on touch. Add it on large screens if Leo misses it.
- Undo for deletes is a fix every user would want. It ships behind the gate with the rest; turning it on for everyone is Leo's call.
- "Tighten with AI" keeps the use when OpenAI fails, against the refund rule. Giving it back changes a live feature for everyone, so it waits for Leo's word; the new `ask` mode refunds from day one.
- Hard stops checked: no schema change, no new npm package, no new paid provider (OpenAI and Jev are already wired in), and no auth change beyond reading the existing allowlist pattern.

## Related

formats-carousel-designs, edit-slideshow, edit-by-chat, edit-design-canvas, edit-translate, remix-any-format, trust-compliance-check, brand-kit
