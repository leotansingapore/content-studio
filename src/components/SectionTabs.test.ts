import { describe, expect, it } from "vitest";
import { edgeFade, revealBy } from "./SectionTabs";

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

describe("edge fade", () => {
  it("fades only the side with tabs past it, and nothing when the row fits", () => {
    expect(edgeFade(0, 358, 358)).toBeUndefined();
    // at the start of a longer row: the right edge fades, the left stays solid
    expect(edgeFade(0, 358, 600)).toBe("linear-gradient(to right, #000, #000 28px, #000 calc(100% - 28px), transparent)");
    expect(edgeFade(120, 358, 600)).toBe("linear-gradient(to right, transparent, #000 28px, #000 calc(100% - 28px), transparent)");
    // scrolled to the end, half a pixel of rounding and all
    expect(edgeFade(241.5, 358, 600)).toBe("linear-gradient(to right, transparent, #000 28px, #000 calc(100% - 28px), #000)");
  });
});
