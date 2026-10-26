import { describe, expect, it, vi } from "vitest";
import { mobileTabs, moreSheet, pageFor, pageTitle, section, SECTIONS, sectionFor, sectionTabs, visiblePages } from "./nav";

const routes = [
  "/home", "/welcome", "/generate", "/make", "/generate/batch", "/carousel", "/image", "/slideshow", "/edit", "/plan", "/calendar", "/board",
  "/drafts", "/library", "/grid", "/reels", "/reels/team", "/recruit", "/recruit/conversations", "/recruit/agent", "/recruit/engage", "/recruit/auto-dm", "/coach", "/analytics", "/team",
  "/swipe", "/trends", "/clone", "/inspiration", "/profiles", "/following", "/competitors", "/saved", "/playbook", "/voice", "/brand", "/people", "/bio", "/links", "/accounts", "/fads", "/connect",
  "/academy", "/create-guide", "/tutorial", "/feedback", "/north-star", "/campaigns", "/ideas", "/audiences",
  "/agent", "/skills", "/activity", "/automations", "/studio", "/settings",
];
const LEO = "tanjunsing@gmail.com";
const ANYONE = "someone@example.com";
const pages = (id: string, email: string) => visiblePages(section(id).pages, email).map((p) => p.to);
const labels = (t: { label: string }[]) => t.map((x) => x.label);

