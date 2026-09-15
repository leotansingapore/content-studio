// Trend scout: the daily "what's actually going viral" drop for /trends.
//
// Finds real finance videos doing well right now, pulls what each one actually
// says, and asks Claude to turn the best of them into content a Singapore AIA
// financial consultant can post today (hooks, talking points, CTA). Writes
// src/data/trends.json, which the /trends page renders.
//
// Sources, all via Apify:
//   - TikTok: finance hashtags, ranked by real engagement.
//   - Instagram: recent reels from known finance creators (the SG creators in
//     src/data/advisors.json plus a few large global accounts), ranked by how
//     far each reel beat that creator's own median views. Instagram hashtag
//     feeds only return brand-new, low-engagement posts, so they aren't used.
//   - Transcripts for the shortlist: TikTok's own subtitles (speech-to-text when
//     a video has none) and the Instagram reel scraper's transcript add-on.
//
// Claude never supplies a URL or a number: those come from the scraped post,
// matched by index, so a fabricated source is structurally impossible.
//
// Runs in CI (see .github/workflows/trend-scout.yml). Locally:
//   APIFY_TOKEN=apify_... ANTHROPIC_API_KEY=sk-ant-... node scripts/trend-scout.mjs
//
// Env:
//   APIFY_TOKEN          (required) pays for the scrape and transcripts
//   ANTHROPIC_API_KEY    (required) writes the content kits
//   TREND_COUNT          (optional) target number of trends, default 12
//   TREND_MIN            (optional) minimum valid trends or the run fails
//                        without writing, default 8 (never overwrite a good drop)
//   TREND_MODEL          (optional) model id, default claude-opus-4-8
//   TREND_MIN_ENGAGEMENT (optional) TikTok floor on likes + comments, default 1000
//   TREND_MAX_AGE_DAYS   (optional) ignore videos older than this, default 14
//   TIKTOK_HASHTAGS      (optional) comma-separated hashtag override
//   IG_CREATORS          (optional) extra comma-separated Instagram handles
//   TREND_OUT            (optional) output path, default src/data/trends.json
//
// The selection, parsing and validation helpers are pure and exported, so
// scripts/trend-scout.test.mjs covers them without spending Apify or Anthropic
// quota. A run that produces fewer than TREND_MIN valid trends exits non-zero
// and does NOT write the file: a bad run must never wipe the last good drop.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// @anthropic-ai/sdk is imported lazily inside writeKits() so the pure helpers
// can be unit-tested without the SDK (or a network) present.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_OUT = path.join(ROOT, "src/data/trends.json");

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

export const TIKTOK_ACTOR = "clockworks~tiktok-scraper";
export const IG_REEL_ACTOR = "apify~instagram-reel-scraper";

const DEFAULT_TIKTOK_HASHTAGS = [
  "fintok",
  "moneytok",
  "personalfinance",
  "financialliteracy",
  "budgeting",
];
// Large global finance creators, alongside the curated SG ones.
const GLOBAL_IG_CREATORS = [
  "herfirst100k",
  "humphreytalks",
  "vivianxtu",
  "erikakullberg",
  "yourrichbff",
  "thefinancialdiet",
];

// Sized to keep a daily run near US$1 of Apify credit.
const TIKTOK_PER_HASHTAG = 15;
const IG_REELS_PER_CREATOR = 5;
const TIKTOK_SHORTLIST = 12;
const IG_SHORTLIST = 6;
const MAX_TRANSCRIPT_CHARS = 1500;

