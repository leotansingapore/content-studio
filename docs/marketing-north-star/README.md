# App marketing north star (the hub): the builder's brief

`/marketing-north-star` is the short version: one card per piece of marketing work, rendered from `src/data/marketingNorthStar.ts`. This folder is the long version, written so a session or subagent can pick up any card and do it without asking Leo what he meant. It sits beside the Content Studio north star (`/north-star`, `docs/north-star/README.md`) and shares its gate. It is the hub: cards shared by every app live here, and each app's own cards live on that app's `/marketing-north-star` in its own repo (FINternship and MoneyBees in tiny-word-hive, ActivityTracker in remix-of-activity-tracker, SearchBlueprint in seo-audit-tool), as Leo set on 26 Oct. Postmosis's own page lives in this repo at `/marketing-north-star/postmosis` (`docs/marketing-north-star/postmosis/`), with postmosis.com's SEO plan at `/seo-north-star` (`docs/seo-north-star/`), as Leo set on 30 Oct. All three render with `src/components/NorthStarBook.tsx`.

Leo set it on 26 Oct 2026: "I really want to make this app marketing work". The plan behind it came from four videos he sent and an inventory of every app, channel and job we run.

## Where things live

| Path | What it holds |
| --- | --- |
| `items/<id>.md` | One spec per card, same id as the card (`/marketing-north-star#<id>`). |
| `leo.md` | Leo's messages, verbatim and dated. They win over any spec. |
| `~/Documents/App Growth Playbook/` on Leo's Mac | The plan (`03-strategy-and-workflow.md`), the inventory (`02-inventory.md`), the video notes (`01-video-notes.md`), the full transcripts, and `private-notes.md`. |

## Public by default

This repo is public on GitHub, and `marketingNorthStar.ts` ships in a public JS chunk. Amounts owed, account and Page ids, customer and trial counts, email addresses, project refs and compliance status never go in the data file or a spec. They live in `private-notes.md` on Leo's Mac, and a spec says "see private-notes.md (card <id>)". `src/data/marketingNorthStar.test.ts` fails if one of those shapes shows up.

## How to do a card

1. Read `items/<id>.md`, then the matching part of the playbook.
2. Most cards are not code in this repo. The work may be in another app's repo, a launchd job in `~/Library/LaunchAgents`, Meta Business Suite, Zernio or a Lark Base. Check "What we have today" against the real thing first, because specs go stale.
3. Stop and ask Leo before money, posting publicly, messaging anyone, a schema change or an auth change. Ask with AskUserQuestion, recommended option first.
4. Meet every line under "Done when".
5. Flip the card's `status` (todo, started, done) and its `ours` line in `src/data/marketingNorthStar.ts` in the same commit as the work, or in its own commit when the work lives elsewhere. Run `npx vitest run src/data/marketingNorthStar.test.ts`, then `git pull --rebase origin main` and push.

## Order

Phases run in order (phase numbers were renumbered on 26 Oct when the app-only cards moved to their own pages), and inside a phase the cards are listed by Jev's score on "would this bring more booked calls or paying customers within 60 days, or stop money being wasted" (26 Oct, jev-1.13.0), except where a dependency comes first: the affiliate debt before anything, and the shared loop before anything an app page builds on it. The page's "Next up" is the first card that is not done.

## Leo's standing rules for this work

- Jev makes the decisions (which post won, which comment shows intent, which creator fits); a language model only writes the words.
- No automated cold DMs, and nobody is followed up more than once.
- Real people before AI avatars in anything we pay to promote, and AI-made people are labelled.
- Every word a reader sees goes through the copy pipeline (brief, competitors, hook-check, aicheck) before it ships.
- Decisions that cost money or need a third party wait in `MK_DECISIONS` with a recommendation; record Leo's answer in its `decided` field.
