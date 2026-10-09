import { describe, expect, it, vi } from "vitest";
import { exportFast, fileSink, musicLevels, spedParts, voiceParts, voiceRamps } from "./fastExport";
import { srcAt } from "./videoEdit";
import { musicGainAt } from "./videoEdit";
import { dropGain } from "./videoMotion";

describe("fast export plan", () => {
  it("lays each kept part of the filmed sound end to end", () => {
    expect(voiceParts([{ start: 0.5, end: 2 }, { start: 3, end: 4.5 }, { start: 6, end: 6.5 }])).toEqual([
      { at: 0, from: 0.5, dur: 1.5 },
      { at: 1.5, from: 3, dur: 1.5 },
      { at: 3, from: 6, dur: 0.5 },
    ]);
  });

  it("fades the voice in and out over 25 ms at every cut, at the volume set", () => {
    expect(voiceRamps([{ at: 0, dur: 1 }, { at: 1, dur: 2 }], 0.8)).toEqual([
      ["set", 0, 0], ["ramp", 0.8, 0.025], ["set", 0.8, 0.975], ["ramp", 0, 1],
      ["set", 0, 1], ["ramp", 0.8, 1.025], ["set", 0.8, 2.975], ["ramp", 0, 3],
    ]);
    // a part shorter than two fades fades over half its length each way
    expect(voiceRamps([{ at: 2, dur: 0.04 }], 1)).toEqual([["set", 0, 2], ["ramp", 1, 2.02], ["set", 1, 2.02], ["ramp", 0, 2.04]]);
  });

  it("sets the music at every frame as the real-time export does: ducked under speech, out at the drop", () => {
    const spans = [{ s: 1, e: 2 }];
    const levels = musicLevels(spans, 0.35, 4, 3);
    expect(levels).toHaveLength(120);
    for (const [t, v] of levels) expect(v).toBeCloseTo(musicGainAt(spans, t, 0.35, 4) * dropGain(3, t), 9);
    // on the drop the music is silent, under speech it is a quarter, in a gap at full level
    expect(levels[3 * 30 + 15][1]).toBe(0);
    expect(levels[45][1]).toBeCloseTo(0.35 * 0.25, 9);
    expect(levels[18][1]).toBeCloseTo(0.35, 9);
  });

  it("plays a sped-up edit's voice sooner and shorter, on the frames that show it", () => {
    const segs = [{ start: 0.5, end: 2 }, { start: 3, end: 4.5, fast: [[3.5, 4] as [number, number]] }];
    const parts = spedParts(voiceParts(segs), 1.25);
    expect(parts).toEqual([
      { at: 0, from: 0.5, dur: 1.2 },
      { at: 1.2, from: 3, dur: 0.4 },
      // after the pause played fast (0.5 s at 4x)
      { at: (1.5 + 0.5 + 0.125) / 1.25, from: 4, dur: 0.4 },
    ]);
    // each part starts on the frame showing the source moment its sound starts at
    for (const p of parts) expect(srcAt(segs, p.at + 1e-9, 1.25)).toBeCloseTo(p.from, 6);
  });

  it("exports a sped-up edit fast too, and hands back to the real-time export only where there is no WebCodecs", async () => {
    // Node has no VideoEncoder, as Firefox and older Safari don't
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    for (const speed of [1, 1.1]) {
      const settings = { speed } as Parameters<typeof exportFast>[0]["settings"];
      expect(await exportFast({ file: new Blob([]), words: [], settings }, () => {}, new AbortController().signal)).toBeNull();
      expect(info).toHaveBeenLastCalledWith("Export in real time: no WebCodecs");
    }
    info.mockRestore();
  });

  it("gathers the muxer's writes in order and puts its one write back into the head of the file", async () => {
    const sink = fileSink();
    const write = (sink.target as unknown as { options: { onData: (d: Uint8Array, at: number) => void } }).options.onData;
    write(new Uint8Array([1, 2, 3, 4]), 0);
    write(new Uint8Array([5, 6]), 4);
    write(new Uint8Array([7]), 6);
    // the media size, filled in at the end
    write(new Uint8Array([9, 9]), 1);
    expect(Array.from(new Uint8Array(await sink.blob("video/mp4").arrayBuffer()))).toEqual([1, 9, 9, 4, 5, 6, 7]);
    expect(sink.blob("video/mp4").type).toBe("video/mp4");
    expect(() => write(new Uint8Array([0]), 5)).toThrow("out of order");
  });
});
