# Every question our reader searches has a guide

Status: started
App Postmosis (postmosis.com), owner Claude, phase 2 (The page sets rivals rank with).

## Why

Taplio's blog has 227 posts at /blog/<slug>, AuthoredUp's 164 (160 posts and 4 newsletter issues), Supergrow's 99 and Typefully's 76. Buffer runs 2,413 at /resources/<slug>/ and Predis 1,407, both for a wider reader, and 10 of 30 sampled Predis posts answer 410 (census.md, 30 Oct 2026). Taplio is the target, as the largest blog of the solo-first tools (SEO_TARGETS.guides).

Guide phrases carry the most demand we can serve at low difficulty: best time to post on Instagram 74,000 US searches a month at KD 15, on TikTok 40,500 at KD 14, and Instagram post size 33,100 at KD 14 (keywords.md, 28 Oct). All three have a guide.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272), the live sitemap and the vault.

- 18 guides at /guides/<slug> (src/content/guides.ts), shipped in e657b65, 2e62eaf and f732fc5.
- tests/guides.test.ts: every number carries a dated source, every source is cited, links go only to live pages, and each guide links 2 to 4 sibling guides. Each has Article JSON-LD by Leo and FAQPage.
- The pipeline is copy/_guides/scripts. pages.py is the copy source; facts.py holds 42 sources and 151 verbatim quotes, checked against saved pages in copy/_guides/sources; judge_guide.py has Jev judge drafts against the page ranking first; final.py writes each copy .md; to_ts.py writes src/content/guides.ts.
- The plan's 18 guide picks are all live. It parked 10, among them the Instagram and TikTok algorithm guides at KD 58, social media strategy and TikTok for business, and folded 2 (plan.json).
- Some guide topics are answered on vault pages already (hooks, reels, LinkedIn post ideas, TikTok slideshows), and the guides test covers vault pages too.

## What to do

1. Pull the blog URLs of Taplio, AuthoredUp, Buffer and Later from their sitemaps (census.json lists the files but keeps counts, not lists). By the census counts that is 3,487 posts. Save titles and URLs to docs/seo-north-star/research/rival-blogs.json in content-studio.
2. Cluster them by topic from slugs and titles. Drop topics a guide, vault page, glossary term or template already answers, and topics the plan parked.
3. Have Jev keep the topics a solo professional asks, a yes or no read against the brief's reader paragraph. Jev is a paid call: count the rows, state the estimate to Leo and wait for his yes.
4. Read volumes from keywords.csv first. For the gaps, DataForSEO keyword_overview is USD 0.012 plus USD 0.00012 a row, up to 700 a request (credit-prices.ts), about USD 0.10 for 700 topics. Stop and ask Leo before it runs. Drop topics under 100 US searches a month, the bar plan.py uses to park rival pages, unless Leo sets another.
5. Ship in waves of 10 through copy/_guides/scripts. Quote each platform fact from that platform's own help page into facts.py, write in pages.py, and run judge_guide.py against the page ranking first. Its SERP read costs USD 0.002 a phrase on DataForSEO live (credit-prices.ts), and Jev is paid, so ask Leo first.
6. Gate each guide with aicheck under 15 and brief-check against ~/Documents/Postmosis/product-marketing.md on its final .md, run to_ts.py, then heavy npm run check (guides.test.ts and qa/guides.qa.test.ts).
7. Mark each in research/plan/plan.py's SHIPPED dict and rerun it. Push to main, then run postmosis-indexnow-submit.sh.
8. If the kept list ends under 227, lower SEO_TARGETS.guides to its size, with the reason in the comment.

## Done when

- "Guides (Taplio's blog has 227 posts)" on /seo-north-star reaches its total (SEO_TARGETS.guides).
- rival-blogs.json marks every cluster as shipped, answered by another page, or dropped with its volume or reason.
- guides.test.ts passes with every new guide in it.

## Open questions

None.
