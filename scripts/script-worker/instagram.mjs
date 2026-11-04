// Research's reader of public Instagram pages, for the script worker on Leo's Mac (wave 2). It opens a creator's
// reels grid (https://www.instagram.com/<handle>/reels/) and a reel's embed page (.../reel/<code>/embed/captioned/)
// in headless Chromium with no login, and reads the JSON those pages carry for their own rendering: the profile, and
// each reel's code, plays, likes, comments and cover from the grid; its caption and video from the embed page.
//
// Pacing: one page at a time across every job, 3 s apart. A login wall or a "please wait" page pauses every read for
// 6 hours (kept in STATE_DIR/instagram-pause.json, so a restart keeps it), and a read during a pause answers
// {paused: {until, why}} at once, which the app shows as it is.
//
// No npm dependencies of its own: Playwright is loaded from the worker's folder only when a read runs (see
// worker.mjs). The parsing here is pure and tested in instagram.test.mjs.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const PACE_MS = 3_000;
export const PAUSE_MS = 6 * 3_600_000;
export const PAGE_TIMEOUT_MS = 30_000;
/** One whole load (context, page, read, close) gives up by this, and Chromium is closed, so one hang can't stop every read. */
export const LOAD_TIMEOUT_MS = 60_000;
/** What a read answer may hold: under script-worker's 60,000 bytes, with room to spare. */
export const MAX_ANSWER_BYTES = 50_000;
export const CAPTION_MAX = 500;
export const STATE_DIR = process.env.SCRIPT_WORKER_STATE || path.join(os.homedir(), ".local/state/script-worker");

const HANDLE = /^[a-z0-9._]{2,30}$/;
const CODE = /^[A-Za-z0-9_-]{5,40}$/;
const RESERVED = new Set(["p", "reel", "reels", "stories", "explore", "tv", "accounts", "direct", "about", "legal", "developer", "challenge"]);
export const cleanHandle = (v) => {
  const h = String(v ?? "").trim().replace(/^@/, "").toLowerCase();
  return HANDLE.test(h) && /[a-z0-9]/.test(h) && !RESERVED.has(h) ? h : null;
};
export const cleanCode = (v) => (typeof v === "string" && CODE.test(v) ? v : null);

// ---- Parsing (pure) -------------------------------------------------------------------------------------------------

/** Every JSON payload a page carries in <script type="application/json"> tags, parsed; broken ones skipped. */
export function jsonBlocks(html) {
  const out = [];
  for (const m of String(html).matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      // not JSON after all
    }
  }
  return out;
}

