import { beforeEach, describe, expect, it, vi } from "vitest";
import { CREATE_ITEMS, jumpList, loadRecent, pageItems, pushRecent, searchJump, RECENT_MAX } from "./jumpTo";
import { SECTIONS, visiblePages } from "./nav";

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

beforeEach(() => {
  (globalThis as unknown as { window: unknown }).window = { localStorage: new MemStorage() };
});

describe("pageItems", () => {
  it("covers every page the nav shows this sign-in, once each", () => {
    const email = "user@demo.com";
    const navPages = SECTIONS.flatMap((s) => visiblePages(s.pages, email).map((p) => p.to));
    const items = pageItems(email).map((i) => i.to);
    expect(items).toEqual(navPages);
    expect(new Set(items).size).toBe(items.length);
  });

  it("shows Reels only once the server has said this sign-in sees the posts board", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    expect(pageItems("tanjunsing@gmail.com").some((i) => i.to === "/reels")).toBe(false);
    store.set("cs-team-me", JSON.stringify({ owner: false, member: true, modules: ["reels"], at: Date.now() }));
    expect(pageItems("user@demo.com").some((i) => i.to === "/reels")).toBe(true);
    store.set("cs-team-me", JSON.stringify({ owner: false, member: false, at: Date.now() }));
    expect(pageItems("user@demo.com").some((i) => i.to === "/reels")).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("searchJump", () => {
  const items = [...CREATE_ITEMS, ...pageItems("user@demo.com")];

  it("returns everything for an empty query", () => {
    expect(searchJump(items, "  ")).toBe(items);
  });

  it("puts a label that starts with the query first", () => {
    expect(searchJump(items, "cal")[0].to).toBe("/calendar");
    expect(searchJump(items, "brand")[0].to).toBe("/brand");
  });

  it("finds pages by keywords their label doesn't say", () => {
    expect(searchJump(items, "posting times").map((i) => i.to)).toContain("/brand");
    expect(searchJump(items, "schedule")[0].to).toBe("/calendar");
    expect(searchJump(items, "fads").map((i) => i.to)).toContain("/fads");
  });

  it("needs every word typed", () => {
    expect(searchJump(items, "calendar zzz")).toEqual([]);
  });

  it("ignores punctuation and case", () => {
    expect(searchJump(items, "F.A.D.S.").map((i) => i.to)).toContain("/fads");
    expect(searchJump(items, "WRITE A POST")[0].to).toBe("/generate");
  });
});

describe("recent pages", () => {
  it("keeps nav pages newest first, without repeats, up to the limit", () => {
    pushRecent("/calendar");
    pushRecent("/generate/batch");
    pushRecent("/calendar");
    expect(loadRecent()).toEqual(["/calendar", "/generate/batch"]);
    for (const p of ["/home", "/plan", "/board", "/drafts", "/grid", "/brand"]) pushRecent(p);
    expect(loadRecent()).toHaveLength(RECENT_MAX);
    expect(loadRecent()[0]).toBe("/brand");
  });

  it("records the nav page a deeper path belongs to and ignores paths outside the nav", () => {
    pushRecent("/recruit/engage");
    pushRecent("/review/abc");
    expect(loadRecent()).toEqual(["/recruit/engage"]);
  });

  it("survives broken storage", () => {
    (globalThis as unknown as { window: { localStorage: MemStorage } }).window.localStorage.setItem("cs-recent-pages", "{oops");
    expect(loadRecent()).toEqual([]);
  });
});

describe("jumpList", () => {
  it("starts with up to 3 recent pages, never the one open, then create actions and pages", () => {
    const list = jumpList("user@demo.com", ["/calendar", "/brand", "/plan", "/board"], "/calendar");
    expect(list.slice(0, 3).map((i) => [i.to, i.group])).toEqual([
      ["/brand", "Recent"],
      ["/plan", "Recent"],
      ["/board", "Recent"],
    ]);
    expect(list[3].group).toBe("Create");
  });
});
