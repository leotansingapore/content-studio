import { describe, expect, it } from "vitest";
import { CREDIT_USD, avatarCredits, clipCredits, creditsUsd, explainerCredits } from "../ai-video/logic";
import { AVATAR_MAX, NO_PRICE, PRICES, WRITE_PRICE, priceOf, priceText, sumPrices } from "./prices";
import { DAILY_LIMITS, type UsageFeature } from "./usageCaps";

describe("the price table", () => {
  // The guard that makes the next paid cap declare a price.
  it("prices every cap or lists it on NO_PRICE, never both and never neither", () => {
    for (const f of Object.keys(DAILY_LIMITS) as UsageFeature[]) {
      expect([f in PRICES, NO_PRICE.includes(f)].filter(Boolean), f).toHaveLength(1);
    }
    for (const f of [...Object.keys(PRICES), ...NO_PRICE]) expect(Object.keys(DAILY_LIMITS), f).toContain(f);
    expect(new Set(NO_PRICE).size).toBe(NO_PRICE.length);
  });

  it("prices the phase-1 remix caps up front and keeps the fit check free", () => {
    expect(priceOf("remix-make")).toEqual({ usd: 0.02, kind: "about" });
    expect(priceOf("remix-teardown")).toEqual({ usd: 0.01, kind: "about" });
    expect(priceOf("remix-link")).toEqual({ usd: 0.01, kind: "about" });
    expect(priceOf("remix-image")).toEqual({ usd: 0.02, kind: "about" });
    expect(priceOf("remix-fit")).toBeNull();
  });

  it("prices the phase-2 caps up front, with the chips the brief names", () => {
    const chip = (f: UsageFeature) => priceText(priceOf(f) as { usd: number; kind: "about" });
    expect(chip("competitor-read")).toBe("Under US$0.01");
    expect(chip("competitor-suggest")).toBe("Up to US$0.02");
    expect(chip("competitor-ads")).toBe("Up to US$0.17");
    expect(chip("competitor-posts")).toBe("Up to US$0.12");
    expect(chip("space-ads")).toBe("Up to US$0.52");
    expect(chip("viral-search")).toBe("About US$0.08");
    expect(chip("post-tags")).toBe("About US$0.01");
    expect(chip("search-topics")).toBe("Up to US$0.10");
    expect(chip("remix-patterns")).toBe("About US$0.01");
    for (const f of ["competitor-ads-global", "competitor-posts-global", "space-ads-global", "ad-labels", "niche-match",
      "viral-search-global", "brief-pick", "creator-fit", "search-topics-global"] as UsageFeature[]) {
      expect(priceOf(f), f).toBeNull();
    }
  });

  it("prices AI video from the Higgsfield credits", () => {
    expect(priceOf("ai-video", { slices: [7.5, 7.5] })).toEqual({ usd: avatarCredits([7.5, 7.5]) * CREDIT_USD, kind: "about" });
    expect((priceOf("ai-video", { slices: [7.5, 7.5] }) as { usd: number }).usd).toBe(2.75);
    // before the voiceover exists, 15 s from the script's words gives the same 2 slices
    expect(priceOf("ai-video", { seconds: 15 })).toEqual(priceOf("ai-video", { slices: [7.5, 7.5] }));
    expect(priceOf("ai-video", { seconds: 25 })).toEqual({ usd: creditsUsd(avatarCredits([9.5, 9.5, 6])), kind: "about" });
    // cut like planSlices, so a short last slice bills 5 s and the price does not drop once the voiceover exists
    expect(priceText(priceOf("ai-video", { seconds: 12 }) as { usd: number; kind: "about" })).toBe("About US$2.06");
    // never past what the server takes: 30 s and 4 slices
    expect(priceOf("ai-video", { seconds: 40 })).toEqual(priceOf("ai-video", { seconds: 30 }));
    expect(priceText(priceOf("ai-video", { seconds: 40 }) as { usd: number; kind: "about" })).toBe("About US$4.81");
    expect(priceOf("ai-video", { slices: [9.5, 9.5, 9.5, 9.5, 9.5] })).toEqual({ usd: 5.5, kind: "about" });
    expect(priceText(AVATAR_MAX)).toBe("Up to US$5.50");
    expect(sumPrices(priceOf("remix-make"), AVATAR_MAX)).toMatchObject({ kind: "upTo" });
    expect(priceOf("ai-video", { scenes: 5 })).toEqual({ usd: explainerCredits(5) * CREDIT_USD, kind: "about" });
    expect(priceOf("ai-clip", { seconds: 8, quality: "720p" })).toEqual({ usd: clipCredits(8, "720p") * CREDIT_USD, kind: "about" });
  });

  it("asks for the options a price depends on", () => {
    expect(priceOf("ai-video")).toBe("pick");
    expect(priceOf("ai-clip", { seconds: 8 })).toBe("pick");
    expect(priceOf("ai-clip", { seconds: 6, quality: "720p" })).toBe("pick");
    expect(priceOf("ai-music")).toBe("pick");
    expect(priceOf("video-transcribe", { minutes: 0 })).toBe("pick");
  });

  it("moves with the options", () => {
    expect(priceOf("ai-music", { minutes: 1 })).toEqual({ usd: 0.15, kind: "about" });
    expect(priceOf("ai-music", { minutes: 5 })).toEqual({ usd: 0.3, kind: "about" });
    expect(priceOf("video-transcribe", { minutes: 10 })).toMatchObject({ kind: "about" });
    expect((priceOf("video-transcribe", { minutes: 10 }) as { usd: number }).usd).toBeCloseTo(0.06);
    expect(priceText(priceOf("video-clips", { passes: 3 }) as { usd: number; kind: "about" })).toBe("About US$0.06");
    expect(priceOf("video-clips")).toEqual({ usd: 0.02, kind: "about" });
  });

  it("gives null for a cap on NO_PRICE", () => {
    expect(priceOf("post-score")).toBeNull();
    expect(priceOf("ai-video-global")).toBeNull();
  });
});

