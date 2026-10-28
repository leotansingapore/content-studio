// The Zernio outbox runner (publish-calendar): sends the moves and cancels zernioOutbox.ts queued for the open
// brand with the `social` actions `move` and `cancel`, on load, whenever the outbox changes on this device, and when
// the browser comes back online. Mounted once in StudioLayout for every sign-in; with nothing queued it sends nothing,
// and only SOCIAL_CONNECT_USERS callers ever hold a Zernio post. Every op came from the person's own drag, "Back in
// drafts" or delete (phase 7 decision 6), and the server checks each post is theirs and refuses one going out (409).
//
// Also the Needs you rows the calendar draws for Leo: posts that didn't post, ops that stopped after 3 tries, and
// TikTok inbox drafts to finish.

import { useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { EdgeError, callFn } from "@/lib/edgeFn";
import { logActivity } from "@/lib/activity";
import { links } from "@/lib/links";
import { activeProfileId } from "@/lib/profiles";
import { isNotEnabled, platformName } from "@/lib/socialConnect";
import { cancelPost, chipOf, linkFromView, postedNow, retryPost, tiktokReason, wallIn, zoneLabel, type PostView } from "@/lib/autoPost";
import { draftStatus, draftsChanged, loadDrafts, restoreDraft, setDraftStatus, setDraftZernio, type DraftEntry } from "@/lib/draftHistory";
import { MAX_TRIES, loadOutbox, onOutbox, saveOutbox, settleOutbox, zernioOps, runOutbox, type Outbox, type OutboxOp, type SendResult } from "@/lib/zernioOutbox";

/** tz: the zone the post was scheduled in, sent only when it isn't Singapore (as before 28 Oct). */
export const movePost = (profileId: string, postId: string, scheduledFor: string, tz?: string) =>
  callFn<{ post: PostView }>("social", { action: "move", profileId, postId, scheduledFor, ...(tz ? { timezone: tz } : {}) }, "Couldn't move it on Zernio. Try again in a minute.");

/**
 * A cancel waits this long before it goes, so the toast's Undo can still drop it (Zernio can't bring a cancelled post
 * back). shortcut: the toast's Undo lasts about 5 s (Radix's default); an Undo pressed later finds the post cancelled
 * and the draft without its auto-post. Upgrade to holding cancels until the toast closes if that bites.
 */
export const CANCEL_GRACE_MS = 6_000;

let running = false;
let again = false;
// while the runner writes its own results: the outbox event that write sends is not a new op
let quiet = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const seen = new Map<string, number>();

const noun = (title: string) => `"${title.length > 70 ? `${title.slice(0, 67).trimEnd()}...` : title}"`;
const names = (d: DraftEntry) => (d.zernio?.platforms?.length ? d.zernio.platforms : [d.platform]).map(platformName).join(" and ");
function log(userId: string, d: DraftEntry | undefined, title: string, detail?: string) {
  logActivity(userId, { who: "you", kind: "post", title, ...(detail ? { detail } : {}), ...(d ? { link: links.calendar({ post: d.id }) } : {}) });
}

/** A 404 that isn't "not enabled", or a move refused because Zernio already cancelled it: the post is gone. */
const isGone = (e: unknown) => e instanceof EdgeError && ((e.status === 404 && !isNotEnabled(e)) || (e.status === 409 && e.code === "cancelled"));

async function sendOne(userId: string, profileId: string, op: OutboxOp, gone: string[]): Promise<SendResult> {
  const d = loadDrafts(userId).find((x) => x.zernio?.postId === op.postId);
  // a move needs its draft (the post is the draft's); a cancel's draft may already be deleted
  if (op.op === "move" && !d) return "done";
  try {
    if (op.op === "move") {
      const { post } = await movePost(profileId, op.postId, op.at!, d!.zernio!.tz);
      const numbers = d!.zernio!.numbers;
      setDraftZernio(userId, d!.id, { ...linkFromView(d!.zernio!.key, post), ...(numbers ? { numbers } : {}) });
      // moved again or put back while this move was out (zernioOps compared against the old time): queue it again
      const cur = loadDrafts(userId).find((x) => x.id === d!.id);
      const box = loadOutbox(userId);
      const next = cur ? zernioOps([{ ...cur, scheduledFor: "" }], [cur], box) : box;
      if (next !== box) saveOutbox(userId, next);
      log(userId, d, `Moved ${noun(op.title)} on Zernio`, post.scheduledFor ? `Goes out ${zoneLabel(post.scheduledFor, d!.zernio!.tz)}.` : undefined);
      return "done";
    }
    await cancelPost(profileId, op.postId);
    gone.push(op.postId);
    if (d) setDraftZernio(userId, d.id, null);
    log(userId, d, `Cancelled posting ${noun(op.title)}`, "Zernio won't post it.");
    return "done";
  } catch (e) {
    if (isGone(e)) {
      gone.push(op.postId);
      if (d) setDraftZernio(userId, d.id, null);
      // a 404 on a cancel is a cancel done (the other device sent it first, or it was already gone)
      if (op.op === "cancel") log(userId, d, `Cancelled posting ${noun(op.title)}`, "Zernio won't post it.");
      else log(userId, d, `${noun(op.title)} is gone from Zernio`, "It stays in My posts.");
      return "gone";
    }
    if (e instanceof EdgeError && e.status === 409 && e.code === "published") {
      if (op.op === "move" && d) {
        // it is going out at the time Zernio holds: the card goes back there, reading Posting until the next read
        const at = d.zernio!.at;
        setDraftZernio(userId, d.id, { ...d.zernio!, status: "publishing" });
        if (at) setDraftStatus(userId, d.id, "scheduled", wallIn(at, d.zernio!.tz));
        toast({ title: `Already posted on ${names(d)}, so it stays where it was.` });
      } else toast({ title: "Already posted", description: e.message });
      log(userId, d, `${noun(op.title)} was already going out`, op.op === "move" ? "It stays at its old time." : e.message);
      return "published";
    }
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * One pass over the open brand's outbox: every op under MAX_TRIES, a cancel once it is CANCEL_GRACE_MS old, in order.
 * One pass at a time; a change made while it runs gets another pass. Nothing is sent while the browser is offline.
 */
export async function sendOutbox(userId: string, now: () => number = Date.now): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  if (globalThis.navigator?.onLine === false) return; // the online event sends it
  running = true;
  try {
    do {
      again = false;
      const t = now();
      const box = loadOutbox(userId);
      for (const o of box.ops) if (o.op === "cancel" && !seen.has(o.id)) seen.set(o.id, t);
      const due = (o: OutboxOp) => o.op === "move" || seen.get(o.id)! + CANCEL_GRACE_MS <= t;
      const ops = box.ops.filter((o) => o.tries < MAX_TRIES && due(o));
      const waits = box.ops.filter((o) => o.tries < MAX_TRIES && !due(o)).map((o) => seen.get(o.id)! + CANCEL_GRACE_MS - t);
      if (waits.length) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          void sendOutbox(userId, now);
        }, Math.min(...waits));
      }
      if (!ops.length) continue;
      const gone: string[] = [];
      const left = await runOutbox(ops, (op) => sendOne(userId, activeProfileId(userId), op, gone));
      quiet = true;
      try {
        settleOutbox(userId, ops, left, gone);
      } finally {
        quiet = false;
      }
      for (const op of left) {
        if (op.tries >= MAX_TRIES) {
          const d = loadDrafts(userId).find((x) => x.zernio?.postId === op.postId);
          log(userId, d, `${noun(op.title)} could not be ${op.op === "move" ? "moved" : "cancelled"} on Zernio`, op.error);
        }
      }
      draftsChanged(); // open pages read the drafts again: new times, links gone, cards back where Zernio holds them
    } while (again);
  } finally {
    running = false;
  }
}

