// Video projects: the edit (transcript + settings + a small cover) per profile,
// synced across devices like the rest of the studio; the video file itself stays
// on the device that uploaded it (videoMedia.ts, IndexedDB).
//   key: content-studio-videoprojects-${scoped(userId)}

import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import { scoped } from "@/lib/profiles";
import { deleteFile } from "@/lib/videoMedia";
import { callFn } from "@/lib/edgeFn";
import { sanitizeFixes, type CaptionFix, type Clip, type Cutaway, type EditSettings, type PublishIdea, type Sentence, type Word } from "@/lib/videoEdit";

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
}

export const fileKey = (p: VideoProject) => p.fileId ?? p.id;

const KEY = "content-studio-videoprojects-";
const MAX_PROJECTS = 12;
/** Clips cut from an upload are kept apart from the uploads: a 2-hour podcast gives up to 32, each small (its own words only). */
const MAX_CLIPS = 40;
const isClip = (p: VideoProject) => !!p.fileId && p.fileId !== p.id;

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
  for (const old of next) if (!kept.includes(old) && !kept.some((x) => fileKey(x) === fileKey(old))) void deleteFile(fileKey(old)).catch(() => {});
  store()?.setItem(KEY + scoped(userId), JSON.stringify(kept));
  return kept;
}

export function removeProject(userId: string, id: string): VideoProject[] {
  const all = loadProjects(userId);
  const gone = all.find((x) => x.id === id);
  const kept = all.filter((x) => x.id !== id);
  // a file shared by clips goes only with the last project using it
  if (gone && !kept.some((x) => fileKey(x) === fileKey(gone))) void deleteFile(fileKey(gone)).catch(() => {});
  store()?.setItem(KEY + scoped(userId), JSON.stringify(kept));
  return kept;
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

export async function transcribe(wav: Blob): Promise<{ words: Word[]; text: string; duration: number }> {
  const res = await call("?mode=transcribe", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav });
  return res.json();
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
