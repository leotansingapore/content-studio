import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FollowedAccount, TrackedPost } from "@/lib/following";
import type { SimilarAccount } from "../../supabase/functions/competitors/logic.ts";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));
// the cloud's newer copy, as another tab or device saved it: a refresh writes it here (null: nothing newer)
let cloud: string | null = null;
vi.mock("@/lib/cloudSync", () => ({
  refreshCloudKeys: async (keys: string[]) => {
    if (cloud !== null) for (const k of keys) if (k.startsWith("content-studio-similar-")) localStorage.setItem(k, cloud);
  },
}));

const s = await import("./similarAccounts");

class MemStorage {
  s = new Map<string, string>();
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}
let storage: MemStorage;

const U = "u1";
const NOW = Date.parse("2026-11-01T12:00:00Z");
const DAY = 86_400_000;
const found = (handle: string, o: Partial<SimilarAccount> = {}): SimilarAccount =>
  ({ platform: "instagram", handle, name: handle, bio: "A bio", followers: 5000, kind: "app_or_brand", score: 0.8, via: "@tiimoapp", ...o });
const post = (id: string, daysAgo: number, o: Partial<TrackedPost> = {}): TrackedPost => ({
  id, url: `https://www.tiktok.com/@a/video/${id}`, format: "video", caption: `Post ${id}`, postedAt: new Date(NOW - daysAgo * DAY).toISOString(), views: 1000, likes: 10, comments: 1, ...o,
});
const read = (handle: string, posts: TrackedPost[], checkedAt = new Date(NOW).toISOString()) =>
  ({ platform: "tiktok" as const, handle, name: "A", url: `https://www.tiktok.com/@${handle}`, followers: 9000, postsCount: 90, posts, checkedAt });
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, sessionStorage: new MemStorage(), addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("dispatchEvent", () => true);
  callFn.mockReset();
  // a posts read nobody awaits (after an add or a find) answers nothing, so it saves nothing
  callFn.mockRejectedValue(new Error("offline"));
});
afterEach(() => vi.unstubAllGlobals());

describe("Apps like yours: the synced store", () => {
  it("keeps one key per brand under content-studio-similar-, and reads junk as empty", () => {
    s.saveSimilar(U, { accounts: [{ ...found("a"), addedAt: "x" }], posts: {}, dismissed: ["tiktok:gone"], month: { spent: 1.09, cap: 40 } });
    expect(s.loadSimilar(U)).toMatchObject({ accounts: [{ handle: "a" }], dismissed: ["tiktok:gone"], month: { spent: 1.09, cap: 40 } });
    expect([...storage.s.keys()]).toEqual(["content-studio-similar-u1"]);
    storage.setItem("content-studio-similar-u1", "[nope");
    expect(s.loadSimilar(U)).toEqual({ accounts: [], posts: {}, dismissed: [], month: null, foundAt: null, searches: [] });
  });

  it("adds found accounts after the ones there, never a dismissed or shown one, 40 found at most", () => {
    const base = s.mergeFound({ accounts: [], posts: {}, dismissed: ["instagram:gone"], month: null }, [found("a"), found("gone"), found("a")]);
    expect(base.accounts.map((a) => a.handle)).toEqual(["a"]);
    expect(base.accounts[0]).toEqual({ platform: "instagram", handle: "a", name: "a", followers: 5000, kind: "app_or_brand", via: "@tiimoapp", addedAt: expect.any(String) });
    const full = s.mergeFound(base, Array.from({ length: 50 }, (_, k) => found(`f${k}`)));
    expect(full.accounts).toHaveLength(40);
    expect(s.mergeFound(full, [found("more")]).accounts).toHaveLength(40);
  });

  it("measures 40 accounts of 30 posts under 600 KB", () => {
    const caption = "Day in the life of a founder building a planner app for ADHD brains, what I do before 9am, the three apps I open first and why ".repeat(2).slice(0, 240);
    let st = s.mergeFound({ accounts: [], posts: {}, dismissed: Array.from({ length: 200 }, (_, k) => `instagram:dismissed_account_${k}`), month: { spent: 12.34, cap: 40 } },
      Array.from({ length: 40 }, (_, k) => found(`account_number_${k}`, { name: "A fairly long account display name here", platform: k % 2 ? "tiktok" : "instagram" })));
    for (const e of st.accounts) {
      const posts = Array.from({ length: 30 }, (_, k) => post(`74${String(k).padStart(17, "0")}`, k, { caption, url: `https://www.tiktok.com/@${e.handle}/video/74${String(k).padStart(17, "0")}` }));
      st = { ...st, posts: { ...st.posts, [s.accountKey(e)]: s.applySimilarCheck(undefined, read(e.handle, posts)) } };
    }
    s.saveSimilar(U, st);
    const bytes = storage.getItem("content-studio-similar-u1")!.length;
    console.log(`content-studio-similar-<brand>, 40 accounts x 30 posts: ${Math.round(bytes / 1024)} KB`);
    expect(bytes).toBeLessThan(600 * 1024);
  });
});