/** The runner, mounted once (StudioLayout): sends on load, on every outbox change here, and on coming back online. */
export function useZernioOutbox(userId: string | null | undefined): void {
  useEffect(() => {
    if (!userId) return;
    const go = () => void sendOutbox(userId);
    go();
    const off = onOutbox(() => !quiet && go());
    window.addEventListener("online", go);
    return () => {
      off();
      window.removeEventListener("online", go);
    };
  }, [userId]);
}

const EMPTY: Outbox = { ops: [], gone: [] };

/** The open brand's outbox, read again whenever it changes on this device. */
export function useOutbox(userId: string | null | undefined): Outbox {
  const [box, setBox] = useState<Outbox>(EMPTY);
  useEffect(() => {
    if (!userId) return;
    setBox(loadOutbox(userId));
    return onOutbox(() => setBox(loadOutbox(userId)));
  }, [userId]);
  return box;
}

/** True while an op for this draft's post waits to go (the card reads "Updating auto-post"); false once it stopped. */
export const updating = (box: Outbox, d: Pick<DraftEntry, "zernio">) =>
  !!d.zernio?.postId && box.ops.some((o) => o.postId === d.zernio!.postId && o.tries < MAX_TRIES);

export type NeedsRow =
  | { kind: "failed"; key: string; text: string; draft: DraftEntry }
  | { kind: "stuck"; key: string; text: string; op: OutboxOp; draft: DraftEntry | null }
  | { kind: "inbox"; key: string; text: string; draft: DraftEntry };

