import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/useLeoOnly", () => ({ leoUser: async () => null }));

import { BRAND_FONT_CHANGED, FONT_SIZE_ERROR, FONT_TYPE_ERROR, fontKind, loadBrandFont, readFont, saveBrandFont } from "./brandFont";

const file = (head: number[] | string, size = 64, name = "Inter-Tight.woff2") => {
  const bytes = new Uint8Array(size);
  const first = typeof head === "string" ? Array.from(head, (c) => c.charCodeAt(0)) : head;
  bytes.set(first);
  return new File([bytes], name);
};

describe("reading a brand font", () => {
  it("accepts WOFF2, OTF and TTF headers", async () => {
    expect(fontKind([0x77, 0x4f, 0x46, 0x32])).toBe("woff2");
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

  it("saves, loads and removes it, the removal kept as an empty record so it syncs", async () => {
    const r = await readFont(file("OTTO"));
    if (!r.ok) throw new Error(r.error);
    expect(saveBrandFont("u1", r.font)).toEqual({ ok: true });
    expect(loadBrandFont("u1")).toEqual(r.font);
    expect(events).toEqual([BRAND_FONT_CHANGED]);
    saveBrandFont("u1", null);
    expect(loadBrandFont("u1")).toBeNull();
    expect(JSON.parse(store.get("content-studio-brandfont-u1")!)).toMatchObject({ data: "" });
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
    expect(saveBrandFont("u1", { name: "x", data: "", addedAt: "" })).toMatchObject({ ok: false });
    expect(events).toEqual([]);
  });
});
