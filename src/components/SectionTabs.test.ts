import { describe, expect, it } from "vitest";
import { revealBy } from "./SectionTabs";

describe("revealBy", () => {
  const row = { left: 16, right: 374 };
  it("leaves a tab that already shows whole where it is", () => {
    expect(revealBy(row, { left: 100, right: 200 })).toBe(0);
  });
  it("scrolls right past a tab cut off at the right edge, with a little of the next one", () => {
    expect(revealBy(row, { left: 320, right: 448 })).toBe(448 - 374 + 24);
  });
  it("scrolls left back to a tab cut off at the left edge", () => {
    expect(revealBy(row, { left: -40, right: 60 })).toBe(-40 - 16 - 24);
  });
});
