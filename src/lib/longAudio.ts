// The sound of a long recording, read a part at a time on this device. An MP4,
// MOV or M4A is opened with mp4box.js, which reads only the file's index (not
// the whole file), and the sound of one part is decoded with WebCodecs from just
// the bytes that hold it. Anything else, or a browser without WebCodecs, decodes
// the whole file at once (decodeAudioData), which only a recording of up to
// about 40 minutes survives. mp4box loads only when a long recording is opened.

import type { Movie } from "mp4box";

/** What Whisper is sent: 16 kHz mono. */
export const RATE = 16000;
/** Longest recording decoded whole: 40 minutes at 16 kHz in stereo is about 300 MB. */
const WHOLE_MAX_SECONDS = 40 * 60;
/** File bytes read at a time while decoding a part. */
const WINDOW_BYTES = 8 * 1024 * 1024;

export interface SoundReader {
  /** 16 kHz mono samples from `from` to `to` seconds. */
  read(from: number, to: number): Promise<Float32Array>;
}

/** How long a recording runs, from its header; NaN when this browser can't tell. */
export function mediaLength(file: Blob): Promise<number> {
  return new Promise((done) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    const end = (d: number) => {
      v.removeAttribute("src");
      v.load();
      URL.revokeObjectURL(url);
      done(d);
    };
    v.preload = "metadata";
    v.onloadedmetadata = () => end(Number.isFinite(v.duration) ? v.duration : NaN);
    v.onerror = () => end(NaN);
    v.src = url;
  });
}

/** An MP4 family file (MP4, MOV, M4A) starts with an ftyp, wide, free or mdat box. */
async function isMp4(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(4, 8).arrayBuffer());
  return ["ftyp", "wide", "free", "mdat", "moov", "skip"].includes(String.fromCharCode(...head));
}

/** A reader for the recording's sound, by the fastest way this browser and file allow. */
export async function openSound(file: Blob, duration: number): Promise<SoundReader> {
  const mp4 = await isMp4(file);
  const parts = mp4 && typeof AudioDecoder !== "undefined" ? await openMp4(file).catch((e) => (console.warn("longAudio: mp4", e), null)) : null;
  if (parts) return parts;
  if (duration > WHOLE_MAX_SECONDS) {
    throw new Error(mp4
      ? "This browser can't read a recording this long. Use Chrome or Edge on a computer."
      : "Captions for a recording over 40 minutes need an MP4, MOV or M4A file. Save it as M4A and upload that.");
  }
  return openWhole(file);
}

async function openWhole(file: Blob): Promise<SoundReader> {
  const buf = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(await file.arrayBuffer());
  const mono = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / buf.numberOfChannels;
  }
  return { read: async (from, to) => mono.slice(Math.max(0, Math.floor(from * RATE)), Math.ceil(to * RATE)) };
}

// AAC sampling rates by their index in an AudioSpecificConfig.
const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

