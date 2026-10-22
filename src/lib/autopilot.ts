// Autopilot (plan-autopilot, Leo only): a week of posts written ahead for the person to OK one at a time. This file
// is the store and the arithmetic; the run lives in autopilotJob.ts. Synced per brand under
// content-studio-autopilot-<scoped>: the settings and the last 8 weekly batches, newest first. A batch keeps its
// week's layout (the slots, their days and review dates) and each post's state; the words are ordinary My posts
// drafts (ap_<week>_<n>), status "draft" until Approve schedules one, so nothing nobody read ever reaches the
// calendar or a phone alert. Nothing here reads the clock: every date is passed in.

import { addDays, keyToDate, localDateKey } from "@/lib/dueDates";
import { angleText, generatePlan, planItemDate, WEEKDAYS, type GeneratePlanOptions, type PlanItem } from "@/lib/contentPlan";
import { draftStatus, type DraftEntry } from "@/lib/draftHistory";
import { applyBrandRules } from "@/lib/brandRules";
import { hookFormula } from "@/lib/hookFormulas";
import type { Positioning } from "@/lib/positioning";
import { scoped } from "@/lib/profiles";
import { cutAtWord } from "@/lib/scriptCaption";
import type { WrittenPost } from "../../supabase/functions/idea-dump/logic.ts";

export type AutoFormat = "text-post" | "carousel" | "short-video";
export const AUTO_FORMATS: AutoFormat[] = ["text-post", "carousel", "short-video"];
export type BatchState = "waiting" | "writing" | "review" | "approved" | "skipped" | "missed" | "failed";

export interface AutopilotSettings {
  on: boolean;
  when: "weekly" | "daily";
  /** 0 = Monday, as WEEKDAYS. */
  writeDay: number;
  formats: AutoFormat[];
  windowDays: 1 | 2 | 3;
}
export interface BatchPost {
  n: number;
  day: string;
  time?: string;
  slot: PlanItem;
  draftId: string;
  state: BatchState;
  reviewBy: string;
  /** Jev's MAS warning from the writer (null for a business brand, or when Jev gave nothing). */
  mas?: boolean | null;
}
export interface Batch {
  week: string;
  posts: BatchPost[];
  startedAt?: string;
  waitUntil?: string;
}
export interface AutopilotState {
  settings: AutopilotSettings;
  batches: Batch[];
}

export const DEFAULT_SETTINGS: AutopilotSettings = { on: false, when: "weekly", writeDay: 4, formats: [...AUTO_FORMATS], windowDays: 2 };
export const MAX_BATCHES = 8;
/** A run another device started this recently is left to finish (two devices opening at once). */
export const GUARD_MS = 10 * 60_000;
export const AUTOPILOT_CHANGED = "content-studio-autopilot-changed";
export const NO_ROOM_LINE = "This device is out of room, so that wasn't saved. Clear some space, then try again.";
export const FORMAT_LINE = "Pick at least one format.";
const PREFIX = "content-studio-autopilot-";

export const autopilotKey = (userId: string) => PREFIX + scoped(userId);

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const STATES: BatchState[] = ["waiting", "writing", "review", "approved", "skipped", "missed", "failed"];

/** Settings as the app reads them: every field valid, at least one format on. */
export function cleanSettings(raw: unknown): AutopilotSettings {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const formats = AUTO_FORMATS.filter((f) => Array.isArray(r.formats) && r.formats.includes(f));
  const day = Number(r.writeDay);
  return {
    on: r.on === true,
    when: r.when === "daily" ? "daily" : "weekly",
    writeDay: Number.isInteger(day) && day >= 0 && day <= 6 ? day : DEFAULT_SETTINGS.writeDay,
    formats: formats.length ? formats : [...AUTO_FORMATS],
    windowDays: r.windowDays === 1 || r.windowDays === 3 ? r.windowDays : 2,
  };
}

function cleanBatch(raw: unknown): Batch | null {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!b || !isDay(b.week) || !Array.isArray(b.posts)) return null;
  const posts = b.posts.filter(
    (p): p is BatchPost =>
      !!p && typeof p === "object" && Number.isInteger(p.n) && isDay(p.day) && isDay(p.reviewBy) && typeof p.draftId === "string" &&
      STATES.includes(p.state) && !!p.slot && typeof p.slot === "object",
  );
  return {
    week: b.week,
    posts,
    ...(typeof b.startedAt === "string" ? { startedAt: b.startedAt } : {}),
    ...(typeof b.waitUntil === "string" ? { waitUntil: b.waitUntil } : {}),
  };
}

