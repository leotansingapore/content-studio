# Tool pages for each audience and each network

Status: todo
App Postmosis (postmosis.com), owner Claude, phase 3 (Pages from data, at scale).

## Why

Taplio runs 27 /linkedin-headline-generator/<audience> pages, such as taplio.com/linkedin-headline-generator/coaches and /real-estate-agents, plus goals such as getting-clients. Buffer runs 11 /free-tools/image-resizer/<network> pages, from bluesky to youtube, and Predis has bio generators for 8 networks under /free-ai-tool/ (census.md and census.json, 30 Oct 2026). Predis also shows the limit: its robots.txt now blocks 1,442 /free-ai-tools/ variant pages by occasion and niche, a set it built and then pulled (census.md).

Demand per network is uneven (keywords.csv, US, 28 Oct): instagram character counter 1,000 searches a month, linkedin character limit 320, threads character limit 320, tiktok character counter 30 and facebook character counter 20. image resizer for instagram is 2,900. No hook generator phrase was measured per profession, and per network they run 10 to 30.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272), the live sitemap and the vault.

- One page per tool, and no page under /tools/<tool>/<variant>. The live count reads 0 of 18.
- The hook generator already asks what you do, who you help, your topic and your years (src/tools/logic/hooks.ts), so a profession page needs presets and its own copy, not new logic.
- The image resizer holds 6 presets: Instagram tall 3:4, portrait 4:5, square 1:1 and landscape 1.91:1, a 9:16 Story and the LinkedIn link image (src/tools/logic/resize.ts). It has no Facebook, TikTok, YouTube or Threads preset, so network pages need new sourced presets.
- The character counter holds limits for Instagram, LinkedIn, TikTok, Threads, X and YouTube (src/tools/logic/counter.ts) and none for Facebook. copy/_tools/platform-facts.json records Facebook's post limit and organic feed photo size as not found on an official page (read 28 Oct).
- Inputs live after the # in the URL (src/tools/hashState.ts), so a variant can open with its preset filled in.

## What to do

1. Phase 3 starts once pm-seo-indexed shows Google keeps what we publish (SEO_PHASES). Check that first.
2. Read US volume for the variant phrases (hook generator for a profession, image size or resizer per network, character limit or counter per network) with keyword_overview: about 40 phrases at USD 0.012 plus USD 0.00012 a row (credit-prices.ts), under USD 0.02. Stop and ask Leo before it runs. Build a variant only where it has demand or a different answer.
3. Hook generator: up to 6 pages at /tools/hook-generator/<audience>, one per /for slug. Each opens with that profession's inputs filled, an intro on what that profession posts (the brief's audience sections), worked examples the tool computes, and its own FAQ. Each links its /for page.
4. Image resizer: up to 6 pages at /tools/image-resizer/<network>. Add presets to resize.ts only from that network's own help or developer pages, quoted into platform-facts.json with the read date. Facebook has only its link image sourced, 1200 x 630 at 1.91:1, so its page carries that preset alone or is cut.
5. Character counter: up to 6 pages at /tools/character-counter/<network>. Cut the Facebook page unless an official Facebook page states a post limit.
6. Add the variant route under src/app/tools/[slug]/ and register each page in src/site/routes.ts, so the sitemap, breadcrumbs and guards see it. Extend tests/tools.test.ts: each variant passes the tool page rules and shares no intro, example or FAQ with its parent or another variant, since a page that only swaps a word is scaled content (SEO_PRINCIPLES).
7. Write the copy through copy/_tools/scripts, with aicheck under 15 and brief-check against ~/Documents/Postmosis/product-marketing.md on each copy .md. Run heavy npm run check, mark the pages in research/plan/plan.py and rerun it, push to main, then run postmosis-indexnow-submit.sh.
8. If the set ends under 18, lower SEO_TARGETS.toolVariants to its size, with the reason in the comment.

## Done when

- "Tool pages per audience and network" on /seo-north-star reaches its total (SEO_TARGETS.toolVariants).
- Every variant passes tools.test.ts and quotes each platform number from that platform's own page.
- No variant shares its intro, examples or FAQ with another page.

## Open questions

None.
