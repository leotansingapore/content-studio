// Which formats and hooks win for you (docs/north-star/items/learn-format-winners.md): each posted draft with numbers
// in 90 days against your usual on its own network (outlier.ts scoreAccount, the feeds' rule), grouped by format, hook
// or angle, a group's score being the median ratio of 3 or more scored posts. Hooks and angles of posts written
// without a formula come from Jev (writing-judge `tags`, a job outside React), and Jev's `try-next` picks untried hooks
// once a week. Scores are worked out on each render and never stored.
//   content-studio-post-tags-<scoped> (synced, per brand, written whole): PostTags; tags of deleted drafts dropped.

import { callFn, EdgeError } from "@/lib/edgeFn";
import { scoped } from "@/lib/profiles";
import { links } from "@/lib/links";
import { draftStatus, engagement, loadDrafts, type DraftEntry } from "@/lib/draftHistory";
import { labelForDimension, withReal } from "@/lib/analytics";
import { HOOK_FORMULAS, hookFormula } from "@/lib/hookFormulas";
import { ANGLES, type Angle } from "@/lib/postLabels";
import { loadPositioning } from "@/lib/positioning";
import { toPlainText } from "@/lib/plainText";
import { SAVE_FAILED } from "@/lib/voiceMemory";
import { median } from "../../supabase/functions/_shared/socialAudit.ts";
import { scoreAccount, times, type OutlierPost } from "../../supabase/functions/_shared/outlier.ts";

export type WinsBy = "format" | "hook" | "angle";

export interface TagEntry {
  angle: Angle | "unclear";
  /** A HOOK_FORMULAS id, "none" or "unclear"; asked only for posts written without a formula. */
  hook?: string;
  at: string;
}

export interface PostTags {
  tags: Record<string, TagEntry>;
  /** Monday of the Singapore week, and the formula ids Jev picked. */
  tryNext?: { week: string; hooks: string[] };
}

export interface WinRow {
  key: string;
  label: string;
  posts: number;
  /** The median ratio to your usual; null under 3 scored posts ("Too few to say"). */
  score: number | null;
  /** The network with the most scored posts in the group (ties: the newest post's). */
  platform: string;
}

const DAY = 86_400_000;
const WINDOW = 90 * DAY;
const MIN_SCORED = 3;
const BEST_MIN = 1.2;
const BATCH = 20;
const SG = 8 * 3_600_000;
// FORMAT_OPTIONS' order (postInsights.ts, not imported so Analytics doesn't carry the swipe file)
const FORMATS = ["short-video", "carousel", "text-post"];
const UNREAD = "Angles show once your posts are read. Try again later.";

const timeOf = (d: DraftEntry) => Date.parse(d.postedAt ?? d.scheduledFor ?? "");
const postedIn90 = (drafts: DraftEntry[], now: number) => drafts.filter((d) => draftStatus(d) === "posted" && now - timeOf(d) <= WINDOW);
const hasNumbers = (d: DraftEntry) => !!d.metrics && !!(d.metrics.impressions || engagement(d.metrics));
const isAngle = (a: unknown): a is TagEntry["angle"] => a === "unclear" || (ANGLES as readonly unknown[]).includes(a);
const isHook = (h: unknown): h is string => h === "none" || h === "unclear" || (typeof h === "string" && !!hookFormula(h));

const toOutlier = (d: DraftEntry): OutlierPost => ({
  id: d.id,
  postedAt: d.postedAt ?? d.scheduledFor ?? null,
  views: d.metrics?.impressions ? d.metrics.impressions : null,
  likes: d.metrics?.reactions ?? 0,
  comments: d.metrics?.comments ?? 0,
  shares: d.metrics?.shares ?? 0,
});

/** Posted drafts with numbers (typed or real) in 90 days, each with its ratio to the usual on its own network. */
function scored(drafts: DraftEntry[], now: number): { d: DraftEntry; ratio: number | null }[] {
  const pool = postedIn90(drafts, now).map(withReal).filter(hasNumbers);
  return [...new Set(pool.map((d) => d.platform))].flatMap((platform) => {
    const mine = pool.filter((d) => d.platform === platform);
    const s = scoreAccount(mine.map(toOutlier), now);
    return mine.map((d) => ({ d, ratio: s[d.id]?.ratio ?? null }));
  });
}

