// The launch film's scene spec (formats-launch-film): its types, `parseFilm`, the beat grid with every event's time, and
// the rhythm check. src/lib/film/timeline.ts re-exports all of it, so the server checks the events the studio draws.
// The model writes this JSON, never code; our own renderer (src/lib/film) draws it, so one parser decides what can be drawn:
// known kinds, unique ids, word caps, the brand's own Media keys, kit colour roles, and no URL anywhere but the end card's cta.
// No Deno or npm imports: the browser imports this same file (as mediaLibrary.ts imports media-sort/logic.ts), so the
// server's check after a write and the studio's check before a save are one check.
//
// The rhythm rules and the 12 product types (with their `about` lines) are distilled from huashu-motion v0.3.1 (52467f9):
// skills/huashu-motion/references/rhythm.md and director.md, and cli/lib/score.js. MIT, Copyright (c) 2026 Huashu.

export const FILM_LENGTHS = [15, 30, 60] as const;
export type FilmLength = (typeof FILM_LENGTHS)[number];
export const MAX_SECONDS = 60;
export const MAX_SCENES = 10;
export const MAX_SCENE_BEATS = 32;

export const ENERGIES = ["fast", "continuous", "quiet"] as const;
export type Energy = (typeof ENERGIES)[number];
/** Beats a minute for each energy, set in code: the model never picks a tempo, so cuts and music share one grid. */
export const BPM: Record<Energy, number> = { fast: 120, continuous: 108, quiet: 92 };

export const SHAPES = ["9x16", "1x1", "16x9"] as const;
export type Shape = (typeof SHAPES)[number];
export const FONTS = ["brand", "archivo", "dm-sans", "fraunces"] as const;
export type Font = (typeof FONTS)[number];
export const GROUNDS = ["ink", "brand", "paper"] as const;
export type Ground = (typeof GROUNDS)[number];
/** "brand", or one of the kit's palette colours by name. */
export type Accent = "brand" | `palette:${string}`;
export const CUTS = ["hard", "flood", "carry", "whip"] as const;
export type Cut = (typeof CUTS)[number];
/** t2_keynote_ui's nine card drawings plus ui.js's three (huashu-motion runtime/clip). */
export const ICONS = ["clock", "phone", "layers", "chart", "code", "check", "play", "bolt", "lock", "wave", "memory", "agent"] as const;
export type Icon = (typeof ICONS)[number];
export const FRAMES = ["phone", "browser"] as const;
export const ANCHORS = ["word", "frame"] as const;
export const SCENE_KINDS = ["type", "screen", "cards", "number", "montage", "logo"] as const;
export type SceneKind = (typeof SCENE_KINDS)[number];

/** The music's product types; Jev picks one from these `about` lines, and each has three styles (score.js). */
export const PRODUCT_TYPES = {
  devtool: "developer tools, productivity SaaS",
  ai: "AI models, big launches",
  hardware: "hardware, devices, tech objects",
  consumer: "consumer apps, lifestyle",
  cute: "cute, pets, casual, toys",
  creative: "creator and design tools",
  game: "games and entertainment",
  data: "finance, data, enterprise",
  explainer: "education, explainers, science",
  calm: "health, meditation, quiet focus",
  guofeng: "Chinese culture and brands",
  hype: "fashion, sport, high energy",
} as const;
export type ProductType = keyof typeof PRODUCT_TYPES;
export const PRODUCT_IDS = Object.keys(PRODUCT_TYPES) as ProductType[];
/** When Jev has no answer: one fixed value, since telling a software brand from an adviser's would itself be a decision. */
export const DEFAULT_PRODUCT: ProductType = "devtool";

/** Words per field: the spec's caps (a type line 6, a card title 5, a card line 12) and the rest set here. */
export const WORDS = { typeLine: 6, cardTitle: 5, cardLine: 12, label: 4, numberLabel: 6, shotWord: 3, logoLine: 8, voiceLine: 30 } as const;
export const MAX_TYPE_LINES = 8;
export const MAX_CARDS = 3;
export const MIN_SHOTS = 4;
export const MAX_SHOTS = 8;

