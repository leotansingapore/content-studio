import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {}, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));

import { addProfile, setActiveProfile } from "./profiles";
import { brandName, brandPack, forSummary, loadRemixPrefs, saveRemixPrefs } from "./remixBrand";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

let local: MemStorage;
beforeEach(() => {
  local = new MemStorage();
  vi.stubGlobal("window", { localStorage: local });
  vi.stubGlobal("localStorage", local);
});
afterEach(() => vi.unstubAllGlobals());

const set = (key: string, v: unknown) => local.setItem(key, JSON.stringify(v));
const kit = (scope: string, extra: Record<string, unknown> = {}) =>
  set(`content-studio-carousel-brand-${scope}`, { color: "#1E3A8A", name: "", handle: "", ...extra });

describe("brandPack", () => {
  it("reads the kit, positioning and coach profile of the open brand only", () => {
    kit(UID, { name: "Leo Tan", offers: [{ name: "Free money check", url: "x.sg/check" }], emojiPolicy: "none" });
    set(`content-studio-positioning-${UID}`, { oneLiner: "I help fresh grads", audience: "young-adult", audienceDetail: "earning $4K", topics: ["CPF", " "], platform: "linkedin" });
    set(`content-studio-coachprofile-${UID}`, { origin: "I left banking in 2019" });
    const mine = brandPack(UID, { platform: "linkedin", mention: true, offer: "Free money check" });
    expect(mine).toMatchObject({
      name: "Leo Tan",
      oneLiner: "I help fresh grads",
      audience: "young adult: earning $4K",
      topics: ["CPF"],
      mention: true,
      offer: { name: "Free money check" },
    });
    expect(mine.facts).toContain("My story: I left banking in 2019");
    expect(mine.rules).toContain("Use no emoji at all.");
    expect(JSON.stringify(mine.offer)).not.toContain("x.sg");

    const p = addProfile(UID, "MoneyBees");
    setActiveProfile(UID, p.id);
    kit(`${UID}~${p.id}`, { name: "MoneyBees" });
    const other = brandPack(UID, { platform: "instagram", mention: true, offer: "Free money check" });
    expect(other).toMatchObject({ name: "MoneyBees", oneLiner: "", topics: [], facts: "", offer: null });
  });

  it("leaves the offer out with mention off, and drops one the kit no longer has", () => {
    kit(UID, { name: "Leo", offers: [{ name: "Book a call", url: "https://cal.com/leo" }] });
    expect(brandPack(UID, { platform: "linkedin", mention: false, offer: "Book a call" }).offer).toBeNull();
    expect(brandPack(UID, { platform: "linkedin", mention: true, offer: "Old offer" }).offer).toBeNull();
  });
});

describe("brandName", () => {
  it("takes the kit's name, else the brand's own name, never the default 'Me'", () => {
    expect(brandName(UID)).toBe("your business");
    const p = addProfile(UID, "FINternship");
    setActiveProfile(UID, p.id);
    expect(brandName(UID)).toBe("FINternship");
    kit(`${UID}~${p.id}`, { name: "FINternship Academy" });
    expect(brandName(UID)).toBe("FINternship Academy");
  });
});

describe("loadRemixPrefs", () => {
  it("starts from the defaults and keeps what was saved, per brand", () => {
    expect(loadRemixPrefs(UID)).toEqual({ mention: true, offer: null, face: "new", voice: "alice" });
    kit(UID, { name: "Leo", offers: [{ name: "Book a call", url: "https://cal.com/leo" }] });
    saveRemixPrefs(UID, { mention: false, offer: "Book a call", face: "new", voice: "george" });
    expect(loadRemixPrefs(UID)).toEqual({ mention: false, offer: "Book a call", face: "new", voice: "george" });
    const p = addProfile(UID, "MoneyBees");
    setActiveProfile(UID, p.id);
    expect(loadRemixPrefs(UID).mention).toBe(true);
  });

  it("falls back for a gone offer, a face or voice not built yet, and bad JSON", () => {
    kit(UID, { name: "Leo", offers: [] });
    set(`content-studio-remix-prefs-${UID}`, { mention: true, offer: "Deleted offer", face: "mine", voice: "mine" });
    expect(loadRemixPrefs(UID)).toEqual({ mention: true, offer: null, face: "new", voice: "alice" });
    local.setItem(`content-studio-remix-prefs-${UID}`, "{bad");
    expect(loadRemixPrefs(UID)).toEqual({ mention: true, offer: null, face: "new", voice: "alice" });
  });
});

describe("forSummary", () => {
  it("builds the collapsed line from the settings", () => {
    const base = { brand: "MoneyBees", hasVoice: true, mention: true, offer: null, video: false };
    expect(forSummary(base)).toBe("MoneyBees | your voice | mentions MoneyBees | no offer");
    expect(forSummary({ ...base, hasVoice: false, offer: "Free money check" })).toBe("MoneyBees | plain voice | mentions MoneyBees | Free money check");
    expect(forSummary({ ...base, mention: false, offer: "Free money check" })).toBe("MoneyBees | your voice | no brand mention | no offer");
    expect(forSummary({ ...base, video: true })).toBe("MoneyBees | your voice | mentions MoneyBees | no offer | AI presenter");
  });
});
