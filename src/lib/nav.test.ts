import { describe, expect, it, vi } from "vitest";
import { groupedPages, MAX_TABS, mobileTabs, moreSheet, pageFor, pageTitle, section, sectionHref, SECTIONS, SETTINGS_ANCHORS, sectionFor, sectionTabs, settingsTiles, visiblePages } from "./nav";

// Every address the nav listed before the overhaul (11 Nov, 87 entries with Settings' index). None may fall out.
const OLD_PATHS = [
  "/home", "/agent", "/north-star",
  "/campaigns", "/calendar", "/plan", "/launch", "/linkedin", "/ideas", "/social-north-star",
  "/studio", "/make", "/carousel", "/image", "/edit", "/make/hook-demo", "/generate", "/generate/batch", "/generate/answer", "/generate/vsl", "/hooks", "/script",
  "/library", "/drafts", "/board", "/grid", "/media", "/blitz", "/people", "/slideshow", "/design", "/design/campaigns", "/design/libraries", "/reels", "/team",
  "/swipe", "/carousels", "/working", "/trends", "/inspiration", "/following", "/profiles", "/research", "/clone", "/saved", "/market",
  "/recruit", "/recruit/conversations", "/recruit/agent", "/recruit/engage", "/recruit/auto-dm",
  "/analytics", "/coach",
  "/playbook", "/voice", "/brand", "/audiences", "/competitors", "/fads",
  "/welcome", "/academy", "/create-guide", "/tutorial", "/feedback",
  "/settings", "/notifications", "/settings/post-choices", "/accounts", "/bio", "/links", "/connect", "/adlauncher", "/reels/team", "/automations", "/activity", "/skills",
];
// Pages the nav gained since: Brand's Products and Demo videos tabs (sections of the brand kit drawn alone, 12 Nov).
const NEW_PATHS = ["/brand/products", "/brand/demo-videos", "/settings/billing"];
const LEO = "tanjunsing@gmail.com";
const ANYONE = "someone@example.com";
const pages = (id: string, email: string) => visiblePages(section(id).pages, email).map((p) => p.to);
const labels = (t: { label: string }[]) => t.map((x) => x.label);
/** Every page shown: the server's switches on, an adviser brand open. */
const everythingOn = () => {
  const store = new Map<string, string>([
    ["cs-social-connect", JSON.stringify({ on: true, at: Date.now() })],
    ["cs-team-me", JSON.stringify({ owner: true, member: true, modules: ["reels"], at: Date.now() })],
  ]);
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
};

