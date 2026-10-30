# Every page links to its siblings and to the feature it sells

Status: started
App Postmosis (postmosis.com), owner Claude, phase 1 (Indexed and measured).

## Why

Google finds and weighs pages through links, and a page nothing links to leans on the sitemap alone. Two rivals leave whole sets without a hub. AuthoredUp's 10 alternatives pages have none, and its /tools page links 8 of them. Taplio's 15 glossary pages have none either, since /glossary answers 404 (census.md and census.json, 30 Oct 2026).

For a domain that went live on 29 Oct 2026, our own links are most of what Google has. 15 vault pages were still unknown to Google on 30 Oct (pm-seo-indexed).

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272) and all 113 live pages, counting links inside <main> only, so the header and footer menus are left out.

- Each section has a test for links out to siblings. Guides and vault pages link 2 to 4 live siblings under their hub (tests/guides.test.ts). Templates, comparisons, feature pages and audience pages link 2 to 4 (templates.test.ts, compare.test.ts, features.test.ts, audiences.test.ts). Tools link 2 or 3 (tools.test.ts). Glossary terms link related terms and tools that are live (glossary.test.ts).
- Feature pages link back to every audience page, tool and template that points at them (site commit e51e97d, guarded in features.test.ts), and guides link only to live pages.
- Every hub links all its pages, so every page has at least one link in.
- Links in, counted on the live pages: 109 of 113 have 2 or more. /plans has 0 inside <main> (the header links it) and /terms has 1. /vault/funnel-hacking and /vault/tiktok-slideshow-ideas have 1 each, from the vault hub only. Every glossary term has 4 or more.
- No test counts links into a page. The sibling tests count links out, so a new page can link to 4 siblings while only its hub links back.

## What to do

1. Add tests/inlinks.test.ts in the site. Build the link graph from the built HTML (tests/built.ts reads it), counting each <a href> inside <main>, for every indexable route in src/site/routes.ts.
2. Fail any indexable page with fewer than 2 other pages linking in, hubs counted. Allow /plans and the legal pages, which the header and footer carry, with that reason in the test.
3. Run it before any fix and check it fails on /vault/funnel-hacking and /vault/tiktok-slideshow-ideas, so it is known to bite.
4. Fix those two in the vault pipeline: add a sibling link to each from vault pages that link fewer than 4 siblings today, in their copy/_vault/scripts/pages_b*.py batch, then run to_ts.py into src/content/vault.ts. Keep every page inside the 2 to 4 sibling rule.
5. Run check.py on the changed pages (aicheck under 15, brief-check), then heavy npm run check in the site, and push to main.
6. Recount on the live pages with the same <main>-only rule.
7. Flip this card's status and ours line in src/data/seoNorthStar.ts and this spec's Status line.

## Done when

- tests/inlinks.test.ts passes, and it failed on the two vault pages before the fix.
- Every indexable page outside the allow list has 2 or more other pages linking in, counted on the live site.

## Open questions

None.
