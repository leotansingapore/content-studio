# Deep links

Every state of a page that someone would want to land on, send, or be sent to by a job lives in the URL.
Jobs outside the app (`~/.local/bin/team-posts`, the MoneyBees roundup, reports) build their links from this
table, absolute, on `https://consultant-content-studio.vercel.app`. When a job and the app disagree, this
doc is the contract. In the app, links are built in `src/lib/links.ts` and read with `src/lib/urlState.ts`.

Rules: the URL wins, then the remembered pick, then the default. Defaults are left out of links. Values are
words or real ids. An unknown or stale value is ignored and the page shows its default. Filters, views and
periods replace the history entry; opening an item pushes one, so Back closes it. Param names never change
once shipped; a renamed param keeps reading the old name.

**Every post has a link** (Leo 2026-10-20: "every single post should have a deep link too"). Each post shown
anywhere carries a Copy link button that copies the link below, and the link opens on that post:

| Post | Its link | Where the Copy link sits |
|---|---|---|
| Your post (draft, scheduled, posted) | /generate?draft=<id> (the editor); /calendar?post=<id> for its calendar panel | the editor, each My posts row, the calendar panel, each finished Library card |
| A carousel, slideshow or video project | the Library card's own page: /carousel?carousel=, /slideshow?s=, /edit?p= (video projects open on the device that made them) | each finished Library card, the carousel preview, the slideshow |
| A posts board post (reel, carousel) | /reels?card=<id> | every post in the Posts view and the post's panel |
| A team post (calendar review) | /calendar?business=team-posts&teampost=tp3 | the review panel |
| A channel post (Telegram feed) | /calendar?feed=<id> or /board?feed=<id> | the post panel |
| A team review submission | /team?post=<submission id> | every submission, for leaders and for its author |
| A top post (Swipe file, a creator's page) | /swipe?post=<advisorId>-<shortCode> | the post panel; a creator page's top posts open it |
| An industry news story | /swipe?tab=news&story=<id> | every story |
| An ad in the Ads swipe | /swipe?tab=ads&ad=<ad id> | every ad |
| A followed account's post | /following?post=<platform>:<post id> | every post |
| A competitor post in Your market | /market?post=<platform>:<post id> | every competitor post |
| A trend | /trends?trend=<id> | every trend |
| A trend drop (Hub) | /hub/trends?trend=<id> | every drop |
| An inspiration example | /inspiration/<id> | the example page |
| A picture (an AI picture, an upload, a stock photo) | /media?item=<key> | every picture in Media; an AI picture's Library card opens it |
| Your own social post in the account audit | /analytics?audit=<platform>:<post id> | each best post and each post that fell short |
| A competitor's ad (Leo only) | /competitors?ad=<ad id> | the ad drawer |
| A competitor's post (Leo only) | /competitors?view=posts&post=<platform>:<post id> | every post in Their posts |
| A saved post (Leo only) | /saved?item=<item key> | the item's drawer |

**Link previews.** A link pasted into Telegram, WhatsApp, Slack or LinkedIn shows a preview from api/page-og.ts
(vercel.json sends only those fetchers there; src/lib/linkPreview.ts decides the words). Public posts show their
own title, words and picture: news stories, ads, top posts, trends, inspiration examples and creators. Every
other link shows the name of its page on the site card (public/og/site.jpg), never what is on it, because those
pages sit behind a login. Telegram keeps the first preview it fetched for a link: re-share an old link with
`&s=1` on the end, or send it to @WebpageBot, to see the new card.

The first table covers the Pipeline pages; the Grow, Discover and settings pages and the Create pages have their
own sections below. Older params that still work are listed under "Still read".

**Brand, on every page:** `?profile=<profile id>` (`me` for the default brand, else `p` plus letters and digits)
opens that brand first, then the page. The page reloads once to switch and the param is removed once the brand is
open; a device that doesn't know the brand yet keeps the param until its list syncs. Copy link adds it to every
link it copies (docs/brand-isolation.md). Example: /calendar?view=upcoming&profile=pmg2k1x9ab.

**Remix, on every page (Leo's sign-ins only):** `?remix=<source key>` opens the Remix sheet over the page
(push; Back or the X closes it). Keys are the /generate?source= shapes under "Still read" (src/lib/remixSource.ts);
a key the device no longer holds opens the sheet's "no longer in the library" state. Every other sign-in has
remix= removed (replace). The sheet's choices replace the history entry and leave their defaults out:

| Param | Values | Default |
|---|---|---|
| keep | structure, hook, energy, topic, part2, react (only the ones that fit the source) | structure |
| about | a positioning topic as a slug, with keep=topic only | the first topic |
| close | loose, balanced, close | balanced |
| more | open: "More options" (How close) shown | closed |
| for | open: the For row's switches shown | closed |
| mention | no: leave the brand's name out of this remix | the brand's remembered pick, else yes |
| offer | an offer's name as a slug (Brand kit offers) | the brand's remembered pick, else none |
| as | a comma list of up to 3 formats: post, carousel, script, speaking, explainer (one video at most); repeats, a fourth or a second video are dropped | the source's own format: script for a video, carousel for a carousel, else post |
| breakdown | open: the Breakdown row under the source card shown (a breakdown is made only when it is opened or Remix is pressed) | closed |

Unknown values fall back silently. Example: /swipe?post=the-woke-salaryman-instagram-Ddkxv39j961&remix=top:the-woke-salaryman-instagram-Ddkxv39j961&keep=topic&about=cpf.
A finished format opens at /generate?draft=<id>, /carousel?draft=<id>, or, for You speaking and Explainer video,
/edit?panel=ai&kind=avatar and /edit?panel=ai&kind=explainer (the editor takes the finished video). The fit check
and the ask-first step are moments inside the sheet and never land in the URL.

| Page | Param | Values | Default | History | Example |
|---|---|---|---|---|---|
| /plan | view | plan, setup (the positioning form over a built plan) | plan; setup when there is no plan | replace | /plan?view=setup |
| /calendar | view | month, week, upcoming | remembered, else month | replace | /calendar?view=upcoming |
| /calendar | business | all, team-posts, or a business chip's label as a slug (leo, moneybees, finternship) | remembered (shared with /board), else all; team-posts when the link has teampost | replace | /calendar?business=team-posts |
| /calendar | platform | all, linkedin, instagram, facebook, tiktok, telegram | all | replace | /calendar?platform=instagram |
| /calendar | status | all, scheduled, posted | all | replace | /calendar?status=scheduled |
| /calendar | month | YYYY-MM, the month the month view shows | the current month, or the open item's month | replace | /calendar?month=2026-11 |
| /calendar | week | YYYY-MM-DD, the Monday of the week the week view shows | the current week, or the open item's week | replace | /calendar?view=week&week=2026-10-19 |
| /calendar | day | YYYY-MM-DD, opens that day's panel (month and week views) | none | push | /calendar?day=2026-10-20 |
| /calendar | teampost | a team post id (tp3), opens its review panel | none | push | /calendar?business=team-posts&teampost=tp3 |
| /calendar | post | a post (draft) id, opens its controls | none | push | /calendar?post=3f2a9c1e-5b7d-4e8a-9c0f-1a2b3c4d5e6f |
| /calendar | feed | a channel post id (the feed item id, URL-encoded), opens the whole post | none | push | /calendar?business=moneybees&feed=moneybees-telegram%3A2026-10-14%3Acpf-rates |
| /board | business | as /calendar | remembered (shared with /calendar), else all | replace | /board?business=moneybees |
| /board | feed | a channel post id (the feed item id, URL-encoded), opens the whole post | none | push | /board?feed=moneybees-telegram%3A2026-10-14%3Acpf-rates |
| /drafts | status | all, draft, scheduled, posted | all | replace | /drafts?status=scheduled |
| /drafts | platform | all, linkedin, instagram, facebook, tiktok | all | replace | /drafts?platform=linkedin |
| /drafts | pillar | all, interest, identity, topic, market | all | replace | /drafts?pillar=market |
| /drafts | label | all, none, or a label id | all | replace | /drafts?label=none |
| /drafts | q | search text (hook or body) | empty | replace | /drafts?q=cpf |
| /drafts | review | a post id, opens its Share for review panel and reviewer comments | none | push | /drafts?review=3f2a9c1e-5b7d-4e8a-9c0f-1a2b3c4d5e6f |
| /grid | (none) | the grid has no state of its own; tiles open /generate or /carousel | | | /grid |
| /reels | brand | a reels board brand id, or all | the open profile's brand | replace | /reels?brand=moneybees |
| /reels | view | feed (Posts: each post whole, caption and decision beside it), board, grid | remembered, else feed | replace | /reels?view=board |
| /reels | stage | review, changes, approved, scheduled, posted, archived, all, notes (the Posts view's stage chips; notes = open notes from someone else) | review; a card link without it shows the card's own stage | replace | /reels?stage=scheduled |
| /reels | archived | show, hide | hide | replace | /reels?archived=show |
| /reels | card | a reel card id, opens it; the Posts view also scrolls to it and marks it. A chat app that cuts the link at a `~` still opens it (the part before the `~` is matched), but put card last | none | push | /reels?card=c123 |
| /reels | t, slide | seconds into the video, or the carousel slide, with card | none | with card | /reels?card=c123&t=12 |
| /library | format | all, text, carousel, video, image. Leo's sign-ins only (src/lib/leoOnly.ts) | all | replace | /library?format=video |
| /library | status | all, ready, scheduled, posted, making, failed | all | replace | /library?status=ready |
| /library | q | search text over titles, post words, slide words and captions | empty | replace | /library?q=cpf |
| /library | panel | making: the Making now sheet below 1024 px (from 1024 px it is a column beside the grid) | closed | push | /library?panel=making |

A link to an item that has not loaded yet keeps its param and opens when the data arrives; a link to an
item that is gone opens the page without it and says so in one line ("That post is no longer here",
useGoneItem in src/lib/urlState.ts). An empty list that may still be syncing, a full list that may hold the item
further back, and a link still switching brand (?profile=) decide nothing. The calendar shows the month of an open item (a team post on
20 Nov opens November behind its panel) unless the link names a month or week.

## Grow, Discover and settings pages

Multi-selects are comma lists (`?pillar=authority,tip`). Labels become slugs: lowercase, every run of other
characters a hyphen (`Estate Planning` -> `estate-planning`, `Career / FA Life` -> `career-fa-life`), the same
`slug()` as ?business=. Values that come from data (topics, niches, trend types) are read against the data,
so one that is gone shows everything.

| Page | Param | Values | Default | History | Example |
|---|---|---|---|---|---|
| /inspiration | q | search text (hook, body, tags, topic) | empty | replace | /inspiration?q=cpf |
| /inspiration | pillar | authority, social, tip, hook, cta (comma list) | all | replace | /inspiration?pillar=authority,tip |
| /inspiration | platform | linkedin, instagram, facebook (comma list) | all | replace | /inspiration?platform=linkedin |
| /inspiration | format | carousel, short-video, text-only (comma list) | all | replace | /inspiration?format=carousel |
| /inspiration | audience | general, parent, pre-retiree, working-adult, young-adult (comma list) | all | replace | /inspiration?audience=parent |
| /inspiration | saved | only | off | replace | /inspiration?saved=only |
| /inspiration/:id | (path) | an example's id; has Copy link | | push | /inspiration/linkedin-cpf-myth-young-adult-001 |
| /profiles | q | search text (name, handle, company, niche) | empty | replace | /profiles?q=retirement |
| /profiles | company | aia, prudential, great-eastern, manulife, independent-fee-only, other, none (comma list) | all | replace | /profiles?company=aia,none |
| /profiles | platform | linkedin, instagram, facebook, tiktok, youtube (comma list) | all | replace | /profiles?platform=tiktok |
| /profiles | audience | an audience in the data: parent, working-adult, young-adult, pre-retiree, professional... (comma list) | all | replace | /profiles?audience=young-adult |
| /profiles | niche | insurance, investing, wealth-and-estate-planning, cpf-and-retirement, everyday-money, life-stages, career-and-business, growing-a-practice (comma list) | all | replace | /profiles?niche=cpf-and-retirement |
| /profiles | saved | only | off | replace | /profiles?saved=only |
| /profiles/:id | (path) | a creator's id; has Copy link. Each top post opens /swipe?post=<advisorId>-<shortCode> | | push | /profiles/the-astute-parent-youtube |
| /swipe | tab | posts, news, ads (ads only while there are ads) | posts | replace; switching tab clears the other params | /swipe?tab=news |
| /swipe | q | search text; on each tab its own list | empty | replace | /swipe?q=objection |
| /swipe | format | short-video, carousel, text-post | all | replace | /swipe?format=short-video |
| /swipe | from | advisor, influencer | all | replace | /swipe?from=advisor |
| /swipe | topic | posts tab: insurance, investment, cpf, retirement, estate-planning, money-habits, career-fa-life, personal-brand; news tab: a news topic's slug (healthcare-costs, scams...) | all | replace | /swipe?topic=cpf, /swipe?tab=news&topic=scams |
| /swipe | angle | storytelling, contrarian, educational, emotional, relatable, objection-handling, humour, authority | all | replace | /swipe?angle=contrarian |
| /swipe | audience | fresh-grads, young-adults, parents, families, hnw, business-owners, advisors-recruitment | all | replace | /swipe?audience=parents |
| /swipe | sort | for-you (only with a Playbook), engagement, viewed, liked, commented, newest, trending | for-you with a Playbook, else engagement | replace | /swipe?sort=newest |
| /swipe | saved | only | off | replace | /swipe?saved=only |
| /swipe | post | a top post's key, `<advisorId>-<shortCode>`; opens it, with Copy link | none | push (a similar post opened inside replaces) | /swipe?post=the-woke-salaryman-instagram-Ddkxv39j961 |
| /swipe | industry | ads tab: an industry's slug (insurance, banking, healthcare...) | all | replace | /swipe?tab=ads&industry=banking |
| /swipe | story | news tab: a story's id; shown even past the first 12, scrolled to and marked; Copy link on every story. A story no longer in the data is removed | none | set by links | /swipe?tab=news&story=ddb48f3587f1 |
| /swipe | ad | ads tab: an ad's Ad Library id; shown even past the first 12, scrolled to, marked and read in full; Copy link on every ad. An ad no longer in the data is removed | none | set by links | /swipe?tab=ads&ad=2095783381019179 |
| /following | post | `<platform>:<post id>` of a followed account's post; shown even past the account's first three, scrolled to and marked; Copy link on every post. Following lives per account, so the link opens for its owner | none | set by links | /following?post=instagram%3A3456789012345678901 |
| /market | post | `<platform>:<post id>` of a competitor post in the latest check; shown under either chip, scrolled to and marked; Copy link on it | none | set by links | /market?post=instagram%3A3456789012345678901 |
| /trends | platform | a platform in the drop (instagram, tiktok) | all | replace | /trends?platform=tiktok |
| /trends | type | a trend type in the drop (news, culture, meme...) | all | replace | /trends?type=news |
| /trends | trend | a trend id; opens its full kit and scrolls to it, Copy link on every card | none | push | /trends?trend=trend-2026-10-11-the-little-treat-trap-why-small-splurges-quietly |
| /market | show | act, all | act | replace | /market?show=all |
| /market | view | digest, setup (the set-up form over a finished set-up) | digest; setup when nothing is set up | replace | /market?view=setup |
| /north-star | q | search text over items (title, the three texts, Leo's call, id, and the names of the competitors they cite); Leo's sign-ins only (src/lib/leoOnly.ts) | empty | replace | /north-star?q=slideshow |
| /north-star | status, area, phase, ask, seen | status: live, partial, missing; area: an NS_AREA_ORDER id; phase: 1-8; ask: an NS_ASKS id; seen: a competitor id (src/data/northStarCompetitors.ts) | all | replace | /north-star?ask=remix-any-format&status=missing |
| /north-star | open | comma list of NS_AREA_ORDER ids whose cards show; any filter or a #card link opens its part too | none (parts closed) | replace | /north-star?open=remix,formats#spec |
| /north-star | cat, competitors | cat: a competitor category's slug (remix-and-ai-ugc, video-editing, social-suites, personal-brand-and-writing, inspiration-and-ad-intel, adviser-marketing); competitors: all shows every row, not the first 12 | all, first 12 | replace | /north-star?cat=adviser-marketing#competitors |
| /north-star | rec | the recording the scrubber shows: tour, review, settings (RECORDINGS in src/data/northStar.ts); switching clears at | tour | replace | /north-star?rec=review#recording |
| /north-star | frame, at | frame: a recording second, open full size, written t176 for the tour or review:t013 / settings:t003 for the others; at: the scrubber's second. Both snap to the next listed second (a few near-duplicate seconds are not frames), past the end to the last | none; t000 | frame push, at replace (written 300 ms after the last move) | /north-star?frame=t176 |
| /north-star | #id | an item id opens its part and scrolls to its card; also #asks, #areas, #build-order, #phase-1 to #phase-8, #spec, #recording, #competitors, #competitor-<id>, #dogfood, #decisions and each decision id, #how-we-build, #leave-out | top | | /north-star#remix-everywhere |
| /analytics | period | 7d, 30d, 90d, all | 30d | replace | /analytics?period=90d |
| /analytics | by | platform, pillar, format, hook-formula (engagement rate by) | platform | replace | /analytics?by=hook-formula |
| /analytics | time | linkedin, instagram, facebook, tiktok (best time to post for) | all platforms | replace | /analytics?time=linkedin |
| /analytics | audit | `<platform>:<post id>` of one of your own posts in the account audit: shown as "The linked post" at the top of that account's audit, scrolled to and marked; Copy link on each best post and each post that fell short | none | set by links | /analytics?audit=instagram%3A3456789012345678901 |
| /analytics | rank | engagements, engagement-rate, impressions, reactions, comments, shares, reach, comment-ratio (top posts by) | engagements | replace | /analytics?period=7d&rank=engagement-rate |
| /links | period | 7d, 30d (clicks shown for) | 30d | replace | /links?period=7d |
| /recruit/engage | tool | replies, dms, comments, connect, snippets | replies | replace | /recruit/engage?tool=dms |
| /recruit/auto-dm | log | an auto-DM id; opens Who got it, with Copy link | none | push | /recruit/auto-dm?log=a1b2c3 |
| /recruit/auto-dm | status | all, sent, skipped, failed (Who got it, with log) | all | replace | /recruit/auto-dm?log=a1b2c3&status=failed |
| /recruit/auto-dm | edit | an auto-DM id, or new; opens the editor | none; the form left open in this tab | push | /recruit/auto-dm?edit=new |
| /team | status | pending, approved, changes-requested, rejected (review queue, leaders) | pending | replace | /team?status=changes-requested |
| /team | from, to | YYYY-MM-DD, the audit trail's range (leaders) | the last 30 days | replace | /team?from=2026-09-01&to=2026-09-30 |
| /team | post | a submission id: leaders land on the review list that holds it, with the post shown in full; its author sees it marked in Your submissions; Copy link on every submission | none | set by links | /team?post=6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f |
| /hub/guides | category | editing, videography, trends, tips | all | replace | /hub/guides?category=editing |
| /hub/trends | niche | a niche's slug from the drops | all | replace | /hub/trends?niche=financial-advisors |
| /hub/trends | trend | a drop's id: scrolled to and marked, its Fresh angles open; Copy link on every drop | none | set by links | /hub/trends?trend=6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f |
| /hub/admin | tab | clients, posts, members | clients | replace | /hub/admin?tab=members |
| /fads/:tab | (path) | personality, purpose, experience, audience, solutions, messaging, output; anything else opens personality | personality | push (Next/Back steps) | /fads/audience |
| /recruit/:tab | (path) | /recruit (Brand Brain), /recruit/conversations, /recruit/agent | | | /recruit/conversations |
| /feedback | tab, post, status, category, entry | owned by the shared feedback board (components/feedback/FeedbackBoard.tsx, copied from leotansingapore/feedback-board, not edited here): tab=roadmap, feedback, changelog; post=<number>; with tab=feedback, status=under_review, planned, in_progress, complete, declined and category=<category>; entry=<changelog slug> | roadmap | replace | /feedback?tab=feedback&status=planned |
| /home, /bio, /accounts, /connect, /reels/team, /brands/new | (none) | nothing on these is a view or filter: forms, one editor per profile, settings, the board's invite links, the add-a-brand flow (/home's #what-moved is below) | | | /bio |
| /join, /review/:token, /l/:slug, /t/report/:slug, /roadmap | (path or #) | public pages that a link already fully names: /join#<invite token>, a preview, a bio page, a campaign report, the public roadmap | | | /join#abc123 |
| /swipe | tab | Leo only (src/lib/useLeoOnly.ts). foryou (For you), search (Search), hooks (Hooks); anyone else gets posts, and a Leo tab shows the page skeleton while the sign-in loads. Leo also gets ads whenever Competitors or Your space holds ads | posts | replace; switching tab clears every param below too | /swipe?tab=foryou |
| /swipe | kind | Leo only. foryou tab: organic, ads | both | replace | /swipe?tab=foryou&kind=ads |
| /swipe | hidden | Leo only. foryou tab: only (the cards you hid, each with Unhide) | off | replace | /swipe?tab=foryou&hidden=only |
| /swipe | q | Leo only. search tab: the search, filled in, with its saved results if any (searching again is a tap, since it is paid); foryou and hooks tabs: search text | empty | replace | /swipe?tab=search&q=cpf |
| /swipe | platform | Leo only. search tab: tiktok, youtube; ads tab (the library): facebook, instagram, messenger, threads | all | replace | /swipe?tab=search&q=cpf&platform=tiktok |
| /swipe | sort | Leo only. search tab: reach, views, engagement, newest; ads tab (the library): relevant, longest, newest | reach on search, relevant on ads | replace | /swipe?tab=search&q=cpf&sort=views |
| /swipe | posted | Leo only. search tab: 30d, 90d, any | 90d | replace | /swipe?tab=search&q=cpf&posted=30d |
| /swipe | scope | Leo only. ads tab: a competitor id, space (Your space), sg (the Singapore drop) | all | replace | /swipe?tab=ads&scope=space |
| /swipe | hook | Leo only. ads tab: problem, desire, curiosity, proof, audience, offer, instruction (HOOK_FAMILIES in supabase/functions/_shared/tags.ts) | all | replace | /swipe?tab=ads&hook=problem |
| /swipe | running | Leo only. ads tab: only (running now) | off | replace | /swipe?tab=ads&running=only |
| /swipe | run | Leo only. ads tab: 7, 30, 90 (running at least that many days) | any length | replace | /swipe?tab=ads&run=30 |
| /swipe | format | Leo only. ads tab (the library): image, video, carousel | all | replace | /swipe?tab=ads&format=video |
| /swipe | emotion | Leo only. ads tab: worry, hope, relief, pride, curiosity, urgency, trust, fun (FEELINGS in _shared/tags.ts) | all | replace | /swipe?tab=ads&emotion=worry |
| /swipe | audience | Leo only. ads tab (the library): the audience slugs above plus general (AUDIENCE_TAGS in _shared/tags.ts) | all | replace | /swipe?tab=ads&audience=general |
| /swipe | industry | Leo only. ads tab (the library): keeps working under scope=sg | all | replace | /swipe?tab=ads&scope=sg&industry=banking |
| /swipe | ad | Leo only. ads tab: opens the ad's drawer over the library, with Copy link; everyone else keeps the scroll-and-mark above | none | push | /swipe?tab=ads&ad=2095783381019179 |
| /swipe | why | Leo only. hooks tab: curiosity, fear-of-loss, social-proof, authority, contrast, identity, story (PSYCHOLOGY in _shared/tags.ts) | all | replace | /swipe?tab=hooks&why=curiosity |
| /swipe | formula | Leo only. hooks tab: a hook formula id (src/lib/hookFormulas.ts) | all | replace | /swipe?tab=hooks&formula=myth-bust |
| /trends | view | Leo only. search (what people search for), hashtags; anyone else keeps the kits | kits | replace | /trends?view=search |
| /trends | show | Leo only. search view: rising, gap | all | replace | /trends?view=search&show=rising |
| /trends | topic | Leo only. search view: a search topic's slug; opens its drawer, with Copy link | none | push | /trends?view=search&topic=cpf-life |
| /trends | tag | Leo only. hashtags view: a hashtag without the #; opens its drawer, with Copy link | none | push | /trends?view=hashtags&tag=moneytok |
| /profiles | sort | Leo only. for-you: ranked by fit with the brand's Plan positioning; ignored without one | the tier sections | replace | /profiles?sort=for-you |
| /profiles/:id | #works | Leo only. scrolls to "What works for them" once it is drawn | top | (anchor) | /profiles/the-astute-parent-youtube#works |
| /following | account, view | Leo only. account=<platform>:<handle> with view=patterns opens What worked for that followed account; a result already made opens with no call | none | push | /following?account=instagram%3Asleekflow&view=patterns |
| /home | #what-moved | Leo only. scrolls to the What moved card (Monday's email and phone alerts link here) | top | (anchor) | /home#what-moved |

## Still read

- /plan?competitor=<advisor id or handle>: adds that creator as a competitor for the next plan build and
  opens the setup form; the param is removed once read.
- /calendar#overdue (Home's Reschedule): scrolls to the overdue block.
- /generate and /carousel: see "Still read (Create pages)" below.

Grow, Discover and settings pages:

- /recruit/auto-dm?keyword=GUIDE (Write's "Auto-DM this keyword"): opens a new auto-DM with that keyword; the
  param is removed once read and becomes ?edit=new.
- /recruit#part-1, #part-2, #part-4 (the kit's part chips) scroll to that card; /analytics#recruit-numbers
  scrolls to the recruitment numbers.
- /accounts?connected=<platform> and ?error=: Zernio's return from connecting an account; read once, then removed.
- /team?code=<invite code>: the team invite link (teamReview.ts inviteLink); removed once the invite is handled.
- /brands/new?done=<profile id>: the add-a-brand flow's own reload once the brand is made; opens its ready screen.
- /diagnosis: sends you to /coach.
- /feedback#<entry id>: the feedback board's changelog anchor.

<!-- ==== Create pages (wave 2A) ==== -->
## Create pages

Write, Batch, Carousel, Video, Clone a reel, Coach, Media, Brand kit and the Learn guides. Same rules as above.
Two exceptions, both on purpose: the open post on /generate and the open carousel on /carousel replace
rather than push, because the editor is the page, not a panel over it (the address follows what is being
edited); and selecting a sticker or B-roll clip in the video editor replaces, so tapping through a list does
not fill Back. Sections of a reading page are `#anchors`, scrolled to once the page has drawn.

| Page | Param | Values | Default | History | Example |
|---|---|---|---|---|---|
| /generate | draft | a post id: that post open in Write; the address follows the post as it is saved | none | replace | /generate?draft=3f2a9c1e-5b7d-4e8a-9c0f-1a2b3c4d5e6f |
| /generate | step | topic, funnel, idea, format: the brief step shown | the tab's unfinished brief, else topic; format when the link pre-fills `detail` | replace | /generate?step=format |
| /generate | panel | shortcuts (keyboard shortcuts dialog), post (Post it for me, on a scheduled post) | none | push | /generate?panel=shortcuts |
| /generate/batch | pillar | topic, market, identity, interest | the tab's unfinished batch, else topic | replace | /generate/batch?pillar=market |
| /generate/batch | audience | general, young-adult, working-adult, parent, pre-retiree | the tab's unfinished batch, else general | replace | /generate/batch?audience=parent |
| /carousel | tab | drafts, paste, topic, saved (where the post comes from) | the tab's unfinished carousel, else drafts; drafts when there are no saved carousels | replace | /carousel?tab=topic |
| /carousel | draft | a post id: fresh slides from that post | none | replace | /carousel?draft=3f2a9c1e-5b7d-4e8a-9c0f-1a2b3c4d5e6f |
| /carousel | carousel | a saved carousel id (d:<post id> or p:<time>): reopens it with its edits; beats draft; the address takes it once an edit is kept | none | replace | /carousel?carousel=d%3A3f2a9c1e-5b7d-4e8a-9c0f-1a2b3c4d5e6f |
| /edit | p | a video project id. Projects live on one device: elsewhere the link opens the upload screen | none | push (opening a project drops the other /edit params) | /edit?p=vm1abc2 |
| /edit | tab | style, cuts, frame, face, stickers, broll, words, with p | style | replace | /edit?p=vm1abc2&tab=words |
| /edit | mode | fix, cut (the Words tab); key on Leo's sign-ins while key words are on (tap a line to change its key word) | fix | replace | /edit?p=vm1abc2&tab=words&mode=cut |
| /edit | sticker | a sticker id, selected (Stickers tab) | none | replace | /edit?p=vm1abc2&tab=stickers&sticker=o1 |
| /edit | broll | a B-roll clip id, selected (B-roll tab) | none | replace | /edit?p=vm1abc2&tab=broll&broll=b1 |
| /edit | guide | instagram, tiktok: that app's buttons drawn over the 9:16 preview | off | replace | /edit?p=vm1abc2&guide=instagram |
| /edit | panel | join, ai, or both (join,ai): the start screen's Join takes and Make a video without filming | none; ai while a video is being made | push | /edit?panel=ai |
| /edit | kind | template, montage, avatar, explainer, with panel=ai | the kind being made, else template | replace | /edit?panel=ai&kind=montage |
| /edit | template | a video template id, with panel=ai: opens its form | none | push | /edit?panel=ai&template=handheld-ugc-vlog |
| /edit | panel | wall: the start screen's Words over a video (Leo's sign-ins only; anyone else gets the plain start screen) | none | push | /edit?panel=wall |
| /edit | view | all, with p on a words-over-video project: every editing tab instead of its short panel (Leo only) | the short panel | replace | /edit?p=vm1abc2&view=all |
| /clone | clone | a saved clone id (instagram:<post id>, tiktok:<id>): shows that result | none; the result just made | push | /clone?clone=instagram%3AC8xYz12AbCd |
| /clone | source | a source read on Remix a post (link:<platform>:<id> or upload:<sha1>): shows that result from this device's list. Leo's sign-ins only; anyone else's /clone ignores it | none; the read just made | push | /clone?source=link%3Ainstagram%3AC8xYz12AbCd |
| /coach | report | a report id from Your progress, or the run just made | none | push | /coach?report=6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f |
| /coach | view | quiz: retake the diagnosis | quiz when there is no diagnosis yet | push | /coach?view=quiz |
| /media | q | search text (names, folders, alt text) | empty | replace | /media?q=family |
| /media | folder | a folder name, or none (photos with no folder) | all | replace | /media?folder=none |
| /media | item | a picture's key: scrolled to and marked; Copy link on every picture. the picture list lives on the device that added it, so the link opens there; anywhere else it says "That picture is not on this device" | none | set by links | /media?item=cimg-mh2k9x01ab |
| /academy | lesson | a lesson's YouTube id: opens and plays it | none | push | /academy?lesson=0Q1AQAxpdGg |
| /brand | #section | you, dm-links, offers, emoji-and-hashtags, colour, sign-off, posting-times, logo | top | (anchor) | /brand#logo |
| /create-guide | #step | idea, draft, carousel, reel, reverse-engineer, compliance, schedule | top | (anchor) | /create-guide#reel |
| /tutorial | #section | why, voice, guided-flow, after, tabs, rules, rhythm, first-action | top | (anchor) | /tutorial#tabs |
| /voice | (none) | the past posts are typed text, kept for this tab until Save; Leo's sections and learnings are under "Faces, voices and brand" below | | | /voice |
| /playbook | (none) | a summary page with no state of its own | | | /playbook |
| /slideshow | s | a slideshow id: that slideshow in the editor; an unknown id shows the start card. Leo's sign-ins only (src/lib/leoOnly.ts) | none (the start card) | push | /slideshow?s=ssmh2k9x01ab |
| /slideshow | slide | the open slide, 1-based, with s; out of range reads as 1 | 1 | replace | /slideshow?s=ssmh2k9x01ab&slide=4 |
| /slideshow | panel | text, overlay: the editor's Text or Overlay tab, with s | slide (the Slide tab) | replace | /slideshow?s=ssmh2k9x01ab&panel=text |
| /slideshow | box | a text box id on the open slide: that box picked; one not on the slide is ignored | none | replace | /slideshow?s=ssmh2k9x01ab&slide=2&panel=text&box=bmh2k9x02cd |
| /generate | compare | original, more: on a remixed post (Leo's sign-ins only), phones open the compare strip's Original or More like this tab and large screens scroll to that part; a draft with no source ignores it | your version | replace | /generate?draft=3f2a9c1e-5b7d-4e8a-9c0f-1a2b3c4d5e6f&compare=original |
| /carousel | compare | original, more: the same strip above the slides of a remixed post, with draft or carousel=d:<post id> | your version | replace | /carousel?carousel=d%3A3f2a9c1e-5b7d-4e8a-9c0f-1a2b3c4d5e6f&compare=more |
| /slideshow | view | original: a remixed slideshow's Original tab (the source's snapshot) in place of the slide, with s; a slideshow with no source shows its slides | the slides | replace | /slideshow?s=ssmh2k9x01ab&view=original |
| /make/slideshow | source | a remix source key (the same keys as /generate?source= below): the slideshow to remix. Leo's sign-ins only (src/lib/leoOnly.ts); anyone else, and any /make/<slug> not in src/data/formats.ts, gets the not-found page. A key that no longer resolves says so and starts from a topic | none | replace | /make/slideshow?source=top%3Agrace-koh-instagram-C931K |
| /make/slideshow | from | topic, remix (Start from) | remix with a source, else topic | replace | /make/slideshow?from=remix |
| /make/slideshow | mention | no: the slides leave the brand out | yes | replace | /make/slideshow?from=topic&mention=no |
| /make/slideshow | size | 9x16 | 4x5 | replace | /make/slideshow?size=9x16 |
| /make/slideshow | pictures | mine: the brand's own Media photos instead of Pexels stock | stock | replace | /make/slideshow?pictures=mine |
| /make/slideshow | tab | original: the source's snapshot in place of the result | your result | replace | /make/slideshow?source=top%3Agrace-koh-instagram-C931K&tab=original |
| /make/slideshow | pick | open: the list of slideshows that did well, to pick one to remix | closed | replace | /make/slideshow?from=remix&pick=open |
| /make/slideshow | show | a made slideshow's id: shows it as the result (the page sets it when its run finishes) | the run in progress or just made | push | /make/slideshow?show=ssmh2k9x01ab |
| /make/slideshow | slide | the result's slide, 1-based; out of range reads as 1 | 1 | replace | /make/slideshow?show=ssmh2k9x01ab&slide=3 |
| /make/wall-of-text | source | a remix source key (the same keys as /generate?source= below): the post to remix. Leo's sign-ins only (src/lib/leoOnly.ts). A key that no longer resolves says so and asks for another | none | replace | /make/wall-of-text?source=trend%3Atrend-2026-10-20-trend-9 |
| /make/wall-of-text | from | topic, remix (Start from) | remix with a source, else topic | replace | /make/wall-of-text?from=topic |
| /make/wall-of-text | mention | no: the words leave the brand out | yes | replace | /make/wall-of-text?from=topic&mention=no |
| /make/wall-of-text | bg | stock, mine (Background: Stock clip or My video; the video itself stays on the device and is picked again on each visit) | this device's last pick (cs-make-wall-bg), stock on a Remix sheet link | replace | /make/wall-of-text?bg=mine |
| /make/wall-of-text | pick | open: the list of videos that did well (trend kits, swipe file videos, followed accounts' videos), to pick one to remix | closed | replace | /make/wall-of-text?from=remix&pick=open |

Copy link: the open post in Write, the carousel preview, a clone result, each Academy lesson and the open slideshow
(and every post elsewhere, see "Every post has a link" at the top).

### Still read (Create pages)

Pre-fills read once on arrival, then removed from the address (except day, time, profile and vibe, which stay):

- /generate?pillar= (interest, identity, topic, market), detail= (the topic text, opens the format step),
  audience=, format= (text-post, carousel, short-video, story), platform= (linkedin, instagram, facebook,
  tiktok), cta= (dm-keyword, comment-keyword, save-share, book-call, open-question), funnel= (a funnel stage
  id), idea= (the idea source: real-question, common-mistake, news-hook, personal-story, before-after,
  three-things, myth-bust; not the idea text), ctx= (context text), ref= (a competitor handle), formula=
  (a hook formula id): Plan, Coach, Carousel and the assistant pre-fill the brief this way.
- /generate?aud=<audience id> and label=<label id> (Leo only): a saved audience and a label, read once with the
  other pre-fills (aud starts the pre-fill on its own); see "Plans and campaigns" below.
- /generate?vibe=<inspiration id>: loads that example as the style reference.
- /generate?draft=<id>&ask=<words>: opens the post and starts that rewrite (ask is removed once read).
- /generate?draft=<id>&profile=<profile id>: a phone alert for another profile's post switches to it first.
- /generate?day=YYYY-MM-DD (and &time=HH:MM for an open posting slot): the calendar's "Write a post for this
  day"; the suggested time lands on that day, at that time when given.
- /generate?source=<key>: the post, ad or trend a remix link came from (src/lib/remixSource.ts), shown as the
  "Remixing ..." chip and saved with the draft. Leo's sign-ins only (north-star gate); every other sign-in
  ignores it. Read once with the other pre-fills, then removed. Keys: top:<advisor id>-<short code> (Swipe
  file, profiles, Creator lookup), follow:<platform>:<post id> (Following, and Your market, whose post ids are
  already <platform>:<post id>; on Leo's sign-ins also Competitors' posts), ad:<ad id> (Ads swipe; on Leo's
  sign-ins also Competitors' ads and Your space), audit:<platform>:<post id> (Account audit; resolves
  only on the device that pressed Remix), trend:<trend id> (Trends), insp:<id>, hubtrend:<id>, clone:<platform>:<post id>,
  own:<draft id>, link:<platform>:<id>, upload:<sha1>, pattern:<platform>:<handle>:<n> (an idea from What worked,
  Leo only; resolves only on the device that pressed Remix) and format:<id> (a trending format from the weekly drop,
  Leo only; it opens /make/slideshow or /make/wall-of-text and starts nothing). A key that doesn't resolve opens Write without a source.
- /clone?url=<reel link>: fills the link box (a Clone button elsewhere); cloning stays a tap, since each
  clone uses one of the day's. On Leo's sign-ins it fills the Remix a post box, which takes any link
  parseRemixLink accepts (supabase/functions/remix-link/logic.ts); reading stays a tap, since it is paid.
- /coach#idea-dump (the board's empty column) scrolls to the idea dump.
- /make/slideshow: the Remix sheet's Also make link starts making on arrival through navigation state { go: true } (a ?go=1 in the address does nothing, so an outside link can never start a paid make); the state is cleared once read. The Remix sheet's "Also make: Slideshow" link sends it (links.makeFormat), adding mention=no when the
  sheet's Mention is off. Each arrival is one make, so it uses one of the day's remixes.
- /make/wall-of-text: the same rule as /make/slideshow, from the Remix sheet's "Also make: Wall of text" link. Once the
  words and the clip are ready the page opens /edit (push), which shows "Putting your wall of text together" and opens
  the new project (/edit?p=<id>) when the video is done.
<!-- ==== end Create pages ==== -->

## Competitors and Saved (Leo only)

North star phase 2 (docs/north-star/items/find-competitors.md, find-competitor-ads.md, find-competitor-posts.md,
find-ad-detail.md, find-save-anywhere.md, find-ai-tagging.md). Both pages are Leo's sign-ins only
(src/lib/useLeoOnly.ts): the nav hides them and anyone else gets the not-found page. Same rules as above.

| Page | Param | Values | Default | History | Example |
|---|---|---|---|---|---|
| /competitors | view | Leo only. ads (Their ads), posts (Their posts), list (Who you watch) | ads once a competitor exists, else list | replace | /competitors?view=posts |
| /competitors | edit | Leo only. with view=list: a competitor id, its editor open, with Copy link | none | push | /competitors?view=list&edit=c-lq3k9z |
| /competitors | c | Leo only. ads and posts views: a competitor id, its pill | all | replace | /competitors?c=c-lq3k9z |
| /competitors | running | Leo only. ads view: only (running now) | off | replace | /competitors?running=only |
| /competitors | platform | Leo only. posts view: instagram, tiktok | all | replace | /competitors?view=posts&platform=tiktok |
| /competitors | sort | Leo only. posts view: views, newest | the outlier order | replace | /competitors?view=posts&sort=newest |
| /competitors | post | Leo only. posts view: <platform>:<post id>, shown even past the first page, scrolled to and marked, with Copy link on each card; an unknown id is dropped with a line | none | push | /competitors?view=posts&post=instagram%3AC9xYz |
| /competitors | ad | Leo only. ads view: an ad's Library id; opens its drawer, with Copy link (/competitors?view=ads&ad= opens the same) | none | push | /competitors?ad=2095783381019179 |
| /saved | board | Leo only. a board id, or unsorted | all | replace | /saved?board=b-lq3k9z |
| /saved | platform | Leo only. instagram, tiktok, youtube, ad, link | all | replace | /saved?platform=tiktok |
| /saved | q | Leo only. search text | empty | replace | /saved?q=cpf |
| /saved | hook, angle, topic, emotion, audience, format | Leo only. the items' tags: hook a hook formula id (src/lib/hookFormulas.ts); angle and topic the /swipe slugs; emotion and audience the FEELINGS and AUDIENCE_TAGS ids (_shared/tags.ts); format reel, carousel, picture, video, text, link. They combine with board, platform and q | all | replace | /saved?hook=myth-bust |
| /saved | item | Leo only. an item's key (the remix source key shapes: link:<platform>:<id>, ad:<id>, top:..., follow:..., trend:...): opens it, with Copy link; an unknown key is dropped quietly | none | push | /saved?item=link%3Atiktok%3A7412345678901234567 |
| /saved | #breakdown | Leo only. with item: scrolls to the item's Breakdown | top | (anchor) | /saved?item=link%3Atiktok%3A7412345678901234567#breakdown |

Still read: /saved?url=<link> (with text= and title=, from a share sheet or a pasted link) saves that link once,
then the params are removed (replace).

## Formats (Leo only)

North star phase 3 (docs/north-star/items/formats-gallery.md and the format specs it links). Every row below is
Leo's sign-ins only (src/lib/useLeoOnly.ts): the nav hides the pages, anyone else gets the not-found page on /make
and /image, and the new params on /edit, /generate, /carousel and /trends are ignored for anyone else, who keeps
today's page. Same rules as above: built in src/lib/links.ts, defaults left out of links.

Every /make/<slug> page takes the shared params source, from and mention=no (as /make/slideshow above). A format
in src/data/formats.ts that is not ready yet still opens for Leo at /make/<slug>; the gallery lists ready ones
only. The Remix sheet's "Also make" link starts a make on arrival through navigation state { go: true } only for a
format under US$1 (src/data/formats.ts alsoMakeList); a dearer one opens its page and waits for the press.

| Page | Param | Values | Default | History | Example |
|---|---|---|---|---|---|
| /make | kind | Leo only. video, slides, text, image | all | replace | /make?kind=video |
| /make | needs | Leo only. none: only the formats that need nothing extra | off | replace | /make?kind=video&needs=none |
| /make/notification-stack | bg | Leo only. mine (Background: My video; the video stays on the device and is picked again on each visit). The typed worries, closing word and label are kept on the device in cs-make-notify | stock | replace | /make/notification-stack?bg=mine |
| /make/text-over-clip | scene | Leo only. kitchen, walk, interview | kitchen | replace | /make/text-over-clip?scene=walk |
| /make/text-over-clip | quality | Leo only. 480p, 720p | 480p | replace | /make/text-over-clip?quality=720p |
| /make/talking-head | who | Leo only. presenter (a new AI presenter), mine (your saved face), or a saved presenter's id; a typed photo falls back to the default | the brand's "Who appears" | replace | /make/talking-head?who=mine |
| /make/talking-head | setting | Leo only. office, car, kitchen, couch, cafe | office | replace | /make/talking-head?who=presenter&setting=car |
| /make/talking-head | length | Leo only. 8, 15, 20, 30 (seconds) | 15 | replace | /make/talking-head?length=30 |
| /make/talking-head | voice | Leo only. alice, lily, george, eric, matilda, sarah, liam (the voices in supabase/functions/text-voice/logic.ts) | alice (as You speaking) | replace | /make/talking-head?voice=george |
| /make/green-screen | who | Leo only. mine (your video), presenter (an AI presenter) | mine | replace | /make/green-screen?who=presenter |
| /make/green-screen | behind | Leo only. notes, demo, picture | notes | replace | /make/green-screen?behind=demo |
| /make/green-screen | stand | Leo only. bottom, corner | bottom | replace | /make/green-screen?stand=corner |
| /make/green-screen | setting | Leo only. with who=presenter: office, car, kitchen, couch, cafe (as /make/talking-head) | office | replace | /make/green-screen?who=presenter&setting=car |
| /make/green-screen | length | Leo only. with who=presenter: 8, 15, 20, 30 (seconds) | 15 | replace | /make/green-screen?who=presenter&length=30 |
| /make/green-screen | voice | Leo only. with who=presenter: the text-voice keys, as /make/talking-head | alice | replace | /make/green-screen?who=presenter&voice=george |
| /make/hook-demo | play | Leo only. stock (words on a stock clip), spoken (someone says it), mine (you say it) | stock | replace | /make/hook-demo?play=spoken |
| /make/hook-demo | topic | Leo only. what the demo shows: fills the topic once, then removed (replace). The demo itself is a file on the device and never in a link | none | replace | /make/hook-demo?topic=log+every+client+call |
| /image | layout | Leo only. headline, quote, stat, testimonial; memes top-bottom, nobody-me, expectation, pov, post-reaction | headline | replace | /image?layout=stat |
| /image | size | Leo only. 4x5, 1x1, 9x16, wide | 4x5 | replace | /image?layout=stat&size=1x1 |
| /image | source | Leo only. a remix source key (ad:<id>, own:<draft id>, and the other /generate?source= shapes): fills the words once, then removed | none | replace | /image?source=ad%3A2095783381019179 |
| /image | image | Leo only. a saved design's id: opens it; the address takes it once an edit is kept | none | replace | /image?image=img-mh2k9x01ab |
| /image | pick | Leo only. media, make, stock: opens the picture picker (your media, Make one, or free stock); what a swipe ad's picture shows is kept on the device in cs-image-shows-2 (newest 30), so a second write never reads it again, and a meme's last options in cs-meme-options (newest 20 designs) | none | replace | /image?pick=media |
| /edit | panel | Leo only. own (Your own video or pictures), clips (Long video into clips), one at a time | none | push | /edit?panel=own |
| /edit | about | Leo only. with panel=own or clips: what it is about, filled once | none | replace | /edit?panel=clips&about=cpf |
| /edit | len | Leo only. with panel=clips: short, long | auto | replace | /edit?panel=clips&about=cpf&len=short |
| /edit | yt | Leo only. with panel=clips: a YouTube link, filled into the link field | none | replace | /edit?panel=clips&yt=https%3A%2F%2Fyoutu.be%2FdQw4w9WgXcQ |
| /edit | #clips | Leo only. with p on a long video: scrolls to its clip list | top | (anchor) | /edit?p=vm1abc2#clips |
| /edit | talk | Leo only. with kind=avatar: plain, news (News anchor), stage (Stage talk), spokesperson | the brand's last pick on this device, else plain | replace | /edit?panel=ai&kind=avatar&talk=news |
| /edit | offer | Leo only. a brand kit offer's place, 0 to 4: Spokesperson's offer, or with template=ugc-creator-review fills "Your product" once, then removed | none | replace | /edit?panel=ai&template=ugc-creator-review&offer=0 |
| /edit | look | Leo only. with kind=explainer: photo, clay, paper, felt, chalk, comic, cartoon3d, storybook | photo | replace | /edit?panel=ai&kind=explainer&look=clay |
| /edit | from | Leo only. with kind=explainer: topic, script, link, draft (where the narrated video starts) | topic | replace | /edit?panel=ai&kind=explainer&from=link |
| /edit | topic | Leo only. with kind=explainer: the topic, filled once | none | replace | /edit?panel=ai&kind=explainer&topic=cpf+top-ups |
| /edit | link | Leo only. with kind=explainer: an article link, filled once | none | replace | /edit?panel=ai&kind=explainer&from=link&link=https%3A%2F%2Fexample.com%2Fa |
| /edit | draft | Leo only. with panel=ai: a post id whose script or words fill the kind's form; kept while the panel is open | none | replace | /edit?panel=ai&kind=avatar&draft=3f2a9c1e-5b7d-4e8a-9c0f-1a2b3c4d5e6f |
| /edit | secs | Leo only. with kind=explainer: 30, 60 (the narrated video's length) | 30 | replace | /edit?panel=ai&kind=explainer&secs=60 |
| /edit | visuals | Leo only. with kind=explainer: stock, ai | stock | replace | /edit?panel=ai&kind=explainer&visuals=ai |
| /generate | panel | Leo only. thread: the thread panel over that post (with draft) | none | push | /generate?draft=3f2a9c1e-5b7d-4e8a-9c0f-1a2b3c4d5e6f&panel=thread |
| /generate | network | Leo only. with panel=thread: threads, x | threads | replace | /generate?draft=3f2a9c1e-5b7d-4e8a-9c0f-1a2b3c4d5e6f&panel=thread&network=x |
| /generate | view | Leo only. prompter: the teleprompter over a short-video draft (with draft) | none | push | /generate?draft=3f2a9c1e-5b7d-4e8a-9c0f-1a2b3c4d5e6f&view=prompter |
| /generate | hooks | Leo only. proven: the hook card on "Proven in your niche" | formulas | replace | /generate?hooks=proven |
| /carousel | design | Leo only. clean, bold, numbered, checklist, post-card, photo-cover, quote, notebook | clean | replace | /carousel?design=numbered |
| /carousel | size | Leo only. 4x5, 1x1, 9x16 | 4x5 | replace | /carousel?design=numbered&size=1x1 |
| /carousel | view | Leo only. one (one slide at a time), all (the list) | one on phones, all on large screens | replace | /carousel?carousel=d%3A3f2a9c1e-5b7d-4e8a-9c0f-1a2b3c4d5e6f&view=one |
| /carousel | slide | Leo only. with view=one: the open slide, 1-based; out of range reads as 1 | 1 | replace | /carousel?carousel=d%3A3f2a9c1e-5b7d-4e8a-9c0f-1a2b3c4d5e6f&view=one&slide=3 |
| /trends | view | Leo only. formats: trending slideshow and wall-of-text formats (with kits, search and hashtags above) | kits | replace | /trends?view=formats |
| /trends | kind | Leo only. with view=formats: slideshow, wall-of-text | all | replace | /trends?view=formats&kind=slideshow |
| /trends | template | Leo only. with view=formats: a format trend's id; opens its card and scrolls to it. An unknown id is dropped quietly | none | push | /trends?view=formats&template=tiktok-7412345678901234567 |

Closing /edit's AI panel drops talk, offer, look, from, topic, link, draft, secs and visuals with kind and template.
The made video opens at /edit?p=<project id> as today.

## Faces, voices and brand (Leo only)

North star phase 4 (docs/north-star/items/people-my-face.md, people-presenters.md, people-dub-lipsync.md,
brand-from-website.md, brand-products.md, brand-demo-videos.md, brand-media-library.md, brand-media-sets.md,
brand-voice-memory.md, brand-kit.md, edit-snippets.md, edit-translate.md). Every row below is Leo's sign-ins only
(src/lib/useLeoOnly.ts): the nav hides /people and anyone else gets the not-found page there, and the new params,
sections and anchors on /edit, /media, /brand, /voice and /generate are ignored for anyone else, who keeps today's
page. Same rules as above: built in src/lib/links.ts, defaults left out of links.

| Page | Param | Values | Default | History | Example |
|---|---|---|---|---|---|
| /people | tab | Leo only. face (your face), presenters (your AI presenters) | face | replace | /people?tab=presenters |
| /people | record | Leo only. 1: the face recorder open | closed | push | /people?record=1 |
| /people | presenter | Leo only. with tab=presenters: a saved presenter's id, its card open | none | push | /people?tab=presenters&presenter=pr-lq3k9z |
| /people | make | Leo only. 1 with tab=presenters: the New presenter sheet open | closed | push | /people?tab=presenters&make=1 |
| /edit | face | Leo only. with panel=ai: mine (your saved face), presenter (a new AI presenter) or a saved presenter's id; preselects who speaks | the brand's "Who appears", else none | replace | /edit?panel=ai&kind=avatar&face=mine |
| /edit | voice | Leo only. with kind=avatar: mine (your own recording) or a premade voice (alice, lily, george, eric, matilda, sarah, liam) | alice | replace | /edit?panel=ai&kind=avatar&voice=mine |
| /edit | product | Leo only. with kind=template: a saved product's id; its first picture fills the template's product slot once, then the param is removed | none | replace | /edit?panel=ai&kind=template&template=ugc-creator-review&product=pd-lq3k9z |
| /edit | set | Leo only. with kind=explainer or montage: a media set's name, preselected for the pictures or clips | stock | replace | /edit?panel=ai&kind=explainer&set=Work+and+career |
| /edit | script | Leo only. 1 with p on an AI video of your face or a presenter: its Script card open | closed | push | /edit?p=vm1abc2&script=1 |
| /edit | lang | Leo only. with script=1: zh, ms, ta, that language's version open for review | none | replace | /edit?p=vm1abc2&script=1&lang=zh |
| /media | view | Leo only. sets: the sets view; ?folder=<set name> opens one set, as today | the library | replace | /media?view=sets |
| /media | starters | Leo only. 1: the starter sets sheet over the sets view (8 sets of free Pexels photos and clips) | closed | replace | /media?view=sets&starters=1 |
| /media | kind | Leo only. photos, videos | all | replace | /media?kind=videos |
| /media | type | Leo only. person, logo, product, past-post, screen, footage, other | any | replace | /media?kind=photos&type=logo |
| /brand | #section | Leo only, beside today's sections: website, products, demo-videos, people, font, on-every-post, language | top | (anchor) | /brand#products |
| /brand | website | Leo only. review: this device's waiting website read; with nothing waiting the section shows and the param is dropped (replace) | none | push | /brand?website=review#website |
| /brand | products | Leo only. review: this device's waiting products scan; with nothing waiting the section shows and the param is dropped (replace) | none | push | /brand?products=review#products |
| /brand | product | Leo only. a saved product's id, its editor open; new opens a blank one | none | push | /brand?product=new#products |
| /brand | demo | Leo only. a saved demo's key, that demo open; closing replaces | none | push | /brand?demo=cvid-mh2k9x01ab#demo-videos |
| /brand | preview | Leo only. end: the brand preview shows the video end card instead of a slide | slide | replace | /brand?preview=end |
| /voice | #section | Leo only. how-you-sound, facts, learned | top | (anchor) | /voice#facts |
| /voice | learning | Leo only. a learning's id, that learning open | none | push | /voice?learning=l-lq3k9z#learned |
| /generate | panel | Leo only. insert: the Insert panel over that post (with draft) | none | push | /generate?draft=3f2a9c1e-5b7d-4e8a-9c0f-1a2b3c4d5e6f&panel=insert |
| /generate | kind | Leo only. with panel=insert: hashtags, ending, hook, post (the panel's tab) | line | replace | /generate?draft=3f2a9c1e-5b7d-4e8a-9c0f-1a2b3c4d5e6f&panel=insert&kind=hashtags |
| /generate | lang | Leo only. zh, ms, ta: this make's language, read once like the other pre-fills, then removed | the brand's post language, else English | replace | /generate?lang=zh |
| /generate, /carousel | meaning | Leo only. 1: the English meaning shown beside a Chinese, Malay or Tamil version (a carousel's meaning lives on the device that made it) | hidden | push | /generate?draft=<id>&meaning=1 |

Closing /edit's AI panel drops face, voice, product and set with the other AI panel params. A version made in
another language is a draft or a carousel like any other: /generate?draft=<version id>, /carousel?carousel=<version id>.

## Plans and campaigns (Leo only)

North star phase 5 (docs/north-star/items/brand-audiences.md, plan-goal.md, plan-campaign.md, plan-angles.md,
plan-campaign-page.md, plan-review-queue.md, plan-autopilot.md, plan-content-plan.md, plan-interview.md,
plan-ideas-inbox.md). Every row below is Leo's sign-ins only (src/lib/useLeoOnly.ts): the nav hides /audiences,
/campaigns and /ideas and anyone else gets the not-found page there (and at /campaigns/new and /campaigns/<id>),
and the new params and anchors on /home, /plan, /coach, /generate and /generate/batch are ignored for anyone else,
who keeps today's page. Same rules as above: built in src/lib/links.ts, defaults left out of links.

| Page | Param | Values | Default | History | Example |
|---|---|---|---|---|---|
| /audiences | open | Leo only. a saved audience's id, its editor open; an unknown id shows the list | none | push | /audiences?open=au-lq3k9z |
| /generate | aud | Leo only. a saved audience's id: preselected, read once like the other pre-fills (it starts the pre-fill on its own), then removed; wins over audience=; an unknown or removed id falls back to the life stages | the life stages | replace | /generate?aud=au-lq3k9z |
| /generate | label | Leo only. a label's id: the draft saved from this brief wears that label; read once, then removed | none | replace | /generate?pillar=topic&detail=CPF&format=carousel&label=lb-1 |
| /generate/batch | aud | Leo only. a saved audience's id; stays in the address and wins over audience=; an unknown or removed id is dropped | the life stages | replace | /generate/batch?aud=au-lq3k9z |
| /home | goal | Leo only. change: the goal editor open under the greeting; closing removes it | closed | replace | /home?goal=change |
| /campaigns | goal | Leo only. change: the goal editor open under the H1; closing removes it | closed | replace | /campaigns?goal=change |
| /campaigns/new | step | Leo only. who, angles, where, pace, review: the wizard's open step | the first unfinished step | replace | /campaigns/new?step=angles |
| /campaigns/new | audience | Leo only. an audience id: step 1 answered, the wizard opens on step 2; read once, then kept with the wizard's typed work | none | replace | /campaigns/new?audience=au-lq3k9z |
| /campaigns/<id> | (path) | Leo only. a campaign's id: the campaign page, with Copy link beside the H1 | | push | /campaigns/c-lq3k9z |
| /campaigns/<id> | post | Leo only. a post's number, 1-based: that post shown in the queue; out of range shows the first post not yet made | the first post not yet made | replace | /campaigns/c-lq3k9z?post=4 |
| /campaigns/<id> | view | Leo only. grid: the queue as cards; a card opens one at a time on that post | one at a time | replace | /campaigns/c-lq3k9z?view=grid |
| /campaigns/<id> | angle | Leo only. an angle's id: the queue filtered to it and its chip outlined; an unknown id shows every angle | every angle | replace | /campaigns/c-lq3k9z?angle=ang-2 |
| /campaigns/<id> | #queue | Leo only. scrolls to the review queue | top | (anchor) | /campaigns/c-lq3k9z?post=4#queue |
| /plan | #section | Leo only. autopilot, pillars | top | (anchor) | /plan#autopilot |
| /plan | autopilot | Leo only. settings: autopilot's settings dialog | closed | push | /plan?autopilot=settings |
| /plan | week | Leo only. a Monday, YYYY-MM-DD: that week's autopilot batch in the card; a week with no batch shows the newest | the newest batch | replace | /plan?week=2026-10-27#autopilot |
| /plan | pillars | Leo only. edit: the Edit pillars panel | closed | push | /plan?pillars=edit |
| /coach | piece | Leo only. questions, voice, paste: the long piece's switch, scrolled into view; anyone else has paste only | questions | replace | /coach?piece=voice |
| /coach | #long-piece | Leo only. scrolls to One long piece, five posts | top | (anchor) | /coach#long-piece |
| /ideas | tab | Leo only. inbox, shortlist, discarded | inbox | replace | /ideas?tab=shortlist |
| /ideas | source | Leo only. all, today, dump, posts, market, foryou, trends, news, saved | all | replace | /ideas?source=foryou |
| /ideas | label | Leo only. a label's id: only ideas with that label | all | replace | /ideas?label=lb-1 |
| /ideas | idea | Leo only. an idea's key, URL-encoded (<source>:<id>, gen:<day>:<n> for a written one): that idea open, with Copy link; a key that is gone shows the list | none | push | /ideas?idea=gen%3A2026-10-22%3A3 |

A campaign post's own link is /campaigns/<id>?post=<n>. Once made it is a post like any other: /generate?draft=cmp_<id>_<n>
(an autopilot post is ap_<week>_<n>), and /carousel?draft=<id> for a carousel. Paid steps never start from a link:
a paid start on arrival rides navigation state only, as on /make.
