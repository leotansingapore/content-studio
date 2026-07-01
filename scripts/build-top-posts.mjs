// Build src/data/topPosts.json from a raw Apify instagram-scraper dataset.
//
// Usage:
//   node scripts/build-top-posts.mjs <path-to-dataset.json>
//
// The dataset is the JSON output of apify/instagram-scraper run with
// resultsType=posts over the tier-1 advisor profile URLs (see
// scripts/refresh-top-posts.md). It may be either a bare array of post items or
// the MCP wrapper { items: [...] }. We keep the top 3 posts per advisor by
// engagement (likes + 3x comments) and store text only - Instagram CDN image
// URLs expire, so cards are text-forward and link out to the live post.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const srcPath = process.argv[2];
if (!srcPath) {
  console.error("Usage: node scripts/build-top-posts.mjs <dataset.json>");
  process.exit(1);
}

const advisors = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/data/advisors.json"), "utf8"),
);
const rawFile = JSON.parse(fs.readFileSync(srcPath, "utf8"));
const items = Array.isArray(rawFile) ? rawFile : rawFile.items ?? [];

const byHandle = {};
for (const a of advisors) {
  if (a.platform === "instagram") {
    byHandle[a.handle.replace("@", "").toLowerCase()] = a;
  }
}

const groups = {};
for (const p of items) {
  const u = (p.ownerUsername || "").toLowerCase();
  if (!u || !byHandle[u] || p.error) continue;
  const likes = p.likesCount || 0;
  const comments = p.commentsCount || 0;
  const views = p.videoViewCount || 0;
  (groups[u] ??= []).push({
    shortCode: p.shortCode,
    url: p.url || `https://www.instagram.com/p/${p.shortCode}/`,
    type: p.type,
    productType: p.productType || null,
    likes,
    comments,
    views,
    eng: likes + comments * 3,
    timestamp: p.timestamp || null,
    caption: (p.caption || "").replace(/\s+/g, " ").trim().slice(0, 700),
  });
}

const out = {};
let total = 0;
for (const u of Object.keys(groups)) {
  const posts = groups[u]
    .sort((a, b) => b.eng - a.eng)
    .slice(0, 3)
    .map(({ eng, ...rest }) => rest);
  out[u] = posts;
  total += posts.length;
}

// Preserve any existing idea breakdowns so a re-scrape does not wipe them.
const outPath = path.join(ROOT, "src/data/topPosts.json");
if (fs.existsSync(outPath)) {
  const prev = JSON.parse(fs.readFileSync(outPath, "utf8"));
  const prevIdea = {};
  for (const list of Object.values(prev)) {
    for (const p of list) if (p.idea) prevIdea[p.shortCode] = p.idea;
  }
  for (const list of Object.values(out)) {
    for (const p of list) if (prevIdea[p.shortCode]) p.idea = prevIdea[p.shortCode];
  }
}

fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(
  `Wrote ${Object.keys(out).length} advisors, ${total} top posts -> src/data/topPosts.json`,
);
console.log("Next: node scripts/gen-ideas.mjs   (fills in idea breakdowns)");
