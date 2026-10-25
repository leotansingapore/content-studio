import { describe, expect, it } from "vitest";
import { withReal } from "./analytics";
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
