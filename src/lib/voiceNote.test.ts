import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const audio = vi.hoisted(() => ({ length: 60 as number, decoded: 60 as number, opened: [] as number[], reads: [] as [number, number][], broken: false }));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/longAudio", () => ({
  RATE: 16000,
  mediaLength: async () => audio.length,
  openSound: async (_f: Blob, d: number) => {
    audio.opened.push(d);
    if (audio.broken) throw new Error("decode failed");
    return { read: async (from: number, to: number) => (audio.reads.push([from, to]), new Float32Array(Math.round(Math.min(to, audio.decoded) * 16000))) };
  },
}));
vi.mock("@/lib/videoMedia", () => ({ encodeWav: (pcm: Float32Array) => new Blob([`wav:${pcm.length}`]) }));
const transcribe = vi.hoisted(() => vi.fn());
vi.mock("@/lib/videoProjects", () => ({ transcribe }));

import { EdgeError } from "@/lib/edgeFn";
import { MIC_BLOCKED } from "@/lib/micRecorder";
import { NOTE_LINES, clearNote, noteError, onVoiceJob, recordNote, retryNote, stopNote, uploadNote, voiceJob, voiceToWav } from "./voiceNote";

const file = () => new Blob(["note"]);
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  Object.assign(audio, { length: 60, decoded: 60, opened: [], reads: [], broken: false });
  transcribe.mockReset();
  clearNote();
});

describe("voiceToWav", () => {
  it("refuses 721 seconds before decoding anything", async () => {
    audio.length = 721;
    await expect(voiceToWav(file())).rejects.toThrow(NOTE_LINES.tooLong);
    audio.length = 780;
    await expect(voiceToWav(file())).rejects.toThrow(NOTE_LINES.tooLong);
    expect(audio.opened).toEqual([]);
  });

  it("refuses a file of unknown length that decodes to more than 720 seconds", async () => {
    audio.length = NaN;
    audio.decoded = 800;
    await expect(voiceToWav(file())).rejects.toThrow(NOTE_LINES.tooLong);
    expect(audio.reads).toEqual([[0, 721]]);
    audio.decoded = 200;
    expect((await voiceToWav(file())).seconds).toBe(200);
  });

  it("uses the seconds a recording's timer counted, not the file's header", async () => {
    audio.length = NaN;
    const out = await voiceToWav(file(), 42);
    expect(audio.opened).toEqual([42]);
    expect(audio.reads).toEqual([[0, 42]]);
    expect(out.seconds).toBe(42);
    expect(await out.wav.text()).toBe(`wav:${42 * 16000}`);
  });

  it("reports no speech under half a second, and an unreadable file", async () => {
    audio.length = 0.4;
    await expect(voiceToWav(file())).rejects.toThrow(NOTE_LINES.noSpeech);
    audio.length = 30;
    audio.broken = true;
    await expect(voiceToWav(file())).rejects.toThrow(NOTE_LINES.unreadable);
  });
});

describe("noteError", () => {
  it("names each refusal by its status, never the server's video wording, and keeps the WAV only for a retry", () => {
    expect(noteError(new EdgeError("That video is too long to caption. Keep it under about 12 minutes.", 413))).toEqual({ line: NOTE_LINES.tooLong, retry: false });
    expect(noteError(new EdgeError("No sound found in that video.", 400))).toEqual({ line: NOTE_LINES.noSpeech, retry: false });
    expect(noteError(new EdgeError("You've used all 30 for today. It resets at 8am Singapore time.", 429, "daily_limit"))).toEqual({ line: "You've used all 30 for today. It resets at 8am Singapore time.", retry: false });
    expect(noteError(new EdgeError("Couldn't caption that right now. Try again in a minute.", 502))).toEqual({ line: NOTE_LINES.failed, retry: true });
    expect(noteError(new TypeError("Failed to fetch"))).toEqual({ line: NOTE_LINES.failed, retry: true });
  });
});

