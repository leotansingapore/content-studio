// Why each post did well or badly (docs/north-star/items/learn-post-grade.md): a posted draft's engagements against
// the median of the same network's other posts in 90 days, in five bands, measured and never stored. Above or below
// the usual, Jev's writing-judge mode `grade` names the likely reason once per band, and the fix line comes from a
// table filled with the adviser's own best post, so no LLM writes it.
//   content-studio-postgrades-<scoped> (synced, per brand): draft id -> the cached reason, newest 200.

import { callFn, EdgeError } from "@/lib/edgeFn";
import { scoped } from "@/lib/profiles";
import { links } from "@/lib/links";
import { sourceKey } from "@/lib/remixSource";
import { toPlainText } from "@/lib/plainText";
import { scheduleTime } from "@/lib/dueDates";
import { SAVE_FAILED } from "@/lib/voiceMemory";
import { bestCell, DAY_LABELS, DAYPARTS, labelForDimension, postingTime, postingTimeGrid, type TrackedPost } from "@/lib/analytics";
import { median } from "../../supabase/functions/_shared/socialAudit.ts";
import { times } from "../../supabase/functions/_shared/outlier.ts";

export type Band = "well-above" | "above" | "about" | "below" | "well-below";
export type Reason = "hook" | "topic" | "format" | "timing" | "ask";
export type Direction = "above" | "below";

export const BAND_LABEL: Record<Band, string> = {
  "well-above": "Well above your usual",
  above: "Above your usual",
  about: "About your usual",
  below: "Below your usual",
  "well-below": "Well below your usual",
};

export const REASON_NAME: Record<Reason, string> = {
  hook: "the opening line",
  topic: "the topic",
  format: "the format",
  timing: "when it went out",
  ask: "the ending",
};

const REASONS: Reason[] = ["hook", "topic", "format", "timing", "ask"];
const DAY = 86_400_000;
const WINDOW_DAYS = 90;
const YOUNG_HOURS = 48;
const MIN_POSTS = 5;

/** From the unrounded ratio, each lower edge inclusive. */
export const bandOf = (ratio: number): Band =>
  ratio >= 2 ? "well-above" : ratio >= 1.25 ? "above" : ratio >= 0.8 ? "about" : ratio >= 0.5 ? "below" : "well-below";

export const directionOf = (band: Band): Direction | null => (band === "about" ? null : band.endsWith("above") ? "above" : "below");

export type Grade =
  | { kind: "graded"; ratio: number; band: Band; engagements: number; usual: number; of: number; impressions: number | null }
  /** Under 48 hours old: when it can be graded. */
  | { kind: "young"; ready: string }
  /** Under 5 posts to compare, or a usual of 0. */
  | { kind: "few"; have: number };

const timeOf = (p: TrackedPost) => Date.parse(p.postedAt ?? p.scheduledFor ?? "");

/** The post against the median engagements of the same network's other posts out in 90 days and 48 hours old. */
export function gradePost(post: TrackedPost, tracked: TrackedPost[], now: number): Grade {
  const at = timeOf(post);
  if (now - at < YOUNG_HOURS * 3_600_000) return { kind: "young", ready: new Date(at + YOUNG_HOURS * 3_600_000).toISOString() };
  const others = tracked.filter((p) => {
    const t = timeOf(p);
    return p.id !== post.id && p.platform === post.platform && now - t <= WINDOW_DAYS * DAY && now - t >= YOUNG_HOURS * 3_600_000;
  });
  const usual = median(others.map((p) => p.engagementTotal));
  if (others.length < MIN_POSTS || !usual) return { kind: "few", have: others.length };
  const seen = others.filter((p) => p.impressions > 0).map((p) => p.impressions);
  const impressions = post.impressions > 0 && seen.length >= MIN_POSTS ? post.impressions / median(seen)! : null;
  const ratio = post.engagementTotal / usual;
  return { kind: "graded", ratio, band: bandOf(ratio), engagements: post.engagementTotal, usual, of: others.length, impressions };
}

// ---- the reason's line ----

/** What the fix lines and the new version fill in, from the post and its network's other posts. */
export interface GradeContext {
  network: string;
  bestFirstLine?: string;
  bestFormula?: string;
  format?: string;
  bestFormat?: string;
  weekday?: string;
  time?: string;
  bestSlot?: string;
}

