// Export faster than real time: every output frame is drawn with drawFrame
// from frames decoded straight out of the file (WebCodecs VideoDecoder), the
// sound is the export's own audio graph rendered offline, and the two are
// encoded to H.264 and AAC and put in an MP4 (mp4-muxer). A sped-up edit's
// voice is sped up here with its pitch kept (timeStretch.ts), as the browser's
// player does in the real-time export. Loaded only when an export starts. exportFast gives null whenever this browser or this file
// can't take that route, and the export then records in real time as before.

import { Muxer, StreamTarget } from "mp4-muxer";
import { demuxAudio, demuxVideo, keyBefore, type VideoTrack } from "@/lib/mp4Demux";
import { END_CARD_SECONDS, PEAK_CEILING, aspectSize, brollAt, duckSpans, exportSize, levelFits, musicGainAt, srcAt, speedOf, truePeak, type EditSettings, type Segment, type Word } from "@/lib/videoEdit";
import { audioPeaks, decodeSound, drawEndCard, drawFrame, loadVideo, measureLevel, peakLimiter, planFor, wireVoice, type BrandArt, type Frame } from "@/lib/videoMedia";
import { dropGain, motionOf, playCue } from "@/lib/videoMotion";
import { piecesOf } from "@/lib/fastPauses";
import { denoiseBuffer } from "@/lib/denoise";
import { stretch } from "@/lib/timeStretch";

/** Frames a second and sound rate, as the real-time export records. */
export const FPS = 30;
const RATE = 48000;
/** The voice fades in and out over 25 ms at every cut, so joins don't click. */
const FADE = 0.025;

// ---------- the plan, worked out without a browser ----------

/** The filmed sound, cut by cut: where each kept part goes in the edit (at, before any speed-up), from where in the source, for how long. A pause played fast is silent, so it leaves a gap. */
export function voiceParts(segs: Segment[]): { at: number; from: number; dur: number }[] {
  let at = 0;
  const out: { at: number; from: number; dur: number }[] = [];
  for (const g of segs) {
    for (const [s, e, r] of piecesOf(g)) {
      if (r === 1) out.push({ at, from: s, dur: e - s });
      at += (e - s) / r;
    }
  }
  return out;
}

/** The parts as a sped-up export plays them: `speed` times sooner and shorter, the sound read from the sped-up piece (which starts at the part). */
export const spedParts = (parts: { at: number; from: number; dur: number }[], speed: number) => parts.map((p) => ({ at: p.at / speed, from: p.from, dur: p.dur / speed }));

/** The voice's volume over the export: up from 0 over FADE at the start of each part, back to 0 over FADE at its end. */
export function voiceRamps(parts: { at: number; dur: number }[], volume: number): ["set" | "ramp", number, number][] {
  const out: ["set" | "ramp", number, number][] = [];
  for (const p of parts) {
    const f = Math.min(FADE, p.dur / 2);
    out.push(["set", 0, p.at], ["ramp", volume, p.at + f], ["set", volume, p.at + p.dur - f], ["ramp", 0, p.at + p.dur]);
  }
  return out;
}

/** The music's level at each frame, as the real-time export sets it: under speech, out at the drop, faded at the end. */
export function musicLevels(spans: { s: number; e: number }[], level: number, end: number, drop: number | null): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0, n = Math.round(end * FPS); i < n; i++) {
    const t = i / FPS;
    out.push([t, musicGainAt(spans, t, level, end) * dropGain(drop, t)]);
  }
  return out;
}

// ---------- frames from the file ----------

type Picture = HTMLCanvasElement & { videoWidth: number; videoHeight: number };
/** drawFrame takes the picture as a video: it only reads its size and draws it, which a canvas with these two numbers does the same. */
const asVideo = (p: Picture) => p as unknown as HTMLVideoElement;

/** The window of file bytes read at once; frames are mostly in file order, so most come out of it. */
const WINDOW = 8 * 1024 * 1024;

/**
 * Decoded frames of one video file, asked for by time in step with the edit:
 * at(t) gives the picture the browser would show at t, upright and at the
 * size the browser plays it, on a canvas drawFrame can draw like a video.
 */
