// Autopilot's run (plan-autopilot, Leo only), outside React so leaving /plan never stops it. runAutopilot runs when
// /plan mounts (and, from wave 4, when the app opens): it sweeps the batches, lays out the target week, and writes
// the posts still to write with idea-dump mode "campaign" (cap campaign-draft, one use per call of up to 7 posts).
// Each post lands as a My posts draft (ap_<week>_<n>, status "draft") and waits in the batch for Approve, which is
// the only thing that puts it on the calendar. Approve, Skip, Undo and Turn off live here too, beside the run.

import { audienceLine, loadAudiences } from "@/lib/audiences";
import { planContextFor } from "@/lib/angleSuggest";
import { anglesFor } from "@/lib/angles";
import {
  AUTOPILOT_CHANGED,
  GUARD_MS,
  daysPlanned,
  draftFor,
  layoutWeek,
  loadAutopilot,
  nextReset,
  postAsk,
  postsToWrite,
  saveAutopilot,
  sweep,
  targetWeeks,
  type AutopilotState,
  type Batch,
  type BatchPost,
} from "@/lib/autopilot";
import { loadBrand } from "@/lib/carousel";
import { loadPlan, planOptionsFor, slotLabel, steerFor } from "@/lib/contentPlan";
import { scheduleAt } from "@/lib/dueDates";
import { deleteDraft, draftStatus, draftsChanged, loadDrafts, setDraftStatus, upsertDraft, type DraftEntry } from "@/lib/draftHistory";
import { EdgeError, callFn } from "@/lib/edgeFn";
import { loadGoals, sgDay, withGoalCadence } from "@/lib/goals";
import { loadLabels } from "@/lib/labels";
import { isPositioningUsable, loadPositioning } from "@/lib/positioning";
import { scoped } from "@/lib/profiles";
import { speakerFor } from "@/lib/remixBrand";
import type { WrittenPost } from "../../supabase/functions/idea-dump/logic.ts";

export const ERROR_LINE = "Couldn't write next week's posts. Try again.";
export const PAUSED_LINE = "Writing paused until 8am. Today's limit for writing posts is used.";
export const FAILED_POST_LINE = "This post could not be written.";
const PER_CALL = 7;

/** What the card shows of the run on this device: writing k of n, the last run's error, or why nothing was written. */
export interface AutopilotRun {
  running?: { done: number; of: number };
  error?: string;
  /** Nothing to write because these slots' days already hold a written post. */
  planned?: number;
}

const runs = new Map<string, AutopilotRun>();
const busy = new Set<string>();
/** startedAt stamps this device wrote, so its own retry is not mistaken for another device's run. */
const mine = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const setRun = (scope: string, r: AutopilotRun) => {
  runs.set(scope, r);
  notify();
};

export const autopilotRun = (userId: string): AutopilotRun => runs.get(scoped(userId)) ?? {};

/** Calls `cb` when the run moves or the stored autopilot changes; returns the unsubscribe. */
export function onAutopilot(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener(AUTOPILOT_CHANGED, cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener(AUTOPILOT_CHANGED, cb);
  };
}

/** Changes the posts `fn` maps (by week and n) on a fresh read of the store, so a change made during a call is kept. */
function patchPosts(userId: string, fn: (b: Batch, p: BatchPost) => Partial<BatchPost> | null, batch?: (b: Batch) => Batch): AutopilotState | null {
  const st = loadAutopilot(userId);
  const next = {
    ...st,
    batches: st.batches.map((b) => {
      const posts = b.posts.map((p) => {
        const patch = fn(b, p);
        return patch ? { ...p, ...patch } : p;
      });
      return batch ? batch({ ...b, posts }) : { ...b, posts };
    }),
  };
  return saveAutopilot(userId, next) ? null : next;
}

const isWritten = (p: BatchPost) => p.state === "review" || p.state === "approved" || p.state === "missed" || p.state === "skipped";

/**
 * Sweeps the brand's batches, then writes the target week's posts still to write. Does nothing while autopilot is
 * off, while this device is already writing, while today's cap is used (waitUntil), or while another device's run
 * started under 10 minutes ago. `now` is passed in (tests), never read twice.
 */
