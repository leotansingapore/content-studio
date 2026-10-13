# Deep links

Every state of a page that someone would want to land on, send, or be sent to by a job lives in the URL.
Jobs outside the app (`~/.local/bin/team-posts`, the MoneyBees roundup, reports) build their links from this
table, absolute, on `https://consultant-content-studio.vercel.app`. When a job and the app disagree, this
doc is the contract. In the app, links are built in `src/lib/links.ts` and read with `src/lib/urlState.ts`.

Rules: the URL wins, then the remembered pick, then the default. Defaults are left out of links. Values are
words or real ids. An unknown or stale value is ignored and the page shows its default. Filters, views and
periods replace the history entry; opening an item pushes one, so Back closes it. Param names never change
once shipped; a renamed param keeps reading the old name.

The first table covers the Pipeline pages; the Grow, Discover and settings pages and the Create pages have their
own sections below. Older params that still work are listed under "Still read".

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
| /reels | view | board, grid | remembered, else board on wide screens, grid on phones | replace | /reels?view=grid |
| /reels | archived | show, hide | hide | replace | /reels?archived=show |
| /reels | card | a reel card id, opens it | none | push | /reels?card=c123 |
| /reels | t, slide | seconds into the video, or the carousel slide, with card | none | with card | /reels?card=c123&t=12 |