export class FrameReader {
  private dec: VideoDecoder | null = null;
  private next = 0;
  private ended = false;
  private queue: VideoFrame[] = [];
  private cur: VideoFrame | null = null;
  private drawn: number | null = null;
  private err: unknown = null;
  private wake: (() => void) | null = null;
  private win: { at: number; bytes: Uint8Array } | null = null;
  private g: CanvasRenderingContext2D;
  readonly pic: Picture;

  private constructor(private file: Blob, private track: VideoTrack, private config: VideoDecoderConfig, w: number, h: number) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    this.pic = Object.assign(c, { videoWidth: w, videoHeight: h });
    this.g = c.getContext("2d")!;
  }

  /** A reader for the file, played by the browser at w x h; null when it can't be decoded here. */
  static async open(file: Blob, w: number, h: number): Promise<FrameReader | null> {
    const track = await demuxVideo(file).catch(() => null);
    if (!track || !w || !h) return null;
    // the browser must turn it the same way: a portrait picture stays portrait
    const turned = track.rotation % 180 !== 0;
    const [tw, th] = turned ? [track.height, track.width] : [track.width, track.height];
    if (w !== h && tw !== th && w > h !== tw > th) return null;
    const config: VideoDecoderConfig = { codec: track.codec, description: track.description, codedWidth: track.width, codedHeight: track.height };
    const ok = await VideoDecoder.isConfigSupported(config).catch(() => null);
    return ok?.supported ? new FrameReader(file, track, config, w, h) : null;
  }

  private poke = () => {
    const w = this.wake;
    this.wake = null;
    w?.();
  };

  private start(from: number) {
    this.stopDecoder();
    this.cur?.close();
    this.cur = null;
    this.drawn = null;
    const dec = new VideoDecoder({
      output: (f) => {
        if (this.dec === dec) this.queue.push(f);
        else f.close();
        this.poke();
      },
      error: (e) => {
        this.err = e;
        this.poke();
      },
    });
    dec.addEventListener("dequeue", this.poke);
    dec.configure(this.config);
    this.dec = dec;
    this.next = from;
    this.ended = false;
  }

  private stopDecoder() {
    if (this.dec && this.dec.state !== "closed") this.dec.close();
    this.dec = null;
    for (const f of this.queue) f.close();
    this.queue = [];
  }

  private async bytes(off: number, size: number): Promise<Uint8Array> {
    const w = this.win;
    if (w && off >= w.at && off + size <= w.at + w.bytes.length) return w.bytes.subarray(off - w.at, off - w.at + size);
    const bytes = new Uint8Array(await this.file.slice(off, off + Math.max(size, WINDOW)).arrayBuffer());
    this.win = { at: off, bytes };
    return bytes.subarray(0, size);
  }

  async at(t: number): Promise<Picture> {
    const s = this.track.samples;
    const want = Math.round(t * 1e6) + 1;
    const k = keyBefore(s, t);
    // a step back, or a jump past a key frame not sent yet: start decoding again from that key frame
    if (!this.dec || (this.cur && this.cur.timestamp > want) || k > this.next) this.start(k);
    for (;;) {
      if (this.err) throw this.err;
      while (this.queue.length && this.queue[0].timestamp <= want) {
        this.cur?.close();
        this.cur = this.queue.shift()!;
      }
      // the next frame is already later than t, or nothing more is coming
      if (this.queue.length || (this.ended && this.dec!.decodeQueueSize === 0)) break;
      if (this.next < s.length && this.dec!.decodeQueueSize < 3) {
        const x = s[this.next++];
        const data = await this.bytes(x.off, x.size);
        this.dec!.decode(new EncodedVideoChunk({ type: x.key ? "key" : "delta", timestamp: Math.round(x.pts * 1e6), data }));
      } else if (this.next >= s.length && !this.ended) {
        await this.dec!.flush();
        this.ended = true;
      } else await new Promise<void>((r) => (this.wake = r));
    }
    // before the first frame the browser shows the first frame
    const f = this.cur ?? this.queue[0];
    if (f && f.timestamp !== this.drawn) {
      this.drawn = f.timestamp;
      const { width: W, height: H } = this.pic;
      const r = this.track.rotation;
      const g = this.g;
      g.save();
      if (r === 90) g.setTransform(0, 1, -1, 0, W, 0);
      else if (r === 180) g.setTransform(-1, 0, 0, -1, W, H);
      else if (r === 270) g.setTransform(0, -1, 1, 0, 0, H);
      g.drawImage(f, 0, 0, r % 180 ? H : W, r % 180 ? W : H);
      g.restore();
    }
    return this.pic;
  }

  close() {
    this.stopDecoder();
    this.cur?.close();
    this.cur = null;
  }
}

