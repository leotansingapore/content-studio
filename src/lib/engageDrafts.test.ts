import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { followUpDates, followUpTitle, loadLog, loadRun, logComment, MAX_ITEMS, MAX_POSTS, requestBody, runningJob, saveRun, splitPasted, startRun, thisWeek, timesThisWeek, unlog } from "@/lib/engageDrafts";

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
    expect(splitPasted("Sarah Chen: Mine went up too.\nHow do I check?\n\n  \n@Tom: So true!\n\nGreat post")).toEqual([
      { name: "Sarah Chen", text: "Mine went up too.\nHow do I check?" },
      { name: "Tom", text: "So true!" },
      { name: "", text: "Great post" },
    ]);
    expect(splitPasted("陈先生: 你好，可以聊聊吗？")).toEqual([{ name: "陈先生", text: "你好，可以聊聊吗？" }]);
  });

  it("takes each line as a comment when there are no blank lines, and leaves odd colons in the text", async () => {
    expect(splitPasted("one\ntwo\r\nthree").map((c) => c.text)).toEqual(["one", "two", "three"]);
    expect(splitPasted("the thing is: nobody reads it")).toEqual([{ name: "", text: "the thing is: nobody reads it" }]);
    expect(splitPasted("My friend from school said: read it")).toEqual([{ name: "", text: "My friend from school said: read it" }]);
    expect(splitPasted("   ")).toEqual([]);
  });
});

describe("runs", () => {
  it("keeps the last run on this device only, per profile", async () => {
    expect(loadRun("replies", "u1")).toEqual({ post: "", pasted: "", posts: [], form: {}, items: [], at: "" });
    saveRun("replies", "u1", { post: "p", pasted: "c", posts: [], form: {}, items: [], at: "t" });
    expect([...store.keys()]).toEqual(["cs-engage-replies-u1"]);
    expect(loadRun("replies", "u1")).toMatchObject({ post: "p", pasted: "c", at: "t" });
    expect(loadRun("replies", null)).toMatchObject({ pasted: "" });
  });

  it("saves the drafts when they come back, with the page gone, and sends at most MAX_ITEMS comments", async () => {
    const items = [{ i: 0, name: "", text: "Nice", kind: "support", reply: "Thanks." }];
    let finish: (v: unknown) => void = () => {};
    invoke.mockReturnValue(new Promise((r) => (finish = r)));
    saveRun("replies", "u1", { post: "My post", pasted: "x", posts: [], form: {}, items: [], at: "" });
    const pasted = Array.from({ length: MAX_ITEMS + 5 }, (_, i) => `c${i}`).join("\n");
    const job = startRun("replies", "u1", { post: "My post", pasted, posts: [], form: {} });
    expect(runningJob("replies", "u1")).toBe(job);
    expect(invoke.mock.calls[0][1].body).toMatchObject({ mode: "replies", post: "My post" });
    expect(invoke.mock.calls[0][1].body.comments).toHaveLength(MAX_ITEMS);
    finish({ data: { items }, error: null });
    expect(await job).toEqual({ kind: "ok" });
    expect(runningJob("replies", "u1")).toBeUndefined();
    expect(loadRun("replies", "u1")).toMatchObject({ post: "My post", items });
  });

  it("sends DMs as messages and keeps their run apart from the replies", async () => {
    invoke.mockResolvedValue({ data: { items: [{ i: 0 }] }, error: null });
    expect(await startRun("dms", "u1", { post: "", pasted: "Karen: Hi\n\nTom: Yo", posts: [], form: {} })).toEqual({ kind: "ok" });
    expect(invoke.mock.calls[0][1].body).toEqual({ mode: "dms", messages: [{ name: "Karen", text: "Hi" }, { name: "Tom", text: "Yo" }] });
    expect(loadRun("dms", "u1").items).toEqual([{ i: 0 }]);
    expect(loadRun("replies", "u1").items).toEqual([]);
  });

  it("says when the daily limit is reached", async () => {
    const context = { status: 429, json: async () => ({ code: "daily_limit", error: "You've used all 30 for today." }) };
    invoke.mockResolvedValue({ data: null, error: { context } });
    expect(await startRun("replies", "u1", { post: "", pasted: "Nice", posts: [], form: {} })).toEqual({ kind: "limit", message: "You've used all 30 for today." });
  });
});

describe("comments on other people's posts", () => {
  it("sends the filled post slots, up to MAX_POSTS", async () => {
    const posts = [{ name: "Sarah", text: "A post" }, { name: "Tom", text: "  " }, ...Array.from({ length: MAX_POSTS + 2 }, (_, i) => ({ name: "", text: `p${i}` }))];
    const body = requestBody("comments", { post: "", pasted: "ignored", posts, form: {} });
    expect(body).toMatchObject({ mode: "comments" });
    expect((body as { posts: unknown[] }).posts).toHaveLength(MAX_POSTS);
    expect((body as { posts: unknown[] }).posts[0]).toEqual({ name: "Sarah", text: "A post" });
    expect((body as { posts: { text: string }[] }).posts.map((p) => p.text)).not.toContain("  ");
  });

  it("logs a copied comment once per post a day, synced per profile, and counts this week by name", async () => {
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
    logComment("u1", "Old", "old post", new Date(2026, 6, 1));
    logComment("u1", "New", "new post", new Date(2026, 9, 7));
    expect(loadLog("u1").map((e) => e.name)).toEqual(["New"]);
  });
});

describe("connection notes", () => {
  it("sends the named fields and keeps the drafts as the run's one item", async () => {
    const drafts = { note: "n", first: "f", follow4: "a", follow10: "b" };
    invoke.mockResolvedValue({ data: { drafts }, error: null });
    const form = { name: "Sarah", about: "Teacher", reason: "Her post", goal: "recruit", accepted: "2026-10-08" };
    expect(await startRun("connect", "u1", { post: "", pasted: "", posts: [], form })).toEqual({ kind: "ok" });
    expect(invoke.mock.calls[0][1].body).toEqual({ mode: "connect", name: "Sarah", about: "Teacher", reason: "Her post", goal: "recruit" });
    expect(loadRun("connect", "u1").items).toEqual([drafts]);
    invoke.mockResolvedValue({ data: { items: [] }, error: null });
    expect(await startRun("connect", "u1", { post: "", pasted: "", posts: [], form })).toMatchObject({ kind: "error" });
  });

  it("times the first message a day after they accept and the follow-ups 4 and 10 days after it", async () => {
    expect(followUpDates("2026-10-30")).toEqual({ first: "2026-10-31", day4: "2026-11-04", day10: "2026-11-10" });
    expect(followUpTitle(" Sarah Chen ", 2)).toBe("Follow up with Sarah Chen (2 of 2)");
  });
});
