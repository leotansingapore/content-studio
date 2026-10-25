import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_TRIES, loadOutbox, onOutbox, queueCancel, runOutbox, saveOutbox, settleOutbox, zernioHolds, zernioOps, type Outbox, type OutboxOp } from "./zernioOutbox";
import type { DraftEntry } from "./draftHistory";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const POST_ID = "67000000000000000000d001";

const post = (extra: Partial<DraftEntry> = {}): DraftEntry => ({
  id: "s", createdAt: "2026-10-01T00:00:00.000Z", hook: "Budget 2027", draft: "Body", pillar: "", pillarDetail: "", audience: "", format: "", platform: "tiktok", ctaType: "",
  ...extra,
});
// on Zernio for Thu 15 Oct, 9:00 am Singapore (Zernio answers in UTC)
const held = (extra: Partial<DraftEntry> = {}) =>
  post({ status: "scheduled", scheduledFor: "2026-10-15T09:00", zernio: { key: "k", postId: POST_ID, status: "scheduled", at: "2026-10-15T01:00:00.000Z" }, ...extra });
const EMPTY: Outbox = { ops: [], gone: [] };
const op = (o: Partial<OutboxOp> = {}): OutboxOp => ({ id: "o-1", postId: POST_ID, op: "move", at: "2026-10-16T09:00:00+08:00", title: "Budget 2027", tries: 0, ...o });

let events = 0;
const onEvent = () => void events++;
beforeEach(() => {
  const m = new Map<string, string>();
  const target = new EventTarget();
  events = 0;
  vi.stubGlobal("window", {
    localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  });
  vi.stubGlobal("dispatchEvent", target.dispatchEvent.bind(target));
});
afterEach(() => vi.unstubAllGlobals());

describe("zernioOps", () => {
  it("moving a held post adds one move op at its new moment in Singapore time", () => {
    const box = zernioOps([held()], [held({ scheduledFor: "2026-10-16T19:30" })], EMPTY);
    expect(box.ops).toEqual([{ id: expect.stringMatching(/^o-[0-9a-z]+$/), postId: POST_ID, op: "move", at: "2026-10-16T19:30:00+08:00", title: "Budget 2027", tries: 0 }]);
  });

  it("moving it twice leaves one op with the last time, and a day with no time goes out at 9:00", () => {
    const once = zernioOps([held()], [held({ scheduledFor: "2026-10-16T19:30" })], EMPTY);
    const twice = zernioOps([held({ scheduledFor: "2026-10-16T19:30" })], [held({ scheduledFor: "2026-10-17" })], once);
    expect(twice.ops).toHaveLength(1);
    expect(twice.ops[0].at).toBe("2026-10-17T09:00:00+08:00");
  });

  it("an Undo back to the moment Zernio holds removes the op, a move or a cancel", () => {
    const moved = zernioOps([held()], [held({ scheduledFor: "2026-10-16T19:30" })], EMPTY);
    expect(zernioOps([held({ scheduledFor: "2026-10-16T19:30" })], [held()], moved)).toEqual({ ...moved, ops: [] });
    const cancelling = { ops: [op({ op: "cancel", at: undefined })], gone: [] };
    expect(zernioOps([held({ status: "draft", scheduledFor: undefined })], [held()], cancelling).ops).toEqual([]);
    expect(zernioOps([], [held()], cancelling).ops).toEqual([]); // a deleted post put back
  });

  it("adds nothing for a post Zernio has sent, failed, cancelled or is sending, a cancelled id, or no link", () => {
    for (const status of ["published", "partial", "failed", "cancelled", "publishing"]) {
      const z = { key: "k", postId: POST_ID, status, at: "2026-10-15T01:00:00.000Z" };
      expect(zernioOps([held({ zernio: z })], [held({ zernio: z, scheduledFor: "2026-10-16T09:00" })], EMPTY), status).toBe(EMPTY);
    }
    const gone = { ops: [], gone: [POST_ID] };
    expect(zernioOps([held()], [held({ scheduledFor: "2026-10-16T09:00" })], gone)).toBe(gone);
    expect(zernioOps([post({ status: "scheduled", scheduledFor: "2026-10-15" })], [post({ status: "scheduled", scheduledFor: "2026-10-16" })], EMPTY)).toBe(EMPTY);
  });

  it("an edit that keeps the time, Back in drafts and a delete add nothing and keep the waiting op", () => {
    const box = { ops: [op()], gone: [] };
    const moved = held({ scheduledFor: "2026-10-16T09:00" });
    expect(zernioOps([moved], [{ ...moved, draft: "Edited" }], box)).toBe(box);
    expect(zernioOps([moved], [{ ...moved, status: "draft", scheduledFor: undefined }], box)).toBe(box);
    expect(zernioOps([moved], [], box)).toBe(box);
  });

  it("a held post whose time was already off Zernio's (another device moved it) is left alone until this device moves it", () => {
    const box = { ops: [op()], gone: [] };
    const elsewhere = held({ scheduledFor: "2026-10-16T09:00" });
    expect(zernioOps([elsewhere, post({ id: "b" })], [elsewhere, post({ id: "b", draft: "Edited" })], box)).toBe(box);
    // the phone's move arrived before its drafts did: this device's post still reads Zernio's time, and keeps the op
    expect(zernioOps([held(), post({ id: "b" })], [held(), post({ id: "b", draft: "Edited" })], box)).toBe(box);
  });
});

