// Video projects: the edit (transcript + settings + a small cover) per profile,
// synced across devices like the rest of the studio; the video file itself stays
// on the device that uploaded it (videoMedia.ts, IndexedDB).
//   key: content-studio-videoprojects-${scoped(userId)}

import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import { scoped } from "@/lib/profiles";
import { deleteFile, putFile, stills } from "@/lib/videoMedia";
import { mediaLength } from "@/lib/longAudio";
import { callFn } from "@/lib/edgeFn";
import { removePlatformCaptions } from "@/lib/platformCaptions";
import { sanitizeFixes, type CaptionFix, type Clip, type Cutaway, type EditSettings, type PublishIdea, type Sentence, type Word } from "@/lib/videoEdit";
import type { WatchFinding } from "../../supabase/functions/video-assist/watch.ts";
import type { RemixSource } from "@/lib/remixSource";

export interface VideoProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  duration: number;
  size: number;
  words: Word[];
  settings: EditSettings;
  thumb: string;
  /** The post caption written for this video (or clip). */
  caption?: string;
  /** Second-language caption lines, by language then by caption text. */
  subs?: Record<string, Record<string, string>>;
  /** Suggested callouts and cutaways, kept so a second look costs nothing. */
  cutaways?: Cutaway[];
  /** Post titles and a cover idea, kept so a second look costs nothing. */
  publish?: PublishIdea;
  /** The IndexedDB key of the video file; clips cut from one upload share it. Defaults to id. */
  fileId?: string;
  /** A skill whose instructions run once the captions exist (the default skill, on upload). */
  pendingSkill?: string;
  /** The post a format remixed (a wall of text); Save to My posts copies it to the draft. */
  source?: RemixSource;
}

export const fileKey = (p: VideoProject) => p.fileId ?? p.id;

