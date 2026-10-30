# The vault holds every playbook on Leo's queue

Status: done
App Postmosis (postmosis.com), owner Claude, phase 2 (The page sets rivals rank with).

## Why

Later's academy is 146 pages: lessons, long guides at /resources/guide/, courses and training pages, 41 of them duplicates with a numeric suffix such as /ai-for-creators-960/. It is the only rival with a library of long playbooks; AuthoredUp has 2 such pages, Taplio 4 and Typefully 1 (census.md, 30 Oct 2026).

Some vault phrases carry demand at no difficulty: how to make a slideshow on TikTok 4,400 searches a month at KD 0 and tiktok slideshow 880 at KD 0 (copy/_vault/volumes-1030.json, read 30 Oct).

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272), the live sitemap and llms.txt, and Leo's queue in the vault.

- 33 playbooks at /vault/<slug> (src/content/vault.ts). 660b4e5 shipped the first 20. d33ad56 re-judged every page against its original and page one and split out six creator pages. 6b3844d added five, and 2b81272 added how to make a TikTok slideshow and TikTok slideshow ideas.
- Each has a Markdown copy at /vault/<slug>.md, and llms.txt links all 33. Each carries a credit line naming the maker it was adapted from, Keepy Labs when none is named (creditsBy in src/site/markdown.ts), and copyable prompts, scripts or checklists, 159 across the 33 pages.
- The live count reads 33 of 33 (SEO_TARGETS.vault): both slideshow pages on Leo's 30 Oct queue are live.
- Leo's queue (copy/_vault/queue-1030.txt) holds no new playbook to write. Its open vault item is round 3 on the weakest pages, starting with consistent-ai-character, shelby-sapp-reels and sharran-srivatsaa-reels, which improves pages and adds none.
- 15 of the 33 were unknown to Google on 30 Oct, 13 of them shipped that day (URL Inspection). pm-seo-indexed tracks them.
- /vault/funnel-hacking and /vault/tiktok-slideshow-ideas have one page linking in, the hub. pm-seo-internal-links fixes that.

## What to do

1. Nothing to write until Leo queues a new playbook. When he does, raise SEO_TARGETS.vault by one, with the reason in the comment.
2. Ship it through copy/_vault/scripts: a pages_b<n>.py and facts_b<n>.py batch, check.py (aicheck under 15, brief-check, lint), judge_vault.py against the original and page one (Jev, a paid call, so state the estimate to Leo first), final.py, then to_ts.py into src/content/vault.ts and heavy npm run check.
3. Hold every new page to Leo's calls of 29 Oct: target the same phrase as the original, credit it with a followed link to the source page, keep to social content, and leave out the original maker's own results.
4. Run postmosis-indexnow-submit.sh if it has not run since 2b81272, so Bing gets the vault pages added on 30 Oct.
5. Round 3 on the weakest pages stays on Leo's queue as quality work. It does not move this count.

## Done when

- "Vault playbooks on Leo's queue" on /seo-north-star reaches its total (SEO_TARGETS.vault). Met on 30 Oct 2026, 33 of 33.
- Each playbook Leo queues later raises the target by one and ships with its Markdown copy and credit line.

## Open questions

None.
