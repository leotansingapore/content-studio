import { describe, expect, it } from "vitest";
import { mergePatch } from "./edit";
import { goodFilm } from "./fixtures";
import { soundKey } from "./sound";
import { beatSeconds, sceneSpans, type FilmScene } from "./timeline";

const scene = (id: string) => goodFilm().scenes.find((s) => s.id === id)!;
const others = (scenes: FilmScene[], id: string) => scenes.filter((s) => s.id !== id).map((s) => JSON.stringify(s));

describe("mergePatch", () => {
  it("changes only the scene the note was on, keeping every other scene byte for byte", () => {
    const film = goodFilm();
    const cards = scene("features") as Extract<FilmScene, { kind: "cards" }>;
    const patch = { ...cards, cards: cards.cards.map((c, i) => (i === 1 ? { ...c, title: "Plan it" } : c)) };
    const out = mergePatch(film, "features", { scene: patch, reply: "Card 2 now reads Plan it." });
    if (out.ok === false) throw new Error(out.error);
    expect(others(out.film.scenes, "features")).toEqual(others(film.scenes, "features"));
    expect(JSON.stringify(out.film.scenes.find((s) => s.id === "features"))).toBe(JSON.stringify(patch));
    expect(out.film.scenes.map((s) => s.id)).toEqual(film.scenes.map((s) => s.id));
    // a text change leaves the sound alone
    expect(soundKey(out.film)).toBe(soundKey(film));
  });

  it("refuses a patch that renames or replaces another scene, or changes the kind", () => {
    const film = goodFilm();
    expect(mergePatch(film, "features", { scene: { ...scene("proof") }, reply: "" }).ok).toBe(false);
    expect(mergePatch(film, "features", { scene: { ...scene("features"), id: "feature-cards" }, reply: "" }).ok).toBe(false);
    expect(mergePatch(film, "features", { scene: { ...scene("proof"), id: "features" }, reply: "" }).ok).toBe(false);
    expect(mergePatch(film, "nope", { scene: scene("features"), reply: "" }).ok).toBe(false);
  });

  it("moves every later scene by the same whole beats on a timing patch, and changes the sound's hash", () => {
    const film = goodFilm();
    const out = mergePatch(film, "features", { scene: { ...scene("features"), beats: 16 }, reply: "Held 2 bars longer." });
    if (out.ok === false) throw new Error(out.error);
    const b = beatSeconds(film);
    const before = sceneSpans(film), after = sceneSpans(out.film);
    after.forEach((s, i) => {
      const shift = (s.start - before[i].start) / b;
      expect(shift).toBeCloseTo(i > 3 ? 4 : 0, 9);
    });
    expect(others(out.film.scenes, "features")).toEqual(others(film.scenes, "features"));
    expect(soundKey(out.film)).not.toBe(soundKey(film));
  });

  it("replaces the spec on a whole-film answer, and passes a refusal through", () => {
    const film = goodFilm();
    const whole = { ...film, energy: "quiet" as const };
    expect(mergePatch(film, null, { film: whole, reply: "Slowed it down." })).toEqual({ ok: true, film: whole });
    expect(mergePatch(film, "hook", { refuse: true, reason: "No." })).toEqual({ ok: false, error: "No." });
  });
});
