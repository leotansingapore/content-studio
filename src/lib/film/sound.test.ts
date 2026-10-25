import { describe, expect, it } from "vitest";
import { goodFilm, shortFilm } from "./fixtures";
import { filmHits, renderFilmSound, soundKey, soundProbe, SOUND_RATE } from "./sound";
import { plan } from "./synth/score";
import { mixdown } from "./synth/sound";
import { filmEvents, sceneSpans, type Film } from "./timeline";

const bytes = (x: Float32Array) => Buffer.from(x.buffer, x.byteOffset, x.byteLength);

describe("the film's sound", () => {
  it("gives byte-equal buffers for the same film twice, levelled to -14 LUFS under -1 dB", { timeout: 120_000 }, () => {
    const a = renderFilmSound(shortFilm(), { brand: "Activity Tracker" });
    const b = renderFilmSound(shortFilm(), { brand: "Activity Tracker" });
    expect(a.L.length).toBe(8 * SOUND_RATE);
    expect(bytes(a.L).equals(bytes(b.L))).toBe(true);
    expect(bytes(a.R).equals(bytes(b.R))).toBe(true);
    expect(a.lufs).toBeGreaterThan(-15);
    expect(a.lufs).toBeLessThan(-13);
    expect(a.peak).toBeLessThanOrEqual(-1);
    expect(a.style).toBe("pulse");
  });

  it("keeps the cache hash on a text-only change and changes it on a beats change", () => {
    const film = goodFilm();
    const words: Film = { ...film, scenes: film.scenes.map((s) => (s.kind === "type" ? { ...s, words: ["Plan it.", "Done.", "Now."] } : s.kind === "logo" ? { ...s, line: "Another line" } : s)) };
    expect(soundKey(words)).toBe(soundKey(film));
    const longer: Film = { ...film, scenes: film.scenes.map((s) => (s.id === "proof" ? { ...s, beats: 8 } : s)) };
    expect(soundKey(longer)).not.toBe(soundKey(film));
    expect(soundKey(film, { voice: [{ start: 1, end: 2 }] })).not.toBe(soundKey(film));
    expect(soundKey({ ...film, style: 1 })).not.toBe(soundKey(film));
  });

  it("starts the music's sections at the scene starts, with the drop on its scene", () => {
    const film = goodFilm();
    const p = plan({ ...soundProbe(film), voice: false });
    expect(p.sections.map((s: { t: number }) => s.t)).toEqual(sceneSpans(film).map((s) => s.start));
    expect(p.drop).toBe(10);
    expect(p.bpm).toBe(120);
  });

  it("puts each effect on its event, and its sound starts there within one sample block", { timeout: 120_000 }, () => {
    const film = goodFilm();
    const times = new Set(filmEvents(film).map((e) => e.t));
    const hits = filmHits(film);
    expect(hits.length).toBeGreaterThan(20);
    for (const h of hits) expect(times.has(h.at)).toBe(true);
    // one chime alone, two beats in, with the music off: the first sound is at 1.0 s
    const lone: Film = { ...film, drop: undefined, scenes: [{ id: "quiet", kind: "type", beats: 2, words: [] }, { id: "end", kind: "logo", beats: 4 }] };
    expect(filmHits(lone)).toEqual([{ name: "chime", at: 1 }]);
    const { out2 } = mixdown(soundProbe(lone), { musicOff: true });
    let peak = 0;
    for (const v of out2.L) peak = Math.max(peak, Math.abs(v));
    const onset = out2.L.findIndex((v: number) => Math.abs(v) > peak * 0.01);
    expect(Math.abs(onset - SOUND_RATE)).toBeLessThanOrEqual(128);
  });
});