/** Calls visit on every object inside v, depth first. */
function eachObject(v, visit, depth = 0) {
  if (!v || typeof v !== "object" || depth > 60) return;
  if (Array.isArray(v)) return v.forEach((x) => eachObject(x, visit, depth + 1));
  visit(v);
  for (const x of Object.values(v)) eachObject(x, visit, depth + 1);
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
const text = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
// Instagram's ids are a timestamp in milliseconds since its epoch (1 Aug 2011) shifted left 23 bits
const IG_EPOCH = 1314220021721;
export function takenAtOf(pk) {
  try {
    const ms = Number(BigInt(String(pk)) >> 23n) + IG_EPOCH;
    return ms > Date.UTC(2011, 0) && ms < Date.now() + 86_400_000 ? new Date(ms).toISOString() : null;
  } catch {
    return null;
  }
}

/** The profile and the latest reels on a reels grid page, or null when the page holds neither. */
export function gridOf(html, handle) {
  let user = null;
  const reels = new Map();
  for (const block of jsonBlocks(html)) {
    eachObject(block, (o) => {
      if (!user && typeof o.username === "string" && o.username.toLowerCase() === handle && "follower_count" in o) user = o;
      if (typeof o.code === "string" && CODE.test(o.code) && ("play_count" in o || "like_count" in o) && !reels.has(o.code)) reels.set(o.code, o);
    });
  }
  if (!user) return null;
  const pinnedBy = String(user.pk ?? "");
  return {
    private: user.is_private === true,
    profile: {
      handle,
      name: text(user.full_name, 120),
      followers: num(user.follower_count),
      posts: num(user.media_count ?? user.all_media_count),
      avatar: text(user.profile_pic_url_hd ?? user.profile_pic_url, 2000),
      bio: text(user.biography, 400),
    },
    reels: [...reels.values()].slice(0, 12).map((r) => ({
      code: r.code,
      url: `https://www.instagram.com/reel/${r.code}/`,
      owner: handle,
      views: num(r.play_count ?? r.view_count),
      likes: num(r.like_count),
      comments: num(r.comment_count),
      pinned: Array.isArray(r.clips_tab_pinned_user_ids) && r.clips_tab_pinned_user_ids.map(String).includes(pinnedBy),
      takenAt: typeof r.taken_at === "number" ? new Date(r.taken_at * 1000).toISOString() : takenAtOf(r.pk),
      thumb: text(r.display_uri ?? r.thumbnail_src, 2000),
      caption: "",
      video: "",
    })),
  };
}

/** One reel from its embed page (the data the embed renders from), or null when the page holds none. */
export function embedOf(html) {
  const m = String(html).match(/"contextJSON":"((?:[^"\\]|\\.)*)"/);
  if (!m) return null;
  let media;
  try {
    media = JSON.parse(JSON.parse(`"${m[1]}"`))?.gql_data?.shortcode_media;
  } catch {
    return null;
  }
  const code = cleanCode(media?.shortcode);
  if (!code) return null;
  const owner = cleanHandle(media.owner?.username) ?? "";
  return {
    code,
    url: `https://www.instagram.com/reel/${code}/`,
    owner,
    views: num(media.video_play_count ?? media.video_view_count),
    likes: num(media.edge_liked_by?.count ?? media.edge_media_preview_like?.count),
    comments: num(media.edge_media_to_comment?.count),
    pinned: false,
    takenAt: typeof media.taken_at_timestamp === "number" ? new Date(media.taken_at_timestamp * 1000).toISOString() : takenAtOf(media.id),
    thumb: text(media.thumbnail_src ?? media.display_url, 2000),
    caption: text(media.edge_media_to_caption?.edges?.[0]?.node?.text, CAPTION_MAX),
    video: text(media.video_url, 2000),
  };
}

/**
 * Whether Instagram stopped the load itself: sent it to its login page or a challenge, or answered 429. The words of a
 * "please wait" page are judged only where a page held no data (waitWords), as a caption can say anything.
 */
export function wallOf({ url = "", status = 200 }) {
  let p = "";
  try {
    p = new URL(url).pathname;
  } catch {
    // no address: not a wall
  }
  if (/^\/(accounts\/login|challenge)(\/|$)/.test(p)) return "login";
  return status === 429 ? "wait" : null;
}
export const waitWords = (body) => /please wait a few minutes before you try again/i.test(body);

export const isGone = (body) => /sorry, this page isn.t available|the link you followed may be broken/i.test(body);

/**
 * The usernames in a search's answer: {"creators":[{handle, why}]} as asked, else any @name or profile link in it.
 * Made-up ones are the worker's problem only as far as reading them fails.
 */
export function handlesOf(answer, max) {
  const s = String(answer ?? "");
  const out = new Map();
  try {
    const j = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
    for (const c of Array.isArray(j?.creators) ? j.creators : []) {
      const h = cleanHandle(c?.handle);
      if (h && !out.has(h)) out.set(h, text(c?.why, 200));
    }
  } catch {
    // not the JSON asked for: fall back to the names in the words
  }
  if (!out.size) {
    for (const m of s.matchAll(/(?:instagram\.com\/|@)([A-Za-z0-9._]{2,30})/g)) {
      const h = cleanHandle(m[1].replace(/\.+$/, ""));
      if (h && !out.has(h)) out.set(h, "");
    }
  }
  return [...out].slice(0, max).map(([handle, why]) => ({ handle, why }));
}

