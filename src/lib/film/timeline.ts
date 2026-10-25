// The launch film's clock for drawing: where each scene sits in seconds, the scene at a time, when a
// part lands. The spec's types, the beat grid, every event's time and rhythmIssues live in
// supabase/functions/video-assist/filmSpec.ts, which the server checks with, and are re-exported here
// so the browser draws and plays the same events the server checked.
import { beatSeconds, beatsOf, sceneBeats, type Film, type FilmScene } from "../../../supabase/functions/video-assist/filmSpec.ts";

export * from "../../../supabase/functions/video-assist/filmSpec.ts";
export type { Box as ShareBox, Energy as FilmEnergy } from "../../../supabase/functions/video-assist/filmSpec.ts";

export interface SceneSpan {
  scene: FilmScene;
  index: number;
  /** Beats from the film's start. */
  beat: number;
  start: number;
  end: number;
}

export function sceneSpans(film: Film): SceneSpan[] {
  const b = beatSeconds(film);
  let beat = 0;
  return film.scenes.map((scene, index) => {
    const n = beatsOf(scene);
    const span = { scene, index, beat, start: beat * b, end: (beat + n) * b };
    beat += n;
    return span;
  });
}

export const filmBeats = (film: Film) => film.scenes.reduce((a, s) => a + beatsOf(s), 0);
export const filmLength = (film: Film) => filmBeats(film) * beatSeconds(film);

/** The scene on screen at t (the last one past the end), with the time inside it. */
export function sceneAt(film: Film, t: number): (SceneSpan & { local: number }) | null {
  const spans = sceneSpans(film);
  if (!spans.length) return null;
  const s = spans.find((x) => t < x.end) ?? spans[spans.length - 1];
  return { ...s, local: t - s.start };
}

/** When `part` of `scene` lands, in seconds from the scene's start; null when the scene has no such part. */
export function landsAt(film: Film, scene: FilmScene, part: string): number | null {
  const e = sceneBeats(scene, film.energy).find((x) => x.part === part);
  return e ? e.at * beatSeconds(film) : null;
}
