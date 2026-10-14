// A draft that mostly repeats one of your recent posts on the same network:
// Instagram and Facebook count a near copy as unoriginal and show it to fewer
// people. Measured, not judged: the share of words the two have in common
// (Jaccard over words of 3 letters or more, any case). Shown from 60%, over
// the 5 newest posted or scheduled posts on that network. Ported from
// mrlong0129/yominpost platform_risk.check_duplicate (MIT).
import type { DraftEntry } from "@/lib/draftHistory";

const MIN = 0.6;
const RECENT = 5;
const MIN_WORDS = 10;

const words = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}|\p{Script=Han}{2,}/gu) ?? []);

/** The share of words two texts have in common, 0 to 1. */
export function wordOverlap(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  const all = x.size + y.size - both;
  return all ? both / all : 0;
}

/** The recent post the draft mostly repeats, with the percent, or null. A recurring post repeats on purpose. */
export function nearDuplicate(text: string, platform: string, drafts: DraftEntry[], selfId: string | null): { post: DraftEntry; percent: number } | null {
  if (words(text).size < MIN_WORDS || drafts.find((d) => d.id === selfId)?.repeat) return null;
  const when = (d: DraftEntry) => d.postedAt ?? d.scheduledFor ?? "";
  const recent = drafts
    .filter((d) => d.id !== selfId && d.platform === platform && (d.status === "posted" || d.status === "scheduled") && when(d))
    .sort((a, b) => when(b).localeCompare(when(a)))
    .slice(0, RECENT);
  let best: { post: DraftEntry; percent: number } | null = null;
  for (const post of recent) {
    const share = wordOverlap(text, post.draft);
    if (share >= MIN && (!best || share * 100 > best.percent)) best = { post, percent: Math.round(share * 100) };
  }
  return best;
}
