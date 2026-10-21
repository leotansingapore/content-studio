import { describe, expect, it } from "vitest";
import { keptBrand, keptBrandKey, newBrandKit, readBody, type BrandDna } from "./addBrand";

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
    expect(keptBrand(raw, CARDS)).toEqual({ address: "acme.sg", name: "", justName: false, dna, done: ["identity", "colour"] });
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
