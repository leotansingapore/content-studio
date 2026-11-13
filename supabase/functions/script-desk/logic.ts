// The script desk: what each job carries and how its answer is read. A job holds inputs only (the kind, the dials, a
// topic or hook, the source reel, Me, Product and the avatar; for research, a handle, a reel's code or a topic); the
// worker on Leo's Mac turns them into Claude Code's request with private templates that are never in this repo, or
// reads Instagram's public pages itself (scripts/script-worker/worker.mjs). Answers keep the reference prompts' JSON
// shapes. No Deno or npm imports, so vitest and the worker's e2e can import it.

import { normalizeHandle } from "../_shared/socialAudit.ts";
import type { Band, Dials } from "./dials.ts";

export * from "./dials.ts";

/** Writing runs on Claude Code; research reads Instagram (and a search runs Claude Code with web search first). */
export const WRITE_KINDS = ["write", "hooks", "breakdown", "rescript", "claims"] as const;
export const READ_KINDS = ["ig_reels", "ig_reel", "discover"] as const;
export type JobKind = (typeof WRITE_KINDS)[number] | (typeof READ_KINDS)[number];
export const JOB_KINDS: readonly JobKind[] = [...WRITE_KINDS, ...READ_KINDS];
export const isRead = (k: string): k is (typeof READ_KINDS)[number] => (READ_KINDS as readonly string[]).includes(k);

// ---- Inputs -----------------------------------------------------------------------------------------------------

export const LIMITS = { line: 200, field: 600, story: 1500, sample: 1500, item: 200, items: 10, topic: 300, hook: 200, about: 300 } as const;

/** Who the videos are for: the brand's main audience on /audiences, with its four lists. */
export interface Avatar {
  name: string;
  who: string;
  pains: string[];
  fears: string[];
  desires: string[];
  days: string[];
}

/** Me: who says the scripts. */
export interface Me {
  name: string;
  handle: string;
  what: string;
  story: string;
  results: string[];
  beliefs: string[];
}

/** Product: what they sell. */
export interface Product {
  name: string;
  website: string;
  what: string;
  who: string;
  problem: string;
  how: string[];
  gets: string;
  proof: string;
  replaces: string;
  price: string;
  cta: string;
}

/** Everything a message may say about the creator. Me and Product are null while their switch is off. */
export interface Context {
  avatar: Avatar | null;
  niche: string;
  sample: string;
  me: Me | null;
  product: Product | null;
}

export const EMPTY_CONTEXT: Context = { avatar: null, niche: "", sample: "", me: null, product: null };

/** s cut to max UTF-16 units, never through an emoji: Postgres jsonb refuses half of a surrogate pair. */
export const cut = (s: string, max: number) => {
  const t = s.slice(0, max);
  return /[\ud800-\udbff]$/.test(t) ? t.slice(0, -1) : t;
};

// Control characters out, whitespace runs kept as typed (a story keeps its line breaks), clipped.
const clean = (v: unknown, max: number): string =>
  typeof v === "string" ? cut(v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\r\n?/g, "\n").trim(), max).trim() : "";
const oneLine = (v: unknown, max: number) => clean(v, max).replace(/\s+/g, " ");
const list = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : []).map((x) => oneLine(x, LIMITS.item)).filter(Boolean).slice(0, LIMITS.items);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const anyText = (o: object) => Object.values(o).some((v) => (Array.isArray(v) ? v.length > 0 : Boolean(v)));

