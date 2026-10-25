// Your own video or pictures (docs/north-star/items/formats-custom.md). The /edit "own" panel's picks, choices and
// written words live in memory here, so leaving the page keeps them; the "What is it about?" text is also kept in
// the device hint cs-own-about, so a reload keeps the typing. Pictures become a 1080x1920 video outside React:
// video-assist own-words writes the hook and a line per picture (with a voiceover, a spoken line each too), the
// voiceover is made, then startSlides puts it together and hands it to the editor with the words as stickers. A
// video goes through the editor's own upload; footageWords writes its words on screen once its captions show
// little or no speech. The run's steps show in /library through formatJob.

import { callFn } from "@/lib/edgeFn";
import { clearFormatJob, setFormatJob } from "@/lib/formatJob";
import { links } from "@/lib/links";
import { audioSeconds, speak, type VoiceId } from "@/lib/textVoice";
import { MAX_OVERLAYS, MUSIC_LEVEL, newOverlay, sceneSeconds, type EditSettings, type Overlay } from "@/lib/videoEdit";
import { currentJoin, encodeWav, putFile, startSlides, type JoinExtra } from "@/lib/videoMedia";
import { loadVoiceProfile } from "@/lib/voiceProfile";

// ---- /edit's start panels ----

export const START_PANELS = ["join", "ai"] as const;
// Words over a video, your own video or pictures and long video into clips are north-star work: Leo's sign-ins only
export const LEO_PANELS = [...START_PANELS, "wall", "own", "clips"] as const;
export type StartPanel = (typeof LEO_PANELS)[number];

/** The panels open once `k` opens: own and clips both read ?about=, so opening one closes the other. */
export function withPanel(open: string[], k: StartPanel): string[] {
  const other = k === "own" ? "clips" : k === "clips" ? "own" : null;
  return [...open.filter((x) => x !== k && x !== other), k];
}

// ---- rules ----

export const SLUG = "own-media";
const LABEL = "Your own video or pictures";
export const MAX_PICTURES = 10;
/** Pictures with no voiceover: this long each, and the video at least MIN_SECONDS. */
export const PICTURE_SECONDS = 3;
export const MIN_SECONDS = 6;
/** Footage gets a line per this many seconds, at most MAX_LINES. */
export const LINE_SECONDS = 5;
export const MAX_LINES = 12;
/** A transcript with fewer words than this has no speech to caption, so the footage gets words on screen. */
export const FEW_WORDS = 10;
/** video-assist transcribe's answer for a file with no sound track. */
export const NO_SOUND = "No sound found in that video.";
export const READY = "Your video is ready. Export it when it looks right.";
const WRITE_FAILED = "Couldn't write the words right now. Try again in a minute.";
const JOIN_LABEL = "Putting your video together";

export type OwnSound = "voice" | "music" | "keep";
export const SOUND_LABELS: Record<OwnSound, string> = { voice: "A voiceover", music: "Music only", keep: "Keep the sound" };

export interface OwnWords {
  hook: string;
  lines: string[];
  say?: string[];
}
export interface OwnPicture {
  file: File;
  /** An object URL for its thumbnail. */
  url: string;
}
export interface OwnState {
  about: string;
  pictures: OwnPicture[];
  video: { file: File; seconds: number; thumb: string | null } | null;
  sound: OwnSound;
  voice: VoiceId;
  music: File | null;
  words: boolean;
  /** The words written for these pictures, edited in the panel. */
  written: OwnWords | null;
  step: "" | "writing" | "voice" | "joining";
  error: string;
  /** What the last pick did with the files ("Up to 10 pictures..."). */
  note: string;
}

// ---- pure helpers ----

export type Drop = { kind: "join" } | { kind: "video"; file: File } | { kind: "pictures"; files: File[]; over: boolean } | null;

/** A drop: several videos go to Join takes, one video replaces the pictures, pictures add up to MAX_PICTURES. */
export function sortDrop(files: File[], have: number): Drop {
  const videos = files.filter((f) => f.type.startsWith("video/"));
  if (videos.length > 1) return { kind: "join" };
  if (videos.length === 1) return { kind: "video", file: videos[0] };
  const pics = files.filter((f) => f.type.startsWith("image/"));
  if (!pics.length) return null;
  const room = Math.max(0, MAX_PICTURES - have);
  return { kind: "pictures", files: pics.slice(0, room), over: pics.length > room };
}

/** Each picture's seconds: its share of the voiceover by its spoken words, else 3 s each and 6 s in all at least. */
export function pictureSeconds(n: number, voice?: { say: string[]; seconds: number }): number[] {
  if (voice) return sceneSeconds(voice.say, voice.seconds);
  const each = Math.max(PICTURE_SECONDS, MIN_SECONDS / Math.max(1, n));
  return Array.from({ length: n }, () => each);
}

