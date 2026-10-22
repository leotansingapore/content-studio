// A voice note into the long piece's paste box (plan-interview, Leo only): recorded on the mic (micRecorder's
// startMic) or uploaded, decoded on the device to Whisper's 16 kHz mono WAV, and sent to video-assist transcribe
// (cap video-transcribe). The job lives here, outside React, so leaving /coach mid-note loses nothing; the
// recording and its WAV stay in memory only, until the transcript comes back.

import { EdgeError } from "@/lib/edgeFn";
import { mediaLength, openSound, RATE } from "@/lib/longAudio";
import { startMic, type MicTake } from "@/lib/micRecorder";
import { encodeWav } from "@/lib/videoMedia";
import { transcribe } from "@/lib/videoProjects";

export const MAX_NOTE_SECONDS = 720;
export const NOTE_ACCEPT = "audio/*,.m4a,.mp4,.opus,.ogg,.mp3,.wav";
export const NOTE_LINES = {
  tooLong: "Keep it under 12 minutes. Trim it, or record two shorter notes.",
  unreadable: "Couldn't read that file. Try an MP3, M4A, OGG or WAV.",
  noSpeech: "No speech found in that recording. Try again closer to the mic.",
  failed: "Couldn't turn your voice note into text. Try again in a minute.",
} as const;

/**
 * The note as the WAV Whisper is sent, and its length. A recording passes the seconds its own timer counted (Chrome's
 * WebM recordings carry no duration); an upload's length comes from its header, and one this browser can't tell is
 * decoded to 721 seconds at most and refused past 720. Throws one of NOTE_LINES.
 */
export async function voiceToWav(file: Blob, seconds?: number): Promise<{ wav: Blob; seconds: number }> {
  const length = seconds ?? (await mediaLength(file));
  if (length > MAX_NOTE_SECONDS) throw new Error(NOTE_LINES.tooLong);
  const upTo = Number.isFinite(length) ? length : MAX_NOTE_SECONDS + 1;
  let samples: Float32Array;
  try {
    samples = await (await openSound(file, upTo)).read(0, upTo);
  } catch {
    throw new Error(NOTE_LINES.unreadable);
  }
  if (samples.length > MAX_NOTE_SECONDS * RATE) throw new Error(NOTE_LINES.tooLong);
  if (samples.length < RATE / 2) throw new Error(NOTE_LINES.noSpeech);
  return { wav: encodeWav(samples, RATE), seconds: samples.length / RATE };
}

/** What a failed transcribe call shows, and whether Try again can resend the WAV still in memory. */
export function noteError(e: unknown): { line: string; retry: boolean } {
  const status = e instanceof EdgeError ? e.status : 0;
  if (status === 413) return { line: NOTE_LINES.tooLong, retry: false };
  if (status === 400) return { line: NOTE_LINES.noSpeech, retry: false };
  // the server's own words say when the daily limit resets
  if (status === 429) return { line: (e as Error).message || NOTE_LINES.failed, retry: false };
  return { line: NOTE_LINES.failed, retry: true };
}

// ---- The job --------------------------------------------------------------------------------------------------

export type VoiceJob =
  /** Waiting for the mic (the browser may be asking for it). */
  | { state: "starting"; userId: string }
  | { state: "recording"; userId: string; startedAt: number }
  | { state: "reading"; userId: string }
  | { state: "failed"; userId: string; error: string; retry: boolean }
  | { state: "done"; userId: string; text: string; seconds: number };

let job: VoiceJob | null = null;
let take: MicTake | null = null;
let stopTimer: ReturnType<typeof setTimeout> | undefined;
/** The WAV while it is being sent, so Try again needs no second decode. Dropped once the transcript is back. */
let kept: { wav: Blob; seconds: number } | null = null;
const subs = new Set<() => void>();

function set(next: VoiceJob | null) {
  job = next;
  subs.forEach((f) => f());
}

export const voiceJob = (): VoiceJob | null => job;

export function onVoiceJob(cb: () => void): () => void {
  subs.add(cb);
  return () => void subs.delete(cb);
}

const busy = () => job?.state === "starting" || job?.state === "recording" || job?.state === "reading";

/** Starts recording; a blocked or missing mic shows startMic's own line. Stops itself at 12:00. */
export async function recordNote(userId: string, mic: typeof startMic = startMic): Promise<void> {
  if (busy()) return;
  set({ state: "starting", userId });
  try {
    take = await mic();
  } catch (e) {
    set({ state: "failed", userId, error: e instanceof Error ? e.message : NOTE_LINES.failed, retry: false });
    return;
  }
  set({ state: "recording", userId, startedAt: Date.now() });
  stopTimer = setTimeout(() => void stopNote(), MAX_NOTE_SECONDS * 1000);
}

/** Stops the recording and turns it into text, with the seconds the timer counted. */
export async function stopNote(): Promise<void> {
  if (job?.state !== "recording" || !take) return;
  const { userId, startedAt } = job;
  clearTimeout(stopTimer);
  const t = take;
  take = null;
  const seconds = Math.min(MAX_NOTE_SECONDS, Math.ceil((Date.now() - startedAt) / 1000));
  set({ state: "reading", userId });
  await toText(userId, await t.stop(), seconds);
}

export async function uploadNote(userId: string, file: Blob): Promise<void> {
  if (busy()) return;
  set({ state: "reading", userId });
  await toText(userId, file);
}

async function toText(userId: string, file: Blob, seconds?: number): Promise<void> {
  try {
    kept = await voiceToWav(file, seconds);
  } catch (e) {
    set({ state: "failed", userId, error: e instanceof Error ? e.message : NOTE_LINES.unreadable, retry: false });
    return;
  }
  await send(userId);
}

async function send(userId: string): Promise<void> {
  const note = kept;
  if (!note) return;
  set({ state: "reading", userId });
  try {
    const text = (await transcribe(note.wav)).text.trim();
    kept = null;
    set(text ? { state: "done", userId, text, seconds: note.seconds } : { state: "failed", userId, error: NOTE_LINES.noSpeech, retry: false });
  } catch (e) {
    const { line, retry } = noteError(e);
    if (!retry) kept = null;
    set({ state: "failed", userId, error: line, retry });
  }
}

/** Try again: resends the WAV still in memory. */
export function retryNote(): void {
  if (job?.state === "failed" && job.retry && kept) void send(job.userId);
}

/** Clears a finished or failed note (the transcript has gone into the box, or the line was read). */
export function clearNote(): void {
  if (busy()) return;
  kept = null;
  set(null);
}
