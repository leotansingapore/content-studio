// Copy the weekly ads snapshot into src/data/adsSwipe.json and public/ads for the
// /swipe page's "Ads" tab.
//
// The snapshot is made on Leo's Mac by ~/.local/bin/ads-swipe-collect: real Singapore
// ads read from the Meta Ad Library with api-anything (local, logged out), labelled
// with a hook family by Jev, pictures saved at 720px because Meta's links expire.
// Content Studio users never call Meta; this is a static drop like industry news.
//
// Usage:
//   node scripts/ads-swipe.mjs            # write the JSON and pictures
//   node scripts/ads-swipe.mjs --dry      # print what would be written
//
// Weekly on Leo's Mac: content-studio-drop.sh ads-swipe (called by ads-swipe-collect,
// launchd com.leo.ads-swipe, Mondays 07:00 SGT), which commits only when it changed.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SHARE = process.env.ADS_SWIPE_DIR || path.join(os.homedir(), ".local/share/ads-swipe");
const OUT = path.join(ROOT, "src/data/adsSwipe.json");
const IMG_DIR = path.join(ROOT, "public/ads");

/** The committed shape: the snapshot minus local paths, the picture as a site path. */
export function toCommitted(snapshot) {
  const ads = (snapshot.ads ?? [])
    .filter((a) => a.adId && a.body && a.image && a.hookFamily && /^\d+$/.test(a.adId))
    .map((a) => ({
      adId: a.adId, advertiser: a.advertiser, industry: a.industry, format: a.format,
      headline: a.headline ?? null, body: a.body, cta: a.cta ?? null, link: a.link ?? null,
      start: a.start ?? null, platforms: a.platforms ?? [], image: `/ads/${a.adId}.jpg`,
      libraryUrl: `https://www.facebook.com/ads/library/?id=${a.adId}`, hookFamily: a.hookFamily,
    }));
  return { fetched: snapshot.fetched ?? null, ads };
}

function main() {
  const dry = process.argv.includes("--dry");
  const snapshot = JSON.parse(fs.readFileSync(path.join(SHARE, "latest.json"), "utf8"));
  const out = toCommitted(snapshot);
  if (!out.ads.length) throw new Error("snapshot has no usable ads; keeping the committed ones");
  if (dry) { console.log(JSON.stringify(out, null, 1).slice(0, 2000)); return; }
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const keep = new Set(out.ads.map((a) => `${a.adId}.jpg`));
  for (const a of out.ads) fs.copyFileSync(path.join(SHARE, "img", `${a.adId}.jpg`), path.join(IMG_DIR, `${a.adId}.jpg`));
  for (const f of fs.readdirSync(IMG_DIR)) if (!keep.has(f)) fs.unlinkSync(path.join(IMG_DIR, f));
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`wrote ${out.ads.length} ads, fetched ${out.fetched}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