describe("Apps like yours: posts", () => {
  it("merges a weekly read by post id: new posts only marked new, numbers refreshed, 30 newest kept", () => {
    const first = s.applySimilarCheck(undefined, read("a", Array.from({ length: 30 }, (_, k) => post(`p${k}`, k + 1))));
    expect(first.posts).toHaveLength(30);
    expect(first.fresh).toEqual([]);
    expect(first.seen).toEqual([]);
    const again = s.applySimilarCheck(first, read("a", [post("new1", 0.5), post("p0", 1, { views: 5000 })], new Date(NOW + 7 * DAY).toISOString()));
    expect(again.posts).toHaveLength(30);
    expect(again.posts.map((p) => p.id).slice(0, 3)).toEqual(["new1", "p0", "p1"]);
    expect(again.posts.find((p) => p.id === "p0")?.views).toBe(5000);
    expect(again.posts.map((p) => p.id)).not.toContain("p29"); // the oldest makes room
    expect(again.fresh).toEqual(["new1"]);
    expect(again.history).toHaveLength(1);
    expect(s.mergePosts([post("a", 2)], [post("a", 2, { likes: 99 }), post("b", 1)]).map((p) => [p.id, p.likes])).toEqual([["b", 10], ["a", 99]]);
  });

  it("reads 30 the first time and 10 after, on the similar caps, and saves the month the server says", async () => {
    s.saveSimilar(U, { accounts: [{ ...found("a", { platform: "tiktok", name: "a" }), addedAt: "x" }], posts: {}, dismissed: [], month: null });
    callFn.mockResolvedValueOnce({ ...read("a", [post("p1", 2)]), month: { spent: 2.5, cap: 40 } });
    expect(await s.runSimilarPosts(U, "tiktok", "a")).toBe(true);
    expect(callFn).toHaveBeenLastCalledWith("competitors", { mode: "posts", platform: "tiktok", handle: "a", scope: "similar", limit: 30 }, s.POSTS_FAILED);
    expect(s.loadSimilar(U)).toMatchObject({ month: { spent: 2.5, cap: 40 }, accounts: [{ name: "A", followers: 9000 }] });
    callFn.mockResolvedValueOnce(read("a", [post("p2", 1)]));
    await s.runSimilarPosts(U, "tiktok", "a");
    expect(callFn.mock.calls.at(-1)?.[1]).toMatchObject({ limit: 10 });
    expect(s.loadSimilar(U).posts["tiktok:a"].posts.map((p) => p.id)).toEqual(["p2", "p1"]);
  });

  it("is due when never read or read 7+ days ago", () => {
    const acc = s.applySimilarCheck(undefined, read("a", [], new Date(NOW - 8 * DAY).toISOString()));
    const fresh = s.applySimilarCheck(undefined, read("b", [], new Date(NOW - DAY).toISOString()));
    s.saveSimilar(U, {
      accounts: ["a", "b", "c"].map((h) => ({ ...found(h, { platform: "tiktok" }), addedAt: "x" })),
      posts: { "tiktok:a": acc, "tiktok:b": fresh }, dismissed: [], month: null,
    });
    s.rememberMedia(U, "tiktok:b", [], []); // b's read kept its covers on this device
    expect(s.dueSimilar(U, NOW).map((a) => a.handle)).toEqual(["a", "c"]);
  });

  it("reads an account once more, 30 posts, when this device kept no covers for it, then not again", async () => {
    const fresh = s.applySimilarCheck(undefined, read("b", [post("p1", 2)], new Date(NOW - DAY).toISOString()));
    s.saveSimilar(U, { accounts: [{ ...found("b", { platform: "tiktok" }), addedAt: "x" }], posts: { "tiktok:b": fresh }, dismissed: [], month: null });
    expect(s.dueSimilar(U, NOW).map((a) => a.handle)).toEqual(["b"]);
    callFn.mockResolvedValueOnce(read("b", [post("p1", 2, { cover: "https://p16-sign-sg.tiktokcdn.com/c.jpeg" })], new Date(NOW).toISOString()));
    await s.runSimilarPosts(U, "tiktok", "b");
    expect(callFn.mock.calls.at(-1)?.[1]).toMatchObject({ limit: 30 });
    expect("tiktok:b" in s.loadMedia(U)).toBe(true);
    expect(s.dueSimilar(U, NOW)).toEqual([]);
  });

  it("filters slideshows (TikTok photo posts), carousels (Instagram's), reels and UGC, best outlier first", () => {
    const tt = { platform: "tiktok" as const, kind: "creator" as const };
    const ig = { platform: "instagram" as const, kind: "app_or_brand" as const };
    expect(s.inFilter("slideshows", tt, { format: "carousel" })).toBe(true);
    expect(s.inFilter("slideshows", ig, { format: "carousel" })).toBe(false);
    expect(s.inFilter("carousels", ig, { format: "carousel" })).toBe(true);
    expect(s.inFilter("carousels", tt, { format: "carousel" })).toBe(false);
    expect(s.inFilter("reels", ig, { format: "video" })).toBe(true);
    expect(s.inFilter("reels", tt, { format: "carousel" })).toBe(false);
    expect(s.inFilter("ugc", tt, { format: "image" })).toBe(true);
    expect(s.inFilter("ugc", ig, { format: "video" })).toBe(false);
    const posts = [post("hit", 5, { views: 50_000 }), ...Array.from({ length: 6 }, (_, k) => post(`n${k}`, k + 6))];
    const st = { accounts: [{ ...found("a", { platform: "tiktok" }), addedAt: "x" }], posts: { "tiktok:a": s.applySimilarCheck(undefined, read("a", posts)) }, dismissed: [], month: null };
    const feed = s.similarFeed(st, "all", NOW);
    expect(feed[0].key).toBe("tiktok:hit");
    expect(feed).toHaveLength(7);
    expect(s.similarFeed(st, "carousels", NOW)).toEqual([]);
  });
});