/** x, y, width and height as shares (0 to 1) of the screen picture, never pixels, so one spec lays out in every shape. */
export type Box = [number, number, number, number];
interface SceneBase {
  id: string;
  beats: number;
  cut?: Cut;
}
export interface TypeScene extends SceneBase {
  kind: "type";
  /** One line lands per beat; `key` is the line that slams. */
  words: string[];
  key?: number;
}
export interface ScreenScene extends SceneBase {
  kind: "screen";
  /** A Media key; missing draws a plain card in the brand colour. */
  media?: string;
  frame: (typeof FRAMES)[number];
  camera: { beat: number; to: "whole" | Box }[];
  tap: { beat: number; at: [number, number] }[];
  highlight?: { beat: number; box: Box; label: string };
}
export interface CardsScene extends SceneBase {
  kind: "cards";
  cards: { icon: Icon; title: string; line: string }[];
}
export interface NumberScene extends SceneBase {
  kind: "number";
  /** Only a figure the person typed or the brand's own facts hold, never an invented one (the prompt's rule). */
  value: number;
  suffix?: string;
  label: string;
}
export interface MontageScene extends SceneBase {
  kind: "montage";
  /** What stays put while the shots change: the word's place, or the device frame. */
  anchor: (typeof ANCHORS)[number];
  shots: { media?: string; word: string }[];
}
export interface LogoScene extends SceneBase {
  kind: "logo";
  line: string;
  /** Drawn as plain text; the one field that may read like a web address. */
  cta?: string;
}
export type FilmScene = TypeScene | ScreenScene | CardsScene | NumberScene | MontageScene | LogoScene;

export interface Film {
  v: 1;
  kind: "launch";
  product: ProductType;
  energy: Energy;
  bpm: number;
  /** The product type's music style, 0 to 2 (huashu's variant); the direction's place in its three. */
  style: 0 | 1 | 2;
  font: Font;
  ground: Ground;
  accent: Accent;
  /** The scene the music drops on: the hero moment. */
  drop: string;
  scenes: FilmScene[];
  /** Lines by scene id, read by the AI voice when `on`. */
  voice: { on: boolean; lines: Record<string, string> };
}

export interface FilmCtx {
  /** The Media keys the browser sent; when missing, keys are checked for shape only (another device's film). */
  media?: string[];
  /** The kit's colours, so a colour the model wrote maps to its role or is refused. */
  kit?: { color: string; palette: { name: string; hex: string }[] };
  /** The chosen length in seconds (Fix it: the film's own): the scenes' beats are clamped to land on it within a bar. Missing (an edit): at most 60 s. */
  length?: number;
}

export type FilmParse = { ok: true; film: Film; notes: string[] } | { ok: false; problems: string[] };

const MEDIA_KEY = /^(cimg|cvid)-[a-z0-9]{6,30}$/; // mediaLibrary.ts's KEY
const SCENE_ID = /^[a-z][a-z0-9-]{0,23}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const URLISH = /\b(?:https?:\/\/|www\.)\S|\b[a-z0-9-]+\.(?:com|net|org|io|co|sg|app|ai|dev|me|ly|xyz|link|site|page)\b/i;

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const pick = <T extends string | number>(v: unknown, list: readonly T[]): T | undefined => list.find((x) => x === v);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const share = (v: unknown) => clamp(Number(v) || 0, 0, 1);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Tidied text cut to `max` words; "" for anything that isn't a string. */
export function capWords(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, max).join(" ").slice(0, 120);
}

function box(v: unknown): Box | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const [x, y] = [share(v[0]), share(v[1])];
  const w = clamp(Number(v[2]) || 0, 0, 1 - x);
  const h = clamp(Number(v[3]) || 0, 0, 1 - y);
  return w > 0 && h > 0 ? [round3(x), round3(y), round3(w), round3(h)] : null;
}

/** A beat inside a scene: a whole number from 0 to the scene's last beat. */
const beatIn = (v: unknown, beats: number) => clamp(Math.round(Number(v) || 0), 0, beats - 1);

interface Checks {
  problems: string[];
  ctx: FilmCtx;
}

/** A Media key the brand has; anything else is a problem, so a write never points at a file the person lacks. */
function mediaKey(v: unknown, id: string, c: Checks): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || !MEDIA_KEY.test(v) || (c.ctx.media && !c.ctx.media.includes(v))) {
    c.problems.push(`The scene "${id}" uses a screen that isn't in the brand's Media.`);
    return undefined;
  }
  return v;
}

