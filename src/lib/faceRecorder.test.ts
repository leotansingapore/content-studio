import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeError } from "@/lib/edgeFn";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));
const extractWav = vi.fn();
vi.mock("@/lib/videoMedia", () => ({ extractWav: (b: Blob) => extractWav(b), pickMime: () => ({ mime: "video/webm;codecs=vp9,opus", ext: "webm" }) }));
// MediaPipe never runs in vitest
vi.mock("@/lib/faceVision", () => ({ facesIn: vi.fn() }));

const r = await import("./faceRecorder");
const { FACE_KEY_PREFIX } = await import("./myFace");

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const PHOTO = `data:image/jpeg;base64,/9j/${"A".repeat(200)}`;
const WAV = new Blob([new Uint8Array([82, 73, 70, 70, 1, 2, 3])], { type: "audio/wav" });
const HASH = "ab".repeat(32);
const OK = { heard: "My code is 4 8 2 1.", photoHash: HASH, token: "bGlrZW5lc3M.cd", at: "2026-10-21T09:15:00.000Z" };
const input = () => ({ userId: UID, take: new Blob(["take"]), photo: PHOTO, code: "4821", ticket: "Y29uc2VudA.ab" });

class MemStorage {
  s = new Map<string, string>();
  full = Infinity;
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) {
    if (v.length > this.full) throw new DOMException("full", "QuotaExceededError");
    this.s.set(k, v);
  }
  removeItem(k: string) { this.s.delete(k); }
}
let storage: MemStorage;

beforeEach(() => {
  storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} });
  callFn.mockReset();
  extractWav.mockReset().mockResolvedValue({ wav: WAV, duration: 9 });
  r.resetCheck();
});
afterEach(() => vi.unstubAllGlobals());

describe("the camera", () => {
  it("reads no camera as missing and a refusal as blocked", () => {
    expect(r.cameraProblem(new DOMException("no", "NotFoundError"))).toBe("missing");
    expect(r.cameraProblem(new DOMException("no", "OverconstrainedError"))).toBe("missing");
    expect(r.cameraProblem(new DOMException("no", "NotAllowedError"))).toBe("blocked");
    expect(r.cameraProblem(new DOMException("no", "NotReadableError"))).toBe("blocked");
    expect(r.cameraProblem(new Error("?"))).toBe("blocked");
  });

  it("asks for the front camera with sound, and says which problem stopped it", async () => {
    const getUserMedia = vi.fn().mockResolvedValue("stream");
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    vi.stubGlobal("MediaRecorder", class {});
    expect(await r.openCamera()).toBe("stream");
    expect(getUserMedia.mock.calls[0][0]).toMatchObject({ video: { facingMode: "user" }, audio: true });
    getUserMedia.mockRejectedValueOnce(new DOMException("no", "NotAllowedError"));
    await expect(r.openCamera()).rejects.toMatchObject({ problem: "blocked" });
    vi.stubGlobal("navigator", {});
    await expect(r.openCamera()).rejects.toMatchObject({ problem: "missing" });
  });

  it("releases every track", () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    r.stopCamera({ getTracks: () => tracks } as unknown as MediaStream);
    expect(tracks.map((t) => t.stop.mock.calls.length)).toEqual([1, 1]);
    expect(() => r.stopCamera(null)).not.toThrow();
  });
});

