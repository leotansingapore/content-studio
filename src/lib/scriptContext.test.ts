import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAudience } from "./audiences";
import { productsKey } from "./products";
import { deskContext, hasAvatar, loadScriptContext, saveScriptContext, scriptContextKey, EMPTY_ME, EMPTY_PRODUCT } from "./scriptContext";

class MemStorage {
  s = new Map<string, string>();
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}
let storage: MemStorage;
beforeEach(() => {
  storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, dispatchEvent: () => true });
});
afterEach(() => vi.unstubAllGlobals());

const UID = "u1";

describe("script context", () => {
  it("syncs under a content-studio- key per brand, and a save on one side keeps the other", () => {
    expect(scriptContextKey(UID).startsWith("content-studio-script-context-")).toBe(true);
    saveScriptContext(UID, { me: { ...EMPTY_ME, name: "Leo" } });
    saveScriptContext(UID, { product: { ...EMPTY_PRODUCT, name: "Postmosis" } });
    expect([loadScriptContext(UID).me.name, loadScriptContext(UID).product.name]).toEqual(["Leo", "Postmosis"]);
    storage.setItem(scriptContextKey(UID), "{not json");
    expect(loadScriptContext(UID)).toEqual({ me: EMPTY_ME, product: EMPTY_PRODUCT });
  });

  it("gives the desk lists one item a line, the main audience's lists, and nothing from a side switched off", () => {
    saveScriptContext(UID, {
      me: { ...EMPTY_ME, name: "Leo", results: " $1m raised \n\n10 hires\n", beliefs: "Ship it" },
      product: { ...EMPTY_PRODUCT, on: false, name: "Hidden" },
    });
    saveAudience(UID, { name: "Founders", who: "Run a startup", lifeStage: "general", cares: [], pains: ["Burn rate"], main: true });
    const c = deskContext(UID);
    expect(c.me).toMatchObject({ name: "Leo", results: ["$1m raised", "10 hires"], beliefs: ["Ship it"] });
    expect(c.product).toBeNull();
    expect(c.avatar).toEqual({ name: "Founders", who: "Run a startup", pains: ["Burn rate"], fears: [], desires: [], days: [] });
    expect(hasAvatar(UID)).toBe(true);
  });

  it("fills Product's empty fields from the brand kit's main product, never over what was typed", () => {
    storage.setItem(productsKey(UID), JSON.stringify({ items: [{ id: "pd-kit1", name: "Kit name", what: "Kit what", forWho: "Kit who", price: "$9", url: "https://kit.example", pictures: [], sources: [], use: true }] }));
    saveScriptContext(UID, { product: { ...EMPTY_PRODUCT, what: "Typed what", cta: "Comment KIT" } });
    expect(deskContext(UID).product).toMatchObject({ name: "Kit name", what: "Typed what", who: "Kit who", price: "$9", website: "https://kit.example", cta: "Comment KIT" });
  });

  it("takes the niche from Me, else the positioning's topics, and the voice sample from /voice's first long post", () => {
    storage.setItem(`content-studio-positioning-${UID}`, JSON.stringify({ topics: ["CPF", "insurance"], audience: "general", audienceDetail: "", oneLiner: "", edge: "", platform: "instagram", cadence: 3, updatedAt: "" }));
    storage.setItem(`content-studio-voice-${UID}`, JSON.stringify({ posts: ["short", "x".repeat(120)], updatedAt: "" }));
    expect(deskContext(UID)).toMatchObject({ niche: "CPF, insurance", sample: "x".repeat(120) });
    saveScriptContext(UID, { me: { ...EMPTY_ME, niche: "money for founders" } });
    expect(deskContext(UID).niche).toBe("money for founders");
  });
});
