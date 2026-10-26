// The launch film's jobs and store (formats-launch-film), outside React like wallJob.ts, so leaving
// /make/launch-film keeps a write, the music or an export going and the page shows its step on return.
//
// Store, synced per brand: content-studio-films-<scoped>, up to 20 films newest first in one array (a delete rewrites
// it; cloudSync has no tombstones). Device only: cs-film-history-<id> (the last 30 specs, for Undo) and
// cs-make-film-setup (the last picks). Media files never leave the device that holds them, so another device draws
// a missing screen as a plain card.
//
// Server calls, every one from a press: video-assist film-directions, film and film-edit (caps launch-film and
// film-edit), text-voice lines (ai-voice) when "AI voice reads it" is on. The browser runs parseFilm on every spec
// before it saves, as the server does. A reload mid-write loses the run (the server gives the use back when OpenAI
// never answered); a note left waiting or changing comes back open, its words kept, to be sent again.
// The music renders in sound.worker.ts (src/lib/film), cached by soundKey, so a text edit never re-renders it.

import { DEFAULT_BRAND, loadBrand } from "@/lib/carousel";
import { leoBrandFont, loadBrandFont } from "@/lib/brandFont";
import { draftIdOf } from "@/lib/campaignActions";
import { updatePost } from "@/lib/campaigns";
import { getFile, putFile } from "@/lib/deviceFiles";
import { demoVideos } from "@/lib/demoVideos";
import { callFn, EdgeError } from "@/lib/edgeFn";
import { loadMedia, type DemoFlag } from "@/lib/mediaLibrary";
import { loadProducts, productBrief } from "@/lib/products";
import { scoped } from "@/lib/profiles";
import { brandName, brandPack, loadRemixPrefs } from "@/lib/remixBrand";
import { ensureCaptionFonts, handToEditor, loadVideo, seek, type JoinExtra } from "@/lib/videoMedia";
import type { AiMark } from "@/lib/videoProjects";
import { memoryLine } from "@/lib/voiceMemory";
import type { VoiceId } from "@/lib/textVoice";
import type { FilmAssets, Picture } from "@/lib/film/draw";
import { exportFilm, mixFilm, placeVoice, voiceSpans, voiceTrack, type FilmFile, type PlacedLine, type Stereo } from "@/lib/film/exportFilm";
import { renderFilmSound, soundKey, type FilmSound, type SoundOptions } from "@/lib/film/sound";
import { loudness } from "@/lib/film/synth/sound";
import {
  filmLength, parseFilm, parseScene, rhythmIssues,
  type Accent, type Energy, type Film, type FilmCtx, type FilmLength, type FilmScene, type Ground, type ProductType, type Shape,
} from "@/lib/film/timeline";

export const MAX_FILMS = 20;
export const MAX_FILM_CHARS = 600_000;
export const MAX_HISTORY = 30;
export const MAX_SCREENS = 8;
export const FILMS_CHANGED = "content-studio-films-changed";
export const SETUP_KEY = "cs-make-film-setup";
const PREFIX = "content-studio-films-";
const historyKey = (id: string) => `cs-film-history-${id}`;

export const FAILED = "Couldn't write the film. Try again in a minute.";
export const UNUSABLE = "That film didn't come out right. Try again.";
export const EDIT_FAILED = "Couldn't change only that spot. Try saying it another way.";
export const REFUSED = "That can't be made into a film that's safe to post. Try other words.";
export const VOICE_FAILED = "Couldn't read the film's lines. Try again in a minute.";
export const SIZE_LINE = "Couldn't save the film. This device is out of room.";
export const EXPORT_FAILED = "Couldn't export the film. Try again.";

export interface FilmSetup {
  /** What is launching: a product's name or one typed line. */
  product: string;
  productId?: string;
  /** What people should remember. */
  remember: string;
  /** Media keys, up to 8. */
  screens: string[];
  length: FilmLength;
  shape: Shape;
  energy: Energy;
  /** "AI voice reads it". */
  voice: boolean;
  /** The campaign post this film is for (Make it a launch film). */
  campaign?: { id: string; n: number };
}
export const DEFAULT_SETUP: FilmSetup = { product: "", remember: "", screens: [], length: 30, shape: "9x16", energy: "fast", voice: false };

