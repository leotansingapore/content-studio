// TikTok care per Zernio account (docs/north-star/items/publish-tiktok.md): the posting mode last used, whether the
// adviser said the account is warmed up, and how many posts it had when last read (account-posts, at most weekly).
// Synced per brand. Not security state: the server checks every account id again.

import { scoped } from "@/lib/profiles";

export type TikTokMode = "inbox" | "direct";
export interface TikTokAccountCare {
  mode: TikTokMode;
  warmedAt?: string;
  posts?: number;
  checkedAt?: string;
}
export type TikTokCare = Record<string, TikTokAccountCare>;

const KEY = "content-studio-tiktok-";
export const TIKTOK_CHANGED = "content-studio-tiktok-changed";
const WEEK_MS = 7 * 86_400_000;

const iso = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));

/** Every account's record; anything unreadable is left out. */
export function loadTikTokCare(userId: string): TikTokCare {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem(KEY + scoped(userId)) ?? "{}");
  } catch {
    return {};
  }
  const out: TikTokCare = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, r] of Object.entries(raw as Record<string, Record<string, unknown>>)) {
    if (!r || typeof r !== "object") continue;
    out[id] = {
      mode: r.mode === "direct" ? "direct" : "inbox",
      ...(iso(r.warmedAt) ? { warmedAt: r.warmedAt } : {}),
      ...(Number.isInteger(r.posts) && (r.posts as number) >= 0 ? { posts: r.posts as number } : {}),
      ...(iso(r.checkedAt) ? { checkedAt: r.checkedAt } : {}),
    };
  }
  return out;
}

/** False when this device's storage is full (what was saved before stays). */
function update(userId: string, accountId: string, change: Partial<TikTokAccountCare>): boolean {
  const care = loadTikTokCare(userId);
  care[accountId] = { mode: "inbox", ...care[accountId], ...change };
  try {
    localStorage.setItem(KEY + scoped(userId), JSON.stringify(care));
  } catch {
    return false;
  }
  globalThis.window?.dispatchEvent?.(new Event(TIKTOK_CHANGED));
  return true;
}

/** The account's saved mode; with none, Send to inbox (Leo, Q13). */
export const modeOf = (care: TikTokCare, accountId: string): TikTokMode => care[accountId]?.mode ?? "inbox";

export const saveMode = (userId: string, accountId: string, mode: TikTokMode) => update(userId, accountId, { mode });

/** "My account is warmed up" with "Don't ask again" ticked: direct from now on, and the guard never opens again. */
export const markWarmed = (userId: string, accountId: string, now = new Date()) => update(userId, accountId, { mode: "direct", warmedAt: now.toISOString() });

export const savePostCount = (userId: string, accountId: string, posts: number, now = new Date()) => update(userId, accountId, { posts, checkedAt: now.toISOString() });

/** True when the post count was never read or is a week old. */
export const postsStale = (rec: TikTokAccountCare | undefined, now = Date.now()) => !rec?.checkedAt || now - Date.parse(rec.checkedAt) >= WEEK_MS;

/** Fewer than 5 posts on the platform; an account never read is not called new. */
export const isNewTikTok = (posts: number | undefined) => typeof posts === "number" && posts < 5;
