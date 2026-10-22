// What the agent may do without a card (docs/north-star/items/agent-autonomy.md): the one switch, for moving a post,
// and the shadow log its thresholds are set from. No schedules (phase6-build-brief.md Q4).
//   content-studio-autonomy-<uid> (synced, per account): { changes: "ask" | "auto" }; anything missing reads "ask".
//   content-studio-agentshadow-<uid> (synced, per account): every approve and decline on a card, newest first, MAX_SHADOW.

import { SAVE_FAILED } from "@/lib/voiceMemory";

// shortcut: proposed, set from content-studio-agentshadow before auto goes on
export const AUTO_ACT_MIN = 0.85;
// shortcut: proposed, set from content-studio-agentshadow before auto goes on
export const AUTO_PICK_MIN = 0.8;
export const MAX_SHADOW = 200;

export const AUTONOMY_CHANGED = "content-studio-autonomy-changed";
export const SHADOW_CHANGED = "content-studio-agentshadow-changed";
const autonomyKey = (userId: string) => `content-studio-autonomy-${userId}`;
const shadowKey = (userId: string) => `content-studio-agentshadow-${userId}`;

export interface Autonomy {
  changes: "ask" | "auto";
}

/** One card decided: the act, Jev's probabilities for it, and whether Leo said yes. */
export interface Shadow {
  at: string;
  act: string;
  p: Record<string, number | null>;
  confirmed: boolean;
}

function read(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function write(key: string, event: string, value: unknown): string | null {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return SAVE_FAILED;
  }
  window.dispatchEvent(new Event(event));
  return null;
}

export function loadAutonomy(userId: string): Autonomy {
  return { changes: (read(autonomyKey(userId)) as Partial<Autonomy> | null)?.changes === "auto" ? "auto" : "ask" };
}

/** Null when saved, else the line. */
export const saveAutonomy = (userId: string, a: Autonomy): string | null =>
  write(autonomyKey(userId), AUTONOMY_CHANGED, { changes: a.changes === "auto" ? "auto" : "ask" });

const cleanP = (p: unknown): Shadow["p"] =>
  Object.fromEntries(
    Object.entries(p && typeof p === "object" ? p : {}).filter(([, v]) => v === null || (typeof v === "number" && Number.isFinite(v))),
  );

export function loadShadow(userId: string): Shadow[] {
  const rows = read(shadowKey(userId));
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((r) =>
    r && typeof r.at === "string" && typeof r.act === "string" && typeof r.confirmed === "boolean"
      ? [{ at: r.at, act: r.act, p: cleanP(r.p), confirmed: r.confirmed }]
      : [],
  );
}

/** Adds one decision at the top and keeps the newest MAX_SHADOW. Null when saved, else the line. */
export const recordShadow = (userId: string, s: Shadow): string | null =>
  write(shadowKey(userId), SHADOW_CHANGED, [{ at: s.at, act: s.act.slice(0, 40), p: cleanP(s.p), confirmed: s.confirmed }, ...loadShadow(userId)].slice(0, MAX_SHADOW));
