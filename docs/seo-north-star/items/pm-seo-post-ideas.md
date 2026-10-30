# A page of post ideas for each profession and month

Status: todo
App Postmosis (postmosis.com), owner Claude, phase 3 (Pages from data, at scale).

## Why

Later runs 28 /instagram-captions-ideas/<theme> pages with a hub, and Taplio 10 galleries such as taplio.com/posts/best-linkedin-posts-about-web-design (census.md and census.json, 30 Oct 2026). Page one for real estate social media is tip and idea lists: theceshop's "10 Real Estate Social Media Tips", mckissock's "55 ideas" and orangevisuals' "100 Real Estate Posts" (the brief, page one read 28 Oct).

Demand per profession is small (keywords.csv, US, 28 Oct): real estate instagram post ideas 70 searches a month, realtor instagram post ideas 20, law firm instagram post ideas 20, and 10 or fewer for coaches, financial advisers and the rest. The general phrases are bigger: instagram post ideas 1,300 at KD 0 and social media post ideas 480.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272), the live sitemap and the vault.

- Each /for page carries one example week, labelled as examples (tests/audiences.test.ts).
- Two idea templates: /templates/instagram-post-ideas and /templates/linkedin-post-ideas (src/content/templates.ts).
- Four vault idea pages: content ideas, TikTok video ideas (formats in five groups, each with a template and an example), LinkedIn post ideas and TikTok slideshow ideas (src/content/vault.ts).
- Nothing is per profession and month.

## What to do

1. Phase 3 starts once pm-seo-indexed shows Google keeps what we publish. Check that first.
2. Read volume for about 24 phrases (post ideas, instagram post ideas, content ideas and linkedin post ideas, for each of the 6 professions) with keyword_overview, under USD 0.02, and page one for the 6 heads with DataForSEO SERP live at USD 0.002 each (credit-prices.ts). Stop and ask Leo before either runs.
3. Build /ideas/<audience> for the 6 /for slugs first. Each has 12 monthly sections, and each idea is in the profession's words with a hook and a format (a text post, a carousel or a talking-head video), drawn from the brief's audience sections and the dates that profession works around.
4. Every idea is something the reader can make with tools product-truth.md lists for every customer. No invented results or client stories; a filled-in line is labelled as an example.
5. Write through the templates pipeline (copy/_templates/scripts): pool the rivals' idea pages first, have Jev keep the ideas each profession posts (a paid call, so state the estimate to Leo first), then aicheck under 15 and brief-check against ~/Documents/Postmosis/product-marketing.md.
6. Give the section a test modelled on tests/templates.test.ts, so any count the page states matches what it holds. Link each page to its /for page, the idea templates and the hook generator. Add ideas to the CONTENT pattern in src/data/seoNorthStarCounts.ts.
7. Run heavy npm run check, push to main, then run postmosis-indexnow-submit.sh.
8. Split a profession into monthly pages only if Search Console shows month searches for it (pm-seo-scoreboard).

## Done when

- 6 /ideas/<audience> pages are live, each with 12 monthly sections, each passing its test.
- Monthly pages exist only where Search Console showed month searches, with the queries named in this spec.

## Open questions

None.
