import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// writing-judge through the real callFn: an answer is { data }, a refusal carries its status and body like supabase-js
const fn = vi.hoisted(() => ({ judge: vi.fn(), invoke: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: fn.invoke } }, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));
const make = vi.hoisted(() => vi.fn());
vi.mock("@/lib/remix", async (orig) => ({ ...(await orig<typeof import("./remix")>()), requestMake: make }));
vi.mock("@/lib/remixTeardown", () => ({ localTeardown: () => null, ensureTeardown: () => Promise.resolve(null) }));

import { loadDrafts, saveDrafts, upsertDraft, type DraftEntry } from "./draftHistory";
import type { MakeResponse } from "./remix";
import { clearRemixJob, onRemixJob, type RemixJobState } from "./remixJob";
import { draftsInSet } from "./variants";
import { checkWinners, findWinners, loadWinners, makeWinnerVersions, markHandled, onWinners, undoWinner, winnerCards } from "./winners";

// a new sign-in per test: the day's 429 and the made sets are held per brand for the session
let UID = "";
let u = 0;
const NOW = Date.parse("2026-10-25T04:00:00.000Z");
const DAY = 86_400_000;

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const refuse = (status: number, code: string, error: string) => ({ error: { context: { status, json: async () => ({ code, error }) } } });
beforeEach(() => {
  UID = `6d80f027-3395-480c-86a1-${String(++u).padStart(12, "0")}`;
  const local = new MemStorage();
  vi.stubGlobal("window", { localStorage: local, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("localStorage", local);
  fn.judge.mockReset();
  fn.invoke.mockReset().mockImplementation(async (name: string, { body }: { body: unknown }) => {
    if (name !== "writing-judge") throw new Error(`unexpected ${name}`);
    return fn.judge(body);
  });
  make.mockReset();
  clearRemixJob();
});
afterEach(() => vi.unstubAllGlobals());

let n = 0;
/** A posted draft `days` ago with `eng` engagements. */
const post = (platform: string, eng: number, days: number, extra: Partial<DraftEntry> = {}): DraftEntry => ({
  id: `p${++n}`,
  createdAt: new Date(NOW - days * DAY - 3_600_000).toISOString(),
  pillar: "topic",
  pillarDetail: "",
  audience: "general",
  ctaType: "none",
  platform,
  format: "text-post",
  hook: `Post ${n}`,
  draft: `Post ${n}\n\nHow I review a CPF top-up with a client, step by step.`,
  status: "posted",
  postedAt: new Date(NOW - days * DAY).toISOString(),
  metrics: { reactions: eng },
  ...extra,
});
const ids = (ws: { draft: DraftEntry }[]) => ws.map((w) => w.draft.id);
const answer = (hook: string): MakeResponse => ({ as: "post", result: { as: "post", hook, body: "A new example.", cta: "", hashtags: [] }, flags: { copied: [], claim: false, invented: false }, usage: { used: 1, limit: 30 } });
const finished = () =>
  new Promise<RemixJobState>((resolve) => {
    const off = onRemixJob((j) => {
      if (j && j.state !== "working") {
        off();
        resolve(j);
      }
    });
  });

describe("findWinners", () => {
  it("needs 5 posts with numbers on a network, then takes 2x the median of the others", () => {
    const li = [post("linkedin", 24, 1), post("linkedin", 10, 2), post("linkedin", 10, 3), post("linkedin", 9, 4), post("linkedin", 11, 5)];
    const ws = findWinners(li, NOW);
    expect(ids(ws)).toEqual([li[0].id]);
    expect(ws[0]).toMatchObject({ network: "linkedin", engagements: 24, usual: 10, ratio: 2.4 });
    // 4 posts are too few to know your usual
    expect(findWinners(li.slice(0, 4), NOW)).toEqual([]);
    // 19 is under 2x
    expect(findWinners([post("linkedin", 19, 1), ...li.slice(1)], NOW)).toEqual([]);
  });

  it("holds the 10-engagement floor", () => {
    const low = (top: number) => [post("linkedin", top, 1), ...[2, 2, 2, 2].map((e, i) => post("linkedin", e, i + 2))];
    expect(findWinners(low(9), NOW)).toEqual([]);
    expect(findWinners(low(10), NOW)).toHaveLength(1);
  });

  it("leaves out posts over 30 days old, posts with no postedAt, handled ones and posts past the last 20", () => {
    const base = [10, 10, 9, 11].map((e, i) => post("linkedin", e, i + 2));
    expect(findWinners([post("linkedin", 40, 31), ...base], NOW)).toEqual([]);
    expect(findWinners([post("linkedin", 40, 30), ...base], NOW)).toHaveLength(1);
    expect(findWinners([post("linkedin", 40, 1, { postedAt: undefined }), ...base], NOW)).toEqual([]);
    const w = post("linkedin", 40, 1);
    expect(findWinners([w, ...base], NOW, { [w.id]: { at: "2026-10-24T00:00:00.000Z", skipped: "dated" } })).toEqual([]);
    // the 21st newest is out of the last 20
    const twenty = Array.from({ length: 20 }, (_, i) => post("linkedin", 5, i));
    expect(findWinners([...twenty, post("linkedin", 40, 25)], NOW)).toEqual([]);
    expect(findWinners([...twenty.slice(1), post("linkedin", 40, 25)], NOW)).toHaveLength(1);
  });

  it("works per network, with typed or real numbers", () => {
    const mixed = [post("linkedin", 30, 1), post("linkedin", 5, 2), post("linkedin", 5, 3), post("instagram", 5, 4), post("instagram", 5, 5), post("instagram", 5, 6)];
    expect(findWinners(mixed, NOW)).toEqual([]);
    const ig = [post("instagram", 0, 1, { metrics: { impressions: 900 }, zernio: { postId: "z1", numbers: { impressions: 900, reach: 0, views: 0, likes: 25, comments: 3, shares: 0, saves: 0, at: "" } } as DraftEntry["zernio"] }), ...[4, 5, 6, 5].map((e, i) => post("instagram", e, i + 2))];
    expect(findWinners(ig, NOW)).toMatchObject([{ network: "instagram", engagements: 28 }]);
  });
});

describe("checkWinners and the cards", () => {
  const seed = () => {
    const li = [post("linkedin", 24, 1), post("linkedin", 10, 2), post("linkedin", 10, 3), post("linkedin", 9, 4), post("linkedin", 11, 5)];
    saveDrafts(UID, li);
    return li;
  };

  it("never checks a dated winner again and shows it no card", async () => {
    const li = seed();
    fn.judge.mockResolvedValue({ data: { evergreen: false } });
    await checkWinners(UID, loadDrafts(UID), NOW);
    expect(fn.judge).toHaveBeenCalledWith({ mode: "evergreen", text: li[0].draft });
    expect(loadWinners(UID).handled[li[0].id]).toEqual({ at: new Date(NOW).toISOString(), skipped: "dated" });
    expect(winnerCards(UID, loadDrafts(UID), NOW)).toEqual([]);
    await checkWinners(UID, loadDrafts(UID), NOW + DAY);
    expect(fn.judge).toHaveBeenCalledTimes(1);
    expect(make).not.toHaveBeenCalled();
  });

  it("keeps an evergreen winner, and one Jev had no answer for, with a card that waits for a tap", async () => {
    const li = seed();
    fn.judge.mockResolvedValueOnce(refuse(502, "failed", "Couldn't check right now."));
    await checkWinners(UID, loadDrafts(UID), NOW);
    expect(loadWinners(UID).kept).toEqual({ [li[0].id]: new Date(NOW).toISOString() });
    expect(winnerCards(UID, loadDrafts(UID), NOW)).toMatchObject([{ status: "ready", winner: { draft: { id: li[0].id }, ratio: 2.4 } }]);
    // kept: never asked again, and nothing is made without a tap (Q3)
    await checkWinners(UID, loadDrafts(UID), NOW);
    expect(fn.judge).toHaveBeenCalledTimes(1);
    expect(make).not.toHaveBeenCalled();
  });

  it("asks one winner at a time, one run per brand", async () => {
    seed();
    let release!: (v: unknown) => void;
    fn.judge.mockReturnValue(new Promise((r) => (release = r)));
    const a = checkWinners(UID, loadDrafts(UID), NOW);
    expect(checkWinners(UID, loadDrafts(UID), NOW)).toBe(a);
    release({ data: { evergreen: true } });
    await a;
    expect(fn.judge).toHaveBeenCalledTimes(1);
  });

  it("stops at the sixth check's 429: no versions, the card opens the sheet, and tomorrow it asks again", async () => {
    const highs = Array.from({ length: 6 }, (_, i) => post("linkedin", 30, i + 1));
    saveDrafts(UID, [...highs, ...Array.from({ length: 14 }, (_, i) => post("linkedin", 2, i + 7))]);
    let calls = 0;
    fn.judge.mockImplementation(async () => (++calls > 5 ? refuse(429, "daily_limit", "You've used all 5 for today.") : { data: { evergreen: true } }));
    await checkWinners(UID, loadDrafts(UID), NOW);
    expect(fn.judge).toHaveBeenCalledTimes(6);
    const s = loadWinners(UID);
    expect(Object.keys(s.kept)).toHaveLength(5);
    expect(s.handled).toEqual({});
    const cards = winnerCards(UID, loadDrafts(UID), NOW);
    expect(cards.map((c) => c.status).sort()).toEqual(["limit", "ready", "ready", "ready", "ready", "ready"]);
    expect(make).not.toHaveBeenCalled();
    // the rest of the day asks nothing
    await checkWinners(UID, loadDrafts(UID), NOW + 3_600_000);
    expect(fn.judge).toHaveBeenCalledTimes(6);
    calls = 0;
    await checkWinners(UID, loadDrafts(UID), NOW + DAY);
    expect(fn.judge).toHaveBeenCalledTimes(7);
    expect(winnerCards(UID, loadDrafts(UID), NOW + DAY).every((c) => c.status === "ready")).toBe(true);
  });

  it("stops on a lost connection and asks again on the next open", async () => {
    seed();
    fn.judge.mockResolvedValue({ data: { evergreen: true } });
    fn.invoke.mockImplementationOnce(async () => ({ error: { message: "Failed to fetch" } }));
    await checkWinners(UID, loadDrafts(UID), NOW);
    expect(loadWinners(UID)).toEqual({ handled: {}, kept: {} });
    expect(winnerCards(UID, loadDrafts(UID), NOW)).toEqual([]);
    await checkWinners(UID, loadDrafts(UID), NOW);
    expect(Object.keys(loadWinners(UID).kept)).toHaveLength(1);
  });
});

describe("Make 3 versions and Undo", () => {
  const ready = async () => {
    const li = [post("linkedin", 24, 1), post("linkedin", 10, 2), post("linkedin", 10, 3), post("linkedin", 9, 4), post("linkedin", 11, 5)];
    saveDrafts(UID, li);
    fn.judge.mockResolvedValue({ data: { evergreen: true } });
    await checkWinners(UID, loadDrafts(UID), NOW);
    make.mockImplementation(async (b: { formula: string }) => answer(`Fresh hook ${b.formula}`));
    return li[0];
  };

  it("makes 3 drafts in one set on the press, marks the winner handled and shows the made card", async () => {
    const w = await ready();
    const seen: string[] = [];
    const off = onWinners(() => seen.push(winnerCards(UID, loadDrafts(UID), NOW)[0]?.status ?? "none"));
    const done = finished();
    expect(makeWinnerVersions(UID, w.id, () => NOW)).toBe("started");
    expect(winnerCards(UID, loadDrafts(UID), NOW)[0].status).toBe("making");
    const j = await done;
    off();
    expect(make).toHaveBeenCalledTimes(3);
    expect(make.mock.calls.every(([b]) => b.source.key === `own:${w.id}`)).toBe(true);
    expect(draftsInSet(loadDrafts(UID), j.set!.id)).toHaveLength(3);
    expect(loadWinners(UID).handled[w.id]).toEqual({ at: new Date(NOW).toISOString(), setId: j.set!.id });
    expect(winnerCards(UID, loadDrafts(UID), NOW)).toMatchObject([{ status: "made", setId: j.set!.id }]);
    expect(seen).toContain("made");
    // a handled winner is never checked again
    await checkWinners(UID, loadDrafts(UID), NOW);
    expect(fn.judge).toHaveBeenCalledTimes(1);
  });

  it("Undo removes the unedited versions and leaves an edited or scheduled one", async () => {
    const w = await ready();
    const done = finished();
    makeWinnerVersions(UID, w.id, () => NOW);
    const j = await done;
    const [a, b, c] = draftsInSet(loadDrafts(UID), j.set!.id);
    upsertDraft(UID, { ...a, draft: `${a.draft}\n\nOne more line from me.` });
    upsertDraft(UID, { ...b, status: "scheduled", scheduledFor: "2026-10-28T09:00" });
    expect(undoWinner(UID, w.id)).toBe(1);
    expect(draftsInSet(loadDrafts(UID), j.set!.id).map((d) => d.id).sort()).toEqual([a.id, b.id].sort());
    expect(loadDrafts(UID).some((d) => d.id === c.id)).toBe(false);
    expect(loadWinners(UID).handled[w.id]?.setId).toBe(j.set!.id);
    // Undo is once
    expect(undoWinner(UID, w.id)).toBe(0);
  });

  // live-p7a D18: after Undo kept an edited version, the card still read "3 versions made." and offered Undo again
  it("after an Undo that keeps some, the card counts what is left, offers no second Undo and redraws", async () => {
    const w = await ready();
    const done = finished();
    makeWinnerVersions(UID, w.id, () => NOW);
    const j = await done;
    expect(winnerCards(UID, loadDrafts(UID), NOW)).toMatchObject([{ status: "made", setId: j.set!.id, versions: 3, undo: true }]);
    const [a] = draftsInSet(loadDrafts(UID), j.set!.id);
    upsertDraft(UID, { ...a, draft: `${a.draft}\n\nOne more line from me.` });
    let redrawn = 0;
    const off = onWinners(() => redrawn++);
    expect(undoWinner(UID, w.id)).toBe(2);
    off();
    expect(redrawn).toBeGreaterThan(0);
    expect(winnerCards(UID, loadDrafts(UID), NOW)).toMatchObject([{ status: "made", setId: j.set!.id, versions: 1, undo: false }]);
  });

  it("Undo of every version puts the card back to Make 3 versions", async () => {
    const w = await ready();
    const done = finished();
    makeWinnerVersions(UID, w.id, () => NOW);
    const j = await done;
    expect(undoWinner(UID, w.id)).toBe(3);
    expect(draftsInSet(loadDrafts(UID), j.set!.id)).toEqual([]);
    expect(loadWinners(UID).handled).toEqual({});
    expect(winnerCards(UID, loadDrafts(UID), NOW)).toMatchObject([{ status: "ready" }]);
  });

  it("shows failed with nothing handled when no version lands, and busy while another run goes", async () => {
    const w = await ready();
    make.mockRejectedValue(new Error("offline"));
    const done = finished();
    makeWinnerVersions(UID, w.id, () => NOW);
    expect(makeWinnerVersions(UID, w.id, () => NOW)).toBe("busy");
    await done;
    expect(winnerCards(UID, loadDrafts(UID), NOW)).toMatchObject([{ status: "failed" }]);
    expect(loadWinners(UID).handled).toEqual({});
    expect(makeWinnerVersions(UID, "gone-id", () => NOW)).toBe("gone");
  });

  it("markHandled keeps the newest 200", () => {
    for (let i = 0; i < 205; i++) markHandled(UID, `d${i}`, { at: new Date(NOW + i * 1000).toISOString(), skipped: "dated" });
    const h = loadWinners(UID).handled;
    expect(Object.keys(h)).toHaveLength(200);
    expect(h.d0).toBeUndefined();
    expect(h.d204).toBeDefined();
  });
});
