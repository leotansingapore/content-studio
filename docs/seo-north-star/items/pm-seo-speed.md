# Every page type passes Core Web Vitals on a phone

Status: started
App Postmosis (postmosis.com), owner Claude, phase 1 (Indexed and measured).

## Why

Google uses Core Web Vitals as one of its page experience signals. A page is good when Largest Contentful Paint is 2.5 s or less, Interaction to Next Paint 200 ms or less, and Cumulative Layout Shift 0.1 or less, at the 75th percentile of visits (web.dev, Web Vitals). The census did not measure the rivals' speed, so the bar is Google's thresholds, not a rival.

Our heaviest pages are the long ones. The vault playbooks run 148 to 345 KB of uncompressed HTML each (live fetch, 30 Oct 2026).

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272) and the 113 live pages.

- The display font downloads 67 KB instead of 147 KB on every page (site commit 7afd9b0). Headings use Roboto Serif at weight 500 only, now through next/font/local.
- Phones download screenshots at the width they are drawn (8688255), after a fix to the sizes hint.
- No Lighthouse run, PageSpeed report or field data is recorded for any page type. The qa script (scripts/qa.mjs) runs the Playwright checks in qa/ against a production build, with no performance check, and Lighthouse is not in package.json.
- Uncompressed HTML per type, largest first: vault pages 148 to 345 KB (/vault/linkedin-post-ideas is the largest), guides 96 to 134 KB, templates 110 to 132 KB, comparisons 103 to 118 KB, tools 89 to 107 KB, audience pages 99 to 107 KB, feature pages 87 to 104 KB, glossary terms 73 to 76 KB.
- No field data from Chrome users (the CrUX dataset) has been read for postmosis.com. A day-old site may not have enough visits to appear there.

## What to do

1. Use the largest live page of each type: /, /features/ai-post-writer, /for/real-estate-agents, /guides/social-media-image-sizes, /tools/character-counter, /templates/content-calendar, /glossary/carousel-post, /compare/best-social-media-schedulers and /vault/linkedin-post-ideas.
2. Run Lighthouse mobile on each against postmosis.com, three runs per page, and keep the median. Use npx lighthouse (version 12 is in the npx cache) through heavy, without adding it to package.json. Run nothing else on the machine at the same time: a crawl running beside Lighthouse faked a slow LCP in an earlier audit of another site.
3. Record performance, LCP, CLS, Total Blocking Time and total bytes per page in docs/seo-north-star/research/speed-<date>.md in content-studio.
4. Fix any page under 90 for performance, vault pages first. Check whether the long body ships twice (in the HTML and again in the page's React payload) and whether sections below the fold can load later. Rerun after each fix.
5. Adding Lighthouse to scripts/qa.mjs adds a dev dependency to the site. Stop and ask Leo first. If he says yes, add one mobile run per page type with a floor of 90, so a slower page fails qa.
6. After a month of traffic, read field data from the CrUX API. It is free but needs a Google API key, so stop and ask Leo before creating one.
7. Flip this card's status and ours line in src/data/seoNorthStar.ts and this spec's Status line.

## Done when

- speed-<date>.md holds the Lighthouse mobile medians for all nine page types.
- Every page type scores 90 or more for performance on mobile, or the file names the cause and the fix.
- Leo's answer on adding Lighthouse to the qa script is written here, and the run is in qa if he said yes.

## Open questions

None.
