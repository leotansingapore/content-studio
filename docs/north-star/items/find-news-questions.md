# News and real client questions

`find-news-questions` | find | phase 7 | status: partial | /north-star#find-news-questions

## Leo asked

15 Oct 2026: "embed it within the tool so it depends on the person's market/website"

He said it about Your market, and it applies here because the picks below are ranked against the brand's own audience and topics.

## How the best do it

Fastlane has no news, mention or forum-question source in the recording. The nearest thing is a format that a news pick could be remixed into: the Studio format grid shows "AI News Anchor", "A news anchor breaks your customer's problem as tonight's top story", "About 210 credits a post" (bottom right below). That format belongs to the item formats-presenter.

![Fastlane 1:28](../../../public/north-star/fastlane/t088.webp)

Other competitors:

| Competitor | What they do | Numbers | Source |
| --- | --- | --- | --- |
| Vista Social | Keyword listeners across X Trends, X News, YouTube, Google Search and Trends and the news web. Each story gets a "Convergence Score" 0-100 from how many sources confirm it, how recent it is and its volume; a story from one source only is treated as noise. Alerts "Sentiment dip" and "Influencer hit". | $75 / $150 / $250 per listener per month | [listening](https://vistasocial.com/social-media-listening/), [pricing](https://vistasocial.com/pricing/) |
| FMG Suite | "AI-powered Curator" picks articles from "thousands of articles from trusted sources" and writes a social caption for each. It learns the adviser's interests (hobbies, causes). Breaking market news gets ready-to-send content "Within 48 hours". | not published | [marketing](https://fmgsuite.com/marketing/), [content](https://fmgsuite.com/features/content/) |
| Hootsuite | Trend discovery by industry, topic, company or hashtag; a result can be turned into an AI post. Forecasting up to 90 days ahead on Professional. | Forecasting on Professional and above | [publishing](https://www.hootsuite.com/platform/publishing), [plans](https://www.hootsuite.com/plans) |
| ContentStudio | Discover: RSS "Feed topics", OPML "Bulk import", "Trending stories" by topic; "Instant social share" turns an article into a scheduled post. | Feed search and OPML on Advanced and above | [discover](https://contentstudio.io/discover), [pricing](https://contentstudio.io/pricing) |
| SocialBee | Blog RSS feeds imported into categories as post sources. | 10 / 30 / unlimited sources | [features](https://socialbee.com/features/), [pricing](https://socialbee.com/pricing/) |
| SageContent | "Evergreen Ideation" (topics good for 6+ months) beside "Timely Ideation" from current financial news. | not published | [blog](https://www.sagecontent.ai/blog/best-ai-marketing-tools-financial-advisors) |
| EasyGen | EasyTrend: trending topics with summaries from Reddit, X, Google, Bing or Perplexity. | not published | [site](https://www.easygen.io/) |
| Exolyt | Social Listening projects on TikTok: hashtags bundled into themes, share of voice against competitors, and comment themes, meaning what an audience says about a topic. | Projects: Basic 0, Essentials 3, Advanced 15 | [listening](https://exolyt.com/features/social-listening), [pricing](https://exolyt.com/pricing) |
| Virlo | Recurring agents detect confirmed breaking events in a niche (webhook `content_research_agent.event.detected`, added Aug 7, 2026). | Events read free | [changelog](https://dev.virlo.ai/changelog) |

The pattern to copy is one short list of what to post about now, drawn from every source and ranked for the reader's market, with a button that makes the post. Vista Social's cross-source score and FMG's per-adviser caption are the two ideas that fit advisers best.

## What we have today

Checked against 08537d1, then re-checked on origin/main f2cb275 on 20 Oct 2026. The 13 commits between them are touch-target fixes and the daily data drops.

- `/swipe?tab=news` (`src/pages/SwipeFilePage.tsx`, tab label "Industry news" with a count) stacks three sections:
  - Industry news holds Singapore stories copied daily from ActivityTracker's Bulletin (`src/components/IndustryNews.tsx`, `src/lib/industryNews.ts`, data `src/data/industryNews.json`, drop `scripts/industry-news.mjs` through `~/.local/bin/content-studio-drop.sh industry-news`, launchd `com.leo.industry-news-drop` at 08:00 SGT). On 20 Oct the file held 51 stories, 34 with a client message that passed ActivityTracker's advice check. Every story has a gist, a talking point and "Write about this" (`buildNewsWriteUrl`, `idea=news-hook`). The 34 also get "Send to a client" (or "Copy client message" where the browser cannot share). A topic filter `?topic=` covers 8 topics and `?q=` searches. The file is not only recent news: the stories run from February 2022 to 18 Oct 2026, and 15 of the 51 are from the last 30 days.
  - Your feeds keeps up to 10 RSS feeds per brand (`src/components/YourFeeds.tsx`, `src/lib/feeds.ts`, synced key `content-studio-feeds-<scoped>`, edge fn `feed-ideas`, cap `feeds` 60), each story with "Write about this" via `storyWriteUrl`. The component reads the feeds when it mounts and keeps the stories for 30 minutes in sessionStorage `cs-feed-stories` as `{ key, at, stories, problems }`.
  - Mentions checks up to 5 keywords (synced key `content-studio-mentions-<scoped>`) against Singapore Google News through DataForSEO (`src/components/Mentions.tsx`, `src/lib/mentions.ts`, edge fn `mentions`, cap `mentions` 10, depth 10 per keyword). It runs only when "Check now" is pressed and keeps the last results in sessionStorage `cs-mention-results` as `{ uid, results }`. Its "Write about this" also uses `storyWriteUrl`.
- Real questions are the newest 60 questions from r/singaporefi (53) and HardwareZone Money Mind (7), kept for 14 days (`src/data/realQuestions.json`, drop `scripts/sg-feeds.mjs`, run by the same 08:00 industry-news job). Jev judges each one and tags a Plan audience; the post body is never stored. They appear only inside Write's idea step under "Asked this week in Singapore" (`src/components/RealQuestions.tsx`, `questionsFor` in `src/lib/sgFeeds.ts`), so there is no page where you can browse them.
- Your market at `/market` (`src/pages/MarketPage.tsx`, `src/lib/market.ts`, edge fn `market`) runs a weekly check: ChatGPT answers to up to 5 client questions (DataForSEO llm_scraper, about USD 0.004 each), keyword news and Following's best posts, each tagged act or watch by Jev. It keeps its own `dismissed` and `written` lists (keys `n:`, `q:` and `p:` in `src/lib/market.ts`). The function answers 404 to user ids missing from the `MARKET_USERS` secret, which today means Leo. Limits are one check a week per brand, `market-check` 3 a week per account (the row is read over 7 days), `market-check-global` 20 a day and `market-suggest` 5 a day.
- Every "write" button opens Write (`/generate`) with a text brief. Nothing ranks across the sources or says which five to post this week, and the output is always text.
- `RemixButton` (`src/components/remix/RemixButton.tsx`) and `src/lib/remixSource.ts` do not exist yet. They are specced in remix-everywhere and remix-source-trail.

So three things are missing: questions as a source you can browse, one ranked list across all five sources for this brand, and a single "Make a post" action that goes into the shared Remix flow.

## Build

This is the smallest version that covers all five sources. It sits behind `leoOnly(email)` from `src/lib/leoOnly.ts`, and every other account keeps today's stacked news tab with no change.

### Screens and states

The news tab gets a source row, and Leo lands on the picks.

```
/swipe?tab=news
[Top posts] [News and questions] [Ads]
Picked for you | Industry news 49 | Client questions 60 | Your feeds | Mentions | Your market
------------------------------------------------------------------
Five to post about this week (i)
 News . The Straits Times . 2d
 MediShield Life premiums to rise from April
 [Make a post]  Not for me  (link icon)
 Client question . r/singaporefi . 1d
 Should I buy a studio in Singapore instead of renting a room?
 [Make a post]  Not for me  (link icon)
 ... up to 5
```

States for "Picked for you":

| State | What shows |
| --- | --- |
| Loading | Within 400 ms, five skeleton rows and the line "Picking this week's five..." |
| Done | Up to 5 rows; a row the user already drafted from shows a "Drafted" chip and drops to the bottom |
| Jev returned null (no key, timeout) | Rows sorted newest first, header chip "Newest first", no error |
| Over the daily cap (`news-picks`) | The newest-first list with "Picks are back at 8am. Showing newest first." |
| Failed (network or 5xx) | The newest-first list with "Couldn't pick posts just now. Showing newest first." and a "Try again" button |
| All hidden | "You've cleared this week's picks." and one button "See all industry news" (switches to `source=industry`) |
| Refused | Cannot happen here, because nothing is generated on this screen |

The "Client questions" view lists all the questions in the file (60 today) newest first, each with its forum, its age and a link icon. Audience chips: Everyone, Young adults, Working adults, Parents and Pre-retirees. The default chip is the brand's Plan audience from `src/lib/positioning.ts` (`loadPositioning(userId).audience`), as `questionsFor` already does. When the chosen group has fewer than 3 questions, the view shows everyone's with the line "Few questions from this group this fortnight. Showing everyone's."

The "Your market" view appears only when `marketShown()` is true. It reads the latest check's ChatGPT answers from `loadMarket(userId).checks` and shows each with its `POSITION_LABEL` and the existing "Write from this" link (`geoWriteUrl`). When there is no check yet, the view shows "Run a check on Your market first." beside a link to /market labelled "Open Your market", and it makes no new calls.

The "Industry news", "Your feeds" and "Mentions" views render today's components unchanged, one per view.

"Make a post" on a news, question or market row is a plain Write link today: `buildNewsWriteUrl`, `geoWriteUrl`, or the new `questionWriteUrl`. Once `remix-everywhere` has shipped, the row wraps that link as `<RemixButton source={resolveSource(key, userId)}>{link}</RemixButton>`, which is that component's API (props `source` and `children`), so the user can pick a format such as a text post, a carousel, a talking head or a news anchor. When `resolveSource` returns null, render the link alone.

Feed and mention rows have no stable key that survives a reload, so their "Make a post" stays today's `storyWriteUrl` link. That is the rule `remix-everywhere` already uses for Creator lookup posts that are not in the hand-picked data.

Pressing "Make a post" on any row adds its key to `written` (below), so the row shows "Drafted" when the user comes back.

The source record lives in `src/lib/remixSource.ts` from `remix-source-trail` (`RemixSourceKind`, `resolveSource`). This item adds three kinds there, each with format `text`: `news:<story id>` resolved from `src/data/industryNews.json` (the `id` field, 12 hex), `question:<forum>:<post id>` resolved from `src/data/realQuestions.json`, and `geo:<question slug>` resolved from the latest stored market check. The question key is read from the URL so it can be built without hashing: `reddit:<id>` from `/comments/<id>/`, and `hwz:<id>` from the number after the last dot in a HardwareZone `/threads/<slug>.<id>/` link. A key whose item has rotated out resolves to null, and the row falls back to its plain link.

### Copy

| Where | Text |
| --- | --- |
| Tab label (was "Industry news"; renamed on Leo's sign-ins only) | "News and questions" |
| Source chips | "Picked for you", "Industry news", "Client questions", "Your feeds", "Mentions", "Your market" |
| Picks heading | "Five to post about this week" |
| Picks InfoTip | "Picked from today's news and questions for the people you serve." |
| Kind labels on rows | "News", "Client question", "Your feed", "Mention", "ChatGPT answer" |
| Row buttons | "Make a post", "Not for me" |
| Link icon aria-label | "Read it on <source>" |
| Hide toast | "Hidden from your picks" with action "Undo" |
| Drafted chip | "Drafted" |
| Questions heading | "Questions people asked this fortnight" |
| Questions InfoTip | "From r/singaporefi and HardwareZone Money Mind, refreshed daily." |
| Question row button | "Make a post", the same label as on the picks, since it is the same action |
| Market heading | "What ChatGPT tells your clients" |

The state lines are written in the states table above.

### Data

- A synced key per brand, `content-studio-news-<scoped(userId)>`, holds `{ hidden: string[], written: string[] }`, each list capped at 300 with the oldest dropped. The keys are `n:<url>` for industry news, `q:<url>` for a question, `f:<link>` for a feed story, `m:<url>` for a mention and `g:<question lowercased>` for a market answer. Hiding writes the key and Undo removes it; a hide is not a security state, so the lack of tombstones does no harm.
- A device cache, `cs-news-picks-<scoped(userId)>`, holds `{ day: "YYYY-MM-DD" (Singapore), inputHash, picks: { key, fit }[] }` and is reused while the day and the input list stay the same, so opening the tab twice costs one use.
- Picks read only what is already loaded: the static industry news and questions, the synced market digest, and the feed stories and mention results that `YourFeeds` and `Mentions` already keep in sessionStorage (`cs-feed-stories`, `cs-mention-results`). So a picks run never triggers a paid lookup, and feed and mention items join the picks only after those views have loaded in this session.
- Only items from the last 30 days go in. The industry news file holds stories back to 2022, and an old story is not something to post about this week.
- A new file `src/lib/newsPicks.ts` has `pickInputs(...)`, which merges the sources into `{ key, kind, title, source, date, summary }`, drops items older than 30 days and hidden keys, and keeps the newest 80. `rankPicks(items, answers)` applies the rules below. None of this needs a schema change, since every list lives in the keys above.

### AI and cost

- Add a mode `picks` to the existing edge function `supabase/functions/feed-ideas`, with its rules in `feed-ideas/logic.ts` and Jev through `_shared/jev.ts` (pinned `jev-1.13.0`). The request is `{ mode: "picks", serves, topics, items }` with at most 80 items, and the response is `{ picks: { key, fit, safe }[] | null }`. This mode consumes `news-picks` and never `feeds`, and it fetches nothing.
- `serves` and `topics` come from the Your market set-up when it exists (`audience`, `topics` in `loadMarket`), else the Plan positioning (`audienceDetail`, `topics`, `oneLiner` from `src/lib/positioning.ts`), which Add a brand already fills from the brand's website through `brand-dna`. That is how the list follows the brand's market.
- Each item gets one `askJev` call (6 at a time, using a copy of the local `pool` helper in `supabase/functions/market/index.ts`; `JEV_TIMEOUT_MS` is 5 s) with the state `{ serves, topics, country: "Singapore", kind, item: title, source, summary }` and two noul questions:
  - `fit`: "Would the people `serves` in `country` want a post about `item` this week, or does `item` touch the adviser's `topics`?"
  - `safe`: "Can a financial adviser in Singapore post about `item` in general terms, without recommending a product, naming an insurer's plan or promising a return?"
- `rankPicks` keeps items with `fit >= 0.5` (the same line as `RELEVANT_AT` in `market/logic.ts`) and `safe >= 0.6`, sorts by `fit`, allows at most 2 of one kind so one source cannot fill the list, and returns the top 5. Treat 0.6 as a starting point: on the first run, log every item with both scores, read the 20 nearest the line, and move it if the misses say so before the gate comes off.
- A run is about 80 items at 300 input tokens each, so 24,000 tokens or about US$0.001 at $0.042 per million.
- Add `"news-picks": 10` to `DAILY_LIMITS` in `supabase/functions/_shared/usageCaps.ts` with the comment "Picks on the news tab (feed-ideas picks): Jev only, about US$0.001 a run." Over the cap it answers with the standard `usageRefusal`.
- The `picks` mode answers 403 `{ code: "not_allowed" }` unless `isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)` passes, reusing `isAllowed` from `supabase/functions/market/logic.ts` and the `NORTH_STAR_USERS` secret (Leo's two user ids) that other north-star items add. If another item has already shipped a shared server gate helper, use that one. The check is on the user id because an email proves nothing on this Supabase project (`docs/team-roles.md`).
- The new link builder `questionWriteUrl(q)` in `src/lib/sgFeeds.ts` returns `links.generate({ pillar: "topic", detail: q.question, idea: "real-question", ctx })` from `src/lib/links.ts`, that is `/generate?pillar=topic&detail=<question>&idea=real-question&ctx=...`, where ctx reads: `Answer this question people in Singapore asked: "<question>" (<source>). Answer in general terms for anyone in that position. Do not quote or name the person who asked, do not recommend a product, and do not promise returns.`
- The post itself is written by Write (`generate-social-content`, hosted on the academy project) or by the Remix flow, and each of those keeps its own caps.

### Deep links

- The new param `source` takes picks, industry, questions, feeds, mentions or market, as in `/swipe?tab=news&source=questions`. It replaces history, defaults to `picks` behind the gate (today's stacked view otherwise) and ignores unknown values.
- On the news tab, `audience` takes general, young-adult, working-adult, parent or pre-retiree, as in `/swipe?tab=news&source=questions&audience=parent`. The posts tab keeps its own values for the same name (`parents`, `young-adults`, read by `useUrlLabel("audience", AUDIENCES)`), which is how `topic` already works. The posts filter ignores the news values because they are not in its list, and `setTab` already clears `audience` on a tab switch.
- The existing `topic` param keeps working on the industry view, for example `/swipe?tab=news&source=industry&topic=scams`.
- Add `source` to `links.swipe` in `src/lib/links.ts`, and add both params to the `/swipe` rows in `docs/deep-links.md`.

## Done when

- [ ] Leo's two sign-ins see the source row and "Picked for you", while another account sees today's news tab unchanged.
- [ ] `/swipe?tab=news&source=questions` lists the 60 questions, filters by audience and opens Write with `idea=real-question` and the no-quote rule in ctx.
- [ ] Picks show at most 5 rows and at most 2 of one kind, each with "Make a post", "Not for me" and a source link.
- [ ] With `TYPESAFE_API_KEY` unset, picks render newest first with the "Newest first" chip and no error.
- [ ] The 11th picks run in a day returns the cap refusal, and the page shows the 8am line.
- [ ] A hidden item stays hidden on a second device (synced key), and Undo brings it back.
- [ ] Pressing "Make a post" on a pick marks it "Drafted" when the user comes back.
- [ ] A picks run leaves the `feeds` counter in `cs_ai_usage` unchanged and adds one `news-picks` use.
- [ ] Picks never call `mentions`, `market` or any paid lookup, as checked in the network panel.
- [ ] No story older than 30 days appears in the picks.
- [ ] A uid missing from `NORTH_STAR_USERS` gets 403 from the `picks` mode even when it calls the function directly.
- [ ] Checked by eye at 390 px and 1440 px; on a phone the chip row scrolls sideways with no page overflow.
- [ ] `npm run build` and `npx vitest run` pass, `docs/deep-links.md` is updated, and the item in `northStar.ts` is flipped with its `ours` line.

## Tests

- In `supabase/functions/feed-ideas/logic.test.ts`, check that the picks request is capped at 80 items and rejects an empty list, that the gate refuses a user id missing from `NORTH_STAR_USERS` and passes one that is listed, and that the Jev state carries the audience, the topics and the item.
- In `src/lib/newsPicks.test.ts`, check that `pickInputs` builds the right key for each kind, drops hidden keys, drops a 31-day-old story while keeping a 29-day-old one, and keeps only the newest 80 of 100 items, and that `rankPicks` keeps fit 0.5 and safe 0.6, caps 2 per kind and 5 in total, and sorts newest first when the answers are null. Give each rule a case that fails if the rule is removed.
- The question key builder returns `reddit:1x8ndt0` for a fixture r/singaporefi link and `hwz:7225688` for a fixture HardwareZone thread link, and null for any other host.
- In `src/lib/sgFeeds.test.ts`, check that `questionWriteUrl` sets `idea=real-question` and that its ctx contains "Do not quote or name the person who asked".
- A render test for `src/pages/SwipeFilePage.tsx` proves a non-Leo email sees no source row, and that `source=market` falls back to `picks` when `marketShown()` is false.
- `supabase/functions/_shared/usageCaps.test.ts` still passes with the new `news-picks` entry.
- In `src/lib/remixSource.test.ts`, `resolveSource` returns a record for a `news:`, `question:` and `geo:` key from fixtures, and null for one that has rotated out.

## Open questions

- Should the five picks also sit on Home under "Need an idea?" as well as on the news tab? Leo decides.
- Mention results live only on the device today. Whether to store them per brand, for the picks and for the weekly brief, is a decision for the `find-alerts-digest` spec.
- Breaking-news speed (FMG's "Within 48 hours") depends on the ActivityTracker Bulletin, which runs once a day. No change is proposed.
- `NORTH_STAR_USERS` is a new Supabase secret. Setting it is config, not a schema change, but if no earlier north-star item has set it, the builder confirms Leo's two user ids with him first. remix-everywhere gates its own function with a separate `REMIX_USERS` secret, so the two lists can drift; whether to merge them is Leo's call.

## Related

remix-everywhere, remix-any-format, find-alerts-digest, find-search-topics, find-adviser-library, formats-presenter, plan-ideas-inbox, trust-compliance-check
