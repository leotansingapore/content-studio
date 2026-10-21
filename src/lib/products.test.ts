import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  alreadyAdded, loadProducts, mainProduct, MAX_PRODUCTS, mergeScan, type Product, productBrief, productLabel, PRODUCTS_CHANGED, sanitizeProducts,
  saveProducts, type Scan,
} from "./products";
import type { ScannedProduct } from "../../supabase/functions/brand-dna/logic.ts";

class MemStorage {
  s = new Map<string, string>();
  full = false;
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { if (this.full) throw new Error("QuotaExceededError"); this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}
let storage: MemStorage;
const events: string[] = [];
beforeEach(() => {
  storage = new MemStorage();
  events.length = 0;
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, dispatchEvent: (e: Event) => events.push(e.type) });
});
afterEach(() => vi.unstubAllGlobals());

const item = (o: Partial<Product> = {}): Product => ({
  id: "pd-abc123", name: "Retirement review", what: "A one-hour look at your CPF and savings.", forWho: "People in their 50s",
  pictures: [], sources: [], use: true, from: "you", addedAt: "2026-10-21T00:00:00.000Z", ...o,
});
const row = (o: Partial<ScannedProduct> = {}): ScannedProduct => ({ name: "Retirement review", what: "A review.", forWho: "50s", generic: "a retirement review", offerP: 0.9, namedP: 0.1, ...o });
const scan = (items: ScannedProduct[], o: Partial<Scan> = {}): Scan => ({ site: "https://acme.sg", readAt: "2026-10-21T08:00:00.000Z", pagesRead: ["https://acme.sg/"], kind: "service", items, ...o });
const NOW = new Date("2026-10-21T09:00:00.000Z");

describe("sanitizeProducts", () => {
  it("caps the list at 24 and each item's pictures at 4, and trims every length", () => {
    const many = Array.from({ length: 30 }, (_, i) => item({ id: `pd-item${String(i).padStart(2, "0")}`, name: `Item ${i}` }));
    expect(sanitizeProducts({ items: many }).items).toHaveLength(MAX_PRODUCTS);
    const keys = ["cimg-aaaaaa1", "cimg-aaaaaa2", "cimg-aaaaaa3", "cimg-aaaaaa4", "cimg-aaaaaa5"];
    const p = sanitizeProducts({ items: [item({ name: `  ${"n".repeat(80)}  `, what: "w".repeat(300), forWho: "f".repeat(200), price: "p".repeat(50), generic: "g".repeat(200), pictures: keys, sources: keys.map((k) => `https://acme.sg/${k}.jpg`) })] }).items[0];
    expect([p.name.length, p.what.length, p.forWho.length, p.price?.length, p.generic?.length]).toEqual([60, 200, 120, 40, 120]);
    expect(p.pictures).toEqual(keys.slice(0, 4));
    expect(p.sources).toEqual(keys.slice(0, 4).map((k) => `https://acme.sg/${k}.jpg`));
  });

  it("keeps only cimg- keys with their own source, and only http or https addresses", () => {
    const p = sanitizeProducts({
      items: [item({
        url: "javascript:alert(1)",
        pictures: ["cvid-aaaaaa1", "cimg-aaaaaa2", "cimg-aaaaaa3", "cimg-aaaaaa2"],
        sources: ["https://acme.sg/a.jpg", "ftp://acme.sg/b.jpg", "https://acme.sg/c.jpg", "https://acme.sg/d.jpg"],
      })],
      site: "javascript:x",
    });
    expect(p.items[0].pictures).toEqual(["cimg-aaaaaa2", "cimg-aaaaaa3"]);
    expect(p.items[0].sources).toEqual(["", "https://acme.sg/c.jpg"]);
    expect(p.items[0].url).toBeUndefined();
    expect(p.site).toBeUndefined();
    expect(sanitizeProducts({ items: [item({ url: "acme.sg/review" })] }).items[0].url).toBe("https://acme.sg/review");
  });

  it("drops items with no name or no id, and duplicate ids; leaves price and generic out when empty", () => {
    const out = sanitizeProducts({ kind: "products", items: [item({ id: "pd-noname1", name: "  " }), item({ id: "x" }), item(), item({ name: "Again" }), { ...item({ id: "pd-other1" }), price: "", generic: "" }] });
    expect(out.kind).toBe("products");
    expect(out.items.map((p) => p.id)).toEqual(["pd-abc123", "pd-other1"]);
    expect("price" in out.items[1] || "generic" in out.items[1]).toBe(false);
    expect(sanitizeProducts({ kind: "shop" }).kind).toBeUndefined();
    expect(sanitizeProducts("junk")).toEqual({ items: [] });
  });
});

