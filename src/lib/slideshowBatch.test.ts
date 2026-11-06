import { beforeEach, describe, expect, it, vi } from "vitest";

const job = vi.hoisted(() => ({ current: null as null | Record<string, unknown>, start: vi.fn() }));
vi.mock("@/lib/slideshowJob", async (orig) => ({
  ...(await orig<typeof import("./slideshowJob")>()),
  startSlideshow: job.start,
  slideshowJob: () => job.current,
  slideshowBusy: () => false,
}));

import { MAX_BATCH, batchBusy, batchPairs, batchPlan, clearSlideshowBatch, lookAsk, lookLabel, slideshowBatch, startBatch } from "./slideshowBatch";

const BASE = { mention: true, inside: false, note: "", size: "4x5" as const };

beforeEach(() => {
  job.current = null;
  job.start.mockReset();
  clearSlideshowBatch();
});

describe("pairs and looks", () => {
  it("makes each hook in each look, hooks outer, blanks and repeats dropped, at most 12", () => {
    expect(batchPairs([" A ", "B", "A", ""], ["stock", "sunset"])).toEqual([
      { hook: "A", look: "stock" },
      { hook: "A", look: "sunset" },
      { hook: "B", look: "stock" },
      { hook: "B", look: "sunset" },
    ]);
    expect(batchPairs(["1", "2", "3", "4", "5", "6"], ["stock", "sea", "dark"])).toHaveLength(MAX_BATCH);
  });

  it("sets the picture fields each look needs", () => {
    expect(lookAsk("stock")).toEqual({ pictures: "stock" });
    expect(lookAsk("dark")).toEqual({ pictures: "stock", mood: "dark" });
    expect(lookAsk("mine")).toEqual({ pictures: "mine" });
    expect(lookAsk("ai-comic")).toEqual({ pictures: "ai", look: "comic" });
    expect(lookLabel("ai-comic")).toBe("AI: Comic book");
    expect(lookLabel("sea")).toBe("Sea and beach");
  });
});

describe("the plan", () => {
  it("counts the makes and AI picture sets, and says why a batch can't run", () => {
    expect(batchPlan(2, ["stock", "ai-felt", "ai-comic"])).toEqual({ count: 6, ai: 4, reason: null });
    expect(batchPlan(0, ["stock"]).reason).toBe("Pick at least one hook.");
    expect(batchPlan(2, []).reason).toBe("Pick at least one look.");
    expect(batchPlan(5, ["stock", "sea", "dark"]).reason).toBe("That's 15 slideshows. A batch makes at most 12.");
    expect(batchPlan(3, ["ai-felt", "ai-comic"]).reason).toBe("That's 6 sets of AI pictures. Today allows 5.");
  });
});

describe("the run", () => {
  it("makes every pair in turn with the hook as topic and cover, and keeps each slideshow", async () => {
    let n = 0;
    job.start.mockImplementation(async () => void (job.current = { state: "done", showId: `show-${++n}` }));
    await startBatch("u", BASE, batchPairs(["Hook one", "Hook two"], ["stock", "ai-felt"]));
    expect(job.start.mock.calls.map((c) => [c[1].topic, c[1].hook, c[1].pictures, c[1].look ?? null])).toEqual([
      ["Hook one", "Hook one", "stock", null],
      ["Hook one", "Hook one", "ai", "felt"],
      ["Hook two", "Hook two", "stock", null],
      ["Hook two", "Hook two", "ai", "felt"],
    ]);
    expect(job.start.mock.calls[0][1]).toMatchObject({ source: null, mention: true, size: "4x5" });
    expect(slideshowBatch()!.runs.map((r) => [r.state, r.showId])).toEqual([["done", "show-1"], ["done", "show-2"], ["done", "show-3"], ["done", "show-4"]]);
    expect(batchBusy()).toBe(false);
  });

  it("moves on past a failed make, and skips the rest once today's makes run out", async () => {
    const answers = [
      { state: "failed", error: "Couldn't write the slides. Try again in a minute." },
      { state: "done", showId: "s2" },
      { state: "failed", error: "That's today's 30 slideshows.", capped: true },
    ];
    job.start.mockImplementation(async () => void (job.current = answers.shift() ?? null));
    await startBatch("u", BASE, batchPairs(["A", "B"], ["stock", "sea"]));
    expect(job.start).toHaveBeenCalledTimes(3);
    const b = slideshowBatch()!;
    expect(b.runs.map((r) => r.state)).toEqual(["failed", "done", "failed", "skipped"]);
    expect(b.stopped).toBe("That's today's 30 slideshows.");
  });

  it("starts nothing while a batch runs", async () => {
    let finish = () => {};
    job.start.mockImplementation(() => new Promise<void>((r) => (finish = () => ((job.current = { state: "done", showId: "x" }), r()))));
    const first = startBatch("u", BASE, batchPairs(["A"], ["stock"]));
    expect(batchBusy()).toBe(true);
    await startBatch("u", BASE, batchPairs(["B"], ["stock"]));
    finish();
    await first;
    expect(job.start).toHaveBeenCalledTimes(1);
  });
});
