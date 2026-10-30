// postmosis.com's SEO north star: the whole SEO plan, card by card, shown at /seo-north-star (Leo's sign-ins only)
// with live counts read from the site's own sitemap and llms.txt (src/data/seoNorthStarCounts.ts). Leo, 30 Oct
// 2026: "btw is there like a seo-north-star, so I can see what is the full ideal comprehensive plan and see the
// progress bar towards that", then "include it for https://postmosis.com/ also, same. marketing and seo
// north-star". Built from a census of eight competitors' sitemaps walked on 30 Oct 2026
// (docs/seo-north-star/research/census.md): Buffer, Later, Taplio, Supergrow, Predis.ai, FeedHive, AuthoredUp and
// Typefully. The site itself is ~/postmosis-site (github.com/leotansingapore/postmosis-site). Specs per card in
// docs/seo-north-star/items/.
//
// This file ships in a public JS chunk and the repo is public: outcomes, public counts and sources only. No
// emails, ids, customer counts or anything from private notes. src/data/northStarBooks.test.ts fails on those shapes.
//
// Keep it current: when a card's work is done, flip its `status` and `ours` line in the same commit as the work
// (the site's commit hash in `ours`). Ids are URL anchors (/seo-north-star#<id>) and spec names; never rename one.

import type { MkAsk, MkOwner, MkStatus } from "@/data/marketingNorthStar";

export type SeoArea = "content" | "programmatic" | "technical" | "ai" | "authority" | "measure";

export interface SeoItem {
  id: string;
  area: SeoArea;
  title: string;
  status: MkStatus;
  /** Build order, see SEO_PHASES. */
  phase: number;
  owner: MkOwner;
  /** What competitors publish, with the census numbers. */
  why: string;
  /** What postmosis.com has today, checked against ~/postmosis-site and the live sitemap on 30 Oct 2026. */
  ours: string;
  /** What to do, specific enough to start without asking. */
  build: string;
  question?: string;
}

const REPO_BLOB = "https://github.com/leotansingapore/content-studio/blob/main";
const CENSUS = "census of eight competitors' sitemaps, 30 Oct 2026";

/** Where the live counts read from. Both answer with Access-Control-Allow-Origin: * (checked 30 Oct 2026). */
export const SEO_SITE = { sitemap: "https://postmosis.com/sitemap.xml", llms: "https://postmosis.com/llms.txt" } as const;

/** The targets the live counts are measured against, each a competitor's number from the census unless named. */
export const SEO_TARGETS = {
  /** Taplio's blog, 227 posts: the largest blog of the solo-first tools (Buffer 2,413 and Predis 1,407 sell wider). */
  guides: 227,
  /** Buffer's 103 /social-media-terms/ pages (Later's 281 terms cover influencer marketing too). */
  glossary: 103,
  /** Taplio's 34 free tool URLs less its /free-tools hub: 19 tools and 14 sub-tool pages (Predis links 51 on its hub). Our count leaves our hub out too. */
  freeTools: 33,
  /** Later's 34 downloadable templates at /resources/downloadable/, the like-for-like set (Taplio's 33 template URLs mix in Claude skills and post galleries, which pm-seo-claude-skills and pm-seo-post-ideas cover). */
  templates: 34,
  /** Supergrow's 12 comparison URLs less its /compare hub, the solo LinkedIn tool nearest our size. Our count leaves our hub out too. */
  compare: 11,
  /** The 31 vault pages the census counted plus the 2 slideshow pages Leo queued on 30 Oct 2026, live in site commit 2b81272. */
  vault: 33,
  /** The hook generator for each of the 6 /for audiences, and the image resizer and character counter for each of
   *  the 6 networks Postmosis posts to (Taplio runs 27 headline generator pages by audience, Buffer 11 resizer pages). */
  toolVariants: 18,
} as const;