describe("nav", () => {
  it("keeps every address the nav had before the overhaul, each under exactly one page", () => {
    for (const r of OLD_PATHS) expect(pageFor(r)?.page.to, r).toBe(r);
    const listed = SECTIONS.flatMap((s) => s.pages.map((p) => p.to));
    expect(new Set(listed).size).toBe(listed.length);
    // and adds only the pages named since
    expect([...listed].sort()).toEqual([...OLD_PATHS, ...NEW_PATHS].sort());
  });

  it("lists Fastlane's six places in its order, with Settings under the workspace card", () => {
    expect(SECTIONS.filter((s) => !s.foot).map((s) => s.label)).toEqual(["Home", "Campaigns", "Studio", "Brand", "Competitor Radar", "Analytics"]);
    expect(SECTIONS.filter((s) => s.foot).map((s) => s.label)).toEqual(["Settings"]);
  });

  it("shows no sign-in more than five tabs in a section, with every switch on or off", () => {
    const check = () => {
      for (const email of [LEO, ANYONE])
        for (const s of SECTIONS)
          for (const p of visiblePages(s.pages, email)) {
            const t = sectionTabs(p.to, email);
            expect(t.tabs.length, `${p.to} for ${email}`).toBeLessThanOrEqual(MAX_TABS);
            // one open tab, and the open page ticked in its picker
            if (t.tabs.length) expect(t.tabs.filter((x) => x.active).length, p.to).toBe(1);
            if (t.picker.length) expect(t.picker.filter((x) => x.active).map((x) => x.to), p.to).toEqual([p.to]);
          }
    };
    check();
    everythingOn();
    check();
    vi.unstubAllGlobals();
  });

  it("names pages in one or two plain words, three at most", () => {
    for (const s of SECTIONS) for (const p of s.pages) expect(p.label.split(" ").length, p.label).toBeLessThanOrEqual(4);
    const names = SECTIONS.flatMap((s) => s.pages.flatMap((p) => [p.label, p.group ?? ""])).join(" | ");
    for (const old of ["F.A.D.S.", "Brand Brain", "VSL", "My Playbook"]) expect(names).not.toContain(old);
  });

  it("reopens a section where you left it, and takes you to its first page when you are already in it", () => {
    const create = section("write");
    expect(sectionHref(create, ANYONE, "plan", "/design/campaigns/c1")).toBe("/design/campaigns/c1");
    // a tap from a detail page is never a dead tap
    expect(sectionHref(create, ANYONE, "write", "/design/campaigns/c1")).toBe("/studio");
    expect(sectionHref(create, ANYONE, "plan", undefined)).toBe("/studio");
    expect(sectionHref(section("plan"), LEO, "home", undefined)).toBe("/campaigns");
    expect(sectionHref(section("plan"), ANYONE, "home", undefined)).toBe("/calendar");
  });

  it("picks the most specific page and keeps detail routes in their section", () => {
    expect(pageFor("/generate/batch")?.page.label).toBe("Weekly batch");
    expect(pageFor("/recruit/agent")?.page.label).toBe("Reply agent");
    expect(sectionFor("/profiles/abc")?.id).toBe("find");
    expect(sectionFor("/swipe")?.id).toBe("find");
    expect(sectionFor("/recruit/engage")?.id).toBe("analytics");
    expect(sectionFor("/drafts")?.id).toBe("write");
    expect(sectionFor("/team")?.id).toBe("plan");
    expect(sectionFor("/fads/positioning")?.id).toBe("playbook");
    expect(pageFor("/brand/products")?.page.label).toBe("Products");
    expect(pageFor("/brand")?.page.label).toBe("Brand kit");
    expect(sectionFor("/links")?.id).toBe("settings");
    expect(sectionFor("/calendar")?.id).toBe("plan");
    expect(sectionFor("/reels")?.id).toBe("plan");
    expect(sectionFor("/reels/team")?.id).toBe("settings");
    expect(sectionFor("/people")?.id).toBe("write");
    expect(sectionFor("/competitors/c1")?.id).toBe("playbook");
    expect(sectionFor("/media")?.id).toBe("playbook");
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
    for (const [to, title] of [["/agent", "Agent"], ["/skills", "Skills"], ["/campaigns", "Campaigns"], ["/people", "Faces and voices"], ["/make", "Formats"], ["/blitz", "Blitz"], ["/studio", "Studio"], ["/analytics", "Analytics"]]) {
      expect(pageTitle(to), to).toBe(`${title} - Postmosis`);
    }
    expect(pageTitle("/nope")).toBe("Postmosis");
  });

  it("shows owner-only pages to Leo's sign-ins only", () => {
    expect(pages("home", ANYONE)).toEqual(["/home"]);
    expect(pages("write", ANYONE)).toEqual(["/studio", "/generate", "/generate/batch", "/generate/answer", "/generate/vsl", "/hooks", "/carousel", "/slideshow", "/design", "/design/campaigns", "/design/libraries", "/edit", "/make/hook-demo", "/clone", "/library", "/drafts", "/board", "/grid"]);
    expect(pages("plan", ANYONE)).toEqual(["/calendar", "/plan", "/launch", "/linkedin", "/team"]);
    expect(pages("find", ANYONE)).toEqual(["/swipe", "/carousels", "/working", "/trends", "/inspiration", "/following", "/profiles"]);
    expect(pages("analytics", ANYONE)).toEqual(["/analytics", "/coach", "/recruit", "/recruit/conversations", "/recruit/agent", "/recruit/engage"]);
    expect(pages("playbook", ANYONE)).toEqual(["/playbook", "/voice", "/brand", "/fads", "/media"]);
    expect(pages("settings", ANYONE)).toEqual(["/settings", "/notifications", "/settings/post-choices", "/bio", "/links", "/connect", "/welcome", "/academy", "/create-guide", "/tutorial", "/feedback"]);
    // the gates are the ones each page had before: these and no others are Leo's
    const leoOnly = SECTIONS.flatMap((s) => s.pages.filter((p) => p.owners).map((p) => p.to)).sort();
    expect(leoOnly).toEqual(["/activity", "/adlauncher", "/agent", "/audiences", "/automations", "/blitz", "/brand/demo-videos", "/brand/products", "/campaigns", "/competitors", "/ideas", "/image", "/make", "/north-star", "/people", "/recruit/auto-dm", "/research", "/saved", "/script", "/skills", "/social-north-star"]);
    for (const email of [LEO, "leotanjs95@gmail.com"]) {
      expect(pages("home", email), email).toEqual(["/home", "/agent", "/north-star"]);
      expect(pages("plan", email), email).toEqual(["/campaigns", "/calendar", "/plan", "/launch", "/linkedin", "/social-north-star", "/ideas", "/team"]);
      expect(pages("write", email).slice(0, 2), email).toEqual(["/studio", "/make"]);
      expect(pages("write", email).slice(-2), email).toEqual(["/blitz", "/people"]);
    }
  });

  it("shows Social accounts only once the server has said it is switched on, and Auto-DM only to Leo as well", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    const shown = (email = ANYONE) => ["settings", "analytics"].flatMap((id) => pages(id, email));
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
    expect(pages("plan", ANYONE)).toContain("/reels");
    expect(pages("settings", LEO)).not.toContain("/reels/team");
    store.set("cs-team-me", JSON.stringify({ owner: true, member: false, at: Date.now() }));
    expect(pages("settings", ANYONE)).toContain("/reels/team");
    vi.unstubAllGlobals();
  });

  describe("tab row", () => {
    it("gives Studio Fastlane's tabs, every maker in Create's picker under its kind", () => {
      const leo = sectionTabs("/carousel", LEO);
      expect(labels(leo.tabs)).toEqual(["Overview", "Create", "Library", "Blitz", "Faces and voices"]);
      expect(leo.tabs.map((t) => t.to)).toEqual(["/studio", "/make", "/library", "/blitz", "/people"]);
      expect(leo.tabs.find((t) => t.active)?.label).toBe("Create");
      expect(labels(leo.picker)).toEqual([
        "All formats", "Post", "Weekly batch", "Answer", "Sales script", "Hooks", "Script",
        "Carousel", "Slideshow", "Design", "Auto slideshows", "Picture sets", "Image", "Video editor", "Hook + demo", "Remix a post",
      ]);
      expect(leo.picker.filter((t) => t.head).map((t) => [t.head, t.label])).toEqual([["Words", "Post"], ["Slides and pictures", "Carousel"], ["Video", "Video editor"]]);
      // everyone else's Create opens on Post, the first maker they reach; their Studio is three tabs
      const anyone = sectionTabs("/generate/batch", ANYONE);
      expect(labels(anyone.tabs)).toEqual(["Overview", "Create", "Library"]);
      expect(anyone.tabs.map((t) => t.to)).toEqual(["/studio", "/generate", "/library"]);
      expect(anyone.picker.find((t) => t.active)?.to).toBe("/generate/batch");
      expect(labels(sectionTabs("/clone", ANYONE).picker).slice(-3)).toEqual(["Video editor", "Hook + demo", "Clone a reel"]);
      // the first screen has no picker; the Library's four views switch on the page (LibraryViews)
      expect(sectionTabs("/studio", LEO).picker).toEqual([]);
      const lib = sectionTabs("/drafts/", ANYONE);
      expect(lib.tabs.find((t) => t.active)?.to).toBe("/library");
      expect(labels(lib.picker)).toEqual(["Everything", "All posts", "Board", "Grid"]);
      expect(sectionTabs("/blitz", LEO).picker).toEqual([]);
    });

    it("names a tab after its page when it holds one, and after the job when it holds several", () => {
      // Campaigns: Fastlane's Campaigns and Calendar, then plans, ideas and the posts waiting for a yes
      expect(labels(sectionTabs("/calendar", LEO).tabs)).toEqual(["Campaigns", "Calendar", "Plans", "Ideas", "Leader approvals"]);
      expect(labels(sectionTabs("/launch", ANYONE).tabs)).toEqual(["Calendar", "Plans", "Leader approvals"]);
      expect(labels(sectionTabs("/launch", ANYONE).picker)).toEqual(["Weekly plan", "Launch plan", "LinkedIn"]);
      // Competitor Radar: what Radar held
      const radar = sectionTabs("/trends", LEO);
      expect(labels(radar.tabs)).toEqual(["Find posts", "Creators", "Saved"]);
      expect(radar.tabs.map((t) => t.to)).toEqual(["/swipe", "/following", "/saved"]);
      expect(labels(radar.picker)).toEqual(["Top posts", "Carousels", "What's working", "Trends", "Inspiration"]);
      expect(labels(sectionTabs("/research", LEO).picker)).toEqual(["Following", "Creators to follow", "Research"]);
      expect(labels(sectionTabs("/following", ANYONE).tabs)).toEqual(["Find posts", "Creators"]);
      // Analytics: results, coach, and the recruit kit on an adviser brand
      expect(labels(sectionTabs("/coach", ANYONE).tabs)).toEqual(["Results", "Coach", "Recruit"]);
      expect(labels(sectionTabs("/recruit/engage", ANYONE).picker)).toEqual(["Recruit kit", "Conversations", "Reply agent", "Reply drafts"]);
      // Brand: Fastlane's tabs. Profile holds what sets it (Voice, Brand kit, Audiences, Positioning) in its picker
      expect(labels(sectionTabs("/voice", LEO).tabs)).toEqual(["Profile", "Products", "Competitors", "Demo videos", "Media"]);
      expect(sectionTabs("/voice", LEO).tabs.map((t) => t.to)).toEqual(["/playbook", "/brand/products", "/competitors", "/brand/demo-videos", "/media"]);
      expect(labels(sectionTabs("/audiences", LEO).picker)).toEqual(["Profile", "Your voice", "Brand kit", "Audiences", "Positioning"]);
      expect(sectionTabs("/brand/products", LEO).tabs.find((t) => t.active)?.label).toBe("Products");
      expect(sectionTabs("/brand/products", LEO).picker).toEqual([]);
      // everyone else: Profile, with every page they can open in its picker, and Media
      expect(labels(sectionTabs("/voice", ANYONE).tabs)).toEqual(["Profile", "Media"]);
      expect(labels(sectionTabs("/media", ANYONE).tabs)).toEqual(["Profile", "Media"]);
      expect(sectionTabs("/media", ANYONE).picker).toEqual([]);
      expect(labels(sectionTabs("/brand", ANYONE).picker)).toEqual(["Profile", "Your voice", "Brand kit", "Positioning"]);
      // a page of Positioning's own tabs keeps the row, its picker ticking Positioning
      expect(sectionTabs("/fads/positioning", ANYONE).tabs.find((t) => t.active)?.label).toBe("Profile");
      expect(sectionTabs("/fads/positioning", ANYONE).picker.find((t) => t.active)?.to).toBe("/fads");
    });

    it("gives bare pages, detail pages and unknown addresses no row", () => {
      for (const p of ["/home", "/agent/t1", "/north-star", "/nope"]) expect(sectionTabs(p, LEO), p).toEqual({ tabs: [], picker: [] });
      // a detail page has its own way back: no row over a creator, a campaign or a format
      for (const p of ["/profiles/abc", "/campaigns/new", "/campaigns/c1", "/make/slideshow", "/inspiration/i1", "/carousels/c1", "/working/7412345678901234567", "/design/campaigns/c1", "/design/d1"]) expect(sectionTabs(p, LEO), p).toEqual({ tabs: [], picker: [] });
    });
  });

  it("lists Settings as tiles, its pages leading back to it instead of tabs, with help among them", () => {
    expect(sectionTabs("/settings", ANYONE)).toEqual({ tabs: [], picker: [] });
    for (const p of ["/notifications", "/connect", "/links", "/reels/team", "/skills", "/adlauncher", "/academy", "/feedback"]) expect(sectionTabs(p, LEO).back, p).toEqual({ to: "/settings", label: "Settings", active: false });
    // Getting started is a new sign-in's first screen: nothing over it says "back to Settings"
    expect(sectionTabs("/welcome", ANYONE)).toEqual({ tabs: [], picker: [] });
    expect(section("settings").pages.slice(1).every((p) => p.hint && p.hint.split(" ").length <= 12)).toBe(true);
    // Post labels and Language are sections of Post choices with tiles of their own, Language on Leo's sign-ins only
    const tiles = (email: string) => settingsTiles(visiblePages(groupedPages(section("settings").pages.slice(1)), email), email);
    expect(tiles(ANYONE).map((t) => t.to).slice(0, 4)).toEqual(["/notifications", "/settings/post-choices", "/settings/post-choices#labels", "/bio"]);
    expect(tiles(LEO).map((t) => [t.label, t.group]).slice(1, 4)).toEqual([["Post choices", "You"], ["Post labels", "You"], ["Language", "You"]]);
    expect(tiles(ANYONE).filter((t) => t.group === "Help").map((t) => t.label)).toEqual(["Getting started", "Academy", "How to post", "How it works", "Feedback"]);
    expect(SETTINGS_ANCHORS.every((a) => a.hint.split(" ").length <= 12 && pageFor(a.page)?.page.to === a.page)).toBe(true);
  });

  it("puts Fastlane's phone bar up: Home, Campaigns, then Chats or Studio, and lights one per page", () => {
    expect(mobileTabs(ANYONE).map((t) => [t.label, t.to])).toEqual([["Home", "/home"], ["Campaigns", "/calendar"], ["Studio", "/studio"]]);
    expect(mobileTabs(LEO).map((t) => [t.label, t.to])).toEqual([["Home", "/home"], ["Campaigns", "/campaigns"], ["Chats", "/agent?panel=chats"]]);
    const lit = (p: string, email = ANYONE) => mobileTabs(email).filter((t) => t.active(p)).map((t) => t.label);
    expect(lit("/calendar")).toEqual(["Campaigns"]);
    expect(lit("/drafts")).toEqual(["Studio"]);
    expect(lit("/studio")).toEqual(["Studio"]);
    expect(lit("/make/slideshow")).toEqual(["Studio"]);
    expect(lit("/welcome")).toEqual([]);
    expect(lit("/profiles/abc")).toEqual([]);
    // the agent's chats light Chats, not Home, for those who have them
    expect(lit("/agent/t1", LEO)).toEqual(["Chats"]);
    expect(lit("/agent", LEO)).toEqual(["Chats"]);
    expect(lit("/home", LEO)).toEqual(["Home"]);
    expect(lit("/library", LEO)).toEqual([]);
  });

  it("gives the More sheet one tile per other section, opening the first page this sign-in sees", () => {
    expect(moreSheet(ANYONE).map((t) => [t.label, t.to])).toEqual([["Brand", "/playbook"], ["Competitor Radar", "/swipe"], ["Analytics", "/analytics"], ["Settings", "/settings"]]);
    // the agent's sign-ins have Chats in the bar, so Studio moves into More
    expect(moreSheet(LEO).map((t) => t.label)).toEqual(["Studio", "Brand", "Competitor Radar", "Analytics", "Settings"]);
  });
});