function text(v: unknown, max: number, where: string, c: Checks, url = false): string {
  const t = capWords(v, max);
  if (!url && URLISH.test(t)) c.problems.push(`${where} has a web address; only the end card's cta may.`);
  return t;
}

function refuse(problems: string[], why: string): null {
  problems.push(why);
  return null;
}

/** One scene, tidied; null (with its problem) when it can't be drawn. `beats` is rounded and clamped, not yet fitted to the length. */
export function parseScene(raw: unknown, ctx: FilmCtx = {}, problems: string[] = []): FilmScene | null {
  const r = obj(raw);
  const c: Checks = { problems, ctx };
  const id = typeof r.id === "string" ? r.id.trim().toLowerCase() : "";
  if (!SCENE_ID.test(id)) return refuse(problems, `A scene has an id we can't use (${JSON.stringify(String(r.id ?? "")).slice(0, 30)}): lowercase letters, numbers and dashes.`);
  const kind = pick(r.kind, SCENE_KINDS);
  if (!kind) return refuse(problems, `The scene "${id}" has a kind we can't draw (${JSON.stringify(String(r.kind ?? "")).slice(0, 30)}).`);
  const beats = clamp(Math.round(Number(r.beats) || 0), 1, MAX_SCENE_BEATS);
  const cut = pick(r.cut, CUTS);
  const base = { id, beats, ...(cut ? { cut } : {}) };
  const where = `The scene "${id}"`;

  if (kind === "type") {
    const words = (Array.isArray(r.words) ? r.words : []).map((w) => text(w, WORDS.typeLine, where, c)).filter(Boolean).slice(0, MAX_TYPE_LINES);
    if (!words.length) return refuse(problems, `${where} has no words.`);
    const key = Number.isInteger(r.key) && (r.key as number) >= 0 && (r.key as number) < words.length ? (r.key as number) : undefined;
    return { ...base, kind, words, ...(key === undefined ? {} : { key }) };
  }
  if (kind === "screen") {
    const media = mediaKey(r.media, id, c);
    const camera = (Array.isArray(r.camera) ? r.camera : []).flatMap((m) => {
      const o = obj(m);
      const to = o.to === "whole" ? ("whole" as const) : box(o.to);
      return to ? [{ beat: beatIn(o.beat, beats), to }] : [];
    });
    const tap = (Array.isArray(r.tap) ? r.tap : []).flatMap((m) => {
      const o = obj(m);
      return Array.isArray(o.at) && o.at.length === 2 ? [{ beat: beatIn(o.beat, beats), at: [round3(share(o.at[0])), round3(share(o.at[1]))] as [number, number] }] : [];
    });
    const h = obj(r.highlight);
    const hb = box(h.box);
    const label = text(h.label, WORDS.label, where, c);
    return {
      ...base,
      kind,
      ...(media ? { media } : {}),
      frame: pick(r.frame, FRAMES) ?? "phone",
      camera,
      tap,
      ...(hb && label ? { highlight: { beat: beatIn(h.beat, beats), box: hb, label } } : {}),
    };
  }
  if (kind === "cards") {
    const cards = (Array.isArray(r.cards) ? r.cards : []).slice(0, MAX_CARDS).flatMap((x) => {
      const o = obj(x);
      const title = text(o.title, WORDS.cardTitle, where, c);
      return title ? [{ icon: pick(o.icon, ICONS) ?? "check", title, line: text(o.line, WORDS.cardLine, where, c) }] : [];
    });
    if (!cards.length) return refuse(problems, `${where} has no cards.`);
    return { ...base, kind, cards };
  }
  if (kind === "number") {
    const value = Number(r.value);
    if (typeof r.value !== "number" || !Number.isFinite(value)) return refuse(problems, `${where} has no figure.`);
    const suffix = typeof r.suffix === "string" ? r.suffix.replace(/\s+/g, " ").slice(0, 12) : "";
    const label = text(r.label, WORDS.numberLabel, where, c);
    if (URLISH.test(suffix)) problems.push(`${where} has a web address; only the end card's cta may.`);
    return { ...base, kind, value, ...(suffix.trim() ? { suffix } : {}), label };
  }
  if (kind === "montage") {
    const shots = (Array.isArray(r.shots) ? r.shots : []).slice(0, MAX_SHOTS).map((x) => {
      const o = obj(x);
      const media = mediaKey(o.media, id, c);
      return { ...(media ? { media } : {}), word: text(o.word, WORDS.shotWord, where, c) };
    });
    if (shots.length < MIN_SHOTS) return refuse(problems, `${where} needs ${MIN_SHOTS} to ${MAX_SHOTS} shots.`);
    return { ...base, kind, anchor: pick(r.anchor, ANCHORS) ?? "word", shots };
  }
  const cta = typeof r.cta === "string" ? r.cta.replace(/\s+/g, " ").trim().slice(0, 40) : "";
  return { ...base, kind: "logo", line: text(r.line, WORDS.logoLine, where, c), ...(cta ? { cta } : {}) };
}

