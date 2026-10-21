// Your own voice in You speaking (people-my-voice step 1, Leo only): the mic recorded into one Blob, which goes
// through sliceVoiceover like a made voiceover. The editor's "Record from the mic" (VideoEditPage startVoice) keeps its
// own recorder; this one uses its settings and mime list.

export const MIC_BLOCKED = "Your microphone is blocked. Allow it in the address bar, then try again.";
export const NO_MIC = "No microphone found. Upload audio instead.";
export const SILENT = "We couldn't hear anything. Record it again.";
const MIMES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"];

export interface MicTake {
  /** Stops the take and hands back the recording; the mic is released. */
  stop(): Promise<Blob>;
}

/** Starts recording the mic. A refused or missing mic rejects with the line to show; nothing else changes. */
export async function startMic(media: Pick<MediaDevices, "getUserMedia"> | undefined = globalThis.navigator?.mediaDevices): Promise<MicTake> {
  if (!media?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error(NO_MIC);
  let stream: MediaStream;
  try {
    stream = await media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    const name = (e as { name?: string })?.name;
    throw new Error(name === "NotFoundError" || name === "OverconstrainedError" ? NO_MIC : MIC_BLOCKED);
  }
  const release = () => stream.getTracks().forEach((t) => t.stop());
  const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  } catch {
    release();
    throw new Error(NO_MIC);
  }
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => void (e.data.size && chunks.push(e.data));
  const done = new Promise<Blob>((resolve) => {
    rec.onstop = () => {
      release();
      resolve(new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" }));
    };
  });
  rec.start(500);
  return {
    stop: () => {
      if (rec.state !== "inactive") rec.stop();
      return done;
    },
  };
}

/** True when no 20 ms frame is louder than RMS 0.01: a muted mic, or nothing said. */
export function isSilent(pcm: Float32Array, rate: number): boolean {
  const n = Math.max(1, Math.round(0.02 * rate));
  for (let f = 0; f < pcm.length; f += n) {
    const end = Math.min(pcm.length, f + n);
    let e = 0;
    for (let i = f; i < end; i++) e += pcm[i] * pcm[i];
    if (Math.sqrt(e / (end - f)) > 0.01) return false;
  }
  return true;
}

/** "0:07" on the Stop button. */
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