export function sanitizeContext(raw: unknown): Context {
  const r = obj(raw) ?? {};
  const a = obj(r.avatar);
  const m = obj(r.me);
  const p = obj(r.product);
  const avatar: Avatar | null = a
    ? { name: oneLine(a.name, LIMITS.line), who: clean(a.who, LIMITS.field), pains: list(a.pains), fears: list(a.fears), desires: list(a.desires), days: list(a.days) }
    : null;
  const me: Me | null = m
    ? { name: oneLine(m.name, LIMITS.line), handle: oneLine(m.handle, LIMITS.line), what: clean(m.what, LIMITS.field), story: clean(m.story, LIMITS.story), results: list(m.results), beliefs: list(m.beliefs) }
    : null;
  const product: Product | null = p
    ? {
        name: oneLine(p.name, LIMITS.line), website: oneLine(p.website, LIMITS.line), what: clean(p.what, LIMITS.field), who: clean(p.who, LIMITS.field),
        problem: clean(p.problem, LIMITS.field), how: list(p.how), gets: clean(p.gets, LIMITS.field), proof: clean(p.proof, LIMITS.field),
        replaces: clean(p.replaces, LIMITS.field), price: clean(p.price, LIMITS.field), cta: clean(p.cta, LIMITS.field),
      }
    : null;
  return {
    avatar: avatar && (avatar.name || avatar.who) ? avatar : null,
    niche: oneLine(r.niche, LIMITS.field),
    sample: clean(r.sample, LIMITS.sample),
    me: me && anyText(me) ? me : null,
    product: product && anyText(product) ? product : null,
  };
}

// ---- The source reel ------------------------------------------------------------------------------------------------

/** A reel as a job carries it: clone-reel's cached post (cs_reel_sources) plus an optional outlier ratio. */
export interface SourceReel {
  platform: string;
  author: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  postedAt: string | null;
  caption: string;
  transcript: string;
  /** How far it beat its creator's usual, and that usual: only where Postmosis knows them (not on /clone). */
  ratio?: number | null;
  median?: number | null;
}

/** A breakdown's answer, which a remix job carries back. */
export interface Breakdown {
  hook: { line: string; type: string; why: string };
  idea: string;
  format: { name: string; beats: string[] };
  visual: string;
  why: string[];
  remix: string[];
}

// ---- What a job carries (033 cs_ai_jobs.request): inputs only ------------------------------------------------------

export type WriteEntry = "dials" | "hook" | "topic" | "same-idea" | "same-structure";
export const WRITE_ENTRIES: readonly WriteEntry[] = ["dials", "hook", "topic", "same-idea", "same-structure"];

/** A job's inputs, each kind with the fields index.ts files for it; the worker's templates read nothing else. */
export interface JobInputs {
  /** write: which of the five ways */
  entry?: WriteEntry;
  topic?: string;
  dials?: Dials;
  length?: number;
  hook?: string;
  about?: string;
  band?: Band;
  /** breakdown, rescript, same-idea, same-structure */
  source?: SourceReel;
  breakdown?: Breakdown | null;
  /** claims: the re-script's original words and its answer */
  original?: string;
  adapted?: string;
  /** ig_reels: whose grid, the codes already read (no embed page for those) and how many embed pages at most */
  handle?: string;
  known?: string[];
  embeds?: number;
  /** ig_reel: the reel's shortcode (the worker builds the page's address itself) */
  code?: string;
  /** discover: a typed topic (search), or the brand's niche and main audience (suggest), and how many to find */
  mode?: "search" | "suggest";
  max?: number;
  /** writing, and a suggest's niche and audience; reads carry none */
  context?: Context;
}

/** An Instagram username from "@name", "name" or a profile link; null when it can't be one. */
export const cleanHandle = (v: unknown): string | null => (typeof v === "string" ? normalizeHandle("instagram", v) : null);
const CODE = /^[A-Za-z0-9_-]{5,40}$/;
/** A reel's shortcode from a reel or post link, or the bare code; null otherwise. */
export function reelCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  const m = t.match(/instagram\.com\/(?:[A-Za-z0-9._]+\/)?(?:reels?|p)\/([A-Za-z0-9_-]+)/i);
  const code = m ? m[1] : t;
  return CODE.test(code) ? code : null;
}
/** The codes a creator's read already has: valid ones, no repeats, the newest 500. */
export const knownCodes = (v: unknown): string[] => [...new Set((Array.isArray(v) ? v : []).filter((c): c is string => typeof c === "string" && CODE.test(c)))].slice(0, 500);


