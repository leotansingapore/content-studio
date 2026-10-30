# A Made with Postmosis page shows real posts and videos, Leo's own first

Status: todo
App Postmosis (postmosis.com), owner Claude, phase 2 (Proof a professional believes).

## Why

AuthoredUp's strongest marketing page is "Made with AuthoredUp", a wall of real LinkedIn posts written in its editor, opening with the founder's own (authoredup.com/made-with-authoredup, research/teardown.md, move 7). One unrelated business tagged #madewithpredisai in its own Meta ad (Meta Ad Library, q=Predis.ai).

No rival can show a professional's phone video edited in its tool, because none of the eight edits phone video. A wall that leads with edited videos shows the gap a visitor can check.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272), the live site and the vault.

- postmosis.com shows screenshots of an example brand (captioned "Example brand" on the /for pages, src/content/audiences.ts) and no real posts.
- The brief bars implying customers: "There are no customers, testimonials, logos or ratings to show, so no page may imply any" (product-marketing.md, Proof points). The site's PRICES_AND_PROOF guard fails a money page on "trusted by", "join thousands" or a count of customers or users (tests/built.ts).
- /about names Leo's own brands, his own account, MoneyBees and FINternship, and says he used Postmosis for his own posts first (src/content/about.ts).
- The hub plan for Leo's weekly reels finishes them with the talking-head-reel skill in a Claude session, outside Postmosis (hub spec faces-leo-weekly). Only posts made in Postmosis can go on this page.
- The app exports carousels as 1080x1350 PNGs or one PDF, and videos in 9:16, 4:5, 1:1 and 16:9 in one run (product-truth.md).

## What to do

1. Leo picks six to nine posts from his own brands that were made in Postmosis: carousels from the carousel maker, clips cut in /edit, and his link-in-bio page. If fewer exist, he makes the missing ones in Postmosis first, a carousel and a video for each of two brands.
2. Claude builds /made-with on the site: each post as an image or a muted video with a poster frame and no autoplay sound, the brand, the network, and one line naming the feature that made it, linked to that /features page.
3. The words go through the copy pipeline: the brief first, aicheck under 15, brief-check. It is the site's first proof page, so Leo reads the copy .md before it goes into code.
4. Register the page in src/site/routes.ts, which feeds the nav, footer and sitemap, add it to llms.txt (its hub list does not reach it), and link it from home and /about. Run next build and the site's tests, check 390 and 1440 wide, push to main.
5. A customer's post goes up only with their written permission, filed in ~/Documents/Postmosis/proof/ with the date. Their name and profession show only if they agree.

## Done when

- postmosis.com/made-with is live with at least six posts made in Postmosis, each labelled with its feature.
- It is in the sitemap, linked from home and /about, and the site's tests pass.
- Every customer post on it has a dated written permission in the vault.

## Open questions

None.
