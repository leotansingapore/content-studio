import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/useLeoOnly", () => ({ leoUser: async () => null }));

import { BRAND_FONT_CHANGED, FONT_LIMIT_ERROR, FONT_SIZE_ERROR, FONT_TYPE_ERROR, MAX_BRAND_FONTS, addBrandFont, brandFontFaces, fontKind, loadBrandFont, loadBrandFonts, readFont, removeBrandFont } from "./brandFont";

const file = (head: number[] | string, size = 64, name = "Inter-Tight.woff2") => {
  const bytes = new Uint8Array(size);
  const first = typeof head === "string" ? Array.from(head, (c) => c.charCodeAt(0)) : head;
  bytes.set(first);
  return new File([bytes], name);
};

describe("reading a brand font", () => {
  it("accepts WOFF2, OTF and TTF headers", async () => {
    expect(fontKind([0x77, 0x4f, 0x46, 0x32])).toBe("woff2");
    expect(fontKind([0x77, 0x4f, 0x46, 0x46])).toBe("woff");
    for (const [head, mime] of [["wOF2", "font/woff2"], ["OTTO", "font/otf"], ["true", "font/ttf"], [[0, 1, 0, 0], "font/ttf"]] as const) {
      const r = await readFont(file(head as string | number[]));
      expect(r.ok && r.font.data.startsWith(`data:${mime};base64,`)).toBe(true);
    }
    const r = await readFont(file("wOF2"), new Date("2026-10-22T01:00:00.000Z"));
    expect(r).toMatchObject({ ok: true, font: { name: "Inter Tight", addedAt: "2026-10-22T01:00:00.000Z" } });
  });

  it("refuses PNG bytes renamed .woff2 and anything over 300 KB, each with its line", async () => {
    expect(await readFont(file([0x89, 0x50, 0x4e, 0x47]))).toEqual({ ok: false, error: FONT_TYPE_ERROR });
    expect(await readFont(file("wOF2", 400_000))).toEqual({ ok: false, error: FONT_SIZE_ERROR });
    expect((await readFont(file("wOF2", 300_000))).ok).toBe(true);
  });
});

describe("the stored brand font", () => {
  const store = new Map<string, string>();
  const events: string[] = [];
  beforeEach(() => {
    store.clear();
    events.length = 0;
    const localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("window", { localStorage, location: { search: "" }, dispatchEvent: (e: Event) => events.push(e.type) });
  });
  afterEach(() => vi.unstubAllGlobals());

  const font = async (name: string, head = "OTTO") => {
    const r = await readFont(file(head, 64, `${name}.otf`));
    if ("error" in r) throw new Error(r.error);
    return r.font;
  };

  it("saves, loads and removes it, the removal kept as an empty record so it syncs", async () => {
    const f = await font("Inter Tight");
    expect(addBrandFont("u1", f)).toEqual({ ok: true, font: { ...f, family: "BrandFont" } });
    expect(loadBrandFont("u1")).toEqual({ ...f, family: "BrandFont" });
    expect(events).toEqual([BRAND_FONT_CHANGED]);
    removeBrandFont("u1", "BrandFont");
    expect(loadBrandFonts("u1")).toEqual([]);
    expect(loadBrandFont("u1")).toBeNull();
    expect(JSON.parse(store.get("content-studio-brandfont-u1")!)).toMatchObject({ data: "" });
  });

  it("reads a font saved before several were allowed as a list of one, drawn as BrandFont", async () => {
    const f = await font("Old One");
    store.set("content-studio-brandfont-u1", JSON.stringify({ name: f.name, data: f.data, addedAt: f.addedAt }));
    expect(loadBrandFonts("u1")).toEqual([{ name: "Old One", data: f.data, addedAt: f.addedAt, family: "BrandFont" }]);
    // a second one goes in its own key and family, and the first stays where the old reader looks
    expect(addBrandFont("u1", await font("New One"))).toMatchObject({ ok: true, font: { family: "BrandFont2" } });
    expect(JSON.parse(store.get("content-studio-brandfont2-u1")!)).toMatchObject({ name: "New One", family: "BrandFont2" });
    expect(JSON.parse(store.get("content-studio-brandfont-u1")!)).toMatchObject({ name: "Old One", data: f.data });
    expect(loadBrandFonts("u1").map((x) => x.name)).toEqual(["Old One", "New One"]);
  });

  it("keeps up to five, each its own family, and refuses a sixth without touching the five", async () => {
    for (let i = 1; i <= MAX_BRAND_FONTS; i++) expect(addBrandFont("u1", await font(`Font ${i}`)).ok).toBe(true);
    const before = new Map(store);
    expect(addBrandFont("u1", await font("Font 6"))).toEqual({ ok: false, error: FONT_LIMIT_ERROR });
    expect(store).toEqual(before);
    const five = loadBrandFonts("u1");
    expect(five.map((x) => x.family)).toEqual(["BrandFont", "BrandFont2", "BrandFont3", "BrandFont4", "BrandFont5"]);
    // removing one frees a place
    removeBrandFont("u1", "BrandFont3");
    expect(addBrandFont("u1", await font("Font 6"))).toMatchObject({ ok: true, font: { family: "BrandFont3" } });
    expect(loadBrandFonts("u1")).toHaveLength(MAX_BRAND_FONTS);
  });

  it("moves the last font into the first key when the first is removed, so an old-shape reader still gets a font", async () => {
    for (const n of ["A", "B", "C"]) addBrandFont("u1", await font(n));
    removeBrandFont("u1", "BrandFont");
    expect(JSON.parse(store.get("content-studio-brandfont-u1")!)).toMatchObject({ name: "C", family: "BrandFont3" });
    expect(JSON.parse(store.get("content-studio-brandfont3-u1")!)).toMatchObject({ data: "" });
    // each font keeps its family, so layers naming it still draw it
    expect(loadBrandFonts("u1").map((x) => [x.name, x.family])).toEqual([["C", "BrandFont3"], ["B", "BrandFont2"]]);
  });

  it("gives the export the data of the fonts the slides use, each under its own family", async () => {
    for (const [n, head] of [["A", "OTTO"], ["B", "wOF2"]]) addBrandFont("u1", await font(n, head));
    const [a, b] = loadBrandFonts("u1");
    const rules = brandFontFaces(loadBrandFonts("u1"), new Set(["BrandFont2", "Anton"]));
    expect(rules).toEqual([`@font-face{font-family:'BrandFont2';src:url(${b.data})}`]);
    expect(rules.join("")).not.toContain(a.data);
    expect(brandFontFaces([a, b], new Set(["Inter"]))).toEqual([]);
  });

  it("reads bad JSON, a picture or an oversized font as no font", () => {
    store.set("content-studio-brandfont-u1", "{nope");
    expect(loadBrandFont("u1")).toBeNull();
    store.set("content-studio-brandfont-u1", JSON.stringify({ name: "x", data: "data:font/ttf;base64,iVBORw0KGgo=" }));
    expect(loadBrandFont("u1")).toBeNull();
    store.set("content-studio-brandfont-u1", JSON.stringify({ name: "x", data: `data:font/woff2;base64,d09GMg${"A".repeat(400_100)}` }));
    expect(loadBrandFont("u1")).toBeNull();
    expect(loadBrandFont(null)).toBeNull();
  });

  it("says why when the device is full, and saves nothing", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } });
    expect(addBrandFont("u1", { name: "x", data: "", addedAt: "" })).toMatchObject({ ok: false });
    expect(events).toEqual([]);
  });
});
