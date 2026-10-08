import { describe, expect, it } from "vitest";
import { toCommitted } from "./ads-swipe.mjs";

describe("ads-swipe drop", () => {
  it("keeps only complete ads and points pictures at the site copy", () => {
    const out = toCommitted({
      fetched: "2026-10-12",
      ads: [
        { adId: "123", advertiser: "Singlife", industry: "Insurance", format: "image", body: "b", image: "123.jpg", hookFamily: "Offer", start: "2026-09-01" },
        { adId: "456", advertiser: "X", industry: "Y", format: "image", body: "b", image: "456.jpg", hookFamily: null },
        { adId: "../evil", advertiser: "X", industry: "Y", format: "image", body: "b", image: "e.jpg", hookFamily: "Offer" },
      ],
    });
    expect(out.fetched).toBe("2026-10-12");
    expect(out.ads.map((a) => a.adId)).toEqual(["123"]);
    expect(out.ads[0].image).toBe("/ads/123.jpg");
    expect(out.ads[0].libraryUrl).toBe("https://www.facebook.com/ads/library/?id=123");
  });
});
