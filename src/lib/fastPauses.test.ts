import { describe, expect, it } from "vitest";
import { FAST, isFast, outWithin, piecesOf, segLength, srcWithin, withFast } from "./fastPauses";
import { distanceToCut, keepSegments, outputTime, sourceTime, totalLength, type Word } from "./videoEdit";
import { voiceParts } from "./fastExport";
import { cutTimes, outOfSpan } from "./videoMotion";

const W = (w: string, s: number, e: number): Word => ({ w, s, e });
// "Your CPF grows. [2 s] Then you save."
const words = [W("Your", 0.2, 0.5), W("CPF", 0.5, 0.9), W("grows.", 0.9, 1.4), W("Then", 3.4, 3.7), W("you", 3.7, 3.9), W("save.", 3.9, 4.4)];
const base = { trimStart: 0, trimEnd: 0, removeFillers: true, maxPause: 0.6 };

describe("a kept part with a fast stretch", () => {
  const g = { start: 0, end: 4, fast: [[1, 3]] as [number, number][] };

  it("runs at 1x, then 4x, then 1x", () => {
    expect(piecesOf(g)).toEqual([[0, 1, 1], [1, 3, FAST], [3, 4, 1]]);
    expect(segLength(g)).toBeCloseTo(1 + 2 / FAST + 1);
    expect(segLength({ start: 2, end: 5 })).toBe(3);
  });

  it("maps source to edit time and back through the fast stretch", () => {
    expect(outWithin(g, 2)).toBeCloseTo(1.25);
    expect(srcWithin(g, 1.25)).toBeCloseTo(2);
    expect(srcWithin(g, 1.5)).toBeCloseTo(3);
    expect(srcWithin(g, 99)).toBe(4);
  });

  it("plays fast inside the stretch, and stops early before its end when asked", () => {
    expect(isFast(g, 2)).toBe(true);
    expect(isFast(g, 2.9)).toBe(true);
    expect(isFast(g, 2.9, 0.2)).toBe(false);
    expect(isFast(g, 3)).toBe(false);
    expect(isFast({ start: 0, end: 4 }, 2)).toBe(false);
  });

  it("clips each pause to the part it falls in", () => {
    expect(withFast([{ start: 0, end: 2 }, { start: 2.5, end: 5 }], [{ start: 1.5, end: 3 }])).toEqual([
      { start: 0, end: 2, fast: [[1.5, 2]] },
      { start: 2.5, end: 5, fast: [[2.5, 3]] },
    ]);
  });
});

describe("speeding up pauses instead of cutting them", () => {
  it("keeps the pause in at 4x, so the edit is longer than cut by a quarter of the pause", () => {
    const cut = keepSegments(words, 5, base);
    const fast = keepSegments(words, 5, { ...base, pauseFast: true });
    expect(cut).toHaveLength(2);
    expect(fast).toHaveLength(1); // no jump cut
    const pause = fast[0].fast![0];
    expect(pause[0]).toBeCloseTo(1.4 + 0.2); // padding after the sentence end, at 1x
    expect(pause[1]).toBeCloseTo(3.4 - 0.14); // and before the next word
    expect(totalLength(fast)).toBeCloseTo(totalLength(cut) + (pause[1] - pause[0]) / FAST);
  });

  it("maps every word both ways across the fast pause, with no cut inside it", () => {
    const segs = keepSegments(words, 5, { ...base, pauseFast: true });
    for (const w of words) expect(sourceTime(segs, outputTime(segs, w.s)!)).toBeCloseTo(w.s);
    expect(distanceToCut(segs, 1.8)).toBe(Infinity);
    expect(cutTimes(segs)).toEqual([]);
    expect(cutTimes([{ start: 0, end: 4, fast: [[1, 3]] }, { start: 5, end: 6 }])).toEqual([1 + 2 / FAST + 1]);
    expect(outOfSpan(segs, 3.4, 3.7)).toBeCloseTo(outputTime(segs, 3.4)!);
  });

  it("plays a pause kept in review at normal speed", () => {
    const segs = keepSegments(words, 5, { ...base, pauseFast: true, keepCuts: ["p:1.40"] });
    expect(segs[0].fast).toBeUndefined();
  });

  it("leaves the fast pause silent in the fast export's sound", () => {
    const segs = keepSegments(words, 5, { ...base, pauseFast: true });
    const parts = voiceParts(segs);
    expect(parts).toHaveLength(2);
    expect(parts[1].at).toBeCloseTo(parts[0].dur + (segs[0].fast![0][1] - segs[0].fast![0][0]) / FAST);
    expect(parts[1].from).toBeCloseTo(segs[0].fast![0][1]);
  });
});
