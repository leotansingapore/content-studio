// Pace (docs/north-star/items/learn-pace.md): views a day from the gains between real-number pulls, as Virlo keeps a
// snapshot per check and reads the delta. Each pull (realNumbers.ts refreshIfStale, one job for Home, My posts and
// Analytics) records every post's views; the gain since the last pull is spread over the Singapore days the gap
// covers, by hours. No AI, no cap of its own.
//   content-studio-pace-<scoped> (synced, per brand, written whole): PaceState, 40 days and 500 posts, about 15 KB.

import { scoped } from "@/lib/profiles";
import { SAVE_FAILED } from "@/lib/voiceMemory";
import type { MetricsPost } from "@/lib/realNumbers";

export interface PaceState {
  /** ISO time of the first pull. */
  since: string | null;
  /** MetricsPost.id -> views at the last pull. */
  last: { at: string; views: Record<string, number> } | null;
  /** Singapore day -> views gained that day. */
  days: Record<string, number>;
}

export const PACE_CHANGED = "content-studio-pace-changed";
const KEY = "content-studio-pace-";
const MAX_POSTS = 500;
const KEEP_DAYS = 40;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Singapore has kept UTC+8 with no daylight saving since 1982, so its days are fixed offsets.
const SG = 8 * HOUR;
const dayKey = (t: number) => new Date(t + SG).toISOString().slice(0, 10);
const dayStart = (t: number) => Math.floor((t + SG) / DAY) * DAY - SG;

export const emptyPace = (): PaceState => ({ since: null, last: null, days: {} });

/** Which of the three a network fills varies, so views first (the card counts views), then impressions, then reach. */
export const postViews = (p: MetricsPost) => p.numbers.views || p.numbers.impressions || p.numbers.reach;

/**
 * One pull into the state. A known post adds what it gained (never less than 0); a new post published after the last
 * pull adds all its views; a new post published before it (past the last pull's 500, or not listed yet) and a post
 * that disappeared add nothing. The first pull only sets since and last; a pull no newer than the last is ignored.
 */
export function recordPull(state: PaceState, posts: MetricsPost[], at: string): PaceState {
  const kept = posts.slice(0, MAX_POSTS);
  const t = Date.parse(at);
  const views = Object.fromEntries(kept.map((p) => [p.id, postViews(p)]));
  if (!state.last) return { since: at, last: { at, views }, days: {} };
  const from = Date.parse(state.last.at);
  if (!(t > from)) return state;
  let gain = 0;
  for (const p of kept) {
    const then = state.last.views[p.id];
    if (then !== undefined) gain += Math.max(0, postViews(p) - then);
    else if (p.publishedAt && Date.parse(p.publishedAt) > from) gain += postViews(p);
  }
  const days = { ...state.days };
  for (let s = from; s < t; ) {
    const e = Math.min(t, dayStart(s) + DAY);
    days[dayKey(s)] = (days[dayKey(s)] ?? 0) + (gain * (e - s)) / (t - from);
    s = e;
  }
  const oldest = dayKey(t - KEEP_DAYS * DAY);
  for (const k of Object.keys(days)) if (k < oldest) delete days[k];
  return { since: state.since ?? state.last.at, last: { at, views }, days };
}

/** Views a day over [start, end), counted from `since` when that is later, rounded. */
function perDay(days: PaceState["days"], start: number, end: number, since: number): number {
  let sum = 0;
  for (let d = start; d < end; d += DAY) sum += days[dayKey(d)] ?? 0;
  return Math.round(sum / ((end - Math.max(start, since)) / DAY));
}

/** The 7 Singapore days ending on the last pull's day; null under 20 hours after the first pull. */
export function viewsADay(s: PaceState): number | null {
  if (!s.last || !s.since) return null;
  const end = Date.parse(s.last.at);
  const since = Date.parse(s.since);
  if (end - since < 20 * HOUR) return null;
  return perDay(s.days, dayStart(end) - 6 * DAY, end, since);
}

/** The same average over the 28 days before that window; null with under 7 days of history before it. */
export function usualViews(s: PaceState): number | null {
  if (!s.last || !s.since) return null;
  const window = dayStart(Date.parse(s.last.at)) - 6 * DAY;
  const since = Date.parse(s.since);
  if (window - since < 7 * DAY) return null;
  return perDay(s.days, window - 28 * DAY, window, since);
}

/** Up to 1, 2 or 5 times a power of ten. */
export function niceCeil(x: number): number {
  if (x <= 1) return 1;
  let p = 1;
  while (p * 10 <= x) p *= 10;
  return [1, 2, 5, 10].map((m) => m * p).find((v) => v >= x)!;
}

/** The gauge's top: twice the usual, else 1.5 times today's number with a floor of 100. */
export const gaugeMax = (views: number | null, usual: number | null) =>
  usual ? niceCeil(usual * 2) : niceCeil(Math.max((views ?? 0) * 1.5, 100));

/** "+18% on your usual", "-12% on your usual", or "About your usual" inside 5%; null without both numbers. */
export function changeLine(views: number | null, usual: number | null): string | null {
  if (views === null || !usual) return null;
  const pct = Math.round((views / usual - 1) * 100);
  return Math.abs(pct) < 5 ? "About your usual" : `${pct > 0 ? "+" : ""}${pct}% on your usual`;
}

const isNumberMap = (v: unknown): v is Record<string, number> =>
  !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "number" && Number.isFinite(x));

/** The open brand's pace, empty on anything unreadable. */
export function loadPace(userId: string): PaceState {
  try {
    const s = JSON.parse(window.localStorage.getItem(KEY + scoped(userId)) ?? "null") as PaceState | null;
    const lastOk = s?.last === null || (typeof s?.last?.at === "string" && isNumberMap(s.last.views));
    if (s && (s.since === null || typeof s.since === "string") && lastOk && isNumberMap(s.days)) return s;
  } catch {
    // unreadable: start again
  }
  return emptyPace();
}

/** Null when saved, else the line. */
export function savePace(userId: string, s: PaceState): string | null {
  try {
    window.localStorage.setItem(KEY + scoped(userId), JSON.stringify(s));
  } catch {
    return SAVE_FAILED;
  }
  window.dispatchEvent(new Event(PACE_CHANGED));
  return null;
}
