import { beforeEach, describe, expect, it } from "vitest";
import { getBreakdown, getInsights, labelForDimension } from "./analytics";
import { saveDrafts, type DraftEntry } from "./draftHistory";

const UID = "0c3e5b8a-5f43-4a3e-9d55-6f0c2b1d7e21";

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

let n = 0;
const posted = (hookFormula: string | undefined, impressions: number, reactions: number, pillar = "topic"): DraftEntry => ({
  id: `p${n++}`, createdAt: "2026-10-01T00:00:00.000Z", hook: "h", draft: "Body", pillar, pillarDetail: "", audience: "general",
  format: "text-post", platform: "linkedin", ctaType: "open-question", status: "posted", postedAt: "2026-10-02T09:00:00.000Z",
  metrics: { impressions, reactions }, ...(hookFormula ? { hookFormula } : {}),
});

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: new MemStorage() };
});

describe("engagement by hook formula", () => {
  it("groups posted posts by the formula their hook used, best first, and leaves out posts without one", () => {
    saveDrafts(UID, [
      posted("number-reveal", 1000, 80),
      posted("number-reveal", 1000, 60),
      posted("list", 1000, 20),
      posted(undefined, 1000, 500),
      posted("no-longer-a-formula", 1000, 500),
    ]);
    const rows = getBreakdown(UID, "hookFormula");
    expect(rows.map((r) => [r.key, r.count, r.avgEngagementRate])).toEqual([
      ["number-reveal", 2, 7],
      ["list", 1, 2],
    ]);
    expect(labelForDimension("hookFormula", "number-reveal")).toBe("Number reveal");
  });

  it("names the formula that works best once it has enough posts", () => {
    saveDrafts(UID, [
      ...[90, 80, 85].map((r) => posted("mistake", 1000, r)),
      ...[20, 25, 15].map((r) => posted("list", 1000, r)),
    ]);
    const titles = getInsights(UID).map((i) => i.title);
    expect(titles).toContain("Double down: Mistake confession");
    expect(titles).toContain("Underperforming: The list");
  });
});
