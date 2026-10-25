// A launch film to an MP4 in the browser (formats-launch-film): exportFast's loop without the edit plan. Frame i is
// drawn by drawFilm at i / 30 (no intro card, so no offset) at 1080x1920, 1080x1080 or 1920x1080, encoded to H.264
// at the Instagram target's 8 Mbps, the evened mix encoded to AAC 48 kHz stereo behind the encoder's lead-in, and
// both muxed with mp4-muxer into fileSink. Without WebCodecs it records in real time (captureStream and
// MediaRecorder, as startSlides does), clocked by the AudioContext playing the mix.
// The voice: text-voice reads every line in one go; each line's slice is laid at its own scene (placeVoice), the
// music already ducks under those spans (sound.ts), and the caption at t is the line being said.
import { Muxer } from "mp4-muxer";
import { FPS, encoderDelay, fileSink, pickEncoder } from "@/lib/fastExport";
import { EXPORT_TARGETS } from "@/lib/videoEdit";
import { pickMime } from "@/lib/videoMedia";
import { drawFilm, type FilmAssets } from "./draw.ts";
import { limit, loudness } from "./synth/sound.ts";
import { filmLength, sceneSpans, type Film, type Shape } from "./timeline.ts";

export const RATE = 48000;
export const SHAPE_SIZE: Record<Shape, { w: number; h: number }> = { "9x16": { w: 1080, h: 1920 }, "1x1": { w: 1080, h: 1080 }, "16x9": { w: 1920, h: 1080 } };
export const SHAPE_NAME: Record<Shape, string> = { "9x16": "Vertical 9:16", "1x1": "Square 1:1", "16x9": "Wide 16:9" };
/** Where social feeds even every video out; the true peak stays at or under videoEdit's PEAK_CEILING (-1 dB). */
export const MIX_LUFS = -14;
// half a dB under huashu's -1.5: AAC puts back about that much between samples (a -1.5 mix read back at -0.97 dBTP)
const LIMIT = 10 ** (-2 / 20);
/** A line starts this long after its scene's cut, and the next one waits this long after it ends. */
const LEAD = 0.15;
const GAP = 0.1;
/** Each slice fades in and out over 10 ms, so a cut between lines never clicks. */
const FADE = RATE * 0.01;

export interface Stereo {
  L: Float32Array;
  R: Float32Array;
}
/** One spoken line on the film's clock: its slice of the read (from, to) and where it starts (at). */
export interface PlacedLine {
  scene: string;
  text: string;
  from: number;
  to: number;
  at: number;
}

/** Each line at its own scene's start, never over the line before it; a line with no span or no scene is left out. */
export function placeVoice(film: Film, voice: { ids: string[]; texts: string[]; spans: ({ s: number; e: number } | null)[] }): PlacedLine[] {
  const starts = new Map(sceneSpans(film).map((s) => [s.scene.id, s.start]));
  const out: PlacedLine[] = [];
  let free = 0;
  voice.ids.forEach((id, i) => {
    const span = voice.spans[i];
    const start = starts.get(id);
    if (!span || start === undefined || !voice.texts[i] || span.e <= span.s) return;
    const at = Math.max(start + LEAD, free);
    out.push({ scene: id, text: voice.texts[i], from: span.s, to: span.e, at });
    free = at + span.e - span.s + GAP;
  });
  return out;
}

/** The line being said at t, drawn as the caption; undefined between lines. */
export const captionAt = (lines: PlacedLine[], t: number): string | undefined => lines.find((l) => t >= l.at && t < l.at + l.to - l.from)?.text;

/** When the voice speaks on the film's clock, for the music's duck. */
export const voiceSpans = (lines: PlacedLine[]) => lines.map((l) => ({ start: l.at, end: l.at + l.to - l.from }));

/** The read laid on the film's clock, `seconds` long: each line's slice at its place, mono read on both sides. */
export function voiceTrack(lines: PlacedLine[], read: Float32Array[], seconds: number): Stereo {
  const n = Math.max(1, Math.round(seconds * RATE));
  const L = new Float32Array(n), R = new Float32Array(n);
  const a = read[0], b = read[1] ?? read[0];
  for (const l of lines) {
    const from = Math.round(l.from * RATE), to = Math.min(a.length, Math.round(l.to * RATE));
    for (let i = from, j = Math.round(l.at * RATE); i < to && j < n; i++, j++) {
      const f = Math.min(1, (i - from) / FADE, (to - i) / FADE);
      L[j] += a[i] * f;
      R[j] += b[i] * f;
    }
  }
  return { L, R };
}

