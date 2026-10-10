// "Music for me" in the video editor: Jev picks a mood from what is said, then Eleven Music
// makes an instrumental track as long as the edit (text-voice modes "mood" and "music").
// The track is kept on this device like an uploaded one and takes the same music slot.
// The job lives outside React, so the paid track still lands on its video when the
// adviser opens another page while it is being made.

import { callFn } from "@/lib/edgeFn";
import { putFile } from "@/lib/deviceFiles";
import { audioSeconds } from "@/lib/textVoice";
import { loadProjects, saveProject } from "@/lib/videoProjects";
import { MUSIC_LEVEL, type Music } from "@/lib/videoEdit";
import { DEFAULT_MOOD, MOODS, MOOD_IDS, type Mood } from "../../supabase/functions/text-voice/logic.ts";

export { DEFAULT_MOOD, MAX_MUSIC_SECONDS, MOODS, MOOD_IDS, type Mood } from "../../supabase/functions/text-voice/logic.ts";

/** Jev's mood for what is said; calm when it can't be had. Never throws. */
export async function pickMood(text: string): Promise<Mood> {
  try {
    const r = await callFn<{ mood?: string }>("text-voice", { mode: "mood", text });
    return MOOD_IDS.find((m) => m === r?.mood) ?? DEFAULT_MOOD;
  } catch {
    return DEFAULT_MOOD;
  }
}

export interface MusicJob {
  projectId: string;
  mood: Mood;
  state: "working" | "failed";
  error?: string;
}

let job: MusicJob | null = null;
const listeners = new Set<(j: MusicJob | null) => void>();
const set = (j: MusicJob | null) => {
  job = j;
  listeners.forEach((l) => l(j));
};
export const musicJob = () => job;
export function onMusicJob(fn: (j: MusicJob | null) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}
/** Clears a failed job once its message has been shown. */
export const dismissMusicJob = () => void (job?.state === "failed" && set(null));

// the editor registers here while it is open on a video, so the track goes into its live edit (one Undo)
const appliers = new Map<string, (m: Music) => void>();
export function onMusicApply(projectId: string, fn: (m: Music) => void) {
  appliers.set(projectId, fn);
  return () => void (appliers.get(projectId) === fn && appliers.delete(projectId));
}

export async function startMusic(userId: string, projectId: string, mood: Mood, seconds: number): Promise<void> {
  if (job?.state === "working") throw new Error("A track is still being made. Wait for it to finish.");
  set({ projectId, mood, state: "working" });
  try {
    const got = await callFn<Blob>("text-voice", { mode: "music", mood, seconds }, "Couldn't make the music right now. Try again in a minute.");
    if (!(got instanceof Blob) || got.size < 1000) throw new Error("The track came back empty. Try again.");
    const mp3 = new Blob([got], { type: "audio/mpeg" });
    if ((await audioSeconds(mp3).catch(() => 0)) < 1) throw new Error("The track came back empty. Try again.");
    const key = `mu-${projectId}-${Date.now().toString(36)}`;
    await putFile(key, mp3);
    const music: Music = { key, name: `${MOODS[mood].label}, made for this video`, level: MUSIC_LEVEL };
    const apply = appliers.get(projectId);
    if (apply) apply(music);
    else {
      const p = loadProjects(userId).find((x) => x.id === projectId);
      if (p) saveProject(userId, { ...p, settings: { ...p.settings, music: { ...music, level: p.settings.music?.level ?? MUSIC_LEVEL } } });
    }
    set(null);
  } catch (e) {
    set({ projectId, mood, state: "failed", error: (e as Error).message });
  }
}
