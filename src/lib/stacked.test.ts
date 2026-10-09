import { describe, expect, it } from "vitest";
import { OPEN_END, drawSlides, drawStacked, halfCrop, lifted, meOf, pairAt, pairShare, pairsOf, sanitizeMe, sanitizePairs, slidesCaptionY, slidesHeight, type Pair } from "./stacked";
import type { SeenFace } from "./speakers";
import { sanitizeTrack } from "./faceFollow";

const duo = (n: number): SeenFace[][] => Array.from({ length: n }, () => [{ x: 0.3, y: 0.4, w: 0.1 }, { x: 0.7, y: 0.45, w: 0.12 }]);
const solo = (n: number): SeenFace[][] => Array.from({ length: n }, () => [{ x: 0.5, y: 0.4, w: 0.2 }]);

describe("two speakers stacked", () => {
  it("finds the shots with two people side by side, the left one on top", () => {
    // a two-shot for 10 s, a camera cut at 10 s to a close-up of one of them
    const pairs = pairsOf([...duo(20), ...solo(20)], 0, 0.5, [10]);
    expect(pairs).toEqual([{ at: 0, to: 10, top: [0.3, 0.4, 0.1], bottom: [0.7, 0.45, 0.12] }]);
    expect(pairsOf([...solo(20), ...duo(20)], 0, 0.5, [10])).toEqual([{ at: 10, to: OPEN_END, top: [0.3, 0.4, 0.1], bottom: [0.7, 0.45, 0.12] }]);
  });

  it("leaves out three people, and two who share the frame less than half the time", () => {
    const three = duo(20).map((l) => [...l, { x: 0.5, y: 0.4, w: 0.1 }]);
    expect(pairsOf(three, 0, 0.5, [])).toEqual([]);
    const seldom = duo(20).map((l, i) => (i % 3 ? [l[0]] : l));
    expect(pairsOf(seldom, 0, 0.5, [])).toEqual([]);
    expect(pairsOf(solo(20), 0, 0.5, [])).toEqual([]);
  });

  it("knows which shot a moment is in and how much of the edit the pairs cover", () => {
    const pairs: Pair[] = [{ at: 0, to: 10, top: [0.3, 0.4, 0.1], bottom: [0.7, 0.4, 0.1] }];
    expect(pairAt(pairs, 9.99)).toBe(pairs[0]);
    expect(pairAt(pairs, 10)).toBeNull();
    expect(pairAt(undefined, 3)).toBeNull();
    expect(pairShare(pairs, [{ start: 5, end: 15 }])).toBeCloseTo(0.5, 6);
    expect(pairShare([], [{ start: 0, end: 5 }])).toBe(0);
  });

  it("crops round each face, about three faces wide, inside the picture, the face a little above the middle", () => {
    const c = halfCrop([0.3, 0.4, 0.1], 1920, 1080, 1080, 960);
    expect(c.w).toBeCloseTo(576, 3); // three faces (576 px) is above the 30% floor
    expect(c.w / c.h).toBeCloseTo(1080 / 960, 6);
    expect(c.x + c.w / 2).toBeCloseTo(576, 3);
    expect(c.y).toBeCloseTo(1080 * 0.4 - c.h * 0.42, 3);
    // a face at the edge: the crop stops at the picture's edge
    const edge = halfCrop([0.02, 0.1, 0.1], 1920, 1080, 1080, 960);
    expect(edge.x).toBe(0);
    expect(edge.y).toBe(0);
    // a big face: never more than half the width, so the other person stays out
    expect(halfCrop([0.5, 0.5, 0.4], 1920, 1080, 1080, 960).w).toBeCloseTo(960, 3);
    // zoomed in on a key line: tighter
    expect(halfCrop([0.3, 0.4, 0.1], 1920, 1080, 1080, 960, 1.2).w).toBeCloseTo(480, 3);
  });

  it("draws the top person in the upper half and the other below", () => {
    const calls: number[][] = [];
    const g = { filter: "none", drawImage: (...a: unknown[]) => calls.push(a.slice(1) as number[]) } as unknown as CanvasRenderingContext2D;
    const v = { videoWidth: 1920, videoHeight: 1080 } as unknown as HTMLVideoElement;
    const pair: Pair = { at: 0, to: 10, top: [0.3, 0.4, 0.1], bottom: [0.7, 0.4, 0.1] };
    const fx: number[] = [];
    drawStacked(g, v, pair, 1080, 1920, 1, "none", (r) => fx.push(r.y));
    expect(calls).toHaveLength(2);
    expect(calls[0].slice(4)).toEqual([0, 0, 1080, 960]);
    expect(calls[1].slice(4)).toEqual([0, 960, 1080, 960]);
    expect(calls[0][0] + calls[0][2] / 2).toBeCloseTo(576, 3); // the left person on top
    expect(calls[1][0] + calls[1][2] / 2).toBeCloseTo(1344, 3);
    expect(fx).toEqual([0, 960]);
  });

  it("keeps stored pairs only when well formed", () => {
    const ok = { at: 0, to: 10, top: [0.3, 0.4, 0.1], bottom: [0.7, 0.4, 0.1] };
    expect(sanitizePairs([ok, { ...ok, to: -1 }, { ...ok, top: [2, 0, 0] }, null])).toEqual([ok]);
    expect(sanitizePairs("x")).toBeUndefined();
    expect(sanitizePairs([])).toEqual([]);
    // a stored face track keeps its pairs; one found before them has none, so stacking looks again
    expect(sanitizeTrack({ step: 0.5, x: [0.5], pairs: [ok] })?.pairs).toEqual([ok]);
    expect(sanitizeTrack({ step: 0.5, x: [0.5] })?.pairs).toBeUndefined();
  });
});

