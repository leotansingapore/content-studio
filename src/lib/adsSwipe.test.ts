import { describe, expect, it } from "vitest";
import { ADS, buildAdWriteUrl, daysRunning, facetCounts, searchAds, type AdLike, type SwipeAd } from "./adsSwipe";

const ad = (o: Partial<SwipeAd>): SwipeAd => ({
  adId: "1", advertiser: "Singlife", industry: "Insurance", format: "image", headline: "Travel cover",
  body: "Plans change.\nYour cover should too.", cta: "Learn more", link: null, start: "2026-09-01",
  platforms: ["FACEBOOK"], image: "/ads/1.jpg", libraryUrl: "https://www.facebook.com/ads/library/?id=1",
  hookFamily: "Problem", ...o,
});

describe("adsSwipe", () => {
  it("counts days running from the start date, never negative", () => {
    expect(daysRunning(ad({}), Date.parse("2026-09-11"))).toBe(10);
    expect(daysRunning(ad({ start: "2026-12-01" }), Date.parse("2026-09-11"))).toBeNull();
    expect(daysRunning(ad({ start: null }))).toBeNull();
  });

  it("matches every word across advertiser, hook and copy", () => {
    const list = [ad({}), ad({ adId: "2", advertiser: "DBS", industry: "Banking", hookFamily: "Offer", body: "Zero fees" })];
    expect(searchAds(list, "singlife problem").map((a) => a.adId)).toEqual(["1"]);
    expect(searchAds(list, "fees").map((a) => a.adId)).toEqual(["2"]);
    expect(searchAds(list, "").length).toBe(2);
  });

  it("orders facets by count", () => {
    const list = [ad({}), ad({ adId: "2" }), ad({ adId: "3", industry: "Banking" })];
    expect(facetCounts(list, "industry")).toEqual([{ value: "Insurance", n: 2 }, { value: "Banking", n: 1 }]);
  });

  it("briefs Write with the structure and forbids the ad's wording", () => {
    const url = new URL(buildAdWriteUrl(ad({})), "https://x");
    expect(url.pathname).toBe("/generate");
    const ctx = url.searchParams.get("ctx") ?? "";
    expect(ctx).toContain("Problem hook");
    expect(ctx).toContain("Do not reuse its wording");
    expect(url.searchParams.get("pillar")).toBe("topic");
    expect(url.searchParams.get("source")).toBe("ad:1");
  });

  it("leaves out an unknown industry and hook family, with no null or undefined anywhere", () => {
    const competitor: AdLike = { ...ad({ headline: null }), industry: null, hookFamily: null };
    const url = new URL(buildAdWriteUrl(competitor), "https://x");
    const ctx = url.searchParams.get("ctx") ?? "";
    const detail = url.searchParams.get("detail") ?? "";
    expect(ctx).toContain("Borrow the structure of a paid ad by Singlife, running since 2026-09-01.");
    expect(ctx).not.toContain("hook");
    expect(ctx).toContain("Do not reuse its wording, brand or claims");
    expect(detail).toBe("Like Singlife's ad");
    expect(url.search).not.toMatch(/null|undefined/);
    // a headline still comes through, and an ad with no copy has no empty quote
    const bare = new URL(buildAdWriteUrl({ ...competitor, headline: "Sell more", body: "", start: null }), "https://x").searchParams.get("ctx") ?? "";
    expect(bare).toContain('Its headline: "Sell more".');
    expect(bare).toContain("running since recently");
    expect(bare).not.toContain("opening lines");
  });

  it("keeps a drop ad's URL byte for byte", () => {
    const old = (a: SwipeAd) => {
      const ctx = [
        `Borrow the structure of a paid ad by ${a.advertiser} (${a.industry}), running since ${a.start ?? "recently"}.`,
        `It opens with a ${a.hookFamily} hook.${a.headline ? ` Its headline: "${a.headline}".` : ""}`,
        `Its opening lines: "${a.body.split("\n").filter(Boolean).slice(0, 2).join(" ").slice(0, 280)}"`,
        `Write an organic post for my audience that opens the same KIND of way. Do not reuse its wording, brand or claims, and do not recommend a product.`,
      ].join("\n");
      return `/generate?${new URLSearchParams({ pillar: "topic", detail: `${a.hookFamily} hook, like ${a.advertiser}'s ad`, ctx, source: `ad:${a.adId}` })}`;
    };
    expect(ADS.length).toBeGreaterThan(0);
    for (const a of [...ADS, ad({ headline: null }), ad({ start: null })]) expect(buildAdWriteUrl(a)).toBe(old(a));
  });
});

