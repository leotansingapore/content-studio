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
    expect(c.missing.map((r) => r.id)).toEqual(["name", "does", "sells", "edge", "who", "topics", "logo", "voice"]);
  });

  it("saving a name alone counts one row: the kit's untouched default colour is neither known nor a gap until a colour is picked", () => {
    const named = completeness(brandOverview({ ...empty, kit: { ...DEFAULT_BRAND, name: "Ada" } }));
    expect(named).toMatchObject({ set: 1, total: completeness(brandOverview(empty)).total });
    expect(row({ ...empty, kit: { ...DEFAULT_BRAND, name: "Ada" } }, "colours")).toMatchObject({ swatches: [], value: "", note: "Navy, the default" });
    const teal = { ...DEFAULT_BRAND, color: "#0F766E" };
    expect(row({ ...empty, kit: teal }, "colours").swatches).toEqual(["#0F766E"]);
    expect(completeness(brandOverview({ ...empty, kit: teal })).total).toBe(named.total + 1);
    // an extra colour is a choice too, even beside the default main colour
    expect(row({ ...empty, kit: { ...DEFAULT_BRAND, palette: [{ name: "Gold", hex: "#CA8A04" }] } }, "colours").swatches).toEqual([DEFAULT_BRAND.color, "#CA8A04"]);
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
      kit: { ...DEFAULT_BRAND, color: "#0F766E", name: "Ada Tan", logo: "data:image/png;base64,x", offers: [{ name: "Free review", url: "https://a.sg" }], avoidWords: "cheapest\nhustle" },
      positioning: { ...EMPTY_POSITIONING, oneLiner: "I help parents plan", audience: "parent", audienceDetail: "aged 30-48", topics: ["CPF"], edge: "Quarterly plan" },
      voice: { posts: ["a", "b", " "], updatedAt: "" },
    };
    expect(row(i, "name")).toMatchObject({ value: "Ada Tan", to: "/playbook?edit=name" });
    expect(row(i, "does")).toMatchObject({ value: "I help parents plan", to: "/plan" });
    // Brand kit and Your voice are sections of Profile itself since 14 Nov
    expect(row(i, "sells")).toMatchObject({ chips: ["Free review"], to: "/playbook#offers" });
    expect(row(i, "voice").to).toBe("/playbook#voice");
    expect(row(i, "colours").to).toBe("/playbook#colour");
    expect(row(i, "who").chips).toEqual(["Parents", "aged 30-48"]);
    expect(row(i, "voice").value).toBe("2 past posts");
    expect(row(i, "avoid").value).toBe("cheapest, hustle");
    expect(row(i, "colours").swatches).toEqual(["#0F766E"]);
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
    expect(row(i, "price")).toMatchObject({ value: "$9", to: "/brand/products?product=pd-Tracker" });
    expect(row(i, "who").chips).toEqual(["Agents"]);
    expect(row(i, "demos").value).toBe("1 video");
    expect(row({ ...i, proof: " 48 cafes " }, "proof")).toMatchObject({ value: "48 cafes", to: "/brand/products#script-product" });
    expect(isSet(row(i, "media"))).toBe(false);
    // the website reads as its address, without the https:// in front
    expect(row({ ...i, kit: { ...DEFAULT_BRAND, website: "https://acme.sg/about" } }, "website").value).toBe("acme.sg/about");
  });

  it("edits the basics in place and links the rest: offers, colours, sign-off and voice scroll down the page, products and audiences open theirs", () => {
    const edits = (o: Partial<OverviewInput>) => Object.fromEntries(brandOverview({ ...empty, ...o }).flatMap((g) => g.rows).map((r) => [r.id, r.edit ?? null]));
    expect(edits({})).toEqual({
      name: "name", does: "does", country: "country", sells: null, edge: "edge", who: "who", niche: "niche", topics: "topics", logo: "logo", colours: null, voice: null, avoid: "avoid", signoff: null,
    });
    const p = { id: "pd-a", name: "Tracker", what: "", forWho: "", price: "$9", pictures: [], sources: [], use: true, from: "you" as const, addedAt: "" };
    const leo = edits({ leo: true, products: [p] });
    expect(leo).toMatchObject({ website: null, sells: null, price: "price", who: null, proof: "proof", competitors: null, demos: null, media: null });
    // no product yet: the price row adds one on Products instead
    expect(edits({ leo: true }).price).toBeNull();
    // a site's kit sets the colours and logo: they are shown, not edited, and the logo row points at the kit's read-only card
    expect(edits({ kitLocked: true })).toMatchObject({ logo: null, colours: null });
    expect(row({ ...empty, kitLocked: true }, "logo").to).toBe("/playbook#logo");
  });

  it("shows the logo itself as the logo row's value", () => {
    expect(row({ ...empty, kit: { ...DEFAULT_BRAND, logo: "data:image/png;base64,x" } }, "logo").image).toBe("data:image/png;base64,x");
    expect(row(empty, "logo").image).toBeUndefined();
  });
});

describe("Country and Niche", () => {
  it("open in place on the brand kit and are never chased as a gap", () => {
    const groups = brandOverview({ leo: false, kit: null, positioning: null, voice: null });
    const rows = groups.flatMap((g) => g.rows);
    expect(rows.find((r) => r.id === "country")).toMatchObject({ edit: "country", optional: true, value: "" });
    expect(rows.find((r) => r.id === "niche")).toMatchObject({ edit: "niche", optional: true, value: "" });
    expect(completeness(groups).missing.map((r) => r.id)).not.toContain("country");
    const set = brandOverview({ leo: false, kit: { ...DEFAULT_BRAND, country: " Singapore ", niche: "Cafes" }, positioning: null, voice: null }).flatMap((g) => g.rows);
    expect(set.find((r) => r.id === "country")?.value).toBe("Singapore");
    expect(set.find((r) => r.id === "niche")?.value).toBe("Cafes");
  });
});
