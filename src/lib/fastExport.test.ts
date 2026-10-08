import { describe, expect, it, vi } from "vitest";
import { exportFast, fastBlocker, musicLevels, voiceParts, voiceRamps } from "./fastExport";
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

  it("records in real time when the edit is sped up, since only the browser keeps the pitch", () => {
    expect(fastBlocker({ speed: 1.2 })).toBe("speed");
    expect(fastBlocker({ speed: 1 })).toBeNull();
    expect(fastBlocker({})).toBeNull();
  });

  it("hands back to the real-time export where there is no WebCodecs", async () => {
    // Node has no VideoEncoder, as Firefox and older Safari don't
    const settings = { speed: 1 } as Parameters<typeof exportFast>[0]["settings"];
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await exportFast({ file: new Blob([]), words: [], settings }, () => {}, new AbortController().signal)).toBeNull();
    expect(info).toHaveBeenCalledWith("Export in real time: no WebCodecs");
    info.mockRestore();
  });
});
