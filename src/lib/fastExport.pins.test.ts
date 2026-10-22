// The fast export for a project without the intro card, pinned on today's code (main 738c7bf3, before brand-kit's intro
// card was drawn): every frame drawn (what, at which source and edit time), every frame's timestamp, where the sound
// goes and the file's length. WebCodecs, the muxer and the drawing are faked in node; the plan, cuts, captions and
// timings are the real ones. introCard unset, false, or on for a sign-in that isn't Leo's all give today's file.
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { BrandArt } from "./videoMedia";

const h = vi.hoisted(() => {
  const log: string[] = [];
  const fmt = (t: number) => t.toFixed(4);
  class Buf {
    length: number;
    sampleRate: number;
    numberOfChannels: number;
    data: Float32Array[];
    constructor(o: { length: number; sampleRate: number; numberOfChannels: number }) {
      this.length = o.length;
      this.sampleRate = o.sampleRate;
      this.numberOfChannels = o.numberOfChannels;
      this.data = Array.from({ length: o.numberOfChannels }, () => new Float32Array(o.length));
    }
    get duration() {
      return this.length / this.sampleRate;
    }
    getChannelData(c: number) {
      return this.data[c];
    }
    copyToChannel(src: Float32Array, c: number, at = 0) {
      this.data[c].set(src, at);
    }
  }
  // each sample says where it sat in the rendered mix: 1, 2, 3... on the left, -1, -2, -3... on the right
  const numbered = (length: number, rate: number) => {
    const b = new Buf({ length, sampleRate: rate, numberOfChannels: 2 });
    for (let i = 0; i < length; i++) {
      b.data[0][i] = i + 1;
      b.data[1][i] = -(i + 1);
    }
    return b;
  };
  return { log, fmt, Buf, numbered };
});

vi.mock("@/lib/videoMedia", async (orig) => {
  const real = await orig<typeof import("./videoMedia")>();
  return {
    ...real,
    loadVideo: async () => ({ duration: 12, videoWidth: 1080, videoHeight: 1920, src: "blob:main" }),
    audioPeaks: async () => [],
    decodeSound: async () => h.numbered(12 * 48000, 48000),
    measureLevel: async () => null,
    wireVoice: (_c: unknown, input: { connect: (n: unknown) => unknown }, output: unknown) => {
      input.connect(output);
      return () => {};
    },
    peakLimiter: (_c: unknown, out: unknown) => out,
    drawFrame: (_g: unknown, f: { src: number; out: number }) => h.log.push(`frame src=${h.fmt(f.src)} out=${h.fmt(f.out)}`),
    drawEndCard: (_g: unknown, _a: unknown, t: number) => h.log.push(`end ${h.fmt(t)}`),
    drawIntroCard: (_g: unknown, _a: unknown, t: number) => h.log.push(`intro ${h.fmt(t)}`),
  };
});
vi.mock("@/lib/mp4Demux", () => ({ demuxVideo: async () => null, demuxAudio: async () => null, keyBefore: () => 0 }));
vi.mock("mp4-muxer", () => ({
  Muxer: class {
    constructor(o: { video?: unknown; audio: unknown }) {
      h.log.push(`mux video=${JSON.stringify(o.video)} audio=${JSON.stringify(o.audio)}`);
    }
    addVideoChunk() {}
    addAudioChunk() {}
    finalize() {}
  },
  StreamTarget: class {
    constructor(public options: unknown) {}
  },
}));

const { FrameReader, exportFast } = await import("./fastExport");
const { defaultSettings } = await import("./videoEdit");

class Node {
  connect<T>(n: T) {
    return n;
  }
  disconnect() {}
}
const param = (name: string, value: number) => ({
  value,
  setValueAtTime: (v: number, t: number) => h.log.push(`${name} set ${v} @${h.fmt(t)}`),
  linearRampToValueAtTime: (v: number, t: number) => h.log.push(`${name} ramp ${v} @${h.fmt(t)}`),
  setTargetAtTime: (v: number, t: number) => h.log.push(`${name} target ${h.fmt(v)} @${h.fmt(t)}`),
});
let gains = 0;
class GainNode extends Node {
  gain: ReturnType<typeof param>;
  constructor(_ctx: unknown, o?: { gain?: number }) {
    super();
    this.gain = param(`gain${gains++}`, o?.gain ?? 1);
  }
}
class AudioBufferSourceNode extends Node {
  constructor(_ctx: unknown, private o: { buffer: { length: number }; loop?: boolean }) {
    super();
  }
  start(at = 0, off = 0, dur?: number) {
    h.log.push(`play ${this.o.buffer.length} samples${this.o.loop ? " looped" : ""} at ${h.fmt(at)} from ${h.fmt(off)}${dur === undefined ? "" : ` for ${h.fmt(dur)}`}`);
  }
}
class OfflineAudioContext {
  destination = new Node();
  constructor(private ch: number, private length: number, private rate: number) {
    if (length > 1) h.log.push(`mix ${ch}x${length}@${rate}`);
  }
  async startRendering() {
    return h.numbered(this.length, this.rate);
  }
}
class AudioData {
  timestamp = 0;
  numberOfFrames = 0;
  data = new Float32Array();
  constructor(o: object) {
    Object.assign(this, o);
  }
  close() {}
}
class AudioEncoder {
  static isConfigSupported = async () => ({ supported: true });
  state = "unconfigured";
  constructor(private init: { output: (c: unknown, m?: unknown) => void }) {}
  configure() {
    this.state = "configured";
  }
  encode(a: AudioData) {
    const n = a.numberOfFrames;
    h.log.push(`aac ${a.timestamp} n=${n} L ${a.data[0]}..${a.data[n - 1]} R ${a.data[n]}..${a.data[2 * n - 1]}`);
    this.init.output({ timestamp: a.timestamp }, {});
  }
  async flush() {}
  close() {
    this.state = "closed";
  }
}
// no decoder: the AAC lead-in reads as 0, and the sound is read whole (decodeSound)
class AudioDecoder {
  state = "unconfigured";
  configure() {
    throw new Error("no AAC decoder here");
  }
  close() {
    this.state = "closed";
  }
}
class VideoEncoder {
  static isConfigSupported = async () => ({ supported: true });
  encodeQueueSize = 0;
  state = "unconfigured";
  constructor(private init: { output: (c: unknown, m?: unknown) => void }) {}
  configure(c: { codec: string; width: number; height: number; bitrate: number }) {
    this.state = "configured";
    h.log.push(`h264 ${c.codec} ${c.width}x${c.height} ${c.bitrate}`);
  }
  encode(f: VideoFrame, o: { keyFrame: boolean }) {
    h.log.push(`video ${f.timestamp}+${f.duration}${o.keyFrame ? " key" : ""}`);
    this.init.output({ timestamp: f.timestamp }, {});
  }
  async flush() {}
  close() {
    this.state = "closed";
  }
  addEventListener() {}
}
class VideoDecoder {}
class VideoFrame {
  timestamp: number;
  duration: number;
  constructor(_c: unknown, o: { timestamp: number; duration: number }) {
    this.timestamp = o.timestamp;
    this.duration = o.duration;
  }
  close() {}
}

