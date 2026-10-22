// The brand's goal line (plan-goal), outside React: reading a typed goal through writing-judge's goal mode, saving
// it, and the open editor's typed work. Leo only for now; writing-judge refuses everyone else's goal (403).
import { callFn } from "@/lib/edgeFn";
import { loadGoals, saveGoals } from "@/lib/goals";
import { GOAL_KINDS, loadPositioning, saveGoal, type GoalKind } from "@/lib/positioning";
import { scoped } from "@/lib/profiles";

/**
 * Jev's kind for a typed goal. Anything but a 200 with a known kind (a cap, no key, not English, no connection, a
 * pick under 0.6) is null, and the editor asks "Which of these is closest?" instead: the goal still saves.
 */
export async function readGoal(text: string): Promise<GoalKind | null> {
  try {
    const r = await callFn<{ kind?: unknown } | null>("writing-judge", { mode: "goal", text: text.trim() });
    return GOAL_KINDS.find((k) => k === r?.kind) ?? null;
  } catch {
    return null;
  }
}

/** The chip a text is, word for word (any case), so a picked chip saves with no Jev call. */
export function chipKind(text: string, chips: Record<GoalKind, string>): GoalKind | null {
  const t = text.trim().toLowerCase();
  return GOAL_KINDS.find((k) => chips[k].toLowerCase() === t) ?? null;
}

/**
 * saveGoal, keeping Home's weekly goal as it reads today: a brand with no positioning gets a row from its first goal,
 * and goals.ts would then read "LinkedIn, 3 a week" from that row, so its weekly goals are written down first.
 */
export function keepGoal(userId: string, text: string, kind: GoalKind): boolean {
  if (!loadPositioning(userId)) {
    try {
      saveGoals(userId, loadGoals(userId));
    } catch {
      return false;
    }
  }
  return saveGoal(userId, text, kind);
}

/** The open editor's typed work: what is in the field, and the closest kind once Jev was unsure. */
export interface GoalWork {
  text: string;
  unsure: boolean;
  closest: GoalKind | null;
}

const workKey = (userId: string) => `cs-goal-work-${scoped(userId)}`;

export function loadGoalWork(userId: string): GoalWork | null {
  try {
    const w = JSON.parse(sessionStorage.getItem(workKey(userId)) ?? "null");
    if (!w || typeof w.text !== "string") return null;
    return { text: w.text.slice(0, 120), unsure: w.unsure === true, closest: GOAL_KINDS.find((k) => k === w.closest) ?? null };
  } catch {
    return null;
  }
}

/** null clears it (Save or Cancel). */
export function keepGoalWork(userId: string, work: GoalWork | null): void {
  try {
    if (work) sessionStorage.setItem(workKey(userId), JSON.stringify(work));
    else sessionStorage.removeItem(workKey(userId));
  } catch {
    // blocked storage: the text stays while the editor is open
  }
}
