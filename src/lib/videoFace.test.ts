import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { defaultSettings, focusAt } from "./videoEdit";
import { cropShare, pickFace, sanitizeTrack, smoothTrack, trackStep } from "./faceFollow";

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

  it("keeps a stored track only when well formed", () => {
    expect(sanitizeTrack({ step: 0.5, x: [0.2, 1.4] })).toEqual({ step: 0.5, x: [0.2, 1] });
    expect(sanitizeTrack({ step: 0.5, x: [0.2, "a"] })).toBeUndefined();
    expect(sanitizeTrack({ step: 0, x: [0.2] })).toBeUndefined();
    expect(sanitizeTrack(null)).toBeUndefined();
  });
});

describe("the face effects library", () => {
  it("loads its wasm for the same version as the package", async () => {
    const { MP_VERSION } = await import("./faceVision");
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.dependencies["@mediapipe/tasks-vision"]).toBe(MP_VERSION);
  });
});

describe("what is behind you", () => {
  it("keeps a stored backdrop only when well formed", async () => {
    const { sanitizeBackdrop } = await import("./faceVision");
    expect(sanitizeBackdrop({ kind: "blur", amount: 3 })).toEqual({ kind: "blur", amount: 1 });
    expect(sanitizeBackdrop({ kind: "blur" })).toEqual({ kind: "blur", amount: 0.6 });
    expect(sanitizeBackdrop({ kind: "colour", color: "#0f172a" })).toEqual({ kind: "colour", color: "#0F172A" });
    expect(sanitizeBackdrop({ kind: "colour", color: "red" })).toBeUndefined();
    expect(sanitizeBackdrop({ kind: "picture", key: "bd-v1abc-x2" })).toEqual({ kind: "picture", key: "bd-v1abc-x2" });
    expect(sanitizeBackdrop({ kind: "picture", key: "vo-v1abc-x2" })).toBeUndefined();
    expect(sanitizeBackdrop(undefined)).toBeUndefined();
  });

  it("cuts the person out with a soft edge that is never see-through", async () => {
    const { maskAlpha } = await import("./faceVision");
    expect(maskAlpha(0.3)).toBe(0);
    expect(Math.abs(maskAlpha(0.6) - 128)).toBeLessThanOrEqual(1);
    expect(maskAlpha(0.85)).toBe(255);
  });

  it("blurs by the same share of the picture in the preview and the export", async () => {
    const { blurPx } = await import("./faceVision");
    expect(blurPx(0.6, 1080, 1920)).toBe(2 * blurPx(0.6, 540, 960));
    expect(blurPx(0, 1080, 1920)).toBeLessThan(blurPx(1, 1080, 1920));
  });
});

