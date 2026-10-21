// Demo videos (brand-demo-videos, Leo only; docs/north-star/items/brand-demo-videos.md): a short clip of the brand's
// app, site or tool in use, kept in Media as a video with a `demo` window (3 to 30 seconds of the file) and a line of
// what it shows. Saving uses Media's store: the original bytes under a cvid- key, a still under the cimg- key of the
// same id, and an index entry of type "screen" (so the Media sort never queues it). The read (media-sort demo, one
// use) sends 3 stills from the window and gets back what it shows and any flags. Hook plus demo and green screen read
// demos through demoVideos and demoFile. The upload and the read run here, outside React, so leaving /brand keeps
// them going; their state lives in memory (a reload shows the saved demo without its progress line).

import { callFn, EdgeError } from "@/lib/edgeFn";
import { deleteFile, getFile, putFile } from "@/lib/deviceFiles";
import { clock } from "@/lib/hookDemo";
import { addMedia, cleanDemo, loadMedia, mediaRoom, removeMedia, updateMedia, type DemoFlag, type MediaDemo, type MediaItem } from "@/lib/mediaLibrary";
import { FULL_LINE, SPACE_LINE } from "@/lib/mediaUpload";

export const MAX_DEMOS = 10;
/** Fastlane's "Max 100MB"; Media's own dropzone keeps 50 MB for other videos. */
export const MAX_DEMO_BYTES = 100_000_000;
export const MIN_DEMO_SECONDS = 3;
export const MAX_DEMO_LENGTH = 180;
/** The part of a demo a format plays. */
export const DEMO_WINDOW = 30;
export const ACCEPT_DEMO = "video/mp4,video/quicktime,.mp4,.mov";

export const WRONG_TYPE = "Use an MP4 or MOV video.";
export const TOO_SHORT = "That clip is under 3 seconds. Use one that shows the screen in use.";
export const CANT_OPEN = "This browser can't open that video. Try an MP4 or MOV.";
export const DEMOS_FULL = `${MAX_DEMOS} is the most a brand can keep. Remove one to add another.`;
export const READ_FAILED = "Couldn't read what it shows. Add a line yourself.";
export const READ_USED_UP = "Saved. Reading it is used up for today; add a line yourself.";
export const tooBig = (bytes: number) => `That file is ${Math.ceil(bytes / 1_000_000)} MB. Demos can be up to 100 MB. Trim it or export it smaller, then try again.`;
export const tooLong = (seconds: number) => `That recording runs ${clock(seconds)}. Demos can be up to 3 minutes. Trim it first.`;

/** A saved demo as the formats read it: the window to play (file time), what it shows, its flags and the file's size. */
export interface DemoVideo {
  key: string;
  name: string;
  start: number;
  end: number;
  shows: string;
  flags: DemoFlag[];
  seconds: number;
  width: number;
  height: number;
}

/** The open brand's demos, newest first: any Media video with a demo window. */
export function demoVideos(uid: string | null | undefined): DemoVideo[] {
  return loadMedia(uid, { videos: true })
    .filter((m): m is MediaItem & { demo: MediaDemo } => !!m.demo)
    .map((m) => ({ key: m.key, name: m.name, start: m.demo.start, end: m.demo.end, shows: m.demo.shows, flags: m.demo.flags ?? [], seconds: m.seconds ?? 0, width: m.width, height: m.height }));
}

/** A demo's file on this device (undefined once it has left it). */
export const demoFile = (key: string): Promise<Blob | undefined> => getFile(key);

/** Why a picked file can't be a demo before it is opened: its type or its size. */
export function demoFileLine(f: { name: string; type: string; size: number }): string | null {
  const type = f.type.toLowerCase();
  const ok = type === "video/mp4" || type === "video/quicktime" || (!type && /\.(mp4|mov)$/i.test(f.name));
  if (!ok) return WRONG_TYPE;
  return f.size > MAX_DEMO_BYTES ? tooBig(f.size) : null;
}

/** Why a demo's length is refused: unreadable, under 3 seconds, or over 3 minutes as its clock reads. */
export function demoLengthLine(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return CANT_OPEN;
  if (seconds < MIN_DEMO_SECONDS) return TOO_SHORT;
  return Math.round(seconds) > MAX_DEMO_LENGTH ? tooLong(seconds) : null;
}