export const SEO_AREAS: Record<SeoArea, { label: string; hint: string }> = {
  content: { label: "Content", hint: "Guides, glossary terms, templates and playbooks written for what a solo professional searches." },
  programmatic: { label: "Pages at scale", hint: "One page per tool and audience, per network or per theme, built from data." },
  technical: { label: "Technical", hint: "Indexing, internal links, structured data and speed." },
  ai: { label: "AI search", hint: "Being read and cited by ChatGPT, Perplexity, Claude and Google's AI answers." },
  authority: { label: "Authority", hint: "Being named and linked where a professional reads before choosing a tool." },
  measure: { label: "Measurement", hint: "Knowing which of this earns clicks and walkthroughs." },
};

export const SEO_AREA_ORDER: SeoArea[] = ["content", "programmatic", "technical", "ai", "authority", "measure"];

export const SEO_PHASES: { n: number; title: string; goal: string }[] = [
  { n: 1, title: "Indexed and measured", goal: "Every page postmosis.com lists is in Google, and each week shows which page types earn clicks." },
  { n: 2, title: "The page sets rivals rank with", goal: "Guides, a glossary, tools, templates and comparisons near the size of the solo-first rivals, Taplio and AuthoredUp." },
  { n: 3, title: "Pages from data, at scale", goal: "The Taplio and Buffer move: tool pages per audience and network, idea galleries and network pages, once phase 1 shows Google indexes what we publish." },
  { n: 4, title: "Named and cited", goal: "Postmosis shows up where a solo professional reads before choosing: roundups, directories, Reddit threads and AI answers." },
];

export const SEO_THESIS: string[] = [
  "postmosis.com went live on 29 Oct 2026 with 79 URLs and listed 111 when the census walked it on 30 Oct: 18 guides, 9 free tools, 7 templates, 12 glossary terms, 5 comparisons, 6 audience pages, 9 feature pages and 31 vault playbooks. The eight rivals in the census list from Supergrow's 157 URLs to Predis's 68,179 (1,642 of them in English), and blog posts are two thirds of their English URLs.",
  "We already match or pass the solo-first rivals on audience pages (6, the same as Taplio and Buffer) and on llms.txt with Markdown copies: Supergrow serves no llms.txt, Taplio's is an RTF file, AuthoredUp's links no Markdown copy and Typefully's links 3, against our 33 (fetched 30 Oct 2026). We are behind on blog size (18 guides against Taplio's 227), glossary (12 against Buffer's 103), tools (9 against Taplio's 33, hubs left out) and comparisons (5 against Supergrow's 11). The brief found that none of the six rivals it read edits the video a professional films on a phone, so that gap carries the pages.",
  "So the order is: get every page indexed and measured, grow the page sets rivals rank with, build pages from data only once Google keeps what we publish, then get named where buyers read. Predis is the warning: it machine-translated 58,599 pages and now answers 410 on every one we sampled.",
];

export const SEO_PRINCIPLES: string[] = [
  "A page earns its place by answering one search better than page one does; a page that only swaps a keyword is not built (Google's scaled content abuse policy).",
  "Every page claims only what product-truth.md lists as on for every customer, carries a source for every number, passes aicheck under 15 and brief-check, and links the walkthrough.",
  "Jev decides which topics, terms and rivals make the list; a language model only writes the words.",
  "A card is done when its count reaches its target and the pages are live on postmosis.com, not when the code merges.",
];