// ---------- sound ----------

interface FastArgs {
  file: Blob;
  words: Word[];
  settings: EditSettings;
  subs?: Record<string, string>;
  brand?: BrandArt | null;
  voice?: Blob | null;
  brollFiles?: Record<string, Blob>;
  music?: Blob | null;
  fx?: Frame["fx"];
}

type Part = ReturnType<typeof voiceParts>[number];
/** Some of the filmed sound, and where it starts in the source. */
type Piece = { buf: AudioBuffer; start: number };
/** The longest source whose whole sound is decoded at once (about 350 MB at 48 kHz stereo) when it can't be read in parts. */
const WHOLE_SECONDS = 15 * 60;

/** The sound under each kept part, decoded from the file's AAC packets for that part only. Null when it can't be read that way. */
export async function decodeParts(file: Blob, parts: Part[]): Promise<Piece[] | null> {
  if (typeof AudioDecoder === "undefined" || typeof EncodedAudioChunk === "undefined") return null;
  const track = await demuxAudio(file);
  if (!track) return null;
  const config: AudioDecoderConfig = { codec: track.codec, description: track.description, sampleRate: track.sampleRate, numberOfChannels: track.channels };
  if (!(await AudioDecoder.isConfigSupported(config).catch(() => null))?.supported) return null;
  const s = track.samples;
  const out: Piece[] = [];
  for (const p of parts) {
    // from two packets before the part: an AAC packet only comes out clean after the one before it
    let i = 0;
    while (i + 1 < s.length && s[i + 1].pts <= p.from) i++;
    i = Math.max(0, i - 2);
    let j = i;
    while (j < s.length && s[j].pts < p.from + p.dur + 0.05) j++;
    const got: AudioData[] = [];
    const dec = new AudioDecoder({ output: (d) => got.push(d), error: () => {} });
    try {
      dec.configure(config);
      // packets side by side in the file are read in one go
      for (let k = i; k < j; ) {
        let m = k + 1;
        while (m < j && s[m].off === s[m - 1].off + s[m - 1].size) m++;
        const bytes = new Uint8Array(await file.slice(s[k].off, s[m - 1].off + s[m - 1].size).arrayBuffer());
        for (let q = k; q < m; q++) {
          const at = s[q].off - s[k].off;
          dec.decode(new EncodedAudioChunk({ type: "key", timestamp: Math.round(s[q].pts * 1e6), data: bytes.subarray(at, at + s[q].size) }));
        }
        k = m;
      }
      await dec.flush();
      if (!got.length) return null;
      const rate = got[0].sampleRate;
      const t0 = got[0].timestamp / 1e6;
      const last = got[got.length - 1];
      const buf = new AudioBuffer({ length: Math.round((last.timestamp / 1e6 - t0) * rate) + last.numberOfFrames, sampleRate: rate, numberOfChannels: got[0].numberOfChannels });
      for (const d of got) {
        for (let c = 0; c < buf.numberOfChannels; c++) {
          const pcm = new Float32Array(d.numberOfFrames);
          d.copyTo(pcm, { planeIndex: c, format: "f32-planar" });
          buf.copyToChannel(pcm, c, Math.round((d.timestamp / 1e6 - t0) * rate));
        }
      }
      out.push({ buf, start: t0 });
    } finally {
      for (const d of got) d.close();
      if (dec.state !== "closed") dec.close();
    }
  }
  return out;
}

/**
 * The filmed sound for each part: read part by part (a clip of a long podcast never decodes the
 * whole episode), else the whole sound of a file up to WHOLE_SECONDS. Null when it has no sound;
 * "long" when a longer file's sound can't be read in parts.
 */
