import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeError } from "@/lib/edgeFn";
import type { Found } from "../../supabase/functions/viral-search/logic.ts";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));

const v = await import("./viralSearch");

class MemStorage {
  s = new Map<string, string>();
  full = Infinity;
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, val: string) {
    if (val.length > this.full) throw new DOMException("full", "QuotaExceededError");
    this.s.set(k, val);
  }
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

const found = (id: string, o: Partial<Found> = {}): Found => ({
  id: `tiktok:${id}`, platform: "tiktok", url: `https://www.tiktok.com/@a/video/${id}`, author: "@a", title: null, caption: "A caption", cover: null,
  views: 1000, likes: 10, comments: 1, shares: 0, followers: 100, postedAt: "2026-10-01T00:00:00.000Z", durationSec: 30, ratio: 10, relevance: 0.8, ...o,
});
const search = (q: string, at: string, results = [found("1")]) => ({ q, at, results, failed: {} });

describe("the saved searches", () => {
  it("live under content-studio-viral-search- plus the brand's scoped id, and read bad JSON as empty", () => {
    expect(v.viralSearchKey("u1")).toBe("content-studio-viral-search-u1");
    v.saveViralSearch("u1", search("cpf", "2026-10-20T00:00:00Z"));
    expect(JSON.parse(storage.getItem("content-studio-viral-search-u1")!).searches[0]).toMatchObject({ q: "cpf", results: [{ id: "tiktok:1" }] });
    expect(changed).toHaveBeenCalledWith("content-studio-viral-search-changed");
    storage.setItem("content-studio-viral-search-u1", "{nope");
    expect(v.loadViralSearches("u1")).toEqual({ searches: [] });
    storage.setItem("content-studio-viral-search-u1", JSON.stringify({ searches: [null, { q: "x" }, { q: "ok", at: "t", results: [{ id: "a", platform: "instagram", url: "https://x" }, { ...found("2"), url: "javascript:1" }, found("3")], failed: { tiktok: "took too long", instagram: "x" } }] }));
    expect(v.loadViralSearches("u1")).toEqual({ searches: [{ q: "ok", at: "t", results: [found("3")], failed: { tiktok: "took too long" } }] });
  });

  it("keeps the newest 5, drops the oldest on a sixth, and replaces the same words instead of adding them", () => {
    for (let k = 1; k <= 6; k++) v.saveViralSearch("u1", search(`term ${k}`, `2026-10-0${k}T00:00:00Z`));
    expect(v.loadViralSearches("u1").searches.map((s) => s.q)).toEqual(["term 6", "term 5", "term 4", "term 3", "term 2"]);
    v.saveViralSearch("u1", search("TERM  3", "2026-10-09T00:00:00Z"));
    expect(v.loadViralSearches("u1").searches.map((s) => s.q)).toEqual(["TERM 3", "term 6", "term 5", "term 4", "term 2"]);
  });

  it("keeps at most 40 results with captions of 200 characters", () => {
    v.saveViralSearch("u1", search("cpf", "t", Array.from({ length: 45 }, (_, k) => found(String(k), { caption: "x".repeat(300) }))));
    const s = v.loadViralSearches("u1").searches[0];
    expect(s.results).toHaveLength(40);
    expect(s.results[0].caption).toHaveLength(200);
  });

  it("trims to fewer searches when storage is full rather than losing the new one", () => {
    for (let k = 1; k <= 4; k++) v.saveViralSearch("u1", search(`term ${k}`, "t"));
    storage.full = 2 * JSON.stringify(v.loadViralSearches("u1").searches[0]).length + 40;
    v.saveViralSearch("u1", search("newest", "t"));
    expect(v.loadViralSearches("u1").searches.map((s) => s.q)).toEqual(["newest", "term 4"]);
  });

  it("finds a search for the same words however old, but reuses it for free only within 24 hours", () => {
    const now = Date.parse("2026-10-20T12:00:00Z");
    v.saveViralSearch("u1", search("first job", "2026-10-19T13:00:00Z"));
    v.saveViralSearch("u1", search("cpf", "2026-10-19T11:00:00Z"));
    expect(v.freshSearch("u1", "  First   Job ", now)?.q).toBe("first job");
    expect(v.freshSearch("u1", "cpf", now)).toBeNull();
    expect(v.findSearch("u1", "CPF")?.q).toBe("cpf");
    expect(v.findSearch("u1", "retirement")).toBeNull();
    expect(v.findSearch("u2", "cpf")).toBeNull();
  });
});

