# A free tool for each small job a professional does before posting

Status: started
App Postmosis (postmosis.com), owner Claude, phase 2 (The page sets rivals rank with).

## Why

Taplio's sitemap lists 34 free tool URLs: the /free-tools hub, 19 tool pages and 14 sub-tool pages under them, such as taplio.com/linkedin-post-generator/body-helper. The hub itself links 10 tools. Predis lists 35, 34 of them under /free-ai-tool/<tool>/, and links 51 from predis.ai/free-ai-tools/, laid out network by tool. Buffer has 17, 16 of them under /free-tools/, FeedHive and AuthoredUp 13 each under /tools/, Supergrow 9 and Typefully 8, plus 6 AI writers Typefully leaves off its sitemap (census.md and census.json, 30 Oct 2026). Taplio's 34 is the target (SEO_TARGETS.freeTools).

Tool phrases meet high volume at low difficulty: linkedin text formatter 5,400 US searches a month at KD 9 and speech time calculator 3,600 at KD 4, both shipped (keywords.md, 28 Oct). Some rival jobs are already ours: keywords.csv sends linkedin post preview (880, KD 2) to the LinkedIn formatter and instagram post preview (480) to the grid planner.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272), the live sitemap and the vault.

- 9 tools at /tools/<slug>: character counter, engagement rate calculator, hook generator, image resizer, Instagram grid planner, Instagram line break generator, LinkedIn text formatter, speech time calculator and teleprompter (src/content/tools.ts, logic in src/tools/logic/).
- Each runs in the browser with no sign-up and no paid call. The hook generator fills 18 formulas with no AI call (src/tools/logic/hooks.ts), and the LinkedIn formatter already previews where a post folds.
- tests/tools.test.ts holds every page to the same shape: the tool, how-to, guide, worked examples computed by the tool's own logic, FAQ, one Postmosis line linked to a live feature, and a dated, nofollow source for every platform fact. Those facts are quoted in copy/_tools/platform-facts.json (64 facts, read 28 Oct).
- The plan parked 5 tools with reasons: instagram font generator (18,100 US), aspect ratio calculator (14,800), utm builder (12,100), strikethrough text generator (8,100) and subtitle converter (390). It folded video resizer (5,400) into /features/video-editor, since a browser tool for it needs a new dependency (plan.json, keywords.md).
- The pipeline is copy/_tools/scripts: serp.py, scrape.py, build_pools.py, adapted.py, drafts.py, judge_tool.py, lines_tool.py, pages.py (the copy source) and to_ts.py, which writes src/content/tools.ts.
- census.json keeps counts and 3 sample URLs per bucket, not each rival's full tool list.

## What to do

1. Re-walk all eight rivals' tool URLs with Scrapling Fetcher, from the sitemap files census.json lists and the hubs it names (predis.ai/free-ai-tools/ needs DynamicFetcher). Save them to docs/seo-north-star/research/free-tools.json in content-studio.
2. Group them by job (counters, formatters, previews, generators, calculators) and mark the jobs two or more rivals share.
3. Keep a job only if it runs in the browser with no paid call, a professional does it before posting, and it leads to a feature product-truth.md lists as on for every customer. Drop jobs our 9 tools already do, and per-network copies, which belong to pm-seo-tool-variants.
4. Read volumes from keywords.csv first. For the rest, DataForSEO keyword_overview costs USD 0.012 plus USD 0.00012 a row, up to 700 a request (credit-prices.ts), so under USD 0.10. Stop and ask Leo before it runs.
5. Have Jev rank the kept jobs by whether our reader would use them. Jev is a paid call: count the rows, state the estimate to Leo and wait for his yes.
6. Ship two a wave through copy/_tools/scripts. Quote each platform fact from that platform's own help page into platform-facts.json, then pages.py, aicheck under 15 and brief-check against ~/Documents/Postmosis/product-marketing.md on each copy .md, and to_ts.py. Put the logic in src/tools/logic/ with a unit test in tests/tools-logic.test.ts, then run heavy npm run check.
7. Mark each tool in research/plan/plan.py's SHIPPED dict and rerun it; never edit Build plan items by hand. Push to main, then run ~/.local/bin/postmosis-indexnow-submit.sh (free; Leo set it up on 29 Oct).
8. If the kept list ends under 33 (Taplio's 34 less its hub), lower SEO_TARGETS.freeTools to its size, with the reason in the comment.

## Done when

- "Free tools (Taplio has 33)" on /seo-north-star reaches its total (SEO_TARGETS.freeTools).
- free-tools.json marks every rival job as shipped, already covered, or dropped with its reason.
- Every new tool passes tools.test.ts and calls no paid API.

## Open questions

Any tool that needs an AI call costs money per use. Keep tools free of AI calls?
