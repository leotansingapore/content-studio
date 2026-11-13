import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_ROOM, saveProfileField } from "./profileSave";
import { DEFAULT_BRAND, loadBrand, saveBrand } from "@/lib/carousel";
import { EMPTY_POSITIONING, loadPositioning, savePositioning } from "@/lib/positioning";
import { loadProducts, saveProducts } from "@/lib/products";
import { loadScriptContext } from "@/lib/scriptContext";

class MemStorage {
  s = new Map<string, string>();
  full = false;
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { if (this.full) throw new Error("QuotaExceededError"); this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
  key(i: number) { return [...this.s.keys()][i] ?? null; }
  get length() { return this.s.size; }
}
let storage: MemStorage;
beforeEach(() => {
  storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, dispatchEvent: () => true });
});
afterEach(() => vi.unstubAllGlobals());

const U = "u1";

describe("saveProfileField", () => {
  it("writes the brand kit the Brand kit page reads, keeping every field it did not touch", () => {
    saveBrand(U, { ...DEFAULT_BRAND, name: "Old", handle: "@tally", signOff: "DM me" });
    expect(saveProfileField(U, "name", "Tally Board")).toBeNull();
    expect(saveProfileField(U, "avoid", "cheapest, hustle")).toBeNull();
    expect(loadBrand(U)).toMatchObject({ name: "Tally Board", handle: "@tally", signOff: "DM me", avoidWords: "cheapest, hustle" });
    saveProfileField(U, "logo", "data:image/png;base64,eA==");
    expect(loadBrand(U)?.logo).toBe("data:image/png;base64,eA==");
    saveProfileField(U, "logo", "");
    expect(loadBrand(U)?.logo).toBeUndefined();
  });

  it("writes the first offer the brand kit lists, starting one when there is none and keeping any others", () => {
    expect(saveProfileField(U, "offerName", "Free review")).toBeNull();
    expect(loadBrand(U)?.offers).toEqual([{ name: "Free review", url: "" }]);
    saveBrand(U, { ...loadBrand(U)!, offers: [{ name: "Free review", url: "" }, { name: "Course", url: "https://a.sg/c" }] });
    saveProfileField(U, "offerUrl", "https://a.sg/review");
    expect(loadBrand(U)?.offers).toEqual([{ name: "Free review", url: "https://a.sg/review" }, { name: "Course", url: "https://a.sg/c" }]);
  });

  it("writes the positioning Plan reads, merged into what is there, and parses topics", () => {
    savePositioning(U, { ...EMPTY_POSITIONING, oneLiner: "I help parents", cadence: 5, goal: "Get clients" });
    saveProfileField(U, "edge", "A plan every quarter");
    saveProfileField(U, "topics", "CPF, retirement\nwills");
    expect(loadPositioning(U)).toMatchObject({ oneLiner: "I help parents", cadence: 5, goal: "Get clients", edge: "A plan every quarter", topics: ["CPF", "retirement", "wills"] });
  });

  it("starts a positioning when there is none, and says so when the device is full", () => {
    saveProfileField(U, "who", "Working parents");
    expect(loadPositioning(U)?.audienceDetail).toBe("Working parents");
    storage.full = true;
    expect(saveProfileField(U, "who", "x")).toBe(NO_ROOM);
  });

  it("prices the main product only, and asks for a product when there is none", () => {
    expect(saveProfileField(U, "price", "$9")).toBe("Add a product first.");
    const p = (id: string, use: boolean) => ({ id, name: id, what: "", forWho: "", pictures: [], sources: [], use, from: "you" as const, addedAt: "" });
    saveProducts(U, { items: [p("pd-off01", false), p("pd-main1", true)] });
    expect(saveProfileField(U, "price", "$12 a seat")).toBeNull();
    expect(loadProducts(U).items.map((x) => x.price ?? null)).toEqual([null, "$12 a seat"]);
  });

  it("writes proof to the script product card, keeping its other fields", () => {
    storage.setItem(`content-studio-script-context-${U}`, JSON.stringify({ product: { name: "Tally", what: "A tracker" } }));
    saveProfileField(U, "proof", "48 cafes");
    expect(loadScriptContext(U).product).toMatchObject({ name: "Tally", what: "A tracker", proof: "48 cafes" });
  });
});
