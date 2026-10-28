import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/supabase", () => ({ supabase: {}, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));

import ProfessionField from "@/components/ProfessionField";
import { DEFAULT_BRAND, loadBrand, sanitizeBrand, saveBrand } from "./carousel";
import { createCloudSync, type SyncBackend, type SyncRow } from "./cloudSync";
import { professionFor } from "./profession";
import { addProfile, setActiveProfile } from "./profiles";

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
const onDevice = (s: MemStorage) => {
  vi.stubGlobal("window", { localStorage: s });
  vi.stubGlobal("localStorage", s);
};
beforeEach(() => onDevice(new MemStorage()));
afterEach(() => vi.unstubAllGlobals());

describe("the brand kit's profession", () => {
  it("is kept as typed, capped at 60 characters, and dropped when it isn't text", () => {
    expect(sanitizeBrand({ profession: "Wedding photographer" }).profession).toBe("Wedding photographer");
    expect(sanitizeBrand({ profession: "x".repeat(80) }).profession).toHaveLength(60);
    expect(sanitizeBrand({ profession: 7 }).profession).toBeUndefined();
    expect(sanitizeBrand({}).profession).toBeUndefined();
  });

  it("sends nothing for an adviser or a brand with nothing set, and the brand's words for anyone else", () => {
    expect(professionFor(UID)).toBe(""); // no kit at all
    saveBrand(UID, { ...DEFAULT_BRAND, name: "Leo" });
    expect(professionFor(UID)).toBe(""); // a kit saved before the question existed
    for (const adviser of ["Financial adviser", " financial ADVISER ", ""]) {
      saveBrand(UID, { ...DEFAULT_BRAND, profession: adviser });
      expect(professionFor(UID)).toBe("");
    }
    saveBrand(UID, { ...DEFAULT_BRAND, profession: "Real estate agent" });
    expect(professionFor(UID)).toBe("real estate agent");
    saveBrand(UID, { ...DEFAULT_BRAND, profession: "CPA" });
    expect(professionFor(UID)).toBe("CPA");
  });

  it("belongs to one brand, and reaches another device through the sync with each brand's own", async () => {
    const table = new Map<string, SyncRow>();
    const backend: SyncBackend = {
      pull: async () => ({ data: [...table.values()], error: null }),
      upsert: async (rows) => (rows.forEach((r) => table.set(r.key, r)), { error: null }),
      remove: async (keys) => (keys.forEach((k) => table.delete(k)), { error: null }),
    };
    const phone = new MemStorage();
    onDevice(phone);
    const out = createCloudSync(UID, phone, backend);
    await out.start();
    saveBrand(UID, { ...DEFAULT_BRAND, name: "Ada", profession: "Coach" });
    const homes = addProfile(UID, "Ada Homes");
    setActiveProfile(UID, homes.id);
    saveBrand(UID, { ...DEFAULT_BRAND, name: "Ada Homes", profession: "Real estate agent" });
    expect(professionFor(UID)).toBe("real estate agent");
    setActiveProfile(UID, "me");
    expect(professionFor(UID)).toBe("coach");
    for (let i = 0; i < phone.length; i++) out.noteWrite(phone.key(i)!);
    await out.flush();
    expect([...table.keys()].filter((k) => k.startsWith("content-studio-carousel-brand-")).sort()).toEqual([
      `content-studio-carousel-brand-${UID}`,
      `content-studio-carousel-brand-${UID}~${homes.id}`,
    ]);

    const laptop = new MemStorage();
    onDevice(laptop);
    await createCloudSync(UID, laptop, backend).start();
    expect(loadBrand(UID)?.profession).toBe("Coach");
    expect(professionFor(UID)).toBe("coach");
    setActiveProfile(UID, homes.id);
    expect(professionFor(UID)).toBe("real estate agent");
  });
});

describe("What do you do?", () => {
  const html = (value: string) => renderToStaticMarkup(createElement(ProfessionField, { value, onChange: () => undefined }));
  const pressed = (out: string) => [...out.matchAll(/aria-pressed="true"[^>]*>([^<]+)</g)].map((m) => m[1]);

  it("shows the adviser chip picked when nothing is set, since that is what the writers write for", () => {
    expect(html("")).toContain("What do you do?");
    expect(pressed(html(""))).toEqual(["Financial adviser"]);
  });

  it("picks nothing for a new brand that has not answered yet", () => {
    const fresh = (value: string) => renderToStaticMarkup(createElement(ProfessionField, { value, onChange: () => undefined, emptyIsAdviser: false }));
    expect(pressed(fresh(""))).toEqual([]);
    expect(pressed(fresh("Coach"))).toEqual(["Coach"]);
    expect(pressed(fresh("financial advisor"))).toEqual(["Financial adviser"]);
  });

  it("picks the adviser chip for either spelling, typed in any case", () => {
    for (const v of ["financial advisor", " Financial Adviser "]) expect(pressed(html(v))).toEqual(["Financial adviser"]);
  });

  it("picks the chip that matches what was typed, and none for the person's own words", () => {
    expect(pressed(html("coach"))).toEqual(["Coach"]);
    expect(pressed(html("Wedding photographer"))).toEqual([]);
  });
});