export async function runAutopilot(userId: string, now = new Date()): Promise<void> {
  const scope = scoped(userId);
  let state = loadAutopilot(userId);
  if (!state.settings.on || busy.has(scope)) return;
  busy.add(scope);
  try {
    const today = sgDay(now);
    const drafts = loadDrafts(userId);
    const swept = sweep(state, drafts, today, now);
    if (swept && !saveAutopilot(userId, swept)) state = swept;
    const saved = loadPositioning(userId);
    if (!saved || !isPositioningUsable(saved)) return;
    const positioning = withGoalCadence(saved, loadGoals(userId));
    const { settings } = state;
    const speaker = speakerFor(userId);
    const main = speaker === "business" ? loadAudiences(userId, now)[0] : undefined;
    const options = {
      ...planOptionsFor(userId, positioning.platform, { competitors: [], plan: loadPlan(userId) }),
      ...steerFor(userId),
      formats: settings.formats,
      // a business's week takes its own subjects and its audience's saved angles, never /plan's adviser library (live-p5w3 D1)
      ...(speaker === "business" ? { speaker, angles: main ? anglesFor(userId, main.id) : [] } : {}),
    };
    const todo: { week: string; post: BatchPost }[] = [];
    const fresh: Batch[] = [];
    let planned = 0;
    for (const week of targetWeeks(settings, today)) {
      const kept = state.batches.find((b) => b.week === week);
      const batch = kept ?? { week, posts: layoutWeek(positioning, options, week, settings.windowDays) };
      if (batch.waitUntil && Date.parse(batch.waitUntil) > now.getTime()) return setRun(scope, {});
      if (batch.startedAt && !mine.has(batch.startedAt) && now.getTime() - Date.parse(batch.startedAt) < GUARD_MS) return;
      const posts = postsToWrite(batch, drafts, today, settings);
      planned += daysPlanned(batch, drafts);
      if (posts.length && !kept) fresh.push(batch);
      todo.push(...posts.map((post) => ({ week, post })));
    }
    if (!todo.length) return setRun(scope, planned ? { planned } : {});

    const startedAt = now.toISOString();
    mine.add(startedAt);
    const writing = new Set(todo.map((t) => `${t.week}:${t.post.n}`));
    const weeks = new Set(todo.map((t) => t.week));
    const started: AutopilotState = {
      ...state,
      batches: [...fresh, ...state.batches].map((b) =>
        weeks.has(b.week)
          ? { ...b, startedAt, waitUntil: undefined, posts: b.posts.map((p) => (writing.has(`${b.week}:${p.n}`) ? { ...p, state: "writing" as const } : p)) }
          : b,
      ),
    };
    const line = saveAutopilot(userId, started);
    if (line) return setRun(scope, { error: line });
    setRun(scope, { running: { done: 0, of: todo.length } });

    for (let i = 0; i < todo.length; i += PER_CALL) {
      const chunk = todo.slice(i, i + PER_CALL);
      const error = await writeChunk(userId, positioning.audienceDetail, chunk, now);
      if (error !== null) {
        // the rest wait for the next run; a batch with nothing written loses its stamp, so a retry is never held back
        const left = new Set(todo.slice(i + PER_CALL).map((t) => `${t.week}:${t.post.n}`));
        patchPosts(
          userId,
          (b, p) => (left.has(`${b.week}:${p.n}`) && p.state === "writing" ? { state: "waiting" } : null),
          (b) => (weeks.has(b.week) && !b.posts.some(isWritten) ? { ...b, startedAt: undefined } : b),
        );
        return setRun(scope, error ? { error } : {});
      }
      setRun(scope, { running: { done: Math.min(todo.length, i + PER_CALL), of: todo.length } });
    }
    setRun(scope, {});
  } finally {
    busy.delete(scope);
  }
}

/** One idea-dump call. Null when it answered; "" when paused by the cap; else the line to show. */
async function writeChunk(userId: string, audienceDetail: string, chunk: { week: string; post: BatchPost }[], now: Date): Promise<string | null> {
  const key = (t: { week: string; post: BatchPost }) => `${t.week}:${t.post.n}`;
  const ids = new Set(chunk.map(key));
  const main = loadAudiences(userId, now)[0];
  const context = { ...planContextFor(userId, chunk[0].post.slot.platform), audience: main ? audienceLine(main, speakerFor(userId)) : audienceDetail };
  // hooks autopilot already wrote, newest first, so a new week never opens like the last one
  const avoid = loadDrafts(userId).filter((d) => d.id.startsWith("ap_") && d.hook.trim()).slice(0, 20).map((d) => d.hook.trim());
  try {
    const r = await callFn<{ posts?: WrittenPost[] }>(
      "idea-dump",
      { mode: "campaign", posts: chunk.map((t, k) => postAsk(t.post, k + 1)), context, avoid },
      ERROR_LINE,
    );
    const got = new Map((Array.isArray(r?.posts) ? r.posts : []).filter((w) => w && typeof w.hook === "string").map((w) => [w.n, w]));
    const brand = loadBrand(userId);
    const labels = loadLabels(userId);
    const written = new Map<string, WrittenPost>();
    chunk.forEach((t, k) => {
      const w = got.get(k + 1);
      if (w) written.set(key(t), w);
    });
    // post 1 ends on top of My posts
    for (const t of [...chunk].reverse()) {
      const w = written.get(key(t));
      if (w) upsertDraft(userId, draftFor(t.post, w, brand, now, slotLabel(t.post.slot, labels)?.id));
    }
    patchPosts(userId, (b, p) => {
      const k = `${b.week}:${p.n}`;
      if (!ids.has(k)) return null;
      const w = written.get(k);
      return w ? { state: "review", mas: w.mas ?? null } : { state: "failed" };
    });
    draftsChanged();
    return null;
  } catch (e) {
    const err = e instanceof EdgeError ? e : null;
    const paused = err?.status === 429;
    // OpenAI never answered (502, the use given back) or its words were unusable (422, use kept): the posts failed
    const failed = err?.status === 502 || err?.status === 422;
    patchPosts(
      userId,
      (b, p) => (ids.has(`${b.week}:${p.n}`) ? { state: failed ? "failed" : "waiting" } : null),
      (b) => (paused && chunk.some((t) => t.week === b.week) ? { ...b, waitUntil: nextReset(now) } : b),
    );
    if (paused || failed) return "";
    // the gate says why in its own words; anything else (503, 404, offline) is worth one more try
    return err?.code === "not_enabled" ? err.message : ERROR_LINE;
  }
}

