// The real-time export (startExport recording the canvas, for browsers with no WebCodecs) for a project without the
// intro card, pinned on today's code (main 738c7bf3, before brand-kit's intro card was drawn): when the recorder
// starts, pauses and resumes, and every word and box painted while it records, at its time in the file. The browser
// (video, canvas, recorder, sound) is faked in node on a fake clock; the plan, cuts, captions and drawing are real.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "./videoEdit";
import { exportJob, startExport, type BrandArt } from "./videoMedia";

vi.mock("@/lib/fastExport", () => ({ exportFast: async () => null }));

const log: string[] = [];
const fmt = (t: number) => t.toFixed(3);
const now = () => performance.now();

// ---- the recorder keeps the file's own clock: time only runs while it records ----
let rec: FakeRecorder | null = null;
const fileTime = () => (rec ? rec.kept + (rec.state === "recording" ? now() - rec.from : 0) : 0) / 1000;
const at = () => `@${fmt(fileTime())} ${rec?.state ?? "inactive"}`;
class FakeRecorder {
  static isTypeSupported = () => true;
  state: "inactive" | "recording" | "paused" = "inactive";
  kept = 0;
  from = 0;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor() {
    rec = this;
  }
  private go(what: string, state: FakeRecorder["state"]) {
    if (this.state === "recording") this.kept += now() - this.from;
    if (state === "recording") this.from = now();
    this.state = state;
    log.push(`recorder ${what} @${fmt(fileTime())}`);
  }
  start() {
    this.go("start", "recording");
  }
  pause() {
    this.go("pause", "paused");
  }
  resume() {
    this.go("resume", "recording");
  }
  stop() {
    this.go("stop", "inactive");
    this.onstop?.();
  }
}

// ---- a video that plays on the fake clock ----
class FakeVideo {
  duration = 12;
  videoWidth = 1080;
  videoHeight = 1920;
  preload = "";
  playsInline = false;
  muted = false;
  loop = false;
  paused = true;
  defaultPlaybackRate = 1;
  onloadedmetadata: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private base = 0;
  private t0 = 0;
  private rate = 1;
  private url = "";
  private seeked: (() => void)[] = [];
  get src() {
    return this.url;
  }
  set src(u: string) {
    this.url = u;
    queueMicrotask(() => this.onloadedmetadata?.());
  }
  get currentTime() {
    return this.paused ? this.base : Math.min(this.duration, this.base + ((now() - this.t0) / 1000) * this.rate);
  }
  set currentTime(t: number) {
    this.base = t;
    this.t0 = now();
    const fire = this.seeked;
    this.seeked = [];
    for (const f of fire) f();
  }
  get playbackRate() {
    return this.rate;
  }
  set playbackRate(r: number) {
    this.base = this.currentTime;
    this.t0 = now();
    this.rate = r;
  }
  get ended() {
    return this.currentTime >= this.duration;
  }
  play() {
    if (this.paused) {
      this.t0 = now();
      this.paused = false;
    }
    return Promise.resolve();
  }
  pause() {
    this.base = this.currentTime;
    this.paused = true;
  }
  addEventListener(type: string, f: () => void) {
    if (type === "seeked") this.seeked.push(f);
  }
}

// ---- a 2D context that notes the words and boxes it paints ----
function context(canvas: object) {
  const state: Record<string | symbol, unknown> = {
    canvas, globalAlpha: 1, filter: "none", fillStyle: "#000000", strokeStyle: "#000000", font: "10px sans-serif", textAlign: "start",
    textBaseline: "alphabetic", lineWidth: 1, lineJoin: "miter", globalCompositeOperation: "source-over", shadowBlur: 0, shadowColor: "transparent", letterSpacing: "0px",
  };
  return new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === "measureText") return (s: string) => ({ width: s.length * 20, actualBoundingBoxAscent: 30, actualBoundingBoxDescent: 8, fontBoundingBoxAscent: 34, fontBoundingBoxDescent: 9 });
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop() {} });
      if (k === "fillText") return (s: string, x: number, y: number) => log.push(`text "${s}" ${t.font} ${t.fillStyle} ${Math.round(x)},${Math.round(y)} ${at()}`);
      if (k === "fillRect") return (x: number, y: number, w: number, h: number) => log.push(`box ${t.fillStyle} ${Math.round(x)},${Math.round(y)} ${Math.round(w)}x${Math.round(h)} ${at()}`);
      return () => undefined;
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}
function canvasEl() {
  const c = { width: 0, height: 0, getContext: () => g, captureStream: () => ({ getVideoTracks: () => [] }) };
  const g = context(c);
  return c;
}

