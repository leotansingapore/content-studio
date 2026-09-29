// Download a permanent cover image for every post in src/data/topPosts.json.
//
// Why this exists: the scrape pipeline deliberately never stored Instagram CDN
// image URLs because they expire within days, which left the swipe file
// text-only. Instagram's public per-post media endpoint
// (/p/<shortCode>/media/?size=m) redirects to a 320px JPEG without auth, so we
// fetch it ONCE and commit the bytes. The file is ours from then on — nothing
// expires, and the page needs no runtime image proxy.
//
// Usage:
//   node scripts/fetch-covers.mjs           # fill in anything missing
//   node scripts/fetch-covers.mjs --force   # re-download everything
//
// Failures are non-fatal by design: a post with no cover simply keeps no
// `cover` field and the card falls back to its format placeholder. We never
// invent an image.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "src/data/topPosts.json");
const OUT_DIR = path.join(ROOT, "public/covers");

// Size "m" = 320px, ~25-45KB. "l" is ~170KB each, far too heavy to commit for
// a grid of thumbnails.
export const COVER_SIZE = "m";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Instagram shortcodes are URL-safe base64-ish; anything else is not ours to
// paste into a filesystem path.
export function isValidShortCode(code) {
  return typeof code === "string" && /^[A-Za-z0-9_-]{5,32}$/.test(code);
}

export function mediaUrl(shortCode, size = COVER_SIZE) {
  return `https://www.instagram.com/p/${shortCode}/media/?size=${size}`;
}

export function coverFileName(shortCode) {
  return `${shortCode}.jpg`;
}

/** Public URL the app references. Not under /swipe, to avoid the SPA route. */
export function coverPublicPath(shortCode) {
  return `/covers/${coverFileName(shortCode)}`;
}

/** Guard against error pages and 1x1 spacers being saved as a "cover". */
export function isUsableImage({ status, contentType, bytes }) {
  if (status !== 200) return false;
  if (!contentType || !String(contentType).toLowerCase().startsWith("image/")) {
    return false;
  }
  return Number(bytes) >= 2000;
}

async function fetchCover(shortCode) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(mediaUrl(shortCode), {
      headers: { "user-agent": UA, accept: "image/*,*/*" },
      redirect: "follow",
      signal: controller.signal,
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const ok = isUsableImage({
      status: res.status,
      contentType: res.headers.get("content-type"),
      bytes: buf.length,
    });
    if (!ok) {
      return { ok: false, reason: `status ${res.status}, ${buf.length}B` };
    }
    return { ok: true, buf };
  } catch (err) {
    return { ok: false, reason: err?.name === "AbortError" ? "timeout" : String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const force = process.argv.includes("--force");
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const jobs = [];
  for (const [handle, list] of Object.entries(data)) {
    for (const post of list) {
      if (!isValidShortCode(post.shortCode)) continue;
      jobs.push({ handle, post });
    }
  }

  let downloaded = 0;
  let reused = 0;
  let failed = 0;

  // Small concurrency: this is someone else's public endpoint, not a firehose.
  const CONCURRENCY = 4;
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const { post } = jobs[cursor++];
      const file = path.join(OUT_DIR, coverFileName(post.shortCode));
      if (!force && fs.existsSync(file) && fs.statSync(file).size >= 2000) {
        post.cover = coverPublicPath(post.shortCode);
        reused++;
        continue;
      }
      const result = await fetchCover(post.shortCode);
      if (result.ok) {
        fs.writeFileSync(file, result.buf);
        post.cover = coverPublicPath(post.shortCode);
        downloaded++;
      } else {
        delete post.cover; // graceful: the card falls back to its placeholder
        failed++;
        console.warn(`  ${post.shortCode}: ${result.reason}`);
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  fs.writeFileSync(DATA, JSON.stringify(data, null, 2) + "\n");
  console.log(
    `Covers: ${downloaded} downloaded, ${reused} already present, ${failed} unavailable (of ${jobs.length}).`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error("fetch-covers failed:", err?.message ?? err);
    process.exit(1);
  });
}
