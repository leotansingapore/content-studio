// The launch film's clock: the beat grid, where each scene starts, when everything in it lands, and
// the rhythm check (rhythmIssues) the server runs after a write, written from huashu-motion's
// references/rhythm.md. Pure and free of imports, so video-assist (Deno) and the browser share it.

// The spec's shape. supabase/functions/video-assist/filmSpec.ts (film-server) owns the parser; these
// are the fields the renderer, the sound and this check read.
export type FilmEnergy = "fast" | "continuous" | "quiet";
export type FilmCut = "hard" | "flood" | "carry" | "whip";
/** x, y, w, h as 0 to 1 shares of a screen picture. */
export type ShareBox = [number, number, number, number];
interface SceneBase {
  id: string;
  beats: number;
  cut?: FilmCut;
}
export interface TypeScene extends SceneBase {
  kind: "type";
  words: string[];
  /** The index in `words` of the word that slams. */
  key?: number;
}
export interface ScreenScene extends SceneBase {
  kind: "screen";
  media?: string;
  frame?: "phone" | "browser";
  camera?: { beat: number; to: "whole" | ShareBox }[];
  tap?: { beat: number; at: [number, number] }[];
  highlight?: { beat: number; box: ShareBox; label?: string };
}
export interface CardsScene extends SceneBase {
  kind: "cards";
  cards: { icon?: string; title: string; line?: string }[];
}
export interface NumberScene extends SceneBase {
  kind: "number";
  value: number;
  prefix?: string;
  suffix?: string;
  label?: string;
}
export interface MontageScene extends SceneBase {
  kind: "montage";
  anchor?: "word" | "frame";
  shots: { media?: string; word?: string }[];
}
export interface LogoScene extends SceneBase {
  kind: "logo";
  line?: string;
  cta?: string;
}
export type FilmScene = TypeScene | ScreenScene | CardsScene | NumberScene | MontageScene | LogoScene;
export interface Film {
  v: 1;
  kind: "launch";
  product: string;
  energy: FilmEnergy;
  bpm: number;
  /** The product type's music style, 0 to 2. */
  style: number;
  font: "brand" | "archivo" | "dm-sans" | "fraunces";
  ground: "ink" | "brand" | "paper";
  accent: string;
  drop?: string;
  scenes: FilmScene[];
  voice?: { on: boolean; lines: Record<string, string> };
}

/** The tempo is set by the energy, in code, not by the writer. */
export const BPM: Record<FilmEnergy, number> = { fast: 120, continuous: 108, quiet: 92 };
export const BAR = 4;

export const bpmOf = (film: Pick<Film, "energy" | "bpm">) => BPM[film.energy] ?? film.bpm ?? BPM.fast;
export const beatSeconds = (film: Pick<Film, "energy" | "bpm">) => 60 / bpmOf(film);
/** Whole beats, at least one, whatever the spec holds. */
export const beatsOf = (s: Pick<SceneBase, "beats">) => Math.max(1, Math.round(Number(s.beats)) || 1);

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

export type FilmEventKind = "cut" | "word" | "screen" | "camera" | "camera-stop" | "tap" | "highlight" | "card" | "count" | "count-end" | "shot" | "logo" | "line" | "cta" | "drop";
export interface FilmEvent {
  kind: FilmEventKind;
  scene: string;
  /** The element it brings in, as in draw's ids: word2, card1, shot3. */
  part?: string;
  /** Beats from the scene's start. */
  at: number;
  /** Seconds from the film's start. */
  t: number;
}

/** Beats a camera move takes. */
export const moveBeats = (energy: FilmEnergy) => (energy === "fast" ? 1 : 2);
/** Beats a number counts up for. */
export const countBeats = (s: Pick<SceneBase, "beats">) => Math.min(4, Math.max(1, beatsOf(s) - 2));