/** A colour role from the kit; a hex the kit holds maps to its role, any other hex is refused. */
export function parseGround(v: unknown, ctx: FilmCtx, problems: string[]): Ground {
  const g = pick(v, GROUNDS);
  if (g) return g;
  if (typeof v === "string" && HEX.test(v) && ctx.kit && v.toLowerCase() === ctx.kit.color.toLowerCase()) return "brand";
  if (typeof v === "string" && HEX.test(v)) problems.push(`The ground colour ${v} isn't in the brand kit.`);
  return "ink";
}

export function parseAccent(v: unknown, ctx: FilmCtx, problems: string[]): Accent {
  const names = ctx.kit?.palette.map((p) => p.name);
  if (v === "brand") return "brand";
  if (typeof v === "string" && v.startsWith("palette:") && (!names || names.includes(v.slice(8)))) return v as Accent;
  if (typeof v === "string" && HEX.test(v) && ctx.kit) {
    if (v.toLowerCase() === ctx.kit.color.toLowerCase()) return "brand";
    const p = ctx.kit.palette.find((x) => x.hex.toLowerCase() === v.toLowerCase());
    if (p) return `palette:${p.name}`;
  }
  if (typeof v === "string" && HEX.test(v)) problems.push(`The accent colour ${v} isn't in the brand kit.`);
  return "brand";
}

/** How many beats a length holds at this tempo. */
export const beatsFor = (seconds: number, bpm: number) => Math.round((seconds * bpm) / 60);

/** Beats fitted so the total lands on `target` within a bar: each scene scaled, the rounding settled on the last. */
function fitBeats(scenes: FilmScene[], target: number): void {
  const total = scenes.reduce((n, s) => n + s.beats, 0);
  if (Math.abs(total - target) <= 4) return;
  for (const s of scenes) s.beats = clamp(Math.round((s.beats * target) / total), 1, MAX_SCENE_BEATS);
  const last = scenes[scenes.length - 1];
  last.beats = clamp(last.beats + target - scenes.reduce((n, s) => n + s.beats, 0), 1, MAX_SCENE_BEATS);
}

/** Events past a scene's new end move onto its last beat. */
function clampEvents(s: FilmScene): FilmScene {
  if (s.kind !== "screen") return s;
  const b = (n: number) => Math.min(n, s.beats - 1);
  return {
    ...s,
    camera: s.camera.map((m) => ({ ...m, beat: b(m.beat) })),
    tap: s.tap.map((m) => ({ ...m, beat: b(m.beat) })),
    ...(s.highlight ? { highlight: { ...s.highlight, beat: b(s.highlight.beat) } } : {}),
  };
}

/**
 * The spec as the renderer draws it, or what's wrong with it. Refused: no scenes or more than 10, an unknown kind, a
 * repeated id, a web address outside the cta, a Media key the brand lacks, a hex colour outside the kit, a drop that
 * names no scene. Fixed: words capped per field, beats made whole and fitted to the length within a bar (or trimmed
 * from the end to 60 s), events kept inside their scene, unknown options set to their defaults. Same answer twice.
 */
