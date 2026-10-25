// Format scout: the weekly drop of trending TikTok slideshows and walls of text behind /trends?view=formats
// (docs/north-star/items/find-trending-formats.md). Writes src/data/formatTrends.json and public/format-trends/<id>.jpg.
//
// 1. Apify clockworks~tiktok-scraper on 8 searches x 30 results (TikTok search's Top section, which carries photo-mode
//    posts; its hashtag feeds returned 240 videos and no slideshow on 21 Oct), with slideshow images on. It prints the
//    result count and the price before anything is paid, and refuses above FORMAT_SCOUT_MAX_USD (default 1.5).
// 2. Keeps posts from the last 90 days with 50,000 views or more (30 days kept 2 of 174 search results on 21 Oct;
//    90 kept 36 with 11 slideshows, and a format ages slower than a sound). A photo-mode post is a slideshow.
// 3. The free Claude CLI (claude -p --model sonnet) reads the pictures, since Jev reads text only: up to 10 slides
//    of each slideshow give its hook and what each slide does; each video's cover says whether it is a wall of text,
//    and if so its hook and what each part does. Never the words themselves, only the jobs. The pictures are scraped
//    strangers' work and may carry planted instructions, and the run is on Leo's Mac beside his keys, so the CLI gets
//    the Read tool only, confined to a fresh folder holding that one post's pictures (claudeArgs), runs with no API
//    keys in its environment, and its reply is untrusted: only a hook and 2 to 10 short lines are kept, and any line
//    that looks like a secret is dropped (cleanReading).
// 4. Jev (jev-1.13.0) asks reusable and unsafe about each one. Kept at reusable >= 0.5 and unsafe < 0.3, a proposal
//    until a --dry run on a real week is read. A post Jev did not answer is left out this week.
// 5. Saves each cover 720 px wide as a JPEG (macOS sips), keeps the 40 best by fit then views, carries forward last
//    file's items under 28 days old, and never writes fewer than 8 items. A failed run writes nothing.
//
// No APIFY_TOKEN (or APIFY_API_KEY) or no TYPESAFE_API_KEY: says so, exits 0 and writes nothing.
//
// Usage:
//   node scripts/format-scout.mjs               # the weekly run, about US$0.90 of Apify
//   node scripts/format-scout.mjs --estimate    # print the run's price, scrape nothing
//   node scripts/format-scout.mjs --dry         # scrape, read and score, print every post with its scores, write nothing
//   node scripts/format-scout.mjs --dataset f   # read a saved scrape (the run prints where it saved one) instead of paying
// Weekly on Leo's Mac: content-studio-drop.sh format-trends (launchd com.leo.format-trends, Mondays 06:30).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src/data/formatTrends.json");
const COVER_DIR = path.join(ROOT, "public/format-trends");

export const ACTOR = "clockworks~tiktok-scraper";
export const SEARCHES = ["money tips", "personal finance", "finance tips", "career advice", "corporate life", "productivity tips", "self improvement", "adulting"];
export const PER_SEARCH = 30;
export const RESULTS = SEARCHES.length * PER_SEARCH;
// The vendor table's Free-plan rate (api.apify.com, read 20 Oct): US$3.70 per 1,000 results plus US$0.001 a run.
const FALLBACK_USD_PER_RESULT = 0.0037;
const START_USD = 0.001;
export const MIN_VIEWS = 50_000;
export const MAX_AGE_DAYS = 90;
export const CARRY_DAYS = 28;
export const KEEP = 40;
export const MIN_ITEMS = 8;
export const MAX_SLIDES = 10;
// shortcut: Claude reads only the 60 most viewed candidates, so a week's run stays near half an hour; raise it if
// the drop keeps coming in under 40
export const MAX_READS = 60;
export const REUSABLE_MIN = 0.5;
export const UNSAFE_MAX = 0.3;
const DAY = 86_400_000;
const API = "https://api.apify.com/v2";
const MAX_WAIT_MS = 15 * 60_000;

