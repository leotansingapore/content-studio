// The predicted engagement score on a draft in Write (post-score edge function,
// Jev). Each score is remembered on this device against the draft's exact text
// and platform, so a draft is never scored twice and going back to an earlier
// wording shows its score at once.
//   key: cs-postscore-${scoped(userId)}  (device-only)

import { callFn } from "@/lib/edgeFn";
import { scoped } from "@/lib/profiles";
import type { PostScore } from "../../supabase/functions/post-score/logic.ts";

export { FACTORS, type FactorId, type PostScore } from "../../supabase/functions/post-score/logic.ts";

const PREFIX = "cs-postscore-";
const MAX_KEPT = 40;

type Cache = Record<string, PostScore & { at: number }>;

/** A short fingerprint of the platform and text (cyrb53), so the cache never stores the draft itself. */
export function textKey(platform: string, text: string): string {
  const s = `${platform}\n${text.trim()}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${s.length}-${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadScores(userId: string | null | undefined): Cache {
  if (!userId) return {};
  try {
    const v = JSON.parse(store()?.getItem(PREFIX + scoped(userId)) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Keeps a score, dropping the oldest beyond MAX_KEPT. */
export function saveScore(userId: string, key: string, score: PostScore, now = Date.now()): Cache {
  const all = { ...loadScores(userId), [key]: { ...score, at: now } };
  const kept = Object.fromEntries(Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_KEPT));
  try {
    store()?.setItem(PREFIX + scoped(userId), JSON.stringify(kept));
  } catch {
    // storage full: the score still shows for this visit
  }
  return kept;
}

export async function scorePost(text: string, platform: string): Promise<PostScore> {
  const res = await callFn<PostScore>("post-score", { text, platform }, "Couldn't score it right now. Try again in a minute.");
  if (typeof res?.score !== "number" || !Array.isArray(res.down)) throw new Error("Couldn't score it right now. Try again in a minute.");
  return res;
}