export interface FilmDirection {
  name: string;
  line: string;
  spine: "screen" | "type" | "cards";
  ground: Ground;
  accent: Accent;
  hero: FilmScene;
}
export interface FilmFlags {
  mas: boolean | null;
  compliance: { id: string }[];
}
export interface FilmNote {
  id: string;
  /** Seconds into the scene (the whole film's time for a note with no scene). */
  t: number;
  /** The point as shares: of the screen picture on a screen, else of the frame. */
  x: number;
  y: number;
  /** <scene>.<part>, "" for the whole film. */
  target: string;
  label: string;
  scene: string | null;
  /** Seconds into the film, where the player goes when the note opens. */
  at: number;
  /** Where its numbered pin sits, as shares of the frame. */
  pin?: [number, number];
  /** Fix it's note: the server keeps the film's length and fills the gaps. */
  fix?: boolean;
  /** The spec its change made (specStamp), so Undo can mark the note it takes back. */
  made?: string;
  undone?: boolean;
  text: string;
  reply?: string;
  /** open: typed, not sent (or sent back with Not quite); waiting: queued behind another; changing: with the writer. */
  status: "open" | "waiting" | "changing" | "done" | "failed";
  error?: string;
  thread: { note: string; reply: string }[];
  sentAt?: string;
}
export interface FilmVoice {
  /** The read's device file (an MP3). */
  key: string;
  voiceId: VoiceId;
  ids: string[];
  texts: string[];
  spans: ({ s: number; e: number } | null)[];
  at: string;
}
export interface StoredFilm {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  setup: FilmSetup;
  directions: FilmDirection[];
  recommended: number | null;
  product: ProductType;
  picked?: number;
  spec?: Film;
  /** What rhythmIssues still finds after the server's retry. */
  issues: string[];
  flags?: FilmFlags;
  notes: FilmNote[];
  exports: { shape: Shape; at: string }[];
  voice?: FilmVoice;
}

// ---------- the store ----------