// ---- The queue (033 cs_ai_jobs) -----------------------------------------------------------------------------------

/** A job nobody claims within this is failed: the Mac is off or asleep, and the person stops waiting. */
export const PICKUP_SECONDS = 45;
/** A claimed job with no answer by then is failed: the worker gives Claude Code 3 minutes. */
export const RUN_LIMIT_MS = 4 * 60_000;
/**
 * Reads take longer: a grid and up to 12 embed pages, 3 s apart and shared with the other read slot (about 90 s), and a
 * search runs Claude Code with web search before reading up to 8 grids. The worker stops each well inside these.
 */
export const READ_LIMIT_MS: Record<(typeof READ_KINDS)[number], number> = { ig_reels: 6 * 60_000, ig_reel: 4 * 60_000, discover: 10 * 60_000 };
export const runLimitOf = (k: JobKind) => (isRead(k) ? READ_LIMIT_MS[k] : RUN_LIMIT_MS);
/** At most this many of one owner's writing jobs queued or running at once, and of their reads. */
export const MAX_OPEN = 2;
// as many as the worker has read slots, so a search filed while the page reads never waits past the pickup window
export const MAX_OPEN_READS = 2;
/** How many embed pages an ig_reels read opens at most, and how many creators a search or a suggestion asks for. */
export const MAX_EMBEDS = 12;
export const SEARCH_MAX = 6;
export const SUGGEST_MAX = 8;
/** Rows (the inputs, pasted words, the answer) are kept this long, swept when the owner files again. */
export const KEEP_DAYS = 7;
/** A request bigger than this is refused before it counts: a row holds 64 KB of JSON (033). */
export const MAX_REQUEST_BYTES = 60_000;
export const bytesOf = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

/**
 * Who the script desk is for, and whose jobs Leo's worker runs: NORTH_STAR_USERS' real ids only. Never "*", which
 * isAllowed would read as everyone: their jobs would be filed and then never run (they run on Leo's own plan).
 */
export const ownersOf = (list: string | undefined) =>
  (list ?? "").split(",").map((s) => s.trim()).filter((s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s));

export const DESK_COPY = {
  notAllowed: "This isn't switched on for your account yet.",
  tooMany: "Two are already running. Wait for one to finish, then try again.",
  notCloned: "Read this reel on Clone a reel first, then try again.",
  noWords: "This reel has no spoken words to re-script.",
  noWorker: "Your Mac didn't pick this up. Check the script worker is running on it, then try again.",
  stalled: "Claude Code on your Mac didn't finish this. Try again.",
  unreadable: "Claude's answer couldn't be read. Try again.",
  notReady: "That re-script isn't finished yet.",
  tooBig: "That's too long to send in one go. Shorten Me, Product or the audience, or pick a shorter reel.",
  gone: "That job isn't there any more. Start it again.",
  stopped: "Stopped.",
  tooManyReads: "Two reads are already running on your Mac. Wait for one to finish, then try again.",
  badHandle: "That doesn't look like an Instagram username.",
  badReel: "Paste an Instagram reel link.",
  noNiche: "Add your niche on Your voice, or a main audience, first.",
} as const;

// ---- Reading the answers ------------------------------------------------------------------------------------------

/** The JSON object in Claude's answer: bare, or inside a ``` fence, or between the first { and the last }. */
export function jsonOf(text: unknown): Record<string, unknown> | null {
  if (typeof text !== "string") return null;
  const tries = [text.trim(), text.replace(/^[\s\S]*?```(?:json)?\s*/i, "").replace(/```[\s\S]*$/, "").trim(), text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)];
  for (const t of tries) {
    try {
      const v = JSON.parse(t);
      if (obj(v)) return v as Record<string, unknown>;
    } catch {
      // the next way
    }
  }
  return null;
}

