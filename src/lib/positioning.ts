// Positioning store — the consultant's F.A.D.S. output.
//
// F.A.D.S. (Audience Differentiation) defines WHO you serve, your EDGE, and a
// one-line POSITIONING statement. That output is the seed for the content plan:
// a clear niche makes every funnel-stage idea concrete instead of generic.
//
// One positioning per authenticated user, persisted to localStorage:
//   key: content-studio-positioning-${userId}

import { scoped } from "@/lib/profiles";
import type { FunnelStageId } from "@/data/funnelFramework";
export type PlanPlatform = "linkedin" | "instagram" | "facebook" | "tiktok";
export type PlanAudience =
  | "young-adult"
  | "working-adult"
  | "parent"
  | "pre-retiree"
  | "general";

export interface Positioning {
  /** One-line positioning: "I help X do Y so they can Z." */
  oneLiner: string;
  /** Who you serve (life-stage). */
  audience: PlanAudience;
  /** Free-text description of the exact audience ("fresh grads earning $3.5-4.5K"). */
  audienceDetail: string;
  /** Topics / niches you teach — drives Authority posts. One per line or comma. */
  topics: string[];
  /** Your edge / differentiation — why you, not the next advisor. */
  edge: string;
  /** Primary platform you post on. */
  platform: PlanPlatform;
  /** Posts per week you commit to. */
  cadence: number;
  updatedAt: string;
  /** What posting is for, in the user's words (saveGoal). */
  goal?: string;
  goalKind?: GoalKind;
  goalSetAt?: string;
}

export type GoalKind = "clients" | "audience" | "trust" | "recruit" | "time";
export const GOAL_KINDS: GoalKind[] = ["clients", "audience", "trust", "recruit", "time"];

/** The five goal chips, worded for a person or for a brand that speaks as a business. */
export function goalChips(speaker: "person" | "business"): Record<GoalKind, string> {
  return speaker === "business"
    ? {
        clients: "Get more sign-ups and enquiries",
        audience: "Grow an audience that knows what we do",
        trust: "Keep customers coming back and telling others",
        recruit: "Find people to join the team",
        time: "Post every week without it eating our time",
      }
    : {
        clients: "Get more enquiries from people I can help",
        audience: "Grow an audience that knows what I do",
        trust: "Keep in touch with clients so they refer me",
        recruit: "Find people to join my team",
        time: "Post every week without it taking my evenings",
      };
}

/** Funnel weights a goal steers the plan by; recruit and time keep the plan's own 4/4/2. */
export const GOAL_WEIGHTS: Partial<Record<GoalKind, Record<FunnelStageId, number>>> = {
  clients: { attraction: 2, trust: 4, conversion: 4 },
  audience: { attraction: 6, trust: 3, conversion: 1 },
  trust: { attraction: 3, trust: 6, conversion: 1 },
};

const KEY_PREFIX = "content-studio-positioning-";

export const CADENCE_OPTIONS = [3, 4, 5, 7] as const;

export const EMPTY_POSITIONING: Positioning = {
  oneLiner: "",
  audience: "general",
  audienceDetail: "",
  topics: [],
  edge: "",
  platform: "linkedin",
  cadence: 3,
  updatedAt: "",
};

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (_) {
    return null;
  }
}

export function loadPositioning(userId: string | null | undefined): Positioning | null {
  if (!userId) return null;
  const storage = safeStorage();
  if (!storage) return null;
  const raw = storage.getItem(`${KEY_PREFIX}${scoped(userId)}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Positioning;
    if (!parsed || typeof parsed !== "object") return null;
    return { ...EMPTY_POSITIONING, ...parsed };
  } catch (_) {
    return null;
  }
}

export function savePositioning(userId: string, positioning: Positioning): void {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(
    `${KEY_PREFIX}${scoped(userId)}`,
    JSON.stringify({ ...positioning, updatedAt: new Date().toISOString() }),
  );
}

/**
 * Sets the brand's goal and touches nothing else on its positioning (not even updatedAt).
 * False when storage refused the write.
 */
export function saveGoal(userId: string, text: string, kind: GoalKind): boolean {
  const storage = safeStorage();
  if (!storage) return false;
  const key = `${KEY_PREFIX}${scoped(userId)}`;
  let row: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(storage.getItem(key) ?? "null");
    if (parsed && typeof parsed === "object") row = parsed;
  } catch {
    // unreadable row: loadPositioning reads it as none, so the goal starts a new one
  }
  try {
    storage.setItem(key, JSON.stringify({ ...row, goal: text.trim().slice(0, 120), goalKind: kind, goalSetAt: new Date().toISOString() }));
  } catch {
    return false;
  }
  window.dispatchEvent(new Event("content-studio-positioning-changed"));
  return true;
}

export function isPositioningUsable(p: Positioning | null): boolean {
  if (!p) return false;
  return (
    p.topics.filter((t) => t.trim().length > 0).length >= 1 &&
    (p.oneLiner.trim().length > 0 || p.audienceDetail.trim().length > 0)
  );
}

/** Parse a freeform topics string ("CPF, ILPs\nretirement") into a clean list. */
export function parseTopics(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 12);
}