describe("nav", () => {
  it("files every studio route under exactly one page", () => {
    for (const r of routes) expect(pageFor(r)?.page.to, r).toBe(r);
    const listed = SECTIONS.flatMap((s) => s.pages.map((p) => p.to));
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("follows Fastlane's sidebar: its five plus Grow, with Brand, Learn, Feedback and Settings at the foot", () => {
    expect(SECTIONS.filter((s) => !s.foot).map((s) => s.label)).toEqual(["Home", "Strategy", "Studio", "Radar", "Grow", "Analytics"]);
    expect(SECTIONS.filter((s) => s.foot).map((s) => s.label)).toEqual(["Brand", "Learn", "Feedback", "Settings"]);
  });

  it("picks the most specific page and keeps detail routes in their section", () => {
    expect(pageFor("/generate/batch")?.page.label).toBe("Batch");
    expect(pageFor("/recruit/agent")?.page.label).toBe("AI agent");
    expect(sectionFor("/profiles/abc")?.id).toBe("find");
    expect(sectionFor("/fads/positioning")?.id).toBe("playbook");
    expect(sectionFor("/links")?.id).toBe("settings");
    expect(sectionFor("/calendar")?.id).toBe("plan");
    expect(sectionFor("/reels")?.id).toBe("write");
    expect(sectionFor("/reels/team")?.id).toBe("settings");
    expect(sectionFor("/people")?.id).toBe("write");
    expect(pageFor("/make/slideshow")?.page.to).toBe("/make");
    expect(pageFor("/campaigns/new")?.page.to).toBe("/campaigns");
    expect(pageFor("/agent/t1")?.page.to).toBe("/agent");
    expect(sectionFor("/t/report/abc")).toBeNull();
    expect(sectionFor("/hub/guides")).toBeNull();
    expect(sectionFor("/generated")).toBeNull();
  });

  it("names browser tabs after the page", () => {
    expect(pageTitle("/board")).toBe("Board - Content Studio");
    expect(pageTitle("/generate")).toBe("Write a post - Content Studio");
    expect(pageTitle("/library")).toBe("Library - Content Studio");
    for (const [to, title] of [["/agent", "Agent"], ["/skills", "Skills"], ["/campaigns", "Campaigns"], ["/people", "Faces and voices"], ["/make", "Formats"]]) {
      expect(pageTitle(to), to).toBe(`${title} - Content Studio`);
    }
    expect(pageTitle("/nope")).toBe("Content Studio");
  });

  it("shows owner-only pages to Leo's sign-ins only, and leaves everyone else's sections as they were", () => {
    expect(pages("home", ANYONE)).toEqual(["/home"]);
    expect(pages("plan", ANYONE)).toEqual(["/calendar", "/plan"]);
    expect(pages("write", ANYONE)).toEqual(["/studio", "/generate", "/generate/batch", "/carousel", "/edit", "/drafts", "/board", "/grid", "/media", "/team"]);
    expect(pages("find", ANYONE)).toEqual(["/swipe", "/trends", "/clone", "/inspiration", "/profiles", "/following"]);
    expect(pages("playbook", ANYONE)).toEqual(["/playbook", "/voice", "/brand", "/fads"]);
    expect(pages("settings", ANYONE)).toEqual(["/settings", "/bio", "/links", "/connect"]);
    for (const email of [LEO, "leotanjs95@gmail.com"]) {
      expect(pages("home", email), email).toEqual(["/home", "/agent", "/north-star"]);
      expect(pages("plan", email), email).toEqual(["/campaigns", "/calendar", "/plan", "/ideas"]);
      expect(pages("write", email).slice(0, 8), email).toEqual(["/studio", "/generate", "/make", "/generate/batch", "/carousel", "/image", "/slideshow", "/edit"]);
      expect(pages("write", email), email).toContain("/people");
      expect(pages("find", email).slice(6, 8), email).toEqual(["/competitors", "/saved"]);
      expect(pages("settings", email), email).toEqual(["/settings", "/bio", "/links", "/connect", "/activity", "/automations", "/skills"]);
    }
  });

  it("shows Social accounts and Auto-DM only once the server has said it is switched on", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    const shown = () => ["settings", "recruit"].flatMap((id) => pages(id, ANYONE));
    expect(shown()).not.toContain("/accounts");
    expect(shown()).not.toContain("/recruit/auto-dm");
    store.set("cs-social-connect", JSON.stringify({ on: true, at: Date.now() }));
    expect(shown()).toContain("/accounts");
    expect(shown()).toContain("/recruit/auto-dm");
    store.set("cs-social-connect", JSON.stringify({ on: false, at: Date.now() }));
    expect(shown()).not.toContain("/accounts");
    vi.unstubAllGlobals();
  });

  it("shows the posts board and Reviewers by the server's answer, not an email", () => {
    const store = new Map<string, string>([["cs-team-me", JSON.stringify({ owner: false, member: true, modules: ["reels"], at: Date.now() })]]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    expect(pages("write", ANYONE)).toContain("/reels");
    expect(pages("settings", LEO)).not.toContain("/reels/team");
    store.set("cs-team-me", JSON.stringify({ owner: true, member: false, at: Date.now() }));
    expect(pages("settings", ANYONE)).toEqual(["/settings", "/bio", "/links", "/connect", "/reels/team"]);
    vi.unstubAllGlobals();
  });

  describe("tab row", () => {
    it("lists a plain section's pages, the open one lit", () => {
      const { tabs, chips } = sectionTabs("/trends", ANYONE);
      expect(labels(tabs)).toEqual(["Top posts", "Trends", "Clone a reel", "Inspiration", "Creators", "Following"]);
      expect(tabs.filter((t) => t.active).map((t) => t.to)).toEqual(["/trends"]);
      expect(chips).toEqual([]);
      // a detail page has its own way back: no row over a creator, a campaign or a format; F.A.D.S.'s own tabs keep it
      for (const p of ["/profiles/abc", "/campaigns/new", "/campaigns/c1", "/make/slideshow", "/inspiration/i1"]) expect(sectionTabs(p, LEO), p).toEqual({ tabs: [], chips: [] });
      expect(sectionTabs("/fads/positioning", ANYONE).tabs.find((t) => t.active)?.to).toBe("/fads");
      expect(sectionTabs("/drafts/", ANYONE).tabs.find((t) => t.active)?.to).toBe("/drafts");
    });

    it("gives Studio its groups as tabs and the open group's pages as chips", () => {
      const leo = sectionTabs("/carousel", LEO);
      expect(labels(leo.tabs)).toEqual(["Overview", "Create", "Library", "Review", "Influencers"]);
      expect(leo.tabs.find((t) => t.active)?.label).toBe("Create");
      expect(labels(leo.chips)).toEqual(["Post", "Formats", "Batch", "Carousel", "Image", "Slideshow", "Video"]);
      expect(leo.chips.find((t) => t.active)?.to).toBe("/carousel");
      // each group tab opens the group's first page this sign-in sees
      expect(leo.tabs.map((t) => t.to)).toEqual(["/studio", "/generate", "/library", "/team", "/people"]);
      expect(sectionTabs("/grid", ANYONE).tabs.map((t) => t.to)).toEqual(["/studio", "/generate", "/drafts", "/team"]);
      expect(labels(sectionTabs("/grid", ANYONE).chips)).toEqual(["All posts", "Board", "Grid", "Media"]);
    });

    it("leaves out a row of one and gives bare pages none", () => {
      // Review without a posts board is Leader approvals alone: the tab, no chips
      const review = sectionTabs("/team", ANYONE);
      expect(review.tabs.find((t) => t.active)?.label).toBe("Review");
      expect(review.chips).toEqual([]);
      expect(sectionTabs("/feedback", ANYONE)).toEqual({ tabs: [], chips: [] });
      for (const p of ["/home", "/agent/t1", "/north-star"]) expect(sectionTabs(p, LEO), p).toEqual({ tabs: [], chips: [] });
      expect(labels(sectionTabs("/welcome", ANYONE).tabs)).toEqual(["Getting started", "Academy", "How to post", "How the studio works"]);
      expect(sectionTabs("/nope", LEO)).toEqual({ tabs: [], chips: [] });
    });
  });

  it("lists Settings as tiles, its pages leading back to it instead of tabs", () => {
    expect(sectionTabs("/settings", ANYONE)).toEqual({ tabs: [], chips: [] });
    for (const p of ["/connect", "/links", "/reels/team", "/skills"]) expect(sectionTabs(p, LEO).back, p).toEqual({ to: "/settings", label: "Settings", active: false });
    expect(section("settings").pages.slice(1).every((p) => p.hint && p.hint.split(" ").length <= 12)).toBe(true);
  });

  it("puts Fastlane's bar on the phone: Home, Strategy, then the agent's chats or Studio, and lights one per page", () => {
    expect(mobileTabs(ANYONE).map((t) => [t.label, t.to])).toEqual([["Home", "/home"], ["Strategy", "/calendar"], ["Studio", "/studio"]]);
    expect(mobileTabs(LEO).map((t) => [t.label, t.to])).toEqual([["Home", "/home"], ["Strategy", "/campaigns"], ["Chats", "/agent?panel=chats"]]);
    const lit = (p: string, email = ANYONE) => mobileTabs(email).filter((t) => t.active(p)).map((t) => t.label);
    expect(lit("/calendar")).toEqual(["Strategy"]);
    expect(lit("/drafts")).toEqual(["Studio"]);
    expect(lit("/studio")).toEqual(["Studio"]);
    expect(lit("/make/slideshow")).toEqual(["Studio"]);
    expect(lit("/welcome")).toEqual([]);
    expect(lit("/profiles/abc")).toEqual([]);
    // the agent's chats light Chats, not Home, for those who have them
    expect(lit("/agent/t1", LEO)).toEqual(["Chats"]);
    expect(lit("/agent", LEO)).toEqual(["Chats"]);
    expect(lit("/home", LEO)).toEqual(["Home"]);
    expect(lit("/studio", LEO)).toEqual([]);
  });

  it("gives the More sheet one tile per other section, opening the first page this sign-in sees", () => {
    expect(moreSheet(ANYONE).map((t) => [t.label, t.to])).toEqual([
      ["Radar", "/swipe"], ["Grow", "/recruit"], ["Analytics", "/analytics"], ["Brand", "/playbook"], ["Learn", "/welcome"], ["Feedback", "/feedback"], ["Settings", "/settings"],
    ]);
    // the agent's sign-ins have Chats in the bar, so Studio moves into More
    expect(moreSheet(LEO).map((t) => t.label)).toEqual(["Studio", "Radar", "Grow", "Analytics", "Brand", "Learn", "Feedback", "Settings"]);
  });
});
