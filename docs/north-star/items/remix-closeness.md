# How close to the original

`remix-closeness` | remix | phase 1 | status: missing | /north-star#remix-closeness

## Leo asked

No direct ask; from the competitor research.

## How the best do it

FastMoss has the cleanest control. Its one-click rewrite turns an analysed TikTok script into one for your product, pulls out your product's benefits, pain points and uses, and offers "Customizable Script Similarity" with levels from close to the viral original through to differentiated storytelling. Script generation is 1 trial, then 10 or 20 attempts a day by plan. [AI TikTok video analysis](https://www.fastmoss.com/blog/ai-tiktok-video-analysis/), [pricing](https://www.fastmoss.com/pricing)

Fastlane has no control; its remix sits at one fixed level. Leo's remix of "6 Signs You Are an Abusive Wife (You might not realise)" came back as "6 Signs Your Prospecting Habit Is Costing You Deals" over "You might not realise it yet" (2:53): it kept the hook formula and the kicker, moved the topic to the brand's niche, used brand facts, and ended on a product slide (3:03). Four words of the kicker survived as they were.

![Fastlane 2:53](../../../public/north-star/fastlane/t173.webp)

Others state the line in words: Creatify's Ad Clone "doesn't copy word-for-word" ([ad clone](https://creatify.ai/features/ad-clone)); Vamos carries over hook, structure and format while "Their topic does not" ([adapt what works](https://docs.getvamos.ai/en/articles/13004958-adapt-what-works)); Revid.ai's FAQ allows a new original and rules out re-uploading other people's footage ([repurpose viral videos](https://www.revid.ai/features/repurpose-viral-videos)).

## What we have today

- Every remix sits at one level set in its prompt or brief: "Keep the mechanic and structure; do not copy the wording" (buildRemixUrl, src/lib/topPosts.ts), "New wording throughout. Never copy lines from the original." (VERSION_RULES in supabase/functions/clone-reel/logic.ts), "Do not reuse its wording, brand or claims" (buildAdWriteUrl, src/lib/adsSwipe.ts).
- Nothing measures whether a result copied the source. The only overlap check is `nearDuplicate` in src/lib/nearDuplicate.ts, shown in Write: `wordOverlap` (shared words of 3 letters or more over all words, any order) between the draft and the adviser's own 5 newest posted or scheduled posts on the same network, flagged from 60 percent. It never sees a remix source, and a word-set share cannot find a copied run of words, which is why this item adds `sharedRuns`.
- Compliance chips (src/lib/compliance.ts) and fact flags (src/components/FactFlags.tsx) run in Write, and neither looks at the source.

## Build

Build after remix-everywhere, inside its Remix sheet and `remix` function, so the `leoOnly` gate and the REMIX_USERS check cover it. It reads `dontReuse` from remix-teardown when a teardown exists. A three-step "How close" control sits in the Remix sheet, and a check after every `make` holds the line that no level may cross.

### The levels

| `close` | Label | What the writer may keep | Prompt block (CLOSE_RULES in supabase/functions/remix/logic.ts) |
| --- | --- | --- | --- |
| `loose` | "Loose" | why it worked | "Borrow only why the original worked. The hook, the order, the length and the topic are the adviser's to choose." |
| `balanced` (default) | "Balanced" | the structure and the hook's shape | "Keep the original's structure and the shape of its hook. Choose a new angle for the adviser's audience and write every line new." |
| `close` | "Close" | the structure, the hook's shape, the number of points, the length, the topic when it fits | "Keep the original's structure, the shape of its hook, its number of points and its length within 10 percent. Keep its topic if it suits the adviser's audience. Write every line new." |

The block sits after the intent block from remix-intent: the intent says what is kept, and the level says how tightly.

Every level shares the same floor, written into the prompt and checked after:

- No run of 6 or more words in a row from the source text (caption, ad copy, transcript), counted by code.
- None of the teardown's `dontReuse` items (its numbers, claims, brands, products and handles), matched by code, case-insensitive.
- No figure, promise or product claim from the source in other words either, judged by Jev.
- The shared compliance block from clone-reel, unchanged.

### The check after writing

In `supabase/functions/remix/logic.ts`:

```ts
/** Runs of at least `min` words that appear in both texts, longest first, hashtags and @handles ignored. */
export function sharedRuns(a: string, b: string, min = 6): string[]
/** dontReuse items found in the text, case-insensitive, numbers matched with and without separators. */
export function reusedItems(text: string, dontReuse: string[]): string[]
```

