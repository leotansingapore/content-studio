// Two free daily feeds, made on Leo's Mac (2026-10-09):
//
//   src/data/realQuestions.json  the newest personal-finance questions people asked in the last two
//     weeks on r/singaporefi and HardwareZone's Money Mind forum, read from their public RSS. The
//     question and a link only, never the post body. Write shows them under "A real question from a
//     client this week".
//   src/data/youtubeTrends.json  this month's most-viewed Singapore personal-finance videos on
//     YouTube, read logged out with api-anything (`youtube recent`, plain HTTP, ~/.api-anything).
//     /trends shows them.
//
// Jev (jev-1.13.0, via the edge functions' own helper) decides what is a real question and what is
// a Singapore finance video. Without Jev, a question must end in "?" and every video from the
// finance searches is kept. A forum that fails keeps its questions from the previous drop, and a
// file that would come out empty is not written, so a block never empties the page.
//
// Usage:
//   node scripts/sg-feeds.mjs          # write both files
//   node scripts/sg-feeds.mjs --dry    # print them instead
// Daily on Leo's Mac: content-studio-drop.sh sg-feeds, which commits only when they changed.

import dns from "node:dns";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { askJev, noulOf } from "../supabase/functions/_shared/jev.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUESTIONS_OUT = path.join(ROOT, "src/data/realQuestions.json");
const VIDEOS_OUT = path.join(ROOT, "src/data/youtubeTrends.json");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141 Safari/537.36";
const FEEDS = [
  { source: "r/singaporefi", url: "https://www.reddit.com/r/singaporefi/new/.rss?limit=50" },
  { source: "HardwareZone Money Mind", url: "https://forums.hardwarezone.com.sg/forums/money-mind.210/index.rss" },
];
const QUERIES = ["Singapore personal finance", "CPF", "Singapore insurance", "Singapore investing"];
const KEEP_QUESTIONS = 12;
const KEEP_VIDEOS = 8;
const MAX_AGE_DAYS = 14;
const YES = 0.6;
const QUESTION_RULE =
  "Is this forum post someone asking a real personal-finance question (money, CPF, insurance, investing, saving, loans, property or retirement) that a Singapore financial adviser could answer in a social media post? Forum rules, adverts, referral requests and bare news links are no.";
const VIDEO_RULE =
  "Is this video a creator or news explainer about personal finance for people in Singapore (money, CPF, insurance, investing, property or retirement)? Adverts and customer testimonials, politics, one company's results, and anything about another country (France's CPF is a training account, not Singapore's) are no.";

const decode = (s) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, "&")
    .trim();

/** RSS 2.0 items or Atom entries -> { title, url, publishedAt }. */
export function parseFeed(xml) {
  return (xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/g) ?? [])
    .map((block) => {
      const tag = (t) => decode(block.match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "");
      const when = Date.parse(tag("pubDate") || tag("published") || tag("updated"));
      return {
        title: tag("title"),
        url: tag("link") || decode(block.match(/<link\b[^>]*href="([^"]+)"/)?.[1] ?? ""),
        publishedAt: Number.isFinite(when) ? new Date(when).toISOString() : null,
      };
    })
    .filter((i) => i.title && i.url.startsWith("https://"));
}

export const parseViews = (s) => Number(String(s ?? "").replace(/[^0-9]/g, "")) || 0;

/** Jev's yes, or the fallback rule when Jev gave no answer; recent, newest first, one per link. */
export function pickQuestions(items, scores, now = Date.now()) {
  const seen = new Set();
  return items
    .map((it, k) => ({ ...it, score: scores[k] }))
    .filter((it) => (it.score == null ? /\?\s*$/.test(it.title) : it.score >= YES))
    .filter((it) => !it.publishedAt || now - Date.parse(it.publishedAt) <= MAX_AGE_DAYS * 86_400_000)
    .filter((it) => !seen.has(it.url) && seen.add(it.url))
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, KEEP_QUESTIONS)
    .map(({ title, url, source, publishedAt }) => ({ question: title, url, source, publishedAt }));
}

