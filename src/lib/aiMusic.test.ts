import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/edgeFn", () => ({ callFn: vi.fn() }));
vi.mock("@/lib/deviceFiles", () => ({ putFile: vi.fn(async () => {}) }));
vi.mock("@/lib/textVoice", () => ({ audioSeconds: vi.fn(async () => 30) }));
vi.mock("@/lib/videoProjects", () => ({ loadProjects: vi.fn(() => []), saveProject: vi.fn() }));

import { callFn } from "@/lib/edgeFn";
import { putFile } from "@/lib/deviceFiles";
import { audioSeconds } from "@/lib/textVoice";
import { loadProjects, saveProject, type VideoProject } from "@/lib/videoProjects";
import { MUSIC_LEVEL, sanitizeMusic, type Music } from "@/lib/videoEdit";
import { dismissMusicJob, musicJob, onMusicApply, onMusicJob, pickMood, startMusic } from "./aiMusic";

const mp3 = () => new Blob([new Uint8Array(5000)]);

beforeEach(() => {
  vi.mocked(callFn).mockReset();
  vi.mocked(saveProject).mockReset();
  vi.mocked(putFile).mockClear();
  vi.mocked(audioSeconds).mockResolvedValue(30);
  dismissMusicJob();
});

describe("pickMood", () => {
  it("takes Jev's mood from the server and falls back to calm", async () => {
    vi.mocked(callFn).mockResolvedValueOnce({ mood: "upbeat" });
    expect(await pickMood("Three things to check before you buy")).toBe("upbeat");
    expect(callFn).toHaveBeenLastCalledWith("text-voice", { mode: "mood", text: "Three things to check before you buy" });
    vi.mocked(callFn).mockResolvedValueOnce({ mood: "angry" });
    expect(await pickMood("x")).toBe("calm");
    vi.mocked(callFn).mockRejectedValueOnce(new Error("down"));
    expect(await pickMood("x")).toBe("calm");
  });
});

describe("startMusic", () => {
  it("asks for the mood and length, keeps the track and hands it to the open editor", async () => {
    vi.mocked(callFn).mockResolvedValueOnce(mp3());
    const got: Music[] = [];
    const off = onMusicApply("v1", (m) => got.push(m));
    const seen: (string | null)[] = [];
    const unwatch = onMusicJob((j) => seen.push(j?.state ?? null));
    const run = startMusic("u1", "v1", "warm", 42);
    expect(musicJob()).toMatchObject({ projectId: "v1", mood: "warm", state: "working" });
    await run;
    off();
    unwatch();
    expect(callFn).toHaveBeenCalledWith("text-voice", { mode: "music", mood: "warm", seconds: 42 }, expect.any(String));
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ name: "Warm, made for this video", level: MUSIC_LEVEL });
    // the same slot an uploaded track takes, so it survives a reload
    expect(sanitizeMusic(got[0])).toEqual(got[0]);
    expect(putFile).toHaveBeenCalledWith(got[0].key, expect.any(Blob));
    expect(saveProject).not.toHaveBeenCalled();
    expect(seen).toEqual(["working", null]);
  });

  it("saves the track on the video when its editor was closed meanwhile, keeping the volume", async () => {
    const p = { id: "v2", settings: { music: { key: "mu-v2-old1", name: "Old", level: 0.6 } } } as unknown as VideoProject;
    vi.mocked(loadProjects).mockReturnValueOnce([p]);
    vi.mocked(callFn).mockResolvedValueOnce(mp3());
    await startMusic("u1", "v2", "calm", 20);
    const saved = vi.mocked(saveProject).mock.calls[0];
    expect(saved[0]).toBe("u1");
    expect(saved[1].settings.music).toMatchObject({ name: "Calm, made for this video", level: 0.6 });
    expect(saved[1].settings.music!.key).toMatch(/^mu-v2-/);
  });

  it("keeps the server's message when it fails, and nothing is placed", async () => {
    vi.mocked(callFn).mockRejectedValueOnce(new Error("You've used all 5 for today. It resets at 8am Singapore time."));
    const got: Music[] = [];
    const off = onMusicApply("v3", (m) => got.push(m));
    await startMusic("u1", "v3", "calm", 20);
    off();
    expect(musicJob()).toMatchObject({ state: "failed", error: "You've used all 5 for today. It resets at 8am Singapore time." });
    expect(got).toEqual([]);
    dismissMusicJob();
    expect(musicJob()).toBeNull();
  });

  it("refuses a silent or empty track", async () => {
    vi.mocked(callFn).mockResolvedValueOnce(new Blob([new Uint8Array(10)]));
    await startMusic("u1", "v4", "calm", 20);
    expect(musicJob()).toMatchObject({ state: "failed", error: "The track came back empty. Try again." });
    dismissMusicJob();
    vi.mocked(callFn).mockResolvedValueOnce(mp3());
    vi.mocked(audioSeconds).mockResolvedValueOnce(0);
    await startMusic("u1", "v4", "calm", 20);
    expect(musicJob()).toMatchObject({ state: "failed" });
    expect(putFile).not.toHaveBeenCalled();
  });

  it("makes one track at a time", async () => {
    let finish: (b: Blob) => void = () => {};
    vi.mocked(callFn).mockReturnValueOnce(new Promise((r) => (finish = r)));
    const first = startMusic("u1", "v5", "calm", 20);
    await expect(startMusic("u1", "v6", "calm", 20)).rejects.toThrow("still being made");
    finish(mp3());
    await first;
    expect(musicJob()).toBeNull();
  });
});
