# Many versions from one source

`remix-variations` | remix | phase 7 | status: partial | /north-star#remix-variations

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane lists "Winner variation" among the formats on its homepage, and its learning loop promises "Winner found. 6 variations made." when a post beats the account's averages ([usefastlane.ai](https://usefastlane.ai)). The homepage also shows a batch of "30 ads ready" with "Approve all". None of this appears in Leo's recording, so the screens are unverified. Its free hook tool takes 5 fields (Product, Audience, Pain, Outcome, Timeframe) and returns "30 hook structures filled with your words" across 11 hook types ([hook generator](https://usefastlane.ai/tools/hook-generator)).

Others, best first:
- Arcads keeps the body and swaps the hook: you make several spoken hooks with the same actor and voice, then "Stitch Videos" joins each one to the main body. "Text Overlay" adds headline hooks and "Replace Actor" changes the person while the script and timing stay. Stitch and Text Overlay cost 0 credits; Replace Actor costs 500 (800 on the credits page) ([hook variations](https://help.arcads.ai/en/articles/17595001-hook-variations), [credits](https://help.arcads.ai/en/articles/13725589-how-are-credits-counted)).
- Foreplay's brief writer has "Regenerate Versions", which "creates new hooks, CTAs and copy variants for split tests" ([briefs](https://www.foreplay.co/briefs)).
- Predis.ai makes variants of the hook, headline or visual to test, in 19+ languages ([features](https://predis.ai/features/)).
- SocialBee keeps unlimited variations of the same post that rotate each time it is reshared, on all plans ([features](https://socialbee.com/features/)).
- MakeUGC batch mode makes 10 variations at once; parallel jobs are 1 on Starter, 10 on Growth, unlimited on Pro ([pricing](https://www.makeugc.ai/pricing)).
- Captions' Remix Video makes one video per selected actor, with a new hook, a translation or a rewrite of the script ([help](https://captions.ai/help/mirage/step-3-generate-edito-share/remix-video.md)).
- InVideo batches ten hooks with different angles on one AI creator ([UGC ads](https://invideo.io/make/ugc-ads/)).

## What we have today

- Write (`src/pages/GeneratePage.tsx`) is hooks first. "Pick a hook" writes one hook per named formula, each in its own `generate-social-content` call with `hookFormulaFields` (21 formulas in `src/lib/hookFormulas.ts`, rotated by `hookFormulaSet`), and Jev marks one "Recommended" (`writing-judge` mode `hooks`, cap `writing-judge` 60). Then "Three variations" writes three bodies around the chosen hook, with "Re-roll 3".
- Picking a variation saves it as its own draft (`handlePickVariant`, around line 1805); picking another forks another draft. Nothing groups them, and the ones never picked are lost when the user moves on.
- Platform versions ("adapt", `runAdapt`, saved by `saveVersion`) save one draft per network. Clone a reel returns 3 concepts with each clone (cap `reel-clone` 20) and hook options by formula; writing the version of a second or third concept is its own call on cap `reel-concepts` 20. One long piece (`src/components/LongPiece.tsx`, `idea-dump` mode `long`) writes 5 posts with 5 different formulas (cap `repurpose-long` 20).
- Analytics already breaks results down by hook formula (`src/lib/analytics.ts`, `analyticsFormula.test.ts`).
- Missing: keep a body and change only its hook; a saved set of versions; a hook test that spreads the versions out and says which hook won.

Status partial.

## Build

Four pieces: a versions choice in the Remix sheet from `remix-everywhere`, then three in Write and My posts, for text posts, carousel text and short-video scripts. Spoken hook swaps on a finished video (the Arcads move) wait for `formats-hook-demo`.

### Screens and states

0. The Remix sheet gets a row "Versions" with two chips, "1" (default) and "3". Neither the sheet nor its job exists yet; both come from `remix-everywhere`, so this step waits for it. With 3, the remix job (`src/lib/remixJob.ts`) sends three `make` requests one after another, each with a different hook formula from `hookFormulaSet`, and saves the three drafts under one `set` of kind `versions` with `from` set to the source key. The button reads "Remix 3 versions", the uses-left chip counts 3, and with fewer than 3 uses left the "3" chip is disabled with its reason under it. Done shows "3 versions are ready" with "Open them" (`/drafts?set=<id>`).

1. In the "Three variations" card header, beside "Re-roll 3", a button "Keep all 3" saves every variation as its own draft under one `set` id of kind `versions`, then a toast says "3 versions saved to My posts" and its "Open" action goes to `/drafts?set=<id>`.

2. On the draft card, in the row of rewrite buttons, "Try new hooks" opens a panel under the card:

   ```
   New hooks for this post (i)
   Writing 3 new hooks...                      <- under 400 ms after the tap
   ---------------------------------------------------------------
   Number reveal   "I reviewed 40 young families' plans this year..."  Recommended
                   [ Use this one ]  [ Save as a version ]
   Contrarian      "..."
   Mistake         "..."
   ---------------------------------------------------------------
   [ Save all as a hook test ]
   ```

   It sends the same requests "Pick a hook" sends (mode `hooks`, `n: 1`, `hookFormulaFields`), one per formula, but into the panel's own rows: add a third target `"newHooks"` to `runStream` and `streamRows` with its own state, because the existing targets write over the brief's hook rows and variations. `runStream` aborts whatever stream is in flight (`abortControllerRef`), so "Try new hooks" is disabled while Write is streaming, with the reason "Wait for the current writing to finish." under it. The formulas are the 3 that follow the draft's own `hookFormula` in `HOOK_FORMULAS`, wrapping round (`otherFormulas(own)` in `variants.ts`); a draft with no formula uses `hookFormulaSet(hookSetRef.current++)`. The body goes in through `ideaContext`: "Write a new opening line for this finished post. Keep it under 25 words. The body below stays exactly as it is, so the line must lead into it.\n\n{body}". `splitHook(draft, hook)` takes the first line off the draft when it matches `draft.hook`. Jev's existing `writing-judge` hooks pick tags one "Recommended".
   - "Use this one" swaps the first line in this draft, with an "Undo" toast. `persistDraftEntry` looks the formula up in the brief's hook rows (`formulaOfHook(hookText, hookOptions)`), which do not hold the panel's hooks, so give it an optional `formula` argument and pass the row's formula.
   - "Save as a version" saves a new draft: the new hook plus the same body, the same `set` id, and a copy of the parent's `source`.
   - "Save all as a hook test" saves the current draft and the three new ones as one set of kind `hook-test`.

3. My posts filtered to a hook test (`/drafts?set=<id>`) gets a header card above the list:

   ```
   Hook test: 4 versions of one post
   Posts each version 3 days apart in your open slots.   [ Spread them out ]
   Waiting for numbers on 2 of 4
   ```

   "Spread them out" puts each unscheduled version on the next open posting slot (`src/lib/postingSlots.ts`) at least 3 days after the one before, on the parent's network, and never moves a post that is already scheduled. When every version has numbers (typed metrics or `zernio.numbers`), the card ranks them by engagement rate when all have impressions, else by total engagements. The top one shows as "Winner so far" when it leads the next by 15 percent or more; otherwise "Too close to call". "Make 3 more like the winner" opens the hooks panel on the winner with `hookFormulasFrom(winner.hookFormula)`, so the first new hook keeps the winning formula and the other two are the formulas after it.

States:
- Sheet, fewer than 3 remixes left today: the "3" chip is disabled with "Needs 3 remixes left today."
- Sheet, one of the three fails: the other two are kept, the failed use is refunded by the server, and the done line reads "2 of 3 versions are ready" with "Try the last one again".
- With no set there is no card, and a set left with 1 draft after deletes shows no header.
- Loading: the panel shows "Writing 3 new hooks..." at once and fills rows as each stream lands.
- Done: rows with their buttons; the Recommended tag appears when Jev answers.
- Failed: "Couldn't write new hooks. Try again." with "Try again"; rows already written stay.
- Refused (session expired, 401): the message Write already shows for that.
- Over the daily cap: `generate-social-content` has no cap in this repo, so the rows still come; when `writing-judge` is over its cap, the Recommended tag is left off without a message.

### Copy

- Sheet row: "Versions", chips "1" and "3"; button "Remix 3 versions"; disabled reason "Needs 3 remixes left today."
- Sheet done: "3 versions are ready" with "Open them"; partial: "2 of 3 versions are ready" with "Try the last one again"
- "Keep all 3"
- Toast: "3 versions saved to My posts", action "Open"
- Draft card button: "Try new hooks"; disabled reason while Write streams: "Wait for the current writing to finish."
- Panel title: "New hooks for this post", InfoTip: "Only the first line changes. The body stays the same."
- Loading: "Writing 3 new hooks..."
- Tag: "Recommended"
- Row buttons: "Use this one", "Save as a version"
- Panel button: "Save all as a hook test"
- Toasts: "Hook changed" (action "Undo"), "Saved as a version", "Hook test saved: 4 versions" (action "Open")
- Error: "Couldn't write new hooks. Try again." Button: "Try again"
- Set headers: "Hook test: {n} versions of one post", "Versions: {n} from one post"
- Helper (a rule, so it stays visible): "Posts each version 3 days apart in your open slots."
- Button: "Spread them out"; toast "Scheduled {n} versions, {d MMM} to {d MMM}"
- Result lines: "Waiting for numbers on {n} of {total}", "Winner so far: {first words of the hook}", "Too close to call"
- Button: "Make 3 more like the winner"

### Data

- `DraftEntry` gains `set?: { id: string; kind: "versions" | "hook-test"; from?: string }`, where `from` is the parent draft id or the source key. It syncs inside `content-studio-drafts-<scoped uid>`. No schema change.
- Write rebuilds the entry from its own fields on every save (`persistDraftEntry`, `saveVersion`), and those do not include `set`. Keep it in `upsertDraft` the way `labels` and `metrics` are kept today: when the incoming entry has no `set` key, copy the stored one.
- Every version copies the parent's `source` (`remix-source-trail`) and records its own `hookFormula`, so Analytics' formula breakdown counts it.
- Helpers in a new `src/lib/variants.ts`: `splitHook`, `joinHook`, `otherFormulas`, `hookTestResult`, `spreadSlots`, `draftsInSet`. `spreadSlots` builds on `openSlots` in `src/lib/postingSlots.ts`.

### AI and cost

- Sheet versions: three `make` calls to the `remix` function, each charged once on `remix-make` (about 1 to 2 US cents each, per `remix-everywhere`). The `make` request gains one optional field, `formula` (a `HOOK_FORMULAS` id), which `supabase/functions/remix/logic.ts` turns into the same rule text `hookFormulaFields` writes in Write.
- `generate-social-content` mode `hooks`, three calls of n=1, the same calls "Pick a hook" makes today. It runs on the academy project (gpt-4.1 per the 2026-09-15 snapshot) and has no cap in this repo. About US$0.002 to US$0.005 a run (unverified).
- Jev: the existing `writing-judge` mode `hooks` question, unchanged, on cap `writing-judge` 60.
- "Keep all 3", the hook test ranking and "Spread them out" use no AI. Ranking is a measurement, so it does not go to Jev.
- No new edge function and no new cap.
- Price chips: until `business-cost-preview` ships, "Remix 3 versions" carries the uses-left chip. After it ships, that button shows `<PriceChip feature="remix-make" uses={3} left={...} />`, and "Try new hooks" shows the same "About US$0.01" chip that spec gives Write's own generation, Leo only.

### Deep links

- `?remix=<key>&versions=3` opens the sheet with 3 picked (replace; the default 1 is left out).
- `/drafts?set=<id>` filters My posts to one set (replace), through a new `set?: string` on `links.drafts`.
- `/generate?draft=<id>&panel=hooks` opens the new hooks panel (push, so Back closes it); `"hooks"` joins the `panel` union in `links.generate`.
- All three go into `docs/deep-links.md`: `versions` on the remix row, the other two in their page tables.

## Done when

- [ ] "Remix 3 versions" in the sheet saves three drafts in one set, each opening with a different hook formula, and uses 3 of the day's remixes.
- [ ] "Keep all 3" saves three drafts in one set and the toast opens them filtered.
- [ ] "Try new hooks" shows its loading line within 400 ms, writes 3 hooks with formulas other than the draft's own, and the body of each saved version is byte-for-byte the parent's body.
- [ ] "Use this one" swaps the hook and Undo puts the old one back.
- [ ] A hook test of 4 spreads to 4 open slots at least 3 days apart and never moves an already scheduled post.
- [ ] With numbers on all versions the card names the winner, or says "Too close to call" under a 15 percent lead.
- [ ] Every new button and card shows on Leo's sign-ins only; others see Write and My posts as they are today.
- [ ] Checked by eye at 390 px and 1440 px.
- [ ] `src/data/northStar.ts` item flipped (status and `ours`) in the same commit, and this spec's status line ticked.

## Tests

- `src/lib/remixJob.test.ts`: a run with `versions: 3` sends three requests with three different formulas and saves three drafts sharing one `set`; one rejected request keeps the other two.
- `supabase/functions/remix/logic.test.ts`: a `formula` in the request puts that formula's rule in the prompt, and an unknown id is ignored.
- `src/lib/variants.test.ts`: `splitHook` removes a first line equal to the hook and leaves the draft whole when the hook is not its first line; `joinHook` puts them back with one blank line.
- In the same file, `hookTestResult` returns waiting, too close (14 percent lead) and winner (15 percent); it ranks by engagement rate only when every version has impressions.
- `spreadSlots` returns dates 3 or more days apart, skips days that already hold a scheduled post on that network, and never returns a past date.
- `src/lib/draftHistory.test.ts`: `set` survives `upsertDraft`, a save from Write that leaves it out, and a reload; `draftsInSet` returns only that set.
- `src/lib/variants.test.ts`: `otherFormulas("give-it-away")` returns 3 ids, none of them `give-it-away`, wrapping to the start of the list.
- `src/lib/links.test.ts`: `links.drafts({ set })` and `links.generate({ draft, panel: "hooks" })`.

## Open questions

- My posts keeps 50 drafts per brand and drops the oldest first (`MAX_DRAFTS` in `draftHistory.ts`). A hook test adds 4, which can push out old posted posts that hold numbers. Raising the cap or sparing posts with numbers changes shared code: Leo decides.
- A hook test posts one body several times on one network. `src/lib/nearDuplicate.ts` flags a draft that shares 60 percent of its words with one of the 5 newest posted or scheduled posts on that network, because Instagram and Facebook show near copies to fewer people, so versions 2 to 4 will carry that warning. Leo decides whether a hook test stays on one network (as built here) or spreads the versions across networks.
- `generate-social-content` is uncapped from this repo because it is not deployed from here. Adding a cap means changing the academy project, which is Leo's call.
- Posting the versions for real goes through Post it for me, which is still gated to `SOCIAL_CONNECT_USERS`.

## Related

remix-own-winners, remix-patterns, remix-source-trail, learn-format-winners, publish-recycle, formats-hook-demo, edit-text-post
