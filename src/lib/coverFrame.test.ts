import { describe, expect, it } from "vitest";
import { bestCover, coverTimes, sharpness } from "./coverFrame";

// a checkerboard of 4 px squares, and the same smeared across 9 px
const w = 64, h = 64;
const sharpPx = Array.from({ length: w * h }, (_, i) => ((Math.floor((i % w) / 4) + Math.floor(Math.floor(i / w) / 4)) % 2) * 255);
const blurPx = sharpPx.map((_, i) => {
  const x = i % w, y = Math.floor(i / w);
  let s = 0, n = 0;
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const xx = Math.min(w - 1, Math.max(0, x + dx)), yy = Math.min(h - 1, Math.max(0, y + dy));
    s += sharpPx[yy * w + xx]; n++;
  }
  return s / n;
});
const face = (size: number) => ({ x0: 0.5 - size / 2, y0: 0.3, x1: 0.5 + size / 2, y1: 0.3 + size });

describe("sharpness", () => {
  it("is higher for a sharp picture than the same picture blurred, and 0 for a flat one", () => {
    expect(sharpness(sharpPx, w, h)).toBeGreaterThan(sharpness(blurPx, w, h) * 4);
    expect(sharpness(new Array(w * h).fill(128), w, h)).toBe(0);
    // smooth shading (a bowl of light) has no edges either
    expect(sharpness(sharpPx.map((_, i) => ((i % w) ** 2 + Math.floor(i / w) ** 2) / 40), w, h)).toBeCloseTo(0, 6);
  });
  it("reads only inside the face box", () => {
    const half = sharpPx.map((v, i) => (i % w < w / 2 ? v : 128));
    expect(sharpness(half, w, h, { x0: 0.6, y0: 0.1, x1: 0.9, y1: 0.9 })).toBe(0);
    expect(sharpness(half, w, h, { x0: 0.1, y0: 0.1, x1: 0.4, y1: 0.9 })).toBeGreaterThan(0);
  });
});

describe("the best cover frame", () => {
  it("prefers a sharp big face over a blurred one or a frame with no face", () => {
    const looks = [
      { t: 1, face: face(0.3), sharp: 20 },
      { t: 1.2, face: null, sharp: 100 },
      { t: 1.4, face: face(0.3), sharp: 90 },
      { t: 1.6, face: face(0.15), sharp: 100 },
    ];
    expect(bestCover(looks, 1)?.t).toBe(1.4);
    expect(bestCover([], 1)).toBeNull();
  });
  it("on a tie, the one nearest the line", () => {
    expect(bestCover([{ t: 2, face: face(0.3), sharp: 50 }, { t: 1.2, face: face(0.3), sharp: 50 }], 1)?.t).toBe(1.2);
  });
  it("looks from half a second before the line to 2.5 s in, inside the edit", () => {
    expect(coverTimes(10, 60)).toHaveLength(16);
    expect(coverTimes(10, 60)[0]).toBe(9.5);
    expect(coverTimes(0.2, 1.5)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4]);
  });
});