function keyOf(by: WinsBy, d: DraftEntry, tags: PostTags): string | null {
  const t = tags.tags[d.id];
  if (by === "format") return d.format || null;
  if (by === "hook") return d.hookFormula || (t?.hook && hookFormula(t.hook) ? t.hook : null);
  return t && t.angle !== "unclear" ? t.angle : null;
}

const labelOf = (by: WinsBy, key: string) => (by === "format" ? labelForDimension("format", key) : by === "hook" ? (hookFormula(key)?.name ?? key) : key);

function platformOf(list: { d: DraftEntry; ratio: number | null }[]): string {
  const pick = list.some((s) => s.ratio !== null) ? list.filter((s) => s.ratio !== null) : list;
  const count = new Map<string, number>();
  for (const s of pick) count.set(s.d.platform, (count.get(s.d.platform) ?? 0) + 1);
  const top = Math.max(...count.values());
  return pick.filter((s) => count.get(s.d.platform) === top).sort((a, b) => timeOf(b.d) - timeOf(a.d))[0].d.platform;
}

/** One tab's rows, best first; groups under 3 scored posts last, with no score. */
export function winnerRows(drafts: DraftEntry[], by: WinsBy, tags: PostTags, now: number): WinRow[] {
  const groups = new Map<string, { d: DraftEntry; ratio: number | null }[]>();
  for (const s of scored(drafts, now)) {
    const k = keyOf(by, s.d, tags);
    if (k) groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups]
    .map(([key, list]) => {
      const ratios = list.flatMap((s) => (s.ratio === null ? [] : [s.ratio]));
      return { key, label: labelOf(by, key), posts: list.length, score: ratios.length >= MIN_SCORED ? median(ratios) : null, platform: platformOf(list) };
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.posts - a.posts || a.label.localeCompare(b.label));
}

/** Per dimension, the top group on that network with 3 or more scored posts at 1.2x or more ("Wins for you"). */
export function bestFor(userId: string, platform: string, now = Date.now()): { format?: string; formula?: string; angle?: string } {
  const drafts = loadDrafts(userId).filter((d) => d.platform === platform);
  const tags = loadTags(userId);
  const top = (by: WinsBy) => winnerRows(drafts, by, tags, now).find((r) => r.score !== null && r.score >= BEST_MIN)?.key;
  return Object.fromEntries(Object.entries({ format: top("format"), formula: top("hook"), angle: top("angle") }).filter(([, v]) => v));
}

/** Formats with no post in 90 days on the network you post on most, best niche figure first. */
export function untriedFormats(drafts: DraftEntry[], now: number, niche: { value: string; ratio: number }[] = []): { format: string; label: string; niche: number | null }[] {
  const recent = postedIn90(drafts, now);
  const count = new Map<string, number>();
  for (const d of recent) count.set(d.platform, (count.get(d.platform) ?? 0) + 1);
  const main = [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
  const tried = new Set(recent.filter((d) => d.platform === main).map((d) => d.format));
  return FORMATS.filter((f) => !tried.has(f))
    .map((f) => ({ format: f, label: labelForDimension("format", f), niche: niche.find((n) => n.value === f)?.ratio ?? null }))
    .sort((a, b) => (b.niche ?? -1) - (a.niche ?? -1));
}

/** Hook formula ids with no post in 90 days, by the formula it was written with or Jev's tag. */
export function untriedHooks(drafts: DraftEntry[], tags: PostTags, now: number): string[] {
  const used = new Set(postedIn90(drafts, now).flatMap((d) => [d.hookFormula, tags.tags[d.id]?.hook]));
  return HOOK_FORMULAS.map((f) => f.id).filter((id) => !used.has(id));
}

/** "Last 90 days, 24 posts with numbers", or "Since 19 Aug, ..." when the list holds less than 90 days. */
export function subLine(drafts: DraftEntry[], now: number): string {
  const n = postedIn90(drafts, now).map(withReal).filter(hasNumbers).length;
  const count = `${n} ${n === 1 ? "post" : "posts"} with numbers`;
  const oldest = Math.min(...drafts.filter((d) => draftStatus(d) === "posted").map(timeOf).filter(Number.isFinite));
  if (!Number.isFinite(oldest) || now - oldest > WINDOW) return `Last 90 days, ${count}`;
  return `Since ${new Date(oldest).toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "Asia/Singapore" })}, ${count}`;
}

const MAS = "Keep it compliant for a licensed Singapore financial adviser.";

/** "Make another": Write in that group's shape on its network, with the no-copy line. */
export function makeAnotherUrl(by: WinsBy, row: WinRow): string {
  return links.generate({
    platform: row.platform,
    format: by === "format" ? row.key : undefined,
    formula: by === "hook" ? row.key : undefined,
    ctx: `My ${row.label} posts${row.score !== null ? ` get ${times(row.score)} my usual` : ""}. Write a new post in that shape on a fresh topic. Do not reuse my earlier wording. ${MAS}`,
  });
}

/** "Try it" on something not tried yet. */
export function tryItUrl(kind: "format" | "hook", key: string, platform: string): string {
  const name = kind === "hook" ? `the ${hookFormula(key)?.name ?? key} hook` : labelForDimension("format", key);
  return links.generate({
    platform,
    format: kind === "format" ? key : undefined,
    formula: kind === "hook" ? key : undefined,
    ctx: `I haven't tried ${name} yet. Write one post with it. ${MAS}`,
  });
}

// ---- the store ----

export const POST_TAGS_CHANGED = "content-studio-post-tags-changed";
const KEY = "content-studio-post-tags-";

export function loadTags(userId: string): PostTags {
  try {
    const s = JSON.parse(window.localStorage.getItem(KEY + scoped(userId)) ?? "null");
    if (!s || typeof s !== "object" || !s.tags || typeof s.tags !== "object") return { tags: {} };
    const tags = Object.fromEntries(
      Object.entries(s.tags as Record<string, TagEntry>).filter(([, t]) => t && isAngle(t.angle) && (t.hook === undefined || isHook(t.hook)) && typeof t.at === "string"),
    );
    const t = s.tryNext;
    return t && typeof t.week === "string" && Array.isArray(t.hooks) ? { tags, tryNext: { week: t.week, hooks: t.hooks.filter(isHook) } } : { tags };
  } catch {
    return { tags: {} };
  }
}

/** Null when saved, else the line. Tags of drafts no longer in the list are dropped. */
export function saveTags(userId: string, t: PostTags): string | null {
  const ids = new Set(loadDrafts(userId).map((d) => d.id));
  const tags = Object.fromEntries(Object.entries(t.tags).filter(([id]) => ids.has(id)));
  try {
    window.localStorage.setItem(KEY + scoped(userId), JSON.stringify({ ...t, tags }));
  } catch {
    return SAVE_FAILED;
  }
  window.dispatchEvent(new Event(POST_TAGS_CHANGED));
  return null;
}

// ---- tagging your posts (a job outside React) ----

export interface TagJob {
  running: boolean;
  done: number;
  total: number;
  /** Jev had no answer or the call failed ("unavailable"), or the cap ("daily_limit"): nothing was stored for that batch. */
  error: { message: string; code: string } | null;
}

const idle = (): TagJob => ({ running: false, done: 0, total: 0, error: null });
const tagJobs = new Map<string, TagJob>();
const tagRuns = new Map<string, Promise<void>>();
const tagListeners = new Set<() => void>();

export const tagJob = (userId: string): TagJob => tagJobs.get(scoped(userId)) ?? idle();

export function onTags(cb: () => void): () => void {
  tagListeners.add(cb);
  return () => tagListeners.delete(cb);
}

/** Tags every posted post with numbers that has none yet, newest first, 20 a call, until done, refused or capped. */
export function tagPosts(userId: string, now: () => number = Date.now): Promise<void> {
  const scope = scoped(userId);
  const going = tagRuns.get(scope);
  if (going) return going;
  const p = runTags(userId, scope, now).finally(() => tagRuns.delete(scope));
  tagRuns.set(scope, p);
  return p;
}

async function runTags(userId: string, scope: string, now: () => number): Promise<void> {
  const set = (j: Partial<TagJob>) => {
    tagJobs.set(scope, { ...(tagJobs.get(scope) ?? idle()), ...j });
    tagListeners.forEach((l) => l());
  };
  // each post is asked once a run, so one Jev can't read is never asked again in a loop
  const asked = new Set<string>();
  const untagged = () => {
    const t = loadTags(userId).tags;
    return loadDrafts(userId)
      .filter((d) => draftStatus(d) === "posted" && hasNumbers(withReal(d)) && !t[d.id] && !asked.has(d.id))
      .sort((a, b) => timeOf(b) - timeOf(a));
  };
  let todo = untagged();
  let done = 0;
  let error: TagJob["error"] = null;
  set({ running: true, done, total: todo.length, error });
  while (todo.length && scoped(userId) === scope) {
    const batch = todo.slice(0, BATCH);
    batch.forEach((d) => asked.add(d.id));
    try {
      const r = await callFn<{ tags?: unknown }>("writing-judge", {
        mode: "tags",
        posts: batch.map((d) => ({ id: d.id, text: toPlainText(d.draft).slice(0, 600), needHook: !d.hookFormula })),
      });
      if (!r?.tags || typeof r.tags !== "object") {
        error = { message: UNREAD, code: "unavailable" };
        break;
      }
      // another brand opened while Jev read: these drafts aren't on screen any more
      if (scoped(userId) !== scope) break;
      const answers = r.tags as Record<string, { angle?: unknown; hook?: unknown } | undefined>;
      const at = new Date(now()).toISOString();
      const got: Record<string, TagEntry> = {};
      for (const d of batch) {
        const a = answers[d.id];
        if (a && isAngle(a.angle)) got[d.id] = { angle: a.angle, ...(isHook(a.hook) ? { hook: a.hook } : {}), at };
      }
      const cur = loadTags(userId);
      saveTags(userId, { ...cur, tags: { ...cur.tags, ...got } });
      set({ done: (done += batch.length) });
    } catch (e) {
      error = e instanceof EdgeError && e.status === 429 ? { message: e.message, code: e.code || "daily_limit" } : { message: UNREAD, code: "unavailable" };
      break;
    }
    todo = untagged();
  }
  set({ running: false, error });
}

// ---- hooks to try next ----

/** Monday of the Singapore week ("YYYY-MM-DD"); 1 Jan 1970 was a Thursday. */
function weekOf(now: number): string {
  const day = Math.floor((now + SG) / DAY);
  return new Date((day - ((day + 3) % 7)) * DAY).toISOString().slice(0, 10);
}

/**
 * Up to 2 untried hook formulas Jev says suit your audience and topics, asked once a Singapore week. Empty (and the
 * block hidden) with no positioning saved, nothing untried, or no answer from Jev; only an answer is cached.
 */
export async function tryNextHooks(userId: string, now = Date.now()): Promise<string[]> {
  const week = weekOf(now);
  const tags = loadTags(userId);
  if (tags.tryNext?.week === week) return tags.tryNext.hooks;
  const pos = loadPositioning(userId);
  if (!pos) return [];
  const drafts = loadDrafts(userId);
  const untried = untriedHooks(drafts, tags, now);
  if (!untried.length) return [];
  const best = scored(drafts, now)
    .filter((s) => s.ratio !== null)
    .sort((a, b) => b.ratio! - a.ratio!)
    .slice(0, 3)
    .map((s) => s.d.hook)
    .filter(Boolean);
  try {
    const r = await callFn<{ hooks?: unknown }>("writing-judge", { mode: "try-next", audience: pos.audienceDetail || pos.audience, topics: pos.topics, best, untried });
    if (!Array.isArray(r?.hooks)) return [];
    const hooks = r.hooks.filter((h): h is string => typeof h === "string" && untried.includes(h)).slice(0, 2);
    saveTags(userId, { ...loadTags(userId), tryNext: { week, hooks } });
    return hooks;
  } catch {
    return [];
  }
}