/** The brand's autopilot; off with no batches when nothing (or nothing readable) is stored. */
export function loadAutopilot(userId: string | null | undefined): AutopilotState {
  if (!userId) return { settings: { ...DEFAULT_SETTINGS }, batches: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(autopilotKey(userId)) ?? "null");
    if (!raw || typeof raw !== "object") return { settings: { ...DEFAULT_SETTINGS }, batches: [] };
    const batches = (Array.isArray(raw.batches) ? raw.batches : []).map(cleanBatch).filter((b: Batch | null): b is Batch => !!b);
    return { settings: cleanSettings(raw.settings), batches };
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, batches: [] };
  }
}

/** Saves the state, batches newest week first and the last 8 kept. Null when saved, else the line. */
export function saveAutopilot(userId: string, state: AutopilotState): string | null {
  const batches = [...state.batches].sort((a, b) => b.week.localeCompare(a.week)).slice(0, MAX_BATCHES);
  try {
    localStorage.setItem(autopilotKey(userId), JSON.stringify({ settings: cleanSettings(state.settings), batches }));
  } catch {
    return NO_ROOM_LINE;
  }
  window.dispatchEvent(new Event(AUTOPILOT_CHANGED));
  return null;
}

/** Saves new settings over the stored ones (batches kept). Null when saved, else the line. */
export function saveSettings(userId: string, settings: AutopilotSettings): string | null {
  if (!settings.formats.length) return FORMAT_LINE;
  return saveAutopilot(userId, { ...loadAutopilot(userId), settings });
}

/** A format chip pressed in the settings: the last one on stays on. */
export const toggleFormat = (formats: AutoFormat[], f: AutoFormat): AutoFormat[] =>
  formats.includes(f) ? (formats.length > 1 ? formats.filter((x) => x !== f) : formats) : AUTO_FORMATS.filter((x) => x === f || formats.includes(x));

// ---- Dates ----------------------------------------------------------------------------

const weekday = (day: string) => (keyToDate(day).getDay() + 6) % 7;
export const mondayOf = (day: string) => addDays(day, -weekday(day));

/** Weekly mode: the Monday after the latest write day on or before today. Friday's run, opened Sat or Mon, still lands on the same week. */
export function targetWeek(settings: Pick<AutopilotSettings, "writeDay">, today: string): string {
  const written = addDays(today, -((weekday(today) - settings.writeDay + 7) % 7));
  return addDays(written, 7 - settings.writeDay);
}

/** The weeks a run writes into: weekly, the target week; daily, the weeks of the two days it writes (today + window and the day after). */
export function targetWeeks(settings: Pick<AutopilotSettings, "when" | "writeDay" | "windowDays">, today: string): string[] {
  if (settings.when === "weekly") return [targetWeek(settings, today)];
  return [...new Set([mondayOf(addDays(today, settings.windowDays)), mondayOf(addDays(today, settings.windowDays + 1))])];
}

