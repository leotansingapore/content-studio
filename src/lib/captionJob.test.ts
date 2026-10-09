import { beforeEach, describe, expect, it, vi } from "vitest";

const files = new Map<string, Blob>();
vi.mock("@/lib/videoMedia", () => ({
  getFile: async (k: string) => files.get(k) ?? null,
  putFile: async (k: string, b: Blob) => void files.set(k, b),
  deleteFile: async (k: string) => void files.delete(k),
  encodeWav: () => new Blob(["wav"]),
}));
vi.mock("@/lib/longAudio", () => ({ RATE: 16000, openSound: async () => ({ read: async () => new Float32Array(1) }) }));
vi.mock("@/lib/videoProjects", () => ({ transcribe: vi.fn(), loadProjects: vi.fn(), saveProject: vi.fn(), loadFixes: () => [] }));

import { loadProjects, saveProject, transcribe, type VideoProject } from "@/lib/videoProjects";
import { captionPlan } from "./longCaptions";
import { captionJob, partsDone, startCaptions } from "./captionJob";

const transcribed = vi.mocked(transcribe);
const saved = vi.mocked(saveProject);
// 25 minutes: three parts of about 8 minutes
const project = (): VideoProject => ({ id: "v1", name: "Podcast", createdAt: "", updatedAt: "", duration: 1500, size: 1, words: [], settings: {} as never, thumb: "" });
const said = (w: string) => ({ words: [{ w, s: 1, e: 1.5 }], text: w, duration: 1 });
const keptParts = (duration: number, results: unknown[]) => files.set("captions-v1", new Blob([JSON.stringify({ duration, results })]));

beforeEach(() => {
  files.clear();
  transcribed.mockReset();
  saved.mockClear();
  vi.mocked(loadProjects).mockReturnValue([project()]);
});

describe("captions for a long recording", () => {
  it("captions each part once when Caption it is pressed twice before the job starts", async () => {
    transcribed.mockResolvedValue(said("hi"));
    const first = startCaptions("u", project(), new Blob(["x"]));
    const second = startCaptions("u", project(), new Blob(["x"]));
    await expect(second).rejects.toThrow("Captions are still running for Podcast.");
    await first;
    expect(captionPlan(1500)).toHaveLength(3);
    expect(transcribed).toHaveBeenCalledTimes(3);
    expect(captionJob()).toMatchObject({ state: "done", done: 3, of: 3 });
  });

  it("carries on from the parts already captioned, then saves the words and drops what it kept", async () => {
    keptParts(1500, [[{ w: "first", s: 1, e: 1.5 }], null, null]);
    transcribed.mockResolvedValue(said("later"));
    await startCaptions("u", project(), new Blob(["x"]));
    expect(transcribed).toHaveBeenCalledTimes(2);
    expect(saved.mock.calls[0][1].words.map((w) => w.w)).toEqual(["first", "later", "later"]);
    expect(files.has("captions-v1")).toBe(false);
  });

  it("stops at a part that fails, says why, and keeps the parts done for next time", async () => {
    transcribed.mockResolvedValueOnce(said("one")).mockRejectedValue(new Error("You've used all 30 for today."));
    await startCaptions("u", project(), new Blob(["x"]));
    expect(captionJob()).toMatchObject({ state: "failed", error: "You've used all 30 for today." });
    expect(saved).not.toHaveBeenCalled();
    expect((await partsDone(project())).filter(Boolean)).toHaveLength(1);
  });

  it("starts over when what it kept is unreadable or from a recording of another length", async () => {
    keptParts(1499, [[{ w: "x", s: 0, e: 1 }], null, null]);
    expect(await partsDone(project())).toEqual([null, null, null]);
    files.set("captions-v1", new Blob(["{broken"]));
    expect(await partsDone(project())).toEqual([null, null, null]);
  });
});
