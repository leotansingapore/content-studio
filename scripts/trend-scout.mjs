// Trend scout — the daily "what's actually going viral" drop for /trends.
//
// Sources real, high-engagement TikTok and Instagram posts (reels + carousels)
// via Apify, ranks them by ACTUAL engagement (likes + comments + shares/saves)
// so a post can surface on its numbers regardless of the creator's follower
// count, then asks Claude to turn each proven-viral post into a piece a
// Singapore AIA financial consultant can publish today — hooks, talking points,
// CTA. Writes src/data/trends.json, which the /trends page renders.
//
// Why scrape instead of web search: logged-out web search returns *articles
// about* trends, never a verifiable viral permalink with real metrics. The
// scraper provides the real URL and engagement numbers; Claude never supplies a
// URL, so a fabricated source is structurally impossible.
//
// Runs in CI (see .github/workflows/trend-scout.yml). Locally:
//   APIFY_TOKEN=apify_... ANTHROPIC_API_KEY=sk-ant-... node scripts/trend-scout.mjs
//
// Env:
//   APIFY_TOKEN        (required) Apify API token — pays for the scrape
//   ANTHROPIC_API_KEY  (required) Anthropic API key — writes the content kits
//   TREND_COUNT        (optional) target number of trends, default 24
//   TREND_MIN          (optional) minimum valid trends or the run fails without
//                      writing, default 12 (never overwrite a good drop)
//   TREND_MODEL        (optional) model id, default claude-opus-4-8
//   TREND_MIN_ENGAGEMENT (optional) minimum (likes+comments) for a post to count
//                      as viral enough to consider, default 3000
//   APIFY_IG_ACTOR / APIFY_TIKTOK_ACTOR (optional) override the Apify actors
//   IG_HASHTAGS / TIKTOK_HASHTAGS (optional) comma-separated hashtag overrides
//
// Design notes:
// - normalizeIgItem / normalizeTiktokItem / rankPosts / finalizeTrends are pure
//   and exported so the selection + validation logic is unit-testable without
//   spending Apify or Anthropic quota.
// - A run that produces fewer than TREND_MIN valid trends exits non-zero and
//   does NOT write the file — a bad run must never wipe the last good drop.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @anthropic-ai/sdk is imported lazily inside writeKits() so the pure,
// exported selection/validation functions can be unit-tested without the SDK
// (or a network) present.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "src/data/trends.json");

// Mirrors src/lib/trends.ts. Kept here (not imported) so the scout has no build
// dependency on the app's TypeScript.
export const PLATFORMS = ["linkedin", "instagram", "facebook", "tiktok"];
export const FORMATS = ["text-post", "carousel", "short-video", "story"];
export const PILLARS = ["interest", "identity", "topic", "market"];
export const TREND_TYPES = [
  "meme",
  "news",
  "current-affairs",
  "event",
  "culture",
  "sport",
];
export const CTA_TYPES = [
  "dm-keyword",
  "comment-keyword",
  "save-share",
  "book-call",
  "open-question",
];

// Finance / money hashtags where genuinely viral SG-relevant content lives.
// Small accounts surface here on engagement, which is exactly what we want.
const DEFAULT_IG_HASHTAGS = [
  "fintok",
  "personalfinance",
  "moneytok",
  "financialliteracy",
  "moneytips",
  "sgfinance",
  "moneysg",
  "investingsg",
];
const DEFAULT_TIKTOK_HASHTAGS = [
  "fintok",
  "loudbudgeting",
  "moneytok",
  "personalfinance",
  "financialliteracy",
  "moneytips",
  "sgfinance",
  "investing101",
];

const IG_ACTOR = process.env.APIFY_IG_ACTOR || "apify~instagram-scraper";
const TIKTOK_ACTOR =
  process.env.APIFY_TIKTOK_ACTOR || "clockworks~tiktok-scraper";

