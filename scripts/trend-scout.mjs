// Trend scout — the daily "what's the world talking about" drop for /trends.
//
// Studies current trends worldwide (memes in Singapore and globally, current
// affairs, big news, events, sport, culture) via live web search, then rewrites
// each into content a Singapore AIA financial consultant can actually post —
// with scroll-stopping hooks, talking points, and a strong CTA. Writes the
// result to src/data/trends.json, which the /trends page renders.
//
// Runs in CI (see .github/workflows/trend-scout.yml). Locally:
//   ANTHROPIC_API_KEY=sk-ant-... node scripts/trend-scout.mjs
//
// Env:
//   ANTHROPIC_API_KEY  (required) Anthropic API key
//   TREND_COUNT        (optional) target number of trends, default 24
//   TREND_MODEL        (optional) model id, default claude-opus-4-8
//   TREND_MIN          (optional) minimum valid trends or the run fails without
//                      writing, default 12 (never overwrite a good drop with a
//                      thin one)
//
// Design notes:
// - The JSON parse / validate / finalize path is pure and exported so it can be
//   unit-tested without spending API quota.
// - A run that produces fewer than TREND_MIN valid trends exits non-zero and
//   does NOT write the file — a bad scout run must never wipe the last good drop.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

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

// The source of every trend must be an actual viral post on one of the four
// platforms — the engagement is the proof the format works. News sites, blogs,
// and Wikipedia are rejected.
export const SOCIAL_HOSTS = [
  "tiktok.com",
  "instagram.com",
  "facebook.com",
  "fb.watch",
  "fb.com",
  "linkedin.com",
  "lnkd.in",
];

/** True when the URL points at a post on one of the four allowed platforms. */
export function isSocialUrl(u) {
  const host = (u.hostname || "").toLowerCase();
  return SOCIAL_HOSTS.some((h) => host === h || host.endsWith("." + h));
}

const REQUIRED_STRINGS = [
  "platform",
  "format",
  "pillar",
  "title",
  "why_it_works",
  "how_to_film",
  "source_label",
  "source_url",
];

