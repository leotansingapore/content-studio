# Competitor SEO footprint census

Sitemaps walked 30 Oct 2026 between 02:21 and 02:23 UTC (10:21 to 10:23 SGT) with Scrapling Fetcher. Hub pages and llms.txt files were fetched the same day. Raw data, prefixes, spot-check titles and hub sources are in census.json next to this file.

How to read the table: each cell counts unique sitemap URLs in the site's primary language (English) by page type. Every non-English URL is counted once, in the translated row, so each column adds up to the total. A number in brackets is a page count from a hub page that the sitemap leaves out.

| Bucket | Buffer | Later | Taplio | Supergrow | Predis | FeedHive | AuthoredUp | Typefully | Postmosis |
|---|---|---|---|---|---|---|---|---|---|
| Blog posts | 2,413 | 683 | 227 | 99 | 1,407 | 59 | 164 | 76 | 18 |
| Blog authors, tags, pages | 398 | 249 | 23 | 5 | 1 | 1 | 1 | 1 | 1 |
| Free tools | 17 | 2 | 34 (+1 off sitemap) | 9 | 35 (51 on hub) | 13 | 13 (+1 off sitemap) | 8 (+6 AI tools off sitemap) | 10 |
| Programmatic tool pages | 11 | 0 | 27 | 0 | 6 | 0 | 0 | 0 | 0 |
| Templates | 1 (about 183 cards on one page) | 65 | 33 (+9 Claude skills off sitemap) | 0 | 0 | 0 | 1 | 0 | 8 |
| Glossary terms | 104 | 290 | 15 | 0 | 0 | 0 | 0 | 1 (77 terms on hub) | 13 |
| Comparison (vs, alternatives) | 13 | 17 | 11 | 12 | 16 | 128 | 10 | 8 | 6 |
| Integrations | 26 | 0 | 0 | 0 | 27 | 11 | 0 | 0 | 0 |
| Audience pages | 6 | 19 | 6 | 1 | 4 | 0 | 0 | 0 | 7 |
| Platform pages | 12 | 16 | 0 | 0 | 12 | 11 | 0 | 4 | 0 |
| Academy, courses, guides | 0 | 146 | 4 | 0 | 0 | 0 | 2 | 1 | 32 |
| Research, data, reports | 11 | 12 | 23 | 0 | 0 | 0 | 0 | 0 | 0 |
| Features and product | 14 | 42 | 12 | 19 | 79 | 13 | 9 | 126 | 12 |
| Help docs | 0 | 2 | 0 | 0 | 48 | 0 | 0 | 1 | 0 |
| Video, webinars, podcast | 0 | 200 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| Community | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Company, legal | 16 | 80 | 7 | 11 | 7 | 2 | 9 | 2 | 4 |
| Other | 1 | 11 | 1 | 1 | 0 | 0 | 1 | 1 | 0 |
| Translated copies | 398 | 0 | 2 | 0 | 66,537 (58,599 in prune files) | 0 | 0 | 0 | 0 |
| Total unique URLs | 3,443 | 1,834 | 426 | 157 | 68,179 | 238 | 210 | 229 | 111 |
| Languages | 7 | 1 | 3 | 1 | 58 | 1 | 1 | 1 | 1 |

Hub pages behind the brackets, all fetched 30 Oct 2026: taplio.com/free-tools (10 tools, 1 missing from the sitemap), taplio.com/claude-skills-for-linkedin (26 skills, 17 in the sitemap), predis.ai/free-ai-tools/ (51 tools, rendered in a browser), authoredup.com/tools (13 tools), typefully.com/tools (11 tools), typefully.com/social-media-glossary (77 terms), buffer.com/templates (about 183 template cards with no URL each, rendered in a browser).

## What each one runs

Buffer. A big blog with a long tail of small page sets around it. The blog sits at /resources/<slug>/: 2,413 English posts, 330 author pages and 68 tag pages. Around it are 103 /social-media-terms/ glossary pages, 15 free tools, 11 /free-tools/image-resizer/<network> variants, 26 integration pages and 12 one-per-network pages (/instagram, /linkedin, /x, /substack). Comparisons are 12 "Buffer vs <x>" blog posts, and buffer.com/compare links 10 of them. The site pages are translated into 6 languages, about 66 pages each. The blog is English only.

