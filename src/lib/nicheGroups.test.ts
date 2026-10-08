import { describe, expect, it } from "vitest";
import advisors from "@/data/advisors.json";
import { NICHE_GROUPS, inNicheGroups, nicheGroup } from "./nicheGroups";

describe("niche groups", () => {
  it("maps every niche in the creators data to a parent topic", () => {
    const niches = new Set((advisors as { niche: string[] }[]).flatMap((a) => a.niche));
    expect([...niches].filter((n) => !nicheGroup(n))).toEqual([]);
  });

  it("keeps the filter short and each niche in one group", () => {
    expect(NICHE_GROUPS.length).toBeLessThanOrEqual(9);
    const all = NICHE_GROUPS.flatMap((g) => g.niches);
    expect(new Set(all).size).toBe(all.length);
  });

  it("matches a creator when any niche falls in a picked group", () => {
    expect(inNicheGroups(["etfs", "budgeting"], new Set(["Investing"]))).toBe(true);
    expect(inNicheGroups(["etfs"], new Set(["Insurance"]))).toBe(false);
    expect(inNicheGroups(["etfs"], new Set())).toBe(true);
  });
});
