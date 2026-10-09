import { describe, expect, it } from "vitest";
import { coldCandidates, coldLength, sanitizeColdOpen, withColdOpen } from "./coldOpen";
import { heardWords, outIn, outputCues, segAt, sourceTime, speechSpans, totalLength, type Segment, type Word } from "./videoEdit";

const W = (w: string, s: number, e: number): Word => ({ w, s, e });
// 0-3 s an opener, 4-6 s a set-up, 8-11 s the strong line, 12-14 s a close
const words: Word[] = [
  W("I", 0.1, 0.3), W("think", 0.3, 0.6), W("most", 0.6, 0.9), W("people", 0.9, 1.2), W("wait.", 1.2, 1.6),
  W("Here", 4.0, 4.3), W("is", 4.3, 4.5), W("the", 4.5, 4.7), W("thing.", 4.7, 5.2),
  W("You", 8.0, 8.3), W("pay", 8.3, 8.6), W("$100,000", 8.6, 9.6), W("to", 9.6, 9.8), W("start.", 9.8, 10.4),
  W("Start", 12.0, 12.4), W("small", 12.4, 12.8), W("and", 12.8, 13.0), W("cheap.", 13.0, 13.6),
];
const segs: Segment[] = [{ start: 0, end: 1.8 }, { start: 3.9, end: 5.4 }, { start: 7.9, end: 10.6 }, { start: 11.9, end: 13.9 }];
const line = { s: 7.94, e: 10.52, repeat: true };

describe("a stored cold open", () => {
  it("is kept when well formed, repeat by default", () => {
    expect(sanitizeColdOpen({ s: 1, e: 3 })).toEqual({ s: 1, e: 3, repeat: true });
    expect(sanitizeColdOpen({ s: 1, e: 3, repeat: false })?.repeat).toBe(false);
    expect(sanitizeColdOpen({ s: 3, e: 1 })).toBeUndefined();
    expect(sanitizeColdOpen({ s: 0, e: 30 })).toBeUndefined();
    expect(sanitizeColdOpen("x")).toBeUndefined();
  });
});

describe("the kept parts with a cold open", () => {
  it("repeat: the line first, then the whole edit with the line in its place", () => {
    const out = withColdOpen(segs, line);
    expect(out[0]).toEqual({ start: 7.94, end: 10.52 });
    expect(out.slice(1)).toEqual(segs);
    expect(totalLength(out)).toBeCloseTo(totalLength(segs) + 2.58);
    expect(coldLength(out, line)).toBeCloseTo(2.58);
  });
  it("move: the line first, then the edit without it", () => {
    const out = withColdOpen(segs, { ...line, repeat: false });
    expect(out.map((g) => [g.start, g.end])).toEqual([[7.94, 10.52], [0, 1.8], [3.9, 5.4], [7.9, 7.94], [10.52, 10.6], [11.9, 13.9]].filter(([a, b]) => b - a >= 0.04));
    expect(totalLength(out)).toBeCloseTo(totalLength(segs) - 0.04, 1);
  });
  it("keeps the cuts inside the line and its sped-up pauses", () => {
    const cut: Segment[] = [{ start: 0, end: 1.8 }, { start: 7.9, end: 9.0, fast: [[8.7, 8.9]] }, { start: 9.5, end: 10.6 }];
    expect(withColdOpen(cut, line).slice(0, 2)).toEqual([{ start: 7.94, end: 9.0, fast: [[8.7, 8.9]] }, { start: 9.5, end: 10.52 }]);
  });
  it("changes nothing with no line, a line cut away, or a line that already opens the edit", () => {
    expect(withColdOpen(segs, undefined)).toBe(segs);
    expect(withColdOpen(segs, { s: 2, e: 3.5, repeat: true })).toBe(segs);
    expect(withColdOpen(segs, { s: 0, e: 1.7, repeat: true })).toBe(segs);
  });
});

describe("everything timed on the edit follows the reordered parts", () => {
  const out = withColdOpen(segs, line);
  it("hears the line twice, first at the start", () => {
    const heard = heardWords(words, out).map((h) => h.w);
    expect(heard.slice(0, 5)).toEqual(["You", "pay", "$100,000", "to", "start."]);
    expect(heard.filter((w) => w === "$100,000")).toHaveLength(2);
    expect(heardWords(words, segs).map((h) => h.w)).toEqual(words.map((w) => w.w));
  });
  it("ducks the music under the teaser too, and the subtitles show the line both times", () => {
    expect(speechSpans(words, out)[0].s).toBeCloseTo(0.06);
    const cues = outputCues(words, out, true);
    expect(cues.filter((c) => c.text.includes("$100,000"))).toHaveLength(2);
    expect(cues.every((c, i) => i === 0 || c.s >= cues[i - 1].s)).toBe(true);
  });
  it("a line heard again straight after part of itself gets a subtitle of its own", () => {
    const again: Segment[] = [{ start: 8.6, end: 10.6 }, { start: 7.9, end: 10.6 }];
    expect(outputCues(words, again, true).map((c) => c.text)).toEqual(["$100,000 to start.", "You pay $100,000 to start."]);
  });
  it("the playhead maps by the part it is in, so the line's second hearing is not taken for the teaser", () => {
    const later = out.findIndex((g, i) => i > 0 && g.start === 7.9);
    const t = outIn(out, later, 9, 1)!;
    expect(t).toBeGreaterThan(5);
    expect(sourceTime(out, t)).toBeCloseTo(9);
    expect(outIn(out, 0, 9, 1)).toBeCloseTo(9 - 7.94);
    expect(segAt(out, t)).toBe(later);
    expect(segAt(out, 0.5)).toBe(0);
    expect(segAt(out, 999)).toBe(out.length - 1);
  });
});

describe("lines that could open the video", () => {
  it("whole sentences of 4-30 words, 1-8 s, 3 s or more into the edit; the first one rated too", () => {
    const c = coldCandidates(words, segs);
    expect(c.sentences.map((x) => x.text)).toEqual(["I think most people wait.", "Here is the thing.", "You pay $100,000 to start.", "Start small and cheap."]);
    expect(c.candidates).toEqual([2, 3]); // "Here is the thing." is heard 1.9 s in
    expect(c.opening).toBe(0);
    expect(c.source[2]).toEqual({ s: 7.94, e: 10.52 });
  });
  it("pads the line without taking in a sliver of the words either side", () => {
    const tight = words.map((w) => (w.w === "Start" ? W("Start", 10.45, 12.4) : w.w === "You" ? W("You", 5.24, 8.3) : w));
    expect(coldCandidates(tight, [{ start: 0, end: 13.9 }]).source[2]).toEqual({ s: 5.2, e: 10.45 });
  });
  it("leaves out a sentence with a word cut inside it", () => {
    const cut: Segment[] = [{ start: 0, end: 1.8 }, { start: 3.9, end: 5.4 }, { start: 7.9, end: 8.6 }, { start: 9.6, end: 10.6 }, { start: 11.9, end: 13.9 }];
    expect(coldCandidates(words, cut).candidates).toEqual([3]);
  });
});
