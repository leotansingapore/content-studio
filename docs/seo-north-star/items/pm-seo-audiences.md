# An audience page for every profession that searches for help

Status: done
App Postmosis (postmosis.com), owner Claude, phase 2 (The page sets rivals rank with).

## Why

Later runs 19 audience pages (agencies-freelancers, small-business-owners, youtubers and industry pages ending in -lp). Buffer runs 6, such as /made-for/creators and /partners/agencies, Taplio 6 (/use-cases/for-<x>, /agencies and /individual-creators) and Predis 4, such as /business-coach-social-media-tool/ (census.md and census.json, 30 Oct 2026). The brief's read of the nearest rivals found none selling to a profession on its homepage: Buffer's "for everyone" and Taplio's "creators" are as close as they get.

Demand by profession is uneven (keywords.md, 28 Oct): about 6,800 US searches a month across the real estate cluster, 1,760 for consultants, 2,000 for lawyers outside legal AI and 2,000 for freelancers, half of it a different reader. Coaches split into many small phrases.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272), the live sitemap and the vault.

- 6 pages at /for/<slug>: real-estate-agents, coaches, consultants, freelancers, lawyers and financial-advisers (src/content/audiences.ts), added in 6cefe2d and guarded in e3a7b44.
- tests/audiences.test.ts: each page shows an example week labelled as examples, links 2 to 4 sibling audience pages and the live feature pages, carries a real product screenshot in light and dark, and never claims a legal or regulatory check. The adviser page's words stay off the others.
- The plan folded 8 smaller audiences into these pages (realtors and property agents into real estate, insurance agents into financial advisers, personal trainers and four kinds of coach into coaches). It parked 5 with reasons: recruiters, founders, accountants, therapists and mortgage brokers (plan.json; the brief's Parked audiences).
- All 7 /for URLs, hub included, were indexed by Google on 30 Oct (URL Inspection).
- The pipeline is copy/_audience/scripts, with judge_for.py for whole-page judging per profession.

## What to do

1. Nothing to build. Once a quarter, re-read demand for the 5 parked audiences with keyword_overview, USD 0.012 plus USD 0.00012 a row (credit-prices.ts), under USD 0.10 for their phrases. Stop and ask Leo before it runs.
2. Reopen a parked audience only when its phrases pass 300 searches a month and its reason in plan.json no longer holds, for example when "ai for accountants" stops meaning accounting software.
3. A reopened page starts from a new audience section in ~/Documents/Postmosis/product-marketing.md, then goes through copy/_audience/scripts, aicheck under 15, brief-check and audiences.test.ts.
4. Pages other cards build per profession (tool variants, post ideas, creator breakdowns) use these 6 slugs, so the sets line up.

## Done when

- The 6 audience pages are live, indexed and pass audiences.test.ts. Met on 30 Oct 2026.
- Each quarterly demand read for the parked audiences is logged in plan.json.

## Open questions

None.