async function voicePieces(file: Blob, parts: Part[], duration: number): Promise<Piece[] | null | "long"> {
  const inParts = await decodeParts(file, parts).catch(() => null);
  if (inParts) return inParts;
  if (duration > WHOLE_SECONDS) return "long";
  const whole = await decodeSound(file);
  return whole && parts.map(() => ({ buf: whole, start: 0 }));
}

/** The pieces with background noise taken out (each distinct recording once); a piece it can't clean stays as filmed. */
async function denoisePieces(pieces: Piece[]): Promise<Piece[]> {
  const done = new Map<AudioBuffer, AudioBuffer>();
  const out: Piece[] = [];
  for (const p of pieces) {
    if (!done.has(p.buf)) done.set(p.buf, (await denoiseBuffer(p.buf)) ?? p.buf);
    out.push({ ...p, buf: done.get(p.buf)! });
  }
  return out;
}

/** Each part's filmed sound played `speed` times faster with its pitch kept, starting at the part. */
async function speedUp(parts: Part[], pieces: Piece[], speed: number): Promise<Piece[]> {
  const out: Piece[] = [];
  for (const [i, p] of parts.entries()) {
    const { buf, start } = pieces[i];
    const rate = buf.sampleRate;
    const from = Math.max(0, Math.round((p.from - start) * rate));
    const to = Math.min(buf.length, from + Math.round(p.dur * rate));
    const ch = stretch(Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c).subarray(from, to)), speed, rate);
    const sped = new AudioBuffer({ length: Math.max(1, ch[0].length), sampleRate: rate, numberOfChannels: ch.length });
    ch.forEach((d, c) => sped.copyToChannel(d, c));
    out.push({ buf: sped, start: p.from });
    // shortcut: the page waits about 5 ms per second of a part (3 s for one 10 min part); move stretch to a worker if long uncut parts get common
    await new Promise((r) => setTimeout(r));
  }
  return out;
}

/** The export's sound, rendered offline through the same nodes the real-time export plays it through (noise removal is done on the pieces first). */
async function renderMix(a: FastArgs, plan: ReturnType<typeof planFor>, seconds: number, sfx: boolean, parts: Part[], pieces: Piece[] | null): Promise<AudioBuffer> {
  const s = a.settings;
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(seconds * RATE)), RATE);
  const polish = !!s.voicePolish;
  const level = s.loudness && pieces ? (levelFits(s.level, polish) ? s.level : await measureLevel(a.file, polish, { parts, pieces })) : null;
  const mix = s.loudness ? peakLimiter(ctx, ctx.destination) : ctx.destination;
  if (pieces) {
    const bus = new GainNode(ctx);
    const env = new GainNode(ctx, { gain: 0 });
    wireVoice(ctx, bus, env, polish, level);
    env.connect(mix);
    const speed = speedOf(s);
    const heard = speed === 1 ? parts : spedParts(parts, speed);
    const sound = speed === 1 ? pieces : await speedUp(parts, pieces, speed);
    heard.forEach((p, i) => {
      const src = new AudioBufferSourceNode(ctx, { buffer: sound[i].buf });
      src.connect(bus);
      src.start(p.at, Math.max(0, p.from - sound[i].start), p.dur);
    });
    for (const [kind, v, t] of voiceRamps(heard, Math.min(1, Math.max(0, s.volume ?? 1)))) {
      if (kind === "set") env.gain.setValueAtTime(v, t);
      else env.gain.linearRampToValueAtTime(v, t);
    }
  }
  if (s.voiceover && a.voice) {
    const buf = await new OfflineAudioContext(2, 1, RATE).decodeAudioData(await a.voice.arrayBuffer());
    const g = new GainNode(ctx, { gain: s.voiceover.gain ?? 1 });
    g.connect(mix);
    const src = new AudioBufferSourceNode(ctx, { buffer: buf });
    src.connect(g);
    src.start(s.voiceover.start, 0, s.voiceover.length);
  }
  const motion = motionOf(s, plan.segs, plan.caps, plan.total);
  const muBuf = s.music && a.music ? await decodeSound(a.music) : null;
  if (s.music && muBuf) {
    const g = new GainNode(ctx, { gain: 0 });
    g.connect(mix);
    const src = new AudioBufferSourceNode(ctx, { buffer: muBuf, loop: true });
    src.connect(g);
    src.start(0);
    for (const [t, v] of musicLevels(duckSpans(a.words, plan.segs, s), s.music.level, seconds, motion.drop)) g.gain.setTargetAtTime(v, t, 0.03);
  }
  if (sfx) for (const c of motion.cues) if (c.at > 0 && c.at <= plan.total) playCue(ctx, mix, c.kind, c.at);
  const out = await ctx.startRendering();
  if (s.loudness) {
    // the limiter is no brick wall: what still pokes over the ceiling (music turned right up) comes off the whole mix,
    // as the voice's own trim does after its limiter
    const ch = Array.from({ length: out.numberOfChannels }, (_, c) => out.getChannelData(c));
    const k = 10 ** (Math.min(0, PEAK_CEILING - truePeak(ch)) / 20);
    if (k < 1) for (const d of ch) for (let i = 0; i < d.length; i++) d[i] *= k;
  }
  return out;
}

