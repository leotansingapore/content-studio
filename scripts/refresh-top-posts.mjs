// One command to refresh the /swipe data: scrape every Instagram profile in
// src/data/advisors.json with Apify, rank (build-top-posts), save covers
// (fetch-covers), then write idea breakdowns with the free Claude CLI
// (gen-ideas). Idempotent: ideas and covers already present are kept, so a
// re-run only pays for the scrape.
//
// Usage:
//   APIFY_TOKEN=apify_... node scripts/refresh-top-posts.mjs
//   node scripts/refresh-top-posts.mjs --dataset saved.json   # no scrape, no cost
//   node scripts/refresh-top-posts.mjs --estimate             # print the cost, scrape nothing
//
// Env:
//   APIFY_TOKEN (or APIFY_API_KEY)  pays for the scrape
//   TOP_POSTS_MAX_USD               hard cap for the Apify run (default 1.5);
//                                   the run refuses to start above it
//   TOP_POSTS_DATASET               where the raw dataset is saved (default: tmp)
//
// Weekly on Leo's Mac: ~/.local/bin/top-posts-refresh.sh (launchd
// com.leo.top-posts-refresh), which commits the result and pushes.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ACTOR = "apify~instagram-scraper";
const API = "https://api.apify.com/v2";
const RESULTS_PER_PROFILE = 6;
// Pay-per-result, FREE tier price (the highest tier price, so a ceiling).
// Read live from the actor when reachable; this is the fallback.
const FALLBACK_USD_PER_RESULT = 0.0027;
const MAX_WAIT_MS = 15 * 60_000;

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

function profileUrls() {
  const advisors = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/advisors.json"), "utf8"));
  const seen = new Set();
  const urls = [];
  for (const a of advisors) {
    if (a.platform !== "instagram") continue;
    const h = a.handle.replace("@", "").toLowerCase();
    if (seen.has(h)) continue;
    seen.add(h);
    urls.push(`https://www.instagram.com/${h}/`);
  }
  return urls;
}

async function apify(url, token, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Apify ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function pricePerResult(token) {
  try {
    const { data } = await apify(`${API}/acts/${ACTOR}`, token);
    const latest = (data.pricingInfos ?? []).at(-1);
    const tiers = latest?.pricingPerEvent?.actorChargeEvents?.result?.eventTieredPricingUsd;
    const prices = tiers ? Object.values(tiers).map((t) => t.tieredEventPriceUsd) : [];
    return prices.length ? Math.max(...prices) : FALLBACK_USD_PER_RESULT;
  } catch {
    return FALLBACK_USD_PER_RESULT;
  }
}

/**
 * Async run + polling rather than run-sync-get-dataset-items: the sync
 * endpoint answers 408 after 300 s and the run keeps billing with no way to
 * collect its items, and 48 profiles can take longer than that.
 */
async function scrape(token, urls, capUsd) {
  const input = { directUrls: urls, resultsType: "posts", resultsLimit: RESULTS_PER_PROFILE, addParentData: false };
  const q = new URLSearchParams({
    maxTotalChargeUsd: String(capUsd),
    maxItems: String(urls.length * RESULTS_PER_PROFILE),
  });
  let run = (await apify(`${API}/acts/${ACTOR}/runs?${q}`, token, { method: "POST", body: JSON.stringify(input) })).data;
  console.log(`Apify run ${run.id} started`);
  const started = Date.now();
  while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status)) {
    if (Date.now() - started > MAX_WAIT_MS) throw new Error(`run ${run.id} still ${run.status} after 15 min`);
    run = (await apify(`${API}/actor-runs/${run.id}?waitForFinish=60`, token)).data;
  }
  if (run.status !== "SUCCEEDED") throw new Error(`run ${run.id} ended ${run.status}`);
  const items = await apify(`${API}/datasets/${run.defaultDatasetId}/items?clean=true&format=json`, token);
  // usageTotalUsd settles a few seconds after the run ends.
  await new Promise((r) => setTimeout(r, 5000));
  run = (await apify(`${API}/actor-runs/${run.id}`, token)).data;
  return { items, costUsd: run.usageTotalUsd ?? null, runId: run.id };
}

const node = (script, ...rest) =>
  execFileSync(process.execPath, [path.join(__dirname, script), ...rest], { stdio: "inherit", cwd: ROOT });

/** Delete committed covers no post points at any more. */
function pruneCovers() {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/topPosts.json"), "utf8"));
  const used = new Set(Object.values(data).flat().map((p) => `${p.shortCode}.jpg`));
  const dir = path.join(ROOT, "public/covers");
  let removed = 0;
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    if (f.endsWith(".jpg") && !used.has(f)) {
      fs.unlinkSync(path.join(dir, f));
      removed++;
    }
  }
  console.log(`Covers pruned: ${removed}`);
}

async function main() {
  let datasetPath = flag("--dataset");
  if (!datasetPath) {
    const token = process.env.APIFY_TOKEN || process.env.APIFY_API_KEY;
    if (!token) throw new Error("APIFY_TOKEN is not set");
    const urls = profileUrls();
    const capUsd = Number(process.env.TOP_POSTS_MAX_USD || 1.5);
    const price = await pricePerResult(token);
    const estimate = urls.length * RESULTS_PER_PROFILE * price;
    console.log(
      `Profiles: ${urls.length} x ${RESULTS_PER_PROFILE} posts x US$${price} = estimated US$${estimate.toFixed(2)} (cap US$${capUsd})`,
    );
    if (estimate > capUsd) throw new Error(`estimate US$${estimate.toFixed(2)} is above the cap; nothing scraped`);
    if (args.includes("--estimate")) return;

    const { items, costUsd, runId } = await scrape(token, urls, capUsd);
    const owners = new Set(items.filter((i) => i.ownerUsername && !i.error).map((i) => i.ownerUsername.toLowerCase()));
    console.log(`Apify run ${runId}: ${items.length} items from ${owners.size} profiles, actual cost US$${costUsd ?? "?"}`);
    datasetPath =
      process.env.TOP_POSTS_DATASET ||
      path.join(os.tmpdir(), `top-posts-dataset-${new Date().toISOString().slice(0, 10)}.json`);
    fs.writeFileSync(datasetPath, JSON.stringify(items));
    console.log(`Dataset saved: ${datasetPath}`);
    // A scrape that mostly failed must not replace good data with a thin set.
    if (owners.size < urls.length / 2) {
      throw new Error(`only ${owners.size} of ${urls.length} profiles came back; topPosts.json left as it was`);
    }
  }

  node("build-top-posts.mjs", datasetPath);
  node("fetch-covers.mjs");
  pruneCovers();
  node("gen-ideas.mjs");
}

main().catch((err) => {
  console.error("refresh-top-posts failed:", err?.message ?? err);
  process.exit(1);
});