describe("zernioHolds", () => {
  it("is true while Zernio still has the post to send", () => {
    expect(zernioHolds(held())).toBe(true);
    expect(zernioHolds(held({ zernio: { key: "k", postId: POST_ID, status: "publishing" } }))).toBe(true);
    expect(zernioHolds(held({ zernio: { key: "k" } }))).toBe(false);
    for (const status of ["published", "partial", "failed", "cancelled"]) expect(zernioHolds(held({ zernio: { key: "k", postId: POST_ID, status } }))).toBe(false);
    expect(zernioHolds(post())).toBe(false);
  });
});

describe("queueCancel", () => {
  it("queues one cancel for a held post, in place of its waiting move, and tells the runner", () => {
    const off = onOutbox(onEvent);
    saveOutbox(UID, { ops: [op({ id: "o-move" }), op({ id: "o-other", postId: "67000000000000000000d002" })], gone: [] });
    queueCancel(UID, held());
    expect(loadOutbox(UID).ops).toEqual([op({ id: "o-other", postId: "67000000000000000000d002" }), { id: expect.stringMatching(/^o-/), postId: POST_ID, op: "cancel", title: "Budget 2027", tries: 0 }]);
    expect(events).toBe(2);
    off();
    queueCancel(UID, held());
    expect(events).toBe(2);
  });

  it("queues nothing for a post Zernio has sent or is sending, a cancelled id, or a draft with no link", () => {
    queueCancel(UID, held({ zernio: { key: "k", postId: POST_ID, status: "published" } }));
    queueCancel(UID, held({ zernio: { key: "k", postId: POST_ID, status: "publishing" } }));
    queueCancel(UID, post());
    expect(loadOutbox(UID)).toEqual(EMPTY);
    saveOutbox(UID, { ops: [], gone: [POST_ID] });
    queueCancel(UID, held());
    expect(loadOutbox(UID).ops).toEqual([]);
  });
});

