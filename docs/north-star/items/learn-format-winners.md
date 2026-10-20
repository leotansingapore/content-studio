# Which formats and hooks win for you

`learn-format-winners` | learn | phase 7 | status: partial | /north-star#learn-format-winners

## Leo asked

19 Oct 2026: "the idea is that one can remix any content format and the ai will regenerate". This item tells the next remix what has worked for this person before, and what they have never tried.

## How the best do it

Fastlane sets a winner target on every campaign. Its review step reads "Success looks like: 28 posts, 2 winners", though the recording never shows how a winner is counted (unverified).

![Fastlane 0:23](../../../public/north-star/fastlane/t023.webp)

A new chat with Senna offers starters under "OR START WITH ONE OF THESE" that include "Which post did best?" and "How did last week go?" (white squares, the analytics questions). Analytics sits in the nav with a small "Growth" tag, most likely the plan that unlocks it (unverified), and was not opened in the recording.

![Fastlane 4:17](../../../public/north-star/fastlane/t257.webp)

Asked "what can you do", Senna answers: "I make short-form content, post it, read the numbers, and do more of what worked."

![Fastlane 5:13](../../../public/north-star/fastlane/t313.webp)

Fastlane's homepage says its learning loop reads thumbstop rate, ROAS, hold rate and CPA against the account's averages, saves winners to memory and makes variations: "Winner found. 6 variations made." ([usefastlane.ai](https://usefastlane.ai), [launch article](https://www.martech360.com/news/stack-platforms/fastlane-launches-ai-marketing-platform-that-researches-creates-and-runs-campaigns-end-to-end)).

Motion does the tagging half best. Its AI Tagging sorts the user's own Meta creatives under headings like "Visual format" (listicle, founder story, skit, podcast), "Messaging theme", "Offer type" and "Hook / Headline tactic" (question, callout, contrarian, bold claim, confession, if/then). When tagging finishes, Motion drops eight prebuilt reports into an "AI Tag Comparisons" folder, and any report can "Group by" a tag. It works on Meta only, the first tags take 24 to 36 hours, and an account needs 10 or more creatives launched in 90 days ([help](https://help.motionapp.com/en/articles/12461770-getting-started-with-ai-tagging-in-motion), [FAQ](https://motionapp.com/faq)).

Others:

- MagicBrief ships "Top Hooks" and "Compare Formats" among its default reports, next to "Top Creatives" and "Top Copy" ([support](https://support.magicbrief.com/articles/2586435143-building-custom-reports)).
- Virlo's hooks endpoint groups videos by `hook_type` (15 types) or `visual_hook_type` (12, such as `text_hook` and `person_speaking_to_camera`) and sorts them by `strong_hit_rate` or `median_weighted_score` ([docs](https://dev.virlo.ai/docs/hooks)).
- AuthoredUp shows "Breakdown: best post type, day, length & readability" with average reactions by Text, Reshare, Image, Document, Link and Poll ([site](https://authoredup.com/)).
- Metricool Studio puts an "Explore insights" button above each Analytics table, with ready questions about the best content and the top format; it comes with the Advanced Analytics add-on, from US$12 a month ([August 2026 update](https://metricool.com/product-updates-august-2026/), [pricing](https://metricool.com/pricing/)).
- Gethookd's Creative Analyzer splits each ad into hook, angle and format and scores the user's own creatives the same way; it spends credits at an unpublished price ([review](https://dropshippingchampions.com/blog/gethookd-review)).
- Atria grades each ad with a letter and names one fix, for example "rewrite a statement hook as a question", and its "Iterate" button makes the new version from that fix ([blog](https://www.tryatria.com/blog/how-to-automatically-score-and-fix-underperforming-ads)). This item copies that last step: every result gets a button that starts the next post.

## What we have today

- `src/lib/analytics.ts` `getBreakdown(userId, dimension)` gives each group's engagement rate (its total engagements over its total impressions, so big posts weigh more) by platform, pillar, format, audience, CTA type or hook formula, over posted drafts with impressions (typed, or real ones through `withReal`).
- The pool is small by design: the drafts list keeps the 50 newest entries per brand, drafts and posts together (`MAX_DRAFTS` in `src/lib/draftHistory.ts`). An adviser who posts daily has under two months of posts in it, whatever the period says.
- Analytics shows "Engagement rate by {platform | pillar | format | hook formula}" with tabs held in `?by=` (`src/pages/AnalyticsPage.tsx`, around line 922). A group needs 2 posts to show (`MIN_GROUP_SAMPLE`).
- `getInsights` writes "Double down: {group}" when a group with 3 or more posts beats the overall rate by 15%, and "Underperforming: {group}" at 70% or less.
- Analytics' This week card adds "Your best posts share: 2 of your top 3 were carousels (none of the weakest)" (`sharedLine` in `supabase/functions/notify/logic.ts`).
- The account audit (`src/components/AccountAudit.tsx`) splits a scraped Instagram or TikTok account by format and says double down, fix or stop.
- Gaps:
  - A draft knows its hook formula only when it was written from one in Write (`DraftEntry.hookFormula`).
  - Drafts have no angle. `ANGLES` in `src/lib/postInsights.ts` (Storytelling, Contrarian, Educational, Emotional, Relatable, Objection Handling, Humour, Authority) is applied to the swipe file only, by a keyword list.
  - Nothing lists the formats or hooks you have never tried.
  - No result has a button that starts the next post or remix.
- `formatsWorkingNow` in `src/lib/postInsights.ts` already says which formats beat their creators' norm in the swipe file over 90 days. It covers only `FORMAT_OPTIONS` (`short-video` "Reels", `carousel` "Carousels", `text-post` "Single Posts") and runs on the bundled top posts (`getAllTopPosts` in `src/lib/topPosts.ts`, enriched once on `/swipe`), so it needs no network call.
- `writing-judge` (`supabase/functions/writing-judge/index.ts`) has six modes (`MODES` in `logic.ts`: human, hooks, idea, profile, carousel, facts). It refuses the whole request with 422 `not_english` before auth when the text is not mostly English, and answers 503 without `TYPESAFE_API_KEY`. It counts the use (`writing-judge`, `profile-score` or `fact-check`) before asking Jev and does not give it back when Jev returns null.
- `AnalyticsPage` does not call `useScrollToHash` (`src/lib/urlState.ts`). The only anchor that scrolls there today is `#recruit-numbers`, which `RecruitNumbers.tsx` handles itself.

Status partial: results by format and hook formula are live for everyone; angles, untried formats and the hand-off to Write or Remix are missing.

## Build

### Screens and states

A Leo-only card on `/analytics`, "What wins for you", anchored `#what-wins`, placed above "What's working, what's not". Component `src/components/FormatWinners.tsx`, logic in `src/lib/formatWinners.ts`. It renders only for `leoOnly(email)`.

```
What wins for you (i)                     [ Format ] [ Hook ] [ Angle ]
Last 90 days, 24 posts with numbers
Carousels         8 posts   2.1x your usual          [Make another]
Text posts       11 posts   1.0x your usual          [Make another]
Short video       2 posts   Too few to say
--------------------------------------------------------------------
Not tried yet
Myth bust hook                                       [Try it]
The receipt hook                                     [Try it]
Short video  1.8x their usual in your niche          [Try it]
```

How a group is scored:

- Each posted draft with numbers in the last 90 days gets a ratio against your usual on the same platform. Use `scoreAccount` from `supabase/functions/_shared/outlier.ts` (built by `find-outlier-score`, so build that first), called once per platform. Map each draft to an `OutlierPost`: `views` = impressions when above 0, else null; `likes` = reactions; plus comments and shares, all through `withReal`. That keeps "your usual" the same rule the feeds use.
- A group's score is the median ratio of its scored posts, labelled `times(score)` plus " your usual", and rows sort by it with the highest first. A group needs 3 or more scored posts for a number; with 1 or 2 it shows "Too few to say" in muted text.

The tabs, held in `?wins=`, group by format (`DraftEntry.format`, named by `labelForDimension("format", key)`), by hook (`DraftEntry.hookFormula` when set, otherwise the Jev tag `hook` below, named from `HOOK_FORMULAS`) and by angle (the Jev tag `angle`, one of `ANGLES`).

Tagging own posts goes through Jev in a module-level job in `src/lib/formatWinners.ts`, so leaving the page keeps it going. When the card mounts, the job takes the posted drafts with numbers that have no tag yet, newest first, and sends 20 at a time to `writing-judge` mode `tags` as `{ id, text: first 600 characters of toPlainText(d.draft), needHook }`. `d.draft` already starts with the hook (it is what `postText` in `src/lib/autoPost.ts` posts). `needHook` is true when the draft has no `hookFormula`. The job saves the results per draft and repeats until every post is tagged or the cap answers 429.

Not tried yet:

- Formats: `text-post`, `carousel` and `short-video` with no post in 90 days on the platform you post on most, named with `labelForDimension("format", key)`. Each shows the niche figure from `formatsWorkingNow` over the swipe file's scored posts when there is one ("{x}x their usual in your niche"), sorted by that figure, which is plain arithmetic with no AI call. Import the top posts with a dynamic `import()` when the card first needs them, so Analytics does not carry the swipe file in its bundle.
- Hooks: `HOOK_FORMULAS` (21 today) with no post in 90 days. Jev picks the ones that suit you through `writing-judge` mode `try-next` (below), and the card shows the top 2 at probability 0.6 or more, cached for the week. `audience` is `audienceDetail` (else `audience`) and `topics` is `topics` from `loadPositioning(userId)` in `src/lib/positioning.ts`; `best` is the hook lines of your 3 highest-scoring posts. With no positioning saved, or when Jev returns null, the hooks part is hidden.

Feeding the next remix:

- "Make another" on a row opens Write through `links.generate`. `platform` is the network with the most scored posts in that group (ties go to the newest post's network). A format row passes `{ format, platform }`, a hook row `{ formula, platform }` (a Jev-tagged hook passes the formula id it picked), and an angle row only `{ platform }` with the angle named in `ctx`. Every row adds `ctx`: "My {group} posts get {x}x my usual. Write a new post in that shape on a fresh topic. Do not reuse my earlier wording. Keep it compliant for a licensed Singapore financial adviser." "Try it" does the same for an untried item, with `ctx` "I haven't tried {name} yet. Write one post with it. Keep it compliant for a licensed Singapore financial adviser."
- `bestFor(userId, platform)` returns `{ format?, formula?, angle? }`: per dimension, the top group with 3 or more scored posts and a score of 1.2 or more. `remix-any-format` and `plan-campaign` read it to preselect the output format and badge its chip "Wins for you". This item adds the function and its test; those items add the reads.

States:

- Not enough numbers (under 5 posted posts with numbers in 90 days): "Add numbers to 5 posted posts to see what wins." with a link "Add your numbers" to `/analytics#add-numbers` (add `id="add-numbers"` to the existing Add your numbers card).
- Reading: the Format tab works at once. The Hook and Angle tabs show "Reading your posts... {n} of {m}" within 400 ms while tags arrive.
- Done: rows and the Not tried yet list.
- Jev null or call failed: the Angle tab shows "Angles show once your posts are read. Try again later."; the Hook tab shows formula posts only. Nothing is stored, so the next visit retries.
- Over the daily cap (429 `post-tags`): the same as Jev null, with the server's message in muted text.
- Nothing untried: the Not tried yet block is hidden.
- Refused: other sign-ins never render the card and make no calls; the two modes answer 404 `{ code: "not_enabled" }`.

### Copy

- Heading: "What wins for you"
- InfoTip (label "About what wins"): "Each post against your usual on the same network."
- Sub-line: "Last 90 days, {n} posts with numbers", or "Since {19 Aug}, {n} posts with numbers" when the oldest posted draft still in the list is newer than 90 days
- Tabs: "Format", "Hook", "Angle"
- Row: "{n} posts", "{x}x your usual", "Too few to say", button "Make another"
- Block heading: "Not tried yet"; row "{name} hook", "{x}x their usual in your niche", button "Try it"
- "Add numbers to 5 posted posts to see what wins.", link "Add your numbers"
- "Reading your posts... {n} of {m}"
- "Angles show once your posts are read. Try again later."
- Chip read by other items: "Wins for you"

### Data

- New synced key `content-studio-post-tags-<scoped(userId)>`, one per brand, written whole:

```ts
// src/lib/formatWinners.ts
export interface PostTags {
  tags: Record<string, { angle: Angle | "unclear"; hook?: string | "none" | "unclear"; at: string }>; // draft id
  tryNext?: { week: string; hooks: string[] };  // Monday of the SG week, formula ids
}
```

  Tags for drafts that no longer exist are dropped on each write. About 100 bytes a post.
- No table and no schema change. Scores are computed on render and never stored.

### AI and cost

Both modes live in `supabase/functions/writing-judge`, with questions and thresholds in `logic.ts` and routing in `index.ts`. Add `tags` and `try-next` to `MODES` and `parseJudgeRequest`. The server answers 404 `{ code: "not_enabled" }` unless `leoOnly(user.email)` passes, using `supabase/functions/_shared/leoOnly.ts`, which `plan-goal` adds; if that item has not shipped yet, add the file in this change. The function's whole-request English check would refuse a batch for one Malay post, so these two modes skip it and check each post instead: a post that is not mostly English (`mostlyEnglish` false) is tagged "unclear" without a Jev question.

Both modes check `leoOnly(user.email)` right after the sign-in check and before `consumeUsage`. They give the use back with `refundUsage` (UTC `day` read before the call) when Jev returns null, since the README rule is that a failed paid call refunds; the other modes do not do this today and are left as they are.

Mode `tags`, body `{ mode: "tags", posts: [{ id, text, needHook }] }` with 1 to 20 posts. It makes one Jev request (`askJev` with `timeoutMs: 15000`, since 40 questions is more than the 5-second default was measured on) with state `{ country: "Singapore", writer: "a licensed financial adviser", posts }` and two questions per post. The first, `angle:<id>`, is a choice with the instructions "Which angle does post `<id>` mainly take?" and these criteria:

```ts
export const ANGLE_CRITERIA = {
  Storytelling: "Tells what happened to the writer or a client",
  Contrarian: "Argues against a common belief or common advice",
  Educational: "Explains how something works or how to do it",
  Emotional: "Leans on fear, loss, love or relief",
  Relatable: "Names a feeling or habit most readers share",
  "Objection Handling": "Answers a reason people give for not acting",
  Humour: "Mainly tries to be funny",
  Authority: "Leans on the writer's experience, numbers or credentials",
};
```

The second, `hook:<id>`, is asked only when `needHook` is true. It is a choice with the instructions "Which hook formula does the first line of post `<id>` follow?" and one criterion per `HOOK_FORMULAS` entry written as `"{name}: {template}"`, plus `none`: "None of these shapes". A pick is kept at probability 0.5 or more (proposed, `TAG_MIN` in `logic.ts`). Below that the post is stored as "unclear" so it is never asked again, while a null from Jev returns `{ tags: null }` and stores nothing.

Mode `try-next`, body `{ mode: "try-next", audience, topics, best: string[] (up to 3 of your best hooks), untried: string[] (formula ids) }`, asks one noul per untried formula:

- Instructions: "Would opening a post with the `{name}` hook (`{template}`) suit this adviser's audience and topics?" True: "Yes: it fits the people they write for and the subjects they cover, and can be written without promising returns." False: "No: it clashes with their audience or topics, or pushes them toward claims an adviser must not make."
- Keep 0.6 and up (proposed, `TRY_MIN`), top 2 by probability.

Add `"post-tags": 10` a day per user to `DAILY_LIMITS` in `usageCaps.ts`; both modes consume it, and `try-next` runs at most once a week through the cache. A full `tags` call sends 20 posts of up to 600 characters (about 3,000 tokens of state) and 40 questions. Even counted as 24,000 input tokens it is under US$0.002 at Jev's US$0.042 per million, and a `try-next` call costs less than US$0.001. There is no LLM call in this item, and no button starts a paid call, so the card shows no price chip.

### Deep links

- `/analytics#what-wins` scrolls to the card. Analytics has no hash scrolling today: add `useScrollToHash(userId !== null)` to `AnalyticsPage` and `id` plus `scroll-mt-20` on the card (whichever of `learn-format-winners`, `learn-attribution` and `learn-real-numbers` ships first adds the hook; the others only add ids). `/analytics?wins=hook` and `?wins=angle` pick the tab (default `format`, left out of links; `useUrlState`, replace). Add `wins` to `links.analytics` and a row to the `/analytics` table in `docs/deep-links.md`, with the `#what-wins` and `#add-numbers` anchors in the anchors list.
- "Make another" and "Try it" only use Write params already listed under "Still read (Create pages)", namely `format`, `platform`, `formula` and `ctx`.

## Done when

- [ ] On Leo's sign-in, Analytics shows "What wins for you"; other sign-ins see no card and no calls reach `writing-judge` modes `tags` or `try-next`.
- [ ] With seeded posts (8 carousels at twice the median, 11 text posts at the median), Format shows "2.0x your usual" for carousels and "1.0x your usual" for text posts.
- [ ] Posts written without a formula get a hook tag; with Jev mocked null, the Angle tab shows its waiting line and nothing is stored.
- [ ] A batch with one Malay post tags the English ones and stores the Malay one as "unclear", with no 422.
- [ ] A group with 2 posts reads "Too few to say".
- [ ] "Make another" on a hook row opens Write with that formula picked and the ctx line in the brief.
- [ ] Not tried yet lists formats with no post in 90 days and at most 2 hooks; the hooks call runs once a week.
- [ ] `bestFor` returns the top group only at 3 posts and a 1.2x score.
- [ ] The 11th `tags` call in a day gets 429 and the card shows the cap message; a call where Jev returns null leaves the day's count where it was.
- [ ] `/analytics#what-wins` scrolls to the card after a reload.
- [ ] Checked by eye at 390 px and 1440 px.
- [ ] `src/data/northStar.ts` item flipped (status and `ours`) in the same commit, and this spec's status line ticked.

## Tests

- `src/lib/formatWinners.test.ts`: group scores are medians of per-platform ratios; 3-post minimum; untried formats are those with no post in 90 days; the sub-line switches to "Since" when the list holds less than 90 days; `bestFor` thresholds; `makeAnotherUrl` carries format, formula and the no-copy line and stays under 1,800 characters; tags for deleted drafts are dropped on write.
- `supabase/functions/writing-judge/logic.test.ts`: `parseJudgeRequest` accepts both modes with 1 to 20 posts and refuses 21; `tags` builds one angle question per post and a hook question only when `needHook`; 0.5 cut and "unclear" below it; `try-next` keeps 0.6 and up, top 2; a non-English post gets no question and comes back "unclear".
- `supabase/functions/writing-judge/index.test.ts`: both modes answer 404 for a non-Leo email before any counter moves, consume `post-tags`, give it back when Jev returns null, and are not refused with 422 for a batch holding one Malay post.
- `supabase/functions/_shared/usageCaps.test.ts`: `post-tags` is 10.

## Open questions

- 0.5 for tags and 0.6 for try-next are starting numbers. Read Leo's first 50 tagged posts and adjust before this goes to anyone else.
- `remix-any-format` adds output formats such as slideshow and talking head. Grouping by them needs a field on the draft saying what it was made as; that item names it, and this card groups by it once it exists.
- When this goes to everyone, the old "Engagement rate by" card and this one should merge. Leo decides when ("on for everyone").
- Typed and real numbers mix in one ratio today. If Leo wants real numbers only, `withReal` posts can be filtered with one line.
- Server gate: this spec uses the email list in `_shared/leoOnly.ts` (`plan-goal`), while `find-competitors` picks a `NORTH_STAR_USERS` uid secret. Use whichever has shipped first; the specs say the first to ship picks one.
- The 50-draft list caps the pool. Raising `MAX_DRAFTS` grows every synced drafts key on every device, so it is Leo's call; until then the sub-line counts what is there and never claims 90 days it does not hold.

## Related

remix-own-winners, remix-any-format, plan-campaign, find-outlier-score, find-ai-tagging, learn-post-grade, learn-weekly-report, formats-hooks-scripts
