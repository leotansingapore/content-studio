# A page for each network Postmosis posts to

Status: todo
App Postmosis (postmosis.com), owner Claude, phase 3 (Pages from data, at scale).

## Why

Buffer runs 12 one-per-network pages (buffer.com/instagram, /linkedin, /tiktok, /threads, /bluesky, /substack and others). Predis runs 12: 6 /integrations/predis-for-<network>, 4 /<network>-scheduler and 2 auto-post pages. FeedHive runs 10 /socials/<network> pages with a hub, Later 8 /<network>-scheduler/ pages plus 8 Instagram scheduler sub-pages, and Typefully 4 (/x-twitter, /linkedin, /bluesky, /schedule-threads-posts) (census.md and census.json, 30 Oct 2026). We have none.

keywords.csv (28 Oct) holds two per-network scheduler phrases, best tiktok scheduler (30 US searches a month) and best linkedin scheduler (10), plus the how-to phrases the scheduling guides target, such as how to schedule instagram posts (8,100). The research parked scheduling pages that day, because Postmosis did not yet post for customers (keywords.md). Posting is now on for each customer Leo onboards (product-truth.md, Shipped 28 Oct), so the demand needs reading.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272), the live llms.txt and product-truth.md.

- No page per network. /features/scheduling covers posting in general and links every comparison (tests/features.test.ts).
- llms.txt says Postmosis schedules to six networks without naming them. The comparison pages name them: Instagram, Facebook, TikTok, LinkedIn, YouTube and Threads, with X left out (src/content/compare.ts).
- For each customer Leo onboards, product-truth.md backs: up to 3 connected accounts, a dated post scheduled in the customer's own time zone or posted now, text, pictures, one video or a carousel, TikTok and YouTube settings, and limits checked before sending. Instagram, TikTok and YouTube need a picture or video; LinkedIn, Facebook and Threads take text alone.
- Still Leo only, so never on these pages: a LinkedIn carousel as one PDF, Threads threads, Instagram Story and Reel placement, first comment, Auto-DM, and real numbers pulled from accounts (product-truth.md).
- Each network's limits already sit in copy/_tools/platform-facts.json (64 facts, read 28 Oct) and copy/_guides/scripts/facts.py. Two gaps: no official page states Facebook's post limit or its organic feed photo size.
- Network guides exist for scheduling (Instagram, TikTok, LinkedIn) and best time to post (Instagram, TikTok, Facebook, LinkedIn).

## What to do

1. Phase 3 starts once pm-seo-indexed shows Google keeps what we publish. Check that first.
2. Read US volume for about 30 network phrases (instagram scheduler, schedule tiktok posts, linkedin scheduler and the like) with keyword_overview, under USD 0.02, and page one for the six heads with DataForSEO SERP live, USD 0.002 each for the first 10 results (credit-prices.ts). Stop and ask Leo before either runs.
3. Put the pages at /networks/<network> with a /networks hub in src/site/routes.ts, and add networks to the CONTENT pattern in src/data/seoNorthStarCounts.ts so the Markdown count covers them.
4. Each page: what Postmosis makes for that network (sizes, captions, carousels or video), how connecting and scheduling work once Leo onboards a customer, the network's limits quoted from its own help pages with read dates, and links to that network's tools, guides and templates. Every product line traces to a row product-truth.md lists for every customer.
5. Write the copy the way the feature pages were written (copy/_features/scripts): the rivals' network pages pooled first, hook-check on the pool (Jev, paid, so state the cost to Leo first), then aicheck under 15 and brief-check against ~/Documents/Postmosis/product-marketing.md.
6. Reuse FeatureKit, and give the section a test like features.test.ts: no price, trial or proof, nothing a customer cannot use, and X never named as a network. Run heavy npm run check, push to main, then run postmosis-indexnow-submit.sh.

## Done when

- Six network pages are live, one each for Instagram, Facebook, TikTok, LinkedIn, YouTube and Threads, and each passes its test.
- Every limit on them is quoted from the network's own page with a read date, and every product line traces to product-truth.md.
- The Markdown count on /seo-north-star covers the networks section.

## Open questions

None.
