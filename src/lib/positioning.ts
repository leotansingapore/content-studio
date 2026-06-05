// Positioning store — the consultant's F.A.D.S. output.
//
// F.A.D.S. (Audience Differentiation) defines WHO you serve, your EDGE, and a
// one-line POSITIONING statement. That output is the seed for the content plan:
// a clear niche makes every funnel-stage idea concrete instead of generic.
//
// One positioning per authenticated user, persisted to localStorage:
//   key: content-studio-positioning-${userId}

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
}

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
  const raw = storage.getItem(`${KEY_PREFIX}${userId}`);
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
    `${KEY_PREFIX}${userId}`,
    JSON.stringify({ ...positioning, updatedAt: new Date().toISOString() }),
  );
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