describe("Apps like yours: accounts added by hand", () => {
  it("reads an @handle as either platform and a profile link as its own", () => {
    expect(s.readAddInput("@routinesieapp")).toEqual({ handle: "routinesieapp", platforms: ["instagram", "tiktok"] });
    expect(s.readAddInput("thedoapp")).toEqual({ handle: "thedoapp", platforms: ["instagram", "tiktok"] });
    expect(s.readAddInput("https://www.instagram.com/megrow_app/")).toEqual({ handle: "megrow_app", platforms: ["instagram"] });
    expect(s.readAddInput("https://www.tiktok.com/@structured.app")).toEqual({ handle: "structured.app", platforms: ["tiktok"] });
    // Leo types handles the way he says them: structured.app is an Instagram handle, not a site, here
    expect(s.readAddInput("structured.app")).toEqual({ handle: "structured.app", platforms: ["instagram", "tiktok"] });
    for (const bad of ["", "a b c", "acme.com/pricing", "https://www.instagram.com/p/abc/", "https://x.com/someone"]) expect(s.readAddInput(bad), bad).toBeNull();
  });

  it("stores an added account in the same key with via added, first, and reads its posts like the rest", async () => {
    s.saveSimilar(U, s.mergeFound({ accounts: [], posts: {}, dismissed: ["instagram:megrow_app"], month: null }, [found("acct_a")]));
    expect(s.addAccount(U, "instagram", "@MeGrow_App")).toBe("added");
    const st = s.loadSimilar(U);
    expect(st.accounts.map((a) => [a.handle, a.via])).toEqual([["megrow_app", "added"], ["acct_a", "@tiimoapp"]]);
    expect(st.dismissed).toEqual([]); // adding it by hand undoes "Not this one"
    expect(s.dueSimilar(U, NOW).map((a) => a.handle)).toContain("megrow_app");
    await flush();
    expect(callFn).toHaveBeenCalledWith("competitors", expect.objectContaining({ mode: "posts", handle: "megrow_app", scope: "similar" }), s.POSTS_FAILED);
    expect(s.addAccount(U, "instagram", "megrow_app")).toBe("already");
    expect(s.addAccount(U, "tiktok", "bad handle!")).toBe("invalid");
    expect(s.addAccount(U, "instagram", "acct_a")).toBe("added"); // a found one becomes added
    expect(s.loadSimilar(U).accounts.filter((x) => x.handle === "acct_a")).toEqual([expect.objectContaining({ via: "added" })]);
  });

  it("keeps added accounts whatever their followers, and never counts them toward the 40 found", () => {
    s.saveSimilar(U, { accounts: [], posts: {}, dismissed: [], month: null });
    s.addAccount(U, "tiktok", "tiny");
    const tiny = s.applySimilarCheck(undefined, { ...read("tiny", []), followers: 12 });
    s.saveSimilar(U, { ...s.loadSimilar(U), posts: { "tiktok:tiny": tiny } });
    const st = s.mergeFound(s.loadSimilar(U), Array.from({ length: 45 }, (_, k) => found(`f${k}`)));
    expect(st.accounts.filter((a) => a.via !== "added")).toHaveLength(40);
    expect(st.accounts[0]).toMatchObject({ handle: "tiny", via: "added" });
    expect(st.accounts).toHaveLength(41);
  });

  it("sends added accounts as seeds and as exclude, with the competitors' handles and the brand's own", () => {
    storage.setItem("content-studio-competitors-u1", JSON.stringify({ list: [{ id: "c1", name: "Tiimo", handles: { instagram: "TiimoApp", tiktok: "@tiimo" } }], dismissed: [] }));
    storage.setItem("content-studio-socialaccounts-u1", JSON.stringify({ instagram: { handle: "@activitytracker" } }));
    s.saveSimilar(U, s.mergeFound({ accounts: [], posts: {}, dismissed: ["tiktok:nope"], month: null }, [found("shown")]));
    s.addAccount(U, "instagram", "structured.app");
    s.addAccount(U, "tiktok", "thedoapp");
    const r = s.findRequest(U);
    expect(r.mode).toBe("similar");
    expect(r.seeds).toEqual({ instagram: ["structured.app", "tiimoapp"], tiktok: ["thedoapp", "tiimo"] });
    expect(r.exclude).toEqual(["tiktok:thedoapp", "instagram:structured.app", "instagram:shown", "tiktok:nope", "instagram:activitytracker"]);
  });

  it("Not this one takes an added or found account and its posts out, and no find brings it back", () => {
    s.saveSimilar(U, s.mergeFound({ accounts: [], posts: {}, dismissed: [], month: null }, [found("a")]));
    s.addAccount(U, "tiktok", "mine");
    s.saveSimilar(U, { ...s.loadSimilar(U), posts: { "tiktok:mine": s.applySimilarCheck(undefined, read("mine", [post("x", 3)])) } });
    s.dismissAccount(U, "tiktok:mine");
    s.dismissAccount(U, "instagram:a");
    const st = s.loadSimilar(U);
    expect(st.accounts).toEqual([]);
    expect(st.posts).toEqual({});
    expect(st.dismissed).toEqual(["instagram:a", "tiktok:mine"]);
    expect(s.mergeFound(st, [found("a"), found("mine", { platform: "tiktok" })]).accounts).toEqual([]);
  });

  it("caps added accounts at 10", () => {
    for (let k = 0; k < s.MAX_ADDED; k++) expect(s.addAccount(U, "instagram", `acct${k}`)).toBe("added");
    expect(s.addAccount(U, "instagram", "one_more")).toBe("full");
  });
});

