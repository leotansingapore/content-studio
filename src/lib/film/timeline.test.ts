import { describe, expect, it } from "vitest";
import { goodFilm } from "./fixtures";
import { BPM, beatSeconds, filmEvents, filmLength, rhythmIssues, sceneAt, sceneSpans, type Film, type FilmEnergy } from "./timeline";

const withScene = (f: Film, id: string, patch: object): Film => ({ ...f, scenes: f.scenes.map((s) => (s.id === id ? ({ ...s, ...patch } as typeof s) : s)) });

describe("the beat grid", () => {
  it.each(["fast", "continuous", "quiet"] as FilmEnergy[])("puts every scene start and cut on a whole beat at %s's bpm", (energy) => {
    const film = { ...goodFilm(), energy };
    const b = 60 / BPM[energy];
    expect(beatSeconds(film)).toBeCloseTo(b, 12);
    let beat = 0;
    for (const s of sceneSpans(film)) {
      expect(s.start).toBeCloseTo(beat * b, 9);
      beat += s.scene.beats;
    }
    expect(filmLength(film)).toBeCloseTo(60 * b, 9);
    for (const e of filmEvents(film).filter((x) => x.kind === "cut")) expect(Number.isInteger(Math.round((e.t / b) * 1e6) / 1e6)).toBe(true);
  });

  it("takes the tempo from the energy, not from the spec's bpm", () => {
    expect(beatSeconds({ ...goodFilm(), energy: "quiet", bpm: 150 })).toBeCloseTo(60 / 92, 12);
  });

  it("rounds a fractional hold to whole beats", () => {
    const film = withScene(goodFilm(), "hook", { beats: 7.6 });
    expect(sceneSpans(film)[1].start).toBeCloseTo(8 * 0.5, 9);
  });

  it("finds the scene at a time", () => {
    const film = goodFilm();
    expect(sceneAt(film, 0)!.scene.id).toBe("hook");
    expect(sceneAt(film, 7.2)).toMatchObject({ scene: { id: "app" }, local: expect.closeTo(3.2, 9) });
    expect(sceneAt(film, 99)!.scene.id).toBe("end");
  });

  it("times the events in a scene by its beats", () => {
    const film = goodFilm();
    const at = (kind: string, scene: string) => filmEvents(film).filter((e) => e.kind === kind && e.scene === scene).map((e) => e.t);
    expect(at("word", "hook")).toEqual([0, 0.5, 1]);
    expect(at("camera", "app")).toEqual([6, 8]); // beat 0 is the opening framing, not a move
    expect(at("shot", "burst")).toEqual([10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5]);
    expect(at("card", "features")).toEqual([14, 15.5, 17]);
    expect(at("drop", "burst")).toEqual([10]);
  });
});

describe("rhythmIssues", () => {
  it("finds nothing wrong with a film that keeps the rules", () => {
    expect(rhythmIssues(goodFilm())).toEqual([]);
  });

  it("finds an empty first frame", () => {
    expect(rhythmIssues(withScene(goodFilm(), "hook", { words: [] }))).toContain("Nothing shows on the first frame.");
  });

  it("finds a first event after 3 s", () => {
    // one word at 0, then nothing until the cut at 4 s
    expect(rhythmIssues(withScene(goodFilm(), "hook", { words: ["Your week."] }))).toEqual(["Nothing new happens in the first 3 seconds."]);
  });

  it("finds a gap of over 2 bars", () => {
    // the number counts up for 4 beats and then holds for 10
    const film = { ...goodFilm(), scenes: goodFilm().scenes.map((s) => (s.id === "proof" ? { ...s, beats: 14 } : s.id === "end" ? { ...s, beats: 6 } : s)) };
    expect(rhythmIssues(film)).toEqual(["Nothing happens from 0:22 to 0:27."]);
  });

  it("finds a missing burst on Fast cuts, and doesn't ask for one otherwise", () => {
    const film = withScene(goodFilm(), "burst", { shots: [{ word: "Calls" }, { word: "Notes" }] });
    expect(rhythmIssues(film)).toEqual(["There's no burst of fast cuts near the middle."]);
    expect(rhythmIssues({ ...film, energy: "continuous" })).toEqual([]);
  });

  it("finds a drop off the bar line", () => {
    const film = { ...goodFilm(), scenes: goodFilm().scenes.map((s) => (s.id === "hook" ? { ...s, beats: 10 } : s.id === "end" ? { ...s, beats: 12 } : s)) };
    expect(rhythmIssues(film)).toContain("The drop doesn't land on a bar line.");
  });

  it("finds a logo held 1 s, and a film that doesn't end on it", () => {
    expect(rhythmIssues(withScene(goodFilm(), "end", { beats: 2 }))).toEqual(["The logo shows for under 1.5 seconds."]);
    const noLogo = { ...goodFilm(), scenes: goodFilm().scenes.slice(0, -1) };
    expect(rhythmIssues(noLogo)).toContain("The film doesn't end on the logo.");
  });
});
