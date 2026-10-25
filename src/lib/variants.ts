// Versions of one post (docs/north-star/items/remix-variations.md): the hook taken off and put back, the formulas a
// new hook tries, a hook test's result and its spread over open slots, and the drafts in one set. Pure, no AI:
// ranking is a measurement.

import { withReal } from "@/lib/analytics";
import { engagement, type DraftEntry } from "@/lib/draftHistory";
import { addDays } from "@/lib/dueDates";
import { HOOK_FORMULAS } from "@/lib/hookFormulas";
import { nextOpenSlots, type SlotBrand } from "@/lib/postingSlots";

/** The post without its first line (and the blank lines after it) when that line is the hook; the post whole otherwise. */
export function splitHook(draft: string, hook: string): string {
  const nl = draft.indexOf("\n");
  const first = nl < 0 ? draft : draft.slice(0, nl);
  if (!hook.trim() || first.trim() !== hook.trim()) return draft;
  return nl < 0 ? "" : draft.slice(nl).replace(/^\n+/, "");
}

export const joinHook = (hook: string, body: string) => `${hook}\n\n${body}`;

/**
 * The 3 formula ids after this one in HOOK_FORMULAS, wrapping round; the first 3 for none or an unknown one. `keep`
 * (Make 3 more like the winner): this one first, then the 2 after it.
 */
export function otherFormulas(own?: string, keep = false): string[] {
  const i = HOOK_FORMULAS.findIndex((f) => f.id === own);
  const from = keep && i >= 0 ? 0 : 1;
  return [0, 1, 2].map((k) => HOOK_FORMULAS[(i + from + k) % HOOK_FORMULAS.length].id);
}

export type HookTest = { kind: "waiting"; missing: number; total: number } | { kind: "close" } | { kind: "winner"; id: string };

/**
 * Waiting until every version has numbers (typed or pulled); then the leader by engagement rate when every version
 * has impressions, else by engagements. A winner only with a 15 percent lead on the next, else too close to call.
 */
export function hookTestResult(versions: DraftEntry[]): HookTest {
  const ms = versions.map((d) => withReal(d).metrics);
  const missing = ms.filter((m) => !m || !Object.values(m).some((v) => typeof v === "number")).length;
  if (missing || !versions.length) return { kind: "waiting", missing, total: versions.length };
  const byRate = ms.every((m) => (m.impressions ?? 0) > 0);
  const ranked = versions.map((d, i) => ({ id: d.id, n: engagement(ms[i]), of: byRate ? ms[i].impressions : 1 })).sort((a, b) => b.n / b.of - a.n / a.of);
  const [top, next] = ranked;
  // cross-multiplied, so a lead of exactly 15 percent on rates is not lost to rounding
  if (!top.n || (next && top.n * next.of * 100 < next.n * top.of * 115)) return { kind: "close" };
  return { kind: "winner", id: top.id };
}

export const SPREAD_DAYS = 3;

/**
 * Each unscheduled version on its network's next open slot, at least 3 days after the version before and never on a
 * day that already holds a post on that network. Scheduled versions stay where they are; `left` lists versions no
 * slot in `days` took.
 */
export function spreadSlots(versions: DraftEntry[], brand: SlotBrand | null | undefined, scheduled: Pick<DraftEntry, "platform" | "scheduledFor">[], now: Date, days = 42) {
  let after = versions.map((v) => v.scheduledFor?.slice(0, 10) ?? "").sort().pop() ?? "";
  const placed: { draftId: string; at: string }[] = [];
  const left: { draftId: string; platform: string }[] = [];
  for (const v of versions) {
    if (v.scheduledFor) continue;
    const busy = new Set(scheduled.filter((h) => h.platform === v.platform && h.scheduledFor).map((h) => h.scheduledFor!.slice(0, 10)));
    const from = after ? addDays(after, SPREAD_DAYS) : "";
    const slot = nextOpenSlots(brand, v.platform, scheduled, now, days).find((s) => s.date >= from && !busy.has(s.date));
    if (!slot) {
      left.push({ draftId: v.id, platform: v.platform });
      continue;
    }
    placed.push({ draftId: v.id, at: `${slot.date}T${slot.time}` });
    after = slot.date;
  }
  return { placed, left };
}

/** The drafts in one set, oldest first. */
export const draftsInSet = (drafts: DraftEntry[], id: string) => drafts.filter((d) => d.set?.id === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
