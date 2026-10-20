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

  it("shows the posts board only once the server has said this sign-in sees it", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    expect(pageItems("tanjunsing@gmail.com").some((i) => i.to === "/reels")).toBe(false);
    store.set("cs-team-me", JSON.stringify({ owner: false, member: true, modules: ["reels"], at: Date.now() }));
    const items = pageItems("user@demo.com");
    expect(items.find((i) => i.to === "/reels")?.label).toBe("Posts board");
    // found by its new name and by the old one people still type
    expect(searchJump(items, "posts board")[0].to).toBe("/reels");
    expect(searchJump(items, "reels")[0].to).toBe("/reels");
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

  it("puts the page first for the everyday goals as people type them", () => {
    expect(searchJump(items, "drafts")[0].to).toBe("/drafts");
    expect(searchJump(items, "draft")[0].to).toBe("/drafts");
    expect(searchJump(items, "mark posted")[0].to).toBe("/drafts");
    expect(searchJump(items, "schedule a post")[0].to).toBe("/calendar");
    expect(searchJump(items, "scheduled")[0].to).toBe("/calendar");
    expect(searchJump(items, "best time to post")[0].to).toBe("/brand");
    expect(searchJump(items, "when to post")[0].to).toBe("/brand");
    expect(searchJump(items, "posting times")[0].to).toBe("/brand");
    expect(searchJump(items, "insights")[0].to).toBe("/analytics");
    expect(searchJump(items, "post ideas")[0].to).toBe("/inspiration");
    expect(searchJump(items, "photos")[0].to).toBe("/media");
    expect(searchJump(items, "subtitles")[0].to).toBe("/edit");
    expect(searchJump(items, "approve")[0].to).toBe("/team");
    expect(searchJump(items, "my posts")[0].to).toBe("/drafts");
    expect(searchJump(items, "bio")[0].to).toBe("/bio");
    expect(searchJump(items, "notifications")[0].to).toBe("/playbook");
    expect(searchJump(items, "alerts")[0].to).toBe("/playbook");
  });

  it("tells the three team places apart", () => {
    expect(items.find((i) => i.to === "/team")?.label).toBe("Leader approvals");
    expect(searchJump(items, "team")[0].to).toBe("/team");
    expect(searchJump(items, "team review")[0].to).toBe("/team");
    // Team shows once the server has said this sign-in owns the board
    vi.stubGlobal("localStorage", { getItem: (k: string) => (k === "cs-team-me" ? JSON.stringify({ owner: true, member: false, at: Date.now() }) : null), setItem: () => {} });
    const leo = pageItems("tanjunsing@gmail.com");
    vi.unstubAllGlobals();
    expect(searchJump(leo, "team").map((i) => i.to).slice(0, 2)).toEqual(["/reels/team", "/team"]);
    expect(searchJump(leo, "invite")[0].to).toBe("/reels/team");
    expect(searchJump(leo, "teammate")[0].to).toBe("/reels/team");
  });

  it("answers the words people use for the board, the calendar, ideas and accounts", () => {
    const store = new Map<string, string>([
      ["cs-team-me", JSON.stringify({ owner: false, member: true, modules: ["reels"], at: Date.now() })],
      ["cs-social-connect", JSON.stringify({ on: true, at: Date.now() })],
    ]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    const board = [...CREATE_ITEMS, ...pageItems("user@demo.com")];
    vi.unstubAllGlobals();
    for (const q of ["posts", "posts board", "review", "pending", "notes", "comments", "approve"]) expect(searchJump(board, q)[0].to, q).toBe("/reels");
    expect(searchJump(board, "carousel").map((i) => i.to)).toContain("/reels");
    expect(searchJump(board, "account")[0].to).toBe("/accounts");
    expect(searchJump(board, "settings")[0].to).toBe("/accounts");
    expect(searchJump(board, "connections")[0].to).toBe("/accounts");
    expect(searchJump(items, "account").map((i) => i.to)).not.toContain("/profiles");
    expect(searchJump(items, "today")[0].to).toBe("/calendar");
    expect(searchJump(items, "this week")[0].to).toBe("/calendar");
    expect(searchJump(items, "ideas")[0].to).toBe("/inspiration");
    expect(searchJump(items, "reels")[0].to).toBe("/clone");
    expect(searchJump(items, "comments")[0].to).toBe("/recruit/engage");
  });

  it("finds a page by the word in its own address", () => {
    expect(searchJump(items, "tutorial")[0].to).toBe("/tutorial");
    expect(searchJump(items, "swipe")[0].to).toBe("/swipe");
    expect(searchJump(items, "create guide")[0].to).toBe("/create-guide");
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
