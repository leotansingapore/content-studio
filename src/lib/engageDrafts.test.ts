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
    expect(splitPasted("陈先生: 你好，可以聊聊吗？")).toEqual([{ name: "陈先生", text: "你好，可以聊聊吗？" }]);
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
    expect(loadRun("replies", "u1")).toEqual({ post: "", pasted: "", posts: [], items: [], at: "" });
    saveRun("replies", "u1", { post: "p", pasted: "c", posts: [], items: [], at: "t" });
    expect([...store.keys()]).toEqual(["cs-engage-replies-u1"]);
    expect(loadRun("replies", "u1")).toMatchObject({ post: "p", pasted: "c", at: "t" });
    expect(loadRun("replies", null)).toMatchObject({ pasted: "" });
  });

  it("saves the drafts when they come back, with the page gone, and sends at most MAX_ITEMS comments", async () => {
    const { MAX_ITEMS, loadRun, runningJob, saveRun, startRun } = await import("@/lib/engageDrafts");
    const items = [{ i: 0, name: "", text: "Nice", kind: "support", reply: "Thanks." }];
    let finish: (v: unknown) => void = () => {};
    invoke.mockReturnValue(new Promise((r) => (finish = r)));
    saveRun("replies", "u1", { post: "My post", pasted: "x", posts: [], items: [], at: "" });
    const pasted = Array.from({ length: MAX_ITEMS + 5 }, (_, i) => `c${i}`).join("\n");
    const job = startRun("replies", "u1", { post: "My post", pasted, posts: [] });
    expect(runningJob("replies", "u1")).toBe(job);
    expect(invoke.mock.calls[0][1].body).toMatchObject({ mode: "replies", post: "My post" });
    expect(invoke.mock.calls[0][1].body.comments).toHaveLength(MAX_ITEMS);
    finish({ data: { items }, error: null });
    expect(await job).toEqual({ kind: "ok" });
    expect(runningJob("replies", "u1")).toBeUndefined();
    expect(loadRun("replies", "u1")).toMatchObject({ post: "My post", items });
  });

  it("sends DMs as messages and keeps their run apart from the replies", async () => {
    const { loadRun, startRun } = await import("@/lib/engageDrafts");
    invoke.mockResolvedValue({ data: { items: [{ i: 0 }] }, error: null });
    expect(await startRun("dms", "u1", { post: "", pasted: "Karen: Hi\n\nTom: Yo", posts: [] })).toEqual({ kind: "ok" });
    expect(invoke.mock.calls[0][1].body).toEqual({ mode: "dms", messages: [{ name: "Karen", text: "Hi" }, { name: "Tom", text: "Yo" }] });
    expect(loadRun("dms", "u1").items).toEqual([{ i: 0 }]);
    expect(loadRun("replies", "u1").items).toEqual([]);
  });

  it("says when the daily limit is reached", async () => {
    const { startRun } = await import("@/lib/engageDrafts");
    const context = { status: 429, json: async () => ({ code: "daily_limit", error: "You've used all 30 for today." }) };
    invoke.mockResolvedValue({ data: null, error: { context } });
    expect(await startRun("replies", "u1", { post: "", pasted: "Nice", posts: [] })).toEqual({ kind: "limit", message: "You've used all 30 for today." });
  });
});

describe("comments on other people's posts", () => {
  it("sends the filled post slots, up to MAX_POSTS", async () => {
    const { MAX_POSTS, requestBody } = await import("@/lib/engageDrafts");
    const posts = [{ name: "Sarah", text: "A post" }, { name: "Tom", text: "  " }, ...Array.from({ length: MAX_POSTS + 2 }, (_, i) => ({ name: "", text: `p${i}` }))];
    const body = requestBody("comments", { post: "", pasted: "ignored", posts });
    expect(body).toMatchObject({ mode: "comments" });
    expect((body as { posts: unknown[] }).posts).toHaveLength(MAX_POSTS);
    expect((body as { posts: unknown[] }).posts[0]).toEqual({ name: "Sarah", text: "A post" });
    expect((body as { posts: { text: string }[] }).posts.map((p) => p.text)).not.toContain("  ");
  });

  it("logs a copied comment once per post a day, synced per profile, and counts this week by name", async () => {
    const { loadLog, logComment, thisWeek, timesThisWeek, unlog } = await import("@/lib/engageDrafts");
    const wed = new Date(2026, 9, 7, 10); // Wednesday
    logComment("u1", "Sarah Chen", "Whole life is a waste", new Date(2026, 9, 5, 9)); // Monday
    logComment("u1", "@sarah chen", "CPF LIFE is not enough", new Date(2026, 9, 6, 9));
    logComment("u1", "Sarah Chen", "CPF LIFE is not enough", new Date(2026, 9, 6, 18)); // second option, same day
    logComment("u1", "Tom", "Last week's post", new Date(2026, 9, 4, 9)); // Sunday: last week
    const log = loadLog("u1");
    expect([...store.keys()]).toEqual(["content-studio-commentlog-u1"]);
    expect(log).toHaveLength(3);
    expect(thisWeek(log, wed).map((e) => e.post)).toEqual(["CPF LIFE is not enough", "Whole life is a waste"]);
    expect(timesThisWeek(log, "sarah chen", wed)).toBe(2);
    expect(timesThisWeek(log, "Tom", wed)).toBe(0);
    expect(timesThisWeek(log, "", wed)).toBe(0);
    expect(unlog("u1", log[0].id)).toHaveLength(2);
  });

  it("drops entries older than 8 weeks", async () => {
    const { loadLog, logComment } = await import("@/lib/engageDrafts");
    logComment("u1", "Old", "old post", new Date(2026, 6, 1));
    logComment("u1", "New", "new post", new Date(2026, 9, 7));
    expect(loadLog("u1").map((e) => e.name)).toEqual(["New"]);
  });
});
