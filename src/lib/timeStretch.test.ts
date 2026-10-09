import { describe, expect, it } from "vitest";
import { stretch } from "./timeStretch";

const RATE = 48000;
const tone = (hz: number, seconds: number, amp = 0.5) => new Float32Array(Math.round(seconds * RATE)).map((_, i) => amp * Math.sin((2 * Math.PI * hz * i) / RATE));
/** Upward zero crossings a second, from the first to the last one seen (edges left out). */
const pitch = (x: Float32Array) => {
  const ups: number[] = [];
  for (let i = 1; i < x.length; i++) if (x[i - 1] < 0 && x[i] >= 0) ups.push(i - x[i] / (x[i] - x[i - 1]));
  return ((ups.length - 1) * RATE) / (ups[ups.length - 1] - ups[0]);
};
const rms = (x: Float32Array) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);

describe("time stretch (pitch kept)", () => {
  it("plays the sound faster: length / speed samples, within a sample", () => {
    for (const speed of [1.05, 1.1, 1.25, 1.5]) {
      const [out] = stretch([tone(220, 3)], speed, RATE);
      expect(Math.abs(out.length - (3 * RATE) / speed)).toBeLessThanOrEqual(1);
    }
  });

  it("keeps a 440 Hz tone at 440 Hz, within 1%", () => {
    for (const speed of [1.1, 1.25, 1.5]) {
      const [out] = stretch([tone(440, 2)], speed, RATE);
      expect(Math.abs(pitch(out) - 440) / 440).toBeLessThan(0.01);
    }
    // a low voice too: a 110 Hz cycle is longer than a quarter of the window
    const [low] = stretch([tone(110, 2)], 1.2, RATE);
    expect(Math.abs(pitch(low) - 110) / 110).toBeLessThan(0.01);
  });

  it("joins its windows without a click or a dip", () => {
    const x = tone(440, 2);
    const level = rms(x); // once: over the whole tone for each 5 ms block it took 91M steps and ran past 5 s
    let step = 0;
    for (let i = 1; i < x.length; i++) step = Math.max(step, Math.abs(x[i] - x[i - 1]));
    for (const speed of [1.1, 1.25, 1.5]) {
      const [out] = stretch([x], speed, RATE);
      let outStep = 0;
      for (let i = 1; i < out.length; i++) outStep = Math.max(outStep, Math.abs(out[i] - out[i - 1]));
      // no sample jumps further than the tone itself moves between samples
      expect(outStep).toBeLessThan(step * 1.1);
      // and the loudness holds in every 5 ms, the first and the last too
      const block = RATE / 200;
      for (let at = 0; at + block <= out.length; at += block) {
        const r = rms(out.subarray(at, at + block)) / level;
        expect(r).toBeGreaterThan(0.95);
        expect(r).toBeLessThan(1.05);
      }
    }
  });

  it("puts a sound at input time t at t / speed, within 10 ms, so the voice stays on the picture", () => {
    const x = new Float32Array(3 * RATE);
    const burst = tone(1000, 0.03);
    // a 30 ms beep centred on 2 s, faded in and out
    burst.forEach((v, i) => (x[2 * RATE - burst.length / 2 + i] = v * Math.sin((Math.PI * i) / burst.length)));
    const [out] = stretch([x], 1.25, RATE);
    let e = 0;
    let at = 0;
    out.forEach((v, i) => {
      e += v * v;
      at += i * v * v;
    });
    expect(Math.abs(at / e / RATE - 2 / 1.25)).toBeLessThan(0.01);
  });

  it("keeps stereo in step: the same windows on both channels", () => {
    const a = tone(330, 1);
    const b = tone(517, 1, 0.3);
    const [l, r] = stretch([a, b], 1.2, RATE);
    // windows read from the same spots add up to the mix stretched as one
    const [both] = stretch([a.map((v, i) => v + b[i])], 1.2, RATE);
    for (let i = 0; i < l.length; i += 97) expect(l[i] + r[i]).toBeCloseTo(both[i], 5);
  });

  it("hands back a copy at normal speed", () => {
    const x = tone(440, 0.1);
    const [out] = stretch([x], 1, RATE);
    expect(out).toEqual(x);
    expect(out).not.toBe(x);
  });
});
