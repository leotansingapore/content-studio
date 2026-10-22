import { beforeEach, describe, expect, it, vi } from "vitest";
import { KIT_FEEDS, KIT_KEY_PREFIX, cachedKit, refreshKit, sanitizeKit, withKit, type CachedKit } from "./brandKitFeed";
import { loadBrand, saveBrand, type CarouselBrand } from "./carousel";
import { isSyncedKeyFor } from "./cloudSync";
import { addProfile, linkBoardBrand, setActiveProfile } from "./profiles";

const FEED = KIT_FEEDS.moneybees;
const KIT = {
  schema: 1,
  version: "3f2a9c1b0d4e",
  built: "2026-10-22T14:00:00Z",
  colors: { navy: "#121A4B", blue: "#1965B0", gold: "#FFBB36", yellow: "#FFC21A" },
  roles: { primary: "yellow", accents: ["navy", "blue", "gold"] },
  logos: { lockup: "https://themoneybees.co/brand-kit/logo.png" },
};
const PNG = "data:image/png;base64,iVBORw0KGgo=";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
});

const res = (body: unknown, ok = true, type = "application/json") =>
  ({ ok, status: ok ? 200 : 503, json: async () => body, headers: new Headers({ "content-type": type }),
    arrayBuffer: async () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer }) as unknown as Response;
const site = (kit: unknown = KIT, ok = true) =>
  vi.fn(async (url: string) => (url.includes("logo.png") ? res(null, true, "image/png") : res(kit, ok)));

describe("sanitizeKit", () => {
  it("keeps schema 1 with clean colours and links on the feed's own origin", () => {
    expect(sanitizeKit(KIT, FEED)).toEqual({ version: KIT.version, built: KIT.built, colors: KIT.colors,
      roles: { primary: "yellow", accents: ["navy", "blue", "gold"] }, logo: KIT.logos.lockup });
  });
  it("drops bad hex, http links and other origins, and refuses other schemas", () => {
    const k = sanitizeKit({ ...KIT, colors: { ...KIT.colors, navy: "121A4B", pink: "#FF4D7", red: "url(x)" },
      logos: { lockup: "http://themoneybees.co/brand-kit/logo.png" } }, FEED);
    expect(k?.colors).toEqual({ blue: "#1965B0", gold: "#FFBB36", yellow: "#FFC21A" });
    expect(k?.roles.accents).toEqual(["blue", "gold"]);
    expect(k?.logo).toBeUndefined();
    expect(sanitizeKit({ ...KIT, logos: { lockup: "https://evil.example/logo.png" } }, FEED)?.logo).toBeUndefined();
    expect(sanitizeKit({ ...KIT, schema: 2 }, FEED)).toBeNull();
    expect(sanitizeKit({ ...KIT, roles: { primary: "teal", accents: [] } }, FEED)).toBeNull();
    expect(sanitizeKit("nope", FEED)).toBeNull();
  });
});

describe("withKit", () => {
  it("changes only the colour, the accents and the logo", () => {
    const brand: CarouselBrand = { color: "#1E3A8A", name: "MoneyBees", handle: "@the_moneybees", logo: "data:image/png;base64,AA==", avoidWords: "x", signOff: "y" };
    const cached: CachedKit = { kit: sanitizeKit(KIT, FEED)!, logo: PNG, fetchedAt: "2026-10-22T14:00:00.000Z" };
    expect(withKit(brand, cached)).toEqual({ ...brand, color: "#FFC21A", logo: PNG,
      palette: [{ name: "Navy", hex: "#121A4B" }, { name: "Blue", hex: "#1965B0" }, { name: "Gold", hex: "#FFBB36" }] });
    expect(withKit(brand, { ...cached, logo: undefined }).logo).toBe(brand.logo);
  });
});

describe("refreshKit", () => {
  const T = Date.parse("2026-10-22T14:00:00Z");
  it("caches the kit and its logo, then reuses it for a day", async () => {
    const f = site();
    const r = await refreshKit("moneybees", { fetcher: f, now: T });
    expect(r.ok).toBe(true);
    expect(r.cache?.kit.version).toBe(KIT.version);
    expect(r.cache?.logo).toMatch(/^data:image\/png;base64,/);
    expect(f.mock.calls.map((c) => c[0])).toEqual([FEED, `${KIT.logos.lockup}?v=${KIT.version}`]);
    await refreshKit("moneybees", { fetcher: f, now: T + 3600e3 });
    expect(f).toHaveBeenCalledTimes(2);
    await refreshKit("moneybees", { fetcher: f, now: T + 3600e3, force: true });
    expect(f).toHaveBeenCalledTimes(3); // same version: the logo is not fetched again
  });
  it("keeps the cache when the site fails or serves a schema it doesn't know", async () => {
    await refreshKit("moneybees", { fetcher: site(), now: T });
    const down = await refreshKit("moneybees", { fetcher: site(KIT, false), now: T, force: true });
    expect(down).toMatchObject({ ok: false, cache: { kit: { version: KIT.version } } });
    const two = await refreshKit("moneybees", { fetcher: site({ ...KIT, schema: 2, version: "aaaaaaaaaaaa" }), now: T, force: true });
    expect(two.ok).toBe(false);
    expect(cachedKit("moneybees")?.kit.version).toBe(KIT.version);
    const thrown = await refreshKit("moneybees", { fetcher: vi.fn(async () => { throw new TypeError("offline"); }), now: T, force: true });
    expect(thrown.cache?.kit.version).toBe(KIT.version);
  });
  it("does nothing for a board brand with no feed", async () => {
    const f = site();
    expect(await refreshKit("finternship", { fetcher: f })).toEqual({ cache: null, ok: true });
    expect(await refreshKit(undefined, { fetcher: f })).toEqual({ cache: null, ok: true });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("loadBrand with a kit", () => {
  it("applies the kit only on a profile linked to a board brand with a feed", async () => {
    await refreshKit("moneybees", { fetcher: site(), now: Date.now() });
    saveBrand("u1", { color: "#1E3A8A", name: "Leo", handle: "@leo" });
    expect(loadBrand("u1")?.color).toBe("#1E3A8A");                    // the default profile has no board brand
    const mb = addProfile("u1", "MoneyBees");
    linkBoardBrand("u1", mb.id, "moneybees");
    setActiveProfile("u1", mb.id);
    expect(loadBrand("u1")).toBeNull();                                // nothing saved on this profile yet
    saveBrand("u1", { color: "#1E3A8A", name: "MoneyBees", handle: "@the_moneybees" });
    expect(loadBrand("u1")).toMatchObject({ color: "#FFC21A", name: "MoneyBees", palette: [{ hex: "#121A4B" }, { hex: "#1965B0" }, { hex: "#FFBB36" }] });
    const fi = addProfile("u1", "FINternship");
    linkBoardBrand("u1", fi.id, "finternship");
    setActiveProfile("u1", fi.id);
    saveBrand("u1", { color: "#0F766E", name: "FINternship", handle: "@f" });
    expect(loadBrand("u1")?.color).toBe("#0F766E");
  });
  it("keeps the kit cache out of cloud sync", () => {
    expect(isSyncedKeyFor(KIT_KEY_PREFIX + "moneybees", "u1")).toBe(false);
    expect(KIT_KEY_PREFIX.startsWith("content-studio-")).toBe(false);
  });
});