export const SEO_ITEMS: SeoItem[] = [
  // Phase 1: indexed and measured (facts first: nothing else can be judged until pages are indexed and counted)
  {
    id: "pm-seo-indexed",
    area: "technical",
    title: "Every page in the sitemap is indexed by Google",
    status: "started",
    phase: 1,
    owner: "Claude",
    why: "A sitemap lists what a site asks to have indexed, not what Google keeps. Predis lists 68,179 URLs and most of the ones sampled answer 410 (" + CENSUS + ").",
    ours: "Search Console's domain property was verified on 29 Oct 2026, and Google last read the sitemap that day at 79 URLs. URL Inspection on all 113 live URLs, 30 Oct: 96 indexed, 15 unknown to Google (all vault pages, 13 of them shipped that day) and 2 discovered but not indexed. ~/.local/bin/postmosis-indexnow-submit.sh sends every sitemap URL to Bing and others, but only when someone runs it. No weekly check runs.",
    build: "A weekly job inspects every sitemap URL with the URL Inspection API (2,000 a day) through the service account that can already read the property, stores the indexed share per section, and runs the IndexNow script when the sitemap grows. Flag any section under 70% indexed.",
  },
  {
    id: "pm-seo-scoreboard",
    area: "measure",
    title: "Each week shows clicks and impressions per page type",
    status: "todo",
    phase: 1,
    owner: "Claude",
    why: "None of the rivals shows its numbers, but every card here is a bet on a page type. Without clicks per type the plan cannot tell which bet pays.",
    ours: "Search Console holds the data from 29 Oct 2026; a Search Analytics read on 30 Oct returned no rows yet. Nothing groups it by section or shows it here.",
    build: "A weekly job reads Search Console for the last 28 days, groups clicks and impressions by the first path segment (guides, tools, templates, glossary, compare, for, features, vault), and posts the table to Leo once a week. Once there are four weeks of data, ask Leo before adding the totals to this page, whose code is public.",
  },
  {
    id: "pm-seo-llms",
    area: "ai",
    title: "Every content page has a Markdown copy listed in llms.txt",
    status: "started",
    phase: 1,
    owner: "Claude",
    why: "Predis, FeedHive, AuthoredUp and Typefully serve an llms.txt; Later and Supergrow answer 404, Buffer's covers only its API and Taplio's is an RTF file (" + CENSUS + ").",
    ours: "postmosis.com serves llms.txt with a section for every page type and llms-full.txt with every vault page and guide in full. Only the 33 vault pages have a Markdown copy at /vault/<slug>.md (src/app/md/vault in the site), 33 of 99 content pages.",
    build: "Extend the Markdown route to guides, glossary terms, templates, tools and comparisons (/guides/<slug>.md and so on), name each copy in its page's alternates, and point llms.txt at the copies. The live count on this page reads llms.txt.",
  },
  {
    id: "pm-seo-internal-links",
    area: "technical",
    title: "Every page links to its siblings and to the feature it sells",
    status: "started",
    phase: 1,
    owner: "Claude",
    why: "Google finds and weighs pages through links. A page no other page links to leans on the sitemap alone, and a domain that went live on 29 Oct 2026 has little else to lean on.",
    ours: "Every section but the glossary has a test for links out to 2 to 4 live siblings (tools 2 or 3), and feature pages link back to every page that points at them (site commit e51e97d). Counted inside <main> on 30 Oct, 109 of 113 pages have 2 or more pages linking in; /vault/funnel-hacking and /vault/tiktok-slideshow-ideas have only the hub. No test counts links in.",
    build: "Add a site test that builds the link graph from the built pages and fails on any indexable page with fewer than 2 internal links pointing at it. Fix what it finds, vault and glossary first.",
  },
  {
    id: "pm-seo-speed",
    area: "technical",
    title: "Every page type passes Core Web Vitals on a phone",
    status: "started",
    phase: 1,
    owner: "Claude",
    why: "Google uses Core Web Vitals among its page experience signals, and our longest pages are heavy: vault playbooks run up to 345 KB of HTML (live fetch, 30 Oct 2026).",
    ours: "The display font was cut from 147 KB to 67 KB (site commit 7afd9b0) and phones download screenshots at the width they are drawn (8688255). No Lighthouse or field numbers are recorded per page type.",
    build: "Run Lighthouse mobile on one page of each type (home, feature, audience, guide, tool, template, glossary, compare, vault) and record the scores in docs. Fix any page under 90 for performance, then add the run to the site's qa script.",
  },
  {
    id: "pm-seo-structured-data",
    area: "technical",
    title: "Every page type carries the structured data that fits it",
    status: "done",
    phase: 1,
    owner: "Claude",
    why: "Rich results need markup: Article for guides, DefinedTerm for glossary terms, WebApplication for tools, FAQPage and BreadcrumbList everywhere they fit.",
    ours: "src/site/seo.ts in the site emits Organization, SoftwareApplication (no offers or ratings, since there are none), FAQPage, BreadcrumbList, Article with Leo as author, ItemList, DefinedTerm and WebApplication.",
    build: "Done. Every new page type ships with its markup and a test.",
  },
  {
    id: "pm-seo-titles",
    area: "technical",
    title: "Every title and description fits the search result",
    status: "done",
    phase: 1,
    owner: "Claude",
    why: "A title over about 60 characters and a description over about 155 get cut in the result, and the cut part is often the brand or the point.",
    ours: "Site commit 01ddb7e fits every title to 60 characters with the brand named once and every description to 155, and the site's guard tests fail on a page past either limit.",
    build: "Done. New pages go through the same guard.",
  },

  // Phase 2: the page sets rivals rank with, ordered by Jev's score (pm-rank, 30 Oct)
  {
    id: "pm-seo-free-tools",
    area: "programmatic",
    title: "A free tool for each small job a professional does before posting",
    status: "started",
    phase: 2,
    owner: "Claude",
    why: "Taplio lists 34 tool pages, Predis 35 (51 on its hub), Buffer 17, FeedHive and AuthoredUp 13 each (" + CENSUS + ").",
    ours: "9 browser tools at /tools/<slug>: character counter, engagement rate, hook generator, image resizer, grid planner, line breaks, LinkedIn formatter, script length calculator and teleprompter. None calls a paid API.",
    build: "List the tools the eight rivals share, keep the ones that run in the browser with no paid call, do a job our 9 tools do not, and lead to a Postmosis feature, and ship them through the tools pipeline, two a wave. Per-network copies belong to pm-seo-tool-variants.",
    question: "Any tool that needs an AI call costs money per use. Keep tools free of AI calls?",
  },
  {
    id: "pm-seo-templates",
    area: "content",
    title: "A template for every recurring post a professional makes",
    status: "started",
    phase: 2,
    owner: "Claude",
    why: "Later has 65 template pages and Taplio 33, plus 9 Claude skills; Buffer keeps about 183 post prompts on one page (" + CENSUS + ").",
    ours: "7 templates at /templates/<slug> with Copy, Print and CSV download (TemplateKit in the site). The content calendar's CSV uses only columns Postmosis's CSV import reads or skips (tests/templates.test.ts).",
    build: "Take Later's and Taplio's template topics, keep the ones our reader posts (client story, market update, myth-bust, testimonial ask, weekly plan), and write them through the templates pipeline. Every template opens in the matching Postmosis feature.",
  },
  {
    id: "pm-seo-compare",
    area: "programmatic",
    title: "A comparison page for each tool a solo professional weighs us against",
    status: "started",
    phase: 2,
    owner: "Claude",
    why: "Supergrow runs 12 comparison pages, Taplio 11, AuthoredUp 10 and Later 17; FeedHive runs 126, an alternatives page and a vs page for each of 63 rivals (" + CENSUS + ").",
    ours: "5 pages at /compare: a schedulers roundup and Buffer, Hootsuite, Later and Metricool alternatives, each row carrying a quoted source (site tests/compare.test.ts). On 28 Oct the build plan folded Taplio (30 US searches a month), Supergrow, AuthoredUp and Kleo (10 each) into /features/ai-post-writer, whose FAQ answers Taplio and Supergrow only; it parked FeedHive for demand and Predis.ai as an ad maker, and parked CapCut (1,900 US searches a month) and Canva as a reader who signs up alone.",
    build: "Reopen CapCut if Leo agrees, framed for a professional who films a talking head on a phone. Each quarter, re-read demand for the folded and parked rivals and give one its own page once its phrases pass 100 a month, with the same sourced-row method. One page per rival, never a vs and an alternatives twin.",
    question: "Reopen a CapCut alternative page, framed for a professional who films on a phone?",
  },
  {
    id: "pm-seo-guides",
    area: "content",
    title: "Every question our reader searches has a guide",
    status: "started",
    phase: 2,
    owner: "Claude",
    why: "Taplio's blog has 227 posts, AuthoredUp's 164, Supergrow's 99 and Typefully's 76; Buffer runs 2,413 and Predis 1,407 for a wider reader (" + CENSUS + ").",
    ours: "18 guides live at /guides/<slug> (copy pipeline in ~/Documents/Postmosis/copy/_guides/scripts, content in src/content/guides.ts of the site). Every number carries a dated source (tests/guides.test.ts). The build plan's 18 guide picks are all shipped; 10 more were parked with reasons in research/plan/plan.json.",
    build: "Pull the blog URLs of Taplio, AuthoredUp, Buffer and Later from census.json, cluster them by topic, drop topics a guide or vault page already answers, and have Jev keep the ones a solo professional asks. Read volumes from keywords.csv first and DataForSEO only for the gaps (state the cost). Ship in waves of 10 through the guides pipeline.",
  },
  {
    id: "pm-seo-glossary",
    area: "content",
    title: "The glossary defines every term a professional meets when posting",
    status: "started",
    phase: 2,
    owner: "Claude",
    why: "Later defines 281 terms and Buffer 103; Typefully links 77 from a hub (54 of them the same slugs as Buffer's) and Taplio 15 (" + CENSUS + ").",
    ours: "12 terms at /glossary/<slug> (src/content/glossary.ts in the site), each with a DefinedTerm node. The build plan parked 20 terms with reasons, mostly a reader who is not ours (research/plan/plan.json).",
    build: "Merge Buffer's and Later's term lists from their sitemaps, drop terms we have or parked, keep the ones Jev says our reader meets (posting, video, captions, LinkedIn, Instagram), and write them in waves of 15 with each fact from the platform's own help pages.",
  },
  {
    id: "pm-seo-refresh",
    area: "content",
    title: "Every guide is re-checked against page one each quarter",
    status: "todo",
    phase: 2,
    owner: "Claude",
    why: "Platform numbers move: Instagram's help centre now says 5 hashtags a post while its API still says 30. A guide with the old number loses the click.",
    ours: "Each guide and vault page carries dated sources (copy/_guides/scripts/facts.py re-checks quotes against saved pages). Nothing re-runs the check on a schedule.",
    build: "Each quarter, re-fetch every cited source, re-run facts.py, and have Jev compare each guide with the live top three. Rewrite the sections that lose, bump dateModified, and resubmit through IndexNow.",
  },
  {
    id: "pm-seo-vault",
    area: "content",
    title: "The vault holds every playbook on Leo's queue",
    status: "done",
    phase: 2,
    owner: "Claude",
    why: "Later's academy and guide library is 146 pages, the only rival with a library of long playbooks (" + CENSUS + ").",
    ours: "33 vault playbooks at /vault/<slug>, each with a Markdown copy and a credit line (site commits 660b4e5, d33ad56, 6b3844d, 2b81272). Both slideshow pages from Leo's queue of 30 Oct shipped in 2b81272, and the queue holds no new playbook.",
    build: "Done. Raise SEO_TARGETS.vault by one for each new playbook Leo queues, and ship it through the vault pipeline (copy/_vault).",
  },
  {
    id: "pm-seo-audiences",
    area: "content",
    title: "An audience page for every profession that searches for help",
    status: "done",
    phase: 2,
    owner: "Claude",
    why: "Later runs 19 audience pages, Buffer and Taplio 6 each, Predis 4 (" + CENSUS + ").",
    ours: "6 pages at /for: real estate agents, coaches, consultants, freelancers, lawyers and financial advisers. Recruiters, founders, accountants, therapists and mortgage brokers were parked for low demand or a different reader (research/plan/plan.json).",
    build: "Done. Reopen a parked audience only when its phrases pass 300 searches a month.",
  },

  // Phase 3: pages from data, ordered by Jev's score
  {
    id: "pm-seo-tool-variants",
    area: "programmatic",
    title: "Tool pages for each audience and each network",
    status: "todo",
    phase: 3,
    owner: "Claude",
    why: "Taplio runs 27 /linkedin-headline-generator/<audience> pages (coaches, consultants, real estate agents among them), Buffer 11 /free-tools/image-resizer/<network> pages and Predis bio generators for 8 networks (" + CENSUS + ").",
    ours: "One page per tool. The hook generator already takes what you do and who you help, so audience pages need presets only. The image resizer holds Instagram's four shapes, a 9:16 Story and the LinkedIn link image, and the character counter has no Facebook limit (none is on an official page), so network pages need new sourced presets.",
    build: "Add /tools/hook-generator/<audience> for the 6 /for audiences, and /tools/image-resizer/<network> and /tools/character-counter/<network> for the 6 networks, each with its own intro, preset and FAQ from the network's help pages. 18 pages; each must read as its own answer, not a swapped word.",
  },
  {
    id: "pm-seo-networks",
    area: "programmatic",
    title: "A page for each network Postmosis posts to",
    status: "todo",
    phase: 3,
    owner: "Claude",
    why: "Buffer and Predis run 12 network pages each, FeedHive 10 /socials/<network> pages, Later 8 /<network>-scheduler/ pages and Typefully 4 (" + CENSUS + ").",
    ours: "None. /features/scheduling covers posting in general. llms.txt says six networks, and the comparison pages name them: Instagram, Facebook, TikTok, LinkedIn, YouTube and Threads, not X.",
    build: "One page per network: what Postmosis makes for it (sizes, captions, carousels or video), how posting to it works, its limits from the network's own help pages, and the tools and guides for it. Check each claim against product-truth.md first.",
  },
  {
    id: "pm-seo-claude-skills",
    area: "ai",
    title: "Open Claude skills for a professional's week of posts",
    status: "todo",
    phase: 3,
    owner: "Claude",
    why: "Taplio lists 17 /claude-skills/ pages and links 26 from its hub; Predis has 8 /mcp/ pages and FeedHive /features/claude (" + CENSUS + ").",
    ours: "/features/claude explains Connect Claude. The vault pages carry copyable prompt blocks. No page per skill.",
    build: "Publish a /claude-skills hub with one page per skill (plan my week, turn a client question into a carousel, script a talking head, check a LinkedIn post), each a downloadable SKILL.md with a Markdown copy, ungated like the vault.",
  },
  {
    id: "pm-seo-creator-breakdowns",
    area: "programmatic",
    title: "A breakdown of the top accounts in each profession",
    status: "todo",
    phase: 3,
    owner: "Claude",
    why: "Taplio runs 13 /influencers/<topic> lists and 7 /trending/<topic> pages built from public posts (" + CENSUS + ").",
    ours: "6 creator breakdown pages in the vault (Hormozi, Dan Martell, Kallaway, Mino Lee, Sharran Srivatsaa, Shelby Sapp), measured on their public plays and counted in pm-seo-vault. None is grouped by profession, so no page of this card exists yet.",
    build: "For each /for audience, pick 5 public accounts that post well, measure their last 30 posts' formats and hooks, and publish one breakdown page per profession that links each account. Methods only, never their numbers presented as ours.",
  },
  {
    id: "pm-seo-post-ideas",
    area: "programmatic",
    title: "A page of post ideas for each profession and month",
    status: "todo",
    phase: 3,
    owner: "Claude",
    why: "Later runs 28 /instagram-captions-ideas/<theme> pages and Taplio 10 best-posts galleries by topic (" + CENSUS + "); idea lists also hold page one for 'real estate social media' (the brief).",
    ours: "The /for pages carry one example week each, two templates hold post ideas (Instagram and LinkedIn), and the vault has four idea pages (content ideas, TikTok video ideas, LinkedIn post ideas, TikTok slideshow ideas). Nothing is per profession and month.",
    build: "Build /ideas/<audience> with 12 monthly sections first (6 pages), each idea in the profession's words with a hook and a format. Split into monthly pages only if Search Console shows month searches.",
  },

  // Phase 4: named and cited, ordered by Jev's score
  {
    id: "pm-seo-reddit",
    area: "authority",
    title: "Leo answers the Reddit threads that rank for our reader's questions",
    status: "todo",
    phase: 4,
    owner: "Leo",
    why: "Reddit threads hold page one for our reader's searches, for example 'Is there a free alternative like capcut??' and 'Good auditing tool for IG accounts?' (the brief).",
    ours: "None.",
    build: "Claude lists the threads on page one for our top 50 phrases each month. Leo answers the ones he can help with by hand, in his own words, naming Postmosis only where it answers the question. No automation.",
  },
  {
    id: "pm-seo-roundup-links",
    area: "authority",
    title: "Postmosis is in the roundups a professional reads",
    status: "todo",
    phase: 4,
    owner: "Leo",
    why: "Page one for 'social media scheduler' and 'link in bio tool' is roundups, and for 'real estate social media' tip and idea lists (keywords.md, page one read 28 Oct). A line in a list that already ranks sends readers and a link.",
    ours: "None.",
    build: "Claude lists the 30 roundups ranking for our audience phrases and the author of each. Leo writes to at most 10 a week from his own address with one line on the phone-video gap, and never chases a non-reply.",
    question: "Write to roundup authors, at most 10 a week, no follow-ups?",
  },
  {
    id: "pm-seo-directories",
    area: "authority",
    title: "Postmosis is listed in the free directories buyers browse",
    status: "todo",
    phase: 4,
    owner: "Leo + Claude",
    why: "Listings bring the first links to a new domain. The rivals sit in software directories and app marketplaces (teardown, docs/marketing-north-star/postmosis/research/teardown.md).",
    ours: "None. The site went live on 29 Oct 2026, and the teardown of 30 Oct found no directory listings.",
    build: "Claude drafts one listing text and a list of 20 free directories for AI and social media tools with their rules. Leo submits from his own accounts, no paid placements.",
    question: "Submit to free directories under your name?",
  },
  {
    id: "pm-seo-ai-citations",
    area: "ai",
    title: "Postmosis is named in AI answers to our reader's questions",
    status: "todo",
    phase: 4,
    owner: "Claude",
    why: "Predis, FeedHive, AuthoredUp and Typefully publish llms.txt to be read by AI tools (" + CENSUS + "), and none publishes whether AI answers name it.",
    ours: "llms.txt and llms-full.txt are live. Nothing checks whether any AI answer names Postmosis.",
    build: "Each month, ask 30 fixed questions (best tool to edit a talking head on a phone, content calendar for a coach, and so on) in ChatGPT, Perplexity and Gemini, record whether Postmosis is named and which pages are cited, and show the share here.",
    question: "The Perplexity and Gemini passes call paid APIs, guessed at USD 1 to 3 a month and not yet priced. Run them once the cost is measured?",
  },
];