// ---------- encoding ----------

/**
 * Where the muxer writes the file: gathered into blobs as it goes (the browser can keep a big
 * one on disk), so a long export holds about its own size in memory, not three times it. The one
 * write back, the size at the head of the media, lands in the first piece.
 */
export function fileSink() {
  // the muxer hands over plain ArrayBuffer-backed arrays
  let first: Uint8Array<ArrayBuffer> | null = null;
  const blobs: Blob[] = [];
  let pending: Uint8Array<ArrayBuffer>[] = [];
  let held = 0;
  let end = 0;
  const target = new StreamTarget({
    onData: (bytes, at) => {
      const data = bytes as Uint8Array<ArrayBuffer>;
      if (at === end) {
        if (!first) first = data;
        else {
          pending.push(data);
          held += data.length;
        }
        end += data.length;
        if (held > 32 << 20) {
          blobs.push(new Blob(pending));
          pending = [];
          held = 0;
        }
      } else if (first && at + data.length <= first.length) first.set(data, at);
      else throw new Error(`The export file was written out of order at ${at}.`);
    },
  });
  return { target, blob: (type: string) => new Blob([first ?? new Uint8Array(), ...blobs, ...pending], { type }) };
}

/** The first sample at half the loudest one's level; -1 in silence. */
export function onsetOf(x: Float32Array): number {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  return peak ? x.findIndex((v) => Math.abs(v) >= peak / 2) : -1;
}

/**
 * Samples of silence this browser's AAC encoder puts ahead of the sound (2112 in Chrome on a Mac).
 * The MP4 has no edit list to skip them, so players would start the sound that far behind the
 * picture (44 ms). Found by encoding a 1 ms beep and decoding it back; 0 when it can't tell.
 */
async function encoderDelay(cfg: AudioEncoderConfig): Promise<number> {
  const n = 9600;
  const beep = new Float32Array(n);
  for (let i = 0; i < 48; i++) beep[4800 + i] = Math.sin((2 * Math.PI * i) / 16);
  const chunks: EncodedAudioChunk[] = [];
  const heard: Float32Array[] = [];
  let description: AllowSharedBufferSource | undefined;
  const enc = new AudioEncoder({ output: (c, m) => { chunks.push(c); description ??= m?.decoderConfig?.description; }, error: () => {} });
  const dec = new AudioDecoder({
    output: (d) => {
      const pcm = new Float32Array(d.numberOfFrames);
      d.copyTo(pcm, { planeIndex: 0, format: "f32-planar" });
      heard.push(pcm);
      d.close();
    },
    error: () => {},
  });
  try {
    enc.configure(cfg);
    const data = new Float32Array(n * cfg.numberOfChannels);
    for (let c = 0; c < cfg.numberOfChannels; c++) data.set(beep, c * n);
    const ad = new AudioData({ format: "f32-planar", sampleRate: cfg.sampleRate, numberOfFrames: n, numberOfChannels: cfg.numberOfChannels, timestamp: 0, data });
    enc.encode(ad);
    ad.close();
    await enc.flush();
    dec.configure({ codec: cfg.codec, sampleRate: cfg.sampleRate, numberOfChannels: cfg.numberOfChannels, description });
    for (const c of chunks) dec.decode(c);
    await dec.flush();
    const out = new Float32Array(heard.reduce((a, p) => a + p.length, 0));
    heard.reduce((at, p) => (out.set(p, at), at + p.length), 0);
    const d = onsetOf(out) - onsetOf(beep);
    return d > 0 && d < 4096 ? d : 0;
  } catch {
    return 0;
  } finally {
    for (const c of [enc, dec]) if (c.state !== "closed") c.close();
  }
}

