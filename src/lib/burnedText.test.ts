import { describe, expect, it } from "vitest";
import { bandTop, cutLine, greyOf, textRows } from "./burnedText";

const W = 320, H = 180;
/** A grey frame: a soft gradient (a room), with `paint` drawing on it. */
function frame(paint?: (px: Uint8ClampedArray) => void): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px[y * W + x] = 90 + Math.round((x / W) * 40 + (y / H) * 30);
  paint?.(px);
  return px;
}
/** A line of outlined letters: light strokes on dark between x0 and x1, rows y0 to y1. */
const words = (x0: number, x1: number, y0: number, y1: number) => (px: Uint8ClampedArray) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x < x1; x++) px[y * W + x] = x % 6 < 2 ? 240 : 20;
};
/** Stripes from edge to edge (a blind, a shelf). */
const stripes = (y0: number, y1: number) => (px: Uint8ClampedArray) => {
  for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) px[y * W + x] = x % 8 < 4 ? 230 : 30;
};
const sub = (y0: number, y1: number) => frame(words(90, 230, y0, y1));

describe("text burned into the video", () => {
  it("sees a centred line of letters as text, and a blind edge to edge or a plain room as not", () => {
    const rows = textRows(sub(150, 160), W, H);
    expect(rows[155]).toBe(true);
    expect(rows[100]).toBe(false);
    expect(textRows(frame(stripes(150, 160)), W, H)[155]).toBe(false);
    // outlines against a wall: plenty of edges, but far apart
    const posts = frame((px) => { for (let y = 150; y <= 160; y++) for (let x = 20; x < 300; x++) px[y * W + x] = (x - 20) % 20 < 2 ? 20 : 160; });
    expect(textRows(posts, W, H)[155]).toBe(false);
    // a small mark in the middle (a few letters, a logo): packed, but too few edges for a line
    expect(textRows(frame(words(150, 165, 150, 160)), W, H)[155]).toBe(false);
    // letters off to one side (a logo in the corner) are not a subtitle line
    expect(textRows(frame(words(250, 318, 150, 160)), W, H)[155]).toBe(false);
  });

  it("finds where the text starts in the bottom of a frame, two lines as one band", () => {
    expect(bandTop(sub(150, 160), W, H)).toBeCloseTo(150 / H, 3);
    const two = frame((px) => { words(90, 230, 138, 147)(px); words(100, 220, 151, 160)(px); });
    expect(bandTop(two, W, H)).toBeCloseTo(138 / H, 3);
    // small type: two thin lines are one band, though neither is tall enough alone
    const small = frame((px) => { words(90, 230, 140, 142)(px); words(100, 220, 146, 148)(px); });
    expect(bandTop(small, W, H)).toBeCloseTo(140 / H, 3);
    expect(bandTop(frame(), W, H)).toBeNull();
    // one thin row of edges (a hem, a cable) is too thin for a line of text
    expect(bandTop(frame(words(90, 230, 150, 150)), W, H)).toBeNull();
    // a lamp: a few sharp edges in a row are not letters
    expect(bandTop(frame((px) => { for (let y = 150; y <= 160; y++) for (let x = 150; x < 170; x++) px[y * W + x] = 250; }), W, H)).toBeNull();
    // a block of text a third of the picture tall is a slide, not subtitles
    expect(bandTop(frame(words(90, 230, 120, 172)), W, H)).toBeNull();
    // text high up (a slide's title) is not looked at
    expect(bandTop(sub(30, 40), W, H)).toBeNull();
    // the bottom of a busy picture that carries on upwards is not a band
    const busy = frame(words(60, 260, 100, 140));
    expect(bandTop(busy, W, H)).toBeNull();
  });

  it("cuts above text seen in at least 40% of the frames, at its highest line less a margin", () => {
    // subtitles in 6 of 12 frames: one or two lines, one stray reading high up
    const tops = [0.84, null, 0.84, 0.78, null, null, 0.84, null, 0.79, null, 0.84, null];
    expect(cutLine(tops)).toBeCloseTo(0.79 - 0.02, 6);
    expect(cutLine([0.84, null, null, null, 0.84, null, null, null, null, null, 0.84, null])).toBeNull(); // 3 of 12
    expect(cutLine([0.6, 0.6, 0.6, 0.6, 0.6])).toBeNull(); // would take far more than the bottom 30%
    expect(cutLine([0.995, 0.995, 0.995])).toBeNull(); // a sliver
    expect(cutLine([])).toBeNull();
  });

  it("reads grey levels from colour pixels", () => {
    expect([...greyOf([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255])]).toEqual([255, 0, 76]);
  });
});
