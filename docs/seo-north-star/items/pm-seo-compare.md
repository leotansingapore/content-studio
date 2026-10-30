# A comparison page for each tool a solo professional weighs us against

Status: started
App Postmosis (postmosis.com), owner Claude, phase 2 (The page sets rivals rank with).

## Why

Supergrow runs 12 comparison pages: 8 at /compare/supergrow-vs-<x>, a hub, and 3 at the root such as /aware-alternative. Taplio runs 11 (/competitors-pages/competitors-<x> and /taplio-vs-aware), AuthoredUp 10 (/alternatives/<x>-alternative) and Later 17 (14 /<x>-alternative/ pages and 3 /later-vs-<x>/). FeedHive runs 128: an /alternatives/<x> page and a /comparison/<x> page for each of the same 63 rivals, plus 2 hubs (census.md and census.json, 30 Oct 2026). Supergrow's 12 is the target, as the solo LinkedIn tool nearest our size (SEO_TARGETS.compare).

Demand for scheduler alternatives is modest: hootsuite alternative 720 US searches a month, buffer alternative 390, sprout social alternative 320, metricool alternative 170 and later alternative 140. The tools nearest our gap draw more: capcut alternative 1,900 (11,290 across its phrases) and canva alternative 590 (keywords.csv and plan.json, 28 Oct). Page one for capcut alternative is video editor roundups and Reddit (keywords.md), and the brief quotes the r/CapCut thread "Is there a free alternative like capcut??".

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272), the live sitemap and the vault.

- 5 pages under /compare: best-social-media-schedulers (a roundup of Postmosis, Buffer, Metricool, Later, Planoly and Hootsuite) and alternatives to Buffer, Hootsuite, Later and Metricool (src/content/compare.ts).
- Every competitor row carries a quoted source with a read date (tests/compare.test.ts). The 74 facts behind them sit with verbatim quotes in copy/_compare/facts.json, re-checked by facts.py.
- Each alternatives page says plainly where the competitor is the better pick and shows its published price, the roundup lists every tool in ItemList, and no page claims anything for Postmosis that product-truth.md cannot back (compare.test.ts).
- On 28 Oct the plan folded Taplio (30 US searches a month), Supergrow (10), AuthoredUp (10) and Kleo (10) into /features/ai-post-writer. Its FAQ asks "How is it different from Taplio or Supergrow?" and nothing more, so AuthoredUp and Kleo are folded but not yet answered (src/content/features.ts; plan.json status).
- It parked FeedHive (20) for demand and Predis.ai (20) as an ad maker. CapCut, Canva, Opus Clip (390) and HeyGen (480) were parked as tools a reader signs up for alone, and Sprout Social (320), Loomly (110) and Agorapulse (110) as team tools, the brief's anti-persona (plan.json).
- The pipeline is copy/_compare/scripts: serp.py, scrape.py, build_pools.py, adapted.py, pages.py, round2.py, final.py, judge_compare.py, report.py and to_ts.py, which writes src/content/compare.ts.

## What to do

1. Add AuthoredUp and Kleo to the writer FAQ on /features/ai-post-writer, each line held to a quote in copy/_compare/facts.json, so every fold has its answer. Run aicheck under 15 and brief-check on the changed copy, then heavy npm run check (features.test.ts).
2. If Leo says yes to CapCut, read page one for capcut alternative first: DataForSEO SERP live costs USD 0.002 for the first 10 results (credit-prices.ts), so stop and ask Leo before it runs. Then write /compare/capcut-alternative through copy/_compare/scripts for a professional who films a talking head on a phone. Quote CapCut's own pages for every row, say where CapCut is the better pick, and claim only the video editor lines product-truth.md lists for every customer.
3. Each quarter, re-read US volume for every folded and parked rival with keyword_overview, USD 0.012 plus USD 0.00012 a row (credit-prices.ts), under USD 0.02 for the list. Stop and ask Leo before it runs. A rival gets its own page once its phrases pass 100 a month and its reason for parking no longer holds.
4. One page per rival, never a vs page and an alternatives twin (SEO_SKIP).
5. Ship through to_ts.py and heavy npm run check, mark the page in research/plan/plan.py's SHIPPED dict and rerun it, push to main, then run postmosis-indexnow-submit.sh.
6. If the reachable list stays under 11 after a quarterly read, lower SEO_TARGETS.compare to its size, with the reason in the comment.

## Done when

- "Comparison pages (Supergrow has 11)" on /seo-north-star reaches its total (SEO_TARGETS.compare).
- The writer FAQ answers every rival folded into it.
- Leo's answer on CapCut is written into the decided field of dec-seo-capcut in src/data/seoNorthStar.ts.

## Open questions

Reopen a CapCut alternative page, framed for a professional who films on a phone?