describe("runOutbox", () => {
  it("sends ops in order and keeps only the ones that failed, with one more try and the reason", async () => {
    const ops = [op({ id: "o-a" }), op({ id: "o-b", op: "cancel" }), op({ id: "o-c" }), op({ id: "o-d", op: "cancel" }), op({ id: "o-e" }), op({ id: "o-f" })];
    const answers: Record<string, () => Promise<"done" | "published" | "gone" | { error: string }>> = {
      "o-a": async () => "done",
      "o-b": async () => "gone", // a 404 on cancel: already gone
      "o-c": async () => "published", // a 409: it's going out
      "o-d": async () => ({ error: "Couldn't cancel it. Try again in a minute." }), // a 500
      "o-e": async () => {
        throw new Error("Failed to fetch");
      },
      "o-f": async () => "done",
    };
    const sent: string[] = [];
    const left = await runOutbox(ops, (o) => (sent.push(o.id), answers[o.id]()));
    expect(sent).toEqual(["o-a", "o-b", "o-c", "o-d", "o-e", "o-f"]);
    expect(left).toEqual([
      op({ id: "o-d", op: "cancel", tries: 1, error: "Couldn't cancel it. Try again in a minute." }),
      op({ id: "o-e", tries: 1, error: "Failed to fetch" }),
    ]);
  });

  it("tries an op at most 3 times on its own, then waits for Retry", async () => {
    let calls = 0;
    const fail = async () => (calls++, { error: "Zernio is down" });
    let ops = [op()];
    for (let i = 0; i < 5; i++) ops = await runOutbox(ops, fail);
    expect(calls).toBe(MAX_TRIES);
    expect(ops).toEqual([op({ tries: 3, error: "Zernio is down" })]);
  });
});

describe("settleOutbox", () => {
  it("takes the sent ops off or puts their new tries in, keeps ops queued meanwhile and adds the cancelled ids to gone", () => {
    const a = op({ id: "o-a" });
    const b = op({ id: "o-b", postId: "67000000000000000000d002", op: "cancel" });
    const c = op({ id: "o-c", postId: "67000000000000000000d003" });
    saveOutbox(UID, { ops: [a, b, c], gone: ["67000000000000000000d009"] });
    const sent = [a, b, c];
    // while the run was out: a moved again (a new op for its post) and another post was deleted
    const again = op({ id: "o-again", at: "2026-10-18T09:00:00+08:00" });
    const later = op({ id: "o-later", postId: "67000000000000000000d004", op: "cancel" });
    saveOutbox(UID, { ops: [b, c, again, later], gone: ["67000000000000000000d009"] });
    settleOutbox(UID, sent, [{ ...c, tries: 1, error: "Down" }], [b.postId]);
    expect(loadOutbox(UID)).toEqual({ ops: [{ ...c, tries: 1, error: "Down" }, again, later], gone: ["67000000000000000000d009", b.postId] });
  });

  it("Retry puts a stopped op back to no tries", () => {
    const stopped = op({ tries: 3, error: "Down" });
    saveOutbox(UID, { ops: [stopped], gone: [] });
    settleOutbox(UID, [stopped], [{ ...stopped, tries: 0, error: undefined }]);
    expect(loadOutbox(UID).ops[0].tries).toBe(0);
  });
});

describe("the outbox store", () => {
  it("keeps the newest 50 ops and 50 cancelled ids, and reads damaged JSON or junk ops as empty", () => {
    const ops = Array.from({ length: 55 }, (_, i) => op({ id: `o-${i}`, postId: `67000000000000000000e${String(i).padStart(3, "0")}` }));
    const gone = Array.from({ length: 55 }, (_, i) => `67000000000000000000f${String(i).padStart(3, "0")}`);
    saveOutbox(UID, { ops, gone });
    expect(loadOutbox(UID)).toEqual({ ops: ops.slice(5), gone: gone.slice(5) });
    window.localStorage.setItem(`content-studio-zernio-outbox-${UID}`, "{oops");
    expect(loadOutbox(UID)).toEqual(EMPTY);
    window.localStorage.setItem(`content-studio-zernio-outbox-${UID}`, JSON.stringify({ ops: [op(), { id: 1 }, null, { ...op(), op: "delete" }], gone: [POST_ID, 4] }));
    expect(loadOutbox(UID)).toEqual({ ops: [op()], gone: [POST_ID] });
  });

  it("a full storage refuses the save without throwing", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } } });
    expect(saveOutbox(UID, { ops: [op()], gone: [] })).toBe(false);
  });
});
