# Deep links

Every state of a page that someone would want to land on, send, or be sent to by a job lives in the URL.
Jobs outside the app (`~/.local/bin/team-posts`, the MoneyBees roundup, reports) build their links from this
table, absolute, on `https://consultant-content-studio.vercel.app`. When a job and the app disagree, this
doc is the contract. In the app, links are built in `src/lib/links.ts` and read with `src/lib/urlState.ts`.

Rules: the URL wins, then the remembered pick, then the default. Defaults are left out of links. Values are
words or real ids. An unknown or stale value is ignored and the page shows its default. Filters, views and
periods replace the history entry; opening an item pushes one, so Back closes it. Param names never change
once shipped; a renamed param keeps reading the old name.

Wave 1 covers the Pipeline pages. Other pages still read only the params listed under "Still read".

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

## Still read

- /plan?competitor=<advisor id or handle>: adds that creator as a competitor for the next plan build and
  opens the setup form; the param is removed once read.
- /calendar#overdue (Home's Reschedule): scrolls to the overdue block.
- /generate?day=YYYY-MM-DD (the calendar's "Write a post for this day"), /generate?draft=<id>,
  /carousel?draft=<id>: Write's own params, not converted yet.