const NOUNS: Record<string, [string, string]> = {
  "text-post": ["text post", "text posts"],
  carousel: ["carousel", "carousels"],
  "short-video": ["short video", "short videos"],
  story: ["story", "stories"],
};
const noun = (format: string, plural: boolean) => NOUNS[format]?.[plural ? 1 : 0] ?? format.replace(/-/g, " ");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const firstLine = (p: TrackedPost) => toPlainText(p.draft).split("\n").map((l) => l.trim()).find(Boolean);
const clock = (h: number, m: string) => `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;

/** "Tue morning", or "Tue" when most posts have no time: Analytics' "Best so far" words. */
export function bestSlotLabel(posts: TrackedPost[]): string | null {
  const grid = postingTimeGrid(posts);
  const rows = grid.hasTimes ? grid.dayparts : grid.days.map((c) => [c]);
  const at = bestCell(rows);
  return at ? `${DAY_LABELS[at[0]]}${grid.hasTimes ? ` ${DAYPARTS[at[1]].label.toLowerCase()}` : ""}` : null;
}

/** The best other post on the network, the best other format (by median engagements), the post's own day and time. */
export function gradeContext(post: TrackedPost, tracked: TrackedPost[]): GradeContext {
  const net = tracked.filter((p) => p.platform === post.platform);
  const best = net.filter((p) => p.id !== post.id).sort((a, b) => b.engagementTotal - a.engagementTotal)[0];
  const formats = [...new Set(net.map((p) => p.format).filter((f) => f && f !== post.format))];
  const byMedian = (f: string) => median(net.filter((p) => p.format === f).map((p) => p.engagementTotal)) ?? 0;
  const when = postingTime(post);
  const hm = scheduleTime(post.scheduledFor) ?? (post.postedAt && /T\d{2}:\d{2}/.test(post.postedAt) ? new Date(post.postedAt).toTimeString().slice(0, 5) : null);
  return {
    network: labelForDimension("platform", post.platform),
    bestFirstLine: best && firstLine(best),
    bestFormula: best?.hookFormula,
    format: post.format || undefined,
    bestFormat: formats.sort((a, b) => byMedian(b) - byMedian(a))[0],
    weekday: when ? DAY_LABELS[when.day] : undefined,
    time: hm ? clock(Number(hm.slice(0, 2)), hm.slice(3, 5)) : undefined,
    bestSlot: bestSlotLabel(net) ?? undefined,
  };
}

/** The line under the reason, or null when a value it needs is missing (never a line with a hole). */
export function fixLine(reason: Reason, direction: Direction, c: GradeContext): string | null {
  const up = direction === "above";
  switch (reason) {
    case "hook":
      if (up) return "Your opening line did the work. Use the same kind of opening next time.";
      return c.bestFirstLine ? `The first line didn't stop people. Your best ${c.network} post opened with: "${c.bestFirstLine}".` : null;
    case "topic":
      return up ? "This topic lands with your audience. Post on it again from a new angle." : "This topic drew less interest than your usual. Tie it to a question a client asked you.";
    case "format":
      if (!c.format) return null;
      if (up) return `${cap(noun(c.format, true))} suit you on ${c.network}. Make the next one a ${noun(c.format, false)} too.`;
      return c.bestFormat ? `${cap(noun(c.format, true))} do less well for you on ${c.network}. Your best posts there are ${noun(c.bestFormat, true)}.` : null;
    case "timing":
      if (up) return c.weekday ? `It went out at a good time: ${c.weekday}${c.time ? `, ${c.time}` : ""}.` : null;
      return c.bestSlot ? `It went out at a quiet time. Your best ${c.network} posts went out on ${c.bestSlot}.` : null;
    case "ask":
      return up ? "The ending gave people an easy reason to reply. Keep that kind of ending." : "The ending asked for nothing. End with one easy question or a keyword to comment.";
  }
}

/** Only reasons whose line can be filled go to Jev: timing needs a best slot, format a second format on the network. */
export function offeredReasons(post: TrackedPost, tracked: TrackedPost[], direction: Direction): Reason[] {
  const c = gradeContext(post, tracked);
  return REASONS.filter((r) => (r !== "timing" || !!c.bestSlot) && (r !== "format" || !!c.bestFormat) && fixLine(r, direction, c) !== null);
}

/** "Try a new version": Write on the post's topic with the fix, the best formula or format for those reasons, and the MAS line. */
export function tryVersionUrl(post: TrackedPost, ratio: number, reason: Reason, c: GradeContext): string | null {
  const fix = fixLine(reason, "below", c);
  if (!fix) return null;
  const ctx = [
    `This post of mine got ${times(ratio)} my usual engagement on ${c.network}. The likely reason: ${REASON_NAME[reason]}.`,
    `Write a new version that fixes that: ${fix.replace(/\.$/, "")}. Keep the topic, don't reuse the original wording, and keep it compliant for a licensed Singapore financial adviser: no promised returns, no named insurer products, no invented numbers. Original: "${toPlainText(post.draft).slice(0, 300)}"`,
  ].join("\n");
  return links.generate({
    pillar: post.pillar || undefined,
    detail: post.pillarDetail || undefined,
    format: (reason === "format" ? c.bestFormat : post.format) || undefined,
    platform: post.platform,
    formula: reason === "hook" ? c.bestFormula : undefined,
    source: sourceKey.own(post.id),
    ctx,
  });
}