A link to an item that has not loaded yet keeps its param and opens when the data arrives; a link to an
item that is gone opens the page without it. The calendar shows the month of an open item (a team post on
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
| /profiles/:id | (path) | a creator's id; has Copy link | | push | /profiles/the-astute-parent-youtube |
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
| /trends | platform | a platform in the drop (instagram, tiktok) | all | replace | /trends?platform=tiktok |
| /trends | type | a trend type in the drop (news, culture, meme...) | all | replace | /trends?type=news |
| /trends | trend | a trend id; opens its full kit and scrolls to it, Copy link on every card | none | push | /trends?trend=trend-2026-10-11-the-little-treat-trap-why-small-splurges-quietly |
| /analytics | period | 7d, 30d, 90d, all | 30d | replace | /analytics?period=90d |
| /analytics | by | platform, pillar, format, hook-formula (engagement rate by) | platform | replace | /analytics?by=hook-formula |
| /analytics | time | linkedin, instagram, facebook, tiktok (best time to post for) | all platforms | replace | /analytics?time=linkedin |
| /analytics | rank | engagements, engagement-rate, impressions, reactions, comments, shares, reach, comment-ratio (top posts by) | engagements | replace | /analytics?period=7d&rank=engagement-rate |
| /links | period | 7d, 30d (clicks shown for) | 30d | replace | /links?period=7d |
| /recruit/engage | tool | replies, dms, comments, connect, snippets | replies | replace | /recruit/engage?tool=dms |
| /recruit/auto-dm | log | an auto-DM id; opens Who got it, with Copy link | none | push | /recruit/auto-dm?log=a1b2c3 |
| /recruit/auto-dm | status | all, sent, skipped, failed (Who got it, with log) | all | replace | /recruit/auto-dm?log=a1b2c3&status=failed |
| /recruit/auto-dm | edit | an auto-DM id, or new; opens the editor | none; the form left open in this tab | push | /recruit/auto-dm?edit=new |
| /team | status | pending, approved, changes-requested, rejected (review queue, leaders) | pending | replace | /team?status=changes-requested |
| /team | from, to | YYYY-MM-DD, the audit trail's range (leaders) | the last 30 days | replace | /team?from=2026-09-01&to=2026-09-30 |
| /hub/guides | category | editing, videography, trends, tips | all | replace | /hub/guides?category=editing |
| /hub/trends | niche | a niche's slug from the drops | all | replace | /hub/trends?niche=financial-advisors |
| /hub/admin | tab | clients, posts, members | clients | replace | /hub/admin?tab=members |
| /fads/:tab | (path) | personality, purpose, experience, audience, solutions, messaging, output; anything else opens personality | personality | push (Next/Back steps) | /fads/audience |
| /recruit/:tab | (path) | /recruit (Brand Brain), /recruit/conversations, /recruit/agent | | | /recruit/conversations |
| /feedback | tab, post, status, category, entry | owned by the shared feedback board (components/feedback/FeedbackBoard.tsx, copied from leotansingapore/feedback-board, not edited here): tab=roadmap, feedback, changelog; post=<number>; with tab=feedback, status=under_review, planned, in_progress, complete, declined and category=<category>; entry=<changelog slug> | roadmap | replace | /feedback?tab=feedback&status=planned |
| /home, /bio, /accounts, /connect, /following | (none) | nothing on these is a view or filter: forms, one editor per profile, settings | | | /bio |

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
| /edit | mode | fix, cut (the Words tab) | fix | replace | /edit?p=vm1abc2&tab=words&mode=cut |
| /edit | sticker | a sticker id, selected (Stickers tab) | none | replace | /edit?p=vm1abc2&tab=stickers&sticker=o1 |
| /edit | broll | a B-roll clip id, selected (B-roll tab) | none | replace | /edit?p=vm1abc2&tab=broll&broll=b1 |
| /edit | guide | instagram, tiktok: that app's buttons drawn over the 9:16 preview | off | replace | /edit?p=vm1abc2&guide=instagram |
| /edit | panel | join, ai, or both (join,ai): the start screen's Join takes and Make a video without filming | none; ai while a video is being made | push | /edit?panel=ai |
| /edit | kind | template, montage, avatar, explainer, with panel=ai | the kind being made, else template | replace | /edit?panel=ai&kind=montage |
| /edit | template | a video template id, with panel=ai: opens its form | none | push | /edit?panel=ai&template=handheld-ugc-vlog |
| /clone | clone | a saved clone id (instagram:<post id>, tiktok:<id>): shows that result | none; the result just made | push | /clone?clone=instagram%3AC8xYz12AbCd |
| /coach | report | a report id from Your progress, or the run just made | none | push | /coach?report=6f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f |
| /coach | view | quiz: retake the diagnosis | quiz when there is no diagnosis yet | push | /coach?view=quiz |
| /media | q | search text (names, folders, alt text) | empty | replace | /media?q=family |
| /media | folder | a folder name, or none (photos with no folder) | all | replace | /media?folder=none |
| /academy | lesson | a lesson's YouTube id: opens and plays it | none | push | /academy?lesson=0Q1AQAxpdGg |
| /brand | #section | you, dm-links, offers, emoji-and-hashtags, colour, sign-off, posting-times, logo | top | (anchor) | /brand#logo |
| /create-guide | #step | idea, draft, carousel, reel, reverse-engineer, compliance, schedule | top | (anchor) | /create-guide#reel |
| /tutorial | #section | why, voice, guided-flow, after, tabs, rules, rhythm, first-action | top | (anchor) | /tutorial#tabs |
| /voice | (none) | the past posts are typed text, kept for this tab until Save | | | /voice |
| /playbook | (none) | a summary page with no state of its own | | | /playbook |

Copy link: the open post in Write, the carousel preview, a clone result and each Academy lesson.

### Still read (Create pages)

Pre-fills read once on arrival, then removed from the address (except day, time, profile and vibe, which stay):

- /generate?pillar= (interest, identity, topic, market), detail= (the topic text, opens the format step),
  audience=, format= (text-post, carousel, short-video, story), platform= (linkedin, instagram, facebook,
  tiktok), cta= (dm-keyword, comment-keyword, save-share, book-call, open-question), funnel= (a funnel stage
  id), idea= (the idea source: real-question, common-mistake, news-hook, personal-story, before-after,
  three-things, myth-bust; not the idea text), ctx= (context text), ref= (a competitor handle), formula=
  (a hook formula id): Plan, Coach, Carousel and the assistant pre-fill the brief this way.
- /generate?vibe=<inspiration id>: loads that example as the style reference.
- /generate?draft=<id>&ask=<words>: opens the post and starts that rewrite (ask is removed once read).
- /generate?draft=<id>&profile=<profile id>: a phone alert for another profile's post switches to it first.
- /generate?day=YYYY-MM-DD (and &time=HH:MM for an open posting slot): the calendar's "Write a post for this
  day"; the suggested time lands on that day, at that time when given.
- /clone?url=<reel link>: fills the link box (a Clone button elsewhere); cloning stays a tap, since each
  clone uses one of the day's.
- /coach#idea-dump (the board's empty column) scrolls to the idea dump.
<!-- ==== end Create pages ==== -->