/** Jev's yes (all, without Jev), most viewed first. `rows` are already one per video id. */
export function pickVideos(rows, scores) {
  return rows
    .map((r, k) => ({ ...r, score: scores[k] }))
    .filter((r) => /^[\w-]{11}$/.test(r.id ?? "") && r.title && (r.score == null || r.score >= YES))
    .map((r) => ({ id: r.id, title: r.title, channel: r.channel ?? null, views: parseViews(r.views), published: r.published ?? null, length: r.length ?? null }))
    .sort((a, b) => b.views - a.views)
    .slice(0, KEEP_VIDEOS);
}

/** The previous drop's questions from forums that failed this run, as already-approved candidates. */
export function carryOver(previous, failedSources) {
  return (previous ?? [])
    .filter((q) => failedSources.has(q.source))
    .map((q) => ({ title: q.question, url: q.url, source: q.source, publishedAt: q.publishedAt }));
}

const env = { get: (name) => process.env[name] };
dns.setDefaultResultOrder("ipv4first"); // requests stall ~120 s over IPv6 on Leo's hotspot (memory hotspot-ipv6-hangs)

async function fetchText(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
}

async function judge(items, stateOf, instructions) {
  const scores = new Array(items.length).fill(null);
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < items.length) {
      const k = next++;
      const answers = await askJev(stateOf(items[k]), { yes: { type: "noul", instructions } }, { who: "cs-feeds" }, { env });
      scores[k] = noulOf(answers, "yes");
    }
  }));
  return scores;
}

async function readQuestions() {
  const items = [];
  const failed = new Set();
  for (const f of FEEDS) {
    try {
      items.push(...parseFeed(await fetchText(f.url)).map((i) => ({ ...i, source: f.source })));
    } catch (e) {
      failed.add(f.source);
      console.error(`feeds: ${f.source}: ${e.message}; keeping its previous questions`);
    }
  }
  const scores = await judge(items, (i) => ({ post_title: i.title, forum: i.source }), QUESTION_RULE);
  let previous = [];
  try { previous = JSON.parse(fs.readFileSync(QUESTIONS_OUT, "utf8")).questions; } catch { /* first run */ }
  const carried = carryOver(previous, failed);
  return pickQuestions([...items, ...carried], [...scores, ...carried.map(() => 1)]);
}

async function readVideos() {
  const byId = new Map();
  for (const q of QUERIES) {
    const r = spawnSync("api-anything", ["call", "youtube", "recent", `q=${q}`], {
      encoding: "utf8",
      timeout: 120_000,
      env: { ...process.env, NODE_OPTIONS: "--dns-result-order=ipv4first" }, // its own process, so the setting above does not reach it
    });
    try {
      if (r.error) throw r.error;
      const d = JSON.parse((r.stdout ?? "").split("\n")[0]);
      if (!d.ok) throw new Error(`${d.class} ${d.reason}`);
      for (const v of d.data ?? []) if (v.id && !byId.has(v.id)) byId.set(v.id, v);
    } catch (e) {
      console.error(`feeds: youtube "${q}": ${e.message || (r.stderr ?? "").slice(-200)}`);
    }
  }
  const rows = [...byId.values()];
  return pickVideos(rows, await judge(rows, (v) => ({ video_title: v.title, channel: v.channel }), VIDEO_RULE));
}

function write(file, key, list, dry) {
  if (!list.length) return console.error(`feeds: no ${key} this run; keeping the previous drop`);
  const body = JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), [key]: list }, null, 2) + "\n";
  if (dry) console.log(body);
  else fs.writeFileSync(file, body);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dry = process.argv.includes("--dry");
  const [questions, videos] = await Promise.all([readQuestions(), readVideos()]);
  write(QUESTIONS_OUT, "questions", questions, dry);
  write(VIDEOS_OUT, "videos", videos, dry);
}
