// The Zernio outbox (publish-calendar): moves and cancels of posts Zernio holds, waiting for the runner
// (useZernioOutbox) to send them with the `social` actions `move` and `cancel`. One per brand, synced, so a move
// made on the phone is sent by whichever device opens the app next. Not security state: the server checks the
// post is the caller's on every call and refuses one that is going out (409).
//   key: content-studio-zernio-outbox-${scoped(userId)}
//
// Ops come only from the person's own action on this device (phase 7 decision 6): a cancel from deleteDraft or
// Back in drafts (queueCancel), a move when a save changes the time of a post Zernio holds (zernioOps, called by
// saveDrafts). The 150 trim and a cloudSync pull queue nothing, and every op is made from one of this brand's
// drafts, so a post the board publisher made is never moved or cancelled.

import { scoped } from "@/lib/profiles";
import { zernioTime } from "@/lib/autoPost";
import type { DraftEntry } from "@/lib/draftHistory";

export type OutboxOp = { id: string; postId: string; op: "move" | "cancel"; at?: string; title: string; tries: number; error?: string };
/** The waiting ops (one per post) and the last post ids Zernio cancelled, whose links are stripped on the next save. */
export type Outbox = { ops: OutboxOp[]; gone: string[] };
export type SendResult = "done" | "published" | "gone" | { error: string };

const KEY = "content-studio-zernio-outbox-";
const CHANGED = "content-studio-zernio-outbox-changed";
const MAX_OPS = 50;
const MAX_GONE = 50;
/** The runner tries an op this many times on its own, then it waits for Retry. */
export const MAX_TRIES = 3;

const EMPTY: Outbox = { ops: [], gone: [] };

/** Zernio still has the post to send: the link has its id, and it has not gone out, failed or been cancelled. */
export const zernioHolds = (d: Pick<DraftEntry, "zernio">): boolean =>
  !!d.zernio?.postId && !["published", "partial", "failed", "cancelled"].includes(d.zernio.status ?? "");

/** Held and not going out right now (a publishing post can't move or be cancelled). */
const changeable = (d: Pick<DraftEntry, "zernio">, gone: string[]) => zernioHolds(d) && d.zernio!.status !== "publishing" && !gone.includes(d.zernio!.postId!);

/** The moment a draft's time names, as Zernio takes it, in the zone its post was scheduled in; a day with no time goes out at 9:00 there. */
const zernioAt = (scheduledFor: string, tz?: string) => zernioTime(scheduledFor, undefined, tz) ?? zernioTime(scheduledFor.slice(0, 10), "09:00", tz)!;

const opId = () => `o-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`;
const titleOf = (d: DraftEntry) => (d.hook || d.pillarDetail || "Untitled post").replace(/\s+/g, " ").trim().slice(0, 120);

/** `ops` with `op` in place of any op for the same post (one op per post, the newest wins). */
const withOp = (ops: OutboxOp[], op: OutboxOp) => [...ops.filter((o) => o.postId !== op.postId), op];

/**
 * The outbox after a save, from the drafts before and after it: a held post whose time changed gets a move op, and
 * one put back on the moment Zernio holds (an Undo) loses its op. Only drafts whose time or status this save changed
 * count. Never a cancel (queueCancel makes those), and the same box back when nothing changed.
 */
export function zernioOps(before: DraftEntry[], after: DraftEntry[], box: Outbox): Outbox {
  const was = new Map(before.map((d) => [d.id, d]));
  let ops = box.ops;
  for (const d of after) {
    const prev = was.get(d.id);
    if (!changeable(d, box.gone) || (prev && prev.scheduledFor === d.scheduledFor && prev.status === d.status)) continue;
    if (d.status !== "scheduled" || !d.scheduledFor) continue;
    const z = d.zernio!;
    const at = zernioAt(d.scheduledFor, z.tz);
    if (z.at && Date.parse(at) === Date.parse(z.at)) {
      if (ops.some((o) => o.postId === z.postId)) ops = ops.filter((o) => o.postId !== z.postId);
    }
    else if (prev?.scheduledFor !== d.scheduledFor) ops = withOp(ops, { id: opId(), postId: z.postId!, op: "move", at, title: titleOf(d), tries: 0 });
  }
  return ops === box.ops ? box : { ...box, ops };
}