/** An H.264 encoder setup this browser takes at this size: high, main, then baseline profile. */
async function pickEncoder(w: number, h: number, bitrate: number): Promise<VideoEncoderConfig | null> {
  // level 4.0 holds a 1080p frame; anything bigger needs 5.1
  const level = Math.ceil(w / 16) * Math.ceil(h / 16) <= 8192 ? "28" : "33";
  for (const profile of ["6400", "4d00", "42e0"]) {
    const config: VideoEncoderConfig = { codec: `avc1.${profile}${level}`, width: w, height: h, bitrate, framerate: FPS, latencyMode: "quality", avc: { format: "avc" } };
    const ok = await VideoEncoder.isConfigSupported(config).catch(() => null);
    if (ok?.supported) return config;
  }
  return null;
}

export interface FastExport {
  blob: Blob;
  ext: string;
  seconds: number;
  cap: number;
  label: string;
}

const webCodecs = () =>
  typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined" && typeof AudioEncoder !== "undefined" &&
  typeof VideoFrame !== "undefined" && typeof AudioData !== "undefined" && typeof OfflineAudioContext !== "undefined";

/**
 * The edit exported as fast as this device can draw and encode it. Null when
 * it can't be done this way here (the caller records in real time instead);
 * "stopped" when the signal fired.
 */