describe("priceText", () => {
  it("writes the four shapes", () => {
    expect(priceText({ usd: creditsUsd(44), kind: "about" })).toBe("About US$2.75");
    // 4 s at 480p is 13.2 credits, US$0.825, which shows as US$0.82
    expect(priceText({ usd: creditsUsd(clipCredits(4, "480p")), kind: "from" })).toBe("From US$0.82");
    expect(priceText({ usd: creditsUsd(88), kind: "upTo" })).toBe("Up to US$5.50");
    expect(priceText(priceOf("ai-image") as { usd: number; kind: "about" })).toBe("Under US$0.01");
    expect(priceText(WRITE_PRICE)).toBe("About US$0.01");
  });
});

describe("sumPrices", () => {
  const about = (usd: number) => ({ usd, kind: "about" as const });
  it("adds up US$ and skips nulls", () => {
    expect(sumPrices(about(0.02), null, about(0.03))).toEqual({ usd: 0.05, kind: "about" });
    expect(sumPrices(null, null)).toBeNull();
    expect(sumPrices()).toBeNull();
  });
  it("gives pick when any part is still missing its options", () => {
    expect(sumPrices(about(0.02), "pick", { usd: 1, kind: "upTo" })).toBe("pick");
  });
  it("takes upTo over from over about", () => {
    expect(sumPrices(about(0.02), { usd: 5.5, kind: "upTo" })).toMatchObject({ kind: "upTo" });
    expect(sumPrices(about(0.02), { usd: 0.82, kind: "from" })).toMatchObject({ kind: "from" });
    expect(sumPrices({ usd: 0.82, kind: "from" }, { usd: 5.5, kind: "upTo" })).toMatchObject({ kind: "upTo" });
  });
});
