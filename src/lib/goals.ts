// Weekly posting goal per platform (gap s17), per profile and synced.
//   key: content-studio-goals-${scoped(userId)}
// Until the user saves goals they come from positioning: its cadence on its
// platform. Weeks run Monday to Sunday in Singapore time.
// The goal is the one source for posts per week: Home edits it, Plan's "Posts per
// week" reads and writes it, and positioning.cadence is only a copy kept in step.

import { scoped } from "@/lib/profiles";
import { loadPositioning, savePositioning, type PlanPlatform, type Positioning } from "@/lib/positioning";
import { draftStatus, type DraftEntry } from "@/lib/draftHistory";
import { weekOf } from "@/lib/dueDates";

export const GOAL_PLATFORMS: PlanPlatform[] = ["linkedin", "instagram", "facebook", "tiktok"];
export const MAX_WEEKLY_GOAL = 21;
export type WeeklyGoals = Partial<Record<PlanPlatform, number>>;

const KEY_PREFIX = "content-studio-goals-";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Only known platforms, whole numbers from 1 to MAX_WEEKLY_GOAL. */
function clean(raw: unknown): WeeklyGoals {
  const out: WeeklyGoals = {};
  if (!raw || typeof raw !== "object") return out;
  for (const p of GOAL_PLATFORMS) {
    const n = Math.round(Number((raw as Record<string, unknown>)[p]));
    if (Number.isFinite(n) && n > 0) out[p] = Math.min(MAX_WEEKLY_GOAL, n);
  }
  return out;
}

export function loadGoals(userId: string | null | undefined): WeeklyGoals {
  const s = storage();
  if (!userId || !s) return {};
  const raw = s.getItem(KEY_PREFIX + scoped(userId));
  if (raw === null) {
    const p = loadPositioning(userId);
    return p ? clean({ [p.platform]: p.cadence }) : {};
  }
  try {
    return clean(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function saveGoals(userId: string, goals: WeeklyGoals): WeeklyGoals {
  const tidy = clean(goals);
  storage()?.setItem(KEY_PREFIX + scoped(userId), JSON.stringify(tidy));
  // Keep positioning's copy in step for readers that only see it (the Claude connector).
  const p = loadPositioning(userId);
  const n = p ? tidy[p.platform] : undefined;
  if (p && n && n !== p.cadence) savePositioning(userId, { ...p, cadence: n });
  return tidy;
}

/** Sets one platform's goal and keeps the others (Plan's posts per week). */
export function setPlatformGoal(userId: string, platform: PlanPlatform, n: number): WeeklyGoals {
  return saveGoals(userId, { ...loadGoals(userId), [platform]: n });
}

/** Positioning with posts per week read from the goal; its own number only counts where there is no goal. */
export function withGoalCadence(p: Positioning, goals: WeeklyGoals): Positioning {
  return { ...p, cadence: goals[p.platform] ?? p.cadence };
}

/** The Singapore calendar day ("YYYY-MM-DD") of an instant. */
export function sgDay(at: Date | string | number = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
}

export interface GoalRow {
  platform: PlanPlatform;
  goal: number;
  posted: number;
  scheduled: number;
  /** Posts neither out nor scheduled yet to reach the goal. */
  toDo: number;
}

/** This week's posted, scheduled and still-to-do counts per platform, plus totals. */
export function weekProgress(drafts: DraftEntry[], goals: WeeklyGoals, today = sgDay()) {
  const week = weekOf(today);
  const inWeek = (day?: string) => !!day && day >= week[0] && day <= week[6];
  const rows: GoalRow[] = GOAL_PLATFORMS.map((platform) => {
    const mine = drafts.filter((d) => d.platform === platform);
    const posted = mine.filter((d) => draftStatus(d) === "posted" && d.postedAt && inWeek(sgDay(d.postedAt))).length;
    const scheduled = mine.filter((d) => draftStatus(d) === "scheduled" && inWeek(d.scheduledFor?.slice(0, 10))).length;
    const goal = goals[platform] ?? 0;
    return { platform, goal, posted, scheduled, toDo: Math.max(0, goal - posted - scheduled) };
  }).filter((r) => r.goal > 0 || r.posted > 0 || r.scheduled > 0);
  const sum = (k: "goal" | "posted" | "scheduled" | "toDo") => rows.reduce((s, r) => s + r[k], 0);
  // Posts that count toward a goal: extra posts on one platform don't fill another's.
  const met = rows.reduce((s, r) => s + Math.min(r.posted, r.goal), 0);
  return { rows, goal: sum("goal"), posted: sum("posted"), scheduled: sum("scheduled"), toDo: sum("toDo"), met };
}
