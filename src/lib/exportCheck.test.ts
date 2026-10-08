import { describe, expect, it } from "vitest";
import { CLIP_MIN, blackStretches, clipStats, frameTimes, isBlack, joinTimes, pictureAndClipIssues } from "./exportCheck";

const RATE = 8000;
const tone = (seconds: number, amp: number) => Float32Array.from({ length: seconds * RATE }, (_, i) => Math.max(-1, Math.min(1, amp * Math.sin((2 * Math.PI * 220 * i) / RATE))));

describe("clipped sound", () => {
  it("finds no clipping in sound that stays under full scale", () => {
    expect(clipStats(tone(1, 0.9), RATE)).toEqual({ count: 0, at: null });
  });

  it("counts each place the wave sits flat at full scale, and when the first is", () => {
    const x = new Float32Array(2 * RATE);
    x.set(tone(1, 2), RATE); // a second of silence, then a tone driven past full scale
    const c = clipStats(x, RATE);
    expect(c.count).toBeGreaterThan(400); // two flat tops a cycle at 220 Hz
    expect(c.at).toBeCloseTo(1, 1);
  });

  it("does not count a lone sample at full scale", () => {
    const x = new Float32Array(RATE);
    x[100] = 1;
    x[2000] = -1;
    expect(clipStats(x, RATE).count).toBe(0);
  });
});

describe("black frames", () => {
  const frame = (bright: number, share: number) => {
    const px = 64 * 36;
    const d = new Uint8ClampedArray(px * 4);
    for (let i = 0; i < px; i++) {
      const v = i < px * share ? 255 : bright;
      d.set([v, v, v, 255], i * 4);
    }
    return d;
  };

  it("reads a frame as black when 90% of it is near black, captions over it or not", () => {
    expect(isBlack(frame(0, 0))).toBe(true);
    expect(isBlack(frame(12, 0.06))).toBe(true); // a missing picture with a caption on top
    expect(isBlack(frame(0, 0.2))).toBe(false);
    expect(isBlack(frame(60, 0))).toBe(false); // a dim room is not black
  });

  it("looks every half second, at most 240 times, and not at a cut that dips through black on purpose", () => {
    expect(frameTimes(10)).toHaveLength(20);
    expect(frameTimes(10)[0]).toBeCloseTo(0.05);
    expect(frameTimes(3600)).toHaveLength(240);
    const t = frameTimes(10, [2.03]);
    expect(t).toHaveLength(19);
    expect(t.some((x) => Math.abs(x - 2.05) < 0.01)).toBe(false);
    expect(joinTimes([{ start: 0, end: 2 }, { start: 3, end: 5 }, { start: 6, end: 7 }], 2)).toEqual([1, 2]);
  });

  it("joins black looks in a row into stretches", () => {
    const looks = [0, 0.5, 1, 1.5, 2, 2.5].map((t, i) => ({ t, black: [1, 2, 5].includes(i) }));
    expect(blackStretches(looks)).toEqual([{ at: 0.5, length: 1 }, { at: 2.5, length: 0.5 }]);
  });
});

describe("what the check says", () => {
  it("warns of clipping from CLIP_MIN places, and of black stretches, with where", () => {
    expect(pictureAndClipIssues({ count: CLIP_MIN - 1, at: 1 }, [])).toEqual([]);
    const [clip, black] = pictureAndClipIssues({ count: 145, at: 2.1 }, [{ at: 3, length: 1 }, { at: 8, length: 0.5 }]);
    expect(clip).toMatchObject({ id: "clipped", at: 2.1 });
    expect(clip.text).toBe("The sound clips (hits full scale) at 0:02.1 and in 144 more places, which crackles.");
    expect(black).toMatchObject({ id: "black", at: 3, text: "The picture is black at 0:03.0 for about 1.0s, and in 1 more place." });
    expect(pictureAndClipIssues(null, [])).toEqual([]);
  });
});
