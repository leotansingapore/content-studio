import { describe, expect, it } from "vitest";
import { keptBrand, keptBrandKey, type BrandDna } from "./addBrand";

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
