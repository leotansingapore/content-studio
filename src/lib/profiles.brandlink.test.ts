import { beforeEach, describe, expect, it, vi } from "vitest";
import { addProfile, activeProfileId, applyBrandLink, brandAddress, brandPage, brandPending, linkBoardBrand, profileForBusiness, rememberUser, setActiveProfile, withBrand } from "./profiles";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
});

describe("brand links", () => {
  it("switch to a known brand once, then report it open", () => {
    const p = addProfile("u1", "MoneyBees");
    expect(applyBrandLink("u1", p.id)).toBe("reload");
    expect(activeProfileId("u1")).toBe(p.id);
    expect(applyBrandLink("u1", p.id)).toBe("open");
  });
  it("leave an unknown brand alone, since this device's list may still be syncing", () => {
    expect(applyBrandLink("u1", "pnope")).toBe("keep");
    expect(activeProfileId("u1")).toBe("me");
    expect(applyBrandLink("u1", null)).toBe("none");
  });
  it("name the open brand on copied links, the default one too", () => {
    rememberUser(null);
    expect(withBrand("https://x.test/reels?card=a")).toBe("https://x.test/reels?card=a");
    rememberUser("u1");
    expect(withBrand("https://x.test/reels?card=a")).toBe("https://x.test/reels?card=a&profile=me");
    const p = addProfile("u1", "AT");
    setActiveProfile("u1", p.id);
    expect(withBrand("https://x.test/plan#goal")).toBe(`https://x.test/plan?profile=${p.id}#goal`);
    expect(withBrand("not a url")).toBe("not a url");
  });
  it("find the brand a ?business= link names, by name or by the board brand it owns", () => {
    const at = addProfile("u1", "ActivityTracker");
    linkBoardBrand("u1", "me", "leo");
    expect(profileForBusiness("u1", "activitytracker")).toBe(at.id);
    expect(profileForBusiness("u1", "Activity Tracker")).toBe(at.id);
    expect(profileForBusiness("u1", "leo")).toBe("me");
    expect(profileForBusiness("u1", "team-posts")).toBeNull();
    expect(profileForBusiness("u1", "all")).toBeNull();
    expect(profileForBusiness("u1", "--")).toBeNull();
    expect(profileForBusiness("u1", null)).toBeNull();
  });
});

describe("the open brand in the address", () => {
  const KNOWN = ["me", "pab12", "pcd34"];
  it("names the open brand on a brand page, keeping every other param and the hash", () => {
    expect(brandAddress("/calendar", "", "", "me", KNOWN)).toBe("/calendar?profile=me");
    expect(brandAddress("/drafts", "?status=scheduled&post=a1", "#list", "pab12", KNOWN)).toBe("/drafts?status=scheduled&post=a1&profile=pab12#list");
    expect(brandAddress("/calendar", "?view=upcoming&profile=pab12", "", "pab12", KNOWN)).toBeNull();
  });
  it("puts the open brand over another known one, once, without doubling the param", () => {
    expect(brandAddress("/plan", "?profile=pcd34&view=week", "", "pab12", KNOWN)).toBe("/plan?profile=pab12&view=week");
    expect(brandAddress("/plan", "?profile=pcd34&profile=me", "", "pab12", KNOWN)).toBe("/plan?profile=pab12");
    expect(brandAddress("/plan", "?profile=", "", "me", KNOWN)).toBe("/plan?profile=me");
  });
  it("leaves a brand this device doesn't know yet alone, since its list may still be syncing", () => {
    expect(brandAddress("/calendar", "?profile=pnope", "", "me", KNOWN)).toBeNull();
  });
  it("keeps the param off pages about no one brand, and takes it off them", () => {
    for (const p of ["/north-star", "/marketing-north-star", "/settings", "/welcome", "/academy", "/tutorial", "/create-guide", "/feedback", "/reels/team", "/brands/new", "/hub", "/hub/trends", "/adlauncher"]) {
      expect(brandPage(p)).toBe(false);
      expect(brandAddress(p, "", "", "me", KNOWN)).toBeNull();
    }
    expect(brandAddress("/north-star", "?item=x&profile=pab12", "#top", "pab12", KNOWN)).toBe("/north-star?item=x#top");
    for (const p of ["/home", "/calendar", "/drafts", "/generate", "/reels", "/connect", "/skills", "/bio", "/accounts", "/profiles/abc", "/settingsx"]) expect(brandPage(p)).toBe(true);
  });
  it("a switch writes the new brand into the address before its reload, so the reload can't switch back", () => {
    const p = addProfile("u1", "MoneyBees");
    const loc = { pathname: "/calendar", search: "?view=week&profile=me", hash: "#day" };
    const replaceState = vi.fn((_s: unknown, _t: string, url: string) => {
      const u = new URL(url, "https://x.test");
      Object.assign(loc, { pathname: u.pathname, search: u.search, hash: u.hash });
    });
    vi.stubGlobal("window", { ...window, location: loc, history: { state: { idx: 3 }, replaceState } });
    setActiveProfile("u1", p.id);
    expect(replaceState).toHaveBeenCalledWith({ idx: 3 }, "", `/calendar?view=week&profile=${p.id}#day`);
    expect(applyBrandLink("u1", new URLSearchParams(loc.search).get("profile"))).toBe("open");
    // a ?business= link gets its brand's id too
    Object.assign(loc, { pathname: "/calendar", search: "?business=moneybees", hash: "" });
    setActiveProfile("u1", "me");
    expect(applyBrandLink("u1", profileForBusiness("u1", "moneybees"))).toBe("reload");
    expect(loc.search).toBe(`?business=moneybees&profile=${p.id}`);
  });
  it("a gone-item check waits only while the address names a brand other than the open one", () => {
    const p = addProfile("u1", "AT");
    rememberUser(null);
    expect(brandPending("me")).toBe(true);
    rememberUser("u1");
    expect(brandPending(null)).toBe(false);
    expect(brandPending("me")).toBe(false);
    expect(brandPending(p.id)).toBe(true);
    expect(brandPending("pnope")).toBe(true);
  });
  it("copied links name the brand once, and only on brand pages", () => {
    rememberUser("u1");
    expect(withBrand("https://x.test/calendar?profile=me&profile=pzz")).toBe("https://x.test/calendar?profile=me");
    expect(withBrand("https://x.test/north-star?item=a")).toBe("https://x.test/north-star?item=a");
  });
  it("profile ids are letters and digits only, safe in a chat app's link", () => {
    for (let i = 0; i < 200; i++) expect(addProfile("u2", "B").id).toMatch(/^p[a-z0-9]+$/);
  });
});
