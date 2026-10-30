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
    expect(searchJump(items, "plan my week")[0].to).toBe("/plan");
    expect(searchJump(items, "account")[0].to).toBe("/settings");
    expect(searchJump(items, "hashtags")[0].to).toBe("/trends");
    expect(searchJump(items, "trending")[0].to).toBe("/trends");
    expect(searchJump(items, "trending posts")[0].to).toBe("/swipe");
    expect(searchJump(items, "competitors")[0].to).toBe("/following");
    expect(searchJump(items, "request a feature")[0].to).toBe("/feedback");
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
    expect(searchJump(board, "settings")[0].group).toBe("Settings"); // the Settings section first, since 24 Oct 2026 it is one
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

describe("the format gallery", () => {
  const WORDS = ["formats", "make", "slideshow", "wall of text", "talking head", "green screen", "hook"];

  it("finds Formats for Leo by every word people use for it", () => {
    const leo = [...CREATE_ITEMS, ...pageItems("leotanjs95@gmail.com")];
    for (const q of WORDS) expect(searchJump(leo, q).map((i) => i.to), q).toContain("/make");
    expect(searchJump(leo, "formats")[0].to).toBe("/make");
    // Slideshow's own page still comes first for its own name
    expect(searchJump(leo, "slideshow")[0].to).toBe("/slideshow");
  });

  it("finds only Slideshow (on for everyone 30 Oct) for anyone else, and never offers Formats as a recent page", () => {
    const other = [...CREATE_ITEMS, ...pageItems("user@demo.com")];
    expect(other.map((i) => i.to)).not.toContain("/make");
    expect(searchJump(other, "slideshow").map((i) => i.to)).toEqual(["/slideshow"]);
    for (const q of WORDS) expect(searchJump(other, q).map((i) => i.to), q).not.toContain("/make");
    pushRecent("/make/slideshow");
    expect(loadRecent()).toEqual(["/make"]);
    expect(jumpList("user@demo.com", loadRecent(), "/home").map((i) => i.to)).not.toContain("/make");
    expect(jumpList("tanjunsing@gmail.com", loadRecent(), "/home")[0]).toMatchObject({ to: "/make", group: "Recent" });
  });
});

describe("Faces and voices", () => {
  it("finds it for Leo by face, voice and presenter, and for nobody else", () => {
    const leo = [...CREATE_ITEMS, ...pageItems("tanjunsing@gmail.com")];
    expect(searchJump(leo, "face")[0].to).toBe("/people");
    expect(searchJump(leo, "faces and voices")[0].to).toBe("/people");
    expect(searchJump(leo, "presenter")[0].to).toBe("/people");
    expect(searchJump(leo, "voice").map((i) => i.to)).toEqual(expect.arrayContaining(["/voice", "/people"]));
    const other = [...CREATE_ITEMS, ...pageItems("someone@example.com")];
    expect(other.map((i) => i.to)).not.toContain("/people");
    expect(searchJump(other, "face")).toEqual([]);
  });
});

describe("Campaigns, Ideas and Audiences", () => {
  it("finds them for Leo by the words people use, and for nobody else", () => {
    const leo = [...CREATE_ITEMS, ...pageItems("tanjunsing@gmail.com")];
    for (const q of ["campaign", "campaigns", "month", "angles"]) expect(searchJump(leo, q)[0].to, q).toBe("/campaigns");
    for (const q of ["ideas", "inbox", "shortlist", "daily ideas"]) expect(searchJump(leo, q)[0].to, q).toBe("/ideas");
    for (const q of ["audience", "audiences", "persona", "avatar", "who buys"]) expect(searchJump(leo, q)[0].to, q).toBe("/audiences");
    // the pages people already look for keep their place
    expect(searchJump(leo, "plan")[0].to).toBe("/plan");
    expect(searchJump(leo, "post ideas")[0].to).toBe("/inspiration");
    const other = [...CREATE_ITEMS, ...pageItems("someone@example.com")];
    for (const to of ["/campaigns", "/ideas", "/audiences"]) expect(other.map((i) => i.to)).not.toContain(to);
    expect(searchJump(other, "campaign")).toEqual([]);
    expect(searchJump(other, "ideas")[0].to).toBe("/inspiration");
  });
});

describe("Agent, Skills, Activity and Automations", () => {
  it("finds them for Leo by the words people use, and for nobody else", () => {
    const leo = [...CREATE_ITEMS, ...pageItems("tanjunsing@gmail.com")];
    for (const q of ["agent", "chat", "assistant"]) expect(searchJump(leo, q)[0].to, q).toBe("/agent");
    for (const q of ["skills", "slash", "shortcuts", "retro"]) expect(searchJump(leo, q)[0].to, q).toBe("/skills");
    for (const q of ["activity", "log", "what ran", "usage", "credits"]) expect(searchJump(leo, q)[0].to, q).toBe("/activity");
    for (const q of ["automations", "autopilot", "limits", "runs without you"]) expect(searchJump(leo, q)[0].to, q).toBe("/automations");
    // the pages people already look for keep their place
    expect(searchJump(leo, "schedule")[0].to).toBe("/calendar");
    expect(searchJump(leo, "history")[0].to).toBe("/drafts");
    expect(searchJump(leo, "make")[0].to).toBe("/make");
    expect(searchJump(leo, "connect claude")[0].to).toBe("/connect");
    const other = [...CREATE_ITEMS, ...pageItems("someone@example.com")];
    for (const to of ["/agent", "/skills", "/activity", "/automations"]) expect(other.map((i) => i.to)).not.toContain(to);
    expect(searchJump(other, "agent").map((i) => i.to)).toEqual(["/recruit/agent"]);
    expect(searchJump(other, "autopilot")).toEqual([]);
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