/** A new demo's window: from the start, the first 30 seconds (the whole file when shorter). */
export function firstWindow(seconds: number): { start: number; end: number } {
  const w = cleanDemo({ start: 0, end: DEMO_WINDOW }, seconds);
  return w ? { start: w.start, end: w.end } : { start: 0, end: seconds };
}

/** The read's 3 stills at 10%, 50% and 90% of the window, as fractions of the whole file (what stills() takes). */
export const stillPoints = (start: number, end: number, duration: number): number[] =>
  [0.1, 0.5, 0.9].map((f) => (start + f * (end - start)) / duration);

// ---- the jobs, outside React ----

export interface DemoState {
  /** The file being checked and saved: the row says "Saving <name>". */
  saving: string | null;
  /** The last upload's refusal line. */
  refused: string | null;
  /** Keys being read: their rows say "Reading what it shows". */
  reading: ReadonlySet<string>;
  /** A read that didn't come back: the row's line (failed or used up), with the field open. */
  notes: ReadonlyMap<string, string>;
  /** Uploads over 30 seconds whose window is being picked: read once it is saved. */
  picking: ReadonlySet<string>;
}

let state: DemoState = { saving: null, refused: null, reading: new Set(), notes: new Map(), picking: new Set() };
const listeners = new Set<() => void>();
const set = (patch: Partial<DemoState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const without = <T>(s: ReadonlySet<T>, k: T) => new Set([...s].filter((x) => x !== k));
const dropNote = (k: string) => new Map([...state.notes].filter(([x]) => x !== k));

/** For useSyncExternalStore: the same object until something changes. */
export const demoState = (): DemoState => state;
export function onDemos(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

// loaded on the first demo only, so /brand for everyone else never fetches the video code
let videoMedia: Promise<typeof import("@/lib/videoMedia")> | null = null;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * Checks and keeps a demo on this device: type and size, then its length, the 10 a brand keeps and Media's 300, all
 * before anything is stored. A demo of 30 seconds or less is read straight away; a longer one waits for its window
 * (`window: true`: the section opens it). Returns the key kept, or nothing when refused (the line is in demoState).
 */
export async function uploadDemo(uid: string, f: File): Promise<{ key: string; window: boolean } | null> {
  if (state.saving) return null;
  const refuse = (line: string) => (set({ saving: null, refused: line }), null);
  const early = demoFileLine(f) ?? (demoVideos(uid).length >= MAX_DEMOS ? DEMOS_FULL : mediaRoom(uid) <= 0 ? FULL_LINE : null);
  if (early) return refuse(early);
  set({ saving: f.name, refused: null });
  let meta: { seconds: number; width: number; height: number };
  let thumb: Blob;
  try {
    const { loadVideo, stills } = await (videoMedia ??= import("@/lib/videoMedia"));
    const v = await loadVideo(f);
    meta = { seconds: v.duration, width: v.videoWidth, height: v.videoHeight };
    URL.revokeObjectURL(v.src);
    const long = demoLengthLine(meta.seconds) ?? (meta.width && meta.height ? null : CANT_OPEN);
    if (long) return refuse(long);
    const w = firstWindow(meta.seconds);
    thumb = await (await fetch((await stills(f, [(w.start + w.end) / 2 / meta.seconds], 240))[0])).blob();
  } catch {
    return refuse(CANT_OPEN);
  }
  const id = newId();
  const key = `cvid-${id}`;
  try {
    await putFile(key, f);
    await putFile(`cimg-${id}`, thumb);
  } catch (e) {
    await Promise.all([key, `cimg-${id}`].map((k) => deleteFile(k).catch(() => undefined)));
    return refuse((e as Error)?.name === "QuotaExceededError" ? SPACE_LINE : CANT_OPEN);
  }
  const seconds = Math.round(meta.seconds * 100) / 100;
  addMedia(uid, {
    key, kind: "video", seconds, width: meta.width, height: meta.height, bytes: f.size,
    name: f.name.replace(/\.[^.]+$/, "").slice(0, 80), folder: "", alt: "", addedAt: new Date().toISOString(),
    type: "screen", typeBy: "you", demo: { ...firstWindow(seconds), shows: "" },
  });
  if (!loadMedia(uid, { videos: true }).some((m) => m.key === key)) {
    // the index wasn't written (Media filled up meanwhile, or this device's storage is full): take the files back off
    await Promise.all([key, `cimg-${id}`].map((k) => deleteFile(k).catch(() => undefined)));
    return refuse(mediaRoom(uid) ? SPACE_LINE : FULL_LINE);
  }
  set({ saving: null });
  if (seconds > DEMO_WINDOW + 0.5) {
    set({ picking: new Set([...state.picking, key]) });
    return { key, window: true };
  }
  void readDemo(uid, key);
  return { key, window: false };
}

// shortcut: a read writes to the brand open when it ends, so switching brands mid-read leaves that demo unread; key it by scoped id if it matters
/** One media-sort demo read of the window as saved now: what it shows (unless a line was typed meanwhile) and its flags. */
export async function readDemo(uid: string, key: string): Promise<void> {
  const d = demoVideos(uid).find((x) => x.key === key);
  if (!d || state.reading.has(key)) return;
  set({ reading: new Set([...state.reading, key]), notes: dropNote(key), picking: without(state.picking, key) });
  let note: string | null = null;
  try {
    const file = await getFile(key);
    if (!file || !d.seconds) throw new Error(READ_FAILED);
    const { stills } = await (videoMedia ??= import("@/lib/videoMedia"));
    const pics = await stills(file, stillPoints(d.start, d.end, d.seconds), 360);
    const got = await callFn<{ shows?: string; flags?: DemoFlag[] }>("media-sort", { mode: "demo", stills: pics, name: d.name });
    const now = demoVideos(uid).find((x) => x.key === key);
    if (now) {
      const shows = now.shows.trim() || (typeof got?.shows === "string" ? got.shows : "");
      updateMedia(uid, key, { demo: { start: now.start, end: now.end, shows, flags: Array.isArray(got?.flags) ? got.flags : [] } });
      if (!shows.trim()) note = READ_FAILED;
    }
  } catch (e) {
    // a 403 (not switched on) reads the same as a failed read
    note = e instanceof EdgeError && e.code === "daily_limit" ? READ_USED_UP : READ_FAILED;
  }
  set({ reading: without(state.reading, key), notes: note ? new Map([...state.notes, [key, note]]) : dropNote(key) });
}

/**
 * Saves a demo's window and line. An empty line asks for a read of the window (one media-sort use); so does an upload
 * whose window was being picked. Moving the window keeps the flags, so a warning never quietly goes.
 */
export function saveDemo(uid: string, key: string, edit: { start: number; end: number; shows: string }): void {
  const d = demoVideos(uid).find((x) => x.key === key);
  if (!d) return;
  const shows = edit.shows.replace(/\s+/g, " ").trim();
  updateMedia(uid, key, { demo: { start: edit.start, end: edit.end, shows, ...(d.flags.length ? { flags: d.flags } : {}) } });
  if (!shows || state.picking.has(key)) void readDemo(uid, key);
  else set({ notes: dropNote(key) });
}

/** The line a row's field types, kept as it is typed. */
export function setShows(uid: string, key: string, shows: string): void {
  const d = demoVideos(uid).find((x) => x.key === key);
  if (!d) return;
  updateMedia(uid, key, { demo: { start: d.start, end: d.end, shows: shows.slice(0, 120), ...(d.flags.length ? { flags: d.flags } : {}) } });
  set({});
}

/** Takes a demo off the brand (the file stays on this device, as Media's Remove does); returns the item for Undo. */
export function removeDemo(uid: string, key: string): MediaItem | null {
  const item = loadMedia(uid, { videos: true }).find((m) => m.key === key) ?? null;
  if (!item) return null;
  removeMedia(uid, key);
  set({ notes: dropNote(key), picking: without(state.picking, key) });
  return item;
}

/** Undo: the demo back on the brand, unless the brand filled up meanwhile. */
export function restoreDemo(uid: string, item: MediaItem): void {
  if (demoVideos(uid).length >= MAX_DEMOS) return;
  addMedia(uid, item);
  set({});
}

/** Clears the last upload's refusal line. */
export const clearRefused = () => state.refused && set({ refused: null });
