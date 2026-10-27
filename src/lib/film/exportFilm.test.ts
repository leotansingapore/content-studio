import { afterEach, describe, expect, it } from "vitest";
import { encoderDelay, pickEncoder } from "@/lib/fastExport";
import { integratedLoudness, truePeak } from "@/lib/videoEdit";
import { captionAt, mixFilm, placeVoice, voiceSpans, voiceTrack, RATE } from "./exportFilm";
import { goodFilm } from "./fixtures";
import { sceneSpans } from "./timeline";

const G = globalThis as Record<string, unknown>;

afterEach(() => {
  delete G.VideoEncoder;
});

describe("fastExport's encoder helpers, shared with the film export", () => {
  it("pickEncoder tries high, main, then baseline profile at the 1080p level", async () => {
    const asked: string[] = [];
    G.VideoEncoder = { isConfigSupported: async (c: VideoEncoderConfig) => (asked.push(c.codec), { supported: c.codec.startsWith("avc1.4d") }) };
    const cfg = await pickEncoder(1080, 1920, 8_000_000);
    expect(asked).toEqual(["avc1.640028", "avc1.4d0028"]);
    expect(cfg).toMatchObject({ codec: "avc1.4d0028", width: 1080, height: 1920, bitrate: 8_000_000, framerate: 30 });
    G.VideoEncoder = { isConfigSupported: async () => ({ supported: false }) };
    expect(await pickEncoder(1920, 1080, 8_000_000)).toBeNull();
    expect(typeof encoderDelay).toBe("function");
  });
});

/** A 220 Hz tone at `amp` for `seconds`, the stand-in for a read voice. A plain loop: Float32Array.from with a mapper took over a second for 10 s. */
const tone = (seconds: number, amp: number) => {
  const s = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < s.length; i++) s[i] = amp * Math.sin((2 * Math.PI * 220 * i) / RATE);
  return s;
};

describe("the film's voice and mix", () => {
  const film = goodFilm();
  const starts = Object.fromEntries(sceneSpans(film).map((s) => [s.scene.id, s.start]));

  it("lays each line at its own scene, never over the line before it, and captions the line being said", () => {
    const lines = placeVoice(film, {
      ids: ["hook", "app", "end"],
      texts: ["Your week, planned.", "Tap once and it is done.", "Activity Tracker."],
      // the read: the hook's line runs 4.2 s, past the 4 s hook, so the app's line waits for it
      spans: [{ s: 0, e: 4.2 }, { s: 4.3, e: 5.5 }, { s: 5.6, e: 6.4 }],
    });
    expect(lines.map((l) => l.scene)).toEqual(["hook", "app", "end"]);
    expect(lines[0].at).toBeCloseTo(starts.hook + 0.15);
    // the hook's line runs past the app's cut, so the app's waits for it
    expect(lines[1].at).toBeCloseTo(lines[0].at + 4.2 + 0.1);
    expect(lines[2].at).toBeCloseTo(starts.end + 0.15);
    expect(captionAt(lines, 1)).toBe("Your week, planned.");
    expect(captionAt(lines, lines[1].at + 0.5)).toBe("Tap once and it is done.");
    expect(captionAt(lines, lines[2].at + 1)).toBeUndefined();
    expect(voiceSpans(lines)[1].start).toBe(lines[1].at);
    expect(voiceSpans(lines)[1].end).toBeCloseTo(lines[1].at + 1.2);
  });

  it("drops a line with no span or for a scene the film no longer has", () => {
    const lines = placeVoice(film, { ids: ["hook", "gone", "end"], texts: ["One.", "Two.", "Three."], spans: [null, { s: 0, e: 1 }, { s: 1, e: 2 }] });
    expect(lines.map((l) => l.scene)).toEqual(["end"]);
  });

  it("puts each slice of the read at its place on the film's clock", () => {
    const read = new Float32Array(RATE * 2).fill(0.5);
    const out = voiceTrack([{ scene: "hook", text: "a", from: 1, to: 1.5, at: 3 }], [read], 4);
    expect(out.L.length).toBe(4 * RATE);
    expect(out.L[Math.round(2.9 * RATE)]).toBe(0);
    expect(out.L[Math.round(3.25 * RATE)]).toBeCloseTo(0.5);
    expect(out.R[Math.round(3.25 * RATE)]).toBeCloseTo(0.5);
    expect(out.L[Math.round(3.6 * RATE)]).toBe(0);
  });

  it("evens music under a voice to -14 LUFS within 1, true peak at or under -1 dB", () => {
    // 2 s is enough for the gates (400 ms blocks) and keeps the untyped mix cheap while the JIT is starved under load
    const n = 2 * RATE;
    // a quiet bed and a quiet voice (about -27 LUFS) with peaks far over the ceiling: it needs lifting and limiting
    const bed = { L: tone(2, 0.02), R: tone(2, 0.02) };
    const v = new Float32Array(n);
    v.set(tone(1, 0.05), RATE / 2);
    for (let k = 0; k < 4; k++) v[RATE / 2 + k * 12000] = 3;
    const mixed = mixFilm(bed, { L: v, R: v.slice() });
    const lufs = integratedLoudness([mixed.L, mixed.R], RATE)!;
    expect(Math.abs(lufs - -14)).toBeLessThanOrEqual(1);
    expect(Math.abs(mixed.lufs - -14)).toBeLessThanOrEqual(1);
    expect(truePeak([mixed.L, mixed.R])).toBeLessThanOrEqual(-1);
  });
});