export const SEO_ASKS: MkAsk[] = [
  {
    id: "ask-seo-ns",
    date: "30 Oct 2026",
    text: "btw is there like a seo-north-star, so I can see what is the full ideal comprehensive plan and see the progress bar towards that",
    short: "The whole SEO plan with progress bars",
    items: ["pm-seo-indexed", "pm-seo-scoreboard", "pm-seo-guides", "pm-seo-glossary", "pm-seo-free-tools", "pm-seo-templates", "pm-seo-compare", "pm-seo-tool-variants"],
  },
  {
    id: "ask-postmosis",
    date: "30 Oct 2026",
    text: "include it for https://postmosis.com/ also, same. marketing and seo north-star",
    short: "One for postmosis.com",
    items: ["pm-seo-llms", "pm-seo-vault", "pm-seo-networks", "pm-seo-ai-citations"],
  },
];

export const SEO_DECISIONS: { id: string; question: string; recommendation: string; decided?: string; items: string[] }[] = [
  {
    id: "dec-seo-capcut",
    question: "Reopen a CapCut alternative page, parked on 28 Oct?",
    recommendation: "Yes, CapCut only, framed for a professional who films a talking head on a phone; Canva stays parked.",
    items: ["pm-seo-compare"],
  },
  {
    id: "dec-seo-ai-tools",
    question: "Allow free tools that call an AI model?",
    recommendation: "No for now. Ship browser-only tools first; one AI tool later with a daily cap, once the scoreboard shows tools earn clicks.",
    items: ["pm-seo-free-tools"],
  },
  {
    id: "dec-seo-ai-check",
    question: "Pay for the Perplexity and Gemini passes of a monthly AI answer check, guessed at USD 1 to 3 a month until measured?",
    recommendation: "Yes, capped at USD 3 a month, from phase 4.",
    items: ["pm-seo-ai-citations"],
  },
  {
    id: "dec-seo-outreach",
    question: "Submit to directories and write to roundup authors under your name?",
    recommendation: "Yes, free directories only, and at most 10 roundup messages a week with no follow-up chase.",
    items: ["pm-seo-directories", "pm-seo-roundup-links"],
  },
];