const KEY = "content-studio-videoprojects-";
const MAX_PROJECTS = 12;
/** Clips cut from an upload are kept apart from the uploads: a 2-hour podcast gives up to 32, each small (its own words only). */
const MAX_CLIPS = 40;
// a swapped video (fileId `${id}-s<n>`, swapSource) is still the upload it was, not a clip
const isClip = (p: VideoProject) => !!p.fileId && p.fileId !== p.id && !p.fileId.startsWith(`${p.id}-s`);
/** How many times a project's video has been swapped (its file is `${id}-s<n>`), 0 for none. */
const swapNo = (p: VideoProject) => (p.fileId?.startsWith(`${p.id}-s`) ? Number(p.fileId.slice(p.id.length + 2)) || 0 : 0);
// a gone project's files that no kept project uses: a clip's shared file, or an upload's own file plus every video swapped in
// shortcut: a video swapped in and then undone (one past the current number) stays until the browser clears it
function dropFiles(gone: VideoProject, kept: VideoProject[]) {
  const keys = isClip(gone) ? [fileKey(gone)] : [gone.id, ...Array.from({ length: swapNo(gone) }, (_, i) => `${gone.id}-s${i + 1}`)];
  for (const k of keys) if (!kept.some((x) => fileKey(x) === k)) void deleteFile(k).catch(() => {});
}

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadProjects(userId: string | null | undefined): VideoProject[] {
  const s = store();
  if (!s || !userId) return [];
  try {
    const v = JSON.parse(s.getItem(KEY + scoped(userId)) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveProject(userId: string, p: VideoProject): VideoProject[] {
  const next = [{ ...p, updatedAt: new Date().toISOString() }, ...loadProjects(userId).filter((x) => x.id !== p.id)];
  let uploads = 0;
  let clips = 0;
  const kept = next.filter((x) => (isClip(x) ? ++clips <= MAX_CLIPS : ++uploads <= MAX_PROJECTS));
  // written first: if storage is full this throws and the old list, files and all, stays usable
  store()?.setItem(KEY + scoped(userId), JSON.stringify(kept));
  for (const old of next) {
    if (kept.includes(old)) continue;
    removePlatformCaptions(userId, old.id);
    dropFiles(old, kept);
  }
  return kept;
}

export function removeProject(userId: string, id: string): VideoProject[] {
  const all = loadProjects(userId);
  const gone = all.find((x) => x.id === id);
  const kept = all.filter((x) => x.id !== id);
  // a file shared by clips goes only with the last project using it
  if (gone) dropFiles(gone, kept);
  store()?.setItem(KEY + scoped(userId), JSON.stringify(kept));
  removePlatformCaptions(userId, id);
  return kept;
}

/**
 * The project on another file of `duration` seconds: words cleared (they were the old clip's), the look kept,
 * trims kept under the new length, stickers ended by it (a block that ran to the old end runs to the new one),
 * and what was measured from the old picture and sound dropped.
 */
export function swapped(p: VideoProject, f: { fileId: string; duration: number; size: number; thumb: string }): VideoProject {
  const d = f.duration;
  const s = p.settings;
  const trimStart = Math.min(s.trimStart, Math.max(0, d - 1));
  const trimEnd = Math.min(s.trimEnd, Math.max(0, d - trimStart - 1));
  const overlays = s.overlays?.map((o) => {
    const to = o.kind === "block" && o.to >= p.duration - 0.05 ? d : Math.min(o.to, d);
    return { ...o, to, from: Math.min(o.from, Math.max(0, to - 0.3)) };
  });
  return {
    ...p, ...f, words: [],
    settings: { ...s, trimStart, trimEnd, overlays, faceTrack: undefined, followFace: undefined, textBand: undefined, cropBottom: undefined, faceBox: undefined, level: undefined, motion: undefined, removed: undefined, keepCuts: undefined, coldOpen: undefined },
  };
}

/**
 * Puts another video under a project: the file is kept on this device as `${projectId}-s<n>` and the project
 * saved on it (swapped). The old file stays, so Undo can put it back. Throws when the video can't be opened.
 */
export async function swapSource(userId: string, projectId: string, file: File): Promise<VideoProject> {
  const p = loadProjects(userId).find((x) => x.id === projectId);
  if (!p) throw new Error("That video isn't on this device any more.");
  const duration = await mediaLength(file);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("That video couldn't be opened. Try an MP4 or MOV.");
  const thumb = (await stills(file, [0.3], 240))[0];
  const fileId = `${projectId}-s${swapNo(p) + 1}`;
  await putFile(fileId, file);
  const next = swapped(p, { fileId, duration, size: file.size, thumb });
  saveProject(userId, next);
  return next;
}

// The single saved video look from before skills (videoSkills.ts reads it once as "My look"):
//   key: content-studio-videolook-${scoped(userId)}
const LOOK_KEY = "content-studio-videolook-";

export function loadLook(userId: string | null | undefined): Record<string, unknown> | null {
  const s = store();
  if (!s || !userId) return null;
  try {
    const v = JSON.parse(s.getItem(LOOK_KEY + scoped(userId)) ?? "null");
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

// Words the captions always get wrong, fixed in every video, per profile:
//   key: content-studio-captionfixes-${scoped(userId)}
const FIXES_KEY = "content-studio-captionfixes-";

export function loadFixes(userId: string | null | undefined): CaptionFix[] {
  const s = store();
  if (!s || !userId) return [];
  try {
    return sanitizeFixes(JSON.parse(s.getItem(FIXES_KEY + scoped(userId)) ?? "[]"));
  } catch {
    return [];
  }
}

export function saveFixes(userId: string, fixes: CaptionFix[]): CaptionFix[] {
  const clean = sanitizeFixes(fixes);
  try {
    store()?.setItem(FIXES_KEY + scoped(userId), JSON.stringify(clean));
  } catch {
    // storage full: the fixes still apply to this video
  }
  return clean;
}

async function call(path: string, init: RequestInit): Promise<Response> {
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/video-assist${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `The editor answered ${res.status}. Try again.`);
  }
  return res;
}

export async function transcribe(wav: Blob, lang?: string): Promise<{ words: Word[]; text: string; duration: number; lang?: string }> {
  const res = await call(`?mode=transcribe${lang ? `&lang=${encodeURIComponent(lang)}` : ""}`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav });
  return res.json();
}

/** What a viewer would trip on in an exported file, with the seconds (Gemini watches it; about a minute). */
export async function watchVideo(file: Blob, seconds: number): Promise<WatchFinding[]> {
  const res = await call(`?mode=watch&seconds=${Math.round(seconds * 10) / 10}`, { method: "POST", headers: { "Content-Type": file.type || "video/mp4" }, body: file });
  return (await res.json()).findings;
}

export async function vibeEdit(req: {
  instruction: string;
  settings: EditSettings;
  transcript: string;
  duration: number;
  frames?: string[];
}): Promise<{ patch: Record<string, unknown>; reply: string }> {
  const res = await call("", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "vibe", ...req }),
  });
  return res.json();
}

/** Clips from what is said; with the word timings, each clip starts and ends cleanly; `about` is what the person asked for. */
export async function findClips(sentences: Sentence[], duration: number, words?: Word[], about?: string): Promise<Clip[]> {
  const res = await call("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "clips", sentences, duration, words, about: about?.trim() || undefined }) });
  return (await res.json()).clips;
}

export async function suggestCutaways(sentences: Sentence[], duration: number): Promise<Cutaway[]> {
  const res = await call("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "cutaways", sentences, duration }) });
  return (await res.json()).sections;
}

export async function translateCaptions(lang: string, lines: string[]): Promise<string[]> {
  const res = await call("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "translate", lang, lines }) });
  return (await res.json()).lines;
}

/** Three post titles and the cover text from what is said, and the cover moment (null when none was picked). */
export async function publishIdeas(sentences: Sentence[], duration: number): Promise<PublishIdea> {
  return callFn<PublishIdea>("video-assist", { mode: "publish", sentences, duration }, "Couldn't write titles right now. Try again in a minute.");
}
