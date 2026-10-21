import { describe, expect, it } from "vitest";
import { STARTER_SETS } from "./starterSets";

describe("starter sets", () => {
  it("has 8 sets with unique ids and names, 12 photos or 8 clips each", () => {
    expect(STARTER_SETS).toHaveLength(8);
    expect(new Set(STARTER_SETS.map((s) => s.id)).size).toBe(8);
    expect(new Set(STARTER_SETS.map((s) => s.name.toLowerCase())).size).toBe(8);
    for (const s of STARTER_SETS) expect(s.count).toBe(s.kind === "photos" ? 12 : 8);
  });
  it("searches with non-empty ASCII queries, and no set is called AI images", () => {
    for (const s of STARTER_SETS) {
      expect(s.queries.length).toBeGreaterThan(0);
      for (const q of s.queries) expect(q.trim() && /^[\x20-\x7e]+$/.test(q)).toBeTruthy();
      expect(s.name.length).toBeLessThanOrEqual(40);
      expect(s.name.toLowerCase()).not.toBe("ai images");
    }
  });
});
