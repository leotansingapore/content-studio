# Ready-to-share finance content

`find-adviser-library` | find | phase 8 | status: partial | /north-star#find-adviser-library

## Leo asked

No direct ask; from the competitor research.

## How the best do it

Fastlane does not have this. Its Studio > Library (Leo's FireShot capture, `../research/fastlane-pdf/lib-tile-00.webp` to `05`) holds the posts you made, your media, picture sets and an inspiration feed of other people's posts and competitor ads, each to remix. Nothing in it is written for you to share as is.

The adviser tools do it like this:

| Competitor | What they do | Numbers | Source |
| --- | --- | --- | --- |
| Twenty Over Ten Lead Pilot | Every month the library adds 10 personal finance articles, 10 lifestyle articles, 3 infographics and 1 quiz. Advisers filter by topic and by persona, and the newest pieces sit at the top of the Content tab. Each share opens on an adviser-branded landing page with a subscribe form. | Total library size not published | [content solutions](https://help.twentyoverten.com/en/twenty-over-tens-content-solutions), [Lead Pilot](https://help.twentyoverten.com/en/lead-pilot) |
| FMG Suite | A pre-approved library of emails, social posts, market commentaries, videos, blogs and e-books; the compliance page states "All content is FINRA-reviewed", and an edit sends the piece back to review. The "AI-powered Curator" adds third-party articles with a caption written for each adviser. | Piece count not published (a Trustpilot profile claims 400+, unverified) | [content](https://fmgsuite.com/features/content/), [compliance](https://fmgsuite.com/features/one-click-compliance/), [marketing](https://fmgsuite.com/marketing/) |
| Broadridge Advisor (AdvisorStream, Forefield heritage) | "Legally licensed" articles from WSJ, Dow Jones, the New York Times and more than 20 titles on Growth, beside 3,000+ FINRA-reviewed Forefield pieces and 30+ educational videos branded with the adviser's photo and colours. | Licensed content on Growth, USD 235/mo | [site](https://advisor.broadridge.com/), [pricing](https://advisor.broadridge.com/pricing), [Forefield library](https://broadridge.com/advisor/emailsocialmarketing), [video library](https://wealthprofessional.ca/investments/wealth-technology/broadridge-empowers-advisors-to-make-their-mark-with-video/361314) |
| Hearsay Social (Yext) | Content+ picks top-performing content for the post library, screens it against the firm's lexicon and sends it into the compliance workflow automatically. | Enterprise | [datasheet](https://info.yext.com/rs/906-IBA-353/images/Hearsay_Social_Datasheet_2022.pdf), [launch](https://www.businesswire.com/news/home/20230418005475/en/Hearsay-Unveils-Content-the-Only-AI-Powered-Content-Solution-Tailored-to-the-Unique-Needs-of-Financial-Services-Organizations) |
| Vestorly | Machine learning finds and filters third-party and original content per adviser, and every piece passes a "Robo-Compliance" filter. The CEO cited about six hours a week saved (2016). | Pricing per listing (unverified) | [InvestmentNews](https://investmentnews.com/fintech/vestorly-raises-its-game-with-artificial-intelligence/66139) |
| Seismic Social (formerly LiveSocial) | The firm's own research beside third-party content matched to each professional's market and interests, found, personalised and published from one place. | Enterprise | [product](https://www.seismic.com/products/livesocial/) |
| Levitate | Broker-dealers mark each library template Pre-Reviewed, Approved or Rejected; advisers see only the first two, and a rejection needs a reason. | No public prices | [help](https://help.levitate.ai/article/428-compliance-pre-review-pre-approve-and-reject-content) |

The US tools lean on FINRA review, which has no shared equivalent in Singapore, so here the screen has to be our own checks against MAS rules plus the adviser's firm. Lead Pilot's monthly 10, 3 and 1 with topic and persona filters is the shape to copy.

## What we have today

Checked against 08537d1, then re-checked on origin/main f2cb275 on 20 Oct 2026.

- Industry news on `/swipe?tab=news` is the one piece that already works as share-ready content. Its Singapore stories (`src/data/industryNews.json`, copied daily from ActivityTracker's Bulletin by `scripts/industry-news.mjs`; 51 on 20 Oct) have a topic filter over 8 topics (Insurance, Healthcare costs, Government schemes, CPF and retirement, Rates and markets, Scams, Cost of living, Property). 34 of the 51 carry a client message that passed ActivityTracker's advice check, with "Send to a client" or "Copy client message" in `src/components/IndustryNews.tsx`; the rest have none. These are third-party articles with a message to send to one client, not finished social posts.
- The Inspiration library (`/inspiration`, `src/data/inspiration.json`) holds 100 example posts, which are references for "Use as vibe" and are never shared as they are.
- The compliance chips (`scanCompliance` in `src/lib/compliance.ts`) show amber `warn` and red `error` flags on Write's text, and the file says plainly that nothing in it blocks a copy. Jev's fact flags run in Write as well (`writing-judge` mode `facts`, cap `fact-check` 60).
- The carousel maker already turns a saved post into slides: its "topic" tab saves an AI-written post as a draft with format `carousel` and opens it at `/carousel?draft=<id>`, and `splitDraftIntoSlides` in `src/lib/carousel.ts` reads "Slide 1:" style markers when a post has two or more. With markers, the first slide becomes the cover (`coverText` folds a cover of 20 words or fewer into one title), each middle slide is split into a title of up to 12 words and a body (`toSlideText`), and the last slide is kept as the closing slide only when it matches the private `CTA_PATTERN` (for example "save this", "share this", "send me"); otherwise `DEFAULT_CTA` is appended as an extra slide. With fewer than 3 middle slides it splits long ones in half.
- `scripts/trend-scout.mjs` and `scripts/sg-feeds.mjs` are the patterns for a drop script: a run that cannot produce enough valid items writes nothing, and `sg-feeds.mjs` imports `supabase/functions/_shared/jev.ts` directly. `src/lib/compliance.ts` has no imports and loads under plain `node` 22 the same way (checked on 20 Oct).
- `~/.local/bin/content-studio-drop.sh` runs the data drops by sub-command (`top-posts`, `industry-news`, `ads-swipe`, `sg-feeds`) and commits only when the files changed.
- There is no library of finished posts, infographics or quizzes, no persona filter, no monthly drop, and no licensed content. The pre-approved team library is the separate item trust-approved-library.

## Build

The smallest version is a monthly static drop made on Leo's Mac, shown as a new tab on `/swipe`. Nothing generates at runtime, so the tab costs nothing per user. Everything sits behind `leoOnly(email)` from `src/lib/leoOnly.ts`.

### The monthly drop

A new script, `scripts/ready-to-share.mjs`, writes `src/data/readyToShare.json` and a small `src/data/readyToShareMeta.json`. It runs on the 1st of each month at 09:00 SGT through a new `ready-to-share` sub-command of `~/.local/bin/content-studio-drop.sh` (one more `case` line, `ready-to-share) NAME=ready-to-share; SCRIPT=scripts/ready-to-share.mjs`, and the usage line) and a launchd job `com.leo.ready-to-share`. Like the other drops, it commits only when the files changed.

1. Each month it makes 10 posts (an explainer of 120 to 220 words), 3 infographics (a carousel of 5 to 7 slides: cover, 3 to 5 stat slides, closing slide) and 1 quiz (6 slides: cover, 3 question slides, an answers slide and a closing slide). That is Lead Pilot's mix without the lifestyle articles.
2. Candidate subjects come from industry news stories published in the last 30 days (on the 1st, "this month" would hold one day of stories, and the file also holds stories back to 2022), the two weeks of real questions that `src/data/realQuestions.json` keeps, and an evergreen list kept in `scripts/ready-to-share-sources.json`. Jev scores each candidate, and the script takes the top 14 with at most 3 per topic.
3. Facts come only from source text gathered in that run. A news subject uses the story's gist and link. An evergreen subject uses the readable text of the official pages listed for it in the sources file, read with a plain `fetch` (browser user agent, compressed response accepted), cut to 6,000 characters a page, at most 3 pages a subject. A page that fails to load or yields under 500 characters of text drops its subject for that month. These pages returned readable text to such a fetch on 20 Oct 2026 and seed the list: `https://www.cpf.gov.sg/member/retirement-income/monthly-payouts/cpf-life`, `https://www.cpf.gov.sg/member/healthcare-financing/medisave`, `https://www.cpf.gov.sg/member/growing-your-savings/earning-higher-returns/earning-attractive-interest`, `https://www.moh.gov.sg/managing-expenses/schemes-and-subsidies/medishield-life`, `https://www.iras.gov.sg/taxes/individual-income-tax/basics-of-individual-income-tax/tax-reliefs-rebates-and-deductions/tax-reliefs` and `https://www.mas.gov.sg/regulation/insurance`. The builder adds pages from moneysense.gov.sg, scamalert.sg and hdb.gov.sg the same way, checking each one.
4. The words are written by the Claude CLI, `claude -p --model sonnet`, on Leo's Max login, called with `execFileSync` as `scripts/gen-ideas.mjs` does. Unlike gen-ideas, this script passes `env` with `ANTHROPIC_API_KEY` removed, so the CLI cannot fall back to the paid API. The prompt passes only the source text and says: general education for anyone in Singapore, no insurer, bank or fund names, no product recommendations, no promised returns, every number taken from the sources, sentence case, no emoji, no em dashes.
5. Carousels come back as "Slide n: <title>" lines, each followed by one body line, so the carousel maker reads them as written: the cover has a title only, each title is 12 words or fewer, each body 40 words or fewer, and the closing slide's body contains "Save this" so `splitDraftIntoSlides` keeps it as the last slide. The script cannot import `splitDraftIntoSlides`, because `src/lib/carousel.ts` imports `@/` paths, so it checks the slide count, the word counts and the "Save this" line itself and drops a carousel that fails. A vitest case below proves the carousel maker reads that shape.
6. Each piece then goes through the checks below, and any failure drops it. If fewer than 8 pieces pass, or Jev returns nothing, the script writes nothing and exits non-zero, so the last good month stays up (the rule `scripts/trend-scout.mjs` uses).
7. The file keeps the last 6 months.

### Screens and states

```
/swipe?tab=ready
[Top posts] [News and questions] [Ads] [Ready to share]
Ready to share this month (i)
[All] [Posts 10] [Infographics 3] [Quizzes 1]
Topic: [All] [CPF and retirement] [Insurance] [Scams] ...
For:   [Everyone] [Young adults] [Working adults] [Parents] [Pre-retirees]
November 2026
+------------------------------------------+
| Infographic . CPF and retirement   Used  |
| <title>                                  |
| <first two lines>                        |
| For parents, pre-retirees . 2 sources    |
| [Use it]   Remix   Copy                  |
+------------------------------------------+
October 2026 ...
```

Opening a card (`?piece=<id>`) shows a drawer with the full caption, the slides drawn in the brand kit by the same `layoutSlide` and `renderSvg` (`src/lib/carouselLayout.ts`) that `/grid` uses for its previews, a "Facts and sources" list pairing each claim with its link, and check chips ("Sourced", "General advice only", "No product names") plus any amber warning chips from `scanCompliance`.

"Use it" is the main button, and it saves a new draft through `upsertDraft` built by `draftFromPiece(piece, positioning)`: hook = title, pillar "topic", pillarDetail = the topic name, audience = the first persona, platform = the Plan platform (else "instagram"), ctaType "save-share". It also adds the piece id to the used list. My posts keeps 50 drafts a brand (`MAX_DRAFTS`, oldest dropped), as it does for every other draft.

- A post gets draft = caption and format "text-post", then opens `/generate?draft=<id>`, where Write's usual checks run on it.
- An infographic or quiz gets format "carousel" and a draft text made only of the piece's "Slide n: <title>" lines, each followed by its body line. `splitDraftIntoSlides` reads those markers, so `/carousel?draft=<id>` opens the carousel maker on the slides in the brand kit. The caption stays out of the draft text, because `fromSlideMarkers` turns text before the first marker into the cover and adds text after the last marker to the last slide; the adviser copies the caption from the drawer. This is the path the maker's "topic" tab already takes, so the carousel page needs no new param.

"Remix" needs `RemixButton` from remix-everywhere and `src/lib/remixSource.ts` from remix-source-trail, neither of which exists yet. Once they ship, "Remix" is a second button beside "Use it": `<RemixButton source={resolveSource("ready:<piece id>", userId)}>{null}</RemixButton>`. That component's props are `source` and `children`; on Leo's sign-ins it draws its own outlined "Remix", and the tab is Leo-only, so the empty child never shows. This item adds the kind `ready:<piece id>` to `RemixSourceKind` and `resolveSource`, resolved from `src/data/readyToShare.json`, format `text` for a post and `carousel` for an infographic or quiz, so the adviser gets the piece in their own voice and any format. Until then the card shows "Use it" and "Copy". "Copy" builds the text the way Write's copy does, `withSignOff(toPlainText(caption), signOff)` from `src/lib/plainText.ts` with the brand kit's sign-off. Write keeps disclosures per post, so Copy adds none.

| State | What shows |
| --- | --- |
| No drop yet | The tab is hidden, the way the Ads tab hides until its first drop. The page reads the piece count from `readyToShareMeta.json`, so it never loads the full file to decide |
| Filters match nothing | "Nothing for these filters this month." and a "Clear filters" button |
| Used before | A "Used" chip on the card; the piece can still be used again |
| Use it on a post | Write opens on the new draft and a toast says "Saved to My posts" |
| Use it on an infographic or quiz | The carousel maker opens with the slides in the brand kit |
| Late drop | When no set for this month exists by the 5th: "This month's set is late. Showing <last month>." |
| Making, failed, refused, over the cap | Cannot happen on this tab, because nothing generates here; Remix keeps its own states |

### Copy

| Where | Text |
| --- | --- |
| Tab label | "Ready to share" |
| Heading | "Ready to share this month" |
| Heading InfoTip | "Written from official sources, then checked against MAS rules." |
| Kind chips | "All", "Posts", "Infographics", "Quizzes" |
| Persona label and chips | "For:", "Everyone", "Young adults", "Working adults", "Parents", "Pre-retirees" |
| Card buttons | "Use it", "Remix", "Copy" |
| Card chip | "Used" |
| Drawer sections | "Facts and sources", "Checks" |
| Check chips | "Sourced", "General advice only", "No product names" |
| Toast after Use it | "Saved to My posts" |
| Empty and late lines | as in the states table |

### Data

- `src/data/readyToShareMeta.json` is imported statically and holds `{ made, months: { month, posts, infographics, quizzes }[] }`, for the tab's count, the kind chip counts and the late-drop line.
- `src/data/readyToShare.json` is bundled and loaded with a dynamic import only when the tab opens, so `/swipe` does not grow. Its shape is `{ made, pieces: Piece[] }`, where a `Piece` is `{ id: "<yyyy-mm>-<slug>", month, kind: "post" | "infographic" | "quiz", title, topic, personas: PlanAudience[], caption, slides?: { title, body }[], facts: { claim, url }[], sources: { title, url }[], warnings: string[], checks: { sourced, general, neutral } }`.
- Topics use the 8 industry news topics as slugs, so a topic link means the same thing on both tabs. Personas use the Plan audiences from `src/lib/positioning.ts` (general, young-adult, working-adult, parent, pre-retiree).
- A synced key per brand, `content-studio-ready-used-<scoped(userId)>`, holds the ids the adviser used (at most 500, oldest dropped).
- `src/lib/readyToShare.ts` holds the filters, `byMonth`, `draftFromPiece(piece, positioning)` and the used list, all without a schema change.

### AI and cost

- The writer is the Claude CLI on Leo's Max plan, at no extra cost per run.
- Jev (`supabase/functions/_shared/jev.ts`, pinned `jev-1.13.0`, imported by the script the way `scripts/sg-feeds.mjs` does) answers these questions:
  - Subject pick (noul, per candidate): "Would clients of a financial adviser in Singapore want `subject` explained this month?" Keep 0.6 and above.
  - `sourced` (noul, per piece, with the source text in the state): "Is every number and every factual claim in `piece` stated in `sources`?" Keep 0.8 and above.
  - `general` (noul): "Is `piece` general education that suits anyone in Singapore, with no advice telling one person to buy, sell, switch or cancel anything?" Keep 0.8 and above.
  - `neutral` (noul): "Does `piece` avoid naming any insurer, bank, fund or financial product, and avoid promising a return?" Keep 0.8 and above.
  - Personas (one noul per Plan audience): "Would `audience` in Singapore find `piece` useful?" Tag at 0.6 and above, and tag `general` when none reaches it.
- `scanCompliance` from `src/lib/compliance.ts`, imported directly by the script, runs on every piece: any `error` flag drops it, and `warn` flags are stored in `warnings` and shown as amber chips.
- Every caption and slide text is piped to Leo's `aicheck -` (in `~/.local/bin`); exit 1, a score of 15 or more, drops the piece, as Leo's writing rules require for anything a reader sees.
- Each piece takes one `askJev` call that carries all its questions (sourced, general, neutral and the five personas) with the piece and its source text in the state.
- The thresholds are starting points, so Leo reads every piece of the first month and every dropped piece with its scores, and the lines move before the tab goes to anyone else.
- A month is about 80 candidates at 100 tokens plus 14 pieces at up to 5,000 tokens with their sources, roughly 80,000 tokens, which is under US$0.01 in Jev, and fetching the official pages costs nothing.
- No `usageCaps.ts` entry is needed, because nothing on the tab calls a paid service.

### Deep links

- `/swipe?tab=ready` is a new `tab` value, added to the `allowed` list of `useUrlState("tab", ...)` in `SwipeFilePage.tsx` only behind the gate and while `readyToShareMeta.json` counts pieces.
- On the ready tab, `kind` (post, infographic, quiz), `topic` (an industry news topic slug) and `audience` (a Plan audience) are filters that replace history, as in `/swipe?tab=ready&kind=quiz&topic=scams&audience=parent`.
- `piece=<id>` opens one piece and pushes history, with a Copy link button in the drawer, as in `/swipe?tab=ready&piece=2026-11-cpf-life-payouts`.
- "Use it" lands on the existing `/generate?draft=<id>` or `/carousel?draft=<id>`, so no new param is needed there.
- Add the rows to `docs/deep-links.md` and the params to `links.swipe` in `src/lib/links.ts`.

## Done when

- [ ] One manual run of `node scripts/ready-to-share.mjs --dry` prints 14 pieces with sources, checks and personas, and Leo has read them.
- [ ] A real run writes `src/data/readyToShare.json`, and a run with Jev unavailable writes nothing and exits non-zero.
- [ ] In the test fixture, a piece holding a number missing from its sources (Jev `sourced` answer 0.2) is dropped, and so is a carousel whose closing slide lacks "Save this".
- [ ] On Leo's sign-ins, `/swipe?tab=ready` shows the month grouped newest first, with the kind, topic and persona filters working through the URL.
- [ ] "Use it" on a post opens Write on a new draft carrying the caption; "Use it" on an infographic opens the carousel maker with its slides in the brand kit.
- [ ] The drawer lists every fact with a working source link.
- [ ] Other accounts see no Ready to share tab, and `?tab=ready` falls back to the default tab for them.
- [ ] The launchd job and the drop sub-command are installed, and the 1 November run commits a file.
- [ ] Checked by eye at 390 px and 1440 px.
- [ ] `npm run build` and `npx vitest run` pass, `docs/deep-links.md` is updated, and the item in `northStar.ts` is flipped with its `ours` line.

## Tests

- `scripts/ready-to-share.test.mjs`, using fixtures and no network (Jev through `askJev`'s `deps.fetch`, the CLI and `aicheck` passed in as functions), checks that subject picking keeps at most 3 per topic and 14 in total, that a story older than 30 days is not a candidate, that a piece with a compliance `error` is dropped, that a piece under any Jev threshold is dropped, that a caption `aicheck` fails is dropped, that a carousel with a 13-word title or no "Save this" closing line is dropped, that null Jev answers mean nothing is written, that fewer than 8 passing pieces exit non-zero without writing, that the CLI is called without `ANTHROPIC_API_KEY` in its env, and that the file keeps 6 months. Each case must fail when its rule is removed.
- `src/lib/readyToShare.test.ts` checks the kind, topic and persona filters, the month grouping, `draftFromPiece` (caption, pillar, pillarDetail, audience, platform, ctaType, format) and the used list cap. For a 6-slide quiz fixture, `splitDraftIntoSlides(draftFromPiece(piece, positioning).draft)` returns those 6 slides in order with the closing slide last. The same fixture with "Save this" removed returns 7 slides, because `DEFAULT_CTA` is appended, which is why the script enforces the line. This proves the carousel path without a page test.
- A `SwipeFilePage` render test proves the tab is hidden for a non-Leo email and while the file has no pieces.

## Open questions

- Licensed publisher articles, as Broadridge sells at USD 235/mo, need licences and money. That is Leo's call, and nothing here depends on it.
- Before the tab goes to everyone, should a team leader approve each month's set first? That decision belongs with trust-approved-library and trust-approval.
- Lead Pilot adds 10 lifestyle articles a month. Leo decides whether advisers want those.
- Could MoneyBees articles, Leo's own site, be a source for the monthly set? Leo decides.
- A branded landing page per shared piece (Lead Pilot's subscribe form) belongs to publish-link-in-bio.
- The page's rule is that compliance warns by default. This drop is stricter: any `error` flag drops a piece, because the pieces are our own writing published under every adviser's name. Leo can loosen it to warn-only.

## Related

trust-approved-library, trust-approval, trust-compliance-check, trust-disclosures, trust-team-push, find-news-questions, formats-carousel-designs, edit-carousel, remix-everywhere
