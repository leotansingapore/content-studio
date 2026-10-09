import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { defaultSettings, focusAt } from "./videoEdit";
import { CUT_CHANGE, cropShare, findCuts, frameChange, lookSpans, pickFace, sanitizeTrack, smoothTrack, trackCovers, trackStep } from "./faceFollow";
import { blurPx, maskAlpha, MP_VERSION, ringOf, sanitizeBackdrop, touchAmounts } from "./faceVision";

describe("following the face", () => {
  it("knows how much of a landscape video a 9:16 frame shows", () => {
    expect(cropShare("9:16", 1920, 1080)).toBeCloseTo(0.316, 3);
    expect(cropShare("9:16", 1080, 1920)).toBe(1);
    expect(cropShare("16:9", 1920, 1080)).toBe(1);
  });

  it("looks every half second, less often on a long video", () => {
    expect(trackStep(60)).toBe(0.5);
    expect(trackStep(720)).toBe(0.8);
  });

  it("keeps following the same person while they are there, else takes the biggest face", () => {
    const two = [{ x: 0.5, w: 0.045 }, { x: 0.67, w: 0.055 }];
    expect(pickFace(two, null)).toBe(0.67);
    expect(pickFace(two, 0.51)).toBe(0.5);
    // the one followed is now far smaller than another: take the bigger one
    expect(pickFace([{ x: 0.5, w: 0.02 }, { x: 0.7, w: 0.06 }], 0.5)).toBe(0.7);
    expect(pickFace([], 0.5)).toBeNull();
  });

  it("holds still while the face sways a little", () => {
    const sway = Array.from({ length: 40 }, (_, i) => 0.55 + (i % 2 ? 0.01 : -0.01));
    const t = smoothTrack(sway, 0.5, 0.04)!;
    expect(Math.max(...t) - Math.min(...t)).toBeLessThan(0.001);
  });

  it("re-centres on a face that moves across, easing into it, and ignores a one-look blip", () => {
    const raw = [...Array(10).fill(0.3), 0.9, ...Array(9).fill(0.3), ...Array(20).fill(0.7)];
    const t = smoothTrack(raw, 0.5, 0.04)!;
    expect(t.slice(0, 15).every((x) => Math.abs(x - 0.3) < 0.001)).toBe(true); // the blip at look 10 never moved it
    expect(t[t.length - 1]).toBeCloseTo(0.7, 3);
    // eased: no single half-second jumps more than half the way
    for (let i = 1; i < t.length; i++) expect(Math.abs(t[i] - t[i - 1])).toBeLessThan(0.2);
  });

  it("fills a gap with the last place, and gives up with no face at all", () => {
    const t = smoothTrack([null, null, 0.4, null, null, 0.41], 0.5, 0.04)!;
    expect(t).toHaveLength(6);
    expect(t.every((x) => Math.abs(x - 0.4) < 0.01)).toBe(true);
    expect(smoothTrack([null, null], 0.5, 0.04)).toBeNull();
  });

  it("crops on the track while following and on the slider otherwise", () => {
    const s = { ...defaultSettings(), focusX: 0.2, faceTrack: { step: 0.5, x: [0.4, 0.6] } };
    expect(focusAt(s, 0.25)).toBe(0.2);
    expect(focusAt({ ...s, followFace: true }, 0.25)).toBeCloseTo(0.5, 5);
    expect(focusAt({ ...s, followFace: true }, 99)).toBe(0.6);
    expect(focusAt({ ...s, followFace: true, faceTrack: undefined }, 1)).toBe(0.2);
  });

  it("holds through a jump seen in only two looks, and follows one seen in three from its first look", () => {
    const blip = [...Array(10).fill(0.3), 0.8, 0.8, ...Array(10).fill(0.3)];
    expect(smoothTrack(blip, 0.5, 0.04)!.every((x) => Math.abs(x - 0.3) < 0.001)).toBe(true);
    const moved = [...Array(10).fill(0.3), ...Array(12).fill(0.8)];
    const t = smoothTrack(moved, 0.5, 0.04)!;
    // the move is placed where it began (look 10), eased either side, not three looks late
    expect(t[9]).toBeGreaterThan(0.31);
    expect(t[11]).toBeGreaterThan(0.6);
    expect(t[t.length - 1]).toBeCloseTo(0.8, 3);
    // missed looks in between neither confirm nor cancel a move
    const gappy = [...Array(10).fill(0.3), 0.8, null, null, 0.3, 0.3];
    expect(smoothTrack(gappy, 0.5, 0.04)!.every((x) => Math.abs(x - 0.3) < 0.001)).toBe(true);
  });

  it("starts afresh at a camera cut: the new shot's face at once, no easing across", () => {
    const raw = [...Array(10).fill(0.3), ...Array(10).fill(0.75)];
    const t = smoothTrack(raw, 0.5, 0.04, [10])!;
    expect(t.slice(0, 10).every((x) => x === 0.3)).toBe(true);
    expect(t.slice(10).every((x) => x === 0.75)).toBe(true);
    // a shot with no face found keeps the last place
    const blind = smoothTrack([0.4, 0.4, null, null], 0.5, 0.04, [2])!;
    expect(blind).toEqual([0.4, 0.4, 0.4, 0.4]);
  });

  it("finds a camera cut as a frame that changes far more than the ones around it", () => {
    const talk = (t0: number, n: number, d = 5) => Array.from({ length: n }, (_, i) => ({ t: t0 + i * 0.27, d: d + (i % 3) }));
    expect(findCuts([...talk(0, 20), { t: 5.5, d: 60 }, ...talk(5.8, 20)])).toEqual([5.5]);
    // a busy shot changes a lot all the time: a bigger change in it is not a cut
    expect(findCuts([...talk(0, 20, 22), { t: 5.5, d: 40 }, ...talk(5.8, 10, 22)])).toEqual([]);
    // two cuts within a second (a flash) count once
    expect(findCuts([...talk(0, 10), { t: 3, d: 70 }, { t: 3.3, d: 70 }, ...talk(3.6, 10)])).toEqual([3]);
    expect(findCuts([...talk(0, 10), { t: 3, d: CUT_CHANGE - 1 }, ...talk(3.3, 10)])).toEqual([]);
  });

  it("measures how much two small frames differ, leaving out the alpha", () => {
    const a = new Uint8ClampedArray([10, 20, 30, 255, 0, 0, 0, 255]);
    const b = new Uint8ClampedArray([10, 20, 60, 0, 30, 0, 0, 0]);
    expect(frameChange(a, b)).toBe(10);
    expect(frameChange(a, a)).toBe(0);
  });

  it("looks only at the kept parts, playing through short gaps", () => {
    expect(lookSpans([{ start: 0, end: 4 }, { start: 5, end: 9 }, { start: 30, end: 40 }])).toEqual([{ start: 0, end: 9 }, { start: 30, end: 40 }]);
    expect(lookSpans([])).toEqual([]);
  });

  it("jumps at a cut instead of panning, and counts looks from where the track starts", () => {
    const s = { ...defaultSettings(), followFace: true, faceTrack: { step: 0.5, from: 100, x: [0.3, 0.3, 0.8, 0.8], cuts: [100.7] } };
    expect(focusAt(s, 100.25)).toBe(0.3);
    expect(focusAt(s, 100.69)).toBe(0.3);
    expect(focusAt(s, 100.7)).toBe(0.8);
    expect(focusAt(s, 50)).toBe(0.3);
    expect(focusAt({ ...s, faceTrack: { ...s.faceTrack, cuts: undefined } }, 100.75)).toBeCloseTo(0.55, 5);
  });

  it("knows when a track still covers the edit", () => {
    const t = { step: 0.5, from: 10, x: Array(41).fill(0.5) }; // 10 s to 30 s
    expect(trackCovers(t, [{ start: 10, end: 30 }])).toBe(true);
    expect(trackCovers(t, [{ start: 5, end: 30 }])).toBe(false);
    expect(trackCovers(t, [{ start: 12, end: 40 }])).toBe(false);
    expect(trackCovers({ step: 0.5, x: Array(21).fill(0.5) }, [{ start: 0, end: 10 }])).toBe(true); // made before tracks had a start
    expect(trackCovers(undefined, [{ start: 0, end: 10 }])).toBe(false);
  });

  it("keeps a stored track only when well formed", () => {
    expect(sanitizeTrack({ step: 0.5, x: [0.2, 1.4] })).toEqual({ step: 0.5, x: [0.2, 1] });
    expect(sanitizeTrack({ step: 0.5, x: [0.2, "a"] })).toBeUndefined();
    expect(sanitizeTrack({ step: 0, x: [0.2] })).toBeUndefined();
    expect(sanitizeTrack(null)).toBeUndefined();
    expect(sanitizeTrack({ step: 0.5, x: [0.2], from: 12, cuts: [14, "x", 13] })).toEqual({ step: 0.5, x: [0.2], from: 12, cuts: [13, 14] });
  });
});

