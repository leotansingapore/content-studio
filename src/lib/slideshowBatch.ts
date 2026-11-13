// A slideshow batch (/make/slideshow, BuilderCult's Batch Studio as Postmosis does it): every picked kept hook (My hooks)
// made once in every picked look, one make after another through slideshowJob.ts, so each is a normal saved Slideshow
// on the same remix-make and slide-pictures caps. Outside React like the job, so leaving the page keeps it going; in
// memory only, so a reload stops the runs not yet started (the made ones are saved).

import { PHOTO_MOOD_IDS, PHOTO_MOODS, slideshowBusy, slideshowJob, startSlideshow, type PhotoMood, type SlideshowAsk } from "@/lib/slideshowJob";
import { EXPLAINER_LOOKS, LOOK_IDS, type LookId } from "../../supabase/functions/ai-video/logic.ts";
import { DAILY_LIMITS } from "../../supabase/functions/_shared/usageCaps.ts";

export const MAKES = DAILY_LIMITS["remix-make"];
export const AI_SETS = DAILY_LIMITS["slide-pictures"];

/** Stock photos (one per point or one mood), the brand's own media, or AI pictures in one look. */
export type BatchLook = "stock" | PhotoMood | "mine" | `ai-${LookId}`;
export const BATCH_LOOKS: BatchLook[] = ["stock", ...PHOTO_MOOD_IDS, "mine", ...LOOK_IDS.map((l) => `ai-${l}` as const)];
/** shortcut: 12 makes is 40% of a day's 30 remix makes, raise it if people ask for bigger grids. */
export const MAX_BATCH = 12;
export const MAX_BATCH_HOOKS = 6;

/** What a batch of `hooks` x `looks` makes and spends, and why it can't run yet. */
export function batchPlan(hooks: number, looks: BatchLook[], makesLeft: number = MAKES, aiLeft: number = AI_SETS): { count: number; ai: number; reason: string | null } {
  const count = hooks * looks.length;
  const ai = hooks * looks.filter(isAiLook).length;
  const reason =
    !hooks ? "Pick at least one hook."
    : !looks.length ? "Pick at least one look."
    : count > MAX_BATCH ? `That's ${count} slideshows. A batch makes at most ${MAX_BATCH}.`
    : count > makesLeft ? `That's ${count} slideshows. Today has ${makesLeft} makes left.`
    : ai > aiLeft ? `That's ${ai} sets of AI pictures. Today has ${aiLeft} left.`
    : null;
  return { count, ai, reason };
}

export const isAiLook = (l: BatchLook): l is `ai-${LookId}` => l.startsWith("ai-");

export function lookLabel(l: BatchLook): string {
  if (l === "stock") return "Stock, one per point";
  if (l === "mine") return "My media";
  if (isAiLook(l)) return `AI: ${EXPLAINER_LOOKS[l.slice(3) as LookId].label}`;
  return PHOTO_MOODS[l].label;
}

/** The picture fields one look sets on a make. */
export function lookAsk(l: BatchLook): Pick<SlideshowAsk, "pictures" | "mood" | "look"> {
  if (l === "mine") return { pictures: "mine" };
  if (isAiLook(l)) return { pictures: "ai", look: l.slice(3) as LookId };
  return l === "stock" ? { pictures: "stock" } : { pictures: "stock", mood: l };
}

export interface BatchRun {
  hook: string;
  look: BatchLook;
  state: "waiting" | "making" | "done" | "failed" | "skipped";
  showId?: string;
  error?: string;
  /** Why its AI pictures came from stock (the job's note). */
  note?: string;
}

export interface SlideshowBatch {
  id: number;
  runs: BatchRun[];
  /** Why the runs left were skipped: today's makes ran out. */
  stopped?: string;
}

/** Each hook in each look, hooks outer so one hook's looks sit together; blanks and repeats dropped, at most MAX_BATCH. */
export function batchPairs(hooks: string[], looks: BatchLook[]): Pick<BatchRun, "hook" | "look">[] {
  const hs = [...new Set(hooks.map((h) => h.trim()).filter(Boolean))];
  const ls = [...new Set(looks)];
  return hs.flatMap((hook) => ls.map((look) => ({ hook, look }))).slice(0, MAX_BATCH);
}

let batch: SlideshowBatch | null = null;
let seq = 0;
const listeners = new Set<(b: SlideshowBatch | null) => void>();
const publish = () => listeners.forEach((l) => l(batch && { ...batch, runs: batch.runs.map((r) => ({ ...r })) }));
export const slideshowBatch = () => batch;
export const batchBusy = () => !!batch?.runs.some((r) => r.state === "waiting" || r.state === "making");
export function onSlideshowBatch(fn: (b: SlideshowBatch | null) => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
export const clearSlideshowBatch = () => void (batch && !batchBusy() && ((batch = null), publish()));

/**
 * Runs the pairs in turn on `base` (mention, size, steer). Each hook is also the make's topic, so the slides answer it.
 * A make that hits today's cap skips the rest; any other failure moves on to the next pair.
 */
export async function startBatch(userId: string, base: Pick<SlideshowAsk, "mention" | "inside" | "note" | "size">, pairs: Pick<BatchRun, "hook" | "look">[]): Promise<void> {
  if (batchBusy() || slideshowBusy() || !pairs.length) return;
  const id = ++seq;
  batch = { id, runs: pairs.map((p) => ({ ...p, state: "waiting" })) };
  publish();
  for (const run of batch.runs) {
    if (batch?.id !== id) return;
    if (batch.stopped) {
      run.state = "skipped";
      continue;
    }
    run.state = "making";
    publish();
    await startSlideshow(userId, { source: null, topic: run.hook.slice(0, 200), hook: run.hook, ...base, ...lookAsk(run.look) });
    const j = slideshowJob();
    if (j?.state === "done" && j.showId) Object.assign(run, { state: "done", showId: j.showId, ...(j.note ? { note: j.note } : {}) });
    else {
      Object.assign(run, { state: "failed", error: j?.error ?? "Couldn't make this one." });
      if (j?.capped) batch.stopped = j.error;
    }
    publish();
  }
  publish();
}
