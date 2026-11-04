// The script desk (wave 1): what each job carries and how its answer is read. A job
// holds inputs only (the kind, the dials, a topic or hook, the source reel, Me, Product and the avatar); the worker on
// Leo's Mac turns them into Claude Code's request with private templates that are never in this repo
// (scripts/script-worker/worker.mjs). Answers keep the reference prompts' JSON shapes.
// No Deno or npm imports, so vitest and the worker's e2e can import it.

import type { Band, Dials } from "./dials.ts";

export * from "./dials.ts";

export type JobKind = "write" | "hooks" | "breakdown" | "rescript" | "claims";
export const JOB_KINDS: readonly JobKind[] = ["write", "hooks", "breakdown", "rescript", "claims"];

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
  context: Context;
}

// ---- The queue (033 cs_ai_jobs) -----------------------------------------------------------------------------------

/** A job nobody claims within this is failed: the Mac is off or asleep, and the person stops waiting. */
export const PICKUP_SECONDS = 45;
/** A claimed job with no answer by then is failed: the worker gives Claude Code 3 minutes. */
export const RUN_LIMIT_MS = 4 * 60_000;
/** At most this many of one owner's jobs queued or running at once. */
export const MAX_OPEN = 4;
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
  tooMany: "Four are already running. Wait for one to finish, then try again.",
  notCloned: "Read this reel on Clone a reel first, then try again.",
  noWords: "This reel has no spoken words to re-script.",
  noWorker: "Your Mac didn't pick this up. Check the script worker is running on it, then try again.",
  stalled: "Claude Code on your Mac didn't finish this. Try again.",
  unreadable: "Claude's answer couldn't be read. Try again.",
  notReady: "That re-script isn't finished yet.",
  tooBig: "That's too long to send in one go. Shorten Me, Product or the audience, or pick a shorter reel.",
  gone: "That job isn't there any more. Start it again.",
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