/** One text sticker per line, over its own stretch of `seconds`. */
export function lineOverlays(lines: string[], seconds: number[]): Overlay[] {
  let at = 0;
  return lines.slice(0, MAX_OVERLAYS).map((text, i) => {
    const from = at;
    at += seconds[i] ?? 0;
    return { ...newOverlay("text", from + 0.1, "#FFFFFF"), text, to: Math.floor((at - 0.1) * 10) / 10 };
  });
}

/**
 * The editor's "People need about n s to read this" check for words over a video: the video's length to the nearest
 * second (a made 8 s clip runs 7.999 s, which floored to 7 and warned), or null when the words fit.
 */
export function readsLonger(readSeconds: number, total: number): number | null {
  const shown = Math.round(total);
  return readSeconds > shown ? shown : null;
}

/** Lines a stretch of footage gets: one per 5 s, 1 to 12. */
export const footageCount = (seconds: number) => Math.max(1, Math.min(MAX_LINES, Math.round(seconds / LINE_SECONDS)));

/**
 * What the pictures' video carries to the editor: the hook card and a sticker per picture when words are on, the
 * music, and captions only for a voiceover (music only or silence opens at once, as a montage does).
 */
export function pictureExtra(o: { written: OwnWords | null; words: boolean; seconds: number[]; voice: boolean; music?: EditSettings["music"] }): JoinExtra {
  const shown = o.words && o.written ? { hook: o.written.hook, overlays: lineOverlays(o.written.lines, o.seconds) } : {};
  return { settings: { ...shown, ...(o.voice ? {} : { captions: false }), ...(o.music ? { music: o.music } : {}) }, toast: READY };
}

/** The adviser's track kept on this device, as the editor's music setting (a montage's way). */
export async function keepMusic(file: File): Promise<NonNullable<EditSettings["music"]>> {
  const key = `mu-own-${Date.now().toString(36)}`;
  await putFile(key, file);
  return { key, name: file.name.replace(/\.[^.]+$/, "") || "Music", level: MUSIC_LEVEL };
}

/** The settings a video picked with Music only opens with: its own sound off, the track under it when one was added, nothing to caption. */
export const mutedWithMusic = (music?: EditSettings["music"]): Partial<EditSettings> => ({ volume: 0, captions: false, ...(music ? { music } : {}) });

// ---- the store ----

const ABOUT_KEY = "cs-own-about";
const readAbout = () => {
  try {
    return localStorage.getItem(ABOUT_KEY) ?? "";
  } catch {
    return "";
  }
};

