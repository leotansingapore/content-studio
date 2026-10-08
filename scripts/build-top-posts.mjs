// Build src/data/topPosts.json from a raw Apify instagram-scraper dataset.
//
// Usage:
//   node scripts/build-top-posts.mjs <path-to-dataset.json>
//
// Normally run by scripts/refresh-top-posts.mjs, which does the scrape. The
// dataset is the JSON output of apify/instagram-scraper run with
// resultsType=posts over every Instagram profile in src/data/advisors.json. It
// may be either a bare array of post items or the MCP wrapper { items: [...] }.
// We keep the top 3 posts per profile by engagement (likes + 3x comments) and
// store text only - Instagram CDN image URLs expire, so covers are downloaded
// and committed separately by scripts/fetch-covers.mjs (run that after this).
//
// Influencers (any profile that is not a tier-1 advisor) are kept for their
// reels: UGC-style inspiration an advisor can rewrite for their business. Their
// top 3 are reels first, topped up with other formats when they post fewer.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const KEEP = 3;

export const isReel = (p) =>
  /clips|video|igtv/i.test(`${p.productType || ""} ${p.type || ""}`);

/** Top KEEP posts by engagement; reels first when preferReels. */
export function pickTop(posts, preferReels = false) {
  const byEng = [...posts].sort((a, b) => b.eng - a.eng);
  const ranked = preferReels
    ? [...byEng.filter(isReel), ...byEng.filter((p) => !isReel(p))]
    : byEng;
  return ranked.slice(0, KEEP).map(({ eng, ...rest }) => rest);
}

/** Normalise one Apify post item; null when it is not usable. */
export function toPost(p) {
  if (!p || p.error || !p.shortCode) return null;
  const likes = Math.max(0, p.likesCount || 0); // IG reports -1 when likes are hidden
  const comments = p.commentsCount || 0;
  return {
    shortCode: p.shortCode,
    url: p.url || `https://www.instagram.com/p/${p.shortCode}/`,
    type: p.type,
    productType: p.productType || null,
    likes,
    comments,
    views: p.videoViewCount || p.videoPlayCount || 0,
    eng: likes + comments * 3,
    timestamp: p.timestamp || null,
    caption: (p.caption || "").replace(/\s+/g, " ").trim().slice(0, 700),
  };
}

/**
 * New topPosts map from scraped items. Profiles the scrape returned nothing for
 * (private for a day, a failed page) keep their previous posts, and existing
 * idea breakdowns and cover paths carry over so a re-scrape never wipes them.
 */
export function buildTopPosts(items, advisors, prev = {}) {
  const byHandle = {};
  for (const a of advisors) {
    if (a.platform === "instagram") byHandle[a.handle.replace("@", "").toLowerCase()] = a;
  }
  const groups = {};
  for (const item of items) {
    const u = (item.ownerUsername || "").toLowerCase();
    const post = byHandle[u] ? toPost(item) : null;
    if (post) (groups[u] ??= []).push(post);
  }

  const out = {};
  for (const [u, posts] of Object.entries(groups)) {
    out[u] = pickTop(posts, byHandle[u].tier !== 1);
  }
  for (const [u, list] of Object.entries(prev)) {
    if (!out[u] && byHandle[u]) out[u] = list;
  }

  const prevIdea = {};
  const prevCover = {};
  for (const list of Object.values(prev)) {
    for (const p of list) {
      if (p.idea) prevIdea[p.shortCode] = p.idea;
      if (p.cover) prevCover[p.shortCode] = p.cover;
    }
  }
  for (const list of Object.values(out)) {
    for (const p of list) {
      if (!p.idea && prevIdea[p.shortCode]) p.idea = prevIdea[p.shortCode];
      if (!p.cover && prevCover[p.shortCode]) p.cover = prevCover[p.shortCode];
    }
  }
  return { out, scraped: Object.keys(groups).length };
}

function main() {
  const srcPath = process.argv[2];
  if (!srcPath) {
    console.error("Usage: node scripts/build-top-posts.mjs <dataset.json>");
    process.exit(1);
  }
  const advisors = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/advisors.json"), "utf8"));
  const rawFile = JSON.parse(fs.readFileSync(srcPath, "utf8"));
  const items = Array.isArray(rawFile) ? rawFile : rawFile.items ?? [];
  const outPath = path.join(ROOT, "src/data/topPosts.json");
  const prev = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : {};

  const { out, scraped } = buildTopPosts(items, advisors, prev);
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  const total = Object.values(out).reduce((n, l) => n + l.length, 0);
  const kept = Object.keys(out).length - scraped;
  console.log(
    `Wrote ${Object.keys(out).length} profiles (${scraped} freshly scraped${kept ? `, ${kept} kept from last time` : ""}), ${total} top posts -> src/data/topPosts.json`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
