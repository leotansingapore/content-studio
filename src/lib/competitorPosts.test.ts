import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeError } from "@/lib/edgeFn";
import type { Competitor } from "@/lib/competitors";
import type { FollowedAccount, TrackedPost } from "@/lib/following";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));

const p = await import("./competitorPosts");

class MemStorage {
  s = new Map<string, string>();
  full = Infinity;
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (k.startsWith("content-studio-competitor-posts-") && v.length > this.full) throw new DOMException("full", "QuotaExceededError");
    this.s.set(k, v);
  }
  removeItem(k: string) { this.s.delete(k); }
}
let storage: MemStorage;
const changed = vi.fn();

const U = "u1";
const NOW = Date.parse("2026-10-20T12:00:00Z");
const HOUR = 3_600_000;
const comp = (id: string, handles: Competitor["handles"] = { instagram: `${id}acct` }): Competitor => ({
  id, name: id.toUpperCase(), site: null, logo: null, why: "", fbPageId: null, handles, adsCountry: "SG", source: "typed", addedAt: "2026-10-01T00:00:00Z",
});
const post = (id: string, hoursAgo: number, views: number | null, extra: Partial<TrackedPost> = {}): TrackedPost => ({
  id, url: `https://www.instagram.com/p/${id}/`, format: "video", caption: `Post ${id}`, postedAt: new Date(NOW - hoursAgo * HOUR).toISOString(), views, likes: 10, comments: 1, ...extra,
});
const account = (platform: "instagram" | "tiktok", handle: string, posts: TrackedPost[], checkedAt = "2026-10-20T00:00:00Z"): FollowedAccount => ({
  platform, handle, addedAt: checkedAt, history: [{ at: checkedAt, followers: 1000 }], posts, seen: posts.map((x) => x.id), fresh: [], checkedAt,
});
const setList = (list: Competitor[]) => storage.setItem(`content-studio-competitors-${U}`, JSON.stringify({ list, dismissed: [] }));

