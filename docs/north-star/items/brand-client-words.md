# Your clients' own words, kept and used in your hooks

`brand-client-words` | brand | phase 4 | status: partial | /north-star#brand-client-words

## Leo asked

No direct ask. From the Senna research Leo asked SearchBlueprint's Atlas session to share on 27 Oct 2026 (`~/Documents/seo-audit-tool/docs/north-star/research/senna.md`, S5).

## How the best do it

Fastlane's "Claude for Ads" launch video (posted 26 Oct, https://x.com/UseFastlane/status/2114554988374720913), at 0:22. The frame is `~/Documents/sb-north-star-research/screens/claude-for-ads-0m22-reading-reviews-saved-to-memory.jpg`, kept out of the repo.

- A heading, "Reading 12,000+ reviews", over the three sources: Reddit, Amazon, Google.
- Three cards: a post from r/Supplements, an Amazon "Verified buyer" two-star review and a Google review from a Local Guide.
- Each card carries a theme tag ("Energy", "Taste", "Convenience") and the customer's exact words highlighted: "I still crash at 3pm", "Tastes like lawn clippings", "Easiest habit".
- A green tick under them: "Saved to memory".
- Its home page says Senna reads "thousands of reviews across Reddit and Amazon"; the video adds Google.
- The same video's angles then name their source, "Beat the 3pm slump" tagged "from reviews" (S6, plan-angles), so a phrase a customer used becomes the angle a post is written on.

Others:

- Atria mines competitor URLs and reviews for ad concepts (plan-angles).

## What we have today

Checked against ns/phase7 at 8664c00d on 27 Oct.

- Real questions: `src/lib/sgFeeds.ts` reads `src/data/realQuestions.json`, the questions asked this fortnight on r/singaporefi and HardwareZone Money Mind, each with its link, source, date and the Plan audience Jev judged. They are written by `scripts/sg-feeds.mjs` on Leo's Mac and shown in Write as a list to pick from (`src/components/RealQuestions.tsx`); the plan writers get Your market's questions instead (`questions: loadMarket(userId).questions`, `src/lib/angleSuggest.ts:183`).
- Facts: /voice keeps up to 20 facts the AI may state (`src/lib/voiceMemory.ts`, MAX_FACTS), which is Fastlane's Proof in our words.
- Missing: nothing reads reviews or comments for themes, no exact phrase is kept with its source, and no writer is told how clients say a thing. A question's wording reaches Write only when that question is picked.

## Build

Gate: `useLeoOnly()` on the page section, `NORTH_STAR_USERS` on the server.

### Screens and states

A section on /voice, "How clients say it", under the facts.

```
How clients say it                                   [Add reviews or comments]
Fees          "I don't even know what I'm paying for"      r/singaporefi, 12 Oct   [Remove]
Insurance     "my agent disappeared after I signed"        pasted, 20 Oct          [Remove]
Retirement    "CPF alone won't cut it, right?"            HardwareZone, 18 Oct    [Remove]
```

- Empty: "Paste reviews or comments and the studio keeps the words clients use." with the Add button. The forum questions fill it on the first visit, so most brands are never empty.
- Add: a box takes pasted text (Google reviews, comments, DMs with names removed), up to 5,000 characters. Reading shows "Reading..." on the button.
- Read: themes appear with one phrase each and where it came from. Toast "{n} phrases kept." with Undo.
- Nothing kept: "Nothing in there reads like a client talking. Try comments or reviews."
- Each row: Remove with Undo. Up to 30 rows per brand; at 30 the Add button reads "Full (30). Remove one first."
- Every writer's prompt gets up to 5 phrases for the post's audience. A post written with one shows "Uses: 'I don't even know what I'm paying for'" under the hook in Write.

### Copy

- "How clients say it", "Add reviews or comments", "Reading...", "{n} phrases kept.", "Remove"
- "Paste reviews or comments and the studio keeps the words clients use."
- "Nothing in there reads like a client talking. Try comments or reviews."
- "Full (30). Remove one first."
- "Uses: '{phrase}'"

### Data

- `content-studio-client-words-${scoped(userId)}`: `{ id: string; theme: string; phrase: string; source: "forum" | "pasted"; url?: string; at: string; audience?: string; offAt?: string }[]`, synced per brand. Remove sets `offAt` and keeps the row, so Undo and cross-device sync need no tombstone.
- Pasted text itself is not stored; only the kept phrases.
- No schema change.

### AI and cost

- One idea-dump call per read (gpt-4.1, the function's model): lists candidate phrases with a theme each, copied exactly from the text.
- Jev then keeps each candidate: one noul per phrase, "Is this a client or prospect describing their own worry, wish or experience in their own words?" (0.6), and one noul, "Does this phrase name a person, a firm or an insurer's product?" (drop at 0.5). Code checks every kept phrase appears in the source text word for word.
- New cap `client-words`, 5 a day, about US$0.01 a read, refunded when OpenAI fails.
- Writers: `clientWordsLine()` beside `memoryLine()` in every writer's context, the phrases framed as "how clients put it; use the feeling, never quote it as a review". Jev picks which 5 fit the post's audience when there are more.

### Deep links

- `/voice#client-words` opens the section.
- `/voice?words=add` opens the Add box (push). Add both to `docs/deep-links.md`.

## Done when

- [ ] On Leo's sign-in /voice shows phrases from the forum questions on the first visit, each with its source and date.
- [ ] Pasting ten Google reviews keeps only the clients' own words, word for word, with no names and no insurer products.
- [ ] A Write draft for an audience with kept phrases shows which phrase it used, and the post never presents it as a testimonial.
- [ ] Remove and Undo work and survive a second device.
- [ ] Other sign-ins see no section.
- [ ] `npm run build`, the full `npx vitest run`, and a look at 390 px and 1440 px pass.
- [ ] The item in `src/data/northStar.ts` flipped with its `ours` line in the same commit.

## Tests

- `src/lib/clientWords.test.ts`: the store keeps 30 at most, Remove keeps the row with `offAt`, a phrase not found word for word in its source is dropped.
- `supabase/functions/idea-dump/logic.test.ts`: the new mode refuses empty text and text over 5,000 characters; the Jev reading drops names and products at 0.5 and keeps client voice at 0.6.
- Break each case once to prove it bites.

## Open questions

- May a post quote a client's words at all, or only use the feeling (asked back as a question, "Still not sure what you're paying for?")? This spec takes the second until Leo or a compliance reader says otherwise.
- Should the studio read the adviser's own Google reviews by itself once a listing is known (a paid DataForSEO read) instead of pasting? That spends money, so Leo decides.
- Fastlane saves each finding "to memory". Ours lives on /voice beside the facts; should the agent's memory answer ("what do you remember") list them too?

## Related

brand-voice-memory, plan-angles, find-news-questions, brand-audiences, remix-your-brand, trust-compliance-check