/**
 * Music and effects with the voice on top, evened to -14 LUFS with peaks held under -2 dB, so the encoded file's true
 * peak stays under -1 dB. Twice, since the limiter takes a little loudness back.
 */
export function mixFilm(sound: Stereo, voice: Stereo | null): Stereo & { lufs: number } {
  const n = sound.L.length;
  const t = { n, L: new Float32Array(n), R: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    t.L[i] = sound.L[i] + (voice?.L[i] ?? 0);
    t.R[i] = sound.R[i] + (voice?.R[i] ?? 0);
  }
  for (let pass = 0; pass < 2; pass++) {
    const l = loudness(t.L, t.R);
    if (!Number.isFinite(l)) break;
    const g = 10 ** ((MIX_LUFS - l) / 20);
    for (let i = 0; i < n; i++) {
      t.L[i] *= g;
      t.R[i] *= g;
    }
    limit(t, LIMIT);
  }
  return { L: t.L, R: t.R, lufs: loudness(t.L, t.R) };
}

export interface FilmExportArgs {
  film: Film;
  assets: FilmAssets;
  /** The evened mix (mixFilm), as long as the film. */
  mix: Stereo;
  captions: PlacedLine[];
  shape: Shape;
}
export interface FilmFile {
  shape: Shape;
  blob: Blob;
  ext: string;
  seconds: number;
  /** Recorded in real time, because this browser has no WebCodecs encoder. */
  realtime: boolean;
}

/** Whether this browser can encode faster than real time; without it the export records as the film plays. */
export const exportsFast = () =>
  typeof VideoEncoder !== "undefined" && typeof AudioEncoder !== "undefined" && typeof VideoFrame !== "undefined" && typeof AudioData !== "undefined";

/** The film as an MP4 (or what MediaRecorder records); "stopped" when the signal fired. Progress goes 0 to 1. */
export async function exportFilm(a: FilmExportArgs, onProgress: (share: number) => void, signal: AbortSignal): Promise<FilmFile | "stopped"> {
  const { w, h } = SHAPE_SIZE[a.shape];
  const seconds = filmLength(a.film);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  const draw = (t: number) => drawFilm(g, a.film, a.assets, t, { w, h, caption: captionAt(a.captions, t) });
  if (exportsFast()) {
    const fast = await encode(canvas, draw, a.mix, seconds, onProgress, signal);
    if (fast) return fast === "stopped" ? fast : { shape: a.shape, ...fast, seconds, realtime: false };
  }
  const rec = await record(canvas, draw, a.mix, seconds, onProgress, signal);
  return rec === "stopped" ? rec : { shape: a.shape, ...rec, seconds, realtime: true };
}

