import { describe, expect, it } from "vitest";
import { hookSecondsOf, scaleJump, styleFrameTimes, transitionIn, withReelStyle, wordsPerMinute, type Grey, type ReelRead } from "./reelStyle";
import { defaultSettings } from "./videoEdit";

// a textured picture as a function of where you look (0-1 across and down)
const scene = (x: number, y: number) => 0.5 + 0.2 * Math.sin(x * 23 + y * 7) + 0.15 * Math.cos(y * 31 - x * 5) + 0.1 * Math.sin(x * y * 40);
const other = (x: number, y: number) => 0.5 + 0.3 * Math.sin(x * 9 - y * 41);
const draw = (f: (x: number, y: number) => number, zoom = 1, cx = 0.5, cy = 0.42): Grey => {
  const w = 48, h = 85;
  const px = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = f(cx + ((x + 0.5) / w - cx) / zoom, cy + ((y + 0.5) / h - cy) / zoom);
  return { px, w, h };
};

describe("a zoom or punch-in between two frames", () => {
  it("is found with its size, in and out", () => {
    expect(scaleJump(draw(scene), draw(scene, 1.2))).toBeCloseTo(1.2, 1);
    expect(scaleJump(draw(scene, 1.2), draw(scene))).toBeCloseTo(1 / 1.2, 1);
    expect(scaleJump(draw(scene), draw(scene, 1.15, 0.5, 0.5))).toBeCloseTo(1.15, 1);
  });
  it("is not called on a picture with too little detail to tell", () => {
    const smooth = (x: number, y: number) => 0.3 + 0.4 * y + 0.3 * (x - 0.5) ** 2;
    expect(scaleJump(draw(smooth), draw(smooth, 1.2))).toBe(1);
  });
  it("is not found in the same shot or a different one", () => {
    expect(scaleJump(draw(scene), draw(scene))).toBe(1);
    expect(scaleJump(draw(scene), draw(other))).toBe(1);
  });
});

describe("a flash or a dip at a cut", () => {
  it("needs ordinary frames either side", () => {
    expect(transitionIn([0.4, 0.95, 0.5])).toBe("flash");
    expect(transitionIn([0.4, 0.03, 0.5])).toBe("dip");
    expect(transitionIn([0.4, 0.45, 0.5])).toBeNull();
    expect(transitionIn([0.9, 0.95, 0.92])).toBeNull(); // a bright shot, not a flash
    expect(transitionIn([0.4, 0.5])).toBeNull();
  });
});

describe("frames to read", () => {
  it("the opening seconds, then just after the cuts, at most 12", () => {
    const t = styleFrameTimes([2, 8, 9, 15, 22, 30, 31, 40, 47, 52], 60);
    expect(t.slice(0, 5)).toEqual([0.3, 1.5, 3, 4.5, 6]);
    expect(t).toContain(8.4);
    expect(t.length).toBeLessThanOrEqual(12);
    expect(styleFrameTimes([], 30)).toEqual([0.3, 1.5, 3, 4.5, 6, 12, 21, 28.5]);
  });
});

describe("the opening text", () => {
  it("lasts until the first frame read without it", () => {
    const overlays = [{ t: 0.3, text: "3 CPF mistakes" }, { t: 1.5, text: "3 CPF MISTAKES!" }, { t: 4.5, text: "Mistake 1" }];
    expect(hookSecondsOf(overlays, [0.3, 1.5, 3, 4.5, 6])).toEqual({ seconds: 3, text: "3 CPF mistakes" });
    expect(hookSecondsOf([{ t: 0.3, text: "Watch this" }, { t: 1.5, text: "Watch this" }], [0.3, 1.5])).toEqual({ seconds: 10, text: "Watch this" });
    expect(hookSecondsOf([{ t: 4.5, text: "Later" }], [0.3, 1.5, 4.5])).toBeNull();
  });
});

describe("words a minute", () => {
  it("from the transcript over the length, only with enough of both", () => {
    expect(wordsPerMinute(Array(90).fill("word").join(" "), 30)).toBe(180);
    expect(wordsPerMinute("too short", 30)).toBeNull();
    expect(wordsPerMinute(Array(90).fill("w").join(" "), null)).toBeNull();
  });
});

