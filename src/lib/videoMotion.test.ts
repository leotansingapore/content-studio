import { describe, expect, it } from "vitest";
import { defaultSettings, keepSegments, sentencesOf, type EditSettings, type Word } from "./videoEdit";
import { KEY_ZOOM, ZOOM_GAP, keyBeats, keyLinesFrom, keyZoom, motionOf, outOfSpan, sanitizeMotion, type KeyLine } from "./videoMotion";

const K = (s: number, e: number, p: number): KeyLine => ({ s, e, p });
const one = [{ start: 0, end: 60 }];

describe("key lines on the edit", () => {
  it("takes the strongest lines first, at most one every 6 s, about 3 a minute", () => {
    const lines = [K(10, 12, 0.9), K(12, 14, 0.95), K(30, 33, 0.7), K(40, 42, 0.8), K(50, 52, 0.6)];
    const beats = keyBeats(lines, one, 1, 60, 0);
    expect(beats.map((b) => b.at)).toEqual([12, 30, 40]);
    for (let i = 1; i < beats.length; i++) expect(beats[i].at - beats[i - 1].at).toBeGreaterThanOrEqual(ZOOM_GAP);
  });
  it("never zooms under the hook card, on a weak line, or too close to the end", () => {
    const lines = [K(1, 2, 0.99), K(8, 9, 0.3), K(20, 22, 0.8), K(59, 59.8, 0.9)];
    expect(keyBeats(lines, one, 1, 60, 3).map((b) => b.at)).toEqual([20]);
  });
  it("follows the cuts: a line after a cut moves up, a line cut out is dropped, speed shortens it", () => {
    const segs = [{ start: 0, end: 10 }, { start: 20, end: 60 }];
    expect(outOfSpan(segs, 25, 27)).toBe(15);
    expect(outOfSpan(segs, 12, 15)).toBeNull();
    expect(outOfSpan(segs, 8, 22, 2)).toBe(4);
    expect(keyBeats([K(12, 15, 0.9), K(25, 27, 0.8)], segs, 1, 50, 0).map((b) => b.at)).toEqual([15]);
  });
  it("gives a 30 s reel 2 zooms and a 9 s one 1", () => {
    const lines = [K(2, 3, 0.4), K(10, 11, 0.9), K(20, 21, 0.7)];
    expect(keyBeats(lines, [{ start: 0, end: 30 }], 1, 29.4, 0).map((b) => b.at)).toEqual([10, 20]);
    expect(keyBeats([K(1, 2, 0.8), K(5, 6, 0.9)], [{ start: 0, end: 9 }], 1, 9, 0)).toHaveLength(1);
  });
});

describe("the zoom itself", () => {
  const beats = [{ at: 10, p: 0.9 }];
  it("eases in over 0.25 s, holds at 1.15x, eases out over 0.55 s", () => {
    expect(keyZoom(beats, 9.9)).toBe(1);
    expect(keyZoom(beats, 10.125)).toBeCloseTo(1.075, 3);
    expect(keyZoom(beats, 10.5)).toBe(KEY_ZOOM.peak);
    expect(keyZoom(beats, 11.5)).toBe(KEY_ZOOM.peak);
    const out = keyZoom(beats, 11.8);
    expect(out).toBeGreaterThan(1);
    expect(out).toBeLessThan(KEY_ZOOM.peak);
    expect(keyZoom(beats, 12.1)).toBe(1);
  });
});

describe("keeping Jev's picks", () => {
  const W = (w: string, s: number, e: number): Word => ({ w, s, e });
  const words = [W("Most", 0.5, 0.8), W("people", 0.8, 1.2), W("wait.", 1.2, 1.6), W("Start", 4.0, 4.3), W("your", 4.3, 4.5), W("top", 4.5, 4.7), W("up", 4.7, 4.9), W("now.", 4.9, 5.4)];
  it("turns picks on the edited timeline back into source times", () => {
    const segs = keepSegments(words, 6, { trimStart: 0, trimEnd: 0, removeFillers: true, maxPause: 0.6 });
    const sent = sentencesOf(words).map((x) => ({ ...x, s: outOfSpan(segs, x.s, x.e)!, e: outOfSpan(segs, x.s, x.e)! + (x.e - x.s) }));
    const lines = keyLinesFrom([{ i: 1, p: 0.8 }, { i: 7, p: 0.9 }], sent, segs, 1)!;
    expect(lines).toHaveLength(1);
    expect(lines[0].s).toBeCloseTo(4.0, 1);
    expect(lines[0].p).toBe(0.8);
    expect(keyLinesFrom(null, sent, segs, 1)).toBeNull();
  });
  it("drops malformed stored picks", () => {
    expect(sanitizeMotion({ lines: [{ s: 1, e: 2, p: 0.5 }, { s: 3, e: 2, p: 0.5 }, { s: 1, e: 2, p: 3 }, "x"] })).toEqual({ lines: [{ s: 1, e: 2, p: 0.5 }] });
    expect(sanitizeMotion(null)).toBeUndefined();
  });
});

describe("motionOf", () => {
  const segs = [{ start: 0, end: 30 }];
  const base = (p: Partial<EditSettings>): EditSettings => ({ ...defaultSettings("bold"), ...p });
  it("zooms only with the toggle on and picks kept, so the old punch-in stays otherwise", () => {
    const motion = { lines: [K(10, 12, 0.9)] };
    expect(motionOf(base({ motion }), segs, [], 30).zooms).toEqual([]);
    expect(motionOf(base({ keyZooms: true }), segs, [], 30).zooms).toEqual([]);
    expect(motionOf(base({ keyZooms: true, motion }), segs, [], 30).zooms).toEqual([{ at: 10, p: 0.9 }]);
  });
  it("keeps zooms off the hook card", () => {
    const motion = { lines: [K(2, 4, 0.9)] };
    expect(motionOf(base({ keyZooms: true, motion, hook: "CPF mistakes", hookSeconds: 3 }), segs, [], 30).zooms).toEqual([]);
    expect(motionOf(base({ keyZooms: true, motion, hook: "", hookSeconds: 3 }), segs, [], 30).zooms).toHaveLength(1);
  });
});