export const QUESTIONS = {
  reusable: {
    type: "noul",
    instructions:
      "Could a Singapore financial adviser reuse this post's format, with the same number of slides and the same job for each slide, for a post about money, careers or family finances, changing every word?",
  },
  unsafe: {
    type: "noul",
    instructions: "Does this post rely on sexual content, medical or mental-health claims, hate, or harm to a named person?",
  },
};

// ---- pure helpers -------------------------------------------------------------------------------------------------

/** Curly quotes, dashes and ellipses to ASCII, whitespace collapsed. */
export const ascii = (v) =>
  String(v ?? "")
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/\s*[\u2013\u2014]\s*/g, ", ")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .trim();

/** ASCII, cut at a word to `max` characters. */
export function cleanLine(v, max) {
  const t = ascii(v);
  return t.length <= max ? t : `${t.slice(0, max - 3).replace(/\s+\S*$/, "")}...`;
}

/** What each slide does: 2 to 10 lines of at most 80 characters, or null. */
export function cleanStructure(lines) {
  if (!Array.isArray(lines)) return null;
  const out = lines.map((l) => (typeof l === "string" && !looksSecret(l) ? cleanLine(l, 80) : "")).filter(Boolean);
  return out.length >= 2 && out.length <= MAX_SLIDES ? out : null;
}

/** The first {...} in Claude's reply, parsed, or null. */
export function parseReply(text) {
  const t = String(text ?? "");
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch {
    return null;
  }
}

/**
 * True for text shaped like a credential: a long base64 or hex run, a key prefix (sk_, pk_, zrk_, bu_, hf_, sk-ant-,
 * apify_api_, ghp_, AKIA, a JWT), or an env-style KEY=, TOKEN=, SECRET or PASSWORD. Upper case only for those words,
 * so "The secret to saving" stays; "The SECRET to saving" is dropped, which costs one card at most.
 */
const SECRET_SHAPES =
  /[A-Za-z0-9+/=_-]{32,}|\b[0-9a-fA-F]{24,}\b|\b(?:sk|pk|rk|zrk|bu|hf|ghp|gho|xox[abp])[_-][A-Za-z0-9]|sk-ant-|apify_api_|\bAKIA[0-9A-Z]{8,}|\beyJ[A-Za-z0-9_-]{10,}/i;
const SECRET_WORDS = /(?:KEY|TOKEN|SECRET)\s*[=:]|SECRET|PASSWORD/;
export const looksSecret = (v) => SECRET_SHAPES.test(String(v ?? "")) || SECRET_WORDS.test(String(v ?? ""));

/**
 * Claude's reading as { kind, hook, structure }, or null. A video's cover that is not a wall of text is null too.
 * `photo` says which question was asked: a slideshow's slides, or a video's cover. Untrusted: only these three
 * fields are read, the kind comes from the question asked, and every string is capped and checked by looksSecret.
 */
export function cleanReading(raw, photo) {
  if (!raw || typeof raw !== "object") return null;
  if (!photo && raw.kind !== "wall-of-text") return null;
  const hook = typeof raw.hook === "string" && !looksSecret(raw.hook) ? cleanLine(raw.hook, 100) : "";
  const structure = cleanStructure(raw.structure);
  return hook && structure ? { kind: photo ? "slideshow" : "wall-of-text", hook, structure } : null;
}

