// Video projects: the edit (transcript + settings + a small cover) per profile,
// synced across devices like the rest of the studio; the video file itself stays
// on the device that uploaded it (videoMedia.ts, IndexedDB).
//   key: content-studio-videoprojects-${scoped(userId)}

import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";
import { scoped } from "@/lib/profiles";
import { deleteFile } from "@/lib/videoMedia";
import type { EditSettings, Word } from "@/lib/videoEdit";

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
}

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
  for (const old of next.slice(MAX_PROJECTS)) void deleteFile(old.id).catch(() => {});
  const kept = next.slice(0, MAX_PROJECTS);
  store()?.setItem(KEY + scoped(userId), JSON.stringify(kept));
  return kept;
}

export function removeProject(userId: string, id: string): VideoProject[] {
  void deleteFile(id).catch(() => {});
  const kept = loadProjects(userId).filter((x) => x.id !== id);
  store()?.setItem(KEY + scoped(userId), JSON.stringify(kept));
  return kept;
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