/**
 * Needs you's auto-post rows, under the existing ones: posts that didn't post (failed or partly) with Zernio's reason,
 * ops that stopped after MAX_TRIES, and TikTok inbox drafts not yet marked posted. Empty when nothing needs the person.
 */
export function outboxRows(drafts: DraftEntry[], box: Outbox, titleOf: (d: DraftEntry) => string): NeedsRow[] {
  const rows: NeedsRow[] = [];
  for (const d of drafts) {
    const z = d.zernio;
    if (!z?.postId) continue;
    if (z.status === "failed" || z.status === "partial") {
      const live = new Set((z.links ?? []).map((l) => l.platform));
      const failed = (z.platforms?.length ? z.platforms : [d.platform]).filter((p) => !live.has(p));
      const where = (failed.length ? failed : [d.platform]).map(platformName).join(" and ");
      rows.push({ kind: "failed", key: `f-${d.id}`, text: `Didn't post: "${titleOf(d)}" on ${where}.${z.error ? ` ${tiktokReason(z.error)}` : ""}`, draft: d });
    } else if (chipOf(z, draftStatus(d) === "posted")?.label === "In your TikTok inbox") {
      rows.push({ kind: "inbox", key: `i-${d.id}`, text: `Finish in TikTok: "${titleOf(d)}" is in your TikTok inbox`, draft: d });
    }
  }
  for (const op of box.ops) {
    if (op.tries < MAX_TRIES) continue;
    const d = drafts.find((x) => x.zernio?.postId === op.postId) ?? null;
    const at = d?.zernio?.at;
    rows.push({ kind: "stuck", key: `s-${op.id}`, text: `Still on the old time: "${d ? titleOf(d) : op.title}" ${at ? `goes out ${zoneLabel(at, d?.zernio?.tz)}` : "still goes out"}`, op, draft: d });
  }
  return rows;
}

/**
 * Undo: the draft as it was, with its Zernio link as it is now. After a move that already went, Zernio holds the new
 * time, so putting the old time back queues a move back; before it went, the waiting op is dropped.
 */
export function undoTo(userId: string, prev: DraftEntry): DraftEntry[] {
  const cur = loadDrafts(userId).find((d) => d.id === prev.id);
  return restoreDraft(userId, cur?.zernio ? { ...prev, zernio: cur.zernio } : prev);
}

/** Retry on a stopped op: back to no tries, so the runner sends it again at once. */
export const retryOp = (userId: string, op: OutboxOp) => settleOutbox(userId, [op], [{ ...op, tries: 0, error: undefined }]);

/** What Zernio said about the post, onto the draft; a live post marks the draft posted (a TikTok inbox draft is not live). */
export function applyView(userId: string, d: DraftEntry, view: PostView): DraftEntry[] {
  // real numbers pulled on Analytics stay until the next pull
  const numbers = d.zernio?.numbers;
  let next = setDraftZernio(userId, d.id, { ...linkFromView(d.zernio!.key, view), ...(numbers ? { numbers } : {}) });
  if (postedNow(view) && draftStatus(d) !== "posted") next = setDraftStatus(userId, d.id, "posted");
  return next;
}

/** Retry on a post that didn't post, as the chip's Retry does; returns the post as Zernio now has it. */
export async function retryFailed(userId: string, d: DraftEntry): Promise<PostView> {
  const { post } = await retryPost(activeProfileId(userId), d.zernio!.postId!);
  const numbers = d.zernio!.numbers;
  setDraftZernio(userId, d.id, { ...linkFromView(d.zernio!.key, post), ...(numbers ? { numbers } : {}) });
  if (postedNow(post) && draftStatus(d) !== "posted") setDraftStatus(userId, d.id, "posted");
  log(userId, d, `Tried posting ${noun(d.hook.replace(/\s+/g, " ").trim() || "Untitled")} again`, post.status === "published" ? "Posted." : "Zernio is posting it again.");
  return post;
}