const https = (v) => {
  try {
    const u = new URL(String(v ?? ""));
    return u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
};

/** YYYY-MM-DD from createTimeISO, else createTime in epoch seconds or ms. */
function dayOf(item) {
  const raw = item?.createTimeISO ?? item?.createTime;
  const ms = typeof raw === "number" ? (raw < 1e12 ? raw * 1000 : raw) : Date.parse(String(raw ?? ""));
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
}

/**
 * One raw actor item as a post, or null. A photo post carries slideshowImageLinks ({ tiktokLink, downloadLink }), as
 * scripts/fixtures/format-scout-tiktok.json shows (a real search result, 21 Oct); TikTok's own
 * imagePost.images[].imageURL.urlList is read when the actor leaves the links out.
 */
export function tiktokPost(item) {
  if (!item || typeof item !== "object" || item.error || item.isAd || item.isSponsored) return null;
  const id = String(item.id ?? "");
  if (!/^\d{5,25}$/.test(id)) return null;
  const postedAt = dayOf(item);
  if (!postedAt) return null;
  const photo = Boolean(item.isSlideshow);
  const named = String(item.authorMeta?.name ?? "").replace(/^@/, "");
  const author = /^[A-Za-z0-9._]{1,40}$/.test(named) ? named : "";
  const links = Array.isArray(item.slideshowImageLinks)
    ? item.slideshowImageLinks.map((l) => https(l?.downloadLink) ?? https(l?.tiktokLink))
    : Array.isArray(item.imagePost?.images)
      ? item.imagePost.images.map((i) => https(i?.imageURL?.urlList?.[0]))
      : [];
  const images = links.filter(Boolean);
  const web = https(item.webVideoUrl);
  return {
    id,
    photo,
    url: web && new URL(web).hostname === "www.tiktok.com" ? web : `https://www.tiktok.com/@${author || "tiktok"}/${photo ? "photo" : "video"}/${id}`,
    author,
    caption: cleanLine(item.text, 240),
    views: Math.max(0, Number(item.playCount) || 0),
    likes: Math.max(0, Number(item.diggCount) || 0),
    postedAt,
    cover: https(item.videoMeta?.originalCoverUrl) ?? https(item.videoMeta?.coverUrl) ?? images[0] ?? null,
    images,
  };
}

const ageDays = (day, now) => (now - Date.parse(`${day}T00:00:00Z`)) / DAY;

/** Posts from the last 90 days with 50K+ views, one per id, most viewed first. A slideshow needs its slide links. */
export function pickCandidates(items, now = Date.now()) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(items) ? items : []) {
    const p = tiktokPost(raw);
    if (!p || seen.has(p.id) || p.views < MIN_VIEWS || ageDays(p.postedAt, now) > MAX_AGE_DAYS) continue;
    if (p.photo ? p.images.length < 2 : !p.cover) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out.sort((a, b) => b.views - a.views);
}

/** The stored item: formatTrends.json's shape. */
export function shapeItem(p, reading, fit) {
  return {
    id: `tiktok-${p.id}`,
    kind: reading.kind,
    url: p.url,
    author: p.author,
    caption: p.caption,
    views: p.views,
    likes: p.likes,
    slides: reading.kind === "slideshow" ? p.images.length : null,
    cover: `/format-trends/${p.id}.jpg`,
    hook: reading.hook,
    structure: reading.structure,
    postedAt: p.postedAt,
    fit,
  };
}

const byFitThenViews = (a, b) => (b.fit ?? -1) - (a.fit ?? -1) || b.views - a.views;

/** This week's items, then last file's under 28 days old that this week did not find again: the 40 best. */
export function carryForward(prev, fresh, now = Date.now()) {
  const ids = new Set(fresh.map((i) => i.id));
  const kept = (Array.isArray(prev) ? prev : []).filter(
    (i) => i && typeof i.id === "string" && !ids.has(i.id) && /^\d{4}-\d{2}-\d{2}$/.test(i.postedAt) && ageDays(i.postedAt, now) < CARRY_DAYS,
  );
  return [...fresh, ...kept].sort(byFitThenViews).slice(0, KEEP);
}

/** Jev's two answers as a keep decision. */
export const keeps = (s) => s != null && s.reusable != null && s.unsafe != null && s.reusable >= REUSABLE_MIN && s.unsafe < UNSAFE_MAX;

