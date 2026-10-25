// Point to change, merged: a film-edit answer patches one scene and leaves every other scene as it
// was, or, for a note on the whole film, replaces the spec. Pure and free of the app's imports, so
// video-assist (Deno) can run the same merge before parseFilm.
import type { Film, FilmScene } from "./timeline.ts";

export type FilmEditAnswer = { scene: FilmScene; reply: string } | { film: Film; reply: string } | { refuse: true; reason: string };

/**
 * The film with `answer` merged in. A scene answer must keep the id and kind of the scene the note
 * was on (`sceneId`), and lands in that scene's place; its beats may change, which moves every
 * later scene by the same whole beats. A whole-film answer replaces the spec. Run parseFilm after.
 */
export function mergePatch(film: Film, sceneId: string | null, answer: FilmEditAnswer): { ok: true; film: Film } | { ok: false; error: string } {
  if ("refuse" in answer) return { ok: false, error: answer.reason || "That can't be made into a film that's safe to post." };
  if ("film" in answer) {
    if (!answer.film || !Array.isArray(answer.film.scenes)) return { ok: false, error: "The answer held no film." };
    return { ok: true, film: answer.film };
  }
  const patch = answer.scene;
  const i = film.scenes.findIndex((s) => s.id === sceneId);
  if (i < 0) return { ok: false, error: "The note is on a scene the film doesn't have." };
  if (!patch || patch.id !== sceneId) return { ok: false, error: "The change renamed or replaced another scene." };
  if (patch.kind !== film.scenes[i].kind) return { ok: false, error: "The change turned the scene into another kind." };
  return { ok: true, film: { ...film, scenes: film.scenes.map((s, k) => (k === i ? patch : s)) } };
}