const bytes = (v) => Buffer.byteLength(JSON.stringify(v));

/** The answer clipped until it fits MAX_ANSWER_BYTES: shorter captions first, then no video, then no covers. */
export function fit(answer) {
  const reelLists = () => [answer.reels, answer.reel && [answer.reel], ...(answer.creators ?? []).map((c) => c.reels)].filter(Array.isArray);
  const steps = [
    (r) => (r.caption = r.caption.slice(0, 150)),
    (r) => (r.video = ""),
    (r) => (r.thumb = ""),
  ];
  for (const step of steps) {
    if (bytes(answer) <= MAX_ANSWER_BYTES) break;
    reelLists().forEach((list) => list.forEach(step));
  }
  return answer;
}

// ---- Reading (Chromium) ---------------------------------------------------------------------------------------------

export class Paused extends Error {
  constructor(pause) {
    super("paused");
    this.pause = pause;
  }
}

/**
 * One reader per worker: every page load across its jobs goes through `load`, one at a time and PACE_MS apart, and
 * the pause is checked before each. `launch` starts Chromium (Playwright's chromium.launch); the browser closes after a
 * minute with nothing to read, and on close().
 */
export function createReader({ launch, stateDir = STATE_DIR, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const pauseFile = path.join(stateDir, "instagram-pause.json");
  let queue = Promise.resolve();
  let last = 0;
  let browser = null;
  let idle = null;
  // the pause in memory too, so a state file that can't be written still stops the next load
  let held = null;

  const pauseNow = () => {
    if (held && Date.parse(held.until) > now()) return held;
    try {
      const p = JSON.parse(fs.readFileSync(pauseFile, "utf8"));
      return Date.parse(p.until) > now() ? p : null;
    } catch {
      return null;
    }
  };
  const pauseFor = (why) => {
    const p = (held = { until: new Date(now() + PAUSE_MS).toISOString(), why });
    try {
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(pauseFile, JSON.stringify(p));
    } catch {
      // kept in memory only, until the worker restarts
    }
    return p;
  };
  const shut = async () => {
    clearTimeout(idle);
    const b = browser;
    browser = null;
    await b?.close().catch(() => {});
  };

  const open = async (url) => {
    if (!browser) {
      const b = (browser = await launch());
      // a crashed Chromium is dropped, so the next load starts a new one
      b.on?.("disconnected", () => browser === b && (browser = null));
    }
    const b = browser;
    let context = null;
    try {
      context = await b.newContext({ locale: "en-US", viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });
      const html = (await res?.text().catch(() => "")) || (await page.content());
      const body = await page.innerText("body", { timeout: 5_000 }).catch(() => "");
      return { url: page.url(), status: res?.status() ?? 0, html, body };
    } catch (e) {
      // anything Chromium itself got wrong: start it fresh next time
      await shut();
      throw e;
    } finally {
      await context?.close().catch(() => {});
    }
  };

  /** Opens url in a fresh context and hands back {url, status, html, body}; throws Paused on a wall. */
  const load = (url) => {
    const run = queue.then(async () => {
      const p = pauseNow();
      if (p) throw new Paused(p);
      const wait = last + PACE_MS - now();
      if (wait > 0) await sleep(wait);
      clearTimeout(idle);
      let timer;
      try {
        const seen = await Promise.race([
          open(url),
          new Promise((_, bad) => (timer = setTimeout(() => void shut().then(() => bad(new Error("Instagram took too long to answer. Try again later."))), LOAD_TIMEOUT_MS))),
        ]);
        const wall = wallOf(seen);
        if (wall) throw new Paused(pauseFor(wall));
        return seen;
      } finally {
        clearTimeout(timer);
        last = now();
        idle = setTimeout(() => void shut(), 60_000);
        idle.unref?.();
      }
    });
    // the next load waits for this one, whether it worked or not
    queue = run.catch(() => {});
    return run;
  };

  return { load, pauseNow, pauseFor, close: shut };
}

const gridUrl = (handle) => `https://www.instagram.com/${handle}/reels/`;
const embedUrl = (code) => `https://www.instagram.com/reel/${code}/embed/captioned/`;

/** A creator's grid; a plain sentence on anything but a wall. */
async function grid(reader, handle) {
  const seen = await reader.load(gridUrl(handle));
  const g = gridOf(seen.html, handle);
  if (!g && waitWords(seen.body)) throw new Paused(reader.pauseFor("wait"));
  if (!g) throw new Error(isGone(seen.body) ? `There's no Instagram account @${handle}.` : `Instagram's page for @${handle} couldn't be read. Try again later.`);
  if (g.private) throw new Error(`@${handle}'s account is private.`);
  return g;
}

/**
 * ig_reels: the grid, then embed pages for up to `embeds` reels not in `known` (newest first), until `deadline`. A
 * wall part way answers what was read with the pause beside it.
 */
export async function readReels(input, reader, { deadline = Infinity, now = Date.now, signal } = {}) {
  const handle = cleanHandle(input?.handle);
  if (!handle) throw new Error("This read has no Instagram username.");
  const known = new Set(Array.isArray(input.known) ? input.known : []);
  const embeds = Math.max(0, Math.min(12, Number.isInteger(input.embeds) ? input.embeds : 12));
  let g;
  try {
    g = await grid(reader, handle);
  } catch (e) {
    if (e instanceof Paused) return { paused: e.pause };
    throw e;
  }
  const answer = { profile: g.profile, reels: g.reels };
  for (const r of g.reels.filter((x) => !known.has(x.code)).slice(0, embeds)) {
    if (signal?.aborted || now() > deadline) break;
    try {
      const seen = await reader.load(embedUrl(r.code));
      const e = embedOf(seen.html);
      if (!e && waitWords(seen.body)) throw new Paused(reader.pauseFor("wait"));
      if (e) Object.assign(r, { caption: e.caption, video: e.video, takenAt: r.takenAt ?? e.takenAt });
    } catch (e) {
      if (e instanceof Paused) return fit({ ...answer, paused: e.pause });
      // one embed that won't load leaves that reel without a caption
    }
  }
  return fit(answer);
}

/** ig_reel: one reel's embed page. */
export async function readReel(input, reader) {
  const code = cleanCode(input?.code);
  if (!code) throw new Error("This read has no reel.");
  try {
    const seen = await reader.load(embedUrl(code));
    const reel = embedOf(seen.html);
    if (!reel && waitWords(seen.body)) throw new Paused(reader.pauseFor("wait"));
    if (!reel) throw new Error("That reel couldn't be read. It may be private or gone.");
    return fit({ reel });
  } catch (e) {
    if (e instanceof Paused) return { paused: e.pause };
    throw e;
  }
}

/** discover's reads: each creator's grid, its 3 most-played reels with no captions; a wall stops the rest. */
export async function readCreators(found, reader, { deadline = Infinity, now = Date.now, signal } = {}) {
  const creators = [];
  let paused = null;
  for (const { handle, why } of found) {
    if (paused || signal?.aborted || now() > deadline) {
      creators.push({ handle, why, error: paused ? "Reads are paused." : "Not read: the search ran out of time." });
      continue;
    }
    try {
      const g = await grid(reader, handle);
      const reels = g.reels.filter((r) => !r.pinned).sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 3);
      creators.push({ handle, why, profile: g.profile, reels });
    } catch (e) {
      if (e instanceof Paused) {
        paused = e.pause;
        creators.push({ handle, why, error: "Reads are paused." });
      } else creators.push({ handle, why, error: String(e?.message ?? e).slice(0, 200) });
    }
  }
  return fit({ creators, ...(paused ? { paused } : {}) });
}