const SLIDES_PROMPT = (files) => `Read each image below, in order. They are the slides of one TikTok photo post.
${files.map((f, i) => `Slide ${i + 1}: ${f}`).join("\n")}
Reply with JSON only, no prose and no markdown fences:
{"hook": "the words on slide 1, exactly as written, at most 100 characters", "structure": ["one line per slide, in order, saying what that slide does for the reader, its job in the post, never its words, names or numbers"]}
Write the structure lines in plain English, under 10 words each, with no dashes. Example lines: "Hook: a numbered list promise", "One habit with a one-line reason", "Call to follow for part two".`;

const COVER_PROMPT = (file) => `Read the image at ${file}. It is the cover of a TikTok video.
Is it a wall of text: several lines of on-screen text over a plain or looping background, meant to be read rather than heard?
If not, reply {"kind": "other"}. If it is, reply with JSON only, no prose and no markdown fences:
{"kind": "wall-of-text", "hook": "the first line of its text, exactly as written, at most 100 characters", "structure": ["2 to 6 lines, in order, each saying what one part of the text does for the reader, never its words, names or numbers"]}
Write the structure lines in plain English, under 10 words each, with no dashes.`;

/** Runs `fn` over `list` with `n` at a time, in order. */
async function pool(list, n, fn) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, list.length) }, async () => {
      while (next < list.length) {
        const k = next++;
        out[k] = await fn(list[k], k);
      }
    }),
  );
  return out;
}

// ---- the paid and outside calls, each replaceable in tests -------------------------------------------------------

async function apify(url, token, init = {}) {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Apify ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

/** The actor's price per result, read live (free); the vendor table's rate when it can't be read. */
async function pricePerResult(token) {
  if (!token) return FALLBACK_USD_PER_RESULT;
  try {
    const latest = ((await apify(`${API}/acts/${ACTOR}`, token)).data?.pricingInfos ?? []).at(-1);
    if (latest?.pricingModel === "PRICE_PER_DATASET_ITEM" && Number(latest.pricePerUnitUsd) > 0) return Number(latest.pricePerUnitUsd);
    // event name unverified for this actor; refresh-top-posts.mjs reads the same "result" event
    const tiers = latest?.pricingPerEvent?.actorChargeEvents?.result?.eventTieredPricingUsd;
    const prices = tiers ? Object.values(tiers).map((t) => Number(t.tieredEventPriceUsd)).filter((p) => p > 0) : [];
    return prices.length ? Math.max(...prices) : FALLBACK_USD_PER_RESULT;
  } catch {
    return FALLBACK_USD_PER_RESULT;
  }
}

/** The actor's input: Top search, since hashtag feeds carry no photo posts; slideshowImageLinks only come with
 * shouldDownloadSlideshowImages (both checked on a 20-result search, 21 Oct). */
export const scoutInput = () => ({ searchQueries: SEARCHES, resultsPerPage: PER_SEARCH, shouldDownloadSlideshowImages: true });

/** One async run (sync runs are cut off at 300 s while they keep billing), capped by Apify itself at `capUsd`. */
async function apifyScrape(token, capUsd) {
  const q = new URLSearchParams({ maxTotalChargeUsd: String(capUsd), maxItems: String(RESULTS) });
  const input = scoutInput();
  let run = (await apify(`${API}/acts/${ACTOR}/runs?${q}`, token, { method: "POST", body: JSON.stringify(input) })).data;
  console.log(`format-scout: Apify run ${run.id} started`);
  const started = Date.now();
  while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(run.status)) {
    if (Date.now() - started > MAX_WAIT_MS) throw new Error(`run ${run.id} still ${run.status} after 15 min`);
    run = (await apify(`${API}/actor-runs/${run.id}?waitForFinish=60`, token)).data;
  }
  if (run.status !== "SUCCEEDED") throw new Error(`run ${run.id} ended ${run.status}`);
  const items = await apify(`${API}/datasets/${run.defaultDatasetId}/items?clean=true&format=json`, token);
  console.log(`format-scout: ${Array.isArray(items) ? items.length : 0} results, US$${run.usageTotalUsd ?? "?"} so far`);
  return Array.isArray(items) ? items : [];
}

const execFileP = promisify(execFile);

