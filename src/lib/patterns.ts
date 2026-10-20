// What worked for a followed account (/following?account=<platform>:<handle>&view=patterns, Leo only;
// docs/north-star/items/remix-patterns.md part A). The device scores each post against the account's own usual
// (scoreAccount), sends the posts with numbers best first and the top 3 at 1.5x or more to remix-patterns, and keeps
// the answer per account in one synced key, so opening it again is free; a newer Following check offers "Run again".
// The run is a job outside React, so leaving the page keeps it going.

import { callFn, type EdgeError } from "@/lib/edgeFn";
import type { FollowedAccount, TrackedPost } from "@/lib/following";
import { links } from "@/lib/links";
import { scoped } from "@/lib/profiles";
import { sourceKey, type RemixSource } from "@/lib/remixSource";
import { OUTLIER, byOutlier, scoreAccount, type Outlier } from "../../supabase/functions/_shared/outlier.ts";
import { FORMULAS, MAX_POSTS, patternName, type Idea, type PatternsResult } from "../../supabase/functions/remix-patterns/logic.ts";

export type { Idea, Pattern, PatternsResult, PostTags } from "../../supabase/functions/remix-patterns/logic.ts";
export { patternName };

export interface PatternEntry extends PatternsResult {
  /** The Following check the run read. */
  checkedAt: string;
  ranAt: string;
  /** The best post ids it was sent, so the counts read "k of their 3 best posts". */
  best: string[];
}
export type PatternsState = Record<string, PatternEntry>;

/** "Needs 8 posts with numbers." */
export const MIN_POSTS = 8;
export const FAILED = "Couldn't read their posts. Try again.";
const KEY = "content-studio-patterns-";
const CHANGED = "content-studio-patterns-changed";

export const accountKey = (a: Pick<FollowedAccount, "platform" | "handle">) => `${a.platform}:${a.handle}`;

const isEntry = (e: unknown): e is PatternEntry => {
  const x = (e ?? {}) as Record<string, unknown>;
  return typeof x.checkedAt === "string" && typeof x.ranAt === "string" && !!x.tags && typeof x.tags === "object" &&
    Array.isArray(x.patterns) && Array.isArray(x.ideas) && (x.from === "patterns" || x.from === "best");
};

export function loadPatterns(userId: string): PatternsState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY + scoped(userId)) ?? "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter(([, e]) => isEntry(e)).map(([k, e]) => [k, { ...(e as PatternEntry), best: Array.isArray((e as PatternEntry).best) ? (e as PatternEntry).best : [] }]));
  } catch {
    return {};
  }
}

/** Keeps the entry; when storage is full, drops the oldest runs until it fits. */
export function savePattern(userId: string, key: string, entry: PatternEntry): PatternsState {
  const all = Object.entries({ ...loadPatterns(userId), [key]: entry }).sort(([, a], [, b]) => b.ranAt.localeCompare(a.ranAt));
  let saved: PatternsState = {};
  for (let n = all.length; n >= 1; n--) {
    try {
      saved = Object.fromEntries(all.slice(0, n));
      localStorage.setItem(KEY + scoped(userId), JSON.stringify(saved));
      break;
    } catch {
      // storage full: one run fewer
    }
  }
  globalThis.dispatchEvent?.(new Event(CHANGED));
  return saved;
}

/** Calls `cb` whenever a result is saved on this device. */
export function onPatternsChanged(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
}

/** A cached result read an older Following check, so "Run again" shows. */
export const isStale = (e: PatternEntry | undefined, a: Pick<FollowedAccount, "checkedAt">) =>
  Boolean(e && a.checkedAt && Date.parse(a.checkedAt) > Date.parse(e.checkedAt));

// ---- Which posts go ------------------------------------------------------------------------------------------------

export interface Scored {
  post: TrackedPost;
  outlier: Outlier;
}

/** Posts with numbers (a score against the account's usual), best first, at most 12, and the top 3 at 1.5x or more. */
export function scoredPosts(a: Pick<FollowedAccount, "posts">, now = Date.now()): { scored: Scored[]; best: Scored[] } {
  const scores = scoreAccount(a.posts, now);
  const time = (p: TrackedPost) => Date.parse(p.postedAt ?? "") || 0;
  const scored = a.posts
    .map((post) => ({ post, outlier: scores[post.id] }))
    .filter((s) => s.outlier?.ratio != null)
    .sort((x, y) => byOutlier(x.outlier, y.outlier) || time(y.post) - time(x.post))
    .slice(0, MAX_POSTS);
  return { scored, best: scored.filter((s) => (s.outlier.ratio ?? 0) >= OUTLIER.tiers.above).slice(0, 3) };
}

// ---- The run, outside React --------------------------------------------------------------------------------------

export interface PatternRun {
  at: number;
  /** Posts sent: "Reading their {n} posts". */
  n: number;
}

