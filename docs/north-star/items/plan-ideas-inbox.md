# Ideas made for you, in one inbox

`plan-ideas-inbox` | plan | phase 5 | status: partial | /north-star#plan-ideas-inbox

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane has no ideas inbox in the recording; the nearest thing is the five "ASK SENNA FOR" prompt tiles on Home, such as "Remix a trend" / "Remix a trending video for Activity Tracker", which agent-home covers.

- Sandcastles has the clearest triage: every analysed video becomes an idea in Ideas > Inbox, with the actions Shortlist, Discard, Go to Analysis and Turn into script. The ideas help page lists the keys S, D, A, C and E plus the arrows without saying which key does which (on the video page, S shortlists and C creates a script), and "Discard all" there has no confirmation and no undo. The panel shows Your Notes, Content Positioning, Storytelling Format with "Why it Works", Contrast Mechanism, Hook Alignment and "How to Personalize this Video for Your Content Niche", with sorting, and export of Inbox, Shortlist or All on Pro and up ([source](https://help.sandcastles.ai/ideas)). Its "Top Daily Performers" automation rule, off by default and on Pro and up, adds at most 3 ideas a day from the watchlist (outlier score 1 or more, 25,000 views or more, engagement 2% or more), at 1 credit each, marked with a purple lightning bolt ([source](https://help.sandcastles.ai/ideas), [credits](https://help.sandcastles.ai/credits-v3)).
- YouTube Studio's Inspiration tab opens with nine ideas from the channel's data. Each card carries a "Channel alignment" line (how it fits and what angle you bring) and the related videos behind it. "More like this" gives similar ideas, "Show more" gives nine new ones, arrows step back and forward through rounds, a bookmark saves one, and a three-dot menu takes "Helpful" or "Not Interested". Desktop and English only, and YouTube is retiring it gradually from August 2026 ([source](https://support.google.com/youtube/answer/15575509?hl=en)).
- Buffer keeps an Ideas board with tags and an AI assistant for when you are "out of ideas"; ideas turn into scheduled posts later. Free holds 100 ideas and 3 tags, paid plans are unlimited with 250 tags ([pricing](https://buffer.com/pricing), [assistant](https://buffer.com/ai-assistant)).
- Contentdrips gives daily ideas from your role, niche and audience ([source](https://contentdrips.com/)). SuperX promises "Start Every Day With Proven Ideas" ([source](https://superx.so/)), and Tweet Hunter sells "Daily AI-written tweets" on Grow and up ([source](https://tweethunter.io/)).
- Typefully offers fresh writing prompts with examples of popular posts, searchable by "intent category" ([source](https://typefully.com/blog/hypefury-review-alternative)). Later writes ideas inside each content pillar at 1 credit per 3 ([source](https://help.later.com/hc/articles/14711113026327)).

## What we have today

Plenty of idea sources, each on its own page, and no single list:

- Idea Dump briefs (`/coach#idea-dump`, `src/lib/ideaDump.ts`, key `content-studio-ideadump-<scope>`, up to 50): idea, angle, hooks, talking points, CTA, format, funnel stage with a reason, a score, and `Add to board` (Idea column) or Write (`briefWriteUrl`).
- Post ideas in your style on the account audit (`/analytics`, `suggest-post-ideas`, table `cs_social_ideas`): up to 5 a batch, each an `IdeaRow` with a hook, the idea, a `why`, a format of `video`, `carousel` or `image`, and a status of new, used or dismissed (`loadLatestIdeas(auditId)`, `setIdeaStatus`, `ideaWriteUrl(idea, platform, handle, basedOn?)` in `src/lib/accountAudit.ts`). There is no helper that finds a brand's audit without `openAudit`, which calls `audit-social-account` and can start a refresh; `AnalyticsPage.tsx` instead reads its own `cs_social_audits` rows and matches the handle to `loadSocialAccounts(uid)`.
- Trend kits (`/trends`, `src/lib/trends.ts`) carry a title, why it works, hooks, talking points, a CTA and `buildTrendRemixUrl`, but `src/data/trends.json` holds 10 entries, all found on 11 Oct, because the daily trends drop last ran that day. Industry news (`/swipe?tab=news`, `src/lib/industryNews.ts`, refreshed daily) has a title, gist, talking point and `buildNewsWriteUrl`. Real client questions sit inside Write's idea step.
- In the swipe file, top posts can carry an idea (`TopPost.idea`: hook, format, why, adapt), while saved posts are only keys: `loadSaved(uid).topPosts` holds `<advisorId>-<shortCode>` strings (`src/lib/savedItems.ts`, key `content-studio-saved-<scope>`) that `getAllTopPosts()` resolves.
- The Board's Idea column (`src/lib/board.ts`) and Home's "Need an idea?" with two links, "Browse inspiration" and "Follow creators".
- Your market (`/market`, Leo only, `src/lib/market.ts`, key `content-studio-market-<scope>`): each check's news and posts are tagged `act` or `watch` by Jev, and its search questions read as GEO results. The page keeps `dismissed` and `written` key lists, and has `visibleNews`, `visiblePosts`, `visibleGeo` and the links `newsWriteUrl`, `postWriteUrl`, `geoWriteUrl`. These are fit picks the app already pays for, and no other page pools them.
- idea-dump has no server-side Leo gate and never calls `refundUsage` today; `_shared/leoOnly.ts` is specified in `plan-goal.md`, not built.

What is missing: nothing proposes ideas each day without a click, nothing says why an idea fits this brand across sources, and there is no shortlist, discard or keyboard triage. Two sibling specs score posts and news for fit (find-niche-feed, find-news-questions); this item reads their picks when they exist and does not score posts again.

## Build

Gate with `leoOnly(email)`: the nav entry has `owners: LEO_EMAILS`, the page renders `NotFoundPage` for anyone else, and the new server mode refuses everyone else.

### Screens and states

Route `/ideas`, `src/pages/IdeasPage.tsx` (lazy, in `src/App.tsx`). Nav: `{ to: "/ideas", label: "Ideas", owners: LEO_EMAILS }` in the pipeline section of `src/lib/nav.ts`, after Plan. Pipeline is a tabbed section, so the page renders `<SectionTabs tabs={PIPELINE_TABS} />` like its siblings; `SectionTabs` already hides a tab with `owners` from other sign-ins. Add `/ideas` to the routes list in `src/lib/nav.test.ts` and `"/ideas": "inbox shortlist daily ideas"` to `KEYWORDS` in `src/lib/jumpTo.ts`.

```
Ideas                                                  [Get today's ideas]
Inbox 14   Shortlist 3   Discarded
From: [All] [Today's] [Idea Dump] [Your posts] [Market] [Trends] [News] [Saved]
+------------------------------+------------------------------------------+
| TODAY'S                fit 82| Most people under 30 have under a month  |
| Most people under 30 have... | saved, and do not know it                |
| IDEA DUMP                    | What three months of expenses looks like |
| Your note about riders       | for a fresh grad, worked out together.   |
| TREND                        | WHY IT FITS YOU                          |
| CPF interest rate review     | Your audience is fresh grads, and...     |
|                              | FROM  Today's ideas, Mon 20 Oct          |
|                              | Carousel | B Building Trust | CPF        |
|                              | [Write this post W] [Shortlist S]        |
|                              | [Discard D] [More like this M]           |
|                              | Refine [Make it about...        ][Refine]|
+------------------------------+------------------------------------------+
J K move   S shortlist   D discard   W write   M more like this   Z undo
```

- Desktop: the list on the left (360 px), the open idea on the right. At 390 px: the list full width, and tapping a row opens the idea full screen (pushes `idea=`), so Back returns to the list. The key legend is hidden on touch screens.
- Each list row: a source chip (`TODAY'S`, `IDEA DUMP`, `YOUR POSTS`, `MARKET`, `TREND`, `NEWS`, `SAVED`), the title on one line, the first line of the angle, and `fit <n>` (Jev's probability times 100) on today's ideas only.
- The open idea: title (serif), the angle, `WHY IT FITS YOU` and its line, `FROM` with the source and date (a link to the source where one exists), the suggested format, funnel stage and label as chips, and the hooks when the source has them. Buttons, each with its key shown as a small badge: `Write this post` (primary), `Shortlist`, `Discard`, `More like this`. Under them, a one-line input with the placeholder `Make it about...` and the button `Refine`.

The daily set:

- On the first visit to `/ideas` each Singapore day (or when `Get today's ideas` is pressed and today has no set yet), the page calls idea-dump mode "ideas" once. Pooled ideas from the other sources render at once from local data. Within 400 ms a pill shows at the top, `Writing today's ideas for <brand>...`, with three skeleton rows in the `TODAY'S` place.
- Done: today's ideas land at the top, highest fit first. After that the header button reads `More ideas` and asks for 6 more the same way.
- Every button that calls mode "ideas" (`Get today's ideas`, `More ideas`, `More like this`, `Refine`) carries the price chip `About US$0.01` (`PriceChip` for `ideas-daily` once business-cost-preview ships; this string until then). The automatic first-visit call shows the same price in the pill: `Writing today's ideas for <brand>... About US$0.01`.
- Failed: `Couldn't write today's ideas.` with `Try again`.
- Over the daily cap: `Today's limit for new ideas is used. It resets at 8am Singapore time.` The button is disabled with the same words as its title.
- Jev off (the response says `scored: false`): `Fit scores are off right now, so today's ideas are in the order they were written.` and no `fit` on rows.
- Every candidate refused as unsafe: `None of today's ideas were safe to post as written. Try Refine with a narrower topic.`
- No usable positioning: `Say who you serve first, so ideas are about them.` with `Set up positioning` linking to `/plan?view=setup`. The pooled sources still show; only the daily set waits.

Triage:

- `Shortlist` (S) toggles the idea onto the Shortlist tab; the toast reads `Shortlisted. Undo`.
- `Discard` (D) moves it to Discarded with the toast `Idea discarded. Undo` (5 s), and `Put back` on that tab restores it later.
- `Write this post` (W) opens Write with the idea filled in and marks the idea `written`, which takes it out of the Inbox. Its source page changes only where that page already records a write: an account audit idea is set to `used` (`setIdeaStatus`), and a market pick's key joins `written` in `content-studio-market-<scope>` (`withKey`, `saveMarket`), as `/market` does.
- `More like this` (M) and `Refine` ask mode "ideas" for 3 ideas close to the open one (Refine adds the typed steer, up to 200 characters). They appear right under it with the chip `MORE LIKE THIS`. While the call runs the button reads `Writing...`; failure and cap states use the strings above.
- Keys: J or the down arrow moves to the next idea, K or the up arrow to the previous one, S, D, W and M act on the open idea, and Z undoes the last shortlist, discard or put back (one step). Keys do nothing while the focus is in a text field or a modifier key is held. The page maps a key with a pure `keyAction(key, { inField, mod }, index, count)` in `ideasInbox.ts`, so the rule is testable without a DOM.
- `Discard all` sits at the foot of the Inbox list. It asks `Discard all <n> ideas in this list?`, and the toast after it has `Undo`.
- Inbox empty: `Inbox clear. New ideas come with your next visit tomorrow.` (or, before today's set exists, `Inbox clear. Press Get today's ideas for a fresh set.`).
- Loading: local sources render in the first frame. The audit ideas load from the table; their rows show a small spinner in the `YOUR POSTS` filter count until they arrive, and a failed read leaves them out with the line `Couldn't load your post ideas.` at the bottom of the list.

Where pooled ideas come from (`poolIdeas` in `src/lib/ideasInbox.ts`, at most 10 newest from each source):

| Source chip | Read from | Title | Angle | Why | Write link |
|---|---|---|---|---|---|
| IDEA DUMP | `loadBriefs`, not on the board (`isOnBoard` false) | `idea` | `angle` | `stageReason` | `briefWriteUrl(brief, audience)` |
| YOUR POSTS | `loadLatestIdeas(auditId)` for each audit of the brand's own accounts, status `new` | `hook` | `idea` | `why` | `ideaWriteUrl(...)` |
| MARKET | the newest check in `loadMarket(uid)`: `visibleNews(d, s, "act")`, minus keys in `written` | `title` | `snippet` | `Your market check marked this Act (<keyword>).` | `newsWriteUrl(x)` |
| TREND | `getTrends()` found in the last 7 days | `title` | `trend_source`, else the first talking point | `why_it_works` | `buildTrendRemixUrl(t)` |
| NEWS | find-news-questions' picks when shipped, else the 5 newest `NEWS` stories | `title` | `talkingPoint` | `gist` | `buildNewsWriteUrl(s)` |
| SAVED | saved top posts that have an `idea` | `idea.hook` | `idea.adapt` | `idea.why` | `buildRemixUrl(...)` |

Keys are `<source>:<id>` (`dump:`, `audit:`, `market:` plus market's own `newsKey`, `trend:`, `news:`, `saved:`, and `gen:<day>:<n>` for generated ones), so a status sticks to the same idea everywhere.

Finding the audits: add `brandAudits(uid)` to `src/lib/accountAudit.ts`. It reads `id, platform, handle` from `cs_social_audits` (the user's own rows, by RLS) and keeps the rows whose handle matches the brand's saved account in `loadSocialAccounts(uid)`, the same match `AnalyticsPage.tsx` makes near line 520. It never calls `openAudit`, so opening `/ideas` never starts a paid refresh.

TREND rows will be empty until the trends drop runs again (its last run was 11 Oct). The filter then shows `Trends 0` and no stale kit is passed off as new.

Write link for a generated idea: `/generate?pillar=topic&detail=<title>&format=<format>&funnel=<stage>&ctx=<angle, then "Why it fits: <why>">`, plus `label=<id>` once plan-content-plan has added that param.

Home (`src/pages/HomePage.tsx`), Leo only: a third tile in "Need an idea?", `Today's ideas` / `<n> new for you today.`, or `A fresh set each day, written for you.` before today's set exists. It links to `/ideas`.

### Copy

Every string above is exact. The page H1 is `Ideas`. The tabs are `Inbox`, `Shortlist` and `Discarded`, each with its count, and the source filter reads `From:`. The buttons are `Get today's ideas` (later `More ideas`), `Write this post`, `Shortlist`, `Discard`, `More like this`, `Refine`, `Put back` and `Discard all`.

### Data

- `src/lib/ideasInbox.ts`, synced key `content-studio-ideas-<scoped(uid)>`, one per brand:
  ```ts
  interface GenIdea {
    key: string; title: string; angle: string; why: string;
    format: "text-post" | "carousel" | "short-video"; stage: FunnelStageId;
    labelId?: string; fit: number | null; like?: string; at: string;   // like = key of the idea it came from
  }
  interface IdeasState {
    days: { day: string; ideas: GenIdea[] }[];                          // last 14 Singapore days
    status: Record<string, { s: "shortlisted" | "discarded" | "written"; at: string }>; // 1,000 newest
  }
  ```
- About 14 days of 6 to 20 ideas at 300 bytes each, so under 90 KB. Pooled ideas are never copied in; only their status is stored, by key.
- A discard is a status row, never a deletion, so nothing depends on a tombstone. No table, no migration.

### AI and cost

- New idea-dump mode "ideas" in `supabase/functions/idea-dump` (logic in `logic.ts`, tested):
  - Request: `{ mode: "ideas", count: 3 to 8, context: { positioning, goal, voice, labels: string[] }, posted: string[] (up to 15 recent hooks, to avoid), best: string[] (up to 5 hooks of the brand's best posts by engagement()), seeds: { key, kind, title }[] (up to 10 from today's news, market Act picks, trends and niche picks), like?: { title, angle }, steer?: string }`.
  - The LLM (idea-dump's pinned `gpt-4.1`, structured output `IDEAS_SCHEMA`) writes `count + 2` candidates: `{ title (at most 12 words), angle (at most 25 words), why (at most 20 words, why this audience would care), format, stage, label? (one of the labels sent), seedKey? }`. The prompt carries `COMPLIANCE_LINES` (plan-angles moves them into one constant), forbids repeating anything in `posted`, and says ideas are general education for Singapore, with no named insurer, product or promised return.
  - Jev, one `askJev` call per candidate, 6 at a time (copy the `pool` helper from `supabase/functions/market/index.ts`), each with `JEV_TIMEOUT_MS`, state `{ brand, serves, topics, goal, country: "Singapore", idea: "<title>: <angle>" }`:
    - `fits` (noul): "Would the people `serves` in `country` stop to read a post on `idea`, and is `idea` close to the adviser's `topics` or `goal`?" True: "A concrete subject this audience meets in their own money life, tied to one of the topics or the goal." False: "Generic finance advice anyone could post, a subject this audience does not face, or one far from the topics."
    - `safe` (noul): "Can a financial adviser in Singapore post about `idea` in general terms, without recommending a product, naming an insurer's plan or promising a return?" (the same wording find-news-questions uses).
    - Keep candidates with `fits >= 0.6` and `safe >= 0.6`, sort by `fits`, return `count`. Both lines are proposed: log every candidate with both scores for the first 20 runs, Leo labels 30 of them, and the cut moves to where the disagreements say before the gate comes off.
  - Without Jev (null or timeout): return the first `count` candidates that pass the server compliance check (`complianceIssues` in `_shared/socialAudit.ts`), with `scored: false`.
  - The function answers `{ ideas: GenIdea[], scored: boolean }`.
- Add `"ideas-daily": 15` to `DAILY_LIMITS` in `supabase/functions/_shared/usageCaps.ts`, commented "Ideas inbox (idea-dump mode ideas): one gpt-4.1 call writes up to 10, Jev keeps the ones that fit, about US$0.012." One use per call, given back with `refundUsage` when OpenAI fails.
- Cost from list prices: about 2,000 input and 1,000 output tokens a call at US$2 and US$8 per million, so about US$0.012. Ten Jev reads add under US$0.0002. A day with the daily set and five refines is about US$0.07. Measure the first runs and correct the comment.
- Server gate: mode "ideas" answers 404 `{code: "not_enabled"}` unless `leoOnly(user.email)` (`supabase/functions/_shared/leoOnly.ts`, from plan-goal).
- Pooled ideas cost nothing: they are already on the device or in the brand's own rows.

### Deep links

- `/ideas?tab=inbox|shortlist|discarded` (replace; default inbox).
- `/ideas?source=all|today|dump|posts|market|trends|news|saved` (replace; default all).
- `/ideas?label=<id>` filters to ideas with that label (replace).
- `/ideas?idea=<key>` opens that idea (push, URL-encoded key); a key that is gone falls back to the list.
- Add `links.ideas({ tab, source, label, idea })` to `src/lib/links.ts`, the rows to `docs/deep-links.md`, a `CopyLinkButton` on the open idea, and "ideas", "inbox" and "shortlist" to the words Jump to finds the page by (`src/lib/jumpTo.ts`).

## Done when

- [ ] Leo's sign-in sees Pipeline > Ideas; a demo sign-in sees no tab, gets the 404 page at `/ideas`, and gets 404 from mode "ideas".
- [ ] The first visit of the day writes about 6 ideas within 20 seconds, each with a why line and a fit, while pooled ideas show at once.
- [ ] A second visit the same day makes no call; `More ideas` makes one.
- [ ] Ideas from Idea Dump, the account audit, Your market, news and saved posts appear with the right chip and open Write with their own links; trends appear once trends.json has entries from the last 7 days (check with a fixture).
- [ ] Opening `/ideas` never starts an account audit refresh (no `audit-social-account` call in the network log).
- [ ] S, D, W, M, J, K and Z work from the keyboard and do nothing while typing in Refine.
- [ ] Discard all asks first and can be undone.
- [ ] Shortlisting on one device shows on the other after sync.
- [ ] With Jev off, the set still arrives, unranked, with the banner.
- [ ] Twenty ideas read by eye on two brands: none names an insurer or product, none promises a return.
- [ ] 390 px and 1440 px checked by eye on the list, the open idea and every state.
- [ ] Build and full vitest pass; the item flips in `src/data/northStar.ts`.

## Tests

- `src/lib/ideasInbox.test.ts`:
  - `poolIdeas` maps each source to the right title, angle, why and link, with stable keys, at most 10 per source, and leaves out briefs already on the board, audit ideas that are used or dismissed, and market picks already in `written`.
  - Tabs: shortlisted, discarded and written ideas land in the right tab; undo restores the previous status.
  - `needsDailySet(state, now)` is true only once per Singapore day (fixed `now`, never the real clock).
  - Trimming keeps 14 days and 1,000 statuses.
  - `keyAction` moves within bounds, maps S, D, W, M and Z, and returns nothing from a text field or with a modifier held.
- `supabase/functions/idea-dump/logic.test.ts`:
  - `parseIdeasRequest` clamps `count` to 3 to 8, cuts `posted` to 15, `seeds` to 10 and `steer` to 200 characters.
  - The prompt carries `COMPLIANCE_LINES`, the posted hooks, the steer and the `like` idea.
  - `validateIdeas` drops unknown formats, stages and labels and trims over-long fields.
  - `rankIdeas` keeps only fits and safe at 0.6 or more, sorts by fits and returns `count`; with no answers it falls back to the compliance check and sets `scored: false`.
- `src/lib/nav.test.ts` and `navRoutes.test.ts` stay green with the owner-gated tab (the More sheet for someone@example.com is unchanged).
- `usageCaps`: `ideas-daily` is 15.

## Open questions

- Should today's ideas be written before Leo opens `/ideas` (on app load, or by a server job with a morning push), instead of on the first visit each day? On app load it costs about US$0.012 a day per brand opened, and a server job needs a pg_cron migration, so Leo decides.
- Should a discard teach the next day's set, as YouTube's "Not Interested" does? It would send the last 10 discarded titles as things to avoid; left out until the first two weeks show whether discards repeat.

## Related

find-niche-feed, find-news-questions, find-alerts-digest, plan-content-plan, plan-interview, plan-autopilot, remix-own-winners, agent-home, brand-voice-memory