describe("slides and me", () => {
  it("finds the face that stays (the camera in the corner), or none", () => {
    const rec = Array.from({ length: 20 }, (_, i) => (i % 4 ? [{ x: 0.88, y: 0.8, w: 0.06 }] : []));
    expect(meOf(rec)).toEqual([0.88, 0.8, 0.06]);
    // in fewer than half the looks: no steady face to put under the slides
    expect(meOf(rec.map((l, i) => (i % 3 ? [] : l)))).toBeNull();
    expect(meOf([])).toBeNull();
  });

  it("puts the whole screen across the top and the face below, captions over the chest", () => {
    expect(slidesHeight(1920, 1080, 1080, 1920)).toBeCloseTo(607.5, 3);
    expect(slidesHeight(1080, 1080, 1080, 1920)).toBeCloseTo(864, 3); // a square source is held to 45%
    expect(slidesCaptionY(1920, 1080, 1080, 1920)).toBe(0.83);
    const calls: number[][] = [];
    const g = { filter: "none", drawImage: (...a: unknown[]) => calls.push(a.slice(1) as number[]) } as unknown as CanvasRenderingContext2D;
    const v = { videoWidth: 1920, videoHeight: 1080 } as unknown as HTMLVideoElement;
    const fx: number[][] = [];
    drawSlides(g, v, [0.88, 0.8, 0.06], 1080, 1920, 1, "none", (r) => fx.push([r.y, r.h]));
    expect(calls[0]).toEqual([0, 0, 1920, 1080, 0, 0, 1080, 607.5]); // nothing cut off the sides
    const [x, y, w, h, , dy, , dh] = calls[1];
    expect([dy, dh]).toEqual([607.5, 1312.5]);
    expect(w).toBeCloseTo(1920 * 0.06 * 1.6, 3); // close: a face and a half wide
    expect(x + w / 2).toBeCloseTo(1920 * 0.88, 3); // on the face
    expect(y + h).toBeLessThanOrEqual(1080);
    expect(fx).toEqual([[607.5, 1312.5]]); // effects on the face only
    // a square source keeps its full width and shows its middle rows
    calls.length = 0;
    drawSlides(g, { videoWidth: 1080, videoHeight: 1080 } as unknown as HTMLVideoElement, [0.5, 0.5, 0.2], 1080, 1920, 1, "none");
    expect(calls[0].slice(0, 4)).toEqual([0, 108, 1080, 864]);
  });

  it("moves a face found on the whole picture onto a picture with its bottom cropped off", () => {
    expect(lifted([0.3, 0.4, 0.1], 0.8)).toEqual([0.3, 0.5, 0.1]);
    expect(lifted([0.3, 0.95, 0.1], 0.8)).toEqual([0.3, 1, 0.1]);
    expect(lifted([0.3, 0.4, 0.1], 1)).toEqual([0.3, 0.4, 0.1]);
  });

  it("keeps a stored face only when well formed, and tells looked-for-none from not looked", () => {
    expect(sanitizeMe([0.88, 0.8, 0.06])).toEqual([0.88, 0.8, 0.06]);
    expect(sanitizeMe(null)).toBeNull();
    expect(sanitizeMe([0.5, 2, 0.1])).toBeUndefined();
    expect(sanitizeMe(undefined)).toBeUndefined();
  });
});