describe("the take", () => {
  class FakeRecorder {
    static last: FakeRecorder;
    state = "inactive";
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public stream: unknown, public opts: { mimeType: string }) {
      FakeRecorder.last = this;
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["video"]) });
      this.onstop?.();
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ drawImage: () => {} }), toBlob: (cb: (b: Blob) => void) => cb(new Blob(["frame"], { type: "image/jpeg" })) }) });
  });
  afterEach(() => vi.useRealTimers());

  it("keeps a frame every half second and stops by itself at 12 seconds with one recording", async () => {
    const ticks: number[] = [];
    const take = r.startTake("stream" as unknown as MediaStream, { videoWidth: 720, videoHeight: 1280 } as HTMLVideoElement, (s) => ticks.push(s));
    expect(FakeRecorder.last.opts.mimeType).toBe("video/webm;codecs=vp9,opus");
    await vi.advanceTimersByTimeAsync(r.TAKE_MAX_SECONDS * 1000);
    const t = await take.done;
    expect(FakeRecorder.last.state).toBe("inactive");
    expect(t.blob.type).toBe("video/webm");
    expect(t.frames).toHaveLength(24);
    expect(ticks.at(-1)).toBeGreaterThan(11);
  });

  it("leaves nothing ticking when the recorder fails or won't start", async () => {
    const take = r.startTake("stream" as unknown as MediaStream, { videoWidth: 720, videoHeight: 1280 } as HTMLVideoElement, () => {});
    await vi.advanceTimersByTimeAsync(1000);
    FakeRecorder.last.onerror?.();
    await expect(take.done).rejects.toThrow("The recording stopped. Record again.");
    expect(vi.getTimerCount()).toBe(0);
    vi.spyOn(FakeRecorder.prototype, "start").mockImplementationOnce(() => {
      throw new DOMException("no", "InvalidStateError");
    });
    expect(() => r.startTake("stream" as unknown as MediaStream, {} as HTMLVideoElement, () => {})).toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops early on Stop, with the frames taken so far", async () => {
    const take = r.startTake("stream" as unknown as MediaStream, { videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement, () => {});
    await vi.advanceTimersByTimeAsync(7000);
    take.stop();
    const t = await take.done;
    expect(t.frames).toHaveLength(14);
    // nothing more after the stop
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.frames).toHaveLength(14);
  });
});

