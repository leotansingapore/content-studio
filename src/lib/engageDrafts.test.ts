import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const invoke = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));

beforeEach(() => {
  store.clear();
  invoke.mockReset();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
});
afterEach(() => vi.unstubAllGlobals());

describe("splitPasted", () => {
  it("splits on blank lines and reads a leading name", async () => {
    const { splitPasted } = await import("@/lib/engageDrafts");
    expect(splitPasted("Sarah Chen: Mine went up too.\nHow do I check?\n\n  \n@Tom: So true!\n\nGreat post")).toEqual([
      { name: "Sarah Chen", text: "Mine went up too.\nHow do I check?" },
      { name: "Tom", text: "So true!" },
      { name: "", text: "Great post" },
    ]);
  });

  it("takes each line as a comment when there are no blank lines, and leaves odd colons in the text", async () => {
    const { splitPasted } = await import("@/lib/engageDrafts");
    expect(splitPasted("one\ntwo\r\nthree").map((c) => c.text)).toEqual(["one", "two", "three"]);
    expect(splitPasted("the thing is: nobody reads it")).toEqual([{ name: "", text: "the thing is: nobody reads it" }]);
    expect(splitPasted("My friend from school said: read it")).toEqual([{ name: "", text: "My friend from school said: read it" }]);
    expect(splitPasted("   ")).toEqual([]);
  });
});

describe("runs", () => {
  it("keeps the last run on this device only, per profile", async () => {
    const { loadRun, saveRun } = await import("@/lib/engageDrafts");
    expect(loadRun("replies", "u1")).toEqual({ post: "", pasted: "", items: [], at: "" });
    saveRun("replies", "u1", { post: "p", pasted: "c", items: [], at: "t" });
    expect([...store.keys()]).toEqual(["cs-engage-replies-u1"]);
    expect(loadRun("replies", "u1")).toMatchObject({ post: "p", pasted: "c", at: "t" });
    expect(loadRun("replies", null)).toMatchObject({ pasted: "" });
  });

  it("saves the drafts when they come back, with the page gone, and sends at most MAX_ITEMS comments", async () => {
    const { MAX_ITEMS, loadRun, runningJob, saveRun, startReplies } = await import("@/lib/engageDrafts");
    const items = [{ i: 0, name: "", text: "Nice", kind: "support", reply: "Thanks." }];
    let finish: (v: unknown) => void = () => {};
    invoke.mockReturnValue(new Promise((r) => (finish = r)));
    saveRun("replies", "u1", { post: "My post", pasted: "x", items: [], at: "" });
    const pasted = Array.from({ length: MAX_ITEMS + 5 }, (_, i) => `c${i}`).join("\n");
    const job = startReplies("u1", "My post", pasted);
    expect(runningJob("replies", "u1")).toBe(job);
    expect(invoke.mock.calls[0][1].body.comments).toHaveLength(MAX_ITEMS);
    finish({ data: { items }, error: null });
    expect(await job).toEqual({ kind: "ok" });
    expect(runningJob("replies", "u1")).toBeUndefined();
    expect(loadRun("replies", "u1")).toMatchObject({ post: "My post", items });
  });

  it("says when the daily limit is reached", async () => {
    const { startReplies } = await import("@/lib/engageDrafts");
    const context = { status: 429, json: async () => ({ code: "daily_limit", error: "You've used all 30 for today." }) };
    invoke.mockResolvedValue({ data: null, error: { context } });
    expect(await startReplies("u1", "", "Nice")).toEqual({ kind: "limit", message: "You've used all 30 for today." });
  });
});