// ---- sound: nodes that connect, and the music track's starts ----
class Node {
  connect<T>(n: T) {
    return n;
  }
  disconnect() {}
}
const param = (value: number) => ({ value, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime: (v: number) => log.push(`music level ${fmt(v)} ${at()}`) });
class GainNode extends Node {
  gain: ReturnType<typeof param>;
  constructor(_c?: unknown, o?: { gain?: number }) {
    super();
    this.gain = param(o?.gain ?? 1);
  }
}
class AudioBufferSourceNode extends Node {
  constructor(_c: unknown, private o: { loop?: boolean }) {
    super();
  }
  start(_when = 0, pos = 0) {
    log.push(`music from ${fmt(pos)}${this.o.loop ? " looped" : ""} ${at()}`);
  }
  stop() {}
}
const sound = (seconds: number) => ({ duration: seconds, length: seconds * 48000, sampleRate: 48000, numberOfChannels: 2, getChannelData: () => new Float32Array(1) });
class AudioContext {
  sampleRate = 48000;
  get currentTime() {
    return now() / 1000;
  }
  async resume() {}
  async close() {}
  createMediaStreamDestination() {
    return Object.assign(new Node(), { stream: { getAudioTracks: () => [] } });
  }
  createGain() {
    return new GainNode();
  }
  createMediaElementSource() {
    return new Node();
  }
}
class OfflineAudioContext {
  async decodeAudioData() {
    return sound(10);
  }
}

const CLOCK: Parameters<typeof vi.useFakeTimers>[0] = { now: 0, toFake: ["setTimeout", "clearTimeout", "performance"] };
beforeEach(() => {
  for (const [k, v] of Object.entries({ MediaRecorder: FakeRecorder, MediaStream: class {}, AudioContext, OfflineAudioContext, GainNode, AudioBufferSourceNode })) vi.stubGlobal(k, v);
  vi.stubGlobal("window", { setTimeout: (f: () => void, ms: number) => setTimeout(f, ms) });
  vi.stubGlobal("document", {
    querySelector: () => ({}),
    fonts: { load: async () => [] },
    createElement: (tag: string) => (tag === "video" ? new FakeVideo() : tag === "canvas" ? canvasEl() : { click() {} }),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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

/** One real-time export, as the log of the recorder and everything painted, with the file's length. */
async function run(s: typeof settings, art: BrandArt | null = brand): Promise<string[]> {
  // every run from 0 on the clock
  vi.useRealTimers();
  vi.useFakeTimers(CLOCK);
  log.length = 0;
  rec = null;
  let done = false;
  const going = startExport("Clip", new Blob(["mp4"]), words, s, undefined, art, null, undefined, new Blob(["mp3"])).finally(() => (done = true));
  for (let i = 0; i < 2000 && !done; i++) await vi.advanceTimersByTimeAsync(1000 / 30);
  await going;
  const j = exportJob();
  if (j?.state !== "done") throw new Error(`no export: ${j?.error}`);
  log.push(`done ${j.seconds} s ${j.ext} ${j.label} cap ${j.cap}`);
  return [...log];
}
const sha = (l: string[]) => createHash("sha256").update(l.join("\n")).digest("hex");

const TODAY = "d027d27305cab64f4f35a1119b7f1c1759eba3451eb1fedc1a19cdbff88a3766";

describe("the real-time export without the intro card (pinned)", () => {
  it("records the same frames at the same times as today", async () => {
    const out = await run(settings);
    // the parts joined end to end (each cut pauses and resumes the recorder), then the 2.5 s end card
    expect(out.filter((l) => l.startsWith("recorder "))).toEqual([
      "recorder start @0.000", "recorder pause @3.102", "recorder resume @3.102", "recorder pause @3.665", "recorder resume @3.665",
      "recorder pause @4.458", "recorder resume @4.458", "recorder pause @6.142", "recorder resume @6.142", "recorder stop @8.650",
    ]);
    expect(out.at(-1)).toBe("done 8.669999999999998 s mp4 Instagram cap 0");
    expect(sha(out)).toBe(TODAY);
  });

  it("records the same file with introCard off, and with it on for a sign-in that isn't Leo's", async () => {
    const today = await run(settings);
    expect(await run({ ...settings, introCard: false })).toEqual(today);
    expect(await run({ ...settings, introCard: true })).toEqual(today);
    // Leo's brand art with the switch off
    expect(await run(settings, { ...brand, intro: true } as BrandArt)).toEqual(today);
  });

  it("records sound only as today, the intro card never in it", async () => {
    const sound = { ...settings, exportAs: "audio" as const };
    const today = await run(sound);
    expect(today.at(-1)).toBe("done 6.169999999999999 s m4a Instagram cap 0");
    expect(await run({ ...sound, introCard: true }, { ...brand, intro: true } as BrandArt)).toEqual(today);
  });
});