describe("Apps like yours: a find", () => {
  it("folds the found accounts in, keeps the month, and says how many", async () => {
    expect(s.autoFindDue(s.loadSimilar(U))).toBe(true);
    callFn.mockResolvedValueOnce({ accounts: [found("a"), found("b")], phrases: ["habit tracker app", "sales day in my life"], month: { spent: 1.09, cap: 40 } });
    await s.runFind(U);
    expect(s.loadSimilar(U).searches).toEqual(["habit tracker app", "sales day in my life"]);
    expect(s.loadSimilar(U).foundAt).toEqual(expect.any(String));
    expect(s.autoFindDue(s.loadSimilar(U))).toBe(false);
    expect(callFn.mock.calls[0][1]).toMatchObject({ mode: "similar" });
    expect(s.loadSimilar(U)).toMatchObject({ accounts: [{ handle: "a" }, { handle: "b" }], month: { spent: 1.09, cap: 40 } });
    expect(s.lastFind()).toEqual({ text: "Found 2 new accounts. Reading their posts now.", error: false });
    await flush(); // the posts round the find started
    callFn.mockResolvedValueOnce({ accounts: [], note: "Couldn't judge the accounts right now, so nothing new was kept. This run wasn't counted." });
    await s.runFind(U);
    expect(s.lastFind()?.text).toMatch(/^Couldn't judge/);
    expect(s.loadSimilar(U).month).toEqual({ spent: 1.09, cap: 40 });
  });

  it("shows the server's refusal and keeps what is there", async () => {
    const { EdgeError } = await import("@/lib/edgeFn");
    s.saveSimilar(U, s.mergeFound({ accounts: [], posts: {}, dismissed: [], month: null }, [found("a")]));
    callFn.mockRejectedValueOnce(new EdgeError("Apps like yours has used this month's US$40. It starts again on 1 December.", 429, "month_limit"));
    await s.runFind(U);
    expect(s.lastFind()).toEqual({ text: "Apps like yours has used this month's US$40. It starts again on 1 December.", error: true });
    expect(s.loadSimilar(U).accounts).toHaveLength(1);
    expect(s.isFinding()).toBe(false);
    // a refused find never counts as the first one, so opening the tab tries again
    expect(s.loadSimilar(U).foundAt ?? null).toBeNull();
    expect(s.autoFindDue(s.loadSimilar(U))).toBe(true);
  });
});

describe("Apps like yours: covers, on this device only", () => {
  it("keeps covers, seconds and slides out of the synced store, and the best posts' on this device", async () => {
    const posts = [post("hit", 5, { views: 50_000, cover: "https://p16.tiktokcdn.com/hit.jpeg", seconds: 21 }), ...Array.from({ length: 6 }, (_, k) => post(`n${k}`, k + 6, { cover: `https://p16.tiktokcdn.com/n${k}.jpeg` }))];
    expect(s.applySimilarCheck(undefined, read("a", posts)).posts.every((p) => !("cover" in p) && !("seconds" in p) && !("slides" in p))).toBe(true);
    s.saveSimilar(U, s.mergeFound({ accounts: [], posts: {}, dismissed: [], month: null }, [found("a", { platform: "tiktok" })]));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    callFn.mockResolvedValueOnce(read("a", posts));
    await s.runSimilarPosts(U, "tiktok", "a");
    vi.useRealTimers();
    expect(JSON.stringify(s.loadSimilar(U))).not.toContain("tiktokcdn");
    // the hit beat its usual; the others sit at it (1x), so they are kept too, best first, 8 at most
    const media = s.loadMedia(U)["tiktok:a"];
    expect(media.hit).toEqual({ cover: "https://p16.tiktokcdn.com/hit.jpeg", seconds: 21 });
    expect(Object.keys(media).length).toBeLessThanOrEqual(s.MEDIA_KEPT);
    expect(s.bestPostIds(posts, NOW)[0]).toBe("hit");
    expect(s.bestPostIds([post("low", 5, { views: 10 }), ...posts.slice(1)], NOW)).not.toContain("low");
    expect([...storage.s.keys()]).toContain("cs-similar-media-u1");
    s.dismissAccount(U, "tiktok:a");
    expect(s.loadMedia(U)).toEqual({});
  });

  it("keeps a post's media from the last read when this one didn't bring it, and drops posts no longer among the best", () => {
    s.rememberMedia(U, "tiktok:a", [post("x", 3, { cover: "https://p16.tiktokcdn.com/x.jpeg" }), post("y", 3, { cover: "https://p16.tiktokcdn.com/y.jpeg" })], ["x", "y"]);
    s.rememberMedia(U, "tiktok:a", [post("z", 1, { slides: 6 })], ["x", "z"]);
    expect(s.loadMedia(U)).toEqual({ "tiktok:a": { x: { cover: "https://p16.tiktokcdn.com/x.jpeg" }, z: { slides: 6 } } });
  });
});

describe("Apps like yours: another tab or device", () => {
  afterEach(() => {
    cloud = null;
  });

  it("keeps what another device saved while a read ran: the read starts from the cloud's newer list", async () => {
    s.saveSimilar(U, { accounts: [{ ...found("a", { platform: "tiktok" }), addedAt: "x" }], posts: {}, dismissed: [], month: null });
    // elsewhere, a find added b and c while this tab was reading a
    cloud = JSON.stringify({ accounts: ["a", "b", "c"].map((h) => ({ ...found(h, { platform: "tiktok" }), addedAt: "x" })), posts: {}, dismissed: [], month: { spent: 3, cap: 40 } });
    callFn.mockResolvedValueOnce(read("a", [post("p1", 2)]));
    await s.runSimilarPosts(U, "tiktok", "a");
    expect(s.loadSimilar(U).accounts.map((x) => x.handle)).toEqual(["a", "b", "c"]);
    expect(s.loadSimilar(U).posts["tiktok:a"].posts.map((x) => x.id)).toEqual(["p1"]);
  });

  it("folds a find into the cloud's newer list too, never this tab's stale copy", async () => {
    s.saveSimilar(U, { accounts: [], posts: {}, dismissed: [], month: null });
    cloud = JSON.stringify({ accounts: [{ ...found("kept", { platform: "instagram" }), via: "added", addedAt: "x" }], posts: {}, dismissed: [], month: null });
    callFn.mockResolvedValueOnce({ accounts: [found("new1")], month: { spent: 1.1, cap: 40 } });
    await s.runFind(U);
    expect(s.loadSimilar(U).accounts.map((x) => x.handle)).toEqual(["kept", "new1"]);
  });
});