beforeAll(() => {
  for (const [k, v] of Object.entries({ GainNode, AudioBufferSourceNode, OfflineAudioContext, AudioBuffer: h.Buf, AudioData, AudioEncoder, AudioDecoder, VideoEncoder, VideoDecoder, VideoFrame }))
    vi.stubGlobal(k, v);
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => ({}) }) });
  vi.spyOn(FrameReader, "open").mockImplementation(async () => ({ at: async () => ({}), close() {} }) as never);
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Said from 0 s with no gap, so a source second is an edit second until the first cut: "five six" is captioned from
// 2.0 s. Then a long pause (cut down), a filler (cut) and another pause.
const W = (w: string, s: number, e: number) => ({ w, s, e });
const words = [
  W("One", 0, 0.5), W("two", 0.5, 1), W("three", 1, 1.5), W("four", 1.5, 2), W("five", 2, 2.5), W("six", 2.5, 3),
  W("seven", 5, 5.5), W("um", 5.5, 5.8), W("eight.", 5.8, 6.4), W("nine", 8, 8.6), W("ten.", 8.6, 9.2),
];
const brand: BrandArt = { name: "Leo Tan", handle: "@leo", role: "Adviser", color: "#123456", line: "DM me" };
const settings = { ...defaultSettings("bold"), wordsPerCaption: 2, endCard: true, music: { key: "mu", name: "Song", level: 0.3 } };

/** One fast export, as the log of everything it drew, encoded and placed. */
async function run(s: typeof settings, art: BrandArt | null = brand): Promise<string[]> {
  h.log.length = 0;
  gains = 0;
  const made = await exportFast({ file: new Blob(["mp4"]), words, settings: s, brand: art, music: new Blob(["mp3"]) }, () => {}, new AbortController().signal);
  if (!made || made === "stopped") throw new Error(`no export: ${made}`);
  h.log.push(`done ${made.seconds} s ${made.ext} ${made.label} cap ${made.cap}`);
  return [...h.log];
}
const sha = (log: string[]) => createHash("sha256").update(log.join("\n")).digest("hex");

const TODAY = "ce3f8aa8428bb1b297238b69aea52ffa93dff6bcfd63b5cd6009bbe0106be4a0";
const TODAY_SOUND = "8f9cfebff42adc427cc1f44e64509780f8d24fed5e584afc82dd23e7cfbb198c";

describe("the fast export without the intro card (pinned)", () => {
  it("draws, times and places every frame and sample as today", async () => {
    const log = await run(settings);
    const frames = log.filter((l) => /^(frame|end|intro) /.test(l));
    // 6.17 s left after the cuts and the 2.5 s end card, at 30 a second
    expect(frames).toHaveLength(260);
    expect(frames[0]).toBe("frame src=0.0000 out=0.0000");
    expect(frames.filter((l) => l.startsWith("end "))).toHaveLength(74);
    expect(log.at(-1)).toBe("done 8.669999999999998 s mp4 Instagram cap 0");
    expect(log.some((l) => l.startsWith("intro "))).toBe(false);
    expect(sha(log)).toBe(TODAY);
  });

  it("gives the same file with introCard off, and with it on for a sign-in that isn't Leo's", async () => {
    const today = await run(settings);
    expect(await run({ ...settings, introCard: false })).toEqual(today);
    expect(await run({ ...settings, introCard: true })).toEqual(today);
    // Leo's brand art with the switch off
    expect(await run(settings, { ...brand, intro: true } as BrandArt)).toEqual(today);
  });

  it("exports sound only as today, the intro card never in it", async () => {
    const sound = { ...settings, exportAs: "audio" as const };
    const log = await run(sound);
    expect(log.some((l) => /^(frame|end|intro|video) /.test(l))).toBe(false);
    expect(sha(log)).toBe(TODAY_SOUND);
    expect(await run({ ...sound, introCard: true }, { ...brand, intro: true } as BrandArt)).toEqual(log);
  });
});
