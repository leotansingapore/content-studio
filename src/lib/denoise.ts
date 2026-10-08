// "Remove background noise": RNNoise (xiph) as the first step of the voice
// chain, from @sapphi-red/web-noise-suppressor (MIT; its worklet carries
// shiguredo/rnnoise-wasm, Apache-2.0). The package's code is imported the first
// time it is switched on and its worklet and wasm are separate files fetched
// then, so none of it is in the main bundle. RNNoise expects 48 kHz, so every
// context it runs in (preview, real-time export, fast export) is made at 48 kHz.
// It puts out silence until its wasm has loaded on the audio thread, so a node is
// only handed over once it has been heard working.

import workletUrl from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";
import wasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import simdUrl from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";

export const DENOISE_RATE = 48000;

let wasm: Promise<ArrayBuffer> | null = null;
const added = new WeakMap<BaseAudioContext, Promise<void>>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A running context's node has loaded once a test tone comes out of it (it is not wired to anything yet, so nobody hears the tone). */
async function heard(ctx: AudioContext, node: AudioNode): Promise<boolean> {
  if (ctx.state !== "running") return true; // nothing renders until it runs, and it loads long before Play
  const tone = new OscillatorNode(ctx, { frequency: 440 });
  const tap = new AnalyserNode(ctx, { fftSize: 2048 });
  tone.connect(node).connect(tap);
  tone.start();
  const data = new Float32Array(tap.fftSize);
  try {
    for (let ms = 0; ms < 3000; ms += 20) {
      await sleep(20);
      tap.getFloatTimeDomainData(data);
      if (data.some((x) => x !== 0)) return true;
    }
    return false;
  } finally {
    tone.stop();
    tone.disconnect();
    node.disconnect(tap);
  }
}

/** A node that takes background noise out of the voice in this context, or null when this browser can't run it here. */
export async function denoiseNode(ctx: BaseAudioContext): Promise<AudioNode | null> {
  if (!ctx.audioWorklet || ctx.sampleRate !== DENOISE_RATE) return null;
  try {
    const { RnnoiseWorkletNode, loadRnnoise } = await import("@sapphi-red/web-noise-suppressor");
    wasm ??= loadRnnoise({ url: wasmUrl, simdUrl });
    if (!added.has(ctx)) added.set(ctx, ctx.audioWorklet.addModule(workletUrl));
    const [wasmBinary] = await Promise.all([wasm, added.get(ctx)]);
    // typed for AudioContext, but an AudioWorkletNode runs in an offline context too
    const node = new RnnoiseWorkletNode(ctx as AudioContext, { wasmBinary, maxChannels: 2 });
    if (ctx instanceof AudioContext && !(await heard(ctx, node))) throw new Error("it stayed silent");
    return node;
  } catch (e) {
    wasm = null; // fetch the files again next time
    added.delete(ctx);
    console.warn("Noise removal didn't load", e);
    return null;
  }
}

/** Where sound first starts in a recording (seconds), or null when it is silent throughout. */
export function firstSound(ch: Float32Array, rate: number): number | null {
  for (let i = 0; i < ch.length; i++) if (Math.abs(ch[i]) > 1e-3) return i / rate;
  return null;
}

/** The node only gives silence until it has loaded: loaded from the start, sound comes out within a quarter second of where it went in. */
export function cameThrough(out: Float32Array, from: number, rate = DENOISE_RATE): boolean {
  const a = Math.floor(from * rate);
  for (let i = a; i < Math.min(out.length, a + rate / 4); i++) if (out[i] !== 0) return true;
  return false;
}

/**
 * A recording with its background noise taken out, offline, for the fast
 * export: the same node, so it comes out as the preview and the real-time
 * export play it, a few ms late like theirs. An offline render keeps the audio
 * thread busy, so the node gets time to load before each try. Null when it
 * can't be done here.
 */
export async function denoiseBuffer(buf: AudioBuffer): Promise<AudioBuffer | null> {
  const from = firstSound(buf.getChannelData(0), buf.sampleRate);
  if (from === null) return buf;
  for (const wait of [20, 200, 1000]) {
    const ctx = new OfflineAudioContext(buf.numberOfChannels, Math.ceil(buf.duration * DENOISE_RATE) + 2048, DENOISE_RATE);
    const node = await denoiseNode(ctx);
    if (!node) return null;
    const src = new AudioBufferSourceNode(ctx, { buffer: buf });
    src.connect(node).connect(ctx.destination);
    src.start();
    await sleep(wait);
    const out = await ctx.startRendering();
    if (cameThrough(out.getChannelData(0), from)) return out;
  }
  console.warn("Noise removal stayed silent offline");
  return null;
}