describe("the voice note job", () => {
  afterEach(() => vi.useRealTimers());

  it("turns an upload into text, telling listeners as it goes", async () => {
    transcribe.mockResolvedValue({ text: " Hello from my voice note. ", words: [], duration: 60 });
    const seen: string[] = [];
    const off = onVoiceJob(() => seen.push(voiceJob()?.state ?? "none"));
    await uploadNote("u1", file());
    off();
    expect(seen).toEqual(["reading", "reading", "done"]);
    expect(voiceJob()).toEqual({ state: "done", userId: "u1", text: "Hello from my voice note.", seconds: 60 });
  });

  it("refuses a 13-minute file before anything is sent", async () => {
    audio.length = 780;
    await uploadNote("u1", file());
    expect(transcribe).not.toHaveBeenCalled();
    expect(voiceJob()).toEqual({ state: "failed", userId: "u1", error: NOTE_LINES.tooLong, retry: false });
  });

  it("an empty transcript is no speech", async () => {
    transcribe.mockResolvedValue({ text: "  ", words: [], duration: 3 });
    await uploadNote("u1", file());
    expect(voiceJob()).toMatchObject({ state: "failed", error: NOTE_LINES.noSpeech, retry: false });
  });

  it("Try again resends the WAV still in memory, with no second decode", async () => {
    transcribe.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({ text: "Second time lucky.", words: [], duration: 60 });
    await uploadNote("u1", file());
    expect(voiceJob()).toMatchObject({ state: "failed", error: NOTE_LINES.failed, retry: true });
    retryNote();
    await settle();
    expect(audio.opened).toHaveLength(1);
    expect(transcribe).toHaveBeenCalledTimes(2);
    expect(transcribe.mock.calls[1][0]).toBe(transcribe.mock.calls[0][0]);
    expect(voiceJob()).toMatchObject({ state: "done", text: "Second time lucky." });
  });

  it("a daily limit shows the server's words and drops the WAV", async () => {
    transcribe.mockRejectedValue(new EdgeError("You've used all 30 for today.", 429, "daily_limit"));
    await uploadNote("u1", file());
    expect(voiceJob()).toMatchObject({ state: "failed", error: "You've used all 30 for today.", retry: false });
    retryNote();
    await settle();
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  it("a blocked mic shows startMic's line and records nothing", async () => {
    await recordNote("u1", async () => { throw new Error(MIC_BLOCKED); });
    expect(voiceJob()).toEqual({ state: "failed", userId: "u1", error: MIC_BLOCKED, retry: false });
  });

  it("records, and sends the seconds its timer counted", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T09:00:00Z"));
    transcribe.mockResolvedValue({ text: "A minute of talk.", words: [], duration: 61 });
    await recordNote("u1", async () => ({ stop: async () => new Blob(["webm"]) }));
    expect(voiceJob()).toMatchObject({ state: "recording", userId: "u1" });
    await recordNote("u1", async () => { throw new Error("a second press starts nothing"); });
    expect(voiceJob()?.state).toBe("recording");
    vi.setSystemTime(new Date("2026-10-22T09:01:00.300Z"));
    await stopNote();
    expect(audio.opened).toEqual([61]);
    expect(voiceJob()).toMatchObject({ state: "done", text: "A minute of talk." });
  });

  it("stops itself at 12:00", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T09:00:00Z"));
    transcribe.mockResolvedValue({ text: "Twelve minutes.", words: [], duration: 720 });
    let stopped = false;
    await recordNote("u1", async () => ({ stop: async () => ((stopped = true), new Blob(["webm"])) }));
    await vi.advanceTimersByTimeAsync(719_000);
    expect(stopped).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(stopped).toBe(true);
    await vi.runAllTimersAsync();
    expect(audio.opened).toEqual([720]);
    expect(voiceJob()).toMatchObject({ state: "done" });
  });
});