// ---- the cached reason ----

export interface SavedGrade {
  band: Band;
  reason: Reason | null;
  /** Jev's probability; null with no reason means the post isn't in English. */
  p: number | null;
  at: string;
}

export const POSTGRADES_CHANGED = "content-studio-postgrades-changed";
const KEY = "content-studio-postgrades-";
const MAX_GRADES = 200;

export function loadGrades(userId: string): Record<string, SavedGrade> {
  try {
    const s = JSON.parse(window.localStorage.getItem(KEY + scoped(userId)) ?? "null");
    if (!s || typeof s !== "object" || Array.isArray(s)) return {};
    return Object.fromEntries(
      Object.entries(s as Record<string, SavedGrade>).filter(
        ([, g]) => g && g.band in BAND_LABEL && (g.reason === null || REASONS.includes(g.reason)) && (g.p === null || typeof g.p === "number") && typeof g.at === "string",
      ),
    );
  } catch {
    return {};
  }
}

/** Null when saved, else the line. Keeps the newest 200. */
export function saveGrade(userId: string, draftId: string, g: SavedGrade): string | null {
  const all = Object.entries({ ...loadGrades(userId), [draftId]: g })
    .sort((a, b) => b[1].at.localeCompare(a[1].at))
    .slice(0, MAX_GRADES);
  try {
    window.localStorage.setItem(KEY + scoped(userId), JSON.stringify(Object.fromEntries(all)));
  } catch {
    return SAVE_FAILED;
  }
  window.dispatchEvent(new Event(POSTGRADES_CHANGED));
  return null;
}

export type ReasonAnswer =
  | { state: "found"; reason: Reason }
  /** About the usual, Jev null or under 0.4, or the call failed: "No single reason stands out." */
  | { state: "none"; reason: null }
  | { state: "not-english"; reason: null }
  | { state: "capped"; reason: null; message: string };

/**
 * The reason for a graded post above or below its usual: the cached one while the band holds, else one writing-judge
 * `grade` call. An answer (any p) and "not in English" are cached; a Jev null, a capped day or a failure are not.
 */
export async function reasonFor(userId: string, post: TrackedPost, grade: Extract<Grade, { kind: "graded" }>, tracked: TrackedPost[], now = Date.now()): Promise<ReasonAnswer> {
  const direction = directionOf(grade.band);
  if (!direction) return { state: "none", reason: null };
  const fromSaved = (g: SavedGrade): ReasonAnswer =>
    g.reason ? { state: "found", reason: g.reason } : g.p === null ? { state: "not-english", reason: null } : { state: "none", reason: null };
  const saved = loadGrades(userId)[post.id];
  if (saved?.band === grade.band) return fromSaved(saved);
  const net = tracked.filter((p) => p.platform === post.platform && p.id !== post.id).sort((a, b) => b.engagementTotal - a.engagementTotal);
  const text = toPlainText(post.draft);
  try {
    const r = await callFn<{ reason?: unknown; p?: unknown }>("writing-judge", {
      mode: "grade",
      text: text.slice(0, 1500),
      platform: post.platform,
      format: post.format,
      posted: post.postedAt ?? post.scheduledFor ?? null,
      words: text.split(/\s+/).filter(Boolean).length,
      ratio: Math.round(grade.ratio * 10) / 10,
      direction,
      best: net.slice(0, 3).map((p) => ({ firstLine: firstLine(p) ?? "", format: p.format, posted: p.postedAt ?? p.scheduledFor ?? null })),
      reasons: offeredReasons(post, tracked, direction),
    });
    if (typeof r?.p !== "number") return { state: "none", reason: null };
    const g: SavedGrade = { band: grade.band, reason: REASONS.includes(r.reason as Reason) ? (r.reason as Reason) : null, p: r.p, at: new Date(now).toISOString() };
    saveGrade(userId, post.id, g);
    return fromSaved(g);
  } catch (e) {
    if (e instanceof EdgeError && e.status === 429) return { state: "capped", reason: null, message: e.message };
    if (e instanceof EdgeError && e.code === "not_english") {
      saveGrade(userId, post.id, { band: grade.band, reason: null, p: null, at: new Date(now).toISOString() });
      return { state: "not-english", reason: null };
    }
    return { state: "none", reason: null };
  }
}
