// "Watch it like a viewer" on a finished export: the file goes to video-assist mode "watch" and
// comes back as the moments a viewer would trip on. Kept outside React, like the export job, so
// it carries on while the person is on another page; one watch at a time.

import { watchVideo } from "@/lib/videoProjects";
import type { WatchFinding, WatchKind } from "../../supabase/functions/video-assist/watch.ts";

export type { WatchFinding };
export { MAX_WATCH_SECONDS } from "../../supabase/functions/video-assist/watch.ts";

export interface WatchJob {
  /** The export job it watched. */
  exportId: string;
  state: "running" | "done" | "failed";
  findings?: WatchFinding[];
  error?: string;
}

export const WATCH_LABELS: Record<WatchKind, string> = {
  slow_start: "Slow start",
  dead_air: "Nothing happens",
  hard_to_read: "Hard to read",
  covered: "Covered up",
  missing_visual: "Not shown",
  mismatch: "Doesn't match",
  jumpy: "Jumpy",
  sound: "Sound",
};

let job: WatchJob | null = null;
const listeners = new Set<(j: WatchJob | null) => void>();
const emit = () => listeners.forEach((fn) => fn(job));

export const watchJob = () => job;
export function onWatchJob(fn: (j: WatchJob | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function startWatch(exportId: string, url: string, seconds: number) {
  if (job?.state === "running") return;
  job = { exportId, state: "running" };
  emit();
  try {
    const file = await (await fetch(url)).blob();
    job = { exportId, state: "done", findings: await watchVideo(file, seconds) };
  } catch (e) {
    job = { exportId, state: "failed", error: (e as Error).message };
  }
  emit();
}
