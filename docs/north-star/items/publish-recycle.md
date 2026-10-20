# Recycle evergreen posts

`publish-recycle` | publish | phase 7 | status: partial | /north-star#publish-recycle

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane shows no recycling in the recording or its public captures.

- Publer recycles evergreen posts into open slots on a cadence: a gap and a unit (day, week, month), a start date, and a stop after N reposts or an end date. The least recently posted goes first, and never-posted before posted. It recommends Spintax, and X, Pinterest and Google Business need 10 or more variations. Not on YouTube, TikTok or WordPress. Business plan. [docs](https://publer.com/docs/posting/create-posts/publishing-methods/recycling-posts.md), [help](https://publer.com/help/en/article/how-to-recycle-posts-21oc1h.md)
- ContentStudio's "evergreen recipe" turns top posts into campaigns that republish at set intervals and writes headline variations for each repost so they are not identical. Advanced and above. [page](https://contentstudio.io/social-media-automation)
- SocialBee re-shares evergreen posts from categories, and "Expire content" stops a post after a date or a number of shares. All plans. [features](https://socialbee.com/features/)
- Metricool "Autolists" republish lists of evergreen posts on a schedule. All plans. [planner](https://metricool.com/social-media-planner/)
- Cloud Campaign (insurance agencies): a taggable library with evergreen queues that recycle approved posts. [page](https://www.cloudcampaign.com/solutions/insurance-marketing-agencies)
- Hypefury marks posts evergreen and makes them recurring; "Auto Reposts" re-share for more impressions. [site](https://hypefury.com/)

## What we have today

- Recurring posts: a scheduled post can repeat every week, every 2 weeks or every month (`DraftEntry.repeat`, `src/lib/draftHistory.ts`). The calendar shows the coming ones as ghosts with "Skip this one". When it is set to posted, the app saves a posted copy and moves the series to its next date, so the history is the posted copies.
- Every repeat goes out with the same words. A repeat drops its Zernio link when it moves on, so auto-posting has to be set up again for each one.
- "Duplicate" in the calendar post editor copies a post to the next open slot (toast "Copy scheduled for {when}"), the same words again.
- A carousel belongs to one draft through `SavedCarousel.draftId`, and Saved carousels keep only the latest 20 (`MAX_SAVED_CAROUSELS`, `src/lib/carousel.ts`).
- My posts keeps 50 entries (`MAX_DRAFTS`), oldest dropped first, so old posted copies, and with them the history, fall away.
- Missing: a pool of evergreen posts, new wording for each repost, least recently used order, a rest period, a stop after N uses, and a check that an old post's facts are still true.

## Build

Gate: `leoOnly(email)` for everything below. Recurring posts stay as they are for everyone.

Files:
- New `src/lib/evergreen.ts`: the store, `pickEvergreen` and `useEvergreen`.
- `src/pages/DraftsPage.tsx`: status filter value `evergreen`, the list and its settings; "Add to evergreen" on a posted post's menu.
- `src/pages/CalendarPage.tsx`: "Add to evergreen" on a posted card; the fill after publish-queue's fill.
- `supabase/functions/idea-dump`: modes `evergreen-check` and `variants` (AI and cost).

### Screens and states

My posts, `/drafts?status=evergreen`:

```
Evergreen                                                    (i)
[ ] Fill empty slots with evergreen posts
    Rest each post at least [60] days between uses
"3 CPF myths"       LinkedIn   Out 3 times, last 7 Oct     [Versions 2] [Use in next slot] [...]
   12 Aug original | 9 Sep version 2 | 7 Oct version 1
"Why I review policies every year"  Instagram  Not used yet     [Write 3 versions] [Use in next slot]
```

- Up to 30 posts per brand. At 30, "Add to evergreen" reads "Evergreen is full (30). Remove one first."
- Each row: title, platform, uses ("Not used yet" or "Out {n} times, last {date}"), and its history line. A use whose draft has real numbers (learn-real-numbers) shows views beside its date.
- Row menu: "Pause", "Stop after [n] uses", "Remove". Pausing greys the row and skips it.

Adding (posted post menu > "Add to evergreen"):
- Checking: the button shows a spinner for up to 5 s while Jev reads it (below).
- Likely evergreen: added; toast "Added to evergreen." with Undo.
- Unsure: added with an amber line on its row, "Check the facts before it goes out again."
- Likely dated: a confirm in place, "This post looks tied to a date, a rate or the news. Add it anyway?" with "Add anyway" and "Cancel".
- Jev unavailable or over its cap: added with no line.

Versions ("Write 3 versions"):
- Making: the button reads "Writing versions..." and the row stays usable.
- Done: "3 versions ready" and "Versions 3" opens them inline, each editable, with "Remove".
- Dropped: a version that fails `scanCompliance` or the facts check is not kept; the line "{n} version(s) dropped: a figure or claim changed." shows once.
- Failed: "Couldn't write versions right now. Try again in a minute." Nothing is counted against the cap.
- Over the daily cap: the server's "You've used all 20 for today. It resets at 8am Singapore time."

Filling slots:
- With "Fill empty slots with evergreen posts" on, after publish-queue's fill (or on opening the calendar), each open slot from 2 to 14 days ahead that is still empty takes one evergreen post. `pickEvergreen` picks per slot: same platform as the slot (or the post's own when times are shared), not paused, not at its use limit, rested for the set days, then never-used first, then the oldest last use.
- Each pick becomes a new scheduled post with the next version in turn (the original counts as version 0), its first comment and an "Evergreen" label, and records a use. A carousel post also gets its slides back: `saveCarousel` with id `d:<new draft id>` and `draftId` set to the new post, from the slides stored in the pool, so Post it for me finds them.
- Toast: "2 evergreen posts added: Wed 22 Oct, Fri 24 Oct." with Undo, which deletes the posts and the uses.
- "Use in next slot" on a row does the same for one post at the next open slot.
- As in publish-queue, a fill sets times and sends nothing to Zernio.
- Nothing rested or no open slot: no toast, nothing changes.

### Copy

- Tab label "Evergreen"; InfoTip "Posts that stay true. Each one rests between uses and comes back in new words."
- "Fill empty slots with evergreen posts", "Rest each post at least {n} days between uses"
- "Add to evergreen", "Added to evergreen.", "Evergreen is full (30). Remove one first."
- "Check the facts before it goes out again."
- "This post looks tied to a date, a rate or the news. Add it anyway?", "Add anyway", "Cancel"
- "Write 3 versions" with the price chip "~US$0.01" (Leo only, like every north-star price chip), "Writing versions...", "3 versions ready", "Versions {n}", "{n} version(s) dropped: a figure or claim changed."
- "Couldn't write versions right now. Try again in a minute."
- "Use in next slot", "Pause", "Stop after {n} uses", "Remove", "Not used yet", "Out {n} times, last {date}", "original", "version {n}"
- Toast "{n} evergreen posts added: {days}."

### Data

- `content-studio-evergreen-${scoped(userId)}`: `{ on: boolean; restDays: number; posts: { id: string; platform: string; format: string; hook: string; draft: string; firstComment?: string; carousel?: Pick<SavedCarousel, "title" | "platform" | "slides" | "align" | "scale" | "font" | "paper">; media?: string; versions: string[]; dated?: "unsure" | "dated"; paused?: boolean; maxUses?: number; addedAt: string; uses: { at: string; draftId: string; version: number }[] }[] }`. Synced per brand. It copies the words and the carousel's slides (slide pictures stay device keys), so the pool and its history outlive My posts' 50-entry cap and the 20 saved carousels.
- `restDays` defaults to 60; `on` defaults to false.
- Videos are left out: their files live on one device. Publer leaves TikTok and YouTube out of recycling too. A posted short video shows "Add to evergreen" disabled with "Videos can't be recycled yet."
- No schema change.

### AI and cost

- Evergreen check, Jev only (idea-dump mode `evergreen-check`, `askJev` from `_shared/jev.ts`, `jev-1.13.0`). One noul:
  - Instructions: "Read this social media post from a Singapore brand (an adviser, a business or a product). Would it still be accurate and useful to the same reader a year from now with no edits?" Leo's brands include ActivityTracker and MoneyBees, so the question does not assume an adviser.
  - True: "General advice, habits, explanations, stories or opinions with no date-bound facts."
  - False: "It names this year's figures, interest or CPF rates, budget measures, news, a dated event, a limited offer or a deadline."
  - Proposed thresholds: at least 0.6 is evergreen; 0.3 up to 0.6 is unsure; under 0.3 is dated. Before shipping, run it over every posted draft on Leo's three brands, read each answer, and set the two numbers from that run.
  - New cap `"evergreen-check": 40`, commented "Jev reads one post before it joins evergreen; under US$0.0001 a call."
- Versions: idea-dump mode `variants` (gpt-4.1, the function's pinned model, JSON schema). Input `{ platform, format, hook, draft, voice? }`; output `{ versions: [string, string, string] }`. The prompt: keep the meaning, every fact and every number exactly; change the opening line and the wording; same length within 15%; no new numbers, products, promises or returns; no sign-off or disclosure lines (added on copy, as today); write as the adviser.
  - Then Jev checks each version against the original, one noul per version: "Does version B state any number, rate, product, promise or claim that version A does not, or change one A states?" At 0.5 or more the version is dropped. Jev unavailable: keep versions that pass `scanCompliance` and show "Check the facts before it goes out again."
  - New cap `"evergreen-variants": 20`, commented "Three new versions of an evergreen post (idea-dump variants, gpt-4.1 plus one Jev call with three questions), about US$0.01." One use per call; `refundUsage` when OpenAI fails (idea-dump's existing modes never refund, so this is new code in the function).
  - Cost estimate: about 1,200 input and 1,000 output tokens at US$2 and US$8 per million, so about US$0.01 a call. Measure the first ten and correct the comment.

### Deep links

- `/drafts?status=evergreen` opens the list (replace, like the other status values). Add `evergreen` to the /drafts row in docs/deep-links.md.
- `/drafts?status=evergreen&evergreen=<evergreen id>` opens that row's versions (push). Add `evergreen` as its own /drafts row in docs/deep-links.md.

## Done when

- [ ] On Leo's sign-in a posted LinkedIn post can be added to evergreen, and a post naming this year's CPF rate gets the "looks tied to a date" confirm.
- [ ] "Write 3 versions" returns up to three versions, none with a figure the original lacks.
- [ ] With filling on and two empty slots next week, two evergreen posts appear, oldest-used first, each in a different version from its last use, and Undo removes both.
- [ ] A post used 20 days ago with a 60-day rest is skipped.
- [ ] The history survives after the original falls out of My posts' 50.
- [ ] Other sign-ins see no Evergreen tab.
- [ ] `npm run build`, the full `npx vitest run`, and a by-eye check at 390 px and 1440 px pass.
- [ ] `src/data/northStar.ts` item flipped with its `ours` line, in the same commit.

## Tests

- `src/lib/evergreen.test.ts`: `pickEvergreen` skips paused, rested-too-recently and at-limit posts; picks never-used before used, then the oldest last use; matches the slot's platform; rotates versions starting after the last one used.
- `src/lib/evergreen.test.ts`: the store keeps 30 posts at most, cleans bad fields, and keeps `uses` when a version is removed.
- `supabase/functions/idea-dump/logic.test.ts`: the variants request is refused with no draft or with over 5,000 characters; the reply parser keeps three strings and drops empty ones; the Jev reading maps 0.6 and 0.3 to the three outcomes and null to "keep".
- `supabase/functions/_shared/usageCaps.test.ts`: both new caps exist.
- Prove each case bites by breaking the code once.

## Open questions

- "Add to evergreen" spends one Jev read (under US$0.0001) and this spec shows no price chip on it, since a chip that small adds noise. The page's rule says paid buttons carry a chip; Leo decides.
- Should filled evergreen posts also auto-post when the brand has accounts? Leo decides (same question as publish-queue).
- The 60-day rest and the 30-post pool are guesses from Publer's and SocialBee's settings. Leo may want them per brand.
- Carousel slides keep their own words; only the caption changes between versions. Rewriting the slides too is edit-carousel's job.
- Zernio has a `recycling` field on posts with no published description. This spec keeps recycling in the app so hand-posted posts can use it too.

## Related

publish-queue, publish-calendar, publish-schedule, remix-own-winners, remix-variations, learn-real-numbers, trust-compliance-check
