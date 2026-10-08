import { describe, expect, it, vi } from "vitest";
import { DENOISE_RATE, cameThrough, denoiseNode, firstSound } from "./denoise";
import { wireVoice } from "./videoMedia";
import { applyPatch, defaultSettings, lookOf } from "./videoEdit";

/** A stand-in audio node that records what it is wired to. */
const node = (name: string, log: string[]) => {
  const n = {
    connect: (to: { name: string }) => { log.push(`${name}->${to.name}`); return to; },
    disconnect: (to?: { name: string }) => { log.push(`${name}-x${to ? `->${to.name}` : ""}`); },
    name,
  };
  return n as unknown as AudioNode & { name: string };
};

describe("remove background noise", () => {
  it("is not tried in a context that isn't 48 kHz or has no AudioWorklet", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await denoiseNode({ sampleRate: 44100, audioWorklet: {} } as unknown as BaseAudioContext)).toBeNull();
    expect(await denoiseNode({ sampleRate: DENOISE_RATE } as unknown as BaseAudioContext)).toBeNull();
    expect(warn).not.toHaveBeenCalled(); // turned away before loading anything
    warn.mockRestore();
  });

  it("sits first in the voice chain, and unwiring lets go of everything it fed", () => {
    const log: string[] = [];
    const [src, dn, out] = [node("src", log), node("noise", log), node("out", log)];
    const unwire = wireVoice({} as BaseAudioContext, src, out, false, null, dn);
    expect(log).toEqual(["src->noise", "noise->out"]);
    log.length = 0;
    unwire();
    expect(log).toEqual(["src-x->noise", "noise-x"]);
  });

  it("wires straight through without it", () => {
    const log: string[] = [];
    wireVoice({} as BaseAudioContext, node("src", log), node("out", log), false, null, null);
    expect(log).toEqual(["src->out"]);
  });

  it("is a saved setting a look carries", () => {
    const next = applyPatch(defaultSettings(), { denoise: true }).next;
    expect(next.denoise).toBe(true);
    expect(lookOf(next).denoise).toBe(true);
  });

  it("knows when the offline node had loaded: sound out within a quarter second of where it went in", () => {
    const pcm = new Float32Array(DENOISE_RATE);
    expect(firstSound(pcm, DENOISE_RATE)).toBeNull();
    pcm[12000] = 0.2;
    expect(firstSound(pcm, DENOISE_RATE)).toBe(0.25);
    const out = new Float32Array(DENOISE_RATE);
    expect(cameThrough(out, 0.25)).toBe(false); // silent: it hadn't loaded
    out[12000 + 640] = 0.01; // a few ms late, as the node runs
    expect(cameThrough(out, 0.25)).toBe(true);
    const late = new Float32Array(DENOISE_RATE);
    late[30000] = 0.01; // it only started half way through
    expect(cameThrough(late, 0.25)).toBe(false);
  });
});