async function openMp4(file: Blob): Promise<SoundReader | null> {
  const { createFile, MP4BoxBuffer } = await import("mp4box");
  const iso = createFile();
  let info: Movie | null = null;
  iso.onReady = (i) => { info = i; };
  // read box by box until the index (moov) is parsed; mp4box says where to read next, skipping the media data
  let pos = 0;
  while (!info && pos < file.size) {
    const ab = MP4BoxBuffer.fromArrayBuffer(await file.slice(pos, pos + WINDOW_BYTES).arrayBuffer(), pos);
    // mp4box logs QuickTime tags it has no name for (an iPhone's location tag) as console errors; the sound is unaffected
    const quiet = console.error;
    console.error = () => {};
    let next: number | undefined;
    try {
      next = iso.appendBuffer(ab);
    } finally {
      console.error = quiet;
    }
    pos = typeof next === "number" && next > pos ? next : pos + ab.byteLength;
  }
  const movie = info as Movie | null;
  const track = movie?.audioTracks[0];
  if (!movie || !track?.audio || movie.isFragmented) return null;
  const samples = iso.getTrackSamplesInfo(track.id);
  if (!samples.length) return null;
  const entry = iso.getTrackById(track.id).mdia.minf.stbl.stsd.entries[0] as unknown as { esds?: { esd?: { findDescriptor(tag: number): { findDescriptor(tag: number): { data?: Uint8Array } | null } | null } } };
  const rate = track.audio.sample_rate;
  const channels = track.audio.channel_count;
  let codec = track.codec;
  let description: Uint8Array | undefined = entry.esds?.esd?.findDescriptor(4)?.findDescriptor(5)?.data;
  if (codec.startsWith("mp4a") && !description) {
    // a QuickTime file can keep the AAC config where mp4box does not look: AAC-LC from the rate and channels
    const fi = AAC_RATES.indexOf(rate);
    if (fi < 0) return null;
    description = new Uint8Array([(2 << 3) | (fi >> 1), ((fi & 1) << 7) | (channels << 3)]);
    codec = "mp4a.40.2";
  }
  const config: AudioDecoderConfig = { codec, sampleRate: rate, numberOfChannels: channels, ...(description ? { description } : {}) };
  if (!(await AudioDecoder.isConfigSupported(config)).supported) return null;
  return { read: (from, to) => decodeRange(file, samples, config, from, to) };
}

type Sample = { offset: number; size: number; cts: number; duration: number; timescale: number };

/** One part's sound: the samples in [from, to) decoded, mixed to mono and resampled to 16 kHz. */
async function decodeRange(file: Blob, all: Sample[], config: AudioDecoderConfig, from: number, to: number): Promise<Float32Array> {
  const ts = all[0].timescale;
  // a quarter second before the part too, so the decoder has warmed up by its first sample
  const pick = all.filter((s) => s.cts / ts >= from - 0.25 && s.cts / ts < to);
  const rate = config.sampleRate;
  const out = new Float32Array(Math.max(1, Math.ceil((to - from) * rate)));
  let failure: Error | null = null;
  let tmp = new Float32Array(0);
  const decoder = new AudioDecoder({
    output: (d) => {
      const at = Math.round((d.timestamp / 1e6 - from) * rate);
      const n = d.numberOfFrames;
      if (tmp.length < n) tmp = new Float32Array(n);
      for (let c = 0; c < d.numberOfChannels; c++) {
        d.copyTo(tmp, { planeIndex: c, format: "f32-planar" });
        for (let i = 0; i < n; i++) {
          const j = at + i;
          if (j >= 0 && j < out.length) out[j] += tmp[i] / d.numberOfChannels;
        }
      }
      d.close();
    },
    error: (e) => { failure = e instanceof Error ? e : new Error(String(e)); },
  });
  try {
    decoder.configure(config);
    for (let i = 0; i < pick.length && !failure; ) {
      const start = pick[i].offset;
      let j = i;
      while (j + 1 < pick.length && pick[j + 1].offset >= start && pick[j + 1].offset + pick[j + 1].size - start <= WINDOW_BYTES) j++;
      const bytes = new Uint8Array(await file.slice(start, pick[j].offset + pick[j].size).arrayBuffer());
      for (let k = i; k <= j; k++) {
        const s = pick[k];
        decoder.decode(new EncodedAudioChunk({ type: "key", timestamp: Math.round((s.cts / ts) * 1e6), duration: Math.round((s.duration / ts) * 1e6), data: bytes.subarray(s.offset - start, s.offset - start + s.size) }));
      }
      // one window in memory at a time
      await decoder.flush();
      i = j + 1;
    }
  } finally {
    if (decoder.state !== "closed") decoder.close();
  }
  if (failure) throw new Error("Couldn't read the sound in that recording.");
  return resample(out, rate);
}

/** Mono samples at `rate` to 16 kHz, by the browser's own resampler. */
async function resample(pcm: Float32Array<ArrayBuffer>, rate: number): Promise<Float32Array> {
  if (rate === RATE) return pcm;
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil((pcm.length * RATE) / rate)), RATE);
  const buf = off.createBuffer(1, pcm.length, rate);
  buf.copyToChannel(pcm, 0);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}