function csvEnv(name, fallback) {
  const raw = (process.env[name] || "").trim();
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((s) => s.trim().replace(/^#/, ""))
    .filter(Boolean);
}

/** Run an Apify actor synchronously and return its dataset items. */
async function runActor(actor, input, token) {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(
    token,
  )}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apify ${actor} failed (${res.status}) ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : data.items ?? [];
}

/** Map an Instagram scraper item to the common viral-post shape (or null). */
export function normalizeIgItem(p) {
  if (!p || p.error) return null;
  const shortCode = p.shortCode || p.shortcode;
  const url = p.url || (shortCode ? `https://www.instagram.com/p/${shortCode}/` : null);
  if (!url) return null;
  const type = String(p.type || "").toLowerCase();
  const format =
    type.includes("video") || type.includes("clip")
      ? "short-video"
      : "carousel"; // Sidecar (multi-image) and single Image both map to carousel
  const likes = Number(p.likesCount) || 0;
  const comments = Number(p.commentsCount) || 0;
  const views = Number(p.videoViewCount || p.videoPlayCount) || 0;
  return {
    platform: "instagram",
    format,
    url,
    author: p.ownerUsername ? `@${p.ownerUsername}` : "",
    caption: (p.caption || "").replace(/\s+/g, " ").trim().slice(0, 600),
    likes,
    comments,
    shares: 0, // Instagram does not expose share/save counts publicly
    views,
    timestamp: p.timestamp || null,
  };
}

/** Map a TikTok scraper item to the common viral-post shape (or null). */
export function normalizeTiktokItem(p) {
  if (!p) return null;
  const url = p.webVideoUrl || p.videoUrl || p.postPage || p.url;
  if (!url) return null;
  const author =
    p.authorMeta?.name ||
    p.authorMeta?.nickName ||
    p.authorName ||
    p.author ||
    "";
  return {
    platform: "tiktok",
    format: "short-video",
    url,
    author: author ? `@${String(author).replace(/^@/, "")}` : "",
    caption: (p.text || p.desc || "").replace(/\s+/g, " ").trim().slice(0, 600),
    likes: Number(p.diggCount ?? p.likes) || 0,
    comments: Number(p.commentCount ?? p.comments) || 0,
    shares: Number(p.shareCount ?? p.shares) || 0,
    views: Number(p.playCount ?? p.views) || 0,
    timestamp: p.createTimeISO || p.createTime || null,
  };
}

// Comments and shares weighted above likes: they're the stronger "this is
// genuinely useful / worth passing on" signals of real virality.
export function engagementScore(post) {
  return (post.likes || 0) + (post.comments || 0) * 3 + (post.shares || 0) * 5;
}

/**
 * Dedupe by URL, drop posts below the engagement floor, sort by engagement,
 * and cap how many come from any single author so one creator can't dominate
 * the drop. Ranks purely on engagement, so a small account that went viral
 * competes head-to-head with a big one.
 */
export function rankPosts(posts, { minEngagement = 3000, perAuthorCap = 2 } = {}) {
  const seen = new Set();
  const deduped = [];
  for (const p of posts) {
    if (!p || !p.url) continue;
    const key = p.url.split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    if ((p.likes || 0) + (p.comments || 0) < minEngagement) continue;
    deduped.push(p);
  }
  deduped.sort((a, b) => engagementScore(b) - engagementScore(a));
  const perAuthor = {};
  const capped = [];
  for (const p of deduped) {
    const a = p.author || "?";
    perAuthor[a] = (perAuthor[a] || 0) + 1;
    if (perAuthor[a] > perAuthorCap) continue;
    capped.push(p);
  }
  return capped;
}

function fmtNum(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

const SYSTEM = `You are a social-media strategist for Singapore-based AIA financial consultants. You are given real posts that are ALREADY going viral (with their real engagement numbers), and you turn a proven-viral post into a piece of content a financial advisor can publish today.

The engagement is the proof the format works — you build only on the posts given to you. Never force a connection: only ride a post where the bridge to a money / protection / planning idea is honest and earns attention rather than hijacking it. If a post has no honest money angle, skip it. Keep everything appropriate for a licensed financial advisor in Singapore: no product guarantees, no misleading or fear-mongering claims, no market-timing or specific investment calls, politically neutral, and memes must punch up or be self-deprecating — never mock anyone.`;

export function buildKitPrompt(posts, count, today) {
  const lines = posts.map((p, i) => {
    const metrics = [
      `${fmtNum(p.likes)} likes`,
      `${fmtNum(p.comments)} comments`,
      p.shares ? `${fmtNum(p.shares)} shares` : null,
      p.views ? `${fmtNum(p.views)} views` : null,
    ]
      .filter(Boolean)
      .join(", ");
    return `[${i}] ${p.platform} ${p.format} by ${p.author || "unknown"} — ${metrics}\nCaption: ${p.caption || "(no caption)"}`;
  });

  return `Today is ${today} (Singapore time). Below are ${posts.length} posts that are genuinely going viral right now on TikTok and Instagram, each with its real engagement. They are pre-sorted by engagement.

For each post that a Singapore financial consultant can HONESTLY ride, write one piece of content. Pick the best ${count} (skip any without a genuine money / protection / planning angle — do not force it). Aim for a spread across trend types and pillars.

POSTS:
${lines.join("\n\n")}

Return ONLY a JSON array (no prose before or after). Each object references one post by its index and adds the content kit:

- "index": the [n] of the post this is based on (integer)
- "pillar": one of "interest" | "identity" | "topic" | "market"
- "trend_type": one of "meme" | "news" | "current-affairs" | "event" | "culture" | "sport"
- "trend_source": 1-2 sentences describing what the viral post is and the traction that proves it works (reference the real numbers you were given)
- "title": the advisor's content idea in one punchy line
- "hooks": array of 2-3 ready-to-use opening lines; the first must stop the scroll on its own, first person, under 25 words, no [brackets]
- "talking_points": array of 3-4 short concrete points the advisor should make, in order
- "cta": one strong closing call to action, written as a usable line
- "cta_type": one of "dm-keyword" | "comment-keyword" | "save-share" | "book-call" | "open-question" (match your cta)
- "why_it_works": 1-2 sentences on why riding this proven-viral post earns attention honestly
- "how_to_film": concrete delivery notes for this post's format (framing, first line, pacing)

Rules:
- Do NOT include a URL, platform, or format — those come from the real post via its index.
- Only reference indexes that exist in the list above.
- Keep it Singapore-relevant (SG angle, SGD, CPF/SRS/insurance where the bridge is honest).
- Skip posts with no honest money angle rather than stretching. Quality over hitting ${count}.
- Output the JSON array and nothing else.`;
}

/**
 * Pull the JSON array out of the model's message. Prefers a fenced block;
 * falls back to the outermost [ ... ]. Throws if neither parses.
 */
export function extractKitArray(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [];
  if (fenced) candidates.push(fenced[1]);
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // try next candidate
    }
  }
  throw new Error("no parseable JSON array found in model output");
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function cleanStringList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((s) => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim());
}