1. After `make` returns, the server runs both over every text field of the result.
2. If either finds something, the server makes one more OpenAI call: "These lines repeat the original: <runs and items>. Rewrite only those lines, keep everything else as it is." That second call stays inside the same `remix-make` use.
3. It checks again. Anything still found comes back as `flags.copied: string[]`.
4. In the same request, one `askJev` call (shared with remix-your-brand's `invented_self`) asks `copied_claim`, a noul: "Does `post` repeat a figure, a statistic, a promise or a product claim that appears in `source`?" with both texts in the state. A probability of 0.5 or more comes back as `flags.claim: true`. Set the threshold from the first 50 remixes by reading every answer between 0.3 and 0.7; Jev null gives no flag.

### Screens and states

```
More options                                  Balanced  v
  How close   [Loose] [Balanced *] [Close]
              Keeps the structure and the hook's shape. Every line is new.
```

- "How close" sits inside a "More options" disclosure under the format row. The disclosure's summary shows the current level, so the default stays out of the way.
- Each level shows its one-line explainer under the control; changing it updates `close` in the URL and the "What Remix does" box.
- Making: the step line "Checking it" now covers the check, and shows "Rewriting two lines that matched the original" when the second pass runs.
- Done with no flags: nothing extra.
- Done with `flags.copied`: a warning chip "Shares words with the original" above "Open it". Pressing it lists the lines. The draft saves anyway, and the matching lines are listed again when it opens in Write, under the compliance chips.
- Done with `flags.claim`: a warning chip "Uses a figure or claim from the original. Check it or take it out."
- Both flags are warnings; nothing blocks, in line with "Compliance warns by default". A team leader's switch to block or review belongs to trust-compliance-check.

### Copy

| Where | String |
| --- | --- |
| Disclosure | "More options" |
| Control label | "How close" |
| Levels | "Loose", "Balanced", "Close" |
| Explainers | "Borrows why it worked. Everything else is yours.", "Keeps the structure and the hook's shape. Every line is new.", "Keeps the structure, length and topic. Every line is new." |
| Step | "Rewriting <n> lines that matched the original" |
| Chips | "Shares words with the original", "Uses a figure or claim from the original. Check it or take it out." |
| InfoTip on "How close" | "Every level writes new words and leaves out the original's numbers and names." |
| "What Remix does" phrase | "loosely based on it", "with the same structure and new words", "close to it, with every line new" |

### Data

- `close` lives in the URL; the default is `balanced` each time.
- The draft records `remix.close` and `remix.flags` (`copied: string[]`, `claim: boolean`), the fields remix-everywhere adds, so Write can show the lines and remix-compare can mark them.
- No new key, no schema change.

### AI and cost

- No new cap. The level adds one sentence to the prompt.
- The second pass runs only when the check finds something: one more `openaiChat` call of about 0.5 to 1 US cent (unverified), inside the same `remix-make` use.
- `copied_claim` shares the one Jev call per `make` with `invented_self`; well under 0.1 US cent.

### Deep links

`?remix=<key>&close=loose` or `&close=close` sets the level and replaces the history entry; `balanced` is the default and left out. `&more=open` opens the "More options" disclosure.

## Done when

- [ ] The same source remixed at Loose, Balanced and Close gives three results that differ in how much of the order and topic they keep (read side by side on 3 sources).
- [ ] No result at any level contains a 6-word run from the source (checked by `sharedRuns` over 20 remixes from /swipe and the ads tab).
- [ ] A source with "$12,000" in its caption never gets "$12,000" or "12000" back.
- [ ] A forced fixture that copies a line triggers the second pass, and a fixture that still copies shows "Shares words with the original" with the line.
- [ ] `close` survives a reload.
- [ ] Build, full vitest, 390 px and 1440 px; northStar.ts flipped.

## Tests

- `supabase/functions/remix/logic.test.ts`: `sharedRuns` finds a 6-word run and ignores a 5-word one, ignores case and punctuation, skips hashtags and handles; `reusedItems` matches "$12,000", "12,000" and "12000"; each `close` value puts its block in the prompt after the intent block; the rewrite prompt lists only the found lines.
- `supabase/functions/remix/logic.test.ts`: the loop lives in logic.ts as `holdTheLine(result, sourceText, dontReuse, deps)`, with `deps.rewrite` (the second OpenAI call) and `deps.ask` (the `askJev` call) passed in, the way `askJev` itself takes `deps`. A first answer with a copied line calls `rewrite` exactly once; a clean first answer calls it zero times; `ask` returning null leaves `flags.claim` false. index.ts only wires the real calls in.

## Open questions

- Is 6 words the right floor? Fastlane's remix kept "You might not realise" from its source, a 4-word run that neither 6 nor 5 would catch. A floor of 4 would catch it and would also flag common phrases ("one of the most", "at the end of"). Proposed: start at 6 and read the first 50 flags before going lower.
- Should "Close" be offered on ads at all, given ads are someone's paid creative? This spec allows it because the floor still holds; Leo decides.
- 20 Oct 2026 (phase 1 build): the "Rewriting <n> lines that matched the original" step is dropped. The check and its one rewrite run inside the single remix call, so the sheet cannot see the second pass start; "Checking it" covers both. Showing it needs the function to stream its steps.
- 20 Oct 2026 (phase 1 build): CLOSE_RULES were reworded to tightness only (how closely to follow what the Keep pick keeps), so a level never contradicts an intent. The explainers under "How close" follow the rules, not the strings above: "Uses what you keep as a light guide. The rest is yours.", "Follows what you keep, with a new angle. Every line is new.", "Follows what you keep closely, down to its length. Every line is new."

- 21 Oct 2026 (dogfood fix): under Keep the structure one fixed block (beat order, number of points, length within 10 percent) outweighed Loose's light guide, so all three levels kept Aaron's 7 beats in order. The structure block now depends on the level (STRUCTURE_RULES): Loose keeps only the arc and gets the teardown's beats as ideas in any order, Balanced keeps the beat order and count with its own length, Close adds the length and keeps the topic when it suits. Loose's copy floor is 4 words (RUN_FLOOR), in the prompt and in the check; Balanced and Close stay at 6 until the first 50 flags are read.

## Related

remix-intent, remix-teardown, remix-your-brand, remix-compare, remix-everywhere, trust-compliance-check