const running = new Map<string, PatternRun>();
const failures = new Map<string, { message: string; code: string }>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const patternRun = (a: Pick<FollowedAccount, "platform" | "handle">) => running.get(accountKey(a)) ?? null;
export const patternFailure = (a: Pick<FollowedAccount, "platform" | "handle">) => failures.get(accountKey(a)) ?? null;
export function onPatternRun(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const steps = (n: number) => [`Reading their ${n} posts`, "Finding what their best posts share", "Writing ideas for you"];
// shortcut: the three steps are one server call, so they move on its usual timing (Jev about 3 s, then the writer);
// switch to real signals if the function ever streams.
export const stepAt = (ms: number) => (ms < 1500 ? 0 : ms < 6000 ? 1 : 2);

/** Stops waiting and drops the answer. shortcut: the call itself runs on, so a run the server finishes still counts its use. */
export function cancelPatterns(a: Pick<FollowedAccount, "platform" | "handle">): void {
  running.delete(accountKey(a));
  emit();
}

/** One paid run for this account; the answer lands in the synced key. */
export async function runPatterns(userId: string, a: FollowedAccount): Promise<void> {
  const k = accountKey(a);
  if (running.has(k) || !a.checkedAt) return;
  const checkedAt = a.checkedAt;
  const { scored, best } = scoredPosts(a);
  const run: PatternRun = { at: Date.now(), n: scored.length };
  running.set(k, run);
  failures.delete(k);
  emit();
  try {
    // loaded on a press, so Following's chunk doesn't carry the brand and voice readers
    const [{ brandFacts }, { voiceForClone, winnersFor }, { loadVoiceProfile }] = await Promise.all([
      import("@/lib/competitors"),
      import("@/lib/reelClone"),
      import("@/lib/voiceProfile"),
    ]);
    const { name, serves, sells, topics } = brandFacts(userId);
    const r = await callFn<PatternsResult>(
      "remix-patterns",
      {
        account: { platform: a.platform, handle: a.handle },
        checkedAt,
        posts: scored.map(({ post }) => ({ id: post.id, caption: post.caption.slice(0, 240), format: post.format })),
        best: best.map((s) => s.post.id),
        brand: { name, serves, sells, topics },
        voice: voiceForClone(loadVoiceProfile(userId), winnersFor(userId)),
      },
      FAILED,
    );
    if (running.get(k) !== run) return;
    savePattern(userId, k, { tags: r.tags ?? {}, patterns: r.patterns ?? [], ideas: r.ideas ?? [], from: r.from === "patterns" ? "patterns" : "best", checkedAt, ranAt: new Date().toISOString(), best: best.map((s) => s.post.id) });
  } catch (e) {
    if (running.get(k) !== run) return;
    const err = e as EdgeError;
    failures.set(k, { message: err.message || FAILED, code: err.code ?? "" });
  } finally {
    if (running.get(k) === run) running.delete(k);
    emit();
  }
}

// ---- Ideas as remix sources --------------------------------------------------------------------------------------

const SOURCE_FORMAT = { post: "text", carousel: "carousel", script: "video" } as const;
const WRITE_FORMAT = { post: "text-post", carousel: "carousel", script: "short-video" } as const;

const ideaText = (a: Pick<FollowedAccount, "handle">, idea: Idea) =>
  [idea.hook, idea.angle, idea.patterns.length ? `Pattern from @${a.handle}'s best posts: ${idea.patterns.join(", ")}.` : ""].filter(Boolean).join("\n");

/** Idea n (1 to 3) as the source RemixButton opens the sheet on: pattern:<platform>:<handle>:<n>. */
export function ideaSource(a: Pick<FollowedAccount, "platform" | "handle">, idea: Idea, n: number): RemixSource {
  return {
    key: sourceKey.pattern(a.platform, a.handle, n),
    kind: "pattern",
    format: SOURCE_FORMAT[idea.format],
    platform: a.platform,
    author: `@${a.handle}`,
    title: idea.hook.slice(0, 120),
    caption: ideaText(a, idea).slice(0, 400),
    remixedAt: "",
  };
}

/** Write on the idea, for the frame before the session is read: its hook, formula and format, and the pattern. */
export function ideaWriteUrl(a: Pick<FollowedAccount, "platform" | "handle">, idea: Idea, n: number): string {
  const formula = FORMULAS.find((f) => idea.patterns.includes(patternName({ field: "formula", value: f.id })))?.id;
  const ctx = [
    `Pattern from @${a.handle}'s best posts: ${idea.patterns.join(", ") || "their best posts"}. ${idea.angle}`,
    "Use the pattern, not their words or topic. Keep it compliant to post in Singapore.",
  ].join("\n");
  return links.generate({ pillar: "topic", detail: idea.hook.slice(0, 120), formula, format: WRITE_FORMAT[idea.format], ctx, source: sourceKey.pattern(a.platform, a.handle, n) });
}