/** Frame by frame through WebCodecs; null when this browser has no H.264 or AAC encoder for it. */
async function encode(canvas: HTMLCanvasElement, draw: (t: number) => unknown, mix: Stereo, seconds: number, onProgress: (share: number) => void, signal: AbortSignal) {
  const W = canvas.width, H = canvas.height;
  const audioCfg: AudioEncoderConfig = { codec: "mp4a.40.2", sampleRate: RATE, numberOfChannels: 2, bitrate: 192_000 };
  if (!(await AudioEncoder.isConfigSupported(audioCfg).catch(() => null))?.supported) return null;
  const videoCfg = await pickEncoder(W, H, EXPORT_TARGETS.reels.mbps * 1_000_000);
  if (!videoCfg) return null;
  let venc: VideoEncoder | null = null;
  let aenc: AudioEncoder | null = null;
  let failed: unknown = null;
  try {
    const sink = fileSink();
    const muxer = new Muxer({
      target: sink.target,
      fastStart: false,
      firstTimestampBehavior: "offset",
      video: { codec: "avc", width: W, height: H, frameRate: FPS },
      audio: { codec: "aac", numberOfChannels: 2, sampleRate: RATE },
    });
    aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => (failed = e) });
    aenc.configure(audioCfg);
    // the encoder's own lead-in stands in for the mix's first `lead` samples, so the sound lands on its frames
    const lead = await encoderDelay(audioCfg);
    let sent = lead;
    const total = mix.L.length;
    const sendSound = (until: number) => {
      const end = Math.min(total, Math.ceil(until * RATE) + lead);
      while (sent < end) {
        const n = Math.min(4800, end - sent);
        const data = new Float32Array(n * 2);
        data.set(mix.L.subarray(sent, sent + n), 0);
        data.set(mix.R.subarray(sent, sent + n), n);
        const ad = new AudioData({ format: "f32-planar", sampleRate: RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(((sent - lead) / RATE) * 1e6), data });
        aenc!.encode(ad);
        ad.close();
        sent += n;
      }
    };
    venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => (failed = e) });
    venc.configure(videoCfg);
    const n = Math.round(seconds * FPS);
    let shown = -1;
    for (let i = 0; i < n; i++) {
      if (signal.aborted) return "stopped" as const;
      if (failed) throw failed;
      const at = i / FPS;
      draw(at);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(at * 1e6), duration: Math.round(1e6 / FPS) });
      venc.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
      frame.close();
      sendSound(at + 1 / FPS);
      // keep a few frames in hand, no more: drawing runs ahead of the encoder otherwise
      while (venc.encodeQueueSize > 2 && !failed) await new Promise((r) => venc!.addEventListener("dequeue", r, { once: true }));
      const pct = Math.floor(((i + 1) / n) * 100);
      if (pct !== shown) {
        shown = pct;
        onProgress(pct / 100);
      }
    }
    await venc.flush();
    sendSound(Infinity);
    await aenc.flush();
    if (failed) throw failed;
    muxer.finalize();
    return { blob: sink.blob("video/mp4"), ext: "mp4" };
  } catch (e) {
    if (signal.aborted) return "stopped" as const;
    console.warn("Film export failed, recording in real time instead", e);
    return null;
  } finally {
    for (const enc of [venc, aenc]) if (enc && enc.state !== "closed") enc.close();
  }
}

/** As the film plays: the canvas's stream and the mix through an AudioContext, recorded by MediaRecorder. */
async function record(canvas: HTMLCanvasElement, draw: (t: number) => unknown, mix: Stereo, seconds: number, onProgress: (share: number) => void, signal: AbortSignal) {
  const avc3 = "video/mp4;codecs=avc3.42E01E,mp4a.40.2";
  const { mime, ext } = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(avc3) ? { mime: avc3, ext: "mp4" } : pickMime();
  const actx = new AudioContext({ sampleRate: RATE });
  try {
    await actx.resume();
    const buf = actx.createBuffer(2, mix.L.length, RATE);
    buf.copyToChannel(mix.L as Float32Array<ArrayBuffer>, 0);
    buf.copyToChannel(mix.R as Float32Array<ArrayBuffer>, 1);
    const dest = actx.createMediaStreamDestination();
    const src = actx.createBufferSource();
    src.buffer = buf;
    src.connect(dest);
    const rec = new MediaRecorder(new MediaStream([...canvas.captureStream(FPS).getVideoTracks(), ...dest.stream.getAudioTracks()]), {
      mimeType: mime,
      videoBitsPerSecond: EXPORT_TARGETS.reels.mbps * 1_000_000,
      audioBitsPerSecond: 160_000,
    });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
    draw(0);
    rec.start(1000);
    const t0 = actx.currentTime;
    src.start();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const t = actx.currentTime - t0;
        if (t >= seconds || signal.aborted) return resolve();
        draw(t);
        onProgress(Math.min(0.99, t / seconds));
        window.setTimeout(tick, 1000 / FPS);
      };
      tick();
    });
    src.stop();
    rec.stop();
    await stopped;
    if (signal.aborted) return "stopped" as const;
    onProgress(1);
    return { blob: new Blob(chunks, { type: mime.split(";")[0] }), ext };
  } finally {
    void actx.close();
  }
}