/**
 * Queues a cancel for a post Zernio holds, in place of any waiting move (deleteDraft and Back in drafts call it).
 * `failed`: a post that failed too, which Zernio keeps until it is cancelled (deleteDraft only: an Undo of Back in
 * drafts drops a waiting op only for a held post, through zernioOps).
 */
export function queueCancel(userId: string, draft: DraftEntry, failed = false): void {
  const box = loadOutbox(userId);
  const z = draft.zernio;
  const leftOnZernio = failed && !!z?.postId && z.status === "failed" && !box.gone.includes(z.postId);
  if (!leftOnZernio && !changeable(draft, box.gone)) return;
  saveOutbox(userId, { ...box, ops: withOp(box.ops, { id: opId(), postId: draft.zernio!.postId!, op: "cancel", title: titleOf(draft), tries: 0 }) });
}

/**
 * Sends each op in order and returns the ones still waiting. "done", "published" (409: it's going out, so the op
 * goes) and "gone" (404: already cancelled, maybe by the other device) take the op off; an error keeps it with one
 * more try and the reason. An op that has had MAX_TRIES is not sent: it waits for Retry.
 */
export async function runOutbox(ops: OutboxOp[], send: (op: OutboxOp) => Promise<SendResult>): Promise<OutboxOp[]> {
  const left: OutboxOp[] = [];
  for (const op of ops) {
    if (op.tries >= MAX_TRIES) {
      left.push(op);
      continue;
    }
    let r: SendResult;
    try {
      r = await send(op);
    } catch (e) {
      r = { error: e instanceof Error ? e.message : String(e) };
    }
    if (typeof r === "object") left.push({ ...op, tries: op.tries + 1, error: r.error });
  }
  return left;
}

/**
 * Writes a run into the stored outbox: each op in `sent` comes off, or becomes its copy in `left` (runOutbox's
 * answer); ops queued while it ran stay; `gone` (the post ids Zernio cancelled) joins the last 50. Retry is
 * `settleOutbox(userId, [op], [{ ...op, tries: 0 }])`.
 */
export function settleOutbox(userId: string, sent: OutboxOp[], left: OutboxOp[], gone: string[] = []): void {
  const box = loadOutbox(userId);
  const sentIds = new Set(sent.map((o) => o.id));
  const kept = new Map(left.map((o) => [o.id, o]));
  const ops = box.ops.flatMap((o) => (!sentIds.has(o.id) ? [o] : kept.has(o.id) ? [kept.get(o.id)!] : []));
  saveOutbox(userId, { ops, gone: [...box.gone.filter((id) => !gone.includes(id)), ...gone] });
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const ofStrings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function loadOutbox(userId: string): Outbox {
  try {
    const raw = JSON.parse(storage()?.getItem(KEY + scoped(userId)) ?? "null") as Partial<Outbox> | null;
    if (!raw || typeof raw !== "object") return EMPTY;
    const ops = (Array.isArray(raw.ops) ? raw.ops : []).filter(
      (o): o is OutboxOp => !!o && typeof o.id === "string" && typeof o.postId === "string" && (o.op === "move" || o.op === "cancel") && typeof o.tries === "number",
    );
    return { ops, gone: ofStrings(raw.gone) };
  } catch {
    return EMPTY;
  }
}

/** Saves the outbox (the newest 50 ops and 50 gone ids) and tells the runner; false when storage refused it. */
export function saveOutbox(userId: string, box: Outbox): boolean {
  try {
    storage()?.setItem(KEY + scoped(userId), JSON.stringify({ ops: box.ops.slice(-MAX_OPS), gone: box.gone.slice(-MAX_GONE) }));
  } catch {
    return false;
  }
  globalThis.dispatchEvent?.(new Event(CHANGED));
  return true;
}

/** Calls `cb` whenever the outbox is saved on this device; returns the unsubscribe, for a useEffect. */
export function onOutbox(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
}