export function parseFilm(raw: unknown, ctx: FilmCtx = {}): FilmParse {
  const r = obj(raw);
  const problems: string[] = [];
  const notes: string[] = [];
  const list = Array.isArray(r.scenes) ? r.scenes : [];
  if (!list.length) return { ok: false, problems: ["The film has no scenes."] };
  if (list.length > MAX_SCENES) return { ok: false, problems: [`The film has ${list.length} scenes; ${MAX_SCENES} at most.`] };
  const scenes: FilmScene[] = [];
  for (const s of list) {
    const scene = parseScene(s, ctx, problems);
    if (!scene) continue;
    if (scenes.some((x) => x.id === scene.id)) problems.push(`Two scenes are called "${scene.id}".`);
    else scenes.push(scene);
  }
  const energy = pick(r.energy, ENERGIES) ?? "fast";
  const bpm = BPM[energy];
  const drop = typeof r.drop === "string" ? r.drop.trim().toLowerCase() : "";
  if (scenes.length && !scenes.some((s) => s.id === drop)) problems.push(`The drop names no scene ("${drop.slice(0, 24)}").`);
  const font = pick(r.font, FONTS) ?? "brand";
  const ground = parseGround(r.ground, ctx, problems);
  const accent = parseAccent(r.accent, ctx, problems);
  // the voice's lines by scene id; the model writes them as a list of { scene, line }
  const v = obj(r.voice);
  const pairs = Array.isArray(v.lines) ? v.lines.map((x) => [obj(x).scene, obj(x).line]) : Object.entries(obj(v.lines));
  const lines: Record<string, string> = {};
  for (const [id, line] of pairs) {
    const t = text(line, WORDS.voiceLine, "The voice", { problems, ctx });
    if (typeof id === "string" && t && scenes.some((s) => s.id === id)) lines[id] = t;
  }
  if (problems.length) return { ok: false, problems };

  if (ctx.length) fitBeats(scenes, beatsFor(ctx.length, bpm));
  const max = beatsFor(MAX_SECONDS, bpm);
  let over = scenes.reduce((n, s) => n + s.beats, 0) - max;
  if (over > 0) notes.push("Trimmed the end to keep the film to 60 seconds.");
  for (let i = scenes.length - 1; i >= 0 && over > 0; i--) {
    const cut = Math.min(over, scenes[i].beats - 1);
    scenes[i].beats -= cut;
    over -= cut;
  }

  return {
    ok: true,
    notes,
    film: {
      v: 1,
      kind: "launch",
      product: pick(r.product, PRODUCT_IDS) ?? DEFAULT_PRODUCT,
      energy,
      bpm,
      style: pick(r.style, [0, 1, 2] as const) ?? 0,
      font,
      ground,
      accent,
      drop,
      scenes: scenes.map(clampEvents),
      voice: { on: v.on === true, lines },
    },
  };
}

// ---------- the beat grid: what the studio draws and plays (src/lib/film), and the server's check after a write ----------

export const BAR = 4;
/** The tempo comes from the energy, in code, not from the writer. */
export const bpmOf = (film: Pick<Film, "energy" | "bpm">) => BPM[film.energy] ?? film.bpm ?? BPM.fast;
export const beatSeconds = (film: Pick<Film, "energy" | "bpm">) => 60 / bpmOf(film);
/** Whole beats, at least one, whatever the spec holds. */
export const beatsOf = (s: { beats: number }) => Math.max(1, Math.round(Number(s.beats)) || 1);

/** Each scene's first beat. */
export function sceneStarts(film: Pick<Film, "scenes">): number[] {
  let at = 0;
  return film.scenes.map((s) => {
    const start = at;
    at += beatsOf(s);
    return start;
  });
}

export type EventKind = "cut" | "word" | "screen" | "camera" | "camera-stop" | "tap" | "highlight" | "card" | "count" | "count-end" | "shot" | "logo" | "line" | "cta" | "drop";
export interface FilmEvent {
  kind: EventKind;
  scene: string;
  /** The element it brings in, as in draw's ids: word2, card1, shot3. */
  part?: string;
  /** Beats from the scene's start. */
  at: number;
  /** Whole beats from the film's start. */
  beat: number;
  /** Seconds from the film's start. */
  t: number;
}

/** Beats a camera move takes. */
export const moveBeats = (energy: Energy) => (energy === "fast" ? 1 : 2);
/** Beats a number counts up for. */
export const countBeats = (s: { beats: number }) => Math.min(4, Math.max(1, beatsOf(s) - 2));