beforeEach(() => {
  storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, sessionStorage: new MemStorage(), addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("dispatchEvent", (e: Event) => changed(e.type));
  callFn.mockReset();
  changed.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("the synced posts store", () => {
  it("keys each handle by competitor and platform, under content-studio-competitor-posts-", () => {
    setList([comp("a", { instagram: "A.Wealth", tiktok: "@awealth" })]);
    expect(p.handlesOf(comp("a", { instagram: "A.Wealth", tiktok: "@awealth", facebook: "x" }))).toEqual([
      { platform: "instagram", handle: "a.wealth" }, { platform: "tiktok", handle: "awealth" },
    ]);
    p.saveCompetitorPosts(U, { "a:instagram": account("instagram", "a.wealth", []), "a:tiktok": account("tiktok", "awealth", []) });
    expect(Object.keys(JSON.parse(storage.getItem("content-studio-competitor-posts-u1")!))).toEqual(["a:instagram", "a:tiktok"]);
    expect(changed).toHaveBeenCalledWith("content-studio-competitor-posts-changed");
    storage.setItem("content-studio-competitor-posts-u1", "[not json");
    expect(p.loadCompetitorPosts(U)).toEqual({});
  });

  it("drops a removed competitor's entries and a handle that changed", () => {
    setList([comp("a"), comp("b", { instagram: "bacct", tiktok: "btok" })]);
    p.saveCompetitorPosts(U, { "a:instagram": account("instagram", "aacct", []), "b:instagram": account("instagram", "bacct", []), "b:tiktok": account("tiktok", "btok", []) });
    setList([comp("b", { instagram: "bnew", tiktok: "btok" })]);
    p.saveCompetitorPosts(U, p.loadCompetitorPosts(U));
    expect(Object.keys(p.loadCompetitorPosts(U))).toEqual(["b:tiktok"]);
  });

  it("keeps the newest 20 posts per handle when storage is full", () => {
    setList([comp("a")]);
    const posts = Array.from({ length: 30 }, (_, k) => post(`p${k}`, k * 24, 100, { caption: "x".repeat(240) }));
    storage.full = JSON.stringify({ "a:instagram": account("instagram", "aacct", posts.slice(0, 22)) }).length;
    const saved = p.saveCompetitorPosts(U, { "a:instagram": account("instagram", "aacct", posts) });
    expect(saved["a:instagram"].posts.map((x) => x.id)).toEqual(posts.slice(0, 20).map((x) => x.id));
  });
});

describe("checks", () => {
  it("is due when never checked or 7+ days old", () => {
    expect(p.postsDue(undefined)).toBe(true);
    expect(p.postsDue(account("instagram", "a", [], "2026-10-13T12:00:01Z"), NOW)).toBe(false);
    expect(p.postsDue(account("instagram", "a", [], "2026-10-13T12:00:00Z"), NOW)).toBe(true);
  });

  it("checks each due handle once, marks nothing new on the first check, and folds later checks in", async () => {
    setList([comp("a", { instagram: "aacct", tiktok: "atok" }), comp("b", {})]);
    callFn.mockImplementation(async (_n: string, b: { platform: "instagram" | "tiktok"; handle: string }) => ({
      platform: b.platform, handle: b.handle, name: "A", url: "", followers: 1200, postsCount: 30, posts: [post("x1", 100, 50)], checkedAt: "2026-10-20T00:00:00Z",
    }));
    await p.runDuePosts(U);
    expect(callFn.mock.calls.map((c) => c[1])).toEqual([{ mode: "posts", platform: "instagram", handle: "aacct" }, { mode: "posts", platform: "tiktok", handle: "atok" }]);
    expect(p.loadCompetitorPosts(U)["a:instagram"]).toMatchObject({ handle: "aacct", fresh: [], seen: ["x1"], checkedAt: "2026-10-20T00:00:00Z" });
    callFn.mockClear();
    await p.runDuePosts(U);
    expect(callFn).not.toHaveBeenCalled();

    callFn.mockResolvedValueOnce({ platform: "instagram", handle: "aacct", name: "A", url: "", followers: 1300, postsCount: 31, posts: [post("x2", 1, 9), post("x1", 100, 50)], checkedAt: "2026-10-27T00:00:00Z" });
    await p.runPostsCheck(U, "a", "instagram", "aacct");
    expect(p.loadCompetitorPosts(U)["a:instagram"]).toMatchObject({ fresh: ["x2"], history: [{ followers: 1200 }, { followers: 1300 }] });
  });

  it("keeps last week's posts when a check fails, with the server's line", async () => {
    setList([comp("a")]);
    p.saveCompetitorPosts(U, { "a:instagram": account("instagram", "aacct", [post("x1", 100, 50)], "2026-10-01T00:00:00Z") });
    callFn.mockRejectedValueOnce(new EdgeError("@aacct is private, so we can't read its posts.", 422, "private"));
    await p.runDuePosts(U);
    expect(p.postsCheckFailure("a:instagram")).toMatchObject({ code: "private", message: "@aacct is private, so we can't read its posts." });
    expect(p.loadCompetitorPosts(U)["a:instagram"].posts.map((x) => x.id)).toEqual(["x1"]);
    callFn.mockClear();
    await p.runDuePosts(U); // the read was billed: not again for 7 days unless Check now
    expect(callFn).not.toHaveBeenCalled();
  });
});

describe("the merged feed", () => {
  // a's usual is 1,000 views: its 4,000-view post is 4x, and its 2-hour-old post is too new to judge. b's 20,000-view
  // post is only 2x its own 10,000, so it ranks under a's 4x despite five times the views
  const a = account("instagram", "aacct", [
    post("young", 2, 50_000), post("a4x", 60, 4000),
    ...Array.from({ length: 8 }, (_, k) => post(`a${k}`, 72 + k * 24, 1000)),
  ]);
  const b = account("tiktok", "btok", [post("b2x", 61, 20_000), ...Array.from({ length: 8 }, (_, k) => post(`b${k}`, 72 + k * 24, 10_000))]);
  const list = [comp("a"), comp("b", { tiktok: "btok" })];
  const state = { "a:instagram": a, "b:tiktok": b };

  it("sorts by outlier score by default: young posts below every scored one", () => {
    const feed = p.feedPosts(list, state, {}, NOW);
    expect(feed[0].post.id).toBe("a4x");
    expect(feed[0].outlier.ratio).toBe(4);
    expect(feed[1].post.id).toBe("b2x");
    expect(feed.at(-1)!.post.id).toBe("young");
    expect(feed.at(-1)!.outlier.reason).toBe("young");
    expect(feed[0]).toMatchObject({ key: "instagram:a4x", competitor: { id: "a" } });
  });

  it("sorts by views or newest on request, and filters by competitor and platform", () => {
    expect(p.feedPosts(list, state, { sort: "views" }, NOW).map((f) => f.post.id).slice(0, 2)).toEqual(["young", "b2x"]);
    expect(p.feedPosts(list, state, { sort: "newest" }, NOW).map((f) => f.post.id).slice(0, 2)).toEqual(["young", "a4x"]);
    expect(new Set(p.feedPosts(list, state, { c: "b" }, NOW).map((f) => f.competitor.id))).toEqual(new Set(["b"]));
    expect(new Set(p.feedPosts(list, state, { platform: "instagram" }, NOW).map((f) => f.account.platform))).toEqual(new Set(["instagram"]));
    // a removed competitor's posts are not in the feed even before the next write
    expect(p.feedPosts([comp("a")], state, {}, NOW).every((f) => f.competitor.id === "a")).toBe(true);
  });

  it("gives each account's best settled ratio for the pace table", () => {
    expect(p.bestRatio(a, NOW)).toBe(4);
    expect(p.bestRatio(account("instagram", "zacct", [post("only", 100, 10)]), NOW)).toBeNull();
  });
});
