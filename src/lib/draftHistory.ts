// Draft history storage.
//
// Per-user FIFO list of generated drafts, capped at MAX_DRAFTS.
// Persisted to localStorage:
//   key: content-studio-drafts-${userId}
//
// Once the SUPABASE handoff lands (content_studio_drafts table), this
// module can swap to Supabase reads/writes without touching callers.

import { scoped } from "@/lib/profiles";
import { addDays, localDateKey, scheduleAt, scheduleTime } from "@/lib/dueDates";
export const MAX_DRAFTS = 50;

// Lifecycle of a post. Older entries without a status are treated as "draft".
export type DraftStatus = "draft" | "scheduled" | "posted";

export interface DraftEntry {
  id: string;
  createdAt: string;
  hook: string;
  draft: string;
  pillar: string;
  pillarDetail: string;
  audience: string;
  format: string;
  platform: string;
  ctaType: string;
  vibeSourceId?: string;
  // Post tracking (optional for backwards compatibility with older saves).
  status?: DraftStatus;
  scheduledFor?: string;
  postedAt?: string;
  // Self-reported performance (until a real platform integration lands).
  metrics?: PostMetrics;
  // A recurring post: this entry is the series' next occurrence (scheduledFor).
  // Marking it posted records a posted copy and moves it to the following one.
  repeat?: Repeat;
  // Ids of the user's content labels (labels.ts).
  labels?: string[];
  // Disclosure lines added on copy (plainText.ts DISCLOSURES ids).
  disclosure?: string[];
}

export type RepeatEvery = "week" | "2weeks" | "month";

export interface Repeat {
  every: RepeatEvery;
  start: string; // YYYY-MM-DD: the day the series counts from
  skip?: string[]; // occurrences skipped with "Skip this one"
}

// The n-th occurrence of a series (n = 0 is its start). Monthly keeps the start's
// day of the month, on the last day of a shorter month (31 Jan, 28 Feb, 31 Mar).
function occurrence(r: Repeat, n: number): string {
  if (r.every !== "month") return addDays(r.start, n * (r.every === "week" ? 7 : 14));
  const y = Number(r.start.slice(0, 4));
  const m = Number(r.start.slice(5, 7)) - 1 + n;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const day = Math.min(Number(r.start.slice(8, 10)), lastDay);
  return localDateKey(new Date(y, m, day));
}

/** A series' occurrences after `after` and up to `until` (day keys), skipped ones left out. */
export function occurrencesBetween(r: Repeat, after: string, until: string): string[] {
  const out: string[] = [];
  // ponytail: walks from the start; ~5 years of weekly posts is 260 steps, fine on a page render.
  for (let n = 0, day = r.start; day <= until && n < 2000; day = occurrence(r, ++n)) {
    if (day > after && !r.skip?.includes(day)) out.push(day);
  }
  return out;
}

/** The first occurrence after `after` that is not skipped. */
export function nextOccurrence(r: Repeat, after: string): string {
  for (let n = 0, day = r.start; n < 2000; day = occurrence(r, ++n)) {
    if (day > after && !r.skip?.includes(day)) return day;
  }
  return addDays(after, 7); // unreachable for a sane series
}

// Moves a series entry on to its next occurrence after `after`, keeping the time
// and dropping skips it has passed.
function advance(d: DraftEntry, after: string): DraftEntry {
  const r = d.repeat!;
  const day = nextOccurrence(r, after);
  const skip = r.skip?.filter((s) => s > day);
  return {
    ...d,
    scheduledFor: scheduleAt(day, scheduleTime(d.scheduledFor)),
    repeat: { every: r.every, start: r.start, ...(skip?.length ? { skip } : {}) },
  };
}

export interface PostMetrics {
  impressions?: number;
  reactions?: number;
  comments?: number;
  shares?: number;
}

export function draftStatus(d: DraftEntry): DraftStatus {
  return d.status ?? "draft";
}

// Total engagement actions (reactions + comments + shares).
export function engagement(m?: PostMetrics): number {
  if (!m) return 0;
  return (m.reactions ?? 0) + (m.comments ?? 0) + (m.shares ?? 0);
}

const KEY_PREFIX = "content-studio-drafts-";

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (_) {
    return null;
  }
}