const store = (): Storage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};
export const filmsKey = (userId: string) => PREFIX + scoped(userId);
export const newFilmId = () => `fm-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A stored film as the page reads it, or null; its spec is kept only when it still parses. */
function cleanFilm(raw: unknown): StoredFilm | null {
  const f = raw as StoredFilm;
  if (!f || typeof f !== "object" || typeof f.id !== "string" || !/^fm-[a-z0-9]+$/.test(f.id) || !f.setup || typeof f.setup !== "object") return null;
  const spec = f.spec ? parseFilm(f.spec) : null;
  return {
    ...f,
    setup: { ...DEFAULT_SETUP, ...f.setup, screens: Array.isArray(f.setup.screens) ? f.setup.screens.slice(0, MAX_SCREENS) : [] },
    directions: Array.isArray(f.directions) ? f.directions : [],
    recommended: typeof f.recommended === "number" ? f.recommended : null,
    // read off the spec itself, so Undo and Fields changes never leave another spec's line (live-p7a D6)
    issues: spec?.ok ? rhythmIssues(spec.film) : [],
    notes: Array.isArray(f.notes) ? f.notes : [],
    exports: Array.isArray(f.exports) ? f.exports : [],
    spec: spec?.ok ? spec.film : undefined,
  };
}

export function loadFilms(userId: string | null | undefined): StoredFilm[] {
  const s = store();
  if (!s || !userId) return [];
  try {
    const raw = JSON.parse(s.getItem(filmsKey(userId)) ?? "[]");
    return Array.isArray(raw) ? raw.map(cleanFilm).filter((f): f is StoredFilm => !!f) : [];
  } catch {
    return [];
  }
}
export const getFilm = (userId: string | null | undefined, id: string | null | undefined): StoredFilm | null => (id ? loadFilms(userId).find((f) => f.id === id) ?? null : null);

/** Saves the film at the top of the list, the oldest past 20 dropped. Null when saved; else the line, and nothing is written. */
export function putFilm(userId: string, film: StoredFilm): string | null {
  const list = [film, ...loadFilms(userId).filter((f) => f.id !== film.id)].slice(0, MAX_FILMS);
  const json = JSON.stringify(list);
  if (json.length > MAX_FILM_CHARS) return SIZE_LINE;
  try {
    store()?.setItem(filmsKey(userId), json);
  } catch {
    return SIZE_LINE;
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(FILMS_CHANGED));
  emit();
  return null;
}

function change(userId: string, id: string, fn: (f: StoredFilm) => StoredFilm): StoredFilm | null {
  const f = getFilm(userId, id);
  if (!f) return null;
  const next = { ...fn(f), updatedAt: new Date().toISOString() };
  return putFilm(userId, next) ? null : next;
}

/** The last picks on this device, for Setup with no params. */
export function loadSetup(): Partial<FilmSetup> {
  try {
    const raw = JSON.parse(store()?.getItem(SETUP_KEY) ?? "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}
export function saveSetup(s: Partial<FilmSetup>): void {
  try {
    store()?.setItem(SETUP_KEY, JSON.stringify({ ...loadSetup(), ...s }));
  } catch {
    // the page still holds it for this visit
  }
}

// ---------- Undo: the specs before each change, on this device ----------

export function loadHistory(id: string): string[] {
  try {
    const raw = JSON.parse(store()?.getItem(historyKey(id)) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function pushHistory(id: string, spec: Film | undefined): void {
  if (!spec) return;
  try {
    store()?.setItem(historyKey(id), JSON.stringify([...loadHistory(id), JSON.stringify(spec)].slice(-MAX_HISTORY)));
  } catch {
    // Undo stops a step short on a full device; the change itself still saves
  }
}

/** A short stamp of a spec, so a note knows the spec it made. */
const specStamp = (spec: Film | undefined) => {
  const j = JSON.stringify(spec ?? null);
  let h = 2166136261;
  for (let i = 0; i < j.length; i++) h = Math.imul(h ^ j.charCodeAt(i), 16777619) >>> 0;
  return `${j.length}.${h.toString(36)}`;
};

/** The spec before the last change, exactly as it was, and the note that made the change marked undone; false when there is none. */
export function undoFilm(userId: string, id: string): boolean {
  const list = loadHistory(id);
  const last = list.pop();
  if (!last) return false;
  const next = change(userId, id, (f) => {
    const taken = specStamp(f.spec);
    return { ...f, spec: JSON.parse(last) as Film, notes: f.notes.map((n) => (n.status === "done" && n.made === taken ? { ...n, undone: true } : n)) };
  });
  if (!next) return false;
  try {
    store()?.setItem(historyKey(id), JSON.stringify(list));
  } catch {
    /* the spec is back either way */
  }
  return true;
}

// ---------- what the writer is sent ----------

export interface ScreenItem {
  key: string;
  name: string;
  alt: string;
  video: boolean;
  flags: DemoFlag[];
  /** A demo video's window: drawn from its middle frame. */
  start?: number;
  end?: number;
}

/** The brand's app screens: Media photos of type screen, newest first, then demo videos. */
export function appScreens(userId: string): ScreenItem[] {
  const photos = loadMedia(userId).filter((m) => m.type === "screen").map((m) => ({ key: m.key, name: m.name, alt: m.alt, video: false, flags: [] }));
  const demos = demoVideos(userId).map((d) => ({ key: d.key, name: d.name, alt: d.shows, video: true, flags: d.flags, start: d.start, end: d.end }));
  return [...photos, ...demos];
}
/** Media photos that aren't typed as screens, for Add from Media. */
export const otherPhotos = (userId: string): ScreenItem[] =>
  loadMedia(userId).filter((m) => m.type !== "screen").map((m) => ({ key: m.key, name: m.name, alt: m.alt, video: false, flags: [] }));

function screenInfo(userId: string, keys: string[]): ScreenItem[] {
  const all = [...appScreens(userId), ...otherPhotos(userId)];
  return keys.flatMap((k) => all.filter((s) => s.key === k).slice(0, 1));
}

/** The brand, kit and screens every film call carries. */
export function filmContext(userId: string, screens: string[]) {
  const pack = brandPack(userId, { platform: "instagram", mention: true, offer: null });
  const kit = loadBrand(userId) ?? DEFAULT_BRAND;
  return {
    brand: { name: pack.name || brandName(userId), oneLiner: pack.oneLiner, audience: pack.audience, facts: pack.facts, memory: memoryLine(userId, "videos"), speaker: pack.speaker },
    kit: { color: kit.color, palette: kit.palette ?? [], font: !!loadBrandFont(userId) },
    screens: screenInfo(userId, screens).map((s) => ({ key: s.key, alt: s.alt, video: s.video })),
  };
}

/** The setup as the server reads it: a picked product goes as its brief. */
export function serverSetup(userId: string, s: FilmSetup) {
  const p = s.productId ? loadProducts(userId).items.find((x) => x.id === s.productId) : undefined;
  return { product: (p ? productBrief(p) : s.product).slice(0, 300), remember: s.remember, length: s.length, shape: s.shape, energy: s.energy, voice: s.voice };
}

/** Every Media key a spec uses. */
export const keysIn = (v: unknown): string[] => JSON.stringify(v ?? null).match(/\b(?:cimg|cvid)-[a-z0-9]{6,30}\b/g) ?? [];

/** What parseFilm checks a spec against: the picked screens and the keys the film already uses, the kit's colours. */
function ctxOf(userId: string, f: StoredFilm, more: unknown = null): FilmCtx {
  const kit = loadBrand(userId) ?? DEFAULT_BRAND;
  return { media: [...new Set([...f.setup.screens, ...keysIn(f.spec), ...keysIn(more)])], kit: { color: kit.color, palette: kit.palette ?? [] } };
}

const nameOf = (s: FilmSetup) => (s.product || s.remember || "Launch film").slice(0, 60);

// ---------- the jobs ----------

export interface FilmJob {
  filmId: string | null;
  kind: "directions" | "film" | "voice";
  startedAt: number;
  state: "working" | "failed";
  error?: string;
  /** The day's uses are gone: the button stays off. */
  capped?: boolean;
}
export interface SoundJob {
  key: string;
  startedAt: number;
  state: "working" | "failed";
  error?: string;
}
export interface ExportJob {
  filmId: string;
  shapes: Shape[];
  files: FilmFile[];
  current: Shape | null;
  progress: number;
  state: "working" | "done" | "stopped" | "failed";
  realtime: boolean;
  startedAt: number;
  ms?: number;
  error?: string;
}

let job: FilmJob | null = null;
/** Directions written while the page was away: Setup opens them on return, once. */
let unseen: string | null = null;
let soundJob: SoundJob | null = null;
let exp: ExportJob | null = null;
let stopper: AbortController | null = null;
const running = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
function emit() {
  version++;
  listeners.forEach((l) => l());
}
/** Calls back on every change to a job, a note or a stored film; returns the unsubscribe. */
export function onFilmJob(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}
export const filmVersion = () => version;
export const filmJob = () => job;
export const soundState = () => soundJob;
export const exportJob = () => exp;
export const writing = () => job?.state === "working";
/** The film whose directions landed with no page to open them, once. */
export function takeUnseen(): string | null {
  const id = unseen;
  unseen = null;
  return id;
}
/** A note is with the writer for this film. */
export const editing = (filmId: string) => running.has(filmId);
export function clearFailure(): void {
  if (job?.state === "failed") {
    job = null;
    emit();
  }
}

const lineOf = (e: unknown, fallback: string) => (e instanceof EdgeError || e instanceof Error ? e.message || fallback : fallback);
const fail = (e: unknown, fallback: string) => {
  job = job && { ...job, state: "failed", error: lineOf(e, fallback), capped: e instanceof EdgeError && e.status === 429 };
  emit();
};

/** "Show me 3 directions" (a new film) or "Show 3 more" (the same film): one launch-film use. The film's id, or null. */
export async function writeDirections(userId: string, setup: FilmSetup, filmId?: string): Promise<string | null> {
  if (writing()) return null;
  job = { filmId: filmId ?? null, kind: "directions", startedAt: Date.now(), state: "working" };
  emit();
  try {
    const r = await callFn<{ directions: FilmDirection[]; recommended: number | null; product: ProductType; flags: FilmFlags }>(
      "video-assist",
      { mode: "film-directions", setup: serverSetup(userId, setup), ...filmContext(userId, setup.screens) },
      FAILED,
    );
    const kit = loadBrand(userId) ?? DEFAULT_BRAND;
    const ctx: FilmCtx = { media: setup.screens, kit: { color: kit.color, palette: kit.palette ?? [] } };
    // the browser draws only what its own parser keeps
    const directions = (r?.directions ?? []).map((d) => ({ ...d, hero: parseScene(d.hero, ctx) as FilmScene }));
    if (directions.length !== 3 || directions.some((d) => !d.hero)) throw new Error(UNUSABLE);
    const now = new Date().toISOString();
    const prev = getFilm(userId, filmId);
    const film: StoredFilm = prev
      ? { ...prev, directions, recommended: r.recommended ?? null, product: r.product, flags: r.flags, updatedAt: now }
      : { id: newFilmId(), name: nameOf(setup), createdAt: now, updatedAt: now, setup, directions, recommended: r.recommended ?? null, product: r.product, flags: r.flags, issues: [], notes: [], exports: [] };
    const line = putFilm(userId, film);
    if (line) throw new Error(line);
    job = null;
    unseen = film.id;
    emit();
    return film.id;
  } catch (e) {
    fail(e, FAILED);
    return null;
  }
}

/** "Make this one": the whole film from a direction (one launch-film use), then its voice when that is on. */
export async function writeFilm(userId: string, filmId: string, pick: number): Promise<boolean> {
  const f = getFilm(userId, filmId);
  const d = f?.directions[pick];
  if (!f || !d || writing()) return false;
  job = { filmId, kind: "film", startedAt: Date.now(), state: "working" };
  emit();
  try {
    const r = await callFn<{ film: Film; issues: string[]; flags: FilmFlags }>(
      "video-assist",
      { mode: "film", setup: serverSetup(userId, f.setup), ...filmContext(userId, f.setup.screens), direction: d, product: f.product, style: pick },
      FAILED,
    );
    const parsed = parseFilm(r?.film, ctxOf(userId, f));
    if (parsed.ok === false) throw new Error(UNUSABLE);
    const latest = getFilm(userId, filmId) ?? f;
    pushHistory(filmId, latest.spec);
    const line = putFilm(userId, { ...latest, picked: pick, spec: parsed.film, issues: r.issues ?? [], flags: r.flags, updatedAt: new Date().toISOString() });
    if (line) throw new Error(line);
    job = null;
    emit();
    if (parsed.film.voice.on && voiceLines(parsed.film).length) await voiceFilm(userId, filmId);
    return true;
  } catch (e) {
    fail(e, FAILED);
    return false;
  }
}

/** The lines the voice reads, in scene order, with their scene ids. */
export const voiceLines = (spec: Film): [string, string][] => spec.scenes.flatMap((s) => (spec.voice.lines[s.id] ? [[s.id, spec.voice.lines[s.id]] as [string, string]] : []));

/** The voice is on but the read on file says other lines (or there is none). */
export function voiceStale(f: StoredFilm): boolean {
  if (!f.spec?.voice.on) return false;
  const lines = voiceLines(f.spec);
  if (!lines.length) return false;
  return !f.voice || JSON.stringify(lines) !== JSON.stringify(f.voice.ids.map((id, i) => [id, f.voice!.texts[i]]));
}

const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** "AI voice reads it": every line in one read (one ai-voice use), kept on this device. */
export async function voiceFilm(userId: string, filmId: string): Promise<boolean> {
  const f = getFilm(userId, filmId);
  const lines = f?.spec ? voiceLines(f.spec) : [];
  if (!f || !lines.length || writing()) return false;
  job = { filmId, kind: "voice", startedAt: Date.now(), state: "working" };
  emit();
  try {
    const voiceId = loadRemixPrefs(userId).voice;
    const r = await callFn<{ audio: string; spans: ({ s: number; e: number } | null)[] }>("text-voice", { mode: "lines", lines: lines.map((l) => l[1]), voice: voiceId }, VOICE_FAILED);
    if (!r?.audio) throw new Error(VOICE_FAILED);
    const key = `film-voice-${filmId}-${Date.now().toString(36)}`;
    await putFile(key, new Blob([fromBase64(r.audio)], { type: "audio/mpeg" }));
    const voice: FilmVoice = { key, voiceId, ids: lines.map((l) => l[0]), texts: lines.map((l) => l[1]), spans: lines.map((_, i) => r.spans?.[i] ?? null), at: new Date().toISOString() };
    const next = change(userId, filmId, (x) => ({ ...x, voice }));
    if (!next) throw new Error(SIZE_LINE);
    job = null;
    emit();
    return true;
  } catch (e) {
    fail(e, VOICE_FAILED);
    return false;
  }
}

/** A Fields change, no model: parsed as the server would, the spec before it kept for Undo. Null, or the line saying why not. */
export function setSpec(userId: string, filmId: string, next: Film): string | null {
  const f = getFilm(userId, filmId);
  if (!f?.spec) return "That film isn't on this device.";
  const parsed = parseFilm(next, ctxOf(userId, f, next));
  if (parsed.ok === false) return parsed.problems[0] ?? UNUSABLE;
  if (JSON.stringify(parsed.film) === JSON.stringify(f.spec)) return null;
  pushHistory(filmId, f.spec);
  return change(userId, filmId, (x) => ({ ...x, spec: parsed.film })) ? null : SIZE_LINE;
}

// ---------- Point to change: notes, one at a time per film ----------

export type NoteDraft = Pick<FilmNote, "t" | "x" | "y" | "target" | "label" | "scene" | "at" | "text" | "pin" | "fix">;

/** A sent note: in the list at once (Changing..., or Waiting behind another), then to the writer. Its id, or null. */
export function sendNote(userId: string, filmId: string, n: NoteDraft, reopened?: string): string | null {
  const f = getFilm(userId, filmId);
  if (!f?.spec || n.text.trim().length < 2) return null;
  const id = reopened ?? `n${f.notes.reduce((m, x) => Math.max(m, Number(x.id.slice(1)) || 0), 0) + 1}`;
  const note: FilmNote = { thread: [], ...f.notes.find((x) => x.id === id), ...n, id, text: n.text.trim(), status: "waiting", reply: undefined, error: undefined, sentAt: new Date().toISOString() };
  const notes = reopened ? f.notes.map((x) => (x.id === id ? note : x)) : [...f.notes, note];
  if (!change(userId, filmId, (x) => ({ ...x, notes }))) return null;
  void runNotes(userId, filmId);
  return id;
}

/** Sends a failed note again, as it was. */
export function retryNote(userId: string, filmId: string, id: string): void {
  if (change(userId, filmId, (x) => ({ ...x, notes: x.notes.map((n) => (n.id === id ? { ...n, status: "waiting", error: undefined } : n)) }))) void runNotes(userId, filmId);
}

/** "Not quite": the note opens again with its earlier reply in the thread; the change it made stays (Undo takes it back). */
export function notQuite(userId: string, filmId: string, id: string): void {
  change(userId, filmId, (x) => ({
    ...x,
    notes: x.notes.map((n) => (n.id === id && n.status === "done" ? { ...n, status: "open", thread: [...n.thread, { note: n.text, reply: n.reply ?? "" }].slice(-6), text: "", reply: undefined } : n)),
  }));
}

export function dropNote(userId: string, filmId: string, id: string): void {
  change(userId, filmId, (x) => ({ ...x, notes: x.notes.filter((n) => n.id !== id || n.status === "changing") }));
}

/** "Fix it": the rhythm notes left after the server's retry, as one note on the whole film (one film-edit use). */
export function fixIssues(userId: string, filmId: string): string | null {
  const f = getFilm(userId, filmId);
  if (!f?.issues.length) return null;
  return sendNote(userId, filmId, { t: 0, x: 0.5, y: 0.5, target: "", label: "The whole film", scene: null, at: 0, text: `Fix these: ${f.issues.join(" ")}`, fix: true });
}

const setNote = (userId: string, filmId: string, id: string, patch: Partial<FilmNote>) =>
  change(userId, filmId, (x) => ({ ...x, notes: x.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));

async function runNotes(userId: string, filmId: string): Promise<void> {
  if (running.has(filmId)) return;
  running.add(filmId);
  emit();
  try {
    for (;;) {
      const f = getFilm(userId, filmId);
      const next = f?.notes.find((n) => n.status === "waiting");
      if (!f?.spec || !next) break;
      setNote(userId, filmId, next.id, { status: "changing" });
      try {
        const r = await callFn<{ film: Film; reply: string; issues: string[]; flags: FilmFlags }>(
          "video-assist",
          {
            mode: "film-edit", film: f.spec, scene: next.scene, target: next.target, label: next.label, t: next.t, x: next.x, y: next.y, note: next.text, thread: next.thread,
            ...(next.fix ? { fix: true } : {}),
            ...filmContext(userId, f.setup.screens),
          },
          EDIT_FAILED,
        );
        const parsed = parseFilm(r?.film, ctxOf(userId, f, r?.film));
        if (parsed.ok === false) throw new Error(EDIT_FAILED);
        const latest = getFilm(userId, filmId) ?? f;
        pushHistory(filmId, latest.spec);
        const saved = change(userId, filmId, (x) => ({
          ...x, spec: parsed.film, issues: r.issues ?? [], flags: r.flags ?? x.flags,
          notes: x.notes.map((n) => (n.id === next.id ? { ...n, status: "done" as const, reply: r.reply || "Changed.", made: specStamp(parsed.film), undone: undefined } : n)),
        }));
        if (!saved) throw new Error(SIZE_LINE);
      } catch (e) {
        setNote(userId, filmId, next.id, { status: "failed", error: lineOf(e, EDIT_FAILED) });
        // out of changes for today: the rest wait for a tap tomorrow rather than failing one by one
        if (e instanceof EdgeError && e.status === 429) break;
      }
    }
  } finally {
    running.delete(filmId);
    emit();
  }
}

/** After a reload: a note that was waiting or with the writer comes back open, its words kept, to be sent again. */
export function resumeFilm(userId: string, filmId: string): void {
  if (running.has(filmId)) return;
  const f = getFilm(userId, filmId);
  if (f?.notes.some((n) => n.status === "waiting" || n.status === "changing")) {
    change(userId, filmId, (x) => ({ ...x, notes: x.notes.map((n) => (n.status === "waiting" || n.status === "changing" ? { ...n, status: "open" } : n)) }));
  }
}

// ---------- pictures, the voice and the music, on this device ----------

const pictures = new Map<string, Promise<Picture | undefined>>();

/** A screen's picture: a photo as it is, a demo video's middle frame of its window; undefined when it isn't on this device. */
function picture(userId: string, key: string): Promise<Picture | undefined> {
  if (!pictures.has(key)) {
    pictures.set(
      key,
      (async () => {
        const blob = await getFile(key).catch(() => undefined);
        if (!blob) return undefined;
        if (key.startsWith("cimg-")) {
          const bmp = await createImageBitmap(blob);
          return { source: bmp, width: bmp.width, height: bmp.height };
        }
        const demo = demoVideos(userId).find((d) => d.key === key);
        const v = await loadVideo(blob);
        try {
          await seek(v, demo ? (demo.start + demo.end) / 2 : v.duration / 2);
          const c = document.createElement("canvas");
          c.width = v.videoWidth;
          c.height = v.videoHeight;
          c.getContext("2d")!.drawImage(v, 0, 0);
          return { source: c, width: c.width, height: c.height };
        } finally {
          URL.revokeObjectURL(v.src);
        }
      })().catch(() => undefined),
    );
  }
  return pictures.get(key)!;
}

const image = (src: string) =>
  new Promise<Picture | undefined>((done) => {
    const i = new Image();
    i.onload = () => done({ source: i, width: i.naturalWidth, height: i.naturalHeight });
    i.onerror = () => done(undefined);
    i.src = src;
  });

/** Everything drawFilm needs from the brand and Media, fonts loaded first so words measure as they draw. */
export async function loadFilmAssets(userId: string, keys: string[]): Promise<FilmAssets> {
  const kit = loadBrand(userId) ?? DEFAULT_BRAND;
  const [font, logo] = await Promise.all([ensureCaptionFonts().then(() => leoBrandFont()).catch(() => undefined), kit.logo ? image(kit.logo) : undefined]);
  const screens = Object.fromEntries(await Promise.all([...new Set(keys)].map(async (k) => [k, await picture(userId, k)] as const)));
  return {
    colors: { brand: kit.color, palette: Object.fromEntries((kit.palette ?? []).map((p) => [p.name, p.hex])) },
    name: kit.name?.trim() || brandName(userId),
    ...(logo ? { logo } : {}),
    ...(font ? { font } : {}),
    screens,
  };
}

/** The Media keys a film draws that aren't on this device. */
export async function missingScreens(userId: string, spec: Film): Promise<string[]> {
  const keys = [...new Set(keysIn(spec))];
  const got = await Promise.all(keys.map((k) => picture(userId, k)));
  return keys.filter((_, i) => !got[i]);
}

const reads = new Map<string, Promise<{ read: Float32Array[]; lufs: number } | null>>();
/** The read, decoded at 48 kHz, and its loudness; null when its file isn't on this device. */
export function loadRead(v: FilmVoice): Promise<{ read: Float32Array[]; lufs: number } | null> {
  if (!reads.has(v.key)) {
    reads.set(
      v.key,
      (async () => {
        const blob = await getFile(v.key);
        if (!blob) return null;
        const buf = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(await blob.arrayBuffer());
        const read = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
        return { read, lufs: loudness(read[0], read[1] ?? read[0]) };
      })().catch(() => null),
    );
  }
  return reads.get(v.key)!;
}

/** What the film's sound is made from: the spec, the voice's place (when it is on and read) and the brand's seed. */
export async function soundInputs(userId: string, f: StoredFilm): Promise<{ opts: SoundOptions; lines: PlacedLine[]; read: Float32Array[] | null }> {
  const brand = (loadBrand(userId)?.name ?? "").trim() || brandName(userId);
  const r = f.spec?.voice.on && f.voice ? await loadRead(f.voice) : null;
  const lines = r && f.spec ? placeVoice(f.spec, f.voice!) : [];
  return { opts: { brand, ...(lines.length ? { voice: voiceSpans(lines), voiceLufs: r!.lufs } : {}) }, lines, read: r?.read ?? null };
}

const sounds = new Map<string, FilmSound>();
const soundWaits = new Map<string, ((s: FilmSound | null) => void)[]>();
let worker: Worker | null = null;
const KEEP = 4;

function landed(key: string, s: FilmSound | null, error?: string) {
  if (s) {
    sounds.set(key, s);
    if (sounds.size > KEEP) sounds.delete(sounds.keys().next().value!);
  }
  if (soundJob?.key === key) soundJob = s ? null : { ...soundJob, state: "failed", error: error ?? "Couldn't make the music." };
  (soundWaits.get(key) ?? []).forEach((w) => w(s));
  soundWaits.delete(key);
  emit();
}

/** Starts the music for this spec unless it is ready or on its way; its key. */
export function ensureSound(spec: Film, opts: SoundOptions): string {
  const key = soundKey(spec, opts);
  if (sounds.has(key) || (soundJob?.key === key && soundJob.state === "working")) return key;
  soundJob = { key, startedAt: Date.now(), state: "working" };
  emit();
  if (typeof Worker === "undefined") {
    setTimeout(() => {
      try {
        landed(key, renderFilmSound(spec, opts));
      } catch (e) {
        landed(key, null, lineOf(e, ""));
      }
    });
    return key;
  }
  if (!worker) {
    worker = new Worker(new URL("./film/sound.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: string; key?: string; L?: Float32Array; R?: Float32Array; lufs?: number; peak?: number; style?: string; error?: string }>) => {
      const m = e.data;
      if (m.error || !m.L || !m.R) landed(m.id, null, m.error);
      else landed(m.id, { L: m.L, R: m.R, lufs: m.lufs ?? 0, peak: m.peak ?? 0, style: m.style ?? "" });
    };
  }
  worker.postMessage({ id: key, film: spec, opts });
  return key;
}
export const soundOf = (key: string): FilmSound | null => sounds.get(key) ?? null;
/** The music for this key once it lands; null when it failed. */
export function whenSound(key: string): Promise<FilmSound | null> {
  const s = sounds.get(key);
  if (s) return Promise.resolve(s);
  if (soundJob?.key !== key || soundJob.state !== "working") return Promise.resolve(null);
  return new Promise((r) => soundWaits.set(key, [...(soundWaits.get(key) ?? []), r]));
}

/** Music, effects and the voice, evened for export and for the player. */
export function filmMix(spec: Film, sound: Stereo, lines: PlacedLine[], read: Float32Array[] | null): Stereo {
  return mixFilm(sound, read && lines.length ? voiceTrack(lines, read, filmLength(spec)) : null);
}

// ---------- export and the hand-off ----------

/** Exports each shape in turn (All three runs them one after another), outside React; Stop ends it. */
export async function exportShapes(userId: string, filmId: string, shapes: Shape[]): Promise<void> {
  const f = getFilm(userId, filmId);
  if (!f?.spec || exp?.state === "working") return;
  const spec = f.spec;
  stopper = new AbortController();
  const signal = stopper.signal;
  exp = { filmId, shapes, files: [], current: shapes[0], progress: 0, state: "working", realtime: false, startedAt: Date.now() };
  emit();
  try {
    const [assets, inputs] = await Promise.all([loadFilmAssets(userId, keysIn(spec)), soundInputs(userId, f)]);
    const sound = await whenSound(ensureSound(spec, inputs.opts));
    if (!sound) throw new Error("Couldn't make the music. Try again.");
    const mix = filmMix(spec, sound, inputs.lines, inputs.read);
    for (const [i, shape] of shapes.entries()) {
      exp = { ...exp, current: shape };
      emit();
      const out = await exportFilm({ film: spec, assets, mix, captions: inputs.lines, shape }, (p) => {
        exp = exp && { ...exp, progress: (i + p) / shapes.length, realtime: exp.realtime };
        emit();
      }, signal);
      if (out === "stopped") {
        exp = { ...exp, state: "stopped", current: null };
        emit();
        return;
      }
      exp = { ...exp, files: [...exp.files, out], realtime: exp.realtime || out.realtime };
      change(userId, filmId, (x) => ({ ...x, exports: [...x.exports, { shape, at: new Date().toISOString() }].slice(-30) }));
    }
    exp = { ...exp, state: "done", current: null, progress: 1, ms: Date.now() - exp.startedAt };
    console.info(`Launch film exported: ${shapes.join(", ")} in ${exp.ms} ms${exp.realtime ? " (real time)" : ""}`);
  } catch (e) {
    console.warn("Launch film export failed", e);
    exp = exp && { ...exp, state: "failed", current: null, error: EXPORT_FAILED };
  } finally {
    stopper = null;
    emit();
  }
}
export function stopExport(): void {
  stopper?.abort();
}
export function clearExport(): void {
  if (exp?.state !== "working") {
    exp = null;
    emit();
  }
}

export const fileName = (f: StoredFilm, file: FilmFile) => `${f.name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "launch-film"}-${file.shape}.${file.ext}`;

/** The extra the editor gets: no captions to write (the film draws its own), the AI voice's mark when it reads it, the campaign post's draft. */
export function editorExtra(f: StoredFilm): JoinExtra {
  const ai: AiMark | undefined = f.spec?.voice.on && f.voice ? { kind: "explainer", voice: "premade", voiceId: f.voice.voiceId, madeAt: f.voice.at } : undefined;
  const c = f.setup.campaign;
  return {
    settings: { captions: false },
    toast: "Your launch film is ready",
    ...(f.setup.remember ? { caption: f.setup.remember } : {}),
    ...(ai ? { ai } : {}),
    ...(c ? { draftId: draftIdOf(c.id, c.n) } : {}),
  };
}

/** "Open in editor": the file to /edit through the join, and a campaign post marked made with it. */
export async function openInEditor(userId: string, filmId: string, file: FilmFile): Promise<void> {
  const f = getFilm(userId, filmId);
  if (!f) return;
  const extra = editorExtra(f);
  await handToEditor(new File([file.blob], fileName(f, file), { type: file.blob.type || "video/mp4" }), extra, f.name);
  const c = f.setup.campaign;
  if (c && extra.draftId) updatePost(userId, c.id, c.n, { state: "made", draftId: extra.draftId, made: { kind: "video", id: extra.draftId } });
}
