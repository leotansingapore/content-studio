import { describe, expect, it } from "vitest";
import { CUT_THRESHOLD, MAX_FRAMES, detectCuts, pacingOf, pickFrameTimes } from "./reelFrames";

describe("detectCuts", () => {
  it("marks a sample that differs past the threshold, and a two-sample fade once", () => {
    const hi = CUT_THRESHOLD + 0.1;
    const lo = CUT_THRESHOLD - 0.05;
    expect(detectCuts([0, lo, hi, lo, lo, hi, hi, lo, hi], 0.5)).toEqual([1, 2.5, 4]);
    expect(detectCuts([hi, lo, lo], 0.5)).toEqual([]);
    expect(detectCuts([0, CUT_THRESHOLD], 1)).toEqual([]);
  });
});

describe("pacingOf", () => {
  it("counts cuts, the average shot and the cuts in the hook", () => {
    expect(pacingOf([1, 2.5, 4, 20], 41.6)).toEqual({ durationSec: 42, cuts: 4, avgShotSec: 8.3, cutsFirst3s: 2 });
    expect(pacingOf([], 30)).toEqual({ durationSec: 30, cuts: 0, avgShotSec: 30, cutsFirst3s: 0 });
  });
});

describe("pickFrameTimes", () => {
  it("takes the opening, settles after each cut and drops near-duplicates", () => {
    expect(pickFrameTimes([1, 2.5, 4, 9, 15], 30)).toEqual([0.3, 1.4, 2.9, 4.4, 9.4, 15.4]);
  });

  it("fills evenly when a talking head barely cuts", () => {
    expect(pickFrameTimes([], 40)).toEqual([0.3, 1.5, 10, 20, 30, 38]);
  });

  it("never goes past the end and thins long cut lists to the cap, keeping the opening", () => {
    const cuts = Array.from({ length: 40 }, (_, i) => 2 + i * 1.5);
    const times = pickFrameTimes(cuts, 62);
    expect(times).toHaveLength(MAX_FRAMES);
    expect(times.slice(0, 2)).toEqual([0.3, 1.5]);
    expect(Math.max(...times)).toBeLessThanOrEqual(61.9);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(new Set(times).size).toBe(times.length);
  });
});
