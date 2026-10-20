# Patterns and hooks from what works

`remix-patterns` | remix | phase 2 | status: live (Leo's sign-ins, 21 Oct 2026) | /north-star#remix-patterns

## Leo asked

19 Oct 2026: "find ways where one can key in their competitors and the app will scrape their ads and top performing social media posts"

Keying in competitors and scraping their posts belong to `find-competitors` and `find-competitor-posts`. This item is what the app does with those posts once it has them.

## How the best do it

Fastlane shows no patterns screen in Leo's recording. The nearest pieces are the chat starters "Find new angles" and "What is trending in my niche?" (frame t257), the Radar search "Search anything: a word, a hook, a brand, a feeling" (notes-3 F8), and a free hook generator: 5 fields (Product, Audience, Pain, Outcome, Timeframe) give "30 hook structures filled with your words" across 11 hook types (Story, Contrarian, Curiosity, Question, Number, Direct, Mistake, Result, Challenge, Secret, Reaction). Inside the app each hook can become a hook plus demo video, an AI UGC clip, a slideshow opener or a meme ([hook generator](https://usefastlane.ai/tools/hook-generator)).

Vamos has the clearest flow, "Adapt what works", in four steps ([docs](https://docs.getvamos.ai/en/articles/13004958-adapt-what-works)):
1. Follow and scan competitors.
2. Sort each creator by Outlier score (views over the creator's own median, shown once a creator has 10 posts; [outlier score](https://intercom.help/getvamos/en/articles/16934858-the-outlier-score)).
3. "Ask Vamos" what the top outliers did differently in hook, structure, topic or format, plus a profile audit for topics the user skips.
4. Ask it to take the two strongest patterns and write three posts in the user's voice on the user's topics. Hook, structure and format carry over; "Their topic does not". Each answer costs credits.

Others:
- Sandcastles analyses a video for 1 credit into tabs for Idea Analysis (Topic, Idea Seed, Unique Angle, Common Belief to Challenge), Hook and more, with "Save hook format" into "Your Favorite Hooks". With a Persona set, every idea comes with three ways to adapt it to your niche ([video detail](https://help.sandcastles.ai/video-detail), [ideas](https://help.sandcastles.ai/ideas)).
- Virlo's hook library holds over 4,100 fill-in templates with [blanks] in 33 categories, each with an example, a psychology note and `psychology_tags` such as "social proof"; it is not ranked by performance. USD 0.10 per request. Its trending hooks endpoint ranks real opening lines from the last 7, 14 or 30 days for USD 0.25 per request ([hooks API](https://dev.virlo.ai/docs/hooks)).
- Kleo ships 200+ hook templates grouped by style (curiosity, contrarian, story-opener, list-promise) and 170+ top-performing post swipes ([pricing](https://wf.kleo.so/pricing)).
- ReelFarm keeps 100+ slideshow hook templates by category, finance among them ([guides](https://reel.farm/guides)).
- 1of10 writes titles and video ideas from its outlier research for 8 credits a run ([site](https://1of10.com)).
- OutlierKit scores a video's hook strength, curiosity loops, pacing and payoff for 10 credits ([site](https://outlierkit.com)).

## What we have today

- Write uses 21 named hook formulas (`src/lib/hookFormulas.ts`: name, template, example, best for, trap), rewritten for Singapore advisers. Jev marks one hook "Recommended" (`writing-judge` mode `hooks`). Write reads `?formula=<id>` to open with a formula.
- `/swipe` labels each top post with topic, angle, audience, trigger and structure, and measures it against its creator's own average (`enrich` and `BREAKOUT_RATIO` 1.8 in `src/lib/postInsights.ts`). "Formats working now" (`formatsWorkingNow`) groups the last 90 days by format, topic and angle across all creators.
- `/following` tracks up to 5 public Instagram or TikTok accounts (`MAX_FOLLOWED`). Each check keeps the 12 newest unpinned posts (`POSTS_PER_CHECK` in `track-accounts/logic.ts`, captions cut to 240 characters, views, likes, comments) and replaces the last check's posts. It shows each account's best post and has "Remix" per post: videos open Clone a reel, the rest open Write (`src/lib/following.ts`, key `content-studio-following-<scoped uid>`, `track-accounts` with cap 10).
- `outperformers` in `src/lib/market.ts` already picks Following posts at 1.5 times or more of their account's mean likes plus comments (accounts with 4 or more posts, top 10 overall), and `/market` (Leo only) has Jev mark those act or watch.
- The account audit already scores posts against an account's own median: `computeAudit` and `median` in `supabase/functions/_shared/socialAudit.ts` (views, else likes plus comments plus shares plus saves; posts under 48 hours not judged; `BREAKOUT_RATIO` 1.5). The app imports that file today through `src/lib/accountAudit.ts`, but only for your own handle.
- Missing: asking what one account's best posts share, turning the strongest patterns into ideas in your voice, and a searchable bank of hooks that have worked, sorted by why they work.

Status partial.

## Build

Two parts. Part A runs on `/following`; part B is a new tab on `/swipe`. Both on Leo's sign-ins only.

### Screens and states

Part A, "What worked" for a followed account.

Each account card on `/following` gets a button "What worked". It opens a panel under the card:

```
What worked for @mrbrown                      From the check on 12 Oct
Their 3 best posts, against their usual:      3.4x  2.6x  1.9x    [cards with Remix]
What they share
  Number reveal hooks     2 of their 3 best posts, 1 of the other 9
  Lists                   3 of 3, 4 of 9
Ideas for you
  1. "I checked 30 CPF statements this year. 22 had the same gap."   Carousel   [Remix this]
     Number reveal hook, a list, on your topic: CPF top-ups
  2. ...
  3. ...
```

How it works, in `supabase/functions/remix-patterns/` (new) and `src/lib/patterns.ts` (new):
1. In the browser, score each tracked post against the account's median: views when the platform gives them, else likes plus comments (the `reach` measure `followStats` already uses), and leave posts under 48 hours out. Use `scoreAccount` from `supabase/functions/_shared/outlier.ts` if `find-outlier-score` has landed; otherwise `ratioToMedian` in `patterns.ts` imports `median` from `supabase/functions/_shared/socialAudit.ts` and is swapped for `scoreAccount` when that lands. The top 3 at 1.5 times or more are the outliers. The median matters because one viral post drags a 12-post mean up and hides the others; `find-outlier-score` moves `outperformers` in `market.ts` onto the same median, so this item leaves it to that spec.
2. The function asks Jev to tag every post with its hook formula, how the body is built and its topic (questions below), while the format comes straight from the post data.
3. Back in the browser, `strongestPatterns(tags, outliers)` keeps a tag value when at least 2 of the 3 outliers share it and its share among the outliers is at least twice its share among the rest. At most 3 patterns. This step is counted, not judged.
4. The function's LLM step writes 3 ideas from the two strongest patterns, in the user's voice (`voiceProfile`) and on the user's own topics (positioning topics from `src/lib/positioning.ts`). The account's topic does not carry over.
5. Each idea is saved as a source with the key `pattern:<platform>:<handle>:<n>` (`remix-source-trail`): title the idea's hook, text the pattern lines and the idea's angle, author the account. "Remix this" is the `RemixButton` from `remix-everywhere`, so the idea goes through the same sheet, voice, brand and checks as any other remix. Before that ships, the button opens Write with `detail` (the hook), `formula`, `format`, `ctx` ("Pattern from @handle's best posts: {pattern lines}. Use the pattern, not their words or topic. Keep it compliant for a licensed Singapore financial adviser.") and `source=pattern:<platform>:<handle>:<n>`.

States for part A:
- Fewer than 8 posts with numbers: the button is disabled and the reason shows under it, "Needs 8 posts with numbers. Check the account again later."
- Ready: the "What worked" button carries the uses-left chip for `remix-patterns` from `useUsesLeft`; a cached result opens with no chip and no charge.
- Loading: steps "Reading their {n} posts", "Finding what their best posts share", "Writing ideas for you", with elapsed seconds and Cancel. The run lives in a module-level runner, so leaving the page keeps it going.
- Done: the panel above. A cached result opens at once with its date; "Run again" shows only after a newer Following check.
- No pattern found: the 3 best posts with Remix, the line "Their best posts don't share a pattern yet.", and ideas written from the 3 posts directly.
- Jev returns null: same as no pattern, with "Ideas from their 3 best posts" as the ideas heading.
- Failed: "Couldn't read their posts. Try again." with "Try again", and the use is refunded.
- Refused: the function answers 403 for anyone outside `NORTH_STAR_USERS`.
- Over the daily cap: the 429 line from `usageRefusal`.

Part B, the hook bank at `/swipe?tab=hooks`.

A fourth tab, "Hooks", beside Top posts, News and Ads, with a search box, a formula filter and a "Why it works" filter:

```
[ Search hooks                    ]  Formula: All v   Why it works: All v
Number reveal                                     Why it works: authority
I {did something} {N} times. Here is what came out of it.
Seen in @mrbrown, 3.4x their usual: "I reviewed 40 client files..."   [Open post]
Trap: hiding the number below the first line.
[ Use this hook ]
```

- One card per formula (21), each followed by the real opening lines filed under it, best ratio first. A line counts as proven when its post did at least its creator's usual (ratio 1.0 or more).
- Lines come from two places: the weekly top-posts drop (tagged once a week by a new `scripts/hook-bank.mjs` that reads `src/data/topPosts.json` and writes `src/data/hookBank.json`), and the posts part A has already tagged for your own Following accounts (read from the patterns cache, labelled "From your Following").
- "Use this hook" opens Write with `formula=<id>` and the detail empty. The real line is shown as evidence; the template is what gets used.
- Search matches the template, example and real lines. Filters and search live in the URL.
- Empty search result: "No hooks match. Clear the search to see all 21." with "Clear".

### Copy

- Following button: "What worked"; disabled reason: "Needs 8 posts with numbers. Check the account again later."
- Panel title: "What worked for {handle}"; date line: "From the check on {d MMM}"
- Section headings: "Their 3 best posts, against their usual", "What they share", "Ideas for you"
- Pattern line: "{pattern} {k} of their 3 best posts, {m} of the other {n}"
- No pattern: "Their best posts don't share a pattern yet."
- Fallback heading: "Ideas from their 3 best posts"
- Steps: "Reading their {n} posts", "Finding what their best posts share", "Writing ideas for you"
- Chip on "What worked": "{left} left today"
- Buttons: "Remix this" (on ideas and on the 3 best posts), "Run again", "Try again", "Cancel"
- Error: "Couldn't read their posts. Try again."
- Tab: "Hooks"; search placeholder: "Search hooks"; filters: "Formula", "Why it works"
- Card lines: "Seen in {handle}, {ratio}x their usual", "From your Following", "Trap: {trap}"
- Buttons: "Use this hook", "Open post"
- Empty: "No hooks match. Clear the search to see all 21." Button: "Clear"
- "Why it works" values: curiosity, fear of loss, social proof, authority, contrast, identity, story.

### Data

- Pattern results: `content-studio-patterns-<scoped uid>`, synced, keyed `<platform>:<handle>`: `{ checkedAt, ranAt, tags: Record<postId, { formula, structure, topic }>, patterns: Pattern[], ideas: Idea[] }`. A rerun happens only after a newer Following check.
- Hook bank: `src/data/hookBank.json`, `{ fetched, formulas: Record<formulaId, psychology>, hooks: { id, text (at most 140 characters), formula, psychology, from, ratio, url, format }[] }`, committed with the weekly drop like `topPosts.json`.
- No schema change.

### AI and cost

New edge function `remix-patterns` (JWT on), deployed with `supabase functions deploy remix-patterns --project-ref hgdbflprrficdoyxmdxe --use-api`. Gate: `isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)`, Leo's two user ids; reuse whichever allowlist secret the first north-star function set (`remix-everywhere` names `REMIX_USERS`).

Jev (`askJev`, `jev-1.13.0`), one state per post (its caption, at most 240 characters as Following stores it, and its format), three questions:
- `formula`, a Choice. Instructions: "Which hook formula does the opening line of this post follow?" Criteria: one entry per `HOOK_FORMULAS` id, worded "{name}: {template}", plus `none`: "None of these, or there is no clear opening line." Take the pick at 0.4 or more (22 options spread the probability), else `none`.
- `structure`, a Choice. Instructions: "How is the body of this post built?" Criteria: `list` "A numbered or bulleted list of points", `story` "A story with a before, a turn and an after", `how-to` "Steps to do something", `myth-bust` "A common belief, then why it is wrong", `opinion` "A take the writer argues for", `question` "It asks the audience something and invites answers", `announcement` "News, an offer or an event", `other` "None of these". Take it at 0.5 or more.
- `topic`, a Choice over `TOPICS` in `postInsights.ts` plus `other`, at 0.5 or more.
- These thresholds are a first guess. Run all 5 of Leo's Following accounts, read every tag by hand, and set the final numbers from what that run gets wrong.

The LLM writes the ideas through `openaiChat` (`OPENAI_MODEL`) and nothing else. Its prompt carries the MAS rules (no promised returns, no named insurer products, no invented numbers) and "use the pattern, never their words or topic".

The hook bank script asks Jev the `formula` question and one more, `psychology`, a Choice: "What makes this opening line stop someone scrolling past?" Criteria: `curiosity` "It leaves a gap the reader wants closed", `fear-of-loss` "It points at money, time or safety the reader could lose", `social-proof` "It leans on what many people did", `authority` "It leans on the writer's experience, numbers or credentials", `contrast` "It sets a common belief against a surprising truth", `identity` "It names a group the reader belongs to", `story` "It opens a personal moment", `other` "None of these". Threshold 0.5. The script prints how many lines it will send before it sends any.

Caps and cost:
- New cap in `usageCaps.ts`: `"remix-patterns": 10`, one per account run (Jev over up to 12 posts plus one LLM call). Refund on failure.
- Per run: Jev on 12 short posts, well under US$0.001; the ideas call about US$0.005 (unverified). About US$0.06 a day at the cap.
- Price chip: "What worked" carries the uses-left chip until `business-cost-preview` ships, then `<PriceChip feature="remix-patterns" left={...} />`; add `remix-patterns` to that spec's `PRICES` at "About US$0.01".
- The weekly hook bank tagging: about 140 lines (the drop holds about 140 posts), well under US$0.01 a week, run on Leo's Mac. The Sunday job is `~/.local/bin/content-studio-drop.sh top-posts`, which today exports no `TYPESAFE_API_KEY` and commits only `src/data/topPosts.json` and `public/covers`. In that script, for `top-posts`: set `EXTRA=scripts/hook-bank.mjs`, add `src/data/hookBank.json` to `PATHS`, and read the key from `~/.zshenv` the way the `sg-feeds` branch does. With no key, `hook-bank.mjs` exits 0 and leaves the last `hookBank.json` in place.

### Deep links

- `/following?account=<platform>:<handle>&view=patterns` opens that account's panel and pushes a history entry. Following has no URL state today, so both params go into `docs/deep-links.md`, with a new `links.following` builder.
- `/swipe?tab=hooks&formula=<id>&why=<psychology>&q=<text>`: the tab, filters and search (replace). Add `"hooks"` to the `tab` union and `formula`, `why` to `links.swipe`.
- "Remix this" adds `remix=pattern:<platform>:<handle>:<n>` to the Following URL (`withRemix`). "Use this hook" opens Write with `formula=<id>`.

## Done when

- [ ] On an account with 8 or more posts with numbers, "What worked" shows the 3 best posts with their ratios, up to 3 patterns with counts, and 3 ideas on Leo's own topics.
- [ ] Each pattern's counts match a hand count of the Jev tags stored in `content-studio-patterns-<scoped uid>`.
- [ ] "Remix this" on an idea opens the Remix sheet on the pattern source, and the draft it makes carries `source.key` `pattern:...` and the user's own topic.
- [ ] Opening the panel again shows the cached result with no call; "Run again" appears only after a new Following check.
- [ ] The Hooks tab lists all 21 formulas with real lines under them, and search plus both filters work and survive a reload.
- [ ] "Use this hook" opens Write on that formula.
- [ ] Cap 10 counts server side and refunds on failure; another sign-in gets 403 and sees no Hooks tab and no "What worked".
- [ ] Checked by eye at 390 px and 1440 px.
- [x] `src/data/northStar.ts` item flipped (status and `ours`) in the same commit, and this spec's status line ticked.

## Tests

- `src/lib/patterns.test.ts`: `ratioToMedian` uses views when present and likes plus comments otherwise, and skips posts under 48 hours; the top 3 need 1.5 times or more; `strongestPatterns` needs 2 of 3 outliers and twice the share of the rest, caps at 3, and returns none for an even spread.
- `supabase/functions/remix-patterns/logic.test.ts`: the three questions' shapes and thresholds; a null Jev answer leads to the "from their 3 best posts" path; the ideas prompt includes the MAS lines and the user's topics, and never the account's captions word for word beyond 300 characters.
- `scripts/hook-bank.test.mjs`: with no `TYPESAFE_API_KEY` the script writes nothing and exits 0; lines under ratio 1.0 are dropped; text is cut to 140 characters; every hook's formula is a real `HOOK_FORMULAS` id or the line is dropped.
- `supabase/functions/_shared/usageCaps.test.ts`: `remix-patterns` is 10.
- `src/lib/links.test.ts`: `links.following({ account, view: "patterns" })` and `links.swipe({ tab: "hooks", formula, why })`.

## Open questions

- Following tracks 5 accounts and keeps the 12 newest posts of each. Once `find-competitor-posts` stores more of a competitor's posts, the patterns run should read from there. Whoever builds second wires it.
- Virlo sells its 4,100-template library by API at USD 0.10 a request. Buying it is a new paid vendor: Leo's call. The bank here uses the 21 formulas and real lines from our own drops.
- The 1.5 times outlier bar and the twice-the-share pattern rule are starting numbers, to be checked against Leo's accounts.
- A gap audit (topics their audience wants that they skip, as Vamos offers) is not in this build.

## Related

find-competitors, find-competitor-posts, find-outlier-score, remix-everywhere, remix-source-trail, remix-teardown, formats-hooks-scripts, edit-snippets
