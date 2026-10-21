// "Make the image" on Write: the ai-image edge function asks Higgsfield for one
// picture from the post's image prompt; this polls until it is ready, keeps it
// in the media library (folder "AI images") and says how it went. The job lives
// outside React, so it carries on while the adviser moves to another page.

import { callFn } from "@/lib/edgeFn";
import { addMedia, storePicture } from "@/lib/mediaLibrary";
import { leoUser } from "@/lib/useLeoOnly";
import { memoryLine } from "@/lib/voiceMemory";
import { MAX_PROMPT, type JobState } from "../../supabase/functions/ai-image/logic.ts";

export interface ImageJob {
  prompt: string;
  state: "working" | "saving" | "done" | "failed";
  error?: string;
  /** The picture as kept in Media: its key and a data URL to show. */
  mediaKey?: string;
  preview?: string;
  /** The finished job's signed token and Media name, so "Fix it" can edit this picture. */
  token?: string;
  name?: string;
  /** Set while a fix runs, and why the last fix failed (the picture before it stays). */
  fix?: string;
  fixError?: string;
}

export const AI_FOLDER = "AI images";
const POLL_MS = 2500;
const GIVE_UP_MS = 4 * 60_000;

let job: ImageJob | null = null;
const listeners = new Set<(j: ImageJob | null) => void>();
const set = (j: ImageJob) => {
  job = j;
  listeners.forEach((l) => l({ ...j }));
};
export const imageJob = () => job;
export function onImageJob(fn: (j: ImageJob | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const imageBusy = () => job?.state === "working" || job?.state === "saving";

/**
 * Leo's facts and learnings for pictures after the prompt (brand-voice-memory), only in the room ai-image's MAX_PROMPT
 * leaves: memoryLine drops the oldest learnings first. Anyone else's prompt goes as typed.
 */
async function withMemory(userId: string, prompt: string): Promise<string> {
  let memory = "";
  try {
    if (await leoUser()) memory = memoryLine(userId, "pictures", MAX_PROMPT - prompt.length - 2);
  } catch {
    // a session that can't be read is not Leo's
  }
  return memory ? `${prompt}\n\n${memory}` : prompt;
}

export const makeImage = async (userId: string, prompt: string, name: string): Promise<void> =>
  run(userId, prompt, name.slice(0, 80) || "AI image", { mode: "start", prompt: await withMemory(userId, prompt) });

/** "Fix it": Qwen Image 3 edits the finished picture; the fixed one is saved to Media beside the original. */
export function fixImage(userId: string, fix: string): Promise<void> {
  const j = job;
  if (!j?.token || j.state !== "done" || imageBusy()) return Promise.resolve();
  return run(userId, j.prompt, j.name ?? "AI image", { mode: "fix", token: j.token, fix }, j);
}

async function run(userId: string, prompt: string, name: string, body: Record<string, unknown>, before?: ImageJob): Promise<void> {
  if (imageBusy()) return;
  const fix = before ? String(body.fix) : undefined;
  set({ prompt, state: "working", fix });
  try {
    const { token } = await callFn<{ token: string }>("ai-image", body, "Couldn't make the image right now. Try again in a minute.");
    let url = "";
    for (const until = Date.now() + GIVE_UP_MS; !url && Date.now() < until; ) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      // a dropped status check is retried on the next round, not a failure
      const s = await callFn<JobState>("ai-image", { mode: "status", token }).catch((): JobState => ({ state: "working" }));
      if (s.state === "failed") throw new Error(s.error);
      if (s.state === "done") url = s.url;
    }
    if (!url) throw new Error("The image is taking too long. Try again in a few minutes.");
    set({ prompt, state: "saving", fix });
    const res = await fetch(url).catch(() => null);
    if (!res?.ok) throw new Error("The image was made but didn't download. Try again.");
    const pic = await storePicture(await res.blob());
    const saved = fix ? `${name} (fixed)`.slice(0, 80) : name;
    addMedia(userId, {
      key: pic.key, name: saved, folder: AI_FOLDER, alt: (fix ? `${prompt} Fixed: ${fix}` : prompt).slice(0, 250),
      width: pic.width, height: pic.height, addedAt: new Date().toISOString(),
    });
    set({ prompt, state: "done", mediaKey: pic.key, preview: pic.url, token, name });
  } catch (e) {
    const error = (e as Error).message || "Couldn't make the image. Try again.";
    // a failed fix keeps the picture the adviser already had
    set(before ? { ...before, fixError: error } : { prompt, state: "failed", error });
  }
}