describe("the face effects library", () => {
  it("loads its wasm for the same version as the package", async () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.dependencies["@mediapipe/tasks-vision"]).toBe(MP_VERSION);
  });
});

describe("what is behind you", () => {
  it("keeps a stored backdrop only when well formed", async () => {
    expect(sanitizeBackdrop({ kind: "blur", amount: 3 })).toEqual({ kind: "blur", amount: 1 });
    expect(sanitizeBackdrop({ kind: "blur" })).toEqual({ kind: "blur", amount: 0.6 });
    expect(sanitizeBackdrop({ kind: "colour", color: "#0f172a" })).toEqual({ kind: "colour", color: "#0F172A" });
    expect(sanitizeBackdrop({ kind: "colour", color: "red" })).toBeUndefined();
    expect(sanitizeBackdrop({ kind: "picture", key: "bd-v1abc-x2" })).toEqual({ kind: "picture", key: "bd-v1abc-x2" });
    expect(sanitizeBackdrop({ kind: "picture", key: "vo-v1abc-x2" })).toBeUndefined();
    expect(sanitizeBackdrop(undefined)).toBeUndefined();
  });

  it("cuts the person out with a soft edge that is never see-through", async () => {
    expect(maskAlpha(0.3)).toBe(0);
    expect(Math.abs(maskAlpha(0.6) - 128)).toBeLessThanOrEqual(1);
    expect(maskAlpha(0.85)).toBe(255);
  });

  it("blurs by the same share of the picture in the preview and the export", async () => {
    expect(blurPx(0.6, 1080, 1920)).toBe(2 * blurPx(0.6, 540, 960));
    expect(blurPx(0, 1080, 1920)).toBeLessThan(blurPx(1, 1080, 1920));
  });
});


describe("touch-up", () => {
  it("is off at 0 and stays light at full strength", async () => {
    expect(touchAmounts(0)).toEqual({ skin: 0, bright: 1, contrast: 1 });
    const full = touchAmounts(1);
    expect(full.skin).toBeLessThanOrEqual(0.45);
    expect(full.bright).toBeLessThanOrEqual(1.15);
    expect(full.contrast).toBeLessThanOrEqual(1.08);
    expect(touchAmounts(5)).toEqual(full);
    expect(touchAmounts(0.5).skin).toBeCloseTo(full.skin / 2, 5);
  });

  it("walks a landmark outline round in order, from the model's list of edges", async () => {
    expect(ringOf([{ start: 10, end: 11 }, { start: 12, end: 10 }, { start: 11, end: 12 }])).toEqual([10, 11, 12]);
    expect(ringOf([])).toEqual([]);
    // a broken outline stops where it breaks rather than looping forever
    expect(ringOf([{ start: 1, end: 2 }, { start: 2, end: 3 }])).toEqual([1, 2, 3]);
  });
});