/** When each element of a scene lands, in beats from its start. The renderer and the sound both read these. */
export function sceneBeats(scene: FilmScene, energy: FilmEnergy): Omit<FilmEvent, "t" | "scene">[] {
  const n = beatsOf(scene);
  const last = n - 1;
  const out: Omit<FilmEvent, "t" | "scene">[] = [{ kind: "cut", at: 0 }];
  const spread = (count: number, gap: number) => Array.from({ length: count }, (_, i) => Math.min(i * gap, last));
  if (scene.kind === "type") {
    const gap = Math.max(1, Math.min(energy === "fast" ? 1 : 2, Math.floor(n / Math.max(1, scene.words.length))));
    spread(scene.words.length, gap).forEach((at, i) => out.push({ kind: "word", part: `word${i + 1}`, at }));
  } else if (scene.kind === "screen") {
    out.push({ kind: "screen", part: "screen", at: 0 });
    for (const c of scene.camera ?? []) {
      const at = Math.min(Math.max(0, c.beat), last);
      if (at === 0) continue; // a camera at beat 0 is the opening framing, not a move
      out.push({ kind: "camera", at }, { kind: "camera-stop", at: Math.min(at + moveBeats(energy), n) });
    }
    for (const tp of scene.tap ?? []) out.push({ kind: "tap", at: Math.min(Math.max(0, tp.beat), last) });
    if (scene.highlight) out.push({ kind: "highlight", part: "highlight", at: Math.min(Math.max(0, scene.highlight.beat), last) });
  } else if (scene.kind === "cards") {
    const gap = Math.max(1, Math.min(4, Math.floor(n / (scene.cards.length + 1))));
    spread(scene.cards.length, gap).forEach((at, i) => out.push({ kind: "card", part: `card${i + 1}`, at }));
  } else if (scene.kind === "number") {
    out.push({ kind: "count", part: "value", at: 0 }, { kind: "count-end", part: "value", at: countBeats(scene) });
  } else if (scene.kind === "montage") {
    spread(scene.shots.length, 1).forEach((at, i) => out.push({ kind: "shot", part: `shot${i + 1}`, at }));
  } else if (scene.kind === "logo") {
    out.push({ kind: "logo", part: "logo", at: 0 });
    if (scene.line) out.push({ kind: "line", part: "line", at: Math.min(1, last) });
    if (scene.cta) out.push({ kind: "cta", part: "cta", at: Math.min(2, last) });
  }
  return out;
}

/** Every event in the film, in time order. */
export function filmEvents(film: Film): FilmEvent[] {
  const b = beatSeconds(film);
  const out: FilmEvent[] = [];
  for (const s of sceneSpans(film)) {
    for (const e of sceneBeats(s.scene, film.energy)) out.push({ ...e, scene: s.scene.id, t: (s.beat + e.at) * b });
    if (film.drop && film.drop === s.scene.id) out.push({ kind: "drop", scene: s.scene.id, at: 0, t: s.start });
  }
  return out.sort((x, y) => x.t - y.t);
}

/** When `part` of `scene` lands, in seconds from the scene's start; null when the scene has no such part. */
export function landsAt(film: Film, scene: FilmScene, part: string): number | null {
  const e = sceneBeats(scene, film.energy).find((x) => x.part === part);
  return e ? e.at * beatSeconds(film) : null;
}

const clock = (t: number) => {
  const s = Math.max(0, Math.floor(t + 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * What breaks huashu's rhythm rules, one line each, empty when none: something on the first frame,
 * something new within 3 s, no stretch over 2 bars without an event, a burst of 4 or more a bar
 * between 30 % and 60 % for Fast cuts, the drop on a bar line, the logo held 1.5 s or more.
 */
export function rhythmIssues(film: Film): string[] {
  const issues: string[] = [];
  const b = beatSeconds(film);
  const length = filmLength(film);
  const events = filmEvents(film);
  const eps = 1e-6;
  // what a viewer can see or hear as new; a cut and a word on one frame are one moment
  const times = [...new Set(events.map((e) => Math.round(e.t * 1000) / 1000))].sort((x, y) => x - y);
  if (!events.some((e) => e.t <= eps && e.kind !== "cut" && e.kind !== "drop")) issues.push("Nothing shows on the first frame.");
  const first = times.find((t) => t > eps);
  if (first == null || first > 3 + eps) issues.push("Nothing new happens in the first 3 seconds.");
  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] > 2 * BAR * b + eps) issues.push(`Nothing happens from ${clock(times[i - 1])} to ${clock(times[i])}.`);
  }
  if (film.energy === "fast") {
    const from = 0.3 * length, to = 0.6 * length;
    let burst = false;
    for (let k = Math.ceil(from / b - eps); (k + BAR) * b <= to + eps && !burst; k++) {
      burst = times.filter((t) => t >= k * b - eps && t < (k + BAR) * b - eps).length >= 4;
    }
    if (!burst) issues.push(`Fast cuts needs a burst of 4 or more hits in one bar between ${clock(from)} and ${clock(to)}.`);
  }
  if (film.drop) {
    const s = sceneSpans(film).find((x) => x.scene.id === film.drop);
    if (!s) issues.push("The drop names a scene the film doesn't have.");
    else if (s.beat % BAR !== 0) issues.push("The drop doesn't land on a bar line.");
  }
  const end = sceneSpans(film).pop();
  if (end?.scene.kind !== "logo") issues.push("The film doesn't end on the logo.");
  else if (end.end - end.start < 1.5 - eps) issues.push("Hold the logo for 1.5 seconds or more.");
  return issues;
}