Later. One sitemap file of 1,834 URLs, English only, and the site now leans to influencer marketing. It has 683 blog posts, a 281-term social media glossary, 7 emoji meaning pages, 28 /instagram-captions-ideas/<theme> caption lists and 34 downloadable templates. It also has 200 video, podcast and webinar pages and 146 academy pages, 41 of which are duplicates with a numeric suffix (/ai-for-creators/ and /ai-for-creators-960/). It runs 14 "<x> alternative" pages, 3 "Later vs <x>" pages and 8 /<network>-scheduler/ pages. Free tools barely exist: later.com/resources/tool/ links one engagement rate calculator.

Taplio. LinkedIn only, 426 URLs, and the most programmatic of the small sites. It runs 27 /linkedin-headline-generator/<audience> pages (coaches, consultants, freelancers, real-estate-agents, finance-professionals, plus goals like getting-clients). Data pages come next: 13 /influencers/<topic> lists ("The 100 Best LinkedIn Influencers about marketing"), 7 /trending/<topic> pages and 10 /posts/best-linkedin-posts-about-<topic> galleries. There are 17 /claude-skills/<skill> pages (the hub links 26), 10 "<x> alternative" pages under /competitors-pages/ and 15 glossary terms with no glossary hub. The free tools hub lists 10 tools, and the sitemap adds 14 sub-tool pages under them. The blog has 227 posts.

Supergrow. Small and LinkedIn only, at 157 URLs. It has 99 blog posts, 8 free LinkedIn tools, 8 /compare/supergrow-vs-<x> pages plus 3 more comparisons at the root, 7 feature pages and 4 employee advocacy pages, with no glossary, templates or llms.txt.

Predis. The biggest sitemap, and most of it is dead weight. It lists 68,179 URLs in 58 languages, but English is 1,642. 58,599 URLs are machine translations in 52 languages, listed in files named sitemap-prune-1.xml to sitemap-prune-5.xml. All 30 I sampled from them return 410, and so do 10 of 30 sampled English blog posts. robots.txt blocks 1,442 /free-ai-tools/ variant pages by occasion and niche (/free-ai-tools/baking/), so a programmatic set was built and then pulled. What is live: 1,407 blog posts, 34 free generators laid out as network by tool (bio for 8 networks, caption for 5, username for 9; the hub links 51), 36 per-network and per-format maker pages under /create/ and /use-cases/, 16 /ai-models/<model> pages and 9 /review/<competitor> pages.

FeedHive. Comparison pages are most of the site. The same 63 competitors each get an /alternatives/<x> page and a /comparison/<x> page, 126 in all, out of 238 URLs. Add 12 free tools, 10 /socials/<network> scheduler pages, 10 AI and automation integration pages (Claude, ChatGPT, Manus, n8n, Zapier) and 59 blog posts.

AuthoredUp. LinkedIn only, 210 URLs. It has 160 blog posts and 4 newsletter issues, 12 LinkedIn tools (the hub links 13), 10 "<x> alternative" pages and 7 product feature pages. There is no hub for the alternatives. The tools page links 8 of them.

Typefully. 229 URLs, and half of them are the changelog: 118 /changelog/ pages, counted as product. It has 84 blog posts, 8 of them "<x> review and alternative" posts counted as comparison. Its /tools hub links 11 tools, and 6 AI writers among them are missing from the sitemap. Its glossary hub links 77 terms that are in no sitemap, and 54 of the 77 slugs match Buffer's glossary slugs. It has 4 per-network pages (X, LinkedIn, Bluesky, Threads).

Postmosis, our column. 111 URLs, English only. It has 18 guides, 9 free tools, 7 templates, 12 glossary terms, 5 comparison pages, 6 /for/<audience> pages, 9 feature pages and 31 vault playbooks. I counted /guides/<slug> as blog posts, because competitors publish the same articles ("best time to post on Instagram", "Instagram post size") in their blogs. I counted /vault/<slug> as academy, because the vault is a library of long playbooks, closest to Later's /resources/guide/ library. Every Postmosis hub links exactly what the sitemap lists.