function csvEnv(name, fallback) {
  const raw = (process.env[name] || "").trim();
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((s) => s.trim().replace(/^[#@]/, ""))
    .filter(Boolean);
}

const APIFY_API = "https://api.apify.com/v2";
// Longest a single actor run may take before the scout gives up on it.
const ACTOR_MAX_WAIT_MS = 12 * 60_000;

async function apifyFetch(url, token, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apify ${res.status} ${body.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * Start an Apify actor run, wait for it to finish, and return its dataset
 * items. An async run + polling rather than run-sync, which Apify cuts off
 * after 300s.
 */
async function runActor(actor, input, token) {
  const started = await apifyFetch(`${APIFY_API}/acts/${actor}/runs`, token, {
    method: "POST",
    body: JSON.stringify(input),
  });
  let run = started.data;
  const deadline = Date.now() + ACTOR_MAX_WAIT_MS;
  while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status)) {
    if (Date.now() > deadline) {
      throw new Error(`${actor} still ${run.status} after ${ACTOR_MAX_WAIT_MS / 60_000} min`);
    }
    // waitForFinish holds each request open for up to 60s, so this polls gently.
    run = (await apifyFetch(`${APIFY_API}/actor-runs/${run.id}?waitForFinish=60`, token)).data;
  }
  if (run.status !== "SUCCEEDED") {
    throw new Error(`${actor} run ${run.id} ended ${run.status}`);
  }
  const items = await apifyFetch(
    `${APIFY_API}/datasets/${run.defaultDatasetId}/items?clean=true&format=json`,
    token,
  );
  console.log(`  ${actor}: ${Array.isArray(items) ? items.length : 0} items, US$${run.usageTotalUsd ?? "?"}`);
  return Array.isArray(items) ? items : [];
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
  const likes = Math.max(0, Number(p.likesCount) || 0); // hidden likes come back as -1
  const comments = Math.max(0, Number(p.commentsCount) || 0);
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

/** Days between a timestamp (ISO string, or epoch seconds/ms) and `now`; null if unparseable. */
export function ageInDays(timestamp, now = Date.now()) {
  if (timestamp === null || timestamp === undefined || timestamp === "") return null;
  const ms =
    typeof timestamp === "number"
      ? timestamp < 1e12
        ? timestamp * 1000
        : timestamp
      : new Date(timestamp).getTime();
  return Number.isNaN(ms) ? null : (now - ms) / 86_400_000;
}

// Comments and shares weighted above likes: they're the stronger "this is
// genuinely useful / worth passing on" signals of real virality.
export function engagementScore(post) {
  return (post.likes || 0) + (post.comments || 0) * 3 + (post.shares || 0) * 5;
}

/**
 * Dedupe by URL, drop posts below the engagement floor, sort by engagement,
 * and cap how many come from any single author so one creator can't dominate
 * the drop.
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

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Rank Instagram reels by how far each beat its own creator's median views.
 * Raw views would just surface the biggest accounts; the ratio finds the reel
 * that broke out for that creator. The median uses every reel fetched for the
 * creator, and only recent reels can be picked. Adds `outlier` (the ratio).
 */
export function pickOutlierReels(
  items,
  { maxAgeDays = 14, minViews = 5000, minRatio = 1.5, now = Date.now() } = {},
) {
  const byCreator = new Map();
  for (const item of items) {
    if (!item || item.error || !item.ownerUsername) continue;
    const list = byCreator.get(item.ownerUsername) ?? [];
    list.push(item);
    byCreator.set(item.ownerUsername, list);
  }
  const viewsOf = (r) => Number(r.videoPlayCount ?? r.videoViewCount) || 0;
  const picks = [];
  for (const reels of byCreator.values()) {
    const typical = median(reels.map(viewsOf));
    if (typical <= 0) continue;
    for (const reel of reels) {
      const age = ageInDays(reel.timestamp, now);
      if (age === null || age > maxAgeDays) continue;
      const views = viewsOf(reel);
      const ratio = views / typical;
      if (views < minViews || ratio < minRatio) continue;
      const post = normalizeIgItem(reel);
      if (post) picks.push({ ...post, views, outlier: Math.round(ratio * 10) / 10 });
    }
  }
  return picks.sort((a, b) => b.outlier - a.outlier || b.views - a.views);
}

/** The subtitle file for a TikTok scraper item, English first; null when none. */
export function tiktokSubtitleLink(item) {
  const links = item?.videoMeta?.subtitleLinks;
  if (!Array.isArray(links) || links.length === 0) return null;
  const english = links.find((l) => /^en/i.test(l?.language ?? ""));
  return (english ?? links[0])?.downloadLink ?? null;
}

/** Plain text from a WebVTT file: no header, cue numbers, timings, tags or repeats. */
export function vttToText(vtt) {
  const lines = String(vtt ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/<[^>]+>/g, "").trim())
    .filter(
      (l) =>
        l &&
        l !== "WEBVTT" &&
        !l.includes("-->") &&
        !/^\d+$/.test(l) &&
        !/^(NOTE|STYLE|Kind:|Language:)/.test(l),
    );
  const out = [];
  for (const line of lines) if (out[out.length - 1] !== line) out.push(line);
  return out.join(" ").replace(/\s+/g, " ").trim();
}

/** Discovery runs: which actor gets which input. Pure, so tests can pin inputs to each actor's schema. */
export function buildDiscoveryJobs({ tiktokHashtags, igCreators }) {
  const jobs = [
    {
      label: "TikTok hashtags",
      platform: "tiktok",
      actor: TIKTOK_ACTOR,
      input: { hashtags: tiktokHashtags, resultsPerPage: TIKTOK_PER_HASHTAG },
    },
  ];
  if (igCreators.length > 0) {
    jobs.push({
      label: "Instagram creator reels",
      platform: "instagram",
      actor: IG_REEL_ACTOR,
      input: {
        username: igCreators,
        resultsLimit: IG_REELS_PER_CREATOR,
        skipPinnedPosts: true,
      },
    });
  }
  return jobs;
}

/** Transcript runs for the shortlisted videos. */
export function buildTranscriptJobs({ tiktokUrls, igUrls }) {
  const jobs = [];
  if (tiktokUrls.length > 0) {
    jobs.push({
      label: "TikTok transcripts",
      platform: "tiktok",
      actor: TIKTOK_ACTOR,
      input: {
        postURLs: tiktokUrls,
        downloadSubtitlesOptions: "DOWNLOAD_AND_TRANSCRIBE_VIDEOS_WITHOUT_SUBTITLES",
      },
    });
  }
  if (igUrls.length > 0) {
    jobs.push({
      label: "Instagram transcripts",
      platform: "instagram",
      actor: IG_REEL_ACTOR,
      input: { username: igUrls, resultsLimit: 1, includeTranscript: true },
    });
  }
  return jobs;
}

function urlKey(url) {
  return String(url ?? "").split("?")[0].replace(/\/+$/, "");
}

function fmtNum(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

const SYSTEM = `You are a social-media strategist for Singapore-based AIA financial consultants. You are given real finance videos that are ALREADY doing well (with their real engagement numbers and what each video actually says), and you turn a proven video into a piece of content a financial advisor can publish today.

The engagement is the proof the format works, so you build only on the videos given to you. Never force a connection: only ride a video where the bridge to a money / protection / planning idea is honest and earns attention rather than hijacking it. Keep everything appropriate for a licensed financial advisor in Singapore: no product guarantees, no promised returns, no misleading or fear-mongering claims, no market-timing or specific stock, fund or ETF picks, politically neutral, and humour must punch up or be self-deprecating, never mock anyone.`;

export function buildKitPrompt(posts, count, today) {
  const lines = posts.map((p, i) => {
    const metrics = [
      p.views ? `${fmtNum(p.views)} views` : null,
      `${fmtNum(p.likes)} likes`,
      `${fmtNum(p.comments)} comments`,
      p.shares ? `${fmtNum(p.shares)} shares` : null,
      p.outlier ? `about ${p.outlier}x this creator's usual views` : null,
    ]
      .filter(Boolean)
      .join(", ");
    return `[${i}] ${p.platform} ${p.format} by ${p.author || "unknown"} (${metrics})\nCaption: ${p.caption || "(no caption)"}\nTranscript: ${p.transcript || "(no transcript available)"}`;
  });

  return `Today is ${today} (Singapore time). Below are ${posts.length} finance videos doing well right now on TikTok and Instagram, with their real engagement and what each one actually says. TikTok videos are ranked by engagement; Instagram reels by how far they beat their creator's usual views.

For each video a Singapore financial consultant can HONESTLY ride, write one piece of content. Pick the best ${count}. Skip any without a genuine money / protection / planning angle, and skip any where the caption and transcript don't make clear what the video is about. Aim for a spread of topics and pillars.

VIDEOS:
${lines.join("\n\n")}

Return ONLY a JSON array (no prose before or after). Each object references one video by its index and adds the content kit:

- "index": the [n] of the video this is based on (integer)
- "pillar": one of "interest" | "identity" | "topic" | "market"
- "trend_type": one of "meme" | "news" | "current-affairs" | "event" | "culture" | "sport"
- "trend_source": 1-2 sentences describing what the video says and the traction that proves it works (use the real numbers above, and say when the original is from another country)
- "title": the advisor's content idea in one punchy line
- "hooks": array of 2-3 ready-to-use opening lines; the first must stop the scroll on its own, first person, under 25 words, no [brackets]
- "talking_points": array of 3-4 short concrete points the advisor should make, in order
- "cta": one strong closing call to action, written as a usable line
- "cta_type": one of "dm-keyword" | "comment-keyword" | "save-share" | "book-call" | "open-question" (match your cta)
- "why_it_works": 1-2 sentences on why riding this proven video earns attention honestly
- "how_to_film": concrete delivery notes for a short video (framing, first line, pacing)

Rules:
- Do NOT include a URL, platform, or format; those come from the real video via its index.
- Only reference indexes that exist in the list above.
- Build from what the video actually says; never invent details that aren't in its caption or transcript.
- Keep it Singapore-relevant (SGD, CPF, SRS, HDB, insurance where the bridge is honest). Adapt foreign accounts and figures to Singapore instead of presenting them as local facts.
- Don't state specific government payouts, interest rates, tax caps or returns as facts; tell viewers to check the official source.
- Skip recruitment ("join my team") content, paid promotions and affiliate offers.
- Hooks are for the consultant to say in their own voice; never claim they did something from the source video (like running a street interview) that they didn't.
- Skip videos with no honest money angle rather than stretching. Quality over hitting ${count}.
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
 * and engagement always come from the real post; Claude never supplies them.
 * Drops anything malformed or pointing at a non-existent index. Returns the
 * clean TrendEntry list (may be shorter than `kits`).
 */
export function finalizeTrends(kits, posts, today, count = 12) {
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

function instagramCreators() {
  let local = [];
  try {
    const advisors = JSON.parse(
      fs.readFileSync(path.join(ROOT, "src/data/advisors.json"), "utf8"),
    );
    local = advisors
      .filter((a) => String(a.platform).toLowerCase() === "instagram")
      .map((a) => String(a.handle ?? "").replace(/^@/, "").trim())
      .filter(Boolean);
  } catch {
    // advisors file optional
  }
  return [...new Set([...local.slice(0, 40), ...GLOBAL_IG_CREATORS, ...csvEnv("IG_CREATORS", [])])];
}

/** Attach transcripts to the shortlisted posts; a missing transcript never fails the run. */
async function withTranscripts(token, tiktokPosts, igPosts) {
  const jobs = buildTranscriptJobs({
    tiktokUrls: tiktokPosts.map((p) => p.url),
    igUrls: igPosts.map((p) => p.url),
  });
  const results = await Promise.allSettled(jobs.map((j) => runActor(j.actor, j.input, token)));
  const byUrl = new Map();

  for (const [i, result] of results.entries()) {
    const job = jobs[i];
    if (result.status === "rejected") {
      console.warn(`  ${job.label} failed: ${result.reason?.message ?? result.reason}`);
      continue;
    }
    for (const item of result.value) {
      if (job.platform === "tiktok") {
        const link = tiktokSubtitleLink(item);
        if (!link) continue;
        try {
          const res = await fetch(link, { headers: { Authorization: `Bearer ${token}` } });
          const text = res.ok ? vttToText(await res.text()) : "";
          if (text) {
            byUrl.set(urlKey(item.submittedVideoUrl), text);
            byUrl.set(urlKey(item.webVideoUrl), text);
          }
        } catch {
          // no subtitle text: the kit falls back to the caption
        }
      } else if (typeof item.transcript === "string" && item.transcript.trim()) {
        byUrl.set(urlKey(item.inputUrl), item.transcript.trim());
        byUrl.set(urlKey(item.url), item.transcript.trim());
      }
    }
  }

  const attach = (p) => ({
    ...p,
    transcript: (byUrl.get(urlKey(p.url)) ?? "").slice(0, MAX_TRANSCRIPT_CHARS),
  });
  const posts = [...tiktokPosts.map(attach), ...igPosts.map(attach)];
  console.log(`  transcripts found for ${posts.filter((p) => p.transcript).length}/${posts.length} videos`);
  return posts;
}

async function writeKits({ apiKey, model, posts, count, today }) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });
  // Streamed: the SDK refuses a non-streaming request this large, since it could
  // outlast the 10-minute HTTP timeout. finalMessage() collects the full reply.
  const msg = await client.messages
    .stream({
      model,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: SYSTEM,
      messages: [{ role: "user", content: buildKitPrompt(posts, count, today) }],
    })
    .finalMessage();
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
  const count = Number(process.env.TREND_COUNT || 12);
  const min = Number(process.env.TREND_MIN || 8);
  const minEngagement = Number(process.env.TREND_MIN_ENGAGEMENT || 1000);
  const maxAgeDays = Number(process.env.TREND_MAX_AGE_DAYS || 14);
  const model = process.env.TREND_MODEL || "claude-opus-4-8";
  const out = process.env.TREND_OUT || DEFAULT_OUT;
  const today = singaporeDate();
  const now = Date.now();

  console.log(`Trend scout: model=${model} target=${count} min=${min} date=${today}`);
  console.log("Finding finance videos doing well...");
  const jobs = buildDiscoveryJobs({
    tiktokHashtags: csvEnv("TIKTOK_HASHTAGS", DEFAULT_TIKTOK_HASHTAGS),
    igCreators: instagramCreators(),
  });
  const runs = await Promise.allSettled(jobs.map((j) => runActor(j.actor, j.input, apifyToken)));

  let tiktok = [];
  let instagram = [];
  runs.forEach((result, i) => {
    const job = jobs[i];
    if (result.status === "rejected") {
      console.warn(`  ${job.label} failed: ${result.reason?.message ?? result.reason}`);
      return;
    }
    if (job.platform === "tiktok") {
      const fresh = result.value
        .map(normalizeTiktokItem)
        .filter(Boolean)
        .filter((p) => {
          const age = ageInDays(p.timestamp, now);
          return age === null || age <= maxAgeDays;
        });
      tiktok = rankPosts(fresh, { minEngagement }).slice(0, TIKTOK_SHORTLIST);
      console.log(`  TikTok: ${result.value.length} videos, ${fresh.length} recent -> ${tiktok.length} shortlisted`);
    } else {
      instagram = pickOutlierReels(result.value, { maxAgeDays, now }).slice(0, IG_SHORTLIST);
      console.log(`  Instagram: ${result.value.length} reels -> ${instagram.length} beat their creator's usual views`);
    }
  });

  if (tiktok.length + instagram.length < min) {
    console.error(
      `Only ${tiktok.length + instagram.length} candidate videos (< ${min}); refusing to overwrite the last good drop.`,
    );
    process.exit(1);
  }

  console.log("Fetching transcripts...");
  const candidates = await withTranscripts(apifyToken, tiktok, instagram);

  const kits = await writeKits({ apiKey, model, posts: candidates, count, today });
  const trends = finalizeTrends(kits, candidates, today, count);
  console.log(`Claude wrote ${kits.length} kits -> ${trends.length} valid trends.`);

  if (trends.length < min) {
    console.error(
      `Only ${trends.length} valid trends (< ${min}); refusing to overwrite the last good drop.`,
    );
    process.exit(1);
  }

  fs.writeFileSync(out, JSON.stringify(trends, null, 2) + "\n");
  console.log(`Wrote ${trends.length} trends to ${out}`);
  for (const t of trends) {
    console.log(`- [${t.platform}] ${t.title}\n    ${t.author} ${t.source_url} (${fmtNum(t.views)} views, ${fmtNum(t.likes)} likes)\n    hook: ${t.hooks[0]}`);
  }
}

// Only run the API path when executed directly, so tests can import the pure
// functions above without any token.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error("Trend scout failed:", err?.message ?? err);
    process.exit(1);
  });
}
