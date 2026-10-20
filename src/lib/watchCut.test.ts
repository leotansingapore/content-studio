import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/videoProjects", () => ({ watchVideo: vi.fn() }));

import { watchVideo } from "@/lib/videoProjects";
import { startWatch, watchJob, type WatchFinding } from "./watchCut";

const watched = vi.mocked(watchVideo);
const finding: WatchFinding = { kind: "slow_start", start: 0, end: 3, what: "A still title for 3 seconds", fix: "Start on the first line" } as WatchFinding;

beforeEach(() => {
  watched.mockReset();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["mp4"], { type: "video/mp4" }))));
});
afterEach(() => vi.unstubAllGlobals());

describe("watch it like a viewer", () => {
  it("watches one export at a time, so a second press while it runs sends nothing", async () => {
    let finish!: (f: WatchFinding[]) => void;
    watched.mockReturnValue(new Promise((done) => (finish = done)));
    const runs = [startWatch("e1", "blob:e1", 30), startWatch("e1", "blob:e1", 30), startWatch("e2", "blob:e2", 30)];
    await vi.waitFor(() => expect(watched).toHaveBeenCalled());
    finish([finding]);
    await Promise.all(runs);
    expect(watched).toHaveBeenCalledTimes(1);
    expect(watchJob()).toMatchObject({ exportId: "e1", state: "done", findings: [finding] });
  });

  it("stops showing it as running when the watch fails, says why, and can be pressed again", async () => {
    watched.mockRejectedValueOnce(new Error("You've used all 5 watches for today."));
    await startWatch("e4", "blob:e4", 20);
    expect(watchJob()).toEqual({ exportId: "e4", state: "failed", error: "You've used all 5 watches for today." });
    watched.mockResolvedValueOnce([]);
    await startWatch("e4", "blob:e4", 20);
    expect(watchJob()).toMatchObject({ exportId: "e4", state: "done", findings: [] });
  });
});
