import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIC_BLOCKED, NO_MIC, clock, isSilent, startMic } from "./micRecorder";

// A MediaRecorder that hands out two chunks and stops when asked, as Chromium's does.
class FakeRecorder {
  static made: FakeRecorder[] = [];
  static isTypeSupported = (m: string) => m === "audio/webm;codecs=opus";
  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: unknown, opts?: { mimeType?: string }) {
    this.mimeType = opts?.mimeType ?? "";
    FakeRecorder.made.push(this);
  }
  start() {
    this.state = "recording";
    this.ondataavailable?.({ data: new Blob(["ab"]) });
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["cd"]) });
    this.ondataavailable?.({ data: new Blob([]) });
    this.onstop?.();
  }
}

const track = () => ({ stop: vi.fn() });
let tracks: ReturnType<typeof track>[];
const media = (fail?: string) => ({
  getUserMedia: vi.fn(async () => {
    if (fail) throw Object.assign(new Error(fail), { name: fail });
    return { getTracks: () => tracks } as unknown as MediaStream;
  }),
});

beforeEach(() => {
  tracks = [track(), track()];
  FakeRecorder.made = [];
  vi.stubGlobal("MediaRecorder", FakeRecorder);
});
afterEach(() => vi.unstubAllGlobals());

describe("the mic recorder", () => {
  it("hands back one blob after stop and releases every mic track", async () => {
    const m = media();
    const take = await startMic(m);
    expect(m.getUserMedia).toHaveBeenCalledWith({ audio: { echoCancellation: true, noiseSuppression: true } });
    expect(tracks.every((t) => t.stop.mock.calls.length === 0)).toBe(true);
    const blob = await take.stop();
    expect(await blob.text()).toBe("abcd");
    expect(blob.type).toBe("audio/webm;codecs=opus");
    expect(tracks.every((t) => t.stop.mock.calls.length === 1)).toBe(true);
    // a second stop (leaving the page after Stop) is the same take, and stops nothing twice
    expect(await take.stop()).toBe(blob);
    expect(tracks.every((t) => t.stop.mock.calls.length === 1)).toBe(true);
    expect(FakeRecorder.made).toHaveLength(1);
  });

  it("refuses a blocked mic and a missing one with their lines, and records nothing", async () => {
    await expect(startMic(media("NotAllowedError"))).rejects.toThrow(MIC_BLOCKED);
    await expect(startMic(media("NotFoundError"))).rejects.toThrow(NO_MIC);
    await expect(startMic(undefined)).rejects.toThrow(NO_MIC);
    expect(FakeRecorder.made).toHaveLength(0);
  });
});

describe("a silent take", () => {
  const rate = 24000;
  it("is one where no 20 ms frame is louder than RMS 0.01", () => {
    expect(isSilent(new Float32Array(rate), rate)).toBe(true);
    // a steady hiss just under the line
    expect(isSilent(new Float32Array(rate).fill(0.0099), rate)).toBe(true);
    // one word in a second of quiet is heard
    const word = new Float32Array(rate);
    word.fill(0.05, 12000, 12480);
    expect(isSilent(word, rate)).toBe(false);
    expect(isSilent(new Float32Array(0), rate)).toBe(true);
  });
});

it("the Stop button's clock reads m:ss", () => {
  expect(clock(0)).toBe("0:00");
  expect(clock(7.9)).toBe("0:07");
  expect(clock(64)).toBe("1:04");
});