/** The last day a post can be approved (through the end of it, Singapore time). */
export const reviewBy = (day: string, windowDays: number) => addDays(day, -windowDays);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Sat 25 Oct". */
export function dayText(day: string): string {
  const d = keyToDate(day);
  return `${WEEKDAYS[weekday(day)]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
/** "27 OCT TO 2 NOV". */
export function weekText(week: string): string {
  const end = keyToDate(addDays(week, 6));
  const start = keyToDate(week);
  return `${start.getDate()} ${MONTHS[start.getMonth()]} to ${end.getDate()} ${MONTHS[end.getMonth()]}`.toUpperCase();
}

/** The next 08:00 Singapore time (00:00 UTC), when the daily caps reset. */
export function nextReset(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

// ---- Layout ---------------------------------------------------------------------------

/**
 * A week's posts, laid out as /plan lays a week (attraction first, conversion last) on the brand's posting days
 * and times, each dated from the week's Monday with the day it must be approved by. `options` carries the formats.
 */
export function layoutWeek(positioning: Positioning, options: GeneratePlanOptions, week: string, windowDays: number): BatchPost[] {
  // a salt per week, so each week takes the next topics and formats instead of repeating the last one's
  const salt = Math.round(keyToDate(week).getTime() / (7 * 86_400_000));
  return generatePlan(positioning, { ...options, weeks: 1, salt }).items.map((slot, i) => {
    const day = localDateKey(planItemDate(slot, keyToDate(week)));
    return { n: i + 1, day, ...(slot.time ? { time: slot.time } : {}), slot, draftId: `ap_${week}_${i + 1}`, state: "waiting", reviewBy: reviewBy(day, windowDays) };
  });
}

/** True when the day already holds a scheduled post with words in it (an empty plan_ placeholder has none). */
const dayTaken = (day: string, drafts: DraftEntry[]) =>
  drafts.some((d) => draftStatus(d) === "scheduled" && d.scheduledFor?.slice(0, 10) === day && !!d.draft.trim());

/**
 * The batch's posts to write now, in the week's order: not written yet (waiting, or writing when a run was cut
 * short), still approvable (reviewBy today or later), on a day no written scheduled post holds, and in daily mode
 * dated up to today + window + 1.
 */
export function postsToWrite(batch: Batch, drafts: DraftEntry[], today: string, settings: Pick<AutopilotSettings, "when" | "windowDays">): BatchPost[] {
  const until = settings.when === "daily" ? addDays(today, settings.windowDays + 1) : null;
  return batch.posts.filter(
    (p) => (p.state === "waiting" || p.state === "writing") && p.reviewBy >= today && (!until || p.day <= until) && !dayTaken(p.day, drafts),
  );
}

/** Slots whose day already holds a written post: "Next week already has <n> posts planned." */
export const daysPlanned = (batch: Batch, drafts: DraftEntry[]) => batch.posts.filter((p) => dayTaken(p.day, drafts)).length;

/**
 * One post for idea-dump mode "campaign": the slot's topic as the angle title and its angle as the line, with
 * generatePlan's em dash read as ": " in both. `n` is the post's place in this request.
 */
export function postAsk(p: BatchPost, n: number) {
  const f = hookFormula(p.slot.formulaId);
  return {
    n,
    angle: { title: cutAtWord(angleText({ angle: p.slot.pillarDetail }), 40), line: cutAtWord(angleText(p.slot), 140) },
    format: p.slot.format,
    stage: p.slot.stage,
    ...(f ? { formula: { name: f.name, template: f.template } } : {}),
    ctaType: p.slot.ctaType,
    platforms: [p.slot.platform],
  };
}

/** A written post as its My posts entry: the whole post (hook, body, call to action, or the script), inside the brand's rules. */
export function draftFor(p: BatchPost, w: Pick<WrittenPost, "hook" | "body" | "script" | "cta" | "ctaType">, brand: Parameters<typeof applyBrandRules>[1], now: Date, labelId?: string): DraftEntry {
  const s = p.slot;
  const text = s.format === "short-video" ? (w.script ?? "") : [w.hook, w.body, w.cta].map((t) => t?.trim()).filter(Boolean).join("\n\n");
  return {
    id: p.draftId,
    createdAt: now.toISOString(),
    hook: applyBrandRules(w.hook.trim(), brand, s.platform),
    draft: applyBrandRules(text.trim(), brand, s.platform),
    pillar: s.pillar,
    pillarDetail: s.pillarDetail,
    audience: s.audience,
    format: s.format,
    platform: s.platform,
    ctaType: w.ctaType || s.ctaType,
    ...(s.formulaId ? { hookFormula: s.formulaId } : {}),
    ...(labelId ? { labels: [labelId] } : {}),
    status: "draft",
  };
}

// ---- The sweep ---------------------------------------------------------------------------

/**
 * Every run, before writing: a post scheduled or posted from elsewhere is approved; one whose draft is gone from My
 * posts is skipped (only once its batch's run is over 10 minutes old, so a device whose drafts haven't synced yet
 * never marks it); one still in review after its date is missed, its draft left unscheduled. Null when nothing changed.
 */
export function sweep(state: AutopilotState, drafts: DraftEntry[], today: string, now: Date): AutopilotState | null {
  const byId = new Map(drafts.map((d) => [d.id, d]));
  let changed = false;
  const batches = state.batches.map((b) => {
    const settled = !b.startedAt || now.getTime() - Date.parse(b.startedAt) > GUARD_MS;
    const posts = b.posts.map((p) => {
      if (p.state !== "review" && p.state !== "missed" && p.state !== "approved") return p;
      const d = byId.get(p.draftId);
      const next: BatchState =
        !d ? (settled ? "skipped" : p.state)
        : draftStatus(d) !== "draft" ? "approved"
        : p.state === "review" && today > p.reviewBy ? "missed"
        : p.state;
      if (next === p.state) return p;
      changed = true;
      return { ...p, state: next };
    });
    return { ...b, posts };
  });
  return changed ? { ...state, batches } : null;
}

/** Posts waiting for an OK today or later: the Pipeline badge and Home's row. */
export function autopilotWaiting(userId: string, today: string): number {
  return loadAutopilot(userId).batches.reduce((n, b) => n + b.posts.filter((p) => p.state === "review" && p.reviewBy >= today).length, 0);
}
