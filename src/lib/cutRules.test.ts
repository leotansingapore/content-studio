import { describe, expect, it } from "vitest";
import { mergeSlivers, pauseCut } from "./cutRules";
import { keepSegments, listCuts, outputTime, type Word } from "./videoEdit";

const W = (w: string, s: number, e: number): Word => ({ w, s, e });
const base = { trimStart: 0, trimEnd: 0, removeFillers: true, maxPause: 0.6 };

describe("padding by cut type", () => {
  it("keeps 0.1 s after and 0.08 s before a cut inside a sentence", () => {
    const c = pauseCut(W("your", 1, 1.3), W("CPF", 2.5, 2.8))!;
    expect(c.start).toBeCloseTo(1.4);
    expect(c.end).toBeCloseTo(2.42);
  });

  it("keeps 0.2 s after and 0.14 s before a cut at a sentence end", () => {
    const c = pauseCut(W("matters.", 1, 1.3), W("So", 2.5, 2.7))!;
    expect(c.start).toBeCloseTo(1.5);
    expect(c.end).toBeCloseTo(2.36);
    expect(pauseCut(W('"right?"', 1, 1.3), W("Yes", 2.5, 2.7))!.start).toBeCloseTo(1.5);
  });

  it("leaves a pause too short for its padding alone", () => {
    expect(pauseCut(W("done.", 1, 1.3), W("Next", 1.6, 1.9))).toBeNull();
    expect(listCuts([W("done.", 1, 1.3), W("Next", 1.6, 1.9)], 3, { ...base, maxPause: 0.1 })).toEqual([]);
  });

  it("pads the pause cuts the editor makes", () => {
    const words = [W("It", 0, 0.2), W("works.", 0.2, 0.6), W("Then", 2, 2.3), W("you", 2.3, 2.5), W("save", 3.5, 3.8)];
    const pauses = listCuts(words, 4, base).filter((c) => c.kind === "pause");
    expect(pauses.map((c) => [c.start, c.end].map((t) => Math.round(t * 100) / 100))).toEqual([[0.8, 1.86], [2.6, 3.42]]);
  });
});

describe("merging cuts closer than 0.35 s", () => {
  it("drops a silent sliver between two cuts, so they play as one join", () => {
    // "so [0.1] um [0.2] uh [0.1] I": the 0.2 s of silence between the two cuts goes
    const words = [W("so", 0, 0.3), W("um", 0.4, 0.6), W("uh", 0.8, 1.0), W("I", 1.1, 1.3), W("save.", 1.3, 1.8)];
    const segs = keepSegments(words, 2, { ...base, maxPause: 0 });
    expect(segs).toEqual([{ start: 0, end: 0.4 }, { start: 1.0, end: 2 }]);
  });

  it("never drops a said word, however short its part", () => {
    // "um I uh": the 0.15 s "I" sits between two cuts and stays
    const words = [W("So", 0, 0.4), W("um", 0.4, 0.7), W("I", 0.7, 0.85), W("uh", 0.85, 1.2), W("save.", 1.2, 1.7)];
    const segs = keepSegments(words, 2, { ...base, maxPause: 0 });
    expect(outputTime(segs, 0.78)).not.toBeNull();
    expect(mergeSlivers([{ start: 0.7, end: 0.85 }], [W("I", 0.7, 0.85)])).toHaveLength(1);
    expect(mergeSlivers([{ start: 0.7, end: 0.85 }], [W("I", 0.9, 1.0)])).toHaveLength(0);
  });
});