let state: OwnState | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function ownState(): OwnState {
  state ??= { about: readAbout(), pictures: [], video: null, sound: "voice", voice: "alice", music: null, words: true, written: null, step: "", error: "", note: "" };
  return state;
}
export const ownBusy = () => !!ownState().step;
export function onOwn(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Changes the panel; a new about, or a voiceover switched on or off, means the words are written again. */
export function setOwn(patch: Partial<OwnState>): void {
  const s = ownState();
  const stale = ("about" in patch && patch.about !== s.about) || ("sound" in patch && (patch.sound === "voice") !== (s.sound === "voice"));
  state = { ...s, ...(stale ? { written: null } : {}), ...patch };
  if ("about" in patch) {
    try {
      localStorage.setItem(ABOUT_KEY, state.about);
    } catch {
      // kept in memory for this visit
    }
  }
  emit();
  mirror();
}

/** Adds pictures (their own lines are written afresh), or a video in place of them; the URLs of anything replaced are let go. */
export function pickFiles(d: Exclude<Drop, null | { kind: "join" }>, video?: { seconds: number; thumb: string | null }): void {
  const s = ownState();
  if (d.kind === "video" && video) {
    s.pictures.forEach((p) => URL.revokeObjectURL(p.url));
    return setOwn({ video: { file: d.file, ...video }, pictures: [], written: null, sound: s.sound === "voice" ? "keep" : s.sound });
  }
  if (d.kind !== "pictures") return;
  const added = d.files.map((file) => ({ file, url: URL.createObjectURL(file) }));
  setOwn({ pictures: [...s.pictures, ...added], video: null, written: null, sound: s.sound === "keep" ? "voice" : s.sound });
}

/** Moves a picture up or down with its own lines, or takes it out with them. */
export function movePicture(i: number, dir: -1 | 1 | 0): void {
  const s = ownState();
  const move = <T>(list: T[]) => {
    const next = [...list];
    if (dir === 0) next.splice(i, 1);
    else if (next[i + dir] !== undefined) [next[i], next[i + dir]] = [next[i + dir], next[i]];
    return next;
  };
  if (dir === 0 && s.pictures[i]) URL.revokeObjectURL(s.pictures[i].url);
  const w = s.written;
  setOwn({ pictures: move(s.pictures), written: w ? { ...w, lines: move(w.lines), ...(w.say ? { say: move(w.say) } : {}) } : null });
}

/** Back to an empty panel (the typed about stays). */
export function clearOwn(): void {
  ownState().pictures.forEach((p) => URL.revokeObjectURL(p.url));
  setOwn({ pictures: [], video: null, written: null, music: null, error: "", note: "", step: "" });
}

/** The run's step on /library's Making now (phase 3 decision 8); done is the editor's to show. */
function mirror(): void {
  const s = ownState();
  const href = links.edit({ panel: ["own"] });
  if (s.error) return setFormatJob({ slug: SLUG, label: LABEL, format: "video", state: "failed", error: s.error, href });
  if (!s.step) return clearFormatJob(SLUG);
  const step = s.step === "writing" ? "Writing the words" : s.step === "voice" ? "Making the voiceover" : JOIN_LABEL;
  setFormatJob({ slug: SLUG, label: LABEL, format: "video", state: "working", step, href });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const failure = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const voiceSummary = (userId: string) => loadVoiceProfile(userId)?.voiceSummary?.trim() || undefined;

// ---- the runs ----

/** The hook and a line per picture (and a spoken line each with a voiceover), for the panel to show and edit. */
export async function writeOwn(userId: string): Promise<void> {
  const s = ownState();
  if (ownBusy() || !s.pictures.length) return;
  setOwn({ step: "writing", error: "" });
  try {
    const w = await callFn<OwnWords>("video-assist", { mode: "own-words", about: s.about.trim(), count: s.pictures.length, kind: "pictures", voice: s.sound === "voice", voiceSummary: voiceSummary(userId) }, WRITE_FAILED);
    setOwn({ written: { hook: w.hook, lines: w.lines, ...(w.say ? { say: w.say } : {}) }, step: "" });
  } catch (e) {
    setOwn({ step: "", error: failure(e, WRITE_FAILED) });
  }
}

/** The pictures as one video: the voiceover (or a silent track), then put together on this device and handed to the editor. */
export async function makeOwn(): Promise<void> {
  const s = ownState();
  if (ownBusy() || !s.pictures.length) return;
  const voice = s.sound === "voice";
  const say = s.written?.say;
  if (voice && say?.length !== s.pictures.length) return setOwn({ error: "Write the words first." });
  setOwn({ step: voice ? "voice" : "joining", error: "" });
  try {
    let track: Blob;
    let seconds: number[];
    if (voice && say) {
      track = await speak(say.join(" "), s.voice);
      seconds = pictureSeconds(s.pictures.length, { say, seconds: await audioSeconds(track) });
    } else {
      seconds = pictureSeconds(s.pictures.length);
      const rate = 8000;
      track = encodeWav(new Float32Array(Math.ceil(rate * seconds.reduce((a, b) => a + b, 0))), rate);
    }
    const music = s.sound === "music" && s.music ? await keepMusic(s.music) : undefined;
    setOwn({ step: "joining" });
    // only a join still running waits: a video the editor hasn't picked up yet (a paid avatar) moves aside, never overwritten
    while (currentJoin()?.state === "running") await sleep(1000);
    const name = s.about.trim().slice(0, 40) || "Your pictures";
    await startSlides(name, s.pictures.map((p, i) => ({ image: p.file, seconds: seconds[i] })), track, JOIN_LABEL, {
      extra: pictureExtra({ written: s.written, words: s.words, seconds, voice, music }),
    });
    const joined = currentJoin();
    if (joined?.state === "failed") throw new Error(joined.error || "Couldn't put the video together. Try again.");
    clearOwn();
  } catch (e) {
    setOwn({ step: "", error: failure(e, "That didn't go through. Try again.") });
  }
}

/** Words on screen for footage with little or no speech: the hook card and a sticker per 5 s. Throws as callFn does. */
export async function footageWords(userId: string, about: string, seconds: number): Promise<{ hook: string; overlays: Overlay[] }> {
  const count = footageCount(seconds);
  const w = await callFn<OwnWords>("video-assist", { mode: "own-words", about: about.trim(), count, kind: "video", voice: false, voiceSummary: voiceSummary(userId) }, WRITE_FAILED);
  return { hook: w.hook, overlays: lineOverlays(w.lines, w.lines.map(() => seconds / count)) };
}
