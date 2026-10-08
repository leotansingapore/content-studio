// Video projects: the edit (transcript + settings + a small cover) per profile,
// synced across devices like the rest of the studio; the video file itself stays
// on the device that uploaded it (videoMedia.ts, IndexedDB).
//   key: content-studio-videoprojects-${scoped(userId)}

import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import { scoped } from "@/lib/profiles";
import { deleteFile } from "@/lib/videoMedia";
import { sanitizeFixes, type CaptionFix, type Clip, type Cutaway, type EditSettings, type Sentence, type Word } from "@/lib/videoEdit";

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
  /** The IndexedDB key of the video file; clips cut from one upload share it. Defaults to id. */
  fileId?: string;
  /** A skill whose instructions run once the captions exist (the default skill, on upload). */
  pendingSkill?: string;
}

export const fileKey = (p: VideoProject) => p.fileId ?? p.id;

const KEY = "content-studio-videoprojects-";
const MAX_PROJECTS = 12;

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
  const kept = next.slice(0, MAX_PROJECTS);
  for (const old of next.slice(MAX_PROJECTS)) if (!kept.some((x) => fileKey(x) === fileKey(old))) void deleteFile(fileKey(old)).catch(() => {});
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

export async function findClips(sentences: Sentence[], duration: number): Promise<Clip[]> {
  const res = await call("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "clips", sentences, duration }) });
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
