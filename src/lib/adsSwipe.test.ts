import { describe, expect, it } from "vitest";
import { buildAdWriteUrl, daysRunning, facetCounts, searchAds, type SwipeAd } from "./adsSwipe";

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
  });
});