describe("the photos", () => {
  it("spreads 12 looks evenly over the frames kept, first and last included", () => {
    expect(r.spread(24, 12)).toEqual([0, 2, 4, 6, 8, 10, 13, 15, 17, 19, 21, 23]);
    expect(r.spread(12, 12)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(r.spread(5, 12)).toEqual([0, 1, 2, 3, 4]);
  });

  it("cuts 9:16 around the face: the full height of a landscape frame, and all of a portrait one", () => {
    expect(r.portraitCrop({ x0: 0.45, y0: 0.2, x1: 0.55, y1: 0.5 }, 1280, 720)).toEqual({ x: 438, y: 0, w: 405, h: 720 });
    // a face near the edge keeps the cut inside the frame
    expect(r.portraitCrop({ x0: 0.9, y0: 0.2, x1: 1, y1: 0.5 }, 1280, 720)).toEqual({ x: 875, y: 0, w: 405, h: 720 });
    expect(r.portraitCrop({ x0: 0.3, y0: 0.2, x1: 0.7, y1: 0.4 }, 720, 1280)).toEqual({ x: 0, y: 0, w: 720, h: 1280 });
    // a 3:4 portrait frame: as tall as it is, the sides trimmed
    expect(r.portraitCrop({ x0: 0.4, y0: 0.3, x1: 0.6, y1: 0.5 }, 960, 1280)).toEqual({ x: 120, y: 0, w: 720, h: 1280 });
    // a frame taller than 9:16: the face sits 40% down the cut
    expect(r.portraitCrop({ x0: 0.4, y0: 0.4, x1: 0.6, y1: 0.6 }, 720, 1600)).toEqual({ x: 0, y: 288, w: 720, h: 1280 });
  });

  it("steps the JPEG quality down until the photo fits", () => {
    const sizes: Record<number, number> = { 0.85: 400_000, 0.75: 360_000, 0.65: 300_000 };
    const canvas = { toDataURL: (_: string, q: number) => `data:image/jpeg;base64,${"A".repeat(sizes[q])}` } as unknown as HTMLCanvasElement;
    expect(r.jpegUnder(canvas)?.length).toBe(300_023);
    expect(r.jpegUnder(canvas, 100)).toBeNull();
  });
});

describe("the consent check", () => {
  it("sends the take's sound and the picked photo's base64, then saves the face as on", async () => {
    callFn.mockResolvedValueOnce(OK);
    await r.startCheck(input());
    expect(callFn).toHaveBeenCalledWith("ai-video", { mode: "consent", kind: "face", wav: "UklGRgECAw==", code: "4821", ticket: "Y29uc2VudA.ab", photo: `/9j/${"A".repeat(200)}` });
    const state = r.checkState();
    expect(state).toMatchObject({ state: "done", face: { status: "on", photo: PHOTO, photoHash: HASH } });
    const saved = JSON.parse(storage.getItem(`${FACE_KEY_PREFIX}${UID}`)!);
    expect(saved.consent).toEqual({ at: OK.at, line: r.CONSENT_LINE("4821"), heard: OK.heard, token: OK.token });
    expect(saved.consent.line).toBe("I'm the person on camera. I agree that Content Studio can make videos of my face. My code is 4 8 2 1.");
  });

  it("refuses a code not heard with the server's line, saving nothing", async () => {
    callFn.mockRejectedValueOnce(new EdgeError("We didn't hear the code 4 8 2 1. Read the line again, a little louder.", 422, "not_heard"));
    await r.startCheck(input());
    expect(r.checkState()).toEqual({ state: "refused", error: "We didn't hear the code 4 8 2 1. Read the line again, a little louder.", code: "not_heard" });
    expect(storage.s.size).toBe(0);
  });

  it("refuses an old code and the daily cap with the server's line", async () => {
    callFn.mockRejectedValueOnce(new EdgeError("That code has run out. Record again for a new one.", 400, "bad_request"));
    await r.startCheck(input());
    expect(r.checkState()).toMatchObject({ state: "refused", error: "That code has run out. Record again for a new one." });
    callFn.mockRejectedValueOnce(new EdgeError("You've used all 5 for today. It resets at 8am Singapore time.", 429, "daily_limit"));
    await r.startCheck(input());
    expect(r.checkState()).toMatchObject({ state: "refused", error: "You've used all 5 for today. It resets at 8am Singapore time." });
  });

  it("keeps the take when the check never answered, and Try again sends the same one", async () => {
    callFn.mockRejectedValueOnce(new EdgeError("Couldn't check the recording. Try again in a minute.", 502, "failed"));
    await r.startCheck(input());
    expect(r.checkState()).toEqual({ state: "failed", error: "Couldn't check the recording. Try again in a minute." });
    callFn.mockRejectedValueOnce(new EdgeError("Couldn't reach the server. Check your connection and try again.", 0));
    await r.retryCheck();
    expect(r.checkState()).toMatchObject({ state: "failed" });
    callFn.mockResolvedValueOnce(OK);
    await r.retryCheck();
    expect(r.checkState()).toMatchObject({ state: "done" });
    expect(callFn.mock.calls.map((c) => c[1])).toEqual([callFn.mock.calls[0][1], callFn.mock.calls[0][1], callFn.mock.calls[0][1]]);
  });

  it("saves again without asking the server again when this device was out of room", async () => {
    storage.full = 50;
    callFn.mockResolvedValueOnce(OK);
    await r.startCheck(input());
    expect(r.checkState()).toEqual({ state: "failed", error: "This device is out of room, so your face wasn't saved. Clear some space, then try again." });
    storage.full = Infinity;
    await r.retryCheck();
    expect(r.checkState()).toMatchObject({ state: "done" });
    expect(callFn).toHaveBeenCalledTimes(1);
  });

  it("asks to record again when the recording's sound can't be read, sending nothing", async () => {
    extractWav.mockRejectedValueOnce(new Error("decode"));
    await r.startCheck(input());
    expect(r.checkState()).toEqual({ state: "refused", error: "Couldn't read the sound in that recording. Record again." });
    expect(callFn).not.toHaveBeenCalled();
    await r.retryCheck();
    expect(callFn).not.toHaveBeenCalled();
  });

  it("tells whoever listens, and forgets the take on reset", async () => {
    const seen: string[] = [];
    const off = r.onCheck(() => seen.push(r.checkState().state));
    callFn.mockRejectedValueOnce(new EdgeError("down", 503));
    await r.startCheck(input());
    r.resetCheck();
    await r.retryCheck();
    off();
    expect(seen).toEqual(["checking", "failed", "idle"]);
    expect(callFn).toHaveBeenCalledTimes(1);
  });
});
