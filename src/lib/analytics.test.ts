import { describe, expect, it } from "vitest";
import { parseCount, withReal } from "./analytics";
import type { DraftEntry } from "./draftHistory";

const post = (extra: Partial<DraftEntry>): DraftEntry => ({
  id: "s", createdAt: "2026-10-01T00:00:00.000Z", hook: "Hook", draft: "Body", pillar: "", pillarDetail: "", audience: "", format: "", platform: "instagram", ctaType: "",
  status: "posted", metrics: { impressions: 10, reactions: 1 }, ...extra,
});
const numbers = (views: number) => ({ impressions: views, reach: views, views, likes: 40, comments: 3, shares: 2, saves: 5, at: "2026-10-08T02:00:00.000Z" });

describe("withReal", () => {
  it("uses a hand-linked post's live numbers when it has no Zernio numbers", () => {
    const d = post({ live: { postId: "m1", platform: "instagram", url: null, by: "jev", numbers: numbers(500) } });
    expect(withReal(d).metrics).toEqual({ impressions: 500, reactions: 40, comments: 3, shares: 2 });
    const both = post({ zernio: { key: "k", postId: "p", numbers: numbers(900) }, live: { postId: "m1", platform: "instagram", url: null, by: "you", numbers: numbers(500) } });
    expect(withReal(both).metrics?.impressions).toBe(900);
    const typed = post({ live: { postId: "m1", platform: "instagram", url: null, by: "you" } });
    expect(withReal(typed)).toBe(typed);
  });
});

describe("parseCount: a typed count as the apps show it", () => {
  it("reads plain numbers, thousands marks and k or M", () => {
    expect(["1200", " 1,200 ", "1.200", "1 200", "1,234,567"].map(parseCount)).toEqual([1200, 1200, 1200, 1200, 1234567]);
    expect(["1.2k", "1.2K", "12k", "1,5k", "3M", "2.5 m", "0"].map(parseCount)).toEqual([1200, 1200, 12000, 1500, 3000000, 2500000, 0]);
  });
  it("refuses what isn't a count instead of guessing", () => {
    expect(["", "abc", "1.2", "1,20", "-5", "12x", "1.2.3k"].map(parseCount)).toEqual([null, null, null, null, null, null, null]);
  });
});