/** Downloads a picture and saves it as a JPEG 720 px wide (macOS sips); false when it isn't a usable image. */
async function grabJpeg(url, file, token) {
  try {
    // an Apify download link (slideshowImageLinks[].downloadLink) needs the token, as trend-scout's subtitles do
    const auth = new URL(url).hostname === "api.apify.com" && token ? { authorization: `Bearer ${token}` } : {};
    const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Macintosh) Chrome/141 Safari/537.36", ...auth }, signal: AbortSignal.timeout(30_000) });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok || !String(res.headers.get("content-type") ?? "").startsWith("image/") || buf.length < 2000) return false;
    const raw = `${file}.raw`;
    fs.writeFileSync(raw, buf);
    await execFileP("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "75", "--resampleWidth", "720", raw, "--out", file], { timeout: 60_000 });
    fs.rmSync(raw, { force: true });
    return fs.existsSync(file);
  } catch {
    return false;
  }
}

/**
 * The CLI's arguments: the Read tool only, allowed only inside `dir` (an absolute, resolved path), every other tool
 * and MCP server off, user settings ignored (--restricted also confines file tools to the working directory), and
 * anything that would ask permission refused. Checked by hand on Claude Code 2.1.305: a picture in `dir` was read
 * and a file outside it was denied.
 */
export const claudeArgs = (dir, prompt) => [
  "-p",
  "--model",
  "sonnet",
  "--restricted",
  "--strict-mcp-config",
  "--tools=Read",
  `--allowedTools=Read(/${dir}/**)`,
  "--disallowedTools=Bash,Edit,Write,WebFetch,WebSearch",
  "--permission-mode",
  "dontAsk",
  "--permission-prompts",
  "none",
  prompt,
];

/** This process's environment without its keys, so nothing the CLI runs could read them. Claude's own login stays. */
export const keyless = (env) => Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith("CLAUDE_") || !/KEY|TOKEN|SECRET|PASSWORD/i.test(k)));

/** A failed read's exit code 75: claude-resilient.sh's usage limit (or its limit flag still up). */
export const LIMIT_EXIT = 75;

/**
 * Claude CLI on Leo's Max plan (free), reading one post's pictures, which sit alone in `dir`. Returns its reply.
 * Through CLAUDE_BIN, by default claude-resilient.sh, which rotates accounts on a limit and exits 75 when all are
 * limited (26 Oct: bare `claude` on a limited account failed all 57 reads).
 */
