import { beforeEach, describe, expect, it, vi } from "vitest";
import { addProfile, activeProfileId, applyBrandLink, linkBoardBrand, profileForBusiness, rememberUser, setActiveProfile, withBrand } from "./profiles";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
});

describe("brand links", () => {
  it("switch to a known brand once, then ask for the param to go", () => {
    const p = addProfile("u1", "MoneyBees");
    expect(applyBrandLink("u1", p.id)).toBe("reload");
    expect(activeProfileId("u1")).toBe(p.id);
    expect(applyBrandLink("u1", p.id)).toBe("drop");
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