/** When each element of a scene lands, in beats from its start. The renderer, the sound and rhythmIssues all read these. */
export function sceneBeats(scene: FilmScene, energy: Energy): Pick<FilmEvent, "kind" | "part" | "at">[] {
  const n = beatsOf(scene);
  const last = n - 1;
  const out: Pick<FilmEvent, "kind" | "part" | "at">[] = [{ kind: "cut", at: 0 }];
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

/** Every event in the film, in time order: what the studio draws and plays, so the server checks the film it shows. */
export function filmEvents(film: Pick<Film, "scenes" | "energy" | "bpm" | "drop">): FilmEvent[] {
  const b = beatSeconds(film);
  const starts = sceneStarts(film);
  const out: FilmEvent[] = [];
  film.scenes.forEach((s, i) => {
    for (const e of sceneBeats(s, film.energy)) out.push({ ...e, scene: s.id, beat: starts[i] + e.at, t: (starts[i] + e.at) * b });
    if (film.drop && film.drop === s.id) out.push({ kind: "drop", scene: s.id, at: 0, beat: starts[i], t: starts[i] * b });
  });
  return out.sort((x, y) => x.t - y.t);
}

const clock = (t: number) => {
  const s = Math.max(0, Math.floor(t + 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * What breaks huashu's rhythm rules, in words a person reads (and the writer gets on its retry); [] for a good film.
 * Read off filmEvents: something on the first frame besides the cut; something new within 3 s; no stretch over 2 bars
 * without an event (the logo's closing hold aside); on Fast cuts, a bar with an event on every beat between 30 and 60
 * percent of the length; the drop on a bar line; the film ending on the logo, held 1.5 s or more.
 */
export function rhythmIssues(film: Pick<Film, "scenes" | "bpm" | "energy" | "drop">): string[] {
  const issues: string[] = [];
  const sec = beatSeconds(film);
  const total = film.scenes.reduce((n, s) => n + beatsOf(s), 0);
  const events = filmEvents(film);
  // what a viewer can see or hear as new; a cut and a word on one beat are one moment
  const beats = [...new Set(events.map((e) => e.beat))];
  if (!events.some((e) => e.beat === 0 && e.kind !== "cut" && e.kind !== "drop")) issues.push("Nothing shows on the first frame.");
  if (!beats.some((b) => b > 0 && b * sec <= 3)) issues.push("Nothing new happens in the first 3 seconds.");
  const last = film.scenes[film.scenes.length - 1];
  const points = last?.kind === "logo" ? beats : [...beats, total];
  for (let i = 1; i < points.length; i++) {
    if (points[i] - points[i - 1] > 2 * BAR) issues.push(`Nothing happens from ${clock(points[i - 1] * sec)} to ${clock(points[i] * sec)}.`);
  }
  if (film.energy === "fast") {
    const from = Math.ceil(total * 0.3);
    const to = Math.floor(total * 0.6) - BAR;
    let burst = false;
    for (let s = from; s <= to && !burst; s++) burst = beats.filter((b) => b >= s && b < s + BAR).length >= BAR;
    if (!burst) issues.push("There's no burst of fast cuts near the middle.");
  }
  const at = sceneStarts(film)[film.scenes.findIndex((s) => s.id === film.drop)];
  if (film.drop && at === undefined) issues.push("The drop names a scene the film doesn't have.");
  else if (at !== undefined && at % BAR !== 0) issues.push("The drop doesn't land on a bar line.");
  if (last?.kind !== "logo") issues.push("The film doesn't end on the logo.");
  else if (beatsOf(last) * sec < 1.5) issues.push("The logo shows for under 1.5 seconds.");
  return issues;
}

/** Every word the film puts on screen or in the voice, for the compliance checks. */
export function filmWords(film: Pick<Film, "scenes"> & { voice?: Film["voice"] }): string[] {
  const out = film.scenes.flatMap((s): string[] => {
    if (s.kind === "type") return s.words;
    if (s.kind === "screen") return s.highlight ? [s.highlight.label] : [];
    if (s.kind === "cards") return s.cards.flatMap((c) => [c.title, c.line]);
    if (s.kind === "number") return [`${s.value}${s.suffix ?? ""} ${s.label}`.trim()];
    if (s.kind === "montage") return s.shots.map((x) => x.word);
    return [s.line, s.cta ?? ""];
  });
  return [...out, ...Object.values(film.voice?.lines ?? {})].filter(Boolean);
}
