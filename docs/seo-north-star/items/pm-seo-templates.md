# A template for every recurring post a professional makes

Status: started
App Postmosis (postmosis.com), owner Claude, phase 2 (The page sets rivals rank with).

## Why

Later has 65 template pages: 28 caption lists at /instagram-captions-ideas/<theme> with their hub, 34 downloads at /resources/downloadable/<x> and 2 hub pages. Taplio has 33: 17 /claude-skills/<skill> pages, 10 galleries at /posts/best-linkedin-posts-about-<topic> with a hub, and creator lead magnets such as /amanda-goetz-linkedin-template. Buffer keeps about 183 post prompt cards with no URL each on one /templates page, and AuthoredUp has one page, /resource/free-linkedin-post-templates (census.md and census.json, 30 Oct 2026).

The target is Later's 34 downloads (SEO_TARGETS.templates), the set most like ours. Taplio's 33 counts its Claude skills, which pm-seo-claude-skills covers, and its post galleries, which sit closer to pm-seo-post-ideas.

Demand (keywords.csv, US, 28 Oct): content calendar template 2,400 at KD 40 and instagram post ideas 1,300 at KD 0, both shipped. The plan parked instagram post templates at 18,100 because page one is design galleries, and linkedin headline examples at 2,900 because no feature does the job (plan.json).

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272), the live sitemap and the vault.

- 7 templates at /templates/<slug>: content calendar, social media plan, video script, LinkedIn post, LinkedIn post ideas, Instagram post ideas and social media audit (src/content/templates.ts).
- TemplateKit gives each block a Copy button, prints the template alone, and offers a grid as a CSV at /downloads/<name>. The content calendar's CSV uses only columns Postmosis's CSV import reads or skips (tests/templates.test.ts).
- Each template links once to the feature that does the job, to 2 to 4 sibling templates and to live tools and terms. Its example is labelled made up, and it states no count it does not hold (templates.test.ts).
- The plan parked 6 templates and folded 2: brand voice into /features/ai-post-writer and hooks into /tools/hook-generator (plan.json).
- The pipeline is copy/_templates/scripts: serp.py, scrape.py, build_pools.py, adapted.py, round2.py, judge_tpl.py, linecred.py, similarity.py and report.py, with dump.mjs rendering pages as plain text for Jev, aicheck and brief-check.

## What to do

1. List Later's /resources/downloadable/ and /instagram-captions-ideas/ topics and Taplio's template pages from their sitemaps (census.json names the files), and Buffer's card headings from buffer.com/templates with DynamicFetcher. Save them to docs/seo-north-star/research/templates.json.
2. Drop topics we have, topics the plan parked, Claude skills and per-profession idea lists.
3. Keep the posts our reader makes every month. Start with the card's five: client story, market update, myth-bust, testimonial ask and weekly plan. Each must open in a feature product-truth.md lists for every customer, such as Write, the carousel maker, the video editor or the calendar.
4. Read volumes from keywords.csv, then keyword_overview for the gaps at USD 0.012 plus USD 0.00012 a row (credit-prices.ts). Stop and ask Leo before it runs. Jev keeps the topics our reader posts; it is a paid call, so state the estimate and wait for his yes.
5. Write in waves of 5 through copy/_templates/scripts, with aicheck under 15 and brief-check against ~/Documents/Postmosis/product-marketing.md on each copy .md. Then edit src/content/templates.ts and run heavy npm run check, which covers Copy, the CSV round trip, counts and links.
6. Mark each in research/plan/plan.py's SHIPPED dict and rerun it. Push to main, then run postmosis-indexnow-submit.sh.
7. If the list ends under 34, lower SEO_TARGETS.templates to its size, with the reason in the comment.

## Done when

- "Templates (Later has 34)" on /seo-north-star reaches its total (SEO_TARGETS.templates).
- templates.json marks each rival topic as shipped, covered by another card, or dropped with its reason.
- Every new template opens in its matching feature and passes templates.test.ts.

## Open questions

None.
