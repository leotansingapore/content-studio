import { describe, expect, it } from "vitest";
import { cardAlpha, cardRect } from "./brollCard";

const inside = (r: { x: number; y: number; w: number; h: number }, W: number, H: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H;

describe("where the B-roll card sits", () => {
  it("top: most of the width, under the app's top bar, when nothing is in the way", () => {
    const r = cardRect("top", 1080, 1920, null, null, null);
    expect(r).toEqual({ x: 65, y: 192, w: 950, h: 691 });
  });
  it("top: clear of the face and the captions, smaller when it has to be", () => {
    // face low in the frame, captions at the bottom: the card fits above the face at full size
    expect(cardRect("top", 1080, 1920, [0.5, 0.75], null, [0.76, 0.84])).toEqual({ x: 65, y: 192, w: 950, h: 691 });
    // face in the upper middle: the card goes under it, at 70%
    const r = cardRect("top", 1080, 1920, [0.12, 0.3], null, [0.86, 0.94]);
    expect(r.y / 1920).toBeGreaterThan(0.3);
    expect(r.y / 1920 + r.h / 1920).toBeLessThanOrEqual(0.84);
    expect(inside(r, 1080, 1920)).toBe(true);
  });
  it("side: away from the face, on the right when the face isn't known", () => {
    const right = cardRect("side", 1080, 1920, null, null, null);
    const left = cardRect("side", 1080, 1920, null, 0.7, null);
    expect(right.x + right.w).toBe(1037);
    expect(left.x).toBe(43);
    expect(inside(right, 1080, 1920) && inside(left, 1080, 1920)).toBe(true);
  });
  it("side on a wide frame: a tall card, a little above the middle", () => {
    const r = cardRect("side", 1920, 1080, null, 0.3, null);
    expect(r).toEqual({ x: 1037, y: 119, w: 806, h: 670 });
  });
});

describe("the card's fade", () => {
  it("comes in and goes out over 0.2 s at either end of its cutaway", () => {
    const b = { from: 10, to: 14 };
    expect(cardAlpha(b, 10)).toBe(0);
    expect(cardAlpha(b, 10.1)).toBeCloseTo(0.5);
    expect(cardAlpha(b, 12)).toBe(1);
    expect(cardAlpha(b, 13.9)).toBeCloseTo(0.5);
  });
});
