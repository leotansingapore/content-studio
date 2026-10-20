import { describe, expect, it, vi } from "vitest";
import { mobileTabs, moreSheet, pageFor, pageTitle, section, SECTIONS, sectionFor, visiblePages } from "./nav";

const routes = [
  "/home", "/welcome", "/generate", "/generate/batch", "/carousel", "/slideshow", "/edit", "/plan", "/calendar", "/board",
  "/drafts", "/library", "/grid", "/reels", "/reels/team", "/recruit", "/recruit/conversations", "/recruit/agent", "/recruit/engage", "/recruit/auto-dm", "/coach", "/analytics", "/team",
  "/swipe", "/trends", "/clone", "/inspiration", "/profiles", "/following", "/playbook", "/voice", "/brand", "/bio", "/links", "/accounts", "/fads", "/connect",
  "/academy", "/create-guide", "/tutorial", "/feedback", "/north-star",
];

describe("nav", () => {
  it("files every studio route under exactly one page", () => {
    for (const r of routes) expect(pageFor(r)?.page.to, r).toBe(r);
    const listed = SECTIONS.flatMap((s) => s.pages.map((p) => p.to));
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("picks the most specific page and keeps detail routes in their section", () => {
    expect(pageFor("/generate/batch")?.page.label).toBe("Batch");
    expect(pageFor("/recruit/agent")?.page.label).toBe("AI agent");
    expect(sectionFor("/profiles/abc")?.id).toBe("discover");
    expect(sectionFor("/fads/positioning")?.id).toBe("playbook");
    expect(sectionFor("/links")?.id).toBe("playbook");
    expect(sectionFor("/t/report/abc")).toBeNull();
    expect(sectionFor("/hub/guides")).toBeNull();
    expect(sectionFor("/generated")).toBeNull();
  });

  it("names browser tabs after the page", () => {
    expect(pageTitle("/board")).toBe("Board - Content Studio");
    expect(pageTitle("/generate")).toBe("Write a post - Content Studio");
    expect(pageTitle("/nope")).toBe("Content Studio");
  });

  it("lights one phone tab per Pipeline page", () => {
    const lit = (p: string) => mobileTabs(false).filter((t) => t.active(p)).map((t) => t.label);
    expect(lit("/board")).toEqual(["Calendar"]);
    expect(lit("/grid")).toEqual(["Calendar"]);
    expect(lit("/drafts")).toEqual(["Posts"]);
    expect(lit("/carousel")).toEqual(["Write"]);
    expect(lit("/welcome")).toEqual(["Home"]);
    expect(lit("/swipe")).toEqual([]);
  });

  it("gives posts board users a board tab, with My posts under Calendar", () => {
    const tabs = mobileTabs(true);
    const lit = (p: string) => tabs.filter((t) => t.active(p)).map((t) => t.label);
    expect(tabs.map((t) => t.to)).toEqual(["/home", "/generate", "/calendar", "/reels"]);
    expect(lit("/reels")).toEqual(["Posts board"]);
    expect(lit("/reels/team")).toEqual(["Posts board"]);
    expect(lit("/drafts")).toEqual(["Calendar"]);
    expect(lit("/board")).toEqual(["Calendar"]);
    expect(sectionFor("/reels/team")?.id).toBe("board");
  });

  it("keeps bottom-bar pages and owner-only pages out of the More sheet", () => {
    const sheet = moreSheet("someone@example.com", false);
    const tos = [...sheet.singles, ...sheet.groups.flatMap((g) => g.tiles)].map((t) => t.to);
    for (const t of mobileTabs(false)) expect(tos).not.toContain(t.to);
    expect(tos).not.toContain("/reels");
    expect(sheet.singles.map((t) => t.label)).toEqual(["Getting started", "Recruit", "Playbook", "Learn", "Feedback"]);
    expect(sheet.groups.map((g) => g.label)).toEqual(["Improve", "Discover"]);
  });

  it("keeps the posts board, which the bar now holds, out of a board user's More sheet", () => {
    const store = new Map<string, string>([["cs-team-me", JSON.stringify({ owner: false, member: true, modules: ["reels"], at: Date.now() })]]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    const sheet = moreSheet("someone@example.com", true);
    const tos = [...sheet.singles, ...sheet.groups.flatMap((g) => g.tiles)].map((t) => t.to);
    for (const t of mobileTabs(true)) expect(tos).not.toContain(t.to);
    expect(tos).not.toContain("/reels/team");
    expect(sheet.singles.map((t) => t.label)).toEqual(["Getting started", "Recruit", "Playbook", "Learn", "Feedback"]);
    expect(visiblePages(section("board").pages, "someone@example.com").map((p) => p.to)).toEqual(["/reels"]);
    // Team follows the server's owner answer, not an email
    expect(visiblePages(section("board").pages, "tanjunsing@gmail.com").map((p) => p.to)).toEqual(["/reels"]);
    store.set("cs-team-me", JSON.stringify({ owner: true, member: false, at: Date.now() }));
    expect(visiblePages(section("board").pages, "someone@example.com").map((p) => p.to)).toEqual(["/reels", "/reels/team"]);
    vi.unstubAllGlobals();
  });

  it("shows Slideshow only to Leo's sign-ins", () => {
    const write = (email: string) => visiblePages(section("write").pages, email).map((p) => p.to);
    expect(write("someone@example.com")).not.toContain("/slideshow");
    expect(write("tanjunsing@gmail.com")).toContain("/slideshow");
  });

  it("shows Library only to Leo's sign-ins, after My posts", () => {
    const pipeline = (email: string) => visiblePages(section("pipeline").pages, email).map((p) => p.to);
    expect(pipeline("someone@example.com")).not.toContain("/library");
    expect(pipeline("leotanjs95@gmail.com")).toEqual(expect.arrayContaining(["/drafts", "/library"]));
    expect(pipeline("leotanjs95@gmail.com").indexOf("/library")).toBe(pipeline("leotanjs95@gmail.com").indexOf("/drafts") + 1);
    expect(pageFor("/library")?.page.label).toBe("Library");
  });

  it("shows Social accounts and Auto-DM only once the server has said it is switched on", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    const shown = () => ["playbook", "recruit"].flatMap((id) => visiblePages(section(id).pages, "someone@example.com").map((p) => p.to));
    expect(shown()).not.toContain("/accounts");
    expect(shown()).not.toContain("/recruit/auto-dm");
    store.set("cs-social-connect", JSON.stringify({ on: true, at: Date.now() }));
    expect(shown()).toContain("/accounts");
    expect(shown()).toContain("/recruit/auto-dm");
    store.set("cs-social-connect", JSON.stringify({ on: false, at: Date.now() }));
    expect(shown()).not.toContain("/accounts");
    expect(shown()).not.toContain("/recruit/auto-dm");
    vi.unstubAllGlobals();
  });
});
