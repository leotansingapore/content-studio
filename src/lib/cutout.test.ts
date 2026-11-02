import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/faceVision", () => ({ lib: vi.fn(), files: vi.fn() }));
vi.mock("@/lib/deviceFiles", () => ({ putFile: vi.fn() }));
const { maskAlpha } = await import("@/lib/cutout");

describe("maskAlpha", () => {
  it("keeps the confident pixels, softens the edge band and boxes what it kept", () => {
    // a 4x3 mask: one sure pixel at (1,1), an edge pixel at (2,1), a doubtful one at (3,2)
    const conf = new Float32Array(12);
    conf[5] = 0.95;
    conf[6] = 0.5;
    conf[11] = 0.2;
    const { alpha, box } = maskAlpha(conf, 4, 3);
    expect(alpha[5]).toBe(255);
    expect(alpha[6]).toBeGreaterThan(100);
    expect(alpha[6]).toBeLessThan(155);
    expect(alpha[11]).toBe(0);
    expect(box).toEqual({ x: 1, y: 1, w: 2, h: 1 });
  });

  it("finds no box when nothing passes", () => {
    expect(maskAlpha(new Float32Array(9).fill(0.1), 3, 3).box).toBeNull();
  });
});
