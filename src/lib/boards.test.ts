import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeError } from "@/lib/edgeFn";
import type { RemixSource } from "@/lib/remixSource";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));

const b = await import("./boards");
type BoardItem = import("./boards").BoardItem;

class MemStorage {
  s = new Map<string, string>();
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}
let storage: MemStorage;
const changed = vi.fn();

beforeEach(() => {
  storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("dispatchEvent", (e: Event) => changed(e.type));
  callFn.mockReset();
  changed.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const KEY = "content-studio-boards-u1";
const stored = () => JSON.parse(storage.getItem(KEY)!) as { boards: { id: string; name: string }[]; items: BoardItem[] };
const item = (n: number, extra: Partial<BoardItem> = {}): BoardItem => ({
  key: `link:web:${String(n).padStart(12, "0")}`, kind: "link", url: `https://example.com/p/${n}`, platform: "web", title: "", caption: "", author: "",
  cover: "", numbers: {}, postedAt: "", savedAt: "", boards: [], note: "", read: "none", ...extra,
});
const ok = <T extends { ok: boolean }>(r: T) => (r.ok ? (r as Extract<T, { ok: true }>) : (() => { throw new Error(JSON.stringify(r)); })());
const parsed = (text: string) => {
  const p = b.parseSaveLink(text);
  return "message" in p ? p.message : { platform: p.platform, url: p.url, id: p.id, read: p.read };
};
// one tick of the read job: callFn resolves, then the store is patched
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("parseSaveLink", () => {
  it("reads Instagram and TikTok posts, rebuilt from their parts", () => {
    for (const [text, url, id] of [
      ["https://www.instagram.com/p/ABCdef123/?igsh=x", "https://www.instagram.com/p/ABCdef123/", "ABCdef123"],
      ["https://instagram.com/reel/ABCdef123/", "https://www.instagram.com/reel/ABCdef123/", "ABCdef123"],
      ["https://www.instagram.com/reels/ABCdef123", "https://www.instagram.com/reel/ABCdef123/", "ABCdef123"],
      ["https://www.instagram.com/tv/ABCdef123/", "https://www.instagram.com/p/ABCdef123/", "ABCdef123"],
    ]) expect(parsed(text)).toEqual({ platform: "instagram", url, id, read: "pending" });
    expect(parsed("https://www.tiktok.com/@mrbrown/video/7412345678901234567?lang=en")).toEqual({ platform: "tiktok", url: "https://www.tiktok.com/@mrbrown/video/7412345678901234567", id: "7412345678901234567", read: "pending" });
    for (const short of ["https://www.tiktok.com/t/ZT8abc123/", "https://vm.tiktok.com/ZS123ab/", "https://vt.tiktok.com/ZS123/"]) {
      expect(parsed(short)).toMatchObject({ platform: "tiktok", id: null, read: "pending" });
    }
  });

  it("finds the link buried in share text", () => {
    expect(parsed("Check this out https://vt.tiktok.com/ZS123/ #fyp")).toEqual({ platform: "tiktok", url: "https://vt.tiktok.com/ZS123/", id: null, read: "pending" });
    expect(parsed("Look at this https://www.youtube.com/shorts/dQw4w9WgXcQ via @someone")).toMatchObject({ platform: "youtube", id: "dQw4w9WgXcQ" });
  });

  it("saves a TikTok photo slideshow as Link only, since Clone a reel can't read it", () => {
    expect(parsed("https://www.tiktok.com/@mrbrown/photo/7412345678901234567")).toEqual({ platform: "tiktok", url: "https://www.tiktok.com/@mrbrown/photo/7412345678901234567", id: "7412345678901234567", read: "none" });
  });

  it("files YouTube, the Ad Library, LinkedIn, X and Facebook under their own platform, unread", () => {
    expect(parsed("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3")).toEqual({ platform: "youtube", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", id: "dQw4w9WgXcQ", read: "none" });
    expect(parsed("https://youtu.be/dQw4w9WgXcQ")).toMatchObject({ platform: "youtube", id: "dQw4w9WgXcQ" });
    expect(parsed("https://www.facebook.com/ads/library/?id=2095783381019179")).toEqual({ platform: "meta-ad", url: "https://www.facebook.com/ads/library/?id=2095783381019179", id: "2095783381019179", read: "none" });
    expect(parsed("https://www.linkedin.com/posts/jane_tips-activity-7123456789012345678-AbCd")).toMatchObject({ platform: "linkedin", id: "7123456789012345678" });
    expect(parsed("https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678/")).toMatchObject({ platform: "linkedin", id: "7123456789012345678" });
    expect(parsed("https://twitter.com/jack/status/1234567890123")).toEqual({ platform: "x", url: "https://x.com/jack/status/1234567890123", id: "1234567890123", read: "none" });
    expect(parsed("https://www.facebook.com/dbs/posts/pfbid0abcDEF")).toMatchObject({ platform: "facebook" });
    expect(parsed("https://www.facebook.com/reel/1234567890")).toMatchObject({ platform: "facebook", id: "1234567890" });
    expect(parsed("https://fb.watch/abcDEF12/")).toMatchObject({ platform: "facebook", id: null });
  });

  it("saves any other web page as web, and refuses what isn't a safe link", () => {
    expect(parsed("https://blog.example.com/cpf-tips?ref=x")).toEqual({ platform: "web", url: "https://blog.example.com/cpf-tips?ref=x", id: null, read: "none" });
    expect(parsed("https://www.instagram.com/someone/")).toMatchObject({ platform: "web" }); // a profile, not a post
    for (const bad of ["", "just words", "ftp://example.com/file", "javascript:alert(1)", "https://user:pw@example.com/x", "https://127.0.0.1/x", "https://[::1]/x", "https://example.com:8443/x", `https://example.com/${"a".repeat(2000)}`]) {
      expect(parsed(bad), bad).toBe(b.SAVE_COPY.bad);
    }
  });
});

describe("the store", () => {
  it("lives under content-studio-boards- plus the brand, newest first, and reads bad JSON as empty", () => {
    ok(b.addItem("u1", item(1)));
    ok(b.addItem("u1", item(2)));
    expect(stored().items.map((i) => i.key)).toEqual([item(2).key, item(1).key]);
    expect(changed).toHaveBeenCalledWith("content-studio-boards-changed");
    storage.setItem(KEY, "{nope");
    expect(b.loadBoards("u1")).toEqual({ boards: [], items: [] });
    storage.setItem(KEY, JSON.stringify({ boards: [{ id: "b-1", name: "Hooks" }, { id: "" }], items: [null, { key: "k" }, { ...item(3), boards: ["b-1", "b-gone"], cover: "https://cdn.x/y.jpg", read: "weird" }] }));
    expect(b.loadBoards("u1")).toMatchObject({ boards: [{ id: "b-1", name: "Hooks" }], items: [{ key: item(3).key, boards: ["b-1"], cover: "", read: "none" }] });
  });

  it("saves the same link once, by key or by link", async () => {
    expect(ok(await b.saveLink("u1", "https://youtu.be/dQw4w9WgXcQ", "")).item.key).toBe("link:youtube:dQw4w9WgXcQ");
    const again = await b.saveLink("u1", "Watch https://www.youtube.com/watch?v=dQw4w9WgXcQ", "");
    expect(again).toMatchObject({ ok: false, reason: "duplicate", existing: { key: "link:youtube:dQw4w9WgXcQ" } });
    const web = ok(await b.saveLink("u1", "https://example.com/a", ""));
    expect(web.item.key).toMatch(/^link:web:[0-9a-f]{12}$/);
    expect(await b.saveLink("u1", "see https://example.com/a", "")).toMatchObject({ ok: false, reason: "duplicate" });
    expect(stored().items).toHaveLength(2);
    expect(await b.saveLink("u1", "nothing here", "")).toEqual({ ok: false, reason: "bad" });
    expect(callFn).not.toHaveBeenCalled();
  });

  it("refuses the 501st item and the 21st board, and never drops old items to make room", () => {
    storage.setItem(KEY, JSON.stringify({ boards: [], items: Array.from({ length: 500 }, (_, n) => item(n)) }));
    expect(b.addItem("u1", item(999))).toEqual({ ok: false, reason: "full" });
    expect(stored().items).toHaveLength(500);
    for (let n = 0; n < 20; n++) ok(b.addBoard("u1", `Board ${n}`));
    expect(b.addBoard("u1", "One more")).toEqual({ ok: false, reason: "cap" });
    expect(b.addBoard("u1", "  board 3 ")).toEqual({ ok: false, reason: "duplicate" });
    expect(b.addBoard("u1", "   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("deletes a board but keeps its items, clearing the id", () => {
    const hooks = ok(b.addBoard("u1", "Hooks to try")).board;
    const stories = ok(b.addBoard("u1", "Client stories")).board;
    ok(b.addItem("u1", item(1), [hooks.id]));
    ok(b.addItem("u1", item(2), [hooks.id, stories.id]));
    expect(b.boardCounts(b.loadBoards("u1"))).toEqual({ all: 2, unsorted: 0, [hooks.id]: 2, [stories.id]: 1 });
    b.deleteBoard("u1", hooks.id);
    expect(stored().boards.map((x) => x.name)).toEqual(["Client stories"]);
    expect(stored().items.map((i) => i.boards)).toEqual([[stories.id], []]);
    expect(b.boardCounts(b.loadBoards("u1"))).toMatchObject({ all: 2, unsorted: 1 });
  });

  it("moves and notes one item only", () => {
    const hooks = ok(b.addBoard("u1", "Hooks")).board;
    ok(b.addItem("u1", item(1)));
    ok(b.addItem("u1", item(2)));
    const before = stored().items[1];
    b.setItemBoards("u1", item(2).key, [hooks.id, "b-nope"]);
    b.setNote("u1", item(2).key, "Keep the opening question");
    const [moved, other] = stored().items;
    expect(moved).toMatchObject({ key: item(2).key, boards: [hooks.id], note: "Keep the opening question" });
    expect(other).toEqual(before);
  });

  it("puts a removed item back in its place on Undo", () => {
    for (const n of [1, 2, 3]) ok(b.addItem("u1", item(n)));
    const removed = b.removeItem("u1", item(2).key)!;
    expect(removed.index).toBe(1);
    expect(stored().items.map((i) => i.key)).toEqual([item(3).key, item(1).key]);
    expect(b.restoreItem("u1", removed)).toBe(true);
    expect(stored().items.map((i) => i.key)).toEqual([item(3).key, item(2).key, item(1).key]);
    expect(b.restoreItem("u1", removed)).toBe(false);
  });

  it("files a Save on the last board used on this device, else Unsorted", () => {
    expect(b.lastBoard("u1")).toBe("");
    const hooks = ok(b.addBoard("u1", "Hooks")).board;
    b.rememberBoard(hooks.id);
    expect(storage.getItem("cs-saved-board")).toBe(hooks.id);
    expect(b.lastBoard("u1")).toBe(hooks.id);
    b.deleteBoard("u1", hooks.id);
    expect(b.lastBoard("u1")).toBe("");
  });
});

describe("filters", () => {
  const items = [
    item(1, { platform: "instagram", caption: "CPF top-ups explained" }),
    item(2, { platform: "linkedin" }),
    item(3, { platform: "x" }),
    item(4, { platform: "facebook", note: "a cpf angle" }),
    item(5, { platform: "web", boards: ["b-1"] }),
    item(6, { platform: "meta-ad" }),
    item(7, { platform: "youtube" }),
  ];
  it("puts LinkedIn, X, Facebook and web pages under Links, and meta ads under Ads", () => {
    expect(b.filterItems(items, { board: "all", platform: "link", q: "" }).map((i) => i.platform)).toEqual(["linkedin", "x", "facebook", "web"]);
    expect(b.filterItems(items, { board: "all", platform: "ad", q: "" }).map((i) => i.platform)).toEqual(["meta-ad"]);
  });
  it("searches the caption and note, and splits Unsorted from a board", () => {
    expect(b.filterItems(items, { board: "all", platform: "all", q: "CPF" }).map((i) => i.platform)).toEqual(["instagram", "facebook"]);
    expect(b.filterItems(items, { board: "b-1", platform: "all", q: "" })).toHaveLength(1);
    expect(b.filterItems(items, { board: "unsorted", platform: "all", q: "" })).toHaveLength(6);
  });
});

describe("remix", () => {
  it("sends a TikTok video to Clone a reel", () => {
    const tt = item(1, { platform: "tiktok", url: "https://www.tiktok.com/@mrbrown/video/7412345678901234567", format: "video" });
    expect(b.remixUrlFor(tt)).toBe(`/clone?url=${encodeURIComponent("https://www.tiktok.com/@mrbrown/video/7412345678901234567")}`);
  });

  it("sends a web link to Write with the link, the note and the brief, never the caption's words", () => {
    const web = item(1, { url: "https://blog.example.com/cpf-tips", caption: "Seven secret phrases to copy", note: "The checklist format" });
    const url = new URL(b.remixUrlFor(web), "https://app.test");
    expect(url.pathname).toBe("/generate");
    expect(url.searchParams.get("source")).toBe(web.key);
    expect(url.searchParams.get("detail")).toBe("The checklist format");
    const ctx = url.searchParams.get("ctx")!;
    expect(ctx).toContain("https://blog.example.com/cpf-tips");
    expect(ctx).toContain("My note: The checklist format");
    expect(ctx).toContain("Do not copy its wording. No promised returns, no named insurer products, no invented numbers.");
    expect(b.remixUrlFor(web)).not.toMatch(/secret/i);
    expect(new URL(b.remixUrlFor(item(2, { url: "https://youtu.be/dQw4w9WgXcQ", platform: "youtube" })), "https://app.test").searchParams.get("detail")).toBe("youtu.be/dQw4w9WgXcQ");
  });

  it("turns a card's source into an item and back without new kinds", () => {
    const top: RemixSource = { key: "top:mrbrown-ABC", kind: "top-post", format: "video", platform: "instagram", url: "https://www.instagram.com/p/ABC/", author: "@mrbrown", title: "Hook", caption: "c".repeat(400), cover: "/covers/ABC.jpg", numbers: { views: 1200, likes: 40, ratio: 2 }, remixedAt: "" };
    const saved = b.toBoardItem(top);
    expect(saved).toMatchObject({ key: top.key, kind: "top-post", platform: "instagram", read: "done", cover: "/covers/ABC.jpg", numbers: { views: 1200, likes: 40 } });
    expect(saved.caption).toHaveLength(300);
    expect(b.toBoardItem({ ...top, cover: "https://scontent.cdninstagram.com/x.jpg" }).cover).toBe("");
    expect(b.toBoardItem({ key: "ad:1", kind: "ad", platform: "meta-ad", remixedAt: "" })).toMatchObject({ platform: "meta-ad", read: "done" });
    expect(b.toBoardItem({ key: "link:tiktok:7412345678901234567", kind: "link", platform: "tiktok", url: "https://www.tiktok.com/@a/video/7412345678901234567", remixedAt: "" }).read).toBe("pending");
    expect(b.toBoardItem({ key: "link:youtube:x", kind: "link", platform: "youtube", url: "https://youtu.be/dQw4w9WgXcQ", remixedAt: "" }).read).toBe("none");
    expect(b.fromSavedItem({ ...saved, note: "n" })).toEqual({ key: top.key, kind: "top-post", format: "video", platform: "instagram", url: top.url, author: "@mrbrown", title: "Hook", caption: saved.caption, cover: "/covers/ABC.jpg", numbers: { views: 1200, likes: 40 }, remixedAt: "" });
    expect(b.fromSavedItem(item(1, { url: "https://example.com/a" }))).toEqual({ key: item(1).key, kind: "link", url: "https://example.com/a", title: "example.com/a", remixedAt: "" });
  });
});

describe("the read job", () => {
  const reel = "https://www.instagram.com/reel/ABCdef123/";
  const answer = { source: { platform: "instagram", postId: "ABCdef123", url: reel, author: "mrbrown", caption: "How I paid off my loan", transcript: "Full words of the reel", isVideo: true, postedAt: "2026-10-11T03:00:00Z", durationSec: 30, metrics: { views: 1200000, likes: 40100, comments: 312, shares: null, saves: null }, metricsAsOf: null, videoUrl: "https://cdn/x.mp4" } };

  it("reads a pasted reel with style: true, fills the item and keeps the transcript on this device only", async () => {
    let finish: (v: unknown) => void = () => {};
    callFn.mockReturnValueOnce(new Promise((r) => (finish = r)));
    const r = ok(await b.saveLink("u1", `Look https://www.instagram.com/reel/ABCdef123/?igsh=1`, ""));
    expect(r.item).toMatchObject({ key: "link:instagram:ABCdef123", read: "pending" });
    expect(b.isReading(r.item.key)).toBe(true);
    expect(callFn).toHaveBeenCalledWith("clone-reel", { url: reel, style: true }, expect.any(String));
    finish(answer);
    await settle();
    expect(stored().items[0]).toMatchObject({ read: "done", caption: "How I paid off my loan", author: "@mrbrown", numbers: { views: 1200000, likes: 40100, comments: 312 }, postedAt: "2026-10-11", format: "video" });
    expect(storage.getItem(KEY)).not.toContain("Full words of the reel");
    expect(storage.getItem(KEY)).not.toContain("cdn/x.mp4");
    expect(b.loadTranscripts("u1")).toEqual({ "link:instagram:ABCdef123": "Full words of the reel" });
    expect(b.isReading(r.item.key)).toBe(false);
  });

  it("marks a 429 as capped and any other failure as failed, and keeps the item", async () => {
    callFn.mockRejectedValueOnce(new EdgeError("You've used all 20 for today. It resets at 8am Singapore time.", 429, "daily_limit"));
    ok(await b.saveLink("u1", reel, ""));
    await settle();
    expect(stored().items[0]).toMatchObject({ key: "link:instagram:ABCdef123", read: "capped" });
    expect(b.READ_CHIP[stored().items[0].read]).toBe("Reads used up today. Try again after 8am.");
    callFn.mockRejectedValueOnce(new EdgeError("We couldn't open that post.", 404, "not_found"));
    await b.runRead("u1", "link:instagram:ABCdef123");
    expect(stored().items[0]).toMatchObject({ read: "failed" });
    expect(b.loadTranscripts("u1")).toEqual({});
  });

  it("never sends a TikTok photo link or an in-app item", async () => {
    const photo = ok(await b.saveLink("u1", "https://www.tiktok.com/@a/photo/7412345678901234567", ""));
    expect(photo.item.read).toBe("none");
    await b.runRead("u1", photo.item.key);
    const top = ok(b.addItem("u1", b.toBoardItem({ key: "follow:instagram:1", kind: "follow", platform: "instagram", url: reel, remixedAt: "" })));
    await b.runRead("u1", top.item.key);
    expect(callFn).not.toHaveBeenCalled();
    expect(stored().items.map((i) => i.read)).toEqual(["done", "none"]);
  });

  it("drops a read whose item was removed meanwhile, and shows a dead pending read as failed", async () => {
    let finish: (v: unknown) => void = () => {};
    callFn.mockReturnValueOnce(new Promise((r) => (finish = r)));
    const r = ok(await b.saveLink("u1", reel, ""));
    b.removeItem("u1", r.item.key);
    finish(answer);
    await settle();
    expect(stored().items).toEqual([]);
    expect(b.loadTranscripts("u1")).toEqual({});
    const old = item(1, { read: "pending", savedAt: "2026-10-20T00:00:00Z" });
    expect(b.readShown(old, Date.parse("2026-10-20T00:02:00Z"))).toBe("pending");
    expect(b.readShown(old, Date.parse("2026-10-20T00:04:00Z"))).toBe("failed");
  });
});