export function loadDrafts(userId: string | null | undefined): DraftEntry[] {
  if (!userId) return [];
  const storage = safeStorage();
  if (!storage) return [];
  const raw = storage.getItem(`${KEY_PREFIX}${scoped(userId)}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as DraftEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (_) {
    return [];
  }
}

export function saveDrafts(userId: string, drafts: DraftEntry[]): void {
  const storage = safeStorage();
  if (!storage) return;
  // Trim to MAX_DRAFTS, newest first.
  const trimmed = drafts.slice(0, MAX_DRAFTS);
  storage.setItem(`${KEY_PREFIX}${scoped(userId)}`, JSON.stringify(trimmed));
}

export function upsertDraft(
  userId: string,
  entry: DraftEntry,
): DraftEntry[] {
  const current = loadDrafts(userId);
  const prev = current.find((d) => d.id === entry.id);
  // Write rebuilds an entry from its own fields, which don't include the post's
  // numbers or labels: keep them rather than wipe them on every edit.
  if (prev?.metrics && !entry.metrics) entry = { ...entry, metrics: prev.metrics };
  if (prev?.labels && !entry.labels) entry = { ...entry, labels: prev.labels };
  const without = current.filter((d) => d.id !== entry.id);
  const next = [entry, ...without].slice(0, MAX_DRAFTS);
  saveDrafts(userId, next);
  return next;
}

export function deleteDraft(userId: string, id: string): DraftEntry[] {
  const current = loadDrafts(userId);
  const next = current.filter((d) => d.id !== id);
  saveDrafts(userId, next);
  return next;
}

export function getDraftById(
  userId: string | null | undefined,
  id: string,
): DraftEntry | null {
  if (!userId) return null;
  return loadDrafts(userId).find((d) => d.id === id) ?? null;
}

export function setDraftStatus(
  userId: string,
  id: string,
  status: DraftStatus,
  when?: string,
): DraftEntry[] {
  const current = loadDrafts(userId);
  const series = current.find((d) => d.id === id);
  // Posting one occurrence of a recurring post: record it as its own posted entry
  // and move the series on. A post made today covers every occurrence up to today.
  if (status === "posted" && series?.repeat && series.scheduledFor) {
    const record: DraftEntry = { ...series, id: newDraftId(), status: "posted", postedAt: when ?? new Date().toISOString() };
    delete record.repeat;
    delete record.metrics;
    const day = series.scheduledFor.slice(0, 10);
    const today = localDateKey();
    const moved = advance(series, day > today ? day : today);
    const next = [record, ...current.map((d) => (d.id === id ? moved : d))];
    saveDrafts(userId, next);
    return next;
  }
  const next = current.map((d) => {
    if (d.id !== id) return d;
    const updated: DraftEntry = { ...d, status };
    if (status === "posted") updated.postedAt = when ?? new Date().toISOString();
    if (status === "scheduled") {
      updated.scheduledFor = when ?? d.scheduledFor;
      // Moving a recurring post moves the whole series to count from the new day.
      if (when && d.repeat) updated.repeat = { every: d.repeat.every, start: when.slice(0, 10) };
    }
    if (status === "draft") {
      delete updated.postedAt;
      delete updated.scheduledFor;
      delete updated.repeat;
    }
    return updated;
  });
  saveDrafts(userId, next);
  return next;
}

/**
 * A copy of a post as a fresh draft at the top of the list: same content and
 * labels, " (copy)" on the title, no schedule, posting record or numbers.
 * `dropped` is whatever the cap pushed off the end, so Undo can put it back.
 */
export function duplicateDraft(userId: string, id: string): { drafts: DraftEntry[]; copy: DraftEntry; dropped: DraftEntry[] } | null {
  const current = loadDrafts(userId);
  const src = current.find((d) => d.id === id);
  if (!src) return null;
  const copy: DraftEntry = { ...src, id: newDraftId(), createdAt: new Date().toISOString(), hook: `${src.hook} (copy)`.trim(), status: "draft" };
  for (const k of ["scheduledFor", "postedAt", "repeat", "metrics"] as const) delete copy[k];
  const next = [copy, ...current];
  saveDrafts(userId, next);
  return { drafts: next.slice(0, MAX_DRAFTS), copy, dropped: next.slice(MAX_DRAFTS) };
}

/** Undo for duplicateDraft: removes the copy and puts back anything it pushed off the end. */
export function undoDuplicate(userId: string, copyId: string, dropped: DraftEntry[]): DraftEntry[] {
  const next = [...loadDrafts(userId).filter((d) => d.id !== copyId), ...dropped];
  saveDrafts(userId, next);
  return next.slice(0, MAX_DRAFTS);
}

/**
 * Undo for marking a post posted: puts the post back as it was, removes the posted
 * copy a recurring post leaves, and returns any post that copy pushed past the cap.
 * `before` is the list as it was just before the post was marked.
 */
export function undoPosted(userId: string, prev: DraftEntry, before: DraftEntry[]): DraftEntry[] {
  const was = new Set(before.map((d) => d.id));
  const current = loadDrafts(userId);
  const now = new Set(current.map((d) => d.id));
  const next = [
    ...current.filter((d) => was.has(d.id)).map((d) => (d.id === prev.id ? prev : d)),
    ...before.filter((d) => !now.has(d.id)),
  ];
  saveDrafts(userId, next);
  return next;
}

/** Puts an entry back exactly as it was (for Undo), in its place in the list. */
export function restoreDraft(userId: string, entry: DraftEntry): DraftEntry[] {
  const next = loadDrafts(userId).map((d) => (d.id === entry.id ? entry : d));
  saveDrafts(userId, next);
  return next;
}

/** Makes a scheduled post repeat from its scheduled day, or stops it repeating. */
export function setRepeat(userId: string, id: string, every: RepeatEvery | null): DraftEntry[] {
  const next = loadDrafts(userId).map((d) => {
    if (d.id !== id) return d;
    const updated: DraftEntry = { ...d };
    if (every && d.scheduledFor) updated.repeat = { every, start: d.scheduledFor.slice(0, 10) };
    else delete updated.repeat;
    return updated;
  });
  saveDrafts(userId, next);
  return next;
}

/** "Skip this one": the series' next occurrence moves on; a later one is left out. */
export function skipOccurrence(userId: string, id: string, day: string): DraftEntry[] {
  const next = loadDrafts(userId).map((d) => {
    if (d.id !== id || !d.repeat || !d.scheduledFor) return d;
    if (day === d.scheduledFor.slice(0, 10)) {
      const today = localDateKey();
      return advance(d, day > today ? day : today);
    }
    return { ...d, repeat: { ...d.repeat, skip: [...(d.repeat.skip ?? []), day] } };
  });
  saveDrafts(userId, next);
  return next;
}

export interface DraftStats {
  total: number;
  drafts: number;
  scheduled: number;
  posted: number;
  postedThisMonth: number;
  lastPostedAt: string | null;
}

export function getDraftStats(userId: string | null | undefined): DraftStats {
  const all = loadDrafts(userId);
  const now = new Date();
  let drafts = 0;
  let scheduled = 0;
  let posted = 0;
  let postedThisMonth = 0;
  let lastPostedAt: string | null = null;
  for (const d of all) {
    const s = draftStatus(d);
    if (s === "scheduled") scheduled++;
    else if (s === "posted") {
      posted++;
      if (d.postedAt) {
        const p = new Date(d.postedAt);
        if (
          p.getFullYear() === now.getFullYear() &&
          p.getMonth() === now.getMonth()
        ) {
          postedThisMonth++;
        }
        if (!lastPostedAt || d.postedAt > lastPostedAt) lastPostedAt = d.postedAt;
      }
    } else drafts++;
  }
  return { total: all.length, drafts, scheduled, posted, postedThisMonth, lastPostedAt };
}

function mondayOf(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // Mon = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}
function weekKey(d: Date): string {
  const m = mondayOf(d);
  return `${m.getFullYear()}-${m.getMonth()}-${m.getDate()}`;
}

export interface PostingActivity {
  thisWeekPosted: number;
  weekStreak: number;
}

// Weekly posting rhythm: how many posts went out this (Mon-Sun) week, and how
// many consecutive weeks have had at least one post (the current in-progress
// week doesn't break the streak).
export function getPostingActivity(
  userId: string | null | undefined,
): PostingActivity {
  const posted = loadDrafts(userId).filter(
    (d) => draftStatus(d) === "posted" && d.postedAt,
  );
  const active = new Set(posted.map((d) => weekKey(new Date(d.postedAt!))));
  const now = new Date();
  const thisWeekPosted = posted.filter(
    (d) => weekKey(new Date(d.postedAt!)) === weekKey(now),
  ).length;

  let streak = 0;
  let cursor = mondayOf(now);
  if (!active.has(weekKey(cursor))) {
    // Current week not yet posted — start counting from last week instead.
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 7);
  }
  while (active.has(weekKey(cursor))) {
    streak++;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 7);
  }
  return { thisWeekPosted, weekStreak: streak };
}

export function setDraftMetrics(
  userId: string,
  id: string,
  metrics: PostMetrics,
): DraftEntry[] {
  const current = loadDrafts(userId);
  const next = current.map((d) =>
    d.id === id
      ? { ...d, metrics: { ...d.metrics, ...metrics } }
      : d,
  );
  saveDrafts(userId, next);
  return next;
}

export interface AnalyticsSummary {
  trackedCount: number;
  totalImpressions: number;
  totalEngagement: number;
  avgEngagementRate: number; // % of impressions that engaged
  top: DraftEntry[]; // posts with metrics, best engagement first
  bestPillar: string | null;
  bestFormat: string | null;
}

export function getAnalytics(
  userId: string | null | undefined,
): AnalyticsSummary {
  const tracked = loadDrafts(userId).filter(
    (d) => d.metrics && (d.metrics.impressions || engagement(d.metrics)),
  );
  let totalImpressions = 0;
  let totalEngagement = 0;
  const byPillar: Record<string, number> = {};
  const byFormat: Record<string, number> = {};
  for (const d of tracked) {
    totalImpressions += d.metrics?.impressions ?? 0;
    const e = engagement(d.metrics);
    totalEngagement += e;
    byPillar[d.pillar] = (byPillar[d.pillar] ?? 0) + e;
    byFormat[d.format] = (byFormat[d.format] ?? 0) + e;
  }
  const top = [...tracked].sort(
    (a, b) => engagement(b.metrics) - engagement(a.metrics),
  );
  const bestOf = (r: Record<string, number>): string | null => {
    const keys = Object.keys(r);
    if (keys.length === 0) return null;
    return keys.sort((a, b) => r[b] - r[a])[0];
  };
  return {
    trackedCount: tracked.length,
    totalImpressions,
    totalEngagement,
    avgEngagementRate:
      totalImpressions > 0
        ? Math.round((totalEngagement / totalImpressions) * 1000) / 10
        : 0,
    top,
    bestPillar: bestOf(byPillar),
    bestFormat: bestOf(byFormat),
  };
}

export function newDraftId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
