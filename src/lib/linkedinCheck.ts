// The LinkedIn post check on a draft in Write (post-score's {check: "linkedin"}, Jev): eleven checks from Christian
// Di Bratto's list of what a LinkedIn post that takes off has, a Ship or Revise verdict and the one fix to make first.
// Each check is remembered on this device against the draft's exact text, like the score, so a draft is never checked
// twice. Counts against post-score's daily cap.
//   key: cs-linkedincheck-${scoped(userId)}  (device-only)

import { callFn } from "@/lib/edgeFn";
import { scoped } from "@/lib/profiles";
import { textKey } from "@/lib/postScore";
import { LINKEDIN_CHECK_IDS, type LinkedInCheck } from "../../supabase/functions/post-score/logic.ts";

export {
  LINKEDIN_CHECKS,
  LINKEDIN_CHECK_IDS,
  LINKEDIN_MEDIA_TIP,
  type LinkedInCheck,
  type LinkedInCheckId,
} from "../../supabase/functions/post-score/logic.ts";

const PREFIX = "cs-linkedincheck-";
const MAX_KEPT = 40;
const FAILED = "Couldn't check it right now. Try again in a minute.";

type Cache = Record<string, LinkedInCheck & { at: number }>;

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The cache key for a draft: the same fingerprint the score uses, so the draft itself is never stored. */
export const linkedInKey = (text: string) => textKey("linkedin", text);

export function loadLinkedInChecks(userId: string | null | undefined): Cache {
  if (!userId) return {};
  try {
    const v = JSON.parse(store()?.getItem(PREFIX + scoped(userId)) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Keeps a check, dropping the oldest beyond MAX_KEPT. */
export function saveLinkedInCheck(userId: string, key: string, check: LinkedInCheck, now = Date.now()): Cache {
  const all = { ...loadLinkedInChecks(userId), [key]: { ...check, at: now } };
  const kept = Object.fromEntries(Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_KEPT));
  try {
    store()?.setItem(PREFIX + scoped(userId), JSON.stringify(kept));
  } catch {
    // storage full: the check still shows for this visit
  }
  return kept;
}

export async function checkLinkedIn(text: string): Promise<LinkedInCheck> {
  const res = await callFn<LinkedInCheck>("post-score", { text, check: "linkedin" }, FAILED);
  const ok = res && (res.verdict === "ship" || res.verdict === "revise") && Array.isArray(res.missed) && res.missed.every((id) => LINKEDIN_CHECK_IDS.includes(id));
  if (!ok) throw new Error(FAILED);
  return res;
}
