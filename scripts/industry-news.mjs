// Copy ActivityTracker's Bulletin > Industry stories into src/data/industryNews.json
// for the /swipe page's "Industry news" tab.
//
// ActivityTracker (separate repo and Supabase project) publishes up to 5 SG news
// stories a day at 07:30 SGT into bulletin_news: one copy per district, each with
// a gist, a talking point and a client message, plus a clipping in storage at
// bulletin-files/<district>/all/news-<row id>.jpg. Content Studio users sign in
// to a different Supabase and cannot read that table, so this is a static drop,
// like trends.json.
//
// READ ONLY. Every request to the ActivityTracker project is a GET. Never add a
// write here.
//
// Usage:
//   node scripts/industry-news.mjs            # write the JSON and clippings
//   node scripts/industry-news.mjs --dry      # print what would be written
//
// Credentials: a Supabase personal access token from $SUPABASE_ACCESS_TOKEN, the
// keychain item `supabase-access-token`, or ~/.local/state/va-watchdog/token
// (the same token bulletin-news-shots uses), exchanged for the project's
// service key through the Management API. Nothing is printed.
//
// Daily on Leo's Mac: ~/.local/bin/industry-news-drop.sh (launchd
// com.leo.industry-news-drop, 08:00 SGT), which commits only when it changed.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REF = "ktxwcxderiomxzfcezmh";
const SB = `https://${REF}.supabase.co`;
const OUT = path.join(ROOT, "src/data/industryNews.json");
const IMG_DIR = path.join(ROOT, "public/news");
// The whole Industry library, like the bulletin shows it: live stories plus the
// Newsroom clippings seeded on 2026-10-08 (dated by their source, so many are
// months old). Leo 2026-10-08: "this can be more comprehensive".
const DAYS = Infinity;
const CAP = 300;
const IMG_WIDTH = 600;

/** Same labels as ActivityTracker's NEWS_TOPIC_LABEL (src/lib/bulletin.ts). */
export const TOPIC_LABEL = {
  cpf: "CPF and retirement",
  cost: "Cost of living",
  markets: "Rates and markets",
  schemes: "Government schemes",
  health: "Healthcare costs",
  property: "Property",
  scams: "Scams",
  insurers: "Insurance",
};

export const storyId = (url) => crypto.createHash("sha1").update(url).digest("hex").slice(0, 12);

/**
 * One entry per story from the per-district copies: newest first, the last
 * `days` (all of them by default), at most `cap`. A story any district hid is left out.
 */
export function dedupeStories(rows, { now = Date.now(), days = DAYS, cap = CAP } = {}) {
  const since = Number.isFinite(days) ? now - days * 86_400_000 : -Infinity;
  const byUrl = new Map();
  for (const r of rows) {
    if (!r.url || !r.title || !r.gist || !r.talking_point) continue;
    (byUrl.get(r.url) ?? byUrl.set(r.url, []).get(r.url)).push(r);
  }
  const out = [];
  for (const [url, copies] of byUrl) {
    if (copies.some((c) => c.hidden_at)) continue;
    const r = copies[0];
    const date = r.published_at || r.created_at;
    if (!(Date.parse(r.created_at) >= since)) continue;
    out.push({
      id: storyId(url),
      title: r.title,
      gist: r.gist,
      talkingPoint: r.talking_point,
      clientMessage: r.client_message || null,
      source: r.source,
      url,
      publishedAt: date,
      topic: TOPIC_LABEL[r.topic] ?? r.topic,
      // Storage paths of every copy's clipping, tried in order. Not written out.
      _clips: copies.map((c) => `${c.district_id}/all/news-${c.id}.jpg`),
      _sort: r.created_at,
    });
  }
  return out.sort((a, b) => b._sort.localeCompare(a._sort)).slice(0, cap);
}

function accessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  try {
    return execFileSync("/usr/bin/security", ["find-generic-password", "-s", "supabase-access-token", "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    const f = path.join(os.homedir(), ".local/state/va-watchdog/token");
    if (fs.existsSync(f)) return fs.readFileSync(f, "utf8").trim();
    throw new Error("no Supabase access token (env, keychain supabase-access-token, or va-watchdog token file)");
  }
}

async function get(url, headers) {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 Chrome/131", ...headers } });
  if (!res.ok) throw new Error(`GET ${new URL(url).pathname} -> ${res.status}`);
  return res;
}

async function serviceKey() {
  const res = await get(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, {
    authorization: `Bearer ${accessToken()}`,
  });
  const key = (await res.json()).find((k) => k.name === "service_role")?.api_key;
  if (!key) throw new Error("service_role key not found");
  return key;
}

/** Download the first clipping that exists and shrink it to a small JPEG. */
async function saveClipping(story, auth) {
  const file = path.join(IMG_DIR, `${story.id}.jpg`);
  if (fs.existsSync(file) && fs.statSync(file).size > 2000) return true;
  for (const p of story._clips) {
    const res = await fetch(`${SB}/storage/v1/object/authenticated/bulletin-files/${p}`, { headers: auth });
    const type = res.headers.get("content-type") || "";
    if (!res.ok || !type.startsWith("image/")) continue;
    const tmp = path.join(os.tmpdir(), `news-${story.id}-${process.pid}.jpg`);
    fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
    try {
      execFileSync("/usr/bin/sips", ["-s", "format", "jpeg", "-s", "formatOptions", "60", "--resampleWidth", String(IMG_WIDTH), tmp, "--out", file], { stdio: "ignore" });
    } catch {
      return false; // no sips (not a Mac): link out, no picture
    } finally {
      fs.rmSync(tmp, { force: true });
    }
    return fs.existsSync(file);
  }
  return false;
}

async function main() {
  const dry = process.argv.includes("--dry");
  const key = await serviceKey();
  const auth = { apikey: key, authorization: `Bearer ${key}` };
  const q = new URLSearchParams({
    select: "id,district_id,url,source,title,published_at,topic,gist,talking_point,client_message,hidden_at,created_at",
    order: "created_at.desc",
    limit: "5000",
  });
  const rows = await (await get(`${SB}/rest/v1/bulletin_news?${q}`, auth)).json();
  const stories = dedupeStories(rows);
  console.log(`bulletin_news: ${rows.length} rows -> ${stories.length} stories (cap ${CAP})`);
  if (stories.length === 0) {
    // An empty read is far more likely a broken query than a quiet month.
    throw new Error("no stories; industryNews.json left as it was");
  }

  fs.mkdirSync(IMG_DIR, { recursive: true });
  let pics = 0;
  const out = [];
  for (const s of stories) {
    const { _clips, _sort, ...story } = s;
    if (!dry && (await saveClipping(s, auth))) {
      story.clipping = `/news/${s.id}.jpg`;
      pics++;
    }
    out.push(story);
  }
  if (dry) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  const keep = new Set(out.map((s) => `${s.id}.jpg`));
  for (const f of fs.readdirSync(IMG_DIR)) if (!keep.has(f)) fs.rmSync(path.join(IMG_DIR, f));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${out.length} stories (${pics} with a clipping) -> src/data/industryNews.json`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error("industry-news failed:", err?.message ?? err);
    process.exit(1);
  });
}