describe("the search job", () => {
  it("sends the words and the brand, saves the answer, and marks itself running until then", async () => {
    let answer!: (r: unknown) => void;
    callFn.mockReturnValue(new Promise((r) => (answer = r)));
    const job = v.runSearch("u1", "  cold  calling ");
    expect(v.isSearching("Cold calling")).toBe(true);
    expect(callFn).toHaveBeenCalledWith("viral-search", { q: "cold calling", brand: { sells: "", serves: "" } }, v.SEARCH_FAILED);
    answer({ results: [found("9")], failed: { youtube: "took too long" } });
    await job;
    expect(v.isSearching("cold calling")).toBe(false);
    expect(v.findSearch("u1", "cold calling")).toMatchObject({ q: "cold calling", results: [{ id: "tiktok:9" }], failed: { youtube: "took too long" } });
  });

  it("reuses a search from the last 24 hours without calling, unless asked again", async () => {
    v.saveViralSearch("u1", search("cpf", new Date().toISOString()));
    await v.runSearch("u1", "CPF");
    expect(callFn).not.toHaveBeenCalled();
    callFn.mockResolvedValue({ results: [], failed: {} });
    await v.runSearch("u1", "CPF", true);
    expect(callFn).toHaveBeenCalledTimes(1);
    expect(v.findSearch("u1", "cpf")?.results).toEqual([]);
  });

  it("keeps the server's words for a refusal, its own line for 403, and saves nothing", async () => {
    callFn.mockRejectedValue(new EdgeError("You've used all 10 for today. It resets at 8am Singapore time.", 429, "daily_limit"));
    await v.runSearch("u1", "cpf");
    expect(v.searchFailure("cpf")).toEqual({ message: "You've used all 10 for today. It resets at 8am Singapore time.", code: "daily_limit" });
    callFn.mockRejectedValue(new EdgeError("This isn't switched on for your account yet.", 403, "not_enabled"));
    await v.runSearch("u1", "cpf");
    expect(v.searchFailure("cpf")).toEqual({ message: "Search isn't switched on for your account yet.", code: "not_enabled" });
    expect(v.loadViralSearches("u1").searches).toEqual([]);
    callFn.mockResolvedValue({ results: [], failed: {} });
    await v.runSearch("u1", "cpf");
    expect(v.searchFailure("cpf")).toBeNull();
  });
});

describe("Remix", () => {
  it("opens Clone a reel with the result's own link for TikTok and YouTube", () => {
    expect(v.remixUrlFor(found("7614311442182982925", { url: "https://www.tiktok.com/@faithindevelopment/video/7614311442182982925" }))).toBe(
      "/clone?url=https%3A%2F%2Fwww.tiktok.com%2F%40faithindevelopment%2Fvideo%2F7614311442182982925",
    );
    expect(v.remixUrlFor({ url: "https://www.youtube.com/watch?v=fRbGYknaN74" })).toBe("/clone?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DfRbGYknaN74");
  });

  it("names the result by the link: key remix-link saves, with no caption-free nulls", () => {
    const yt = found("x", { id: "youtube:fRbGYknaN74", platform: "youtube", url: "https://www.youtube.com/watch?v=fRbGYknaN74", author: "Jeff Shore", title: "Follow-up", likes: null, comments: null, shares: null, followers: null, ratio: null, cover: null });
    expect(v.sourceFor(yt)).toEqual({
      key: "link:youtube:fRbGYknaN74", kind: "link", format: "video", platform: "youtube", url: "https://www.youtube.com/watch?v=fRbGYknaN74",
      author: "Jeff Shore", title: "Follow-up", caption: "A caption", numbers: { views: 1000 }, remixedAt: "",
    });
    expect(v.sourceFor(found("123456"))).toMatchObject({ key: "link:tiktok:123456", title: "A caption", numbers: { views: 1000, likes: 10, comments: 1, ratio: 10 } });
  });
});
