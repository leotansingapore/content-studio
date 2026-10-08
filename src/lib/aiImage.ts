// "Make the image" on Write: the ai-image edge function asks Higgsfield for one
// picture from the post's image prompt; this polls until it is ready, keeps it
// in the media library (folder "AI images") and says how it went. The job lives
// outside React, so it carries on while the adviser moves to another page.

import { callFn } from "@/lib/edgeFn";
import { addMedia, storePicture } from "@/lib/mediaLibrary";
import type { JobState } from "../../supabase/functions/ai-image/logic.ts";

export interface ImageJob {
  prompt: string;
  state: "working" | "saving" | "done" | "failed";
  error?: string;
  /** The picture as kept in Media: its key and a data URL to show. */
  mediaKey?: string;
  preview?: string;
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

export async function makeImage(userId: string, prompt: string, name: string): Promise<void> {
  if (imageBusy()) return;
  set({ prompt, state: "working" });
  try {
    const { id } = await callFn<{ id: string }>("ai-image", { mode: "start", prompt }, "Couldn't make the image right now. Try again in a minute.");
    let url = "";
    for (const until = Date.now() + GIVE_UP_MS; !url && Date.now() < until; ) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      // a dropped status check is retried on the next round, not a failure
      const s = await callFn<JobState>("ai-image", { mode: "status", id }).catch((): JobState => ({ state: "working" }));
      if (s.state === "failed") throw new Error(s.error);
      if (s.state === "done") url = s.url;
    }
    if (!url) throw new Error("The image is taking too long. Try again in a few minutes.");
    set({ prompt, state: "saving" });
    const res = await fetch(url).catch(() => null);
    if (!res?.ok) throw new Error("The image was made but didn't download. Try again.");
    const pic = await storePicture(await res.blob());
    addMedia(userId, {
      key: pic.key, name: name.slice(0, 80) || "AI image", folder: AI_FOLDER, alt: prompt.slice(0, 250),
      width: pic.width, height: pic.height, addedAt: new Date().toISOString(),
    });
    set({ prompt, state: "done", mediaKey: pic.key, preview: pic.url });
  } catch (e) {
    set({ prompt, state: "failed", error: (e as Error).message || "Couldn't make the image. Try again." });
  }
}
