# Each week shows clicks and impressions per page type

Status: todo
App Postmosis (postmosis.com), owner Claude, phase 1 (Indexed and measured).

## Why

None of the eight rivals publishes its search numbers, so the census can count their pages but not their clicks (census.md counts sitemap URLs only). Every later card here is a bet on a page type: 227 guides to match Taplio's blog, 103 glossary terms to match Buffer, 34 tools to match Taplio (SEO_TARGETS). Without clicks and impressions per type, the plan cannot tell which bet pays, or when phase 3 should start.

## What we have today

Checked 30 Oct 2026 against Search Console's API through gdata.py, ~/.local/share/seo-visibility and content-studio.

- The domain property sc-domain:postmosis.com exists since 29 Oct 2026, and the service account reads it.
- A Search Analytics query for 1 to 30 Oct 2026, by date and by page, returned no rows on 30 Oct. The site went live on 29 Oct.
- gdata.py already runs the query this job needs: gsc-query with --dims and --limit. seo-visibility's SITES map has no postmosis entry, so pass the property name itself.
- The live counts on /seo-north-star read only sitemap.xml and llms.txt (src/data/seoNorthStarCounts.ts). Nothing shows clicks.
- The sections to group by are the first path segments in the sitemap: guides (18 pages), glossary (12), tools (9), templates (7), compare (5), for (6), features (9) and vault (33), plus home, plans, about and the legal pages.

## What to do

1. Write ~/.local/bin/postmosis-scoreboard in Python, importing gdata the way sb-index-watch does. Query searchAnalytics for the last 28 days of complete data, dimensions page and query. The call is read-only and free.
2. Group clicks and impressions by first path segment, with home, plans and about as "core". Add click rate, average position and the top 3 queries per group.
3. Save each week as dated JSON under ~/Documents/Postmosis/research/scoreboard/ and append the table to progress.md there, so weeks compare.
4. Add --self-test on fixed rows: the grouping, a URL with a trailing slash, and a week with no rows, which must print "no data" and not zeros.
5. Schedule it weekly with launchd as com.leo.postmosis-scoreboard, Mondays.
6. Stop and ask Leo before the first post: which channel (the Lark alerts group or Telegram), and whether a quiet week posts at all. Leo's rule for agent posts is changes only, action first.
7. Once four weekly files exist, stop and ask Leo whether clicks per section may show on /seo-north-star. This repo and the page's JS chunk are public (the header of src/data/seoNorthStar.ts), so Search Console numbers put there are public. If he says no, the weekly post stays the only place they show.
8. Flip this card's status and ours line in src/data/seoNorthStar.ts and this spec's Status line.

## Done when

- postmosis-scoreboard runs weekly under launchd and passes --self-test.
- Four weekly files hold clicks and impressions per section.
- Leo has picked the channel and gets the table in it.
- His answer on showing the numbers on /seo-north-star is written into this spec.

## Open questions

None.
