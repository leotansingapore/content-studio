// Fill in the "idea breakdown" for each post in src/data/topPosts.json using
// the Claude CLI (free via Max plan). Idempotent: skips posts that already have
// an idea, so it is safe to re-run after adding new posts.
//
// Usage:
//   node scripts/gen-ideas.mjs
//
// Requires the `claude` CLI on PATH.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TOP = path.join(ROOT, "src/data/topPosts.json");

const top = JSON.parse(fs.readFileSync(TOP, "utf8"));
const advisors = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/data/advisors.json"), "utf8"),
);
const info = {};
for (const a of advisors) {
  if (a.platform === "instagram") {
    info[a.handle.replace("@", "").toLowerCase()] = {
      name: a.name,
      niche: (a.niche || []).join(", "),
    };
  }
}

const pending = [];
for (const h of Object.keys(top)) {
  for (const p of top[h]) if (!p.idea) pending.push({ h, p });
}
if (pending.length === 0) {
  console.log("All posts already have an idea. Nothing to do.");
  process.exit(0);
}

const BATCH = 10;
const ideas = {};
for (let i = 0; i < pending.length; i += BATCH) {
  const batch = pending.slice(i, i + BATCH);
  const payload = batch.map(({ h, p }) => ({
    shortCode: p.shortCode,
    advisor: info[h]?.name || h,
    niche: info[h]?.niche || "",
    type: p.type,
    likes: p.likes,
    comments: p.comments,
    views: p.views,
    caption: p.caption.slice(0, 500),
  }));
  const prompt = `You are a short-form content strategist helping SINGAPORE FINANCIAL ADVISORS reverse-engineer top-performing Instagram posts so they can create their own version (not copy).
For EACH post below, return a compact JSON object. Output ONLY a JSON array, no prose, no markdown fences.
Each item: {"shortCode": string, "hook": string (the attention-grabbing angle in <=12 words), "format": string (e.g. "Carousel teaching", "Talking-head reel", "Story/testimonial"), "why": string (1 sentence: why this performed), "adapt": string (1 concrete sentence: how a financial advisor can adapt this idea to their own audience)}.
Keep language plain and human. No hype words, no em dashes.
POSTS:
${JSON.stringify(payload)}`;
  let out = "";
  try {
    out = execFileSync("claude", ["-p", "--model", "sonnet", prompt], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20,
      timeout: 180000,
    });
  } catch (e) {
    console.error("batch", i / BATCH + 1, "claude error", e.message);
    continue;
  }
  let txt = out.trim();
  const s = txt.indexOf("[");
  const e = txt.lastIndexOf("]");
  if (s >= 0 && e > s) txt = txt.slice(s, e + 1);
  let arr;
  try {
    arr = JSON.parse(txt);
  } catch {
    console.error("batch", i / BATCH + 1, "parse fail");
    continue;
  }
  for (const it of arr) {
    if (it && it.shortCode) {
      ideas[it.shortCode] = {
        hook: it.hook,
        format: it.format,
        why: it.why,
        adapt: it.adapt,
      };
    }
  }
  console.error("batch", i / BATCH + 1, "done");
}

for (const h of Object.keys(top)) {
  for (const p of top[h]) if (ideas[p.shortCode]) p.idea = ideas[p.shortCode];
}
fs.writeFileSync(TOP, JSON.stringify(top, null, 2) + "\n");
const withIdea = Object.values(top)
  .flat()
  .filter((p) => p.idea).length;
console.log(`Done. Posts with idea: ${withIdea}`);
