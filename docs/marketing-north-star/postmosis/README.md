# postmosis.com marketing north star: the builder's brief

`/marketing-north-star/postmosis` is the short version: one card per piece of marketing work for postmosis.com, rendered from `src/data/postmosisMarketingNorthStar.ts`. This folder is the long version, written so a session can pick up any card and do it without asking Leo what he meant. The shared cards (Leo on camera, the Monday read-back, creator links) stay on the hub at `/marketing-north-star`, and a card here names the hub card it shares work with. The SEO plan is `/seo-north-star` (`docs/seo-north-star/`).

Leo asked for it on 30 Oct 2026: "include it for https://postmosis.com/ also, same. marketing and seo north-star" (`leo.md`).

## Where things live

| Path | What it holds |
| --- | --- |
| `src/data/postmosisMarketingNorthStar.ts` | The cards (PM_ITEMS), phases, asks, decisions, the left-out list, sources and pmBuildPrompt. |
| `src/pages/PostmosisMarketingNorthStarPage.tsx` | The page. Leo's sign-ins only (useLeoUser); everyone else gets the not-found page. It uses the view in `src/components/NorthStarBook.tsx`, shared with the hub and /seo-north-star. |
| `items/<id>.md` | One spec per card, same id as the card (`/marketing-north-star/postmosis#<id>`). |
| `leo.md` | Leo's messages and standing calls, verbatim and dated. They win over any spec. |
| `research/teardown.md` | How Taplio, Buffer, Later, Predis.ai, FeedHive, Supergrow, AuthoredUp and Typefully get customers, read 30 Oct 2026, every fact linked. |
| `research/jev-rank.txt` | Jev's scores behind the card order inside each phase. |
| `~/postmosis-site` | The marketing site (Next.js). `BOOK_WALKTHROUGH` is in `src/site/config.ts`. |
| `~/Documents/Postmosis` | The vault: `product-marketing.md` (the brief) and `product-truth.md` (what is claimable for every customer). |

## Public by default

This repo is public and the data file ships in a public JS chunk. Customer names, counts of customers, trials or sign-ups, email addresses, account and project ids and money owed never go in the data file or a spec; they stay in the vault on Leo's Mac. `src/data/northStarBooks.test.ts` fails on those shapes. Write a threshold in words ("once ten customers agree").

## How to do a card

1. Read `items/<id>.md`, then the teardown section it cites. Check "What we have today" against the real thing first, because specs go stale.
2. Most cards are not code in this repo. The work may be in the site, Pick a Time, the vault or Leo's accounts.
3. Stop and ask Leo before spending money, signing up for a third party, posting publicly, messaging anyone, or an auth, billing or schema change. Where a decision exists in `PM_DECISIONS`, name it and record his answer in its `decided` field.
4. Public words go through the vault's copy pipeline: the brief first, aicheck under 15, brief-check, and Leo reads the copy .md before money-page copy (home, features hub, plans, audience pages, about) goes into code.
5. Meet every line under "Done when", then flip the card's `status` and `ours` line in the data file and the spec's Status line, run `heavy npx vitest run src/data/northStarBooks.test.ts`, `git pull --rebase origin main` and push.

## Standing rules

- One way in for now: Book a walkthrough, and Leo runs every one.
- Claim only what `product-truth.md` lists as on for every customer.
- Real faces before AI faces. No automated cold DMs, and nobody is chased more than once.
- Every booking carries where it came from, so a card is judged on walkthroughs booked.
- Jev makes the decisions; a language model writes the words.
