// The outbox runner (publish-calendar) with the social function stubbed. The post views copy the shape postView makes
// of Zernio's update-post answer (docs.zernio.com/posts/update-post.mdx: the post with its scheduledFor in UTC and one
// entry per platform) and the 17 Oct live post; the refusals are social/posts.ts's own (409 published, 409 cancelled).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ fn: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ SUPABASE_URL: "https://abc.supabase.co", supabase: {} }));
vi.mock("@/lib/edgeFn", async (actual) => ({ ...(await actual<typeof import("@/lib/edgeFn")>()), callFn: calls.fn }));
vi.mock("@/hooks/use-toast", () => ({ toast: calls.toast }));

import { EdgeError } from "@/lib/edgeFn";
import { loadDrafts, saveDrafts, setDraftStatus, deleteDraft, type DraftEntry } from "@/lib/draftHistory";
import { MAX_TRIES, loadOutbox, saveOutbox, type OutboxOp } from "@/lib/zernioOutbox";
import { CANCEL_GRACE_MS, applyView, outboxRows, retryFailed, retryOp, sendOutbox, undoTo, updating } from "./useZernioOutbox";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
let n = 0;
const ids = () => `67000000000000000000${String(++n).padStart(4, "0")}`;

class MemStorage {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
}

let clock = Date.parse("2026-10-14T02:00:00.000Z");
const now = () => clock;
beforeEach(() => {
  const target = new EventTarget();
  vi.stubGlobal("window", { localStorage: new MemStorage(), addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target) });
  vi.stubGlobal("dispatchEvent", target.dispatchEvent.bind(target));
  calls.fn.mockReset();
  calls.toast.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

// on Zernio for Thu 15 Oct, 9:00 am Singapore
const held = (postId: string, extra: Partial<DraftEntry> = {}): DraftEntry => ({
  id: `d-${postId}`, createdAt: "2026-10-01T00:00:00.000Z", hook: "Budget 2027", draft: "Body", pillar: "", pillarDetail: "", audience: "", format: "", platform: "tiktok", ctaType: "",
  status: "scheduled", scheduledFor: "2026-10-15T09:00", zernio: { key: "k", postId, status: "scheduled", at: "2026-10-15T01:00:00.000Z" },
  ...extra,
});
const view = (postId: string, scheduledFor: string, status = "scheduled") => ({
  post: { id: postId, status, scheduledFor, platforms: [{ platform: "tiktok", accountId: "68000000000000000000a001", status: "pending", url: null, error: "", draft: false }] },
});
const sent = () => calls.fn.mock.calls.map(([name, body]) => ({ name, ...(body as object) }));
const draftOf = (postId: string) => loadDrafts(UID).find((d) => d.id === `d-${postId}`);
const op = (postId: string, o: Partial<OutboxOp> = {}): OutboxOp => ({ id: `o-${postId}`, postId, op: "move", at: "2026-10-16T09:00:00+08:00", title: "Budget 2027", tries: 0, ...o });

describe("sendOutbox", () => {
  it("sends nothing at all with nothing queued", async () => {
    saveDrafts(UID, [held(ids())]);
    await sendOutbox(UID, now);
    expect(calls.fn).not.toHaveBeenCalled();
  });

  it("sends a drag of an auto-post as one move at its new time, takes the op off and keeps the link on the new time", async () => {
    const id = ids();
    saveDrafts(UID, [held(id)]);
    setDraftStatus(UID, `d-${id}`, "scheduled", "2026-10-16T19:30");
    expect(updating(loadOutbox(UID), draftOf(id)!)).toBe(true);
    calls.fn.mockResolvedValueOnce(view(id, "2026-10-16T11:30:00.000Z"));
    await sendOutbox(UID, now);
    expect(sent()).toEqual([{ name: "social", action: "move", profileId: "me", postId: id, scheduledFor: "2026-10-16T19:30:00+08:00" }]);
    expect(loadOutbox(UID).ops).toEqual([]);
    expect(draftOf(id)!.zernio).toMatchObject({ postId: id, status: "scheduled", at: "2026-10-16T11:30:00.000Z" });
    expect(updating(loadOutbox(UID), draftOf(id)!)).toBe(false);
  });

  it("Undo after the move went sends the post back to its first time", async () => {
    const id = ids();
    saveDrafts(UID, [held(id)]);
    const prev = draftOf(id)!;
    setDraftStatus(UID, `d-${id}`, "scheduled", "2026-10-16T19:30");
    calls.fn.mockResolvedValueOnce(view(id, "2026-10-16T11:30:00.000Z"));
    await sendOutbox(UID, now);
    undoTo(UID, prev);
    expect(loadOutbox(UID).ops).toMatchObject([{ postId: id, op: "move", at: "2026-10-15T09:00:00+08:00" }]);
    calls.fn.mockResolvedValueOnce(view(id, "2026-10-15T01:00:00.000Z"));
    await sendOutbox(UID, now);
    expect(sent().map((c) => (c as { scheduledFor?: string }).scheduledFor)).toEqual(["2026-10-16T19:30:00+08:00", "2026-10-15T09:00:00+08:00"]);
    expect(draftOf(id)).toMatchObject({ scheduledFor: "2026-10-15T09:00", zernio: { at: "2026-10-15T01:00:00.000Z" } });
    expect(loadOutbox(UID).ops).toEqual([]);
  });

  it("an Undo made while the move is out queues the move back once Zernio answers", async () => {
    const id = ids();
    saveDrafts(UID, [held(id)]);
    const prev = draftOf(id)!;
    setDraftStatus(UID, `d-${id}`, "scheduled", "2026-10-16T19:30");
    calls.fn.mockImplementationOnce(async () => {
      undoTo(UID, prev); // Zernio still holds the old time here, so this Undo drops the op
      return view(id, "2026-10-16T11:30:00.000Z");
    });
    await sendOutbox(UID, now);
    expect(loadOutbox(UID).ops).toMatchObject([{ postId: id, op: "move", at: "2026-10-15T09:00:00+08:00" }]);
  });

  it("Undo before the move went drops the op and sends nothing", async () => {
    const id = ids();
    saveDrafts(UID, [held(id)]);
    const prev = draftOf(id)!;
    setDraftStatus(UID, `d-${id}`, "scheduled", "2026-10-16T19:30");
    undoTo(UID, prev);
    await sendOutbox(UID, now);
    expect(calls.fn).not.toHaveBeenCalled();
  });

  it("holds a cancel for the Undo's grace, then cancels on Zernio, drops the link and remembers the id", async () => {
    const id = ids();
    saveDrafts(UID, [held(id)]);
    setDraftStatus(UID, `d-${id}`, "draft"); // Back in drafts
    await sendOutbox(UID, now);
    expect(calls.fn).not.toHaveBeenCalled();
    clock += CANCEL_GRACE_MS;
    calls.fn.mockResolvedValueOnce({ cancelled: true });
    await sendOutbox(UID, now);
    expect(sent()).toEqual([{ name: "social", action: "cancel", profileId: "me", postId: id }]);
    expect(draftOf(id)!.zernio).toBeUndefined();
    expect(loadOutbox(UID)).toEqual({ ops: [], gone: [id] });
  });

  it("an Undo of Back in drafts inside the grace keeps the auto-post and sends nothing", async () => {
    const id = ids();
    saveDrafts(UID, [held(id)]);
    const prev = draftOf(id)!;
    setDraftStatus(UID, `d-${id}`, "draft");
    await sendOutbox(UID, now);
    undoTo(UID, prev);
    clock += CANCEL_GRACE_MS;
    await sendOutbox(UID, now);
    expect(calls.fn).not.toHaveBeenCalled();
    expect(draftOf(id)!.zernio?.postId).toBe(id);
  });

  it("cancels a deleted post's Zernio post though its draft is gone, and a 404 counts as done", async () => {
    const id = ids();
    saveDrafts(UID, [held(id)]);
    deleteDraft(UID, `d-${id}`);
    await sendOutbox(UID, now);
    clock += CANCEL_GRACE_MS;
    calls.fn.mockRejectedValueOnce(new EdgeError("That post isn't here.", 404, "not_found"));
    await sendOutbox(UID, now);
    expect(sent()).toEqual([{ name: "social", action: "cancel", profileId: "me", postId: id }]);
    expect(loadOutbox(UID)).toEqual({ ops: [], gone: [id] });
  });

  it("a move refused as already going out puts the card back on Zernio's time, reading Posting, with the toast", async () => {
    const id = ids();
    saveDrafts(UID, [held(id)]);
    setDraftStatus(UID, `d-${id}`, "scheduled", "2026-10-16T19:30");
    calls.fn.mockRejectedValueOnce(new EdgeError("It's already going out, so it can't move.", 409, "published"));
    await sendOutbox(UID, now);
    expect(loadOutbox(UID).ops).toEqual([]);
    expect(draftOf(id)).toMatchObject({ scheduledFor: "2026-10-15T09:00", zernio: { status: "publishing" } });
    expect(calls.toast).toHaveBeenCalledWith({ title: "Already posted on TikTok, so it stays where it was." });
  });

  it("keeps a failed op with its reason, stops after 3 tries, and Retry sends it again", async () => {
    const id = ids();
    saveDrafts(UID, [held(id)]);
    setDraftStatus(UID, `d-${id}`, "scheduled", "2026-10-16T19:30");
    calls.fn.mockRejectedValue(new EdgeError("Couldn't move it on Zernio. Try again in a minute.", 500));
    for (let i = 0; i < 5; i++) await sendOutbox(UID, now);
    expect(calls.fn).toHaveBeenCalledTimes(MAX_TRIES);
    const [stopped] = loadOutbox(UID).ops;
    expect(stopped).toMatchObject({ tries: MAX_TRIES, error: "Couldn't move it on Zernio. Try again in a minute." });
    expect(updating(loadOutbox(UID), draftOf(id)!)).toBe(false);
    calls.fn.mockReset().mockResolvedValueOnce(view(id, "2026-10-16T11:30:00.000Z"));
    retryOp(UID, stopped);
    await sendOutbox(UID, now);
    expect(calls.fn).toHaveBeenCalledTimes(1);
    expect(loadOutbox(UID).ops).toEqual([]);
  });

  it("never sends a move for a post that is not on this brand's drafts, and sends nothing while offline", async () => {
    saveOutbox(UID, { ops: [op(ids())], gone: [] });
    await sendOutbox(UID, now);
    expect(calls.fn).not.toHaveBeenCalled();
    expect(loadOutbox(UID).ops).toEqual([]);
    const id = ids();
    saveDrafts(UID, [held(id)]);
    setDraftStatus(UID, `d-${id}`, "scheduled", "2026-10-16T19:30");
    vi.stubGlobal("navigator", { onLine: false });
    await sendOutbox(UID, now);
    expect(calls.fn).not.toHaveBeenCalled();
    expect(loadOutbox(UID).ops).toHaveLength(1);
  });

  it("sends a cancel on its own once the Undo's grace is over, with nothing else changing on the page", async () => {
    vi.useFakeTimers();
    try {
      const id = ids();
      saveDrafts(UID, [held(id)]);
      setDraftStatus(UID, `d-${id}`, "draft"); // Back in drafts, then the person just waits
      calls.fn.mockResolvedValueOnce({ cancelled: true });
      await sendOutbox(UID, now);
      expect(calls.fn).not.toHaveBeenCalled();
      clock += CANCEL_GRACE_MS;
      await vi.advanceTimersByTimeAsync(CANCEL_GRACE_MS);
      expect(sent()).toEqual([{ name: "social", action: "cancel", profileId: "me", postId: id }]);
      expect(loadOutbox(UID)).toEqual({ ops: [], gone: [id] });
      expect(draftOf(id)!.zernio).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a second post moved while the first move is out goes in the same run", async () => {
    const a = ids();
    const b = ids();
    saveDrafts(UID, [held(a), held(b)]);
    setDraftStatus(UID, `d-${a}`, "scheduled", "2026-10-16T19:30");
    calls.fn
      .mockImplementationOnce(async () => {
        setDraftStatus(UID, `d-${b}`, "scheduled", "2026-10-17T08:00");
        void sendOutbox(UID, now); // the outbox event the runner hears while it is busy
        return view(a, "2026-10-16T11:30:00.000Z");
      })
      .mockResolvedValueOnce(view(b, "2026-10-17T00:00:00.000Z"));
    await sendOutbox(UID, now);
    expect(sent().map((c) => [(c as { postId?: string }).postId, (c as { scheduledFor?: string }).scheduledFor])).toEqual([
      [a, "2026-10-16T19:30:00+08:00"],
      [b, "2026-10-17T08:00:00+08:00"],
    ]);
    expect(loadOutbox(UID).ops).toEqual([]);
    expect(draftOf(b)!.zernio).toMatchObject({ at: "2026-10-17T00:00:00.000Z" });
  });

  it("a cancel refused because the post is already going out says so, stops trying and keeps the card's link to it", async () => {
    const id = ids();
    saveDrafts(UID, [held(id)]);
    setDraftStatus(UID, `d-${id}`, "draft"); // Back in drafts as it starts going out
    await sendOutbox(UID, now);
    clock += CANCEL_GRACE_MS;
    const refusal = "It's already posted on TikTok, so it can't be cancelled. Delete it there.";
    calls.fn.mockRejectedValueOnce(new EdgeError(refusal, 409, "published"));
    await sendOutbox(UID, now);
    await sendOutbox(UID, now);
    expect(calls.fn).toHaveBeenCalledTimes(1);
    expect(loadOutbox(UID)).toEqual({ ops: [], gone: [] });
    expect(calls.toast).toHaveBeenCalledWith({ title: "Already posted", description: refusal });
    expect(draftOf(id)!.zernio?.postId).toBe(id);
  });

  it("a 404 because Post it for me is off for the sign-in keeps the cancel waiting and the card's link, so Zernio's post is never forgotten", async () => {
    const id = ids();
    saveDrafts(UID, [held(id)]);
    setDraftStatus(UID, `d-${id}`, "draft");
    await sendOutbox(UID, now);
    clock += CANCEL_GRACE_MS;
    calls.fn.mockRejectedValueOnce(new EdgeError("Not enabled.", 404));
    await sendOutbox(UID, now);
    expect(loadOutbox(UID)).toEqual({ ops: [expect.objectContaining({ postId: id, op: "cancel", tries: 1, error: "Not enabled." })], gone: [] });
    expect(draftOf(id)!.zernio?.postId).toBe(id);
  });

  it("a move refused because Zernio already cancelled the post takes the op and the auto-post off the card, at its new time", async () => {
    const id = ids();
    saveDrafts(UID, [held(id)]);
    setDraftStatus(UID, `d-${id}`, "scheduled", "2026-10-16T19:30");
    calls.fn.mockRejectedValueOnce(new EdgeError("It was cancelled on Zernio, so it can't move.", 409, "cancelled"));
    await sendOutbox(UID, now);
    await sendOutbox(UID, now);
    expect(calls.fn).toHaveBeenCalledTimes(1);
    expect(loadOutbox(UID)).toEqual({ ops: [], gone: [id] });
    expect(draftOf(id)).toMatchObject({ status: "scheduled", scheduledFor: "2026-10-16T19:30" });
    expect(draftOf(id)!.zernio).toBeUndefined();
  });
});

describe("outboxRows", () => {
  const titleOf = (d: DraftEntry) => d.hook;
  it("gives nothing when nothing needs the person", () => {
    const id = ids();
    expect(outboxRows([held(id)], { ops: [op(id)], gone: [] }, titleOf)).toEqual([]);
  });

  it("lists a failed or partly posted post with the networks that failed and Zernio's reason", () => {
    const a = held(ids(), { hook: "3 CPF myths", platform: "instagram", zernio: { key: "k", postId: "x1", status: "failed", error: "Media URL expired." } });
    const b = held(ids(), { hook: "5 signs", zernio: { key: "k", postId: "x2", status: "partial", platforms: ["tiktok", "instagram"], links: [{ platform: "tiktok", url: "https://www.tiktok.com/@a/1" }] } });
    expect(outboxRows([a, b], { ops: [], gone: [] }, titleOf).map((r) => [r.kind, r.text])).toEqual([
      ["failed", 'Didn\'t post: "3 CPF myths" on Instagram. Media URL expired.'],
      ["failed", 'Didn\'t post: "5 signs" on Instagram.'],
    ]);
  });

  it("puts TikTok's refusal in plain words, with no request id (live-p7a-post D3)", () => {
    const error = "TikTok Business API /business/photo/publish/ failed (code 40002): Please notice the user to update their TikTok to the latest version to enable this functionality. (request_id 202610260941444230F7F99CAAE0447502)";
    const d = held(ids(), { hook: "Inbox draft test", platform: "tiktok", zernio: { key: "k", postId: "x4", status: "failed", error } });
    expect(outboxRows([d], { ops: [], gone: [] }, titleOf).map((r) => r.text)).toEqual([
      'Didn\'t post: "Inbox draft test" on TikTok. Update the TikTok app on the phone signed in to this account, then try again.',
    ]);
  });

  it("lists an op that stopped after 3 tries with the time it still goes out, and a TikTok inbox draft until it is marked posted", () => {
    const id = ids();
    const inbox = held(ids(), { hook: "5 signs", zernio: { key: "k", postId: "x3", status: "published", drafts: ["tiktok"] } });
    const rows = outboxRows([held(id), inbox], { ops: [op(id, { tries: MAX_TRIES }), op("gone-post", { id: "o-2", op: "cancel", title: "Old one", tries: MAX_TRIES })], gone: [] }, titleOf);
    expect(rows.map((r) => [r.kind, r.text])).toEqual([
      ["inbox", 'Finish in TikTok: "5 signs" is in your TikTok inbox'],
      ["stuck", expect.stringMatching(/^Still on the old time: "Budget 2027" goes out Thu,? 15 Oct,? 9:00\s?am$/i)],
      ["stuck", 'Still on the old time: "Old one" still goes out'],
    ]);
    expect(outboxRows([{ ...inbox, status: "posted" }], { ops: [], gone: [] }, titleOf)).toEqual([]);
  });
});

describe("what a read or a Retry finds on Zernio, onto the post", () => {
  const numbers = { impressions: 3000, reach: 2100, views: 1200, likes: 40, comments: 3, shares: 2, saves: 5, at: "2026-10-14T00:00:00.000Z" };
  const live = (postId: string, platform = { url: "https://www.tiktok.com/@a/1", draft: false }) => ({
    id: postId, status: "published" as const, scheduledFor: "2026-10-15T01:00:00.000Z",
    platforms: [{ platform: "tiktok", accountId: "68000000000000000000a001", status: "published", error: "", ...platform }],
  });

  it("a read that finds it live marks the post posted and keeps the numbers Analytics pulled", () => {
    const id = ids();
    saveDrafts(UID, [held(id, { zernio: { key: "k", postId: id, status: "scheduled", at: "2026-10-15T01:00:00.000Z", numbers } })]);
    applyView(UID, draftOf(id)!, live(id));
    expect(draftOf(id)).toMatchObject({ status: "posted", zernio: { status: "published", links: [{ platform: "tiktok", url: "https://www.tiktok.com/@a/1" }], numbers } });
  });

  it("a read of a post that went to the TikTok inbox keeps it scheduled, and a second read of a live post keeps when it was marked posted", () => {
    const a = ids();
    saveDrafts(UID, [held(a)]);
    applyView(UID, draftOf(a)!, live(a, { url: null as unknown as string, draft: true }));
    expect(draftOf(a)).toMatchObject({ status: "scheduled", zernio: { status: "published", drafts: ["tiktok"] } });

    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(clock);
      const b = ids();
      saveDrafts(UID, [held(b)]);
      applyView(UID, draftOf(b)!, live(b));
      expect(draftOf(b)).toMatchObject({ status: "posted", postedAt: new Date(clock).toISOString() });
      vi.setSystemTime(clock + 3_600_000); // the chip reads it again an hour on
      applyView(UID, draftOf(b)!, live(b));
      expect(draftOf(b)!.postedAt).toBe(new Date(clock).toISOString());
    } finally {
      vi.useRealTimers();
    }
  });

  it("Retry on a post that didn't post keeps its numbers, and marks it posted only once Zernio has it live", async () => {
    const id = ids();
    saveDrafts(UID, [held(id, { zernio: { key: "k", postId: id, status: "failed", error: "Media URL expired.", numbers } })]);
    calls.fn.mockResolvedValueOnce({ post: { ...live(id), status: "publishing", platforms: [{ ...live(id).platforms[0], status: "pending", url: null }] } });
    await retryFailed(UID, draftOf(id)!);
    expect(sent()).toEqual([{ name: "social", action: "retry", profileId: "me", postId: id }]);
    expect(draftOf(id)).toMatchObject({ status: "scheduled", zernio: { status: "publishing", numbers } });
    expect(draftOf(id)!.zernio).not.toHaveProperty("error");
    calls.fn.mockResolvedValueOnce({ post: live(id) });
    await retryFailed(UID, draftOf(id)!);
    expect(draftOf(id)).toMatchObject({ status: "posted", zernio: { status: "published", numbers } });
  });
});