export async function exportFast(a: FastArgs, onProgress: (share: number) => void, signal: AbortSignal): Promise<FastExport | null | "stopped"> {
  const no = (why: string) => {
    console.info(`Export in real time: ${why}`);
    return null;
  };
  if (!webCodecs()) return no("no WebCodecs");
  const kind = a.settings.exportAs ?? "video";
  const readers: FrameReader[] = [];
  let video: HTMLVideoElement | null = null;
  let venc: VideoEncoder | null = null;
  let aenc: AudioEncoder | null = null;
  try {
    video = await loadVideo(a.file);
    const plan = planFor(a.words, video.duration, a.settings);
    if (plan.total < 0.5) return no("nothing left after the cuts");
    const seconds = plan.total + (a.settings.endCard && a.brand && kind !== "audio" ? END_CARD_SECONDS : 0);
    const size = exportSize(a.settings, seconds, video.videoWidth, video.videoHeight);
    const audioCfg: AudioEncoderConfig = { codec: "mp4a.40.2", sampleRate: RATE, numberOfChannels: 2, bitrate: size.audioBps };
    if (!(await AudioEncoder.isConfigSupported(audioCfg).catch(() => null))?.supported) return no("no AAC encoder");
    const [W, H] = size.w ? [size.w, size.h] : aspectSize(a.settings.aspect, video.videoWidth, video.videoHeight);
    let videoCfg: VideoEncoderConfig | null = null;
    let main: FrameReader | null = null;
    const broll = new Map<string, FrameReader>();
    if (kind !== "audio") {
      videoCfg = await pickEncoder(W, H, size.videoBps);
      if (!videoCfg) return no("no H.264 encoder");
      if (video.videoWidth) {
        main = await FrameReader.open(a.file, video.videoWidth, video.videoHeight);
        if (!main) return no("the video can't be decoded here");
        readers.push(main);
      }
      for (const b of a.settings.broll ?? []) {
        const blob = a.brollFiles?.[b.key];
        if (!blob) continue;
        const el = await loadVideo(blob);
        URL.revokeObjectURL(el.src);
        const r = await FrameReader.open(blob, el.videoWidth, el.videoHeight);
        if (!r) return no("a B-roll clip can't be decoded here");
        readers.push(r);
        broll.set(b.id, r);
      }
    }
    if (signal.aborted) return "stopped";

    const parts = voiceParts(plan.segs);
    const decoded = await voicePieces(a.file, parts, video.duration);
    const pieces = decoded && decoded !== "long" && a.settings.denoise ? await denoisePieces(decoded) : decoded;
    if (pieces === "long") return no("the sound of a long video can't be read in parts here");
    const mix = await renderMix(a, plan, seconds, kind !== "audio", parts, pieces);
    if (signal.aborted) return "stopped";
    onProgress(0.05);

    let failed: unknown = null;
    const sink = fileSink();
    const muxer = new Muxer({
      target: sink.target,
      fastStart: false,
      firstTimestampBehavior: "offset",
      ...(videoCfg ? { video: { codec: "avc" as const, width: W, height: H, frameRate: FPS } } : {}),
      audio: { codec: "aac", numberOfChannels: 2, sampleRate: RATE },
    });
    aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: (e) => (failed = e) });
    aenc.configure(audioCfg);
    const left = mix.getChannelData(0);
    const right = mix.getChannelData(1);
    // the encoder's own lead-in stands in for the mix's first `lead` samples, so the sound lands on its frames
    const lead = await encoderDelay(audioCfg);
    let sent = lead;
    // the sound goes in alongside the picture, so the file's chunks interleave
    const sendSound = (until: number) => {
      const end = Math.min(mix.length, Math.ceil(until * RATE) + lead);
      while (sent < end) {
        const n = Math.min(4800, end - sent);
        const data = new Float32Array(n * 2);
        data.set(left.subarray(sent, sent + n), 0);
        data.set(right.subarray(sent, sent + n), n);
        const ad = new AudioData({ format: "f32-planar", sampleRate: RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(((sent - lead) / RATE) * 1e6), data });
        aenc!.encode(ad);
        ad.close();
        sent += n;
      }
    };

    if (videoCfg) {
      venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => (failed = e) });
      venc.configure(videoCfg);
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const g = canvas.getContext("2d")!;
      const peaks = video.videoWidth ? null : await audioPeaks(a.file);
      const n = Math.round(seconds * FPS);
      let shown = -1;
      for (let i = 0; i < n; i++) {
        if (signal.aborted) return "stopped";
        if (failed) throw failed;
        const out = i / FPS;
        if (out < plan.total) {
          const src = srcAt(plan.segs, out, speedOf(a.settings));
          const pic = main ? asVideo(await main.at(src)) : video;
          const on = brollAt(a.settings.broll, out);
          const cut = on && broll.get(on.b.id);
          drawFrame(g, { video: pic, settings: a.settings, ...plan, src, out, subs: a.subs, brand: a.brand, broll: cut ? asVideo(await cut.at(on.t)) : null, fx: a.fx, peaks });
        } else drawEndCard(g, a.brand!, out - plan.total);
        const frame = new VideoFrame(canvas, { timestamp: Math.round(out * 1e6), duration: Math.round(1e6 / FPS) });
        venc.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
        frame.close();
        sendSound(out + 1 / FPS);
        // keep a few frames in hand, no more: drawing runs ahead of the encoder otherwise
        while (venc.encodeQueueSize > 2 && !failed) await new Promise((r) => venc!.addEventListener("dequeue", r, { once: true }));
        const pct = Math.floor(((i + 1) / n) * 95);
        if (pct !== shown) {
          shown = pct;
          onProgress(0.05 + pct / 100);
        }
      }
      await venc.flush();
    }
    sendSound(Infinity);
    await aenc.flush();
    if (failed) throw failed;
    muxer.finalize();
    const audio = kind === "audio";
    return { blob: sink.blob(audio ? "audio/mp4" : "video/mp4"), ext: audio ? "m4a" : "mp4", seconds, cap: size.capBytes, label: size.label };
  } catch (e) {
    if (signal.aborted) return "stopped";
    console.warn("Fast export failed, recording in real time instead", e);
    return null;
  } finally {
    for (const r of readers) r.close();
    for (const enc of [venc, aenc]) if (enc && enc.state !== "closed") enc.close();
    if (video) URL.revokeObjectURL(video.src);
  }
}