const str = (v: unknown, max = 8000) => (typeof v === "string" ? cut(v.trim(), max) : "");
const strs = (v: unknown, max = 12, each = 600) => (Array.isArray(v) ? v.map((x) => str(x, each)).filter(Boolean).slice(0, max) : []);

export interface Script {
  title: string;
  script: string;
  hooks: { hook: string; formula: string }[];
  flags: string[];
  notes: string[];
}

export function readScript(text: unknown): Script | null {
  const j = jsonOf(text);
  const script = str(j?.script);
  if (!j || !script) return null;
  const hooks = (Array.isArray(j.hooks) ? j.hooks : [])
    .map((h) => ({ hook: str(obj(h)?.hook, 300), formula: str(obj(h)?.formula, 60) }))
    .filter((h) => h.hook)
    .slice(0, 6);
  return { title: str(j.title, 120), script, hooks, flags: strs(j.flags), notes: strs(j.notes) };
}

export function readHooks(text: unknown): { hook: string; pattern: string }[] | null {
  const j = jsonOf(text);
  const hooks = (Array.isArray(j?.hooks) ? (j!.hooks as unknown[]) : [])
    .map((h) => ({ hook: str(obj(h)?.hook, 300), pattern: str(obj(h)?.pattern, 60) }))
    .filter((h) => h.hook)
    .slice(0, 16);
  return hooks.length ? hooks : null;
}

export function readBreakdown(text: unknown): Breakdown | null {
  return cleanBreakdown(jsonOf(text));
}

/** A breakdown from Claude, or one the app sends back for a remix: every field clipped; null without a hook line. */
export function cleanBreakdown(raw: unknown): Breakdown | null {
  const j = obj(raw);
  const hook = obj(j?.hook);
  const format = obj(j?.format);
  const line = str(hook?.line, 400);
  if (!j || !line) return null;
  return {
    hook: { line, type: str(hook?.type, 80), why: str(hook?.why, 600) },
    idea: str(j.idea, 600),
    format: { name: str(format?.name, 120), beats: strs(format?.beats, 8, 300) },
    visual: str(j.visual, 600),
    why: strs(j.why, 5),
    remix: strs(j.remix, 5),
  };
}

export interface Rescript {
  script: string;
  changes: { from: string; to: string; why: string }[];
  fill: string[];
}

export function readRescript(text: unknown): Rescript | null {
  const j = jsonOf(text);
  const script = str(j?.script);
  if (!j || !script) return null;
  const changes = (Array.isArray(j.changes) ? j.changes : [])
    .map((c) => ({ from: str(obj(c)?.from, 1000), to: str(obj(c)?.to, 1000), why: str(obj(c)?.why, 80) }))
    .filter((c) => c.from || c.to)
    .slice(0, 40);
  return { script, changes, fill: strs(j.fill, 40, 120) };
}

export interface Unsupported {
  sentence: string;
  claim: string;
  fixed: string;
}

export function readClaims(text: unknown): Unsupported[] | null {
  const j = jsonOf(text);
  if (!j || !Array.isArray(j.unsupported)) return null;
  return j.unsupported
    .map((u) => ({ sentence: str(obj(u)?.sentence, 1000), claim: str(obj(u)?.claim, 400), fixed: str(obj(u)?.fixed, 1000) }))
    .filter((u) => u.sentence && u.fixed)
    .slice(0, 40);
}

/** The adapted script with each unsupported sentence swapped for its placeholder version (where it is found). */
export const applyClaims = (script: string, unsupported: Unsupported[]) =>
  unsupported.reduce((s, u) => (s.includes(u.sentence) ? s.replace(u.sentence, () => u.fixed) : s), script);

// ---- Research answers (the worker's own JSON: ig_reels, ig_reel, discover) ------------------------------------------

/** A public Instagram profile, as the reels grid shows it. */
export interface IgProfile {
  handle: string;
  name: string;
  followers: number | null;
  posts: number | null;
  avatar: string;
  bio: string;
}

