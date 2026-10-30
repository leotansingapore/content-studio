# Every content page has a Markdown copy listed in llms.txt

Status: started
App Postmosis (postmosis.com), owner Claude, phase 1 (Indexed and measured).

## Why

Predis (147 lines), FeedHive (54), AuthoredUp (60) and Typefully (26) serve an llms.txt. Later and Supergrow answer 404. Buffer's redirects to developers.buffer.com and covers only its API, Taplio's is an RTF file, and Typefully's llms-full.txt answers 200 with an HTML page (census.md and the llms_txt rows in census.json, 30 Oct 2026). Read again the same day, Typefully's llms.txt links 3 Markdown copies (its home page, AI agents page and API docs), Buffer's links 63 for its API docs, and the other three link none. No rival links a copy of every page, so a full set of copies is a lead no rival holds.

## What we have today

Checked 30 Oct 2026 against ~/postmosis-site origin/main (2b81272), the live llms.txt and the live sitemap.

- llms.txt (src/app/llms.txt/route.ts) lists 8 hubs and every page under them. Only the vault section links .md copies; the route sets md for "/vault" alone.
- 33 Markdown copies, one per vault page, at /vault/<slug>.md. A rewrite in next.config.ts sends them to src/app/md/vault/[slug]/route.ts, which answers text/markdown with a Link header naming the HTML page as canonical.
- pageMarkdown in src/site/markdown.ts already renders any guide-shaped page. llms-full.txt (src/app/llms-full.txt/route.ts) uses it for all 33 vault pages and all 18 guides.
- Only vault pages name their copy in the page head: pageMetadata in src/site/seo.ts adds alternates.types text/markdown for kind "vault" alone.
- tests/guides.test.ts checks that each vault page names its Markdown twin, and that the twin carries every heading, source and absolute link.
- The live count on /seo-north-star reads 33 copies against 99 content pages: 18 guides, 12 glossary terms, 9 tools, 7 templates, 5 comparisons, 33 vault pages, 9 features and 6 audience pages.

## What to do

1. Guides first, since pageMarkdown already renders them. Add a route for /guides/<slug>.md beside src/app/md/vault, a matching rewrite in next.config.ts, and the alternates line for kind "guide" in pageMetadata. That is 18 copies.
2. Write a renderer for each other page type in src/site/markdown.ts, from the same content objects the page renders, in reading order: glossary terms (definition, body, FAQ, sources), templates (every block in full, a grid as a table), tools (what it does, how-to, worked examples, FAQ, sources, and a line that the tool itself runs on the page), comparisons (every row with its source), feature pages and audience pages.
3. Serve them from one route, src/app/md/[section]/[slug]/route.ts, with generateStaticParams over each content array and one rewrite per section. Keep force-static and the canonical Link header.
4. In src/app/llms.txt/route.ts, point every hub's links at the .md copies, and change the intro line that says only vault pages have one.
5. Extend the twin test in tests/guides.test.ts to every section: each page names its copy, and each copy carries every heading, source and absolute link, and nothing the page does not say.
6. Run heavy npm run check in the site (tsc, build, vitest, qa), then push to main; Vercel builds on push. Curl one copy per section on postmosis.com and check the content type and the Link header.
7. Flip this card's status and ours line in src/data/seoNorthStar.ts and this spec's Status line.

## Done when

- "Content pages with a Markdown copy in llms.txt" on /seo-north-star reaches its total. That total is the live count of content pages (99 on 30 Oct), not an SEO_TARGETS key.
- Every content page names its copy in its alternates, and one copy per section answers text/markdown with the canonical Link header.
- The twin test covers every section and passes.

## Open questions

None.
