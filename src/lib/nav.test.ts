import { describe, expect, it, vi } from "vitest";
import { MOBILE_TABS, moreSheet, pageFor, pageTitle, section, SECTIONS, sectionFor, visiblePages } from "./nav";

const routes = [
  "/home", "/welcome", "/generate", "/generate/batch", "/carousel", "/edit", "/plan", "/calendar", "/board",
  "/drafts", "/grid", "/reels", "/recruit", "/recruit/conversations", "/recruit/agent", "/recruit/engage", "/recruit/auto-dm", "/coach", "/analytics", "/team",
  "/swipe", "/trends", "/clone", "/inspiration", "/profiles", "/following", "/playbook", "/voice", "/brand", "/bio", "/accounts", "/fads", "/connect",
  "/academy", "/create-guide", "/tutorial", "/feedback",
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
    expect(sectionFor("/hub/guides")).toBeNull();
    expect(sectionFor("/generated")).toBeNull();
  });

  it("names browser tabs after the page", () => {
    expect(pageTitle("/board")).toBe("Board - Content Studio");
    expect(pageTitle("/generate")).toBe("Write a post - Content Studio");
    expect(pageTitle("/nope")).toBe("Content Studio");
  });

  it("lights one phone tab per Pipeline page", () => {
    const lit = (p: string) => MOBILE_TABS.filter((t) => t.active(p)).map((t) => t.label);
    expect(lit("/board")).toEqual(["Calendar"]);
    expect(lit("/grid")).toEqual(["Calendar"]);
    expect(lit("/drafts")).toEqual(["Posts"]);
    expect(lit("/carousel")).toEqual(["Write"]);
    expect(lit("/welcome")).toEqual(["Home"]);
    expect(lit("/swipe")).toEqual([]);
  });

  it("keeps bottom-bar pages and owner-only pages out of the More sheet", () => {
    const sheet = moreSheet("someone@example.com");
    const tos = [...sheet.singles, ...sheet.groups.flatMap((g) => g.tiles)].map((t) => t.to);
    for (const t of MOBILE_TABS) expect(tos).not.toContain(t.to);
    expect(tos).not.toContain("/reels");
    expect(sheet.singles.map((t) => t.label)).toEqual(["Getting started", "Recruit", "Playbook", "Learn", "Feedback"]);
    expect(sheet.groups.map((g) => g.label)).toEqual(["Improve", "Discover"]);
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