## Patterns worth copying

- Per-audience tool pages: Taplio has 27 /linkedin-headline-generator/<audience> pages, such as taplio.com/linkedin-headline-generator/coaches and taplio.com/linkedin-headline-generator/real-estate-agents. Postmosis already has 6 /for/ audiences, so a hook or bio generator for each of them would follow the same shape.
- Network by tool grids: Predis has /free-ai-tool/<network>-bio-generator pages for 8 networks, and Buffer has 11 /free-tools/image-resizer/<network> pages plus hashtag generators per network. Postmosis has a single /tools/image-resizer page.
- Glossary size: Later has 281 terms and Buffer 103, while Typefully links 77 from a hub, Taplio has 15 and Postmosis 12.
- Idea and template galleries: Later runs 28 /instagram-captions-ideas/<theme> pages next to 34 /resources/downloadable/ templates, Taplio has 10 /posts/best-linkedin-posts-about-<topic> pages, and Buffer keeps about 183 post prompts on one /templates page.
- "<x> alternative" sets: FeedHive covers 63 competitors with two pages each. Later has 17, Supergrow 12 (11 and its /compare hub) and Taplio 11, against AuthoredUp's 10, Predis's 9 reviews plus 7 compare pages, Buffer's 12 blog posts and our 5.
- Per-network pages: Buffer and Predis have 12 each, Later has 8 schedulers plus 8 Instagram sub-pages, FeedHive has 10 and Typefully 4, while Postmosis has none.
- Data pages built from public posts: Taplio's /influencers/<topic> and /trending/<topic> sets add up to 20 topic pages.
- Claude and MCP pages: Taplio lists 17 /claude-skills/ pages in its sitemap and links 26 from its hub. Predis has 8 /mcp/<x> pages, and FeedHive has /features/claude and /features/claude-code, much like our /features/claude.
- Translations: Buffer translates its site pages into 6 languages and keeps the blog in English. Predis machine-translated about 1,100 pages into each of 52 languages and now returns 410 on them, which makes it the case to avoid.
- llms.txt: Predis (147 lines), FeedHive (54), AuthoredUp (60), Typefully (26) and Postmosis (132) serve one, and Postmosis also serves an 11,703-line llms-full.txt. Typefully's llms-full.txt answers 200 with an HTML page. Taplio's llms.txt is an RTF file, so a crawler reads formatting codes around the text. Buffer's redirects to developers.buffer.com and covers only the API docs, and Later and Supergrow return 404.

## What I could not count, and why

- Predis: 12 language sitemaps (cs, da, nl, fi, no, pl, ro, sv, id, hu, tr, ms) return 410, though those languages still appear in the prune files. The 410 figures come from random samples of 30 URLs per group, so treat them as estimates. The /free-ai-tools/ hub only renders in a browser, so its 51 came from DynamicFetcher.
- Typefully: the 77 glossary terms and 6 AI tools are in no sitemap, so they are counted from hub links only. The /academy hub links no lessons in its HTML.
- Taplio: the sitemap leaves out /linkedin-ai-slop-detector and 9 of the 26 Claude skills. Masterclasses on academy.taplio.com and the Intercom help center were not walked.
- Buffer: template cards have no URLs, so 183 is a count of rendered headings and is approximate. developers.buffer.com and the help center were not walked.
- Later: the template hub also links pages on get.later.com, which were not walked. The blog count holds up against pagination: 76 pages at 9 posts each (later.com/blog/2/) come to about 684, and the sitemap lists 683.
- A sitemap lists what a site asks to have indexed, and the live site can differ from it. Predis shows how far: most of its sitemap returns 410.
- Buckets come from path rules, and I opened 3 URLs in each bucket with 3 or more pages to check its page type (titles are in census.json under spot_check_samples). A few calls could go either way: Typefully's changelog and the Predis /create/ and /use-cases/ maker pages count as product, Taplio's sub-tool pages count as free tools, and Later's /caption-writer/ counts as product because it is an in-app feature.
