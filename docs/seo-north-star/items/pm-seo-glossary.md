# The glossary defines every term a professional meets when posting

Status: started
App Postmosis (postmosis.com), owner Claude, phase 2 (The page sets rivals rank with).

## Why

Later defines 281 terms at /social-media-glossary/<term>, plus 7 /emoji-meanings/ pages. Buffer defines 103 at /social-media-terms/<term>. Typefully links 77 from typefully.com/social-media-glossary, none of them in its sitemap, and 54 of the 77 slugs match Buffer's. Taplio has 15 LinkedIn terms at /glossary/<term> with no hub (census.md and census.json, 30 Oct 2026). Buffer's 103 is the target, since Later's list also covers influencer marketing (SEO_TARGETS.glossary).

Definition phrases carry real demand: what is b roll 9,900 US searches a month at KD 12, jump cut 6,600 at KD 4 and cta meaning 9,900 at KD 31, and all three are live (keywords.csv, 28 Oct).

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272), the live sitemap and the vault.

- 12 terms at /glossary/<slug>: aspect ratio, B-roll, call to action, carousel post, content funnel, engagement rate, evergreen content, faceless content, jump cut, link in bio, reach vs impressions and vanity metrics (src/content/glossary.ts).
- tests/glossary.test.ts asks for a one-sentence definition straight under the H1 and in DefinedTerm JSON-LD, a labelled example, one link to the feature that uses the term, live related terms and tools, a dated source for every platform fact, 250 to 600 words, FAQPage, and no price, proof or word the brief avoids.
- The plan parked 20 terms with reasons, mostly a reader who is not ours (ghostwriting, UGC, click-through rate, social proof and others), and folded 4 into other pages: hook, talking head video, content pillars and content calendar (plan.json).
- The pipeline is copy/glossary/scripts. help.py saves platform help pages to copy/glossary/sources, defs.py pulls page one's definition sentences, and judge_defs.py has Jev read ours against them. Copy and scores per term sit in copy/glossary/<slug>/.
- Every term has 4 or more pages linking in (live count, 30 Oct).

## What to do

1. Pull Buffer's /social-media-terms/ slugs and Later's /social-media-glossary/ slugs from their sitemaps (census.json lists the files), and Typefully's 77 from its hub page, then merge the three lists on slug.
2. Drop the 12 we have, the 20 parked and the 4 folded. A term whose phrase another of our pages owns becomes a fold on that page.
3. Have Jev keep the terms our reader meets when posting: posting, video, captions, LinkedIn and Instagram. Jev is a paid call: count the rows, state the estimate to Leo and wait for his yes.
4. Read US volume for the rest with keyword_overview, USD 0.012 plus USD 0.00012 a row, up to 700 a request (credit-prices.ts), under USD 0.10 for the merged list. Stop and ask Leo before it runs. Drop terms under 100 US searches a month, the bar plan.py uses to park rival pages, unless Leo sets another.
5. Write in waves of 15 through copy/glossary/scripts. Take each platform fact from that platform's own help page (help.py), run Jev's definition read (judge_defs.py, paid; same estimate rule), and gate each copy .md with aicheck under 15 and brief-check against ~/Documents/Postmosis/product-marketing.md.
6. Add the terms to src/content/glossary.ts and run heavy npm run check. Mark each in research/plan/plan.py's SHIPPED dict and rerun it. Push to main, then run postmosis-indexnow-submit.sh.
7. If the kept list ends under 103, lower SEO_TARGETS.glossary to its size, with the reason in the comment.

## Done when

- "Glossary terms (Buffer defines 103)" on /seo-north-star reaches its total (SEO_TARGETS.glossary).
- Every merged term is a page, a fold, or dropped with its volume or reason in docs/seo-north-star/research/glossary-terms.json.
- glossary.test.ts passes with every new term in it.

## Open questions

None.