export const SEO_SKIP: { what: string; why: string }[] = [
  { what: "Machine-translated copies of the site", why: "Predis machine-translated 58,599 pages into 52 languages and every one sampled now answers 410; our markets are the US and Singapore, in English (the brief)." },
  { what: "A vs page and an alternatives page for every rival", why: "FeedHive runs 126 pages for 63 rivals, an alternatives roundup and a vs page for each (" + CENSUS + "; feedhive.com read the same day). Two of our pages aimed at one rival's searches would compete with each other." },
  { what: "Tool variants by occasion and niche at Predis's scale", why: "Predis's robots.txt now blocks 1,442 /free-ai-tools/ variant pages it built. We build a variant only where the answer changes." },
  { what: "Comparisons with tools for social teams and agencies", why: "Sprout Social, Loomly and Agorapulse sell to teams with shared inboxes, seats and client approvals, the brief's anti-persona; the plan parked them on 28 Oct." },
  { what: "A changelog as search pages", why: "Typefully's 118 changelog pages answer no search our reader types." },
];

export const SEO_SOURCES: { label: string; url: string }[] = [
  { label: "Census of eight competitors' sitemaps, 30 Oct 2026", url: `${REPO_BLOB}/docs/seo-north-star/research/census.md` },
  { label: "What Leo asked for", url: `${REPO_BLOB}/docs/seo-north-star/leo.md` },
  { label: "postmosis.com's sitemap, which the live counts read", url: SEO_SITE.sitemap },
  { label: "The marketing north star for postmosis.com", url: "https://app.postmosis.com/marketing-north-star/postmosis" },
];

export const seoSpecUrl = (id: string) => `${REPO_BLOB}/docs/seo-north-star/items/${id}.md`;

/** What a Claude session needs to do one card, pasted as its first message. */
export const seoBuildPrompt = (i: { id: string; title: string }) =>
  [
    `Do postmosis.com SEO card "${i.title}" (${i.id}).`,
    `1. In content-studio (github.com/leotansingapore/content-studio), read docs/seo-north-star/README.md, docs/seo-north-star/items/${i.id}.md and docs/seo-north-star/research/census.md. The site is ~/postmosis-site; obey its CLAUDE.md and the vault rules in ~/Documents/Postmosis (product-truth.md, product-marketing.md).`,
    "2. Fetch origin/main in both repos and check \"What we have today\" against them before changing anything.",
    "3. Stop and ask Leo before spending money, posting publicly, messaging anyone, a schema change or an auth change.",
    "4. Meet every line under \"Done when\".",
    "5. Then set the card's status and ours line in src/data/seoNorthStar.ts in content-studio and the spec's Status line, run its tests, git pull --rebase origin main, and push.",
  ].join("\n");