async function claudeSees(prompt, dir) {
  const bin = process.env.CLAUDE_BIN || path.join(os.homedir(), ".local/bin/claude-resilient.sh");
  const call = execFileP(bin, claudeArgs(dir, prompt), {
    cwd: dir,
    env: keyless(process.env),
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  call.child.stdin?.end(); // the wrapper keeps a piped prompt, so an open stdin would hold it until the timeout
  const { stdout } = await call;
  return stdout;
}

/** Jev's reusable and unsafe probabilities, or null when Jev answered nothing. */
async function jevAsk(env, state) {
  const { askJev, noulOf } = await import("../supabase/functions/_shared/jev.ts"); // Node 22.18+ loads TypeScript
  const answers = await askJev(state, QUESTIONS, { who: "cs-format-scout" }, { env: { get: (n) => env[n] } });
  return answers ? { reusable: noulOf(answers, "reusable"), unsafe: noulOf(answers, "unsafe") } : null;
}

// ---- one run ------------------------------------------------------------------------------------------------------

const label = (p, kind) => (kind === "slideshow" ? `slideshow, ${p.images.length}` : kind ?? (p.photo ? "slideshow" : "video"));
const score = (v) => (v == null ? "-" : v.toFixed(2));

/**
 * One run; returns the exit code. Apify, Claude, Jev and the picture download come in as functions so the tests
 * spend nothing: scrape(token, capUsd), price(token), see(prompt, dir), ask(state), grab(url, file).
 */
export async function run({
  env = process.env,
  args = process.argv.slice(2),
  scrape = apifyScrape,
  price = pricePerResult,
  see = claudeSees,
  ask,
  grab,
  now = Date.now(),
  out = OUT,
  coverDir = COVER_DIR,
} = {}) {
  const token = env.APIFY_TOKEN || env.APIFY_API_KEY || "";
  const cap = Number(env.FORMAT_SCOUT_MAX_USD || 1.5);
  const dry = args.includes("--dry");
  const dataset = args.includes("--dataset") ? args[args.indexOf("--dataset") + 1] : null;

  const each = await price(token);
  const estimate = RESULTS * each + START_USD;
  console.log(
    `format-scout: ${SEARCHES.length} searches x ${PER_SEARCH} = ${RESULTS} results at US$${each} = about US$${estimate.toFixed(2)} (cap US$${cap})`,
  );
  if (args.includes("--estimate")) return 0;
  if (!env.TYPESAFE_API_KEY) {
    console.log("format-scout: no TYPESAFE_API_KEY, so nothing is scraped and formatTrends.json keeps its last drop");
    return 0;
  }
  if (!dataset && !token) {
    console.log("format-scout: no APIFY_TOKEN, so nothing is scraped and formatTrends.json keeps its last drop");
    return 0;
  }
  if (!dataset && estimate > cap) {
    console.error(`format-scout: about US$${estimate.toFixed(2)} is above the US$${cap} cap; nothing scraped`);
    return 1;
  }

  let items;
  if (dataset) {
    items = JSON.parse(fs.readFileSync(dataset, "utf8"));
  } else {
    items = await scrape(token, cap);
    const saved = env.FORMAT_SCOUT_DATASET || path.join(os.tmpdir(), `format-scout-dataset-${new Date(now).toISOString().slice(0, 10)}.json`);
    fs.writeFileSync(saved, JSON.stringify(items));
    console.log(`format-scout: scrape saved to ${saved} (read it again free with --dataset)`);
  }

  const candidates = pickCandidates(items, now).slice(0, MAX_READS);
  const photos = candidates.filter((p) => p.photo).length;
  console.log(`format-scout: ${candidates.length} posts at ${MIN_VIEWS / 1000}K+ views in ${MAX_AGE_DAYS} days (${photos} slideshows); Claude reads each`);
  // resolved, since the CLI's Read rule matches real paths (macOS's tmpdir is a symlink into /private)
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "format-scout-")));
  const getJpeg = grab ?? ((url, file) => grabJpeg(url, file, token));
  const askJev = ask ?? ((state) => jevAsk(env, state));
  let tried = 0;
  let limited = 0;
  try {
    // Claude reads the pictures: a slideshow's slides, a video's cover
    const read = await pool(candidates, 3, async (p) => {
      const cover = path.join(tmp, `${p.id}.jpg`);
      const hasCover = Boolean(p.cover) && (await getJpeg(p.cover, cover));
      let files = [];
      if (p.photo) {
        const slides = await pool(p.images.slice(0, MAX_SLIDES), 3, async (u, k) => {
          const f = path.join(tmp, `${p.id}-${k + 1}.jpg`);
          return (await getJpeg(u, f)) ? f : null;
        });
        files = slides.filter(Boolean);
        if (!hasCover && files[0]) fs.copyFileSync(files[0], cover);
      } else if (hasCover) {
        files = [cover];
      }
      if (!files.length || !fs.existsSync(cover)) return null;
      // a fresh folder per post holding only its pictures: the one place the CLI may read
      const box = fs.mkdtempSync(path.join(tmp, "read-"));
      try {
        const boxed = files.map((f) => {
          const to = path.join(box, path.basename(f));
          fs.copyFileSync(f, to);
          return to;
        });
        // the prompt names the pictures only: no caption or other scraped text goes to the CLI
        const prompt = p.photo ? SLIDES_PROMPT(boxed) : COVER_PROMPT(boxed[0]);
        tried++;
        return cleanReading(parseReply(await see(prompt, box)), p.photo);
      } catch (e) {
        if (e?.code === LIMIT_EXIT) limited++;
        console.warn(`  ${p.id}: Claude failed (exit ${e?.code ?? "-"}): ${String(e?.stderr || e?.message || e).trim()}`);
        return null;
      } finally {
        fs.rmSync(box, { recursive: true, force: true });
      }
    });
    // every read hit a usage limit: exit 75 so the drop is retried once the limit resets, not reported broken
    if (tried && limited === tried) {
      console.error(`format-scout: all ${tried} reads hit a Claude usage limit; formatTrends.json keeps its last drop`);
      return LIMIT_EXIT;
    }
    const formats = candidates.map((p, k) => ({ p, reading: read[k] })).filter((x) => x.reading);
    console.log(`format-scout: ${formats.length} are slideshows or walls of text; asking Jev about each`);

    const scores = await pool(formats, 6, ({ p, reading }) =>
      askJev({ hook: reading.hook, structure: reading.structure.join("\n"), caption: p.caption }),
    );
    const fresh = [];
    formats.forEach(({ p, reading }, k) => {
      const s = scores[k];
      const kept = keeps(s);
      console.log(
        `  ${kept ? "kept     " : "left out "} [${label(p, reading.kind)}] @${p.author} ${p.views} views  reusable ${score(s?.reusable)}  unsafe ${score(s?.unsafe)}  ${reading.hook}`,
      );
      if (kept) fresh.push(shapeItem(p, reading, Math.round(s.reusable * 100) / 100));
    });

    let prev = [];
    try {
      prev = JSON.parse(fs.readFileSync(out, "utf8")).items ?? [];
    } catch {
      // first run
    }
    // a carried item keeps its cover file from the drop that found it; one whose file is gone goes too
    const carried = (Array.isArray(prev) ? prev : []).filter((i) => typeof i?.cover === "string" && fs.existsSync(path.join(coverDir, path.basename(i.cover))));
    const list = carryForward(carried, fresh, now);
    // Singapore's date: the drop runs Monday 06:30 SGT, still Sunday in UTC
    const fetched = new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
    if (dry) {
      console.log(`format-scout: dry run, nothing written. ${fresh.length} new and ${list.length - list.filter((i) => fresh.includes(i)).length} carried would make ${list.length} items${list.length < MIN_ITEMS ? `, under ${MIN_ITEMS}, so a real run would write nothing` : ""}`);
      return 0;
    }
    // nothing new means Claude or Jev read nothing this week: a rewrite of last week's items would hide that
    if (!fresh.length) {
      console.error("format-scout: nothing new kept this week; formatTrends.json keeps its last drop");
      return 1;
    }
    // a thin week is not a failure: the scrape ran and was read, there were just few formats worth keeping
    if (list.length < MIN_ITEMS) {
      console.warn(`format-scout: only ${list.length} items (< ${MIN_ITEMS}), a thin week; formatTrends.json keeps its last drop`);
      return 0;
    }

    fs.mkdirSync(coverDir, { recursive: true });
    for (const i of list) {
      if (fresh.includes(i)) fs.copyFileSync(path.join(tmp, path.basename(i.cover)), path.join(coverDir, path.basename(i.cover)));
    }
    fs.writeFileSync(out, JSON.stringify({ fetched, items: list }, null, 2) + "\n");
    const used = new Set(list.map((i) => path.basename(i.cover)));
    for (const f of fs.readdirSync(coverDir)) if (f.endsWith(".jpg") && !used.has(f)) fs.rmSync(path.join(coverDir, f));
    const walls = list.filter((i) => i.kind === "wall-of-text").length;
    console.log(`format-scout: wrote ${list.length} items (${list.length - walls} slideshows, ${walls} walls of text) -> ${out}`);
    return 0;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  run().then(
    (code) => (process.exitCode = code),
    (err) => {
      console.error("format-scout failed:", err?.message ?? err);
      process.exitCode = 1;
    },
  );
}
