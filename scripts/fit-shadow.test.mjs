import { describe, expect, it } from "vitest";
import { brandOf, disagrees } from "./fit-shadow.mjs";

describe("fit-shadow", () => {
  it("builds the brand block the app sends", () => {
    expect(brandOf(" MoneyBees ", { oneLiner: " Money basics ", audience: "young-adult", audienceDetail: "earning $4K", topics: ["CPF", " "] })).toEqual({
      name: "MoneyBees",
      oneLiner: "Money basics",
      audience: "young adult: earning $4K",
      topics: ["CPF"],
    });
    expect(brandOf("", { audience: "general", topics: [] })).toEqual({ name: "", oneLiner: "", audience: "", topics: [] });
  });

  it("flags where Jev and Best for you disagree, and nothing without both numbers", () => {
    expect(disagrees(0.8, 0)).toBe(true);
    expect(disagrees(0.3, 0.5)).toBe(true);
    expect(disagrees(0.8, 0.5)).toBe(false);
    expect(disagrees(0.3, 0)).toBe(false);
    expect(disagrees(null, 0)).toBe(false);
    expect(disagrees(0.8, null)).toBe(false);
  });
});
