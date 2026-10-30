# Open Claude skills for a professional's week of posts

Status: todo
App Postmosis (postmosis.com), owner Claude, phase 3 (Pages from data, at scale).

## Why

Taplio lists 17 /claude-skills/<skill> pages in its sitemap, such as taplio.com/claude-skills/story-extractor, and its hub taplio.com/claude-skills-for-linkedin links 26 (census.md, 30 Oct 2026). Predis has 8 /mcp/<x> pages with a hub, and FeedHive has /features/claude and /features/claude-code (census.json). The teardown found Taplio listed as an official Claude connector and buying Meta ads about it (teardown.md, item 20).

Demand is small but real: claude linkedin 260 US searches a month at KD 16 (copy/_vault/volumes-1030.json, 30 Oct), claude social media 90 and claude for social media 70 (keywords.csv, 28 Oct).

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272), product-truth.md and the vault.

- /features/claude explains Connect Claude, which every customer has: an MCP link with list_posts, get_post, get_calendar, get_results, get_brand and add_draft (product-truth.md, Integrations).
- Every vault page carries copyable blocks, prompts, scripts or checklists shown in full with a Copy button: 159 across the 33 pages in src/content/vault.ts (tests/guides.test.ts). None is packaged as a skill.
- copy/_vault/originals/hattip holds Christian Di Bratto's hattip-linkedin-os repo under the MIT licence: an interview, a strategy file, post ideas from reference posts and a draft review. Anything adapted from it ships with its licence notice.
- No /claude-skills page and no SKILL.md download.

## What to do

1. Read US volume for skill phrases (claude skills for linkedin, claude skill for social media, claude linkedin skill and the like) with keyword_overview, under USD 0.02 (credit-prices.ts). Stop and ask Leo before it runs. Read Taplio's 26 skill pages with Scrapling to see their shape; that is free.
2. Pick 4 to 8 skills for a professional's week, starting with the card's four: plan my week, turn a client question into a carousel, script a talking head, and check a LinkedIn post. A skill may add drafts through Connect Claude and say so, since product-truth.md lists it for every customer.
3. Write each as a SKILL.md in Anthropic's skill format (name and description up top, then the steps). Run each once in Claude Code on a real week of posts before it ships, and fix what it gets wrong. A skill that adds drafts runs against a test brand; ask Leo before it writes to his own brands.
4. Where a skill adapts hattip-linkedin-os, credit it by name on the page, keep the MIT notice in the SKILL.md, and add the notice to THIRD_PARTY_NOTICES.md in the site.
5. Publish /claude-skills as a hub and /claude-skills/<skill> per skill, ungated like the vault. Each page says what the skill does, shows the SKILL.md in full with Copy and Download, gives install steps, and has a Markdown copy listed in llms.txt.
6. Give the kit its JSON-LD node and a test modelled on tests/guides.test.ts. Gate the copy with aicheck under 15 and brief-check against ~/Documents/Postmosis/product-marketing.md, run heavy npm run check, push to main, then run postmosis-indexnow-submit.sh.
7. Add claude-skills to the CONTENT pattern in src/data/seoNorthStarCounts.ts so the Markdown count covers it.

## Done when

- /claude-skills and at least 4 skill pages are live, each with a SKILL.md that downloads and a Markdown copy in llms.txt.
- Each skill was run once in Claude Code and did what its page says.
- Every adapted skill carries its MIT notice, and THIRD_PARTY_NOTICES.md lists it.

## Open questions

None.