/** SGT (UTC+8) calendar date, so "Last drop <date>" reads right for SG users. */
export function singaporeDate(now = new Date()) {
  return new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
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

/**
 * Pull the JSON array out of the model's final message. Prefers a ```json fence;
 * falls back to the outermost [ ... ]. Throws if neither parses.
 */
export function extractTrendArray(text) {
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

/**
 * Validate + normalise raw entries into TrendEntry shape. Drops anything that
 * can't be salvaged; assigns stable ids and stamps date_found / observed_at to
 * `today`. Returns the clean list (may be shorter than the input).
 */
export function finalizeTrends(rawList, today, count = 24) {
  if (!Array.isArray(rawList)) return [];
  const seenSlugs = new Set();
  const out = [];
  for (const raw of rawList) {
    if (!raw || typeof raw !== "object") continue;

    // Enums — reject rather than guess when the model returns something off-spec.
    if (!PLATFORMS.includes(raw.platform)) continue;
    if (!FORMATS.includes(raw.format)) continue;
    if (!PILLARS.includes(raw.pillar)) continue;

    // Required non-empty strings.
    if (
      !REQUIRED_STRINGS.every(
        (k) => typeof raw[k] === "string" && raw[k].trim().length > 0,
      )
    )
      continue;

    // source_url must be a real http(s) URL on one of the four platforms — the
    // viral post itself, not an article about it.
    let url;
    try {
      url = new URL(raw.source_url);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    } catch {
      continue;
    }
    if (!isSocialUrl(url)) continue;

    const title = raw.title.trim();
    const slug = slugify(title) || `trend-${out.length + 1}`;
    if (seenSlugs.has(slug)) continue; // de-dupe near-identical titles
    seenSlugs.add(slug);

    const entry = {
      id: `trend-${today}-${slug}`,
      platform: raw.platform,
      format: raw.format,
      pillar: raw.pillar,
      title,
      why_it_works: raw.why_it_works.trim(),
      how_to_film: raw.how_to_film.trim(),
      source_label: raw.source_label.trim(),
      source_url: raw.source_url.trim(),
      date_found: today,
      observed_at: today,
    };

    if (TREND_TYPES.includes(raw.trend_type)) entry.trend_type = raw.trend_type;
    if (typeof raw.trend_source === "string" && raw.trend_source.trim())
      entry.trend_source = raw.trend_source.trim();
    const hooks = cleanStringList(raw.hooks);
    if (hooks.length) entry.hooks = hooks.slice(0, 4);
    const points = cleanStringList(raw.talking_points);
    if (points.length) entry.talking_points = points.slice(0, 5);
    if (typeof raw.cta === "string" && raw.cta.trim()) entry.cta = raw.cta.trim();
    if (CTA_TYPES.includes(raw.cta_type)) entry.cta_type = raw.cta_type;

    out.push(entry);
    if (out.length >= count) break;
  }
  return out;
}

const SYSTEM = `You are a social-media strategist for Singapore-based AIA financial consultants. You track what is going VIRAL right now on LinkedIn, TikTok, Instagram and Facebook — the specific posts, reels and videos already racking up views, likes, shares and comments — and you turn a proven-viral moment into a post a financial advisor can publish today.

Riding a format or topic that is already viral is the whole point: the engagement is the proof it works, so you only build on content you can see is genuinely getting traction. Never force a connection — only ride something where the bridge to a money / protection / planning idea is honest and earns attention rather than hijacking it. Keep it appropriate for a licensed financial advisor in Singapore: no product guarantees, no misleading claims, no fear-mongering.`;

function buildUserPrompt(count, today) {
  return `Today is ${today} (Singapore time). Use web search to find content that is genuinely going VIRAL right now on LinkedIn, TikTok, Instagram and Facebook — specific posts, reels or videos that are already gaining serious views and engagement. Singapore-relevant where possible; global only where it clearly lands with an SG audience. The virality is the proof — only pick things you can see are already working, and prefer the last 7 days.

Then turn each viral post into ONE piece of content a Singapore financial consultant can post today, riding that proven format or topic. Aim for ${count} distinct ideas, spread across all four platforms and across trend types (meme, news, current-affairs, event, culture, sport).

Return ONLY a JSON array (no prose before or after) of objects with these fields:

- "platform": one of "linkedin" | "instagram" | "facebook" | "tiktok"  (usually where it's going viral, or the best platform for the advisor's version)
- "format": one of "text-post" | "carousel" | "short-video" | "story"
- "pillar": one of "interest" | "identity" | "topic" | "market"
- "trend_type": one of "meme" | "news" | "current-affairs" | "event" | "culture" | "sport"
- "trend_source": 1-2 sentences on the viral post itself — what it is, who posted it, and the traction (views / likes / shares) that proves it's working
- "title": the content idea in one punchy line
- "hooks": array of 2-3 ready-to-use opening lines; the first must work as the very first line and stop the scroll on its own
- "talking_points": array of 3-4 short points the advisor should actually make (each a concise sentence)
- "cta": one strong closing call to action, written as a usable line
- "cta_type": one of "dm-keyword" | "comment-keyword" | "save-share" | "book-call" | "open-question"  (match the cta you wrote)
- "why_it_works": 1-2 sentences on why riding this proven-viral moment earns attention honestly
- "how_to_film": concrete delivery notes for the chosen format (framing, first line, pacing)
- "source_label": platform + what it links to, e.g. "TikTok · #loudbudgeting" or "Instagram · @creator reel"
- "source_url": a link ON the platform that shows the trend — ideally the specific viral post/reel/video, otherwise the hashtag, sound, or topic page where that viral content lives (e.g. https://www.tiktok.com/tag/loudbudgeting)

Hard rules on the source:
- "source_url" MUST be on one of these domains ONLY: tiktok.com, instagram.com, facebook.com (or fb.watch), linkedin.com. NO news sites, blogs, or Wikipedia — the proof is the content on the platform itself.
- Prefer a specific viral post. If you can't confirm an exact post URL, link the platform's hashtag / sound / topic page for that trend instead — never invent a post ID you didn't see, but a well-formed hashtag/topic URL is always fine.
- Return the FULL set of ${count} ideas. Do not return a short list: if a specific post is hard to pin down, use the relevant hashtag/topic page on the right platform rather than dropping the idea.
- Keep it Singapore-relevant (SG angle, SGD, CPF/SRS/insurance where it fits — only where the bridge is honest).
- Vary the platforms, formats, pillars and trend types across the ${count} ideas.
- Output the JSON array and nothing else.`;
}

/** One Messages request that may span several server-side web-search turns. */
async function generate({ apiKey, model, count, today }) {
  const client = new Anthropic({ apiKey });
  const messages = [{ role: "user", content: buildUserPrompt(count, today) }];

  for (let attempt = 0; attempt < 6; attempt++) {
    const stream = client.messages.stream({
      model,
      max_tokens: 32000,
      system: SYSTEM,
      thinking: { type: "adaptive" },
      // medium effort keeps content quality high while staying fast/cheap for a
      // daily job — high effort roughly triples latency and cost here for no
      // meaningful gain on a bounded write-up task.
      output_config: { effort: "medium" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
      messages,
    });
    const msg = await stream.finalMessage();
    messages.push({ role: "assistant", content: msg.content });

    if (msg.stop_reason === "refusal") {
      throw new Error(
        `model refused: ${msg.stop_details?.explanation ?? "no explanation"}`,
      );
    }
    // Server web-search loop hit its per-request iteration cap — resume.
    if (msg.stop_reason === "pause_turn") continue;

    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return { text, stop_reason: msg.stop_reason };
  }
  throw new Error("did not finish after 6 continuations (stuck on pause_turn)");
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set — cannot run the trend scout.");
    process.exit(1);
  }
  const count = Number(process.env.TREND_COUNT || 24);
  const min = Number(process.env.TREND_MIN || 12);
  const model = process.env.TREND_MODEL || "claude-opus-4-8";
  const today = singaporeDate();

  console.log(`Trend scout: model=${model} target=${count} min=${min} date=${today}`);

  const { text, stop_reason } = await generate({ apiKey, model, count, today });
  if (stop_reason === "max_tokens") {
    console.warn("Warning: response hit max_tokens; output may be truncated.");
  }

  const raw = extractTrendArray(text);
  const trends = finalizeTrends(raw, today, count);
  console.log(`Parsed ${raw.length} raw, ${trends.length} valid after cleaning.`);

  if (trends.length < min) {
    console.error(
      `Only ${trends.length} valid trends (< ${min}); refusing to overwrite the last good drop.`,
    );
    process.exit(1);
  }

  fs.writeFileSync(OUT, JSON.stringify(trends, null, 2) + "\n");
  const types = [...new Set(trends.map((t) => t.trend_type).filter(Boolean))];
  const platforms = [...new Set(trends.map((t) => t.platform))];
  console.log(
    `Wrote ${trends.length} trends to src/data/trends.json — platforms: ${platforms.join(", ")}; types: ${types.join(", ")}.`,
  );
}

// Only run the API path when executed directly, so tests can import the pure
// functions above without a key.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error("Trend scout failed:", err?.message ?? err);
    process.exit(1);
  });
}
