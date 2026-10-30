# postmosis.com SEO north star: the builder's brief

/seo-north-star is the short version: one card per piece of postmosis.com's SEO plan, rendered from src/data/seoNorthStar.ts, with live counts read in the browser from the site's sitemap.xml and llms.txt (src/data/seoNorthStarCounts.ts). This folder is the long version, written so a session can pick up any card and do it without asking Leo what he meant. The marketing plan for the same site is /marketing-north-star/postmosis (docs/marketing-north-star/postmosis/).

Leo asked for it on 30 Oct 2026 (leo.md). The cards come from a census of eight competitors' sitemaps walked that day: Buffer, Later, Taplio, Supergrow, Predis.ai, FeedHive, AuthoredUp and Typefully (research/census.md).

## Where things live

| Path | What it holds |
| --- | --- |
| src/data/seoNorthStar.ts | The cards (SEO_ITEMS), phases, asks, decisions, the left-out list, sources, SEO_TARGETS and seoBuildPrompt. |
| src/data/seoNorthStarCounts.ts | The live counts beside the cards. A read that fails shows "not counted", never 0. |
| src/pages/SeoNorthStarPage.tsx | The page. Leo's sign-ins only (useLeoUser); everyone else gets the not-found page, and the counts are read only after the gate. |
| src/components/NorthStarBook.tsx | The view this page shares with both marketing pages. |
| src/data/northStarBooks.test.ts, src/pages/NorthStarBookPages.test.tsx | Keep each spec in step with its card, keep private facts out, and test the gate and the counts. |
| items/<id>.md | One spec per card, same id as the card (/seo-north-star#<id>). |
| leo.md | Leo's messages, verbatim and dated. They win over any spec. |
| research/census.md and census.json | Counts per page type for each rival, the sitemaps walked, sample URLs. |
| research/jev-rank.txt | Jev's scores behind the card order inside each phase. |
| ~/postmosis-site | The site (Next.js). Read origin/main; pages come from src/content/*.ts through src/site/routes.ts. |
| ~/Documents/Postmosis | The vault: product-marketing.md (the brief), product-truth.md (what is claimable), keywords.csv, research/plan/plan.py, and the copy pipelines under copy/. |

## How to do a card

1. Open the card on /seo-north-star and paste its prompt into a new session. Read items/<id>.md and research/census.md, then check "What we have today" against origin/main in both repos, because specs go stale.
2. Stop and ask Leo before spending money (DataForSEO, Jev, any paid API), posting publicly, messaging anyone, a schema change or an auth change. State the cost first; DataForSEO prices are in ~/Documents/seo-audit-tool/src/lib/credit-prices.ts. Where a decision exists in SEO_DECISIONS, record his answer in its decided field.
3. Public words go through the vault's pipelines: the brief first, aicheck under 15, brief-check against ~/Documents/Postmosis/product-marketing.md, every platform fact quoted from that platform's own pages, and the site's tests (heavy npm run check).
4. Mark shipped pages in research/plan/plan.py's SHIPPED dict and rerun it; never edit Build plan items by hand. After a site deploy that adds pages, run ~/.local/bin/postmosis-indexnow-submit.sh.
5. Meet every line under "Done when", then flip the card's status and ours line in src/data/seoNorthStar.ts and the spec's Status line, run heavy npx vitest run src/data/northStarBooks.test.ts src/data/seoNorthStarCounts.test.ts, git pull --rebase origin main, and push.

## Rules

- Never rename an id. The spec's file name, the page anchor, the asks, the decisions and the counts all point at it.
- A card is done when its count reaches its target and its pages are live, not when the code merges (SEO_PRINCIPLES). A target that proves out of reach is lowered in SEO_TARGETS with the reason in its comment.
- Claim only what product-truth.md lists as on for every customer. Jev makes the decisions; a language model only writes the words.
- This repo is public and the data file ships in a public JS chunk. No email addresses, project refs, account or Stripe ids, UUIDs, long numeric ids, or counts of our own customers, trials or sign-ups; write a threshold in words ("once ten customers agree"). src/data/northStarBooks.test.ts fails on those shapes.
- Plain ASCII only, with no em or en dashes, in the data file and the specs.

## Where the live counts come from

readSeoMetrics() in src/data/seoNorthStarCounts.ts runs in Leo's browser each time the page opens, after the gate. It fetches postmosis.com/sitemap.xml and postmosis.com/llms.txt. Both answer with Access-Control-Allow-Origin: * (checked 30 Oct 2026), so the app needs no server or build step to read them.

- A section's count is the sitemap's pages one level under it, such as /guides/<slug>. The hub is left out.
- Tool pages per audience and network count /tools/<tool>/<variant>.
- Markdown copies count the distinct .md links in llms.txt, against every content page in the sitemap.
- Each total is a key in SEO_TARGETS, with a comment naming the competitor and the census.
- A read that fails, or that answers with something other than a sitemap or an llms.txt, shows "not counted", never 0. If the site ever drops that header, every count shows "not counted". The fix is a headers() entry for both files in the site's next.config.ts.

## How to add a count

1. Find a path pattern in the sitemap, or a line shape in llms.txt, that counts the card's real work.
2. Add one entry to seoMetrics() with item set to the card's id. Put its total in SEO_TARGETS with a comment naming the source and the date.
3. Return null when the file could not be read.
4. Add a case to src/data/seoNorthStarCounts.test.ts.