/** One reel: its numbers from the grid (views are plays), and a caption and video only where an embed page was read. */
export interface IgReel {
  code: string;
  url: string;
  owner: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  pinned: boolean;
  takenAt: string | null;
  thumb: string;
  caption: string;
  video: string;
}

/** Instagram stopped the Mac's reads (a login wall, or "please wait"): every read waits until `until`. */
export interface IgPause {
  until: string;
  why: "login" | "wait";
}

export interface DiscoverCreator {
  handle: string;
  why: string;
  profile: IgProfile | null;
  /** The grid's reels, best first (no captions: a search reads no embed pages). */
  reels: IgReel[];
  error: string;
}

const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
// images and videos only from Instagram's own hosts, so nothing else ends up in an <img> or a link
const igUrl = (v: unknown) => {
  const s = str(v, 2000);
  try {
    const u = new URL(s);
    return u.protocol === "https:" && /(^|\.)(cdninstagram\.com|fbcdn\.net|instagram\.com)$/.test(u.hostname) ? s : "";
  } catch {
    return "";
  }
};
const isoOf = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)) ? v.slice(0, 24) : null);

export function cleanProfile(raw: unknown): IgProfile | null {
  const p = obj(raw);
  const handle = cleanHandle(p?.handle);
  if (!p || !handle) return null;
  return { handle, name: str(p.name, 120), followers: count(p.followers), posts: count(p.posts), avatar: igUrl(p.avatar), bio: str(p.bio, 400) };
}

export function cleanReel(raw: unknown): IgReel | null {
  const r = obj(raw);
  const code = reelCode(r?.code);
  if (!r || !code) return null;
  return {
    code,
    url: `https://www.instagram.com/reel/${code}/`,
    owner: cleanHandle(r.owner) ?? "",
    views: count(r.views),
    likes: count(r.likes),
    comments: count(r.comments),
    pinned: r.pinned === true,
    takenAt: isoOf(r.takenAt),
    thumb: igUrl(r.thumb),
    caption: str(r.caption, 2200),
    video: igUrl(r.video),
  };
}

const reelsOf = (v: unknown, max: number) => (Array.isArray(v) ? v.map(cleanReel).filter((r): r is IgReel => r !== null).slice(0, max) : []);

function pauseOf(j: Record<string, unknown> | null): IgPause | null {
  const p = obj(j?.paused);
  const until = isoOf(p?.until);
  return p && until ? { until, why: p.why === "wait" ? "wait" : "login" } : null;
}

/**
 * A creator's grid read, and the pause when one stopped it (before the grid, so no profile, or part way through the
 * embed pages, so some reels have no caption); null when the answer holds neither.
 */
export function readIgReels(text: unknown): { profile: IgProfile | null; reels: IgReel[]; paused: IgPause | null } | null {
  const j = jsonOf(text);
  const paused = pauseOf(j);
  const profile = cleanProfile(j?.profile);
  return profile || paused ? { profile, reels: profile ? reelsOf(j?.reels, 40) : [], paused } : null;
}

export function readIgReel(text: unknown): { reel: IgReel | null; paused: IgPause | null } | null {
  const j = jsonOf(text);
  const paused = pauseOf(j);
  const reel = cleanReel(j?.reel);
  return reel || paused ? { reel, paused } : null;
}

/** A search's creators, each read or with the reason it couldn't be, and the pause when one stopped the reads. */
export function readDiscover(text: unknown): { creators: DiscoverCreator[]; paused: IgPause | null } | null {
  const j = jsonOf(text);
  if (!j || !Array.isArray(j.creators)) return null;
  const creators = j.creators
    .map((c): DiscoverCreator | null => {
      const o = obj(c);
      const handle = cleanHandle(o?.handle);
      return o && handle ? { handle, why: str(o.why, 200), profile: cleanProfile(o.profile), reels: reelsOf(o.reels, 12), error: str(o.error, 300) } : null;
    })
    .filter((c): c is DiscoverCreator => c !== null)
    .slice(0, SUGGEST_MAX);
  return { creators, paused: pauseOf(j) };
}
