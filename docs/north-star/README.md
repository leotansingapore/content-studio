# North star: the builder's spec

`/north-star` is the short version: one card per feature, rendered from `src/data/northStar.ts`. This folder is the long version. It is written so a session or subagent can pick up any item and build it without asking Leo again what he meant.

Leo set the north star on 2026-10-19: "the idea is that one can remix any content format and the ai will regenerate." A user finds a proven post, ad or trend, presses Remix, and gets back a finished post in their own brand, voice and face, in any format, ready to approve and schedule. Fastlane (app.usefastlane.ai), which Leo screen-recorded on his own account that day, is the reference product.

## What is in this folder

| Path | What it holds |
| --- | --- |
| `items/<id>.md` | One spec per item in `NS_ITEMS`, same id as the card (`/north-star#<id>`). |
| `videos/fastlane-2026-10-19/` | Leo's 5 min 49 s Fastlane recording, described in `notes-1.md` to `notes-4.md`: every screen, label, price and flow, verbatim, second by second. The frames are `public/north-star/fastlane/tSSS.webp` at the repo root (the screen at second SSS; t125 = 2:05), shared with the page's viewer. |
| `research/fastlane-pdf/` | Leo's FireShot captures of Fastlane's Home (`013-Home-1.webp`) and Studio > Library (`lib-tile-00` to `05`, top to bottom). |
| `research/competitors/` | 126 competitors and 1,374 sourced features in six categories (remix and AI UGC, video editing, social suites, personal brand, inspiration and ad intel, adviser marketing). Each category comes as JSON for code and Markdown to read, and every feature carries its source URL. |
| `research/current-app.md` | What Content Studio already does, route by route, with files, edge functions and caps, read from origin/main 08537d1 on 2026-10-19. |
| `research/BRIEF.md` | The brief the research agents worked from. |

## How to build an item

1. Read `items/<id>.md` top to bottom, then open the frames it links. Look at the frames; do not build from the words alone.
2. Check "What we have today" against the code. The spec was true when written; code moves. `git log` first, since other sessions push to this repo all day.
3. Work in your own worktree (`~/worktrees.noindex/ns-<id>`), never in the shared checkout.
4. Build behind the gate (below). Small commits, one logical change each, messages like `feat: remix any post into a slideshow`.
5. Meet every line under "Done when", then flip the item in `src/data/northStar.ts` (its `status` and its `ours` line) in the same commit, and tick the spec's status line.
6. When a spec and the code disagree, the code is the truth for what exists and the spec is the truth for what to build. When the spec does not settle a question, write it into "Open questions" and pick the option that keeps the page simpler and the change reversible.

## The gate

- North-star work goes to Leo's accounts only until he says otherwise: `leoOnly(email)` from `src/lib/leoOnly.ts` (tanjunsing@gmail.com and leotanjs95@gmail.com). Hide the entry point (nav `owners`, a button) AND guard the page or action, because a typed URL skips the nav.
- Turning anything on for everyone is Leo's call, in his words ("on for everyone"). Never infer it.
- Hard stops that still go to Leo before you build: a database schema change, money (new paid providers, Stripe, plans, credits that charge anyone), auth changes, new npm dependencies, and facts only he has.

## Leo's standing rules for this repo

- Decisions (classify, detect, score, rank, route, pick one) go through Jev, `supabase/functions/_shared/jev.ts`, pinned `jev-1.13.0`, and every caller works when Jev returns null; the LLM only writes the words.
- Every paid call takes a daily cap in `supabase/functions/_shared/usageCaps.ts` and refunds on failure; global caps protect prepaid pools (Higgsfield, ElevenLabs).
- Remix copies the structure of a post and writes new words. Prompts forbid promised returns, named insurer products and invented numbers (MAS). Advisers' posts must be safe to publish in Singapore.
- Everything lives in the URL: every view, tab, filter and open item (`docs/deep-links.md`, `src/lib/urlState.ts`, builders in `src/lib/links.ts`).
- Synced data uses `content-studio-` keys per brand via `scoped(userId)`; device hints use `cs-` keys. No tombstones: never make a deletion the only record of a security state.
- Long jobs run outside React so leaving the page does not lose them.
- Copy: short, plain, ASCII, sentence case, no em dashes, no emoji. One purpose and one main button per screen; feedback within 400 ms; a real finished state.
- Check by eye at 390 px and 1440 px before and after a push. `npm run build` and the full `npx vitest run` before pushing.
- `git pull --rebase origin main` right before `git push origin main`; the push is the deploy (never `vercel --prod`). Verify the live bundle contains your change.

## Where things live

- North star: `src/data/northStar.ts` (items, asks, decisions, phases), `src/data/northStarCompetitors.ts` (the competitor index), page `src/pages/NorthStarPage.tsx`, test `src/data/northStar.test.ts`.
- Remix today: `src/lib/topPosts.ts` (buildRemixUrl), `src/lib/following.ts` (remixUrl), `src/lib/adsSwipe.ts`, `src/lib/reelClone.ts` + `src/pages/CloneReelPage.tsx` + `supabase/functions/clone-reel`, `src/lib/trends.ts`. All of them end in Write (`/generate`) as a text brief.
- Making things: Write `src/pages/GeneratePage.tsx`, carousels `src/pages/CarouselPage.tsx` + `src/lib/carousel*.ts`, video `src/pages/VideoEditPage.tsx` + `src/lib/videoEdit.ts`, AI video and avatars `src/components/AiVideo.tsx` + `supabase/functions/ai-video`, images `supabase/functions/ai-image`, voice `supabase/functions/text-voice`.
- Finding things: `/swipe` `src/pages/SwipeFilePage.tsx`, `/following` `src/pages/FollowingPage.tsx` + `supabase/functions/track-accounts`, `/trends`, `/market`.
- Posting: `src/pages/CalendarPage.tsx`, `src/components/PostItForMe.tsx`, `supabase/functions/social` (Zernio, `docs/zernio-connection.md`).
- Nav: `src/lib/nav.ts` SECTIONS, with `src/lib/nav.test.ts` and `src/lib/navRoutes.test.ts`.

## The spec format

Every `items/<id>.md` follows this shape. Keep each section concrete; leave a section out only when it truly has nothing to say.

```
# <title>

`<id>` | <area> | phase <n> | status: live | partial | missing | /north-star#<id>

## Leo asked
His words with their date, or "No direct ask; from the competitor research."

## How the best do it
Fastlane first when it has the feature: step by step, labels and prices verbatim, with frames inline as
![Fastlane 2:56](../../../public/north-star/fastlane/t176.webp). Then each other competitor that does
it well, with its numbers and a source link.

## What we have today
Files, functions, edge functions, caps and gates, checked against the code.

## Build
### Screens and states    one block per state, a small text wireframe where it helps
### Copy                  the exact strings
### Data                  what is stored where (a schema change stops for Leo)
### AI and cost           models, Jev questions, caps, provider cost per run
### Deep links            the URL for every view and open item

## Done when
A checklist someone else can verify.

## Tests
What to write and what each one proves.

## Open questions
What is not decided, and who decides.

## Related
Other item ids.
```
