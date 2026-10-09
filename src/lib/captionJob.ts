// Captions for a long recording, as a job kept outside React (like the export in
// videoMedia.ts), so it keeps going while the adviser uses other pages. Each part
// (longCaptions.captionPlan) is read from the file on this device, sent to
// video-assist as a 16 kHz WAV (one use of "video-transcribe") and kept on this
// device as it lands, so a job that stops (a closed tab, no uses left today)
// carries on from the next part. The words go into the project when all are in.

import { applyFixes, type Word } from "@/lib/videoEdit";
import { captionPlan, stitchParts, type Part } from "@/lib/longCaptions";
import { RATE, openSound, type SoundReader } from "@/lib/longAudio";
import { deleteFile, encodeWav, getFile, putFile } from "@/lib/videoMedia";
import { loadFixes, loadProjects, saveProject, transcribe, type VideoProject } from "@/lib/videoProjects";

export interface CaptionJob {
  /** The project being captioned. */
  id: string;
  name: string;
  state: "running" | "done" | "failed";
  /** Parts captioned so far, of how many. */
  done: number;
  of: number;
  error?: string;
  /** The finished transcript, once done. */
  words?: Word[];
}

let job: CaptionJob | null = null;
/** The project whose job is starting (reading its kept parts), so a second press can't start another. */
let starting: string | null = null;
const listeners = new Set<(j: CaptionJob | null) => void>();
const emit = () => listeners.forEach((l) => l(job && { ...job }));
export const captionJob = () => job;
export function onCaptionJob(fn: (j: CaptionJob | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------- parts done so far, on this device (IndexedDB, never synced) ----------

const progressKey = (id: string) => `captions-${id}`;

/** The parts already captioned for a project, null each for one still to do. */
export async function partsDone(p: Pick<VideoProject, "id" | "duration">): Promise<(Word[] | null)[]> {
  const plan = captionPlan(p.duration);
  try {
    const b = await getFile(progressKey(p.id));
    const saved = b ? (JSON.parse(await b.text()) as { duration?: number; results?: unknown }) : null;
    if (saved?.duration === p.duration && Array.isArray(saved.results) && saved.results.length === plan.length) {
      return saved.results.map((r) => (Array.isArray(r) ? (r as Word[]) : null));
    }
  } catch {
    // nothing readable kept: start from the first part
  }
  return plan.map(() => null);
}

const keep = (p: Pick<VideoProject, "id" | "duration">, results: (Word[] | null)[]) =>
  putFile(progressKey(p.id), new Blob([JSON.stringify({ duration: p.duration, results })], { type: "application/json" })).catch(() => {});

/** One part's sound as the WAV Whisper takes. */
async function wavOf(reader: SoundReader, part: Part): Promise<Blob> {
  return encodeWav(await reader.read(part.from, part.to), RATE);
}

/**
 * Captions the parts still to do, two at a time (one is read while the other is
 * with Whisper), then puts the stitched words into the saved project. Stops at
 * the first part that fails (its message is the job's error); the parts done stay.
 */
export async function startCaptions(userId: string, project: VideoProject, file: Blob): Promise<void> {
  if (job?.state === "running") throw new Error(`Captions are still running for ${job.name}.`);
  if (starting !== null) throw new Error(`Captions are still running for ${starting}.`);
  starting = project.name;
  const plan = captionPlan(project.duration);
  const results = await partsDone(project).finally(() => (starting = null));
  const todo = plan.map((_, k) => k).filter((k) => !results[k]);
  const j: CaptionJob = { id: project.id, name: project.name, state: "running", done: plan.length - todo.length, of: plan.length };
  job = j;
  emit();
  let failed: Error | null = null;
  try {
    const reader = await openSound(file, project.duration);
    // one part read at a time: each holds a few hundred MB while it decodes
    let reading: Promise<unknown> = Promise.resolve();
    const read = (k: number) => {
      const run = reading.then(() => wavOf(reader, plan[k]));
      reading = run.catch(() => {});
      return run;
    };
    // the first part runs alone and the rest are held to the language heard in it: left to guess, Whisper captioned a Singlish stretch in Malay
    let lang: string | undefined;
    const worker = async (once = false) => {
      for (let k = todo.shift(); k !== undefined && !failed; k = todo.shift()) {
        try {
          const t = await transcribe(await read(k), lang);
          lang ??= t.lang || undefined;
          results[k] = t.words ?? [];
        } catch (e) {
          failed ??= e instanceof Error ? e : new Error(String(e));
          return;
        }
        j.done++;
        await keep(project, results);
        emit();
        if (once) return;
      }
    };
    if (todo.length) await worker(true);
    if (!failed && todo.length) await Promise.all([worker(), worker()]);
    if (failed) throw failed;
    const words = applyFixes(stitchParts(plan, results as Word[][]), loadFixes(userId)).words;
    const latest = loadProjects(userId).find((x) => x.id === project.id);
    if (latest) saveProject(userId, { ...latest, words });
    await deleteFile(progressKey(project.id)).catch(() => {});
    Object.assign(j, { state: "done", words });
  } catch (e) {
    Object.assign(j, { state: "failed", error: (e as Error).message });
  }
  emit();
}