/** Try again: failed posts go back to waiting, then the run writes every post still to write in one call. */
export function tryAgain(userId: string, now = new Date()): Promise<void> {
  patchPosts(userId, (_b, p) => (p.state === "failed" ? { state: "waiting" } : null));
  setRun(scoped(userId), {});
  return runAutopilot(userId, now);
}

// ---- The person's presses ------------------------------------------------------------------

/** The placeholder each approve took off the calendar, so Undo puts it back (this device, this session). */
const removed = new Map<string, DraftEntry>();

const findPost = (userId: string, week: string, n: number) => loadAutopilot(userId).batches.find((b) => b.week === week)?.posts.find((p) => p.n === n) ?? null;
const setState = (userId: string, week: string, n: number, state: BatchPost["state"]) =>
  patchPosts(userId, (b, p) => (b.week === week && p.n === n ? { state } : null));

/** Approve: the draft goes on the calendar at its slot's day and time, and that day's empty plan_ placeholder comes off. */
export function approvePost(userId: string, week: string, n: number): boolean {
  const p = findPost(userId, week, n);
  const drafts = loadDrafts(userId);
  if (!p || p.state !== "review" || !drafts.some((d) => d.id === p.draftId)) return false;
  const holder = drafts.find((d) => d.id.startsWith("plan_") && !d.draft.trim() && draftStatus(d) === "scheduled" && d.scheduledFor?.slice(0, 10) === p.day);
  setDraftStatus(userId, p.draftId, "scheduled", scheduleAt(p.day, p.time));
  if (holder) {
    deleteDraft(userId, holder.id);
    removed.set(p.draftId, holder);
  }
  setState(userId, week, n, "approved");
  draftsChanged();
  return true;
}

/** Approve all: every post of the week waiting for an OK. Returns how many went on the calendar. */
export const approveAll = (userId: string, week: string): number =>
  (loadAutopilot(userId).batches.find((b) => b.week === week)?.posts ?? []).filter((p) => p.state === "review" && approvePost(userId, week, p.n)).length;

/** Undo on an approved row: back to an unscheduled draft waiting for an OK, and the placeholder back on its day. */
export function undoApprove(userId: string, week: string, n: number): void {
  const p = findPost(userId, week, n);
  if (!p || p.state !== "approved") return;
  setDraftStatus(userId, p.draftId, "draft");
  const holder = removed.get(p.draftId);
  removed.delete(p.draftId);
  if (holder && !loadDrafts(userId).some((d) => d.id === holder.id)) upsertDraft(userId, holder);
  setState(userId, week, n, "review");
  draftsChanged();
}

/** Skip: the draft is deleted and the batch keeps the post as skipped, so it is never written again. Returns the Undo. */
export function skipPost(userId: string, week: string, n: number): (() => void) | null {
  const p = findPost(userId, week, n);
  if (!p || p.state !== "review") return null;
  const entry = loadDrafts(userId).find((d) => d.id === p.draftId);
  deleteDraft(userId, p.draftId);
  setState(userId, week, n, "skipped");
  draftsChanged();
  return () => {
    if (entry && !loadDrafts(userId).some((d) => d.id === entry.id)) upsertDraft(userId, entry);
    setState(userId, week, n, "review");
    draftsChanged();
  };
}

/** Turn off (no confirm): returns the Undo for the toast. */
export function turnOff(userId: string): () => void {
  const st = loadAutopilot(userId);
  saveAutopilot(userId, { ...st, settings: { ...st.settings, on: false } });
  return () => {
    const now = loadAutopilot(userId);
    saveAutopilot(userId, { ...now, settings: { ...now.settings, on: true } });
  };
}
