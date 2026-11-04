import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ sent: [] as Record<string, unknown>[], replies: [] as unknown[] }));
vi.mock("@/lib/edgeFn", async (real) => ({
  ...(await real<typeof import("./edgeFn")>()),
  callFn: async (_name: string, body: Record<string, unknown>) => {
    calls.sent.push(body);
    return calls.replies.shift();
  },
}));
vi.mock("@/lib/supabase", () => ({ supabase: {}, SUPABASE_URL: "https://x.supabase.co" }));

import {
  MAX_WATCHED, STALE_MS, aboutCreator, addCreators, dueCreators, feedOf, findCreators, handlesIn, keepRead, loadList, loadPause, loadReads, markFailed, pickReads,
  readCreator, saveList, savePause, suggestedOf, unreadable, type DiscoverCreator, type IgReel,
} from "./research";

class MemStorage {
  s = new Map<string, string>();
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
  key(i: number) { return [...this.s.keys()][i] ?? null; }
  get length() { return this.s.size; }
}
let storage: MemStorage;
beforeEach(() => {
  storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
  calls.sent.length = 0;
  calls.replies.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

const UID = "u1";
const NOW = Date.parse("2026-11-04T12:00:00.000Z");
const day = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const reel = (code: string, views: number, daysAgo: number, extra: Partial<IgReel> = {}): IgReel => ({
  code, url: `https://www.instagram.com/reel/${code}/`, owner: "made.up_creator", views, likes: 10, comments: 1, pinned: false, takenAt: day(daysAgo),
  thumb: "https://scontent.cdninstagram.com/t.jpg", caption: "", video: "https://instagram.fsin1-1.fna.fbcdn.net/v.mp4", ...extra,
});
const profile = (handle: string, followers: number) => ({ handle, name: handle.toUpperCase(), followers, posts: null, avatar: "", bio: "" });

describe("the watch list", () => {
  it("adds usernames and links once each, refuses what can't be one, and stops at 100", () => {
    const r = addCreators({ creators: [], skipped: [] }, handlesIn("@Made.Up_Creator, https://www.instagram.com/second.one/ made.up_creator\nnot!valid"), new Date(NOW));
    expect([r.added, r.bad, r.full]).toEqual([["made.up_creator", "second.one"], ["not!valid"], false]);
    const many = addCreators({ creators: [], skipped: [] }, Array.from({ length: 105 }, (_, i) => `creator_${i}`));
    expect([many.list.creators.length, many.full]).toEqual([MAX_WATCHED, true]);
  });

  it("keeps a read on this device only, without its video, and never rewrites the synced list for it", () => {
    saveList(UID, addCreators({ creators: [], skipped: [] }, ["made.up_creator"]).list);
    const synced = storage.getItem("content-studio-research-u1");
    const reads = keepRead(UID, "made.up_creator", { profile: profile("made.up_creator", 120400), reels: [reel("DMadeUp0001", 5000, 3, { caption: "first" })] }, undefined, new Date(NOW));
    expect(reads["made.up_creator"]).toMatchObject({ name: "MADE.UP_CREATOR", followers: 120400, at: day(0) });
    expect(storage.getItem("content-studio-research-u1")).toBe(synced);
    expect(loadReads(UID)["made.up_creator"].reels[0]).not.toHaveProperty("video");
    // a later read that opened no embed page for it keeps the caption
    keepRead(UID, "made.up_creator", { profile: profile("made.up_creator", 120500), reels: [reel("DMadeUp0001", 6000, 3)] }, undefined, new Date(NOW));
    expect(loadReads(UID)["made.up_creator"].reels[0]).toMatchObject({ views: 6000, caption: "first" });
  });

  it("hands back a read even when the device is full, and keeps its numbers without covers if that fits", () => {
    saveList(UID, addCreators({ creators: [], skipped: [] }, ["made.up_creator"]).list);
    const set = storage.setItem.bind(storage);
    let refused = 0;
    storage.setItem = (k: string, v: string) => {
      if (k.startsWith("cs-research-reads-") && v.includes("scontent")) return void (refused++, (() => { throw new Error("QuotaExceededError"); })());
      set(k, v);
    };
    const reads = keepRead(UID, "made.up_creator", { profile: profile("made.up_creator", 1), reels: [reel("DMadeUp0001", 5000, 3, { caption: "c" })] }, undefined, new Date(NOW));
    expect(reads["made.up_creator"].reels[0].thumb).toContain("scontent");
    expect(refused).toBe(1);
    expect(loadReads(UID)["made.up_creator"].reels[0]).toMatchObject({ views: 5000, thumb: "", caption: "" });
    // read on this visit either way, so it is not due again
    expect(dueCreators(loadList(UID), reads, {}, NOW)).toEqual([]);
  });

  it("reads the never-read first, then the oldest, none read in the last 2 days, none already being read", () => {
    let list = addCreators({ creators: [], skipped: [] }, ["a_one", "b_two", "c_three", "d_four", "e_five"]).list;
    saveList(UID, list);
    keepRead(UID, "a_one", { profile: profile("a_one", 1), reels: [] }, undefined, new Date(NOW - STALE_MS - 1));
    keepRead(UID, "b_two", { profile: profile("b_two", 1), reels: [] }, undefined, new Date(NOW - 60_000));
    keepRead(UID, "c_three", { profile: profile("c_three", 1), reels: [] }, undefined, new Date(NOW - 3 * STALE_MS));
    list = markFailed(UID, "e_five", "@e_five's account is private.", new Date(NOW - 60_000));
    expect(dueCreators(list, loadReads(UID), { d_four: { job: "j", at: NOW } }, NOW)).toEqual(["c_three", "a_one"]);
    expect(dueCreators(list, loadReads(UID), {}, NOW)).toEqual(["d_four", "c_three", "a_one"]);
  });
});

describe("the read loop's choices", () => {
  it("starts only creators nobody is reading, none that failed this visit, up to the room left", () => {
    expect(pickReads(["a", "b", "c"], new Set(), new Set(), 1)).toEqual(["a"]);
    // another tab reads a, so b; b failed this visit, so c; no room when one is already running
    expect(pickReads(["a", "b", "c"], new Set(["a"]), new Set(), 2)).toEqual(["b"]);
    expect(pickReads(["a", "b", "c"], new Set(), new Set(["a", "b"]), 1)).toEqual(["c"]);
    expect(pickReads(["a", "b"], new Set(["z"]), new Set(), 1)).toEqual([]);
  });

  it("tells a failure about one creator from one that stops every read", () => {
    expect(aboutCreator("Instagram's page for @made.up_creator couldn't be read. Try again later.", "made.up_creator")).toBe(true);
    expect(aboutCreator("Your Mac didn't pick this up. Check the script worker is running on it, then try again.", "made.up_creator")).toBe(false);
    expect([unreadable("@x's account is private."), unreadable("There's no Instagram account @x."), unreadable("Reads are paused."), unreadable("")]).toEqual([true, true, false, false]);
  });
});

describe("the feed", () => {
  it("ranks every watched creator's reels by how far each beat that creator's median, pinned and too-new ones left out", () => {
    const list = { creators: [{ handle: "made.up_creator", addedAt: day(9) }, { handle: "second.one", addedAt: day(9) }], skipped: [] };
    const reads = {
      "made.up_creator": { at: day(0), avatar: "", reels: [reel("DPinned0001", 9_000_000, 300, { pinned: true }), reel("DA00000001", 1000, 5), reel("DA00000002", 1200, 6), reel("DA00000003", 900, 7), reel("DA00000004", 30_000, 8), reel("DA00000005", 50_000, 1)] },
      "second.one": { at: day(0), avatar: "", reels: [reel("DB00000001", 100_000, 4), reel("DB00000002", 110_000, 5), reel("DB00000003", 90_000, 6), reel("DB00000004", 400_000, 7)] },
    };
    const feed = feedOf(list, reads, NOW);
    expect(feed.map((f) => f.reel.code).slice(0, 2)).toEqual(["DA00000004", "DB00000004"]);
    expect(feed.find((f) => f.reel.code === "DPinned0001")).toBeUndefined();
    expect(feed.find((f) => f.reel.code === "DA00000005")).toBeUndefined();
    expect(feed[0].outlier.ratio).toBeGreaterThan(feed[1].outlier.ratio!);
  });
});

describe("finding creators", () => {
  const c = (handle: string, followers: number | null): DiscoverCreator => ({ handle, why: "", profile: followers === null ? null : profile(handle, followers), reels: [], error: "" });

  it("suggests 3 with 100K to 1M followers and 3 with 10K to 100K, none watched, skipped or unread", () => {
    const found = [c("big_1", 500_000), c("big_2", 120_000), c("huge", 3_000_000), c("small_1", 50_000), c("big_3", 999_999), c("big_4", 200_000), c("tiny", 900), c("small_2", 10_000), c("watched", 60_000), c("skip_me", 70_000), c("unread", null)];
    const list = { creators: [{ handle: "watched", addedAt: day(1) }], skipped: ["skip_me"] };
    expect(suggestedOf(found, list).map((x) => x.handle)).toEqual(["big_1", "big_2", "big_3", "small_1", "small_2"]);
  });

  it("files a read with the codes already kept and no brand facts, and a search or a suggestion as its own job", async () => {
    calls.replies.push({ job: "r1" }, { status: "done", result: { profile: null, reels: [], paused: { until: day(-1), why: "login" } } });
    const r = await readCreator("made.up_creator", ["DA00000001"], { userId: UID, sleep: async () => {} });
    expect(calls.sent[0]).toEqual({ action: "ig_reels", handle: "made.up_creator", known: ["DA00000001"], brand: "me" });
    expect(r.paused?.why).toBe("login");
    calls.replies.push({ job: "s1" }, { status: "done", result: { creators: [], paused: null } }, { job: "s2" }, { status: "done", result: { creators: [], paused: null } });
    await findCreators({ topic: "money tips" }, { userId: UID, sleep: async () => {} });
    await findCreators({ suggest: true }, { userId: UID, sleep: async () => {} });
    expect(calls.sent[2]).toEqual({ action: "discover", topic: "money tips", brand: "me" });
    expect(calls.sent[4]).toMatchObject({ action: "discover", mode: "suggest", context: expect.any(Object) });
  });

  it("remembers the Mac's pause until it ends", () => {
    savePause({ until: new Date(NOW + 3_600_000).toISOString(), why: "wait" });
    expect(loadPause(NOW)?.why).toBe("wait");
    expect(loadPause(NOW + 2 * 3_600_000)).toBeNull();
    expect(loadList(UID)).toEqual({ creators: [], skipped: [] });
  });
});