describe("loadProducts and saveProducts", () => {
  it("round-trip per brand and say the list changed", () => {
    expect(saveProducts("u1", { kind: "service", items: [item()] })).toBeNull();
    expect(loadProducts("u1").items[0].name).toBe("Retirement review");
    expect(events).toEqual([PRODUCTS_CHANGED]);
    storage.setItem("content-studio-products-u1", "{bad json");
    expect(loadProducts("u1")).toEqual({ items: [] });
  });

  it("refuses with a line when the device is full, writing nothing", () => {
    storage.full = true;
    expect(saveProducts("u1", { items: [item()] })).toMatch(/out of room/);
    expect(events).toEqual([]);
  });
});

describe("productBrief", () => {
  it("names the item and leaves an empty price out", () => {
    const b = productBrief(item());
    expect(b).toContain("Retirement review");
    expect(b).toContain("Who it's for: People in their 50s");
    expect(b).not.toContain("Price");
    expect(productBrief(item({ price: "From $120" }))).toContain("Price: From $120");
  });

  it("uses generic for a named insurer product and never its plan name, even where the page's words repeat it", () => {
    const named = item({ name: "AIA Pro Achiever 3.0", what: "aia pro achiever 3.0 grows your money.", generic: "an investment-linked plan", namedProduct: true });
    const b = productBrief(named);
    expect(b).toContain("an investment-linked plan");
    expect(b.toLowerCase()).not.toContain("pro achiever");
    expect(productLabel(named)).toBe("an investment-linked plan");
    // not named: the name stays
    expect(productBrief({ ...named, namedProduct: undefined })).toContain("AIA Pro Achiever 3.0");
  });
});

describe("mainProduct", () => {
  it("is the first item with Use in posts on", () => {
    expect(mainProduct([item({ id: "pd-first1", use: false }), item({ id: "pd-second", use: true }), item({ id: "pd-third1" })])?.id).toBe("pd-second");
    expect(mainProduct([item({ use: false })])).toBeNull();
  });
});

describe("mergeScan", () => {
  it("adds only the ticked rows, with their page, generic, named flag and picture", () => {
    const s = scan([
      row({ name: "Wealth plan", url: "https://acme.sg/wealth", picture: "https://acme.sg/w.jpg", namedP: 0.7, price: "From $100" }),
      row({ name: "Blog post" }),
      row({ name: "Estate planning", picture: "https://acme.sg/e.jpg" }),
    ]);
    const { next, added } = mergeScan({ items: [] }, s, [0, 2], { "https://acme.sg/w.jpg": "cimg-fetched1" }, NOW);
    expect(added.map((p) => p.name)).toEqual(["Wealth plan", "Estate planning"]);
    expect(added[0]).toMatchObject({ url: "https://acme.sg/wealth", price: "From $100", namedProduct: true, generic: "a retirement review", pictures: ["cimg-fetched1"], sources: ["https://acme.sg/w.jpg"], use: true, from: "website", addedAt: NOW.toISOString() });
    // not fetched yet: a new key, fetched later from its source
    expect(added[1].pictures[0]).toMatch(/^cimg-[a-z0-9]{6,30}$/);
    expect(added[1].sources).toEqual(["https://acme.sg/e.jpg"]);
    expect(added[1].namedProduct).toBeUndefined();
    expect(next).toMatchObject({ kind: "service", site: "https://acme.sg", readAt: s.readAt });
    expect(sanitizeProducts(next).items).toHaveLength(2);
  });

  it("matches by page or name, never changing a saved item, and keeps a kind that was picked", () => {
    const mine = item({ id: "pd-mine001", name: "My own wording", url: "https://acme.sg/review", what: "Typed by me" });
    const s = scan([row({ name: "Retirement Review!", url: "https://acme.sg/review/" }), row({ name: "my own WORDING" }), row({ name: "New one" })], { kind: "products" });
    const { next, added } = mergeScan({ kind: "service", items: [mine] }, s, [0, 1, 2], {}, NOW);
    expect(added.map((p) => p.name)).toEqual(["New one"]);
    expect(next.items[0]).toBe(mine);
    expect(next.kind).toBe("service");
  });

  it("never matches by a page several rows share (a services page)", () => {
    const rows = [row({ name: "Will writing", url: "https://acme.sg/services" }), row({ name: "Estate review", url: "https://acme.sg/services" })];
    const saved = [item({ name: "Will writing", url: "https://acme.sg/services" })];
    expect(alreadyAdded(saved, rows[1], rows)).toBeUndefined();
    expect(alreadyAdded(saved, rows[0], rows)?.name).toBe("Will writing");
    expect(mergeScan({ items: saved }, scan(rows), [0, 1]).added.map((p) => p.name)).toEqual(["Estate review"]);
  });

  it("stops at 24", () => {
    const full = Array.from({ length: 22 }, (_, i) => item({ id: `pd-full${String(i).padStart(3, "0")}`, name: `Saved ${i}` }));
    const { next, added } = mergeScan({ items: full }, scan([row({ name: "A" }), row({ name: "B" }), row({ name: "C" })]), [0, 1, 2]);
    expect(added).toHaveLength(2);
    expect(next.items).toHaveLength(MAX_PRODUCTS);
  });
});
