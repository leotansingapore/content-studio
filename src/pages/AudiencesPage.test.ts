import { describe, expect, it } from "vitest";
import { examplesFor } from "./AudiencesPage";

describe("examplesFor", () => {
  it("keeps an adviser's family-money examples and gives any other brand examples with no money or family in them", () => {
    expect(examplesFor(true).who).toContain("hospital bills");
    const other = Object.values(examplesFor(false)).join(" ");
    expect(other).not.toMatch(/hospital|kids|parents|childcare|CPF/i);
  });
});
