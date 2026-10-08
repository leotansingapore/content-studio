import { describe, expect, it } from "vitest";
import { MEASURE_SECONDS, WHOLE_SECONDS, joinKept, sampleKept, wholeFits } from "@/lib/keptSound";

const ramp = (from: number, n: number) => Float32Array.from({ length: n }, (_, i) => from + i);

describe("the sound loudness is measured on", () => {
  it("is only the kept parts, back to back, from pieces decoded part by part", () => {
    // a 10 Hz source: piece 0 starts at 100 s (samples 1000..), piece 1 at 3600 s
    const pieces = [
      { start: 100, rate: 10, channels: [ramp(1000, 40), ramp(-1000, 40)] },
      { start: 3600, rate: 10, channels: [ramp(36000, 40), ramp(-36000, 40)] },
    ];
    const out = joinKept(pieces, [{ from: 100.5, dur: 1 }, { from: 3601, dur: 0.5 }]);
    expect(out?.map((c) => [...c])).toEqual([
      [1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014, 36010, 36011, 36012, 36013, 36014],
      [-995, -994, -993, -992, -991, -990, -989, -988, -987, -986, -35990, -35989, -35988, -35987, -35986],
    ]);
  });

  it("can be the kept parts of one whole decode", () => {
    const whole = { start: 0, rate: 10, channels: [ramp(0, 100)] };
    expect([...(joinKept([whole, whole], [{ from: 1, dur: 0.3 }, { from: 9.8, dur: 0.5 }]) ?? [])[0]]).toEqual([10, 11, 12, 98, 99, 0, 0, 0]);
    expect(joinKept([], [{ from: 0, dur: 1 }])).toBeNull();
    expect(joinKept([whole], [])).toBeNull();
  });

  it("is all of a short edit, and 10 minutes spread evenly over a long one", () => {
    const clip = [{ from: 3000, dur: 40 }, { from: 3050, dur: 20 }];
    expect(sampleKept(clip)).toEqual([{ from: 3000, dur: 40, part: 0 }, { from: 3050, dur: 20, part: 1 }]);
    const whole = sampleKept([{ from: 0, dur: 7200 }]);
    expect(whole).toHaveLength(20);
    expect(whole.slice(0, 3)).toEqual([{ from: 0, dur: 30, part: 0 }, { from: 360, dur: 30, part: 0 }, { from: 720, dur: 30, part: 0 }]);
    expect(whole.reduce((a, w) => a + w.dur, 0)).toBe(MEASURE_SECONDS);
    // two long kept parts: the stretches fall in each, on the source's clock
    const two = sampleKept([{ from: 100, dur: 400 }, { from: 2000, dur: 400 }]);
    expect(two.map((w) => w.part)).toEqual([...Array(10).fill(0), ...Array(10).fill(1)]);
    expect(two[10]).toEqual({ from: 2000, dur: 30, part: 1 });
    expect(two[9]).toEqual({ from: 460, dur: 30, part: 0 });
  });

  it("never decodes a long recording whole", () => {
    expect([wholeFits(12 * 60), wholeFits(WHOLE_SECONDS), wholeFits(2 * 3600), wholeFits(undefined)]).toEqual([true, true, false, false]);
  });
});