const REQUIRED_KIT_STRINGS = [
  "title",
  "trend_source",
  "why_it_works",
  "how_to_film",
];

/**
 * Merge Claude's kits with the real scraped posts (matched by index). The URL
 * and engagement always come from the real post — Claude never supplies them.
 * Drops anything malformed or pointing at a non-existent index. Returns the
 * clean TrendEntry list (may be shorter than `kits`).
 */
export function finalizeTrends(kits, posts, today, count = 24) {
  if (!Array.isArray(kits)) return [];
  const seenSlugs = new Set();
  const usedIndexes = new Set();
  const out = [];

  for (const k of kits) {
    if (!k || typeof k !== "object") continue;
    const idx = Number(k.index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= posts.length) continue;
    if (usedIndexes.has(idx)) continue; // one kit per real post
    const post = posts[idx];

    if (!PILLARS.includes(k.pillar)) continue;
    if (!CTA_TYPES.includes(k.cta_type)) continue;
    if (!TREND_TYPES.includes(k.trend_type)) continue;
    if (
      !REQUIRED_KIT_STRINGS.every(
        (f) => typeof k[f] === "string" && k[f].trim().length > 0,
      )
    )
      continue;
    if (typeof k.cta !== "string" || !k.cta.trim()) continue;

    const hooks = cleanStringList(k.hooks);
    const points = cleanStringList(k.talking_points);
    if (hooks.length < 2 || points.length < 3) continue;

    const title = k.title.trim();
    const slug = slugify(title) || `trend-${out.length + 1}`;
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    usedIndexes.add(idx);

    const label =
      post.platform === "tiktok"
        ? `TikTok · ${post.author || "viral video"}`
        : `Instagram · ${post.author || "viral post"}`;

    out.push({
      id: `trend-${today}-${slug}`,
      platform: post.platform,
      format: post.format,
      pillar: k.pillar,
      trend_type: k.trend_type,
      trend_source: k.trend_source.trim(),
      title,
      hooks: hooks.slice(0, 4),
      talking_points: points.slice(0, 5),
      cta: k.cta.trim(),
      cta_type: k.cta_type,
      why_it_works: k.why_it_works.trim(),
      how_to_film: k.how_to_film.trim(),
      source_label: label,
      source_url: post.url,
      author: post.author || "",
      likes: post.likes || 0,
      comments: post.comments || 0,
      shares: post.shares || 0,
      views: post.views || 0,
      observed_at: today,
      date_found: today,
    });
    if (out.length >= count) break;
  }
  return out;
}

/** SGT (UTC+8) calendar date, so "Last drop <date>" reads right for SG users. */
export function singaporeDate(now = new Date()) {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
}