const read = (over: Partial<ReelRead> = {}): ReelRead => ({
  source: { platform: "instagram", author: "kallaway", transcript: Array(90).fill("word").join(" "), durationSec: 30 },
  measure: { duration: 30, cuts: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22], zooms: [4, 8, 12, 16, 20], flashes: 0, dips: 3, frameTimes: [0.3, 1.5, 3, 4.5, 6], pacing: { durationSec: 30, cuts: 11, avgShotSec: 2.5, cutsFirst3s: 1 } },
  style: { captions: "Gold serif, two words", layout: "Pictures on top, speaker below", onScreenText: [{ t: 0.3, text: "Stop doing this" }, { t: 1.5, text: "Stop doing this" }, { t: 4.5, text: "$100,000" }, { t: 6, text: "Cost is low" }] },
  look: { style: "cutout", uppercase: false, captionBox: "none", position: "middle", words: "2", captions: true, framed: false, topHalf: true },
  ...over,
});

describe("the reel's style on the edit", () => {
  it("takes Jev's look and the measured pace", () => {
    const start = { ...defaultSettings("minimal"), captionY: 0.7, filter: "warm" as const };
    const { next, facts } = withReelStyle(start, read(), 150);
    expect(facts).toEqual({ cutsPerMin: 22, zoomsPerMin: 10, hookSeconds: 3, wpm: 180, overlays: 2 });
    expect([next.style, next.wordsPerCaption, next.uppercase, next.captionBox, next.position, next.captionY, next.filter]).toEqual(["cutout", 2, false, "none", "middle", undefined, undefined]);
    // 22 cuts a minute and 180 words a minute: tight pauses; 180 against my 150 words a minute: 1.2x, kept to 1.15
    expect([next.maxPause, next.speed]).toEqual([0.3, 1.15]);
    // zooms on 5 of 11 cuts: punch-ins; 3 dips through black
    expect([next.punchIn, next.keyZooms, next.transition]).toEqual([true, false, "soft"]);
    expect([next.numberCards, next.popups, next.hookSeconds, next.brollLayout, next.fit]).toEqual([true, true, 3, "top", "fill"]);
  });
  it("a few zooms become zooms on key lines; a slow reel gets loose pauses and my own speed", () => {
    const m = read().measure!;
    const { next } = withReelStyle(defaultSettings(), read({ measure: { ...m, cuts: [10, 20], zooms: [5], dips: 0 }, source: { ...read().source, transcript: null } }), 150);
    expect([next.punchIn, next.keyZooms, next.maxPause, next.speed, next.transition]).toEqual([false, true, 0.55, 1, undefined]);
  });
  it("no zooms, no plain numbers and one overlay: none of those switched on", () => {
    const m = read().measure!;
    const style = { ...read().style!, onScreenText: [{ t: 0.3, text: "Stop doing this" }, { t: 6, text: "Cost is low" }] };
    const { next } = withReelStyle({ ...defaultSettings(), keyZooms: true, numberCards: true, popups: true }, read({ measure: { ...m, zooms: [] }, style }), null);
    expect([next.punchIn, next.keyZooms, next.numberCards, next.popups]).toEqual([false, false, false, false]);
  });
  it("keeps the look as it is when it couldn't be read, and everything but the pace from a TikTok", () => {
    const start = { ...defaultSettings("editorial"), numberCards: true, punchIn: true };
    const noLook = withReelStyle(start, read({ look: null, style: null }), 150).next;
    expect([noLook.style, noLook.wordsPerCaption, noLook.uppercase, noLook.numberCards, noLook.maxPause]).toEqual(["editorial", start.wordsPerCaption, start.uppercase, true, 0.3]);
    const tiktok = withReelStyle(start, read({ look: null, style: null, measure: null }), 120).next;
    expect([tiktok.style, tiktok.punchIn, tiktok.numberCards, tiktok.speed, tiktok.maxPause]).toEqual(["editorial", true, true, 1.15, 0.3]);
  });
  it("a word highlight only goes on a word-by-word style", () => {
    const look = { ...read().look!, style: "minimal" as const, captionBox: "word" as const };
    expect(withReelStyle(defaultSettings(), read({ look }), null).next.captionBox).toBeUndefined();
  });
});
