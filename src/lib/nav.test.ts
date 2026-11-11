import { describe, expect, it, vi } from "vitest";
import { groupedPages, mobileTabs, moreSheet, pageFor, pageTitle, section, sectionHref, SECTIONS, SETTINGS_ANCHORS, sectionFor, sectionTabs, settingsTiles, visiblePages } from "./nav";

const routes = [
  "/home", "/welcome", "/generate", "/make", "/generate/batch", "/generate/answer", "/generate/vsl", "/script", "/carousel", "/image", "/slideshow", "/edit", "/plan", "/calendar", "/board",
  "/drafts", "/library", "/grid", "/reels", "/reels/team", "/recruit", "/recruit/conversations", "/recruit/agent", "/recruit/engage", "/recruit/auto-dm", "/coach", "/analytics", "/team",
  "/swipe", "/carousels", "/working", "/trends", "/clone", "/research", "/inspiration", "/profiles", "/following", "/competitors", "/saved", "/playbook", "/voice", "/brand", "/people", "/bio", "/links", "/accounts", "/fads", "/connect",
  "/academy", "/create-guide", "/tutorial", "/feedback", "/north-star", "/campaigns", "/ideas", "/social-north-star", "/audiences",
  "/agent", "/skills", "/activity", "/automations", "/studio", "/settings", "/notifications", "/settings/post-choices", "/adlauncher", "/blitz",
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

  it("reopens a section where you left it, and takes you to its first page when you are already in it", () => {
    const studio = section("write");
    expect(sectionHref(studio, ANYONE, "find", "/design/campaigns/c1")).toBe("/design/campaigns/c1");
    // a tap from a detail page is never a dead tap
    expect(sectionHref(studio, ANYONE, "write", "/design/campaigns/c1")).toBe("/studio");
    expect(sectionHref(studio, ANYONE, "find", undefined)).toBe("/studio");
    expect(sectionHref(section("plan"), LEO, "home", undefined)).toBe("/campaigns");
    expect(sectionHref(section("plan"), ANYONE, "home", undefined)).toBe("/calendar");
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
    expect(pageTitle("/board")).toBe("Board - Postmosis");
    expect(pageTitle("/generate")).toBe("Write a post - Postmosis");
    expect(pageTitle("/library")).toBe("Library - Postmosis");
    for (const [to, title] of [["/agent", "Agent"], ["/skills", "Skills"], ["/campaigns", "Campaigns"], ["/people", "Faces and voices"], ["/make", "Formats"], ["/blitz", "Blitz"]]) {
      expect(pageTitle(to), to).toBe(`${title} - Postmosis`);
    }
    expect(pageTitle("/nope")).toBe("Postmosis");
  });

  it("shows owner-only pages to Leo's sign-ins only, and leaves everyone else's sections as they were", () => {
    expect(pages("home", ANYONE)).toEqual(["/home"]);
    expect(pages("plan", ANYONE)).toEqual(["/calendar", "/plan", "/launch", "/linkedin"]);
    expect(pages("write", ANYONE)).toEqual(["/studio", "/carousel", "/edit", "/make/hook-demo", "/generate", "/generate/batch", "/generate/answer", "/generate/vsl", "/hooks", "/library", "/drafts", "/board", "/grid", "/media", "/slideshow", "/design", "/design/campaigns", "/design/libraries", "/team"]);
    expect(pages("find", ANYONE)).toEqual(["/swipe", "/carousels", "/working", "/trends", "/inspiration", "/following", "/profiles", "/clone"]);
    expect(pages("playbook", ANYONE)).toEqual(["/playbook", "/voice", "/brand", "/fads"]);
    expect(pages("settings", ANYONE)).toEqual(["/settings", "/notifications", "/settings/post-choices", "/bio", "/links", "/connect"]);
    for (const email of [LEO, "leotanjs95@gmail.com"]) {
      expect(pages("home", email), email).toEqual(["/home", "/agent", "/north-star"]);
      expect(pages("plan", email), email).toEqual(["/campaigns", "/calendar", "/plan", "/launch", "/linkedin", "/ideas", "/social-north-star"]);
      expect(pages("write", email).slice(0, 13), email).toEqual(["/studio", "/make", "/carousel", "/image", "/edit", "/make/hook-demo", "/generate", "/generate/batch", "/generate/answer", "/generate/vsl", "/hooks", "/script", "/library"]);
      expect(pages("write", email).slice(17, 19), email).toEqual(["/blitz", "/people"]);
      expect(pages("find", email).slice(5), email).toEqual(["/following", "/profiles", "/research", "/clone", "/saved"]);
      expect(pages("playbook", email), email).toEqual(["/playbook", "/voice", "/brand", "/audiences", "/competitors", "/fads"]);
      expect(pages("settings", email), email).toEqual(["/settings", "/notifications", "/settings/post-choices", "/bio", "/links", "/connect", "/adlauncher", "/automations", "/activity", "/skills"]);
    }
  });

  it("shows Social accounts only once the server has said it is switched on, and Auto-DM only to Leo as well", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    const shown = (email = ANYONE) => ["settings", "recruit"].flatMap((id) => pages(id, email));
    expect(shown()).not.toContain("/accounts");
    expect(shown(LEO)).not.toContain("/recruit/auto-dm");
    store.set("cs-social-connect", JSON.stringify({ on: true, at: Date.now() }));
    expect(shown()).toContain("/accounts");
    // posting switched on for a customer never opens Auto-DM
    expect(shown()).not.toContain("/recruit/auto-dm");
    expect(shown(LEO)).toContain("/recruit/auto-dm");
    store.set("cs-social-connect", JSON.stringify({ on: false, at: Date.now() }));
    expect(shown()).not.toContain("/accounts");
    expect(shown(LEO)).not.toContain("/recruit/auto-dm");
    vi.unstubAllGlobals();
  });

  it("shows the posts board and Reviewers by the server's answer, not an email", () => {
    const store = new Map<string, string>([["cs-team-me", JSON.stringify({ owner: false, member: true, modules: ["reels"], at: Date.now() })]]);
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    expect(pages("write", ANYONE)).toContain("/reels");
    expect(pages("settings", LEO)).not.toContain("/reels/team");
    store.set("cs-team-me", JSON.stringify({ owner: true, member: false, at: Date.now() }));
    expect(pages("settings", ANYONE)).toEqual(["/settings", "/notifications", "/settings/post-choices", "/bio", "/links", "/connect", "/reels/team"]);
    vi.unstubAllGlobals();
  });

  describe("tab row", () => {
    it("lists a plain section's pages, the open one lit", () => {
      const { tabs, chips } = sectionTabs("/launch", ANYONE);
      expect(labels(tabs)).toEqual(["Calendar", "Plan", "Launch", "LinkedIn"]);
      expect(tabs.filter((t) => t.active).map((t) => t.to)).toEqual(["/launch"]);
      expect(chips).toEqual([]);
      // a detail page has its own way back: no row over a creator, a campaign or a format; F.A.D.S.'s own tabs keep it
      for (const p of ["/profiles/abc", "/campaigns/new", "/campaigns/c1", "/make/slideshow", "/inspiration/i1", "/carousels/c1", "/working/7412345678901234567", "/design/campaigns/c1", "/design/d1"]) expect(sectionTabs(p, LEO), p).toEqual({ tabs: [], chips: [] });
      expect(sectionTabs("/fads/positioning", ANYONE).tabs.find((t) => t.active)?.to).toBe("/fads");
      // the Library tab is lit on My posts and opens Everything, its first page (everyone since 6 Nov)
      expect(sectionTabs("/drafts/", ANYONE).tabs.find((t) => t.active)?.to).toBe("/library");
    });

    it("gives Studio its groups as tabs and the open group's pages as chips", () => {
      const leo = sectionTabs("/carousel", LEO);
      // Fastlane's five in its order (Leo 11 Nov) with Write beside Create, then ours
      expect(labels(leo.tabs)).toEqual(["Overview", "Create", "Write", "Library", "Blitz", "Influencers", "Slideshows", "Approvals"]);
      expect(leo.tabs.find((t) => t.active)?.label).toBe("Create");
      // Create is what you look at, Write is words: no row holds more than six
      expect(labels(leo.chips)).toEqual(["All formats", "Carousel", "Image", "Video", "Hook + demo"]);
      expect(leo.chips.find((t) => t.active)?.to).toBe("/carousel");
      const write = sectionTabs("/generate/batch", LEO);
      expect(write.tabs.find((t) => t.active)?.label).toBe("Write");
      expect(labels(write.chips)).toEqual(["Post", "Batch", "Answer", "VSL", "Hooks", "Script"]);
      expect(labels(sectionTabs("/generate", ANYONE).chips)).toEqual(["Post", "Batch", "Answer", "VSL", "Hooks"]);
      for (const email of [LEO, ANYONE]) for (const p of pages("write", email)) expect(sectionTabs(p, email).chips.length, p).toBeLessThanOrEqual(6);
      // each group tab opens the group's first page this sign-in sees: Leo's Create the whole catalogue, everyone else's Create is Carousel
      expect(leo.tabs.map((t) => t.to)).toEqual(["/studio", "/make", "/generate", "/library", "/blitz", "/people", "/slideshow", "/team"]);
      // without the catalogue, Write comes first: the first maker everyone else reaches is still Post
      expect(labels(sectionTabs("/grid", ANYONE).tabs)).toEqual(["Overview", "Write", "Create", "Library", "Slideshows", "Approvals"]);
      expect(sectionTabs("/grid", ANYONE).tabs.map((t) => t.to)).toEqual(["/studio", "/generate", "/carousel", "/library", "/slideshow", "/team"]);
      expect(sectionTabs("/carousel", ANYONE).tabs.find((t) => t.active)?.label).toBe("Create");
      expect(sectionTabs("/blitz", LEO).tabs.find((t) => t.active)?.label).toBe("Blitz");
      expect(sectionTabs("/people", LEO).tabs.find((t) => t.active)?.label).toBe("Influencers");
      // the slideshow tools are their own tab, so its Campaigns never sit beside Post and Video
      const slides = sectionTabs("/design/campaigns", ANYONE);
      expect(slides.tabs.find((t) => t.active)?.label).toBe("Slideshows");
      expect(labels(slides.chips)).toEqual(["Slideshow", "Design", "Campaigns", "Libraries"]);
      expect(labels(sectionTabs("/grid", ANYONE).chips)).toEqual(["Everything", "All posts", "Board", "Grid", "Media"]);
    });

    it("gives Radar four tabs, so its row never runs off the page", () => {
      const leo = sectionTabs("/trends", LEO);
      expect(labels(leo.tabs)).toEqual(["Posts", "Creators", "Remix", "Saved"]);
      expect(leo.tabs.map((t) => t.to)).toEqual(["/swipe", "/following", "/clone", "/saved"]);
      expect(leo.tabs.find((t) => t.active)?.label).toBe("Posts");
      expect(labels(leo.chips)).toEqual(["Top posts", "Carousels", "What's working", "Trends", "Inspiration"]);
      expect(labels(sectionTabs("/research", LEO).chips)).toEqual(["Following", "Creators", "Research"]);
      // Competitors is a Brand tab on Leo's sign-ins, and its detail addresses stay in Brand
      expect(labels(sectionTabs("/competitors", LEO).tabs)).toEqual(["My Playbook", "Your voice", "Brand kit", "Audiences", "Competitors", "F.A.D.S."]);
      expect(sectionFor("/competitors/c1")?.id).toBe("playbook");
      const anyone = sectionTabs("/following", ANYONE);
      expect(labels(anyone.tabs)).toEqual(["Posts", "Creators", "Remix"]);
      expect(labels(anyone.chips)).toEqual(["Following", "Creators"]);
      // a tab of one page has no chips under it
      expect(sectionTabs("/clone", ANYONE).chips).toEqual([]);
      expect(sectionTabs("/clone", ANYONE).tabs.find((t) => t.active)?.label).toBe("Remix");
      for (const email of [LEO, ANYONE]) for (const p of pages("find", email)) expect(Math.max(sectionTabs(p, email).tabs.length, sectionTabs(p, email).chips.length), p).toBeLessThanOrEqual(6);
    });

    it("leaves out a row of one and gives bare pages none", () => {
      // Review without a posts board is Leader approvals alone: the tab, no chips
      const review = sectionTabs("/team", ANYONE);
      expect(review.tabs.find((t) => t.active)?.label).toBe("Approvals");
      expect(review.chips).toEqual([]);
      expect(sectionTabs("/feedback", ANYONE)).toEqual({ tabs: [], chips: [] });
      for (const p of ["/home", "/agent/t1", "/north-star"]) expect(sectionTabs(p, LEO), p).toEqual({ tabs: [], chips: [] });
      expect(labels(sectionTabs("/welcome", ANYONE).tabs)).toEqual(["Getting started", "Academy", "How to post", "How the studio works"]);
      expect(sectionTabs("/nope", LEO)).toEqual({ tabs: [], chips: [] });
    });
  });

  it("lists Settings as tiles, its pages leading back to it instead of tabs", () => {
    expect(sectionTabs("/settings", ANYONE)).toEqual({ tabs: [], chips: [] });
    for (const p of ["/notifications", "/connect", "/links", "/reels/team", "/skills", "/adlauncher"]) expect(sectionTabs(p, LEO).back, p).toEqual({ to: "/settings", label: "Settings", active: false });
    expect(section("settings").pages.slice(1).every((p) => p.hint && p.hint.split(" ").length <= 12)).toBe(true);
    // Post labels and Language are sections of Post choices with tiles of their own, Language on Leo's sign-ins only
    const tiles = (email: string) => settingsTiles(visiblePages(groupedPages(section("settings").pages.slice(1)), email), email);
    expect(tiles(ANYONE).map((t) => t.to).slice(0, 4)).toEqual(["/notifications", "/settings/post-choices", "/settings/post-choices#labels", "/bio"]);
    expect(tiles(LEO).map((t) => [t.label, t.group]).slice(1, 4)).toEqual([["Post choices", "You"], ["Post labels", "You"], ["Language", "You"]]);
    expect(SETTINGS_ANCHORS.every((a) => a.hint.split(" ").length <= 12 && pageFor(a.page)?.page.to === a.page)).toBe(true);
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