async function scrapeAll(token, { igLimit, tiktokLimit }) {
  const igHashtags = csvEnv("IG_HASHTAGS", DEFAULT_IG_HASHTAGS);
  const tiktokHashtags = csvEnv("TIKTOK_HASHTAGS", DEFAULT_TIKTOK_HASHTAGS);

  // Curated SG finance creators — their recent posts join the hashtag pool.
  let creatorUrls = [];
  try {
    const advisors = JSON.parse(
      fs.readFileSync(path.join(ROOT, "src/data/advisors.json"), "utf8"),
    );
    creatorUrls = advisors
      .filter((a) => a.platform === "instagram" && a.platform_url)
      .map((a) => a.platform_url)
      .slice(0, 30);
  } catch {
    // advisors file optional
  }

  const jobs = [
    {
      label: "IG hashtags",
      run: () =>
        runActor(
          IG_ACTOR,
          { hashtags: igHashtags, resultsType: "posts", resultsLimit: igLimit },
          token,
        ),
      norm: normalizeIgItem,
    },
    {
      label: "IG creators",
      run: () =>
        creatorUrls.length
          ? runActor(
              IG_ACTOR,
              { directUrls: creatorUrls, resultsType: "posts", resultsLimit: 4 },
              token,
            )
          : Promise.resolve([]),
      norm: normalizeIgItem,
    },
    {
      label: "TikTok hashtags",
      run: () =>
        runActor(
          TIKTOK_ACTOR,
          { hashtags: tiktokHashtags, resultsPerPage: tiktokLimit },
          token,
        ),
      norm: normalizeTiktokItem,
    },
  ];

  const pool = [];
  for (const job of jobs) {
    try {
      const items = await job.run();
      const normed = items.map(job.norm).filter(Boolean);
      console.log(`  ${job.label}: ${items.length} raw -> ${normed.length} usable`);
      pool.push(...normed);
    } catch (err) {
      console.warn(`  ${job.label} failed: ${err.message}`);
    }
  }
  return pool;
}

async function writeKits({ apiKey, model, posts, count, today }) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    system: SYSTEM,
    messages: [{ role: "user", content: buildKitPrompt(posts, count, today) }],
  });
  if (msg.stop_reason === "refusal") {
    throw new Error(
      `model refused: ${msg.stop_details?.explanation ?? "no explanation"}`,
    );
  }
  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return extractKitArray(text);
}

async function main() {
  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) {
    console.error("APIFY_TOKEN is not set — cannot scrape viral posts.");
    process.exit(1);
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set — cannot write content kits.");
    process.exit(1);
  }
  const count = Number(process.env.TREND_COUNT || 24);
  const min = Number(process.env.TREND_MIN || 12);
  const minEngagement = Number(process.env.TREND_MIN_ENGAGEMENT || 3000);
  const model = process.env.TREND_MODEL || "claude-opus-4-8";
  const today = singaporeDate();

  console.log(`Trend scout: model=${model} target=${count} min=${min} date=${today}`);
  console.log("Scraping viral posts via Apify...");
  const pool = await scrapeAll(apifyToken, { igLimit: 40, tiktokLimit: 40 });
  console.log(`Scraped ${pool.length} posts total.`);

  const ranked = rankPosts(pool, { minEngagement });
  console.log(`${ranked.length} posts above engagement floor (${minEngagement}).`);
  // Send Claude a generous candidate pool so it can be selective.
  const candidates = ranked.slice(0, Math.max(count * 2, 40));
  if (candidates.length < min) {
    console.error(
      `Only ${candidates.length} viral posts found (< ${min}); refusing to overwrite the last good drop.`,
    );
    process.exit(1);
  }

  const kits = await writeKits({ apiKey, model, posts: candidates, count, today });
  const trends = finalizeTrends(kits, candidates, today, count);
  console.log(`Claude wrote ${kits.length} kits -> ${trends.length} valid trends.`);

  if (trends.length < min) {
    console.error(
      `Only ${trends.length} valid trends (< ${min}); refusing to overwrite the last good drop.`,
    );
    process.exit(1);
  }

  fs.writeFileSync(OUT, JSON.stringify(trends, null, 2) + "\n");
  const platforms = [...new Set(trends.map((t) => t.platform))];
  const types = [...new Set(trends.map((t) => t.trend_type))];
  console.log(
    `Wrote ${trends.length} trends to src/data/trends.json — platforms: ${platforms.join(", ")}; types: ${types.join(", ")}.`,
  );
}

// Only run the API path when executed directly, so tests can import the pure
// functions above without any token.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error("Trend scout failed:", err?.message ?? err);
    process.exit(1);
  });
}
