import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrand, keptBrand, keptBrandKey, newBrandKit, PROFESSION_NEEDED, readBody, type BrandDna } from "./addBrand";
import { loadBrand } from "./carousel";
import { loadPositioning } from "./positioning";
import { activeProfileId, loadProfiles } from "./profiles";

const CARDS = ["identity", "colour", "social", "offer", "topics", "voice"] as const;
const dna: BrandDna = {
  url: "https://acme.sg",
  name: "Acme Advisory",
  colour: "#0f766e",
  logo: null,
  handles: { instagram: "acme.sg" },
  oneLiner: "We help young families plan their CPF.",
  audience: "parent",
  audienceDetail: "Parents with kids under 10",
  topics: ["CPF", "HDB"],
  edge: "Plain answers",
  voice: "Warm and plain.",
};

describe("keptBrand", () => {
  it("puts back a site read and the cards already checked", () => {
    const raw = JSON.stringify({ address: "acme.sg", name: "", justName: false, dna, done: ["identity", "colour"] });
    expect(keptBrand(raw, CARDS)).toEqual({ address: "acme.sg", name: "", justName: false, profession: "", dna, done: ["identity", "colour"] });
  });

  it("puts back what the person said they do, even when nothing else was typed", () => {
    expect(keptBrand(JSON.stringify({ profession: "Coach" }), CARDS)).toMatchObject({ profession: "Coach", dna: null });
    expect(keptBrand(JSON.stringify({ address: "acme.sg", profession: 7 }), CARDS)).toMatchObject({ profession: "" });
  });

  it("keeps a typed address or name before any read", () => {
    expect(keptBrand(JSON.stringify({ address: "acme.sg" }), CARDS)).toMatchObject({ address: "acme.sg", dna: null, done: [] });
    expect(keptBrand(JSON.stringify({ name: "MoneyBees", justName: true }), CARDS)).toMatchObject({ name: "MoneyBees", justName: true });
  });

  it("drops a read that is not the right shape, and cards it does not know", () => {
    const bad = { ...dna, topics: "CPF" };
    expect(keptBrand(JSON.stringify({ address: "acme.sg", dna: bad, done: ["identity"] }), CARDS)).toMatchObject({ address: "acme.sg", dna: null });
    expect(keptBrand(JSON.stringify({ address: "a.sg", dna, done: ["identity", "nope", 3] }), CARDS)?.done).toEqual(["identity"]);
  });

  it("returns null for nothing worth putting back or text that isn't JSON", () => {
    expect(keptBrand(null, CARDS)).toBeNull();
    expect(keptBrand("{oops", CARDS)).toBeNull();
    expect(keptBrand(JSON.stringify({ address: "", name: "" }), CARDS)).toBeNull();
    expect(keptBrand("[]", CARDS)).toBeNull();
  });

  it("is kept per sign-in, outside the synced prefix", () => {
    expect(keptBrandKey("u1")).toBe("cs-addbrand-form-u1");
    expect(keptBrandKey("u1").startsWith("content-studio-")).toBe(false);
  });
});

// Pinned on today's /brands/new (before brand-from-website): everyone else's request and new kit stay exactly these.
describe("what /brands/new sends and saves", () => {
  it("sends the address only", () => {
    expect(readBody("acme.sg")).toStrictEqual({ url: "acme.sg" });
  });

  it("saves the name, handle, colour, logo and handles in the new kit, nothing more", () => {
    expect(newBrandKit({ ...dna, logo: "data:image/png;base64,AAAA", handles: { instagram: "@acme.sg", facebook: "acmesg" } }, "Acme")).toStrictEqual({
      color: "#0f766e",
      name: "Acme",
      handle: "@acme.sg",
      logo: "data:image/png;base64,AAAA",
      instagram: "acme.sg",
      facebook: "acmesg",
    });
    expect(newBrandKit({ ...dna, colour: null, handles: {} }, "Acme")).toStrictEqual({ color: "#1E3A8A", name: "Acme", handle: "" });
  });
});

describe("Leo's /brands/new (brand-from-website)", () => {
  it("asks for the deep read", () => {
    expect(readBody("acme.sg", true)).toStrictEqual({ url: "acme.sg", deep: true });
    expect(readBody("acme.sg", false)).toStrictEqual({ url: "acme.sg" });
  });

  it("keeps the site and when it was read in the new kit", () => {
    expect(newBrandKit({ ...dna, readAt: "2026-10-21T08:00:00.000Z" }, "Acme")).toStrictEqual({
      color: "#0f766e",
      name: "Acme",
      handle: "@acme.sg",
      instagram: "acme.sg",
      website: "https://acme.sg",
      websiteReadAt: "2026-10-21T08:00:00.000Z",
    });
  });
});

describe("creating a brand (Add a brand)", () => {
  const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
  const mem = () => {
    const m = new Map<string, string>();
    return { get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() };
  };
  beforeEach(() => {
    const s = mem();
    vi.stubGlobal("window", { localStorage: s, location: { pathname: "/brands/new", search: "", hash: "" }, history: { state: null, replaceState: () => undefined } });
    vi.stubGlobal("localStorage", s);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("creates nothing until What do you do? has an answer, and says why", () => {
    for (const profession of ["", "   "]) {
      expect(createBrand(UID, "Ada Homes", null, profession, null)).toEqual({ ok: false, error: PROFESSION_NEEDED });
      expect(createBrand(UID, "Ada Homes", dna, profession, null)).toEqual({ ok: false, error: PROFESSION_NEEDED });
    }
    expect(loadProfiles(UID).map((p) => p.id)).toEqual(["me"]);
    expect(loadBrand(UID)).toBeNull();
  });

  it("saves the answer on the new brand's kit, with or without a site read, and opens the brand", () => {
    const named = createBrand(UID, "Ada Homes", null, "Real estate agent", null);
    if (named.ok === false) throw new Error(named.error);
    expect(activeProfileId(UID)).toBe(named.id);
    expect(loadBrand(UID)?.profession).toBe("Real estate agent");
    const read = createBrand(UID, "Acme Advisory", dna, "Financial adviser", null);
    if (read.ok === false) throw new Error(read.error);
    expect(activeProfileId(UID)).toBe(read.id);
    expect(loadBrand(UID)).toMatchObject({ name: "Acme Advisory", profession: "Financial adviser", color: "#0F766E" });
    expect(loadPositioning(UID)?.oneLiner).toBe("We help young families plan their CPF.");
  });
});
