import { describe, expect, it } from "vitest";
import { brandOverview, completeness, isSet, type OverviewInput } from "./brandOverview";
import { DEFAULT_BRAND } from "./carousel";
import { EMPTY_POSITIONING } from "./positioning";

const empty: OverviewInput = { leo: false, kit: null, positioning: null, voice: null };
const row = (i: OverviewInput, id: string) => brandOverview(i).flatMap((g) => g.rows).find((r) => r.id === id)!;

describe("brandOverview", () => {
  it("a brand with nothing saved has every required row missing, and the default colour is not counted as known", () => {
    const c = completeness(brandOverview(empty));
    expect(c.set).toBe(0);
    expect(c.missing.map((r) => r.id)).toEqual(["name", "does", "sells", "edge", "who", "topics", "logo", "colours", "voice"]);
  });

  it("optional rows count only once they are set", () => {
    const before = completeness(brandOverview(empty)).total;
    const after = completeness(brandOverview({ ...empty, kit: { ...DEFAULT_BRAND, signOff: "DM me PLAN" } }));
    expect(after.total).toBe(before + 1);
    expect(after.missing.some((r) => r.id === "avoid")).toBe(false);
  });

  it("reads each row from the store that owns it and links to where it is edited", () => {
    const i: OverviewInput = {
      ...empty,
      kit: { ...DEFAULT_BRAND, name: "Ada Tan", logo: "data:image/png;base64,x", offers: [{ name: "Free review", url: "https://a.sg" }], avoidWords: "cheapest\nhustle" },
      positioning: { ...EMPTY_POSITIONING, oneLiner: "I help parents plan", audience: "parent", audienceDetail: "aged 30-48", topics: ["CPF"], edge: "Quarterly plan" },
      voice: { posts: ["a", "b", " "], updatedAt: "" },
    };
    expect(row(i, "name")).toMatchObject({ value: "Ada Tan", to: "/brand#you" });
    expect(row(i, "does")).toMatchObject({ value: "I help parents plan", to: "/plan" });
    expect(row(i, "sells")).toMatchObject({ chips: ["Free review"], to: "/brand#offers" });
    expect(row(i, "who").chips).toEqual(["Parents", "aged 30-48"]);
    expect(row(i, "voice").value).toBe("2 past posts");
    expect(row(i, "avoid").value).toBe("cheapest, hustle");
    expect(row(i, "colours").swatches).toEqual([DEFAULT_BRAND.color]);
    expect(completeness(brandOverview(i)).missing).toEqual([]);
  });

  it("keeps Leo-only rows off everyone else's page", () => {
    const ids = (leo: boolean) => brandOverview({ ...empty, leo }).flatMap((g) => g.rows.map((r) => r.id));
    for (const id of ["website", "price", "proof", "competitors", "demos", "media"]) {
      expect(ids(false)).not.toContain(id);
      expect(ids(true)).toContain(id);
    }
    expect(brandOverview({ ...empty, leo: false }).flatMap((g) => g.rows).every((r) => !/audiences|competitors|media/.test(r.to))).toBe(true);
  });

  it("on Leo's sign-ins products and saved audiences lead, and only ones in use", () => {
    const p = (name: string, use: boolean) => ({ id: `pd-${name}`, name, what: "", forWho: "", price: "$9", pictures: [], sources: [], use, from: "you" as const, addedAt: "" });
    const a = (name: string, offAt?: string) => ({ id: name, name, who: "", lifeStage: "general" as const, cares: [], source: "you" as const, createdAt: "", offAt });
    const i: OverviewInput = { ...empty, leo: true, products: [p("Off", false), p("Tracker", true)], audiences: [a("Agents"), a("Gone", "2026-01-01")], competitors: [{ name: "Outfield" }], demos: 1, media: 0 };
    expect(row(i, "sells").chips).toEqual(["Tracker"]);
    expect(row(i, "price")).toMatchObject({ value: "$9", to: "/brand?product=pd-Tracker#products" });
    expect(row(i, "who").chips).toEqual(["Agents"]);
    expect(row(i, "demos").value).toBe("1 video");
    expect(row({ ...i, proof: " 48 cafes " }, "proof")).toMatchObject({ value: "48 cafes", to: "/brand#script-product" });
    expect(isSet(row(i, "media"))).toBe(false);
    // the website reads as its address, without the https:// in front
    expect(row({ ...i, kit: { ...DEFAULT_BRAND, website: "https://acme.sg/about" } }, "website").value).toBe("acme.sg/about");
  });
});
