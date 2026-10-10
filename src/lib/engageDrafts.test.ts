import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addTopic, followUpDates, followUpTitle, loadGoal, loadLog, loadTopics, MAX_TOPICS, removeTopic, loadRun, logComment, MAX_ITEMS, MAX_POSTS, MAX_THREAD, requestBody, runningJob, saveGoal, saveRun, splitPasted, startRun, thisWeek, threadLines, timesThisWeek, toggleMine, unlog } from "@/lib/engageDrafts";

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

  it("leaves a time or a link in the comment instead of reading what comes before it as a name", () => {
    expect(splitPasted("Free at 3:30 tomorrow?")).toEqual([{ name: "", text: "Free at 3:30 tomorrow?" }]);
    expect(splitPasted("Read this https://jane.sg/guide")).toEqual([{ name: "", text: "Read this https://jane.sg/guide" }]);
    expect(splitPasted("Tom: 3 things I wish I knew")).toEqual([{ name: "Tom", text: "3 things I wish I knew" }]);
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
    expect(invoke.mock.calls[0][1].body).toEqual({ mode: "dms", messages: [{ name: "Karen", text: "Hi" }, { name: "Tom", text: "Yo" }], goal: "call", topics: [] });
    expect(loadRun("dms", "u1").items).toEqual([{ i: 0 }]);
    expect(loadRun("replies", "u1").items).toEqual([]);
  });

  it("says when the daily limit is reached", async () => {
    const context = { status: 429, json: async () => ({ code: "daily_limit", error: "You've used all 30 for today." }) };
    invoke.mockResolvedValue({ data: null, error: { context } });
    expect(await startRun("replies", "u1", { post: "", pasted: "Nice", posts: [], form: {} })).toEqual({ kind: "limit", message: "You've used all 30 for today." });
  });
});

describe("a DM conversation", () => {
  const pasted = "Karen Tan: Hi, saw your post\nLeo: Thanks Karen, what made you look?\nKaren Tan: My dad's premium jumped\nIs the rider worth it?";

  it("marks only the lines the consultant marked as theirs, and one tap marks every line with that name", () => {
    const lines = threadLines(pasted);
    expect(lines.map((l) => l.me)).toEqual([false, false, false, false]);
    expect(toggleMine(lines, 1)).toBe("1");
    expect(threadLines(pasted, "1").map((l) => l.me)).toEqual([false, true, false, false]);
    expect(toggleMine(lines, 3)).toBe("3"); // no name: only that line
    expect(toggleMine(lines, 0)).toBe("0,2"); // "Karen Tan" twice
    expect(toggleMine(threadLines(pasted, "0,2"), 2)).toBe("");
  });

  it("sends the last MAX_THREAD lines with their sides and the goal last picked on this profile", async () => {
    invoke.mockResolvedValue({ data: { items: [{ i: 0, reply: "r" }] }, error: null });
    const long = Array.from({ length: MAX_THREAD + 2 }, (_, i) => `m${i}`).join("\n");
    expect(await startRun("thread", "u1", { post: "", pasted: long, posts: [], form: { mine: "11,10" } })).toEqual({ kind: "ok" });
    const body = invoke.mock.calls[0][1].body;
    expect(body.mode).toBe("thread");
    expect(body.goal).toBe("call");
    expect(body.lines).toHaveLength(MAX_THREAD);
    expect(body.lines[0]).toEqual({ name: "", text: "m2", me: false });
    expect(body.lines.at(-1)).toEqual({ name: "", text: "m11", me: true });
    expect(loadRun("thread", "u1").items).toEqual([{ i: 0, reply: "r" }]);
    expect(loadRun("dms", "u1").items).toEqual([]);
    saveGoal("u1", "guide");
    await startRun("thread", "u1", { post: "", pasted, posts: [], form: {} });
    expect(invoke.mock.calls[1][1].body.goal).toBe("guide");
    await startRun("dms", "u1", { post: "", pasted, posts: [], form: {} });
    expect(invoke.mock.calls[2][1].body.goal).toBe("guide");
  });

  it("remembers the goal per profile, synced, and falls back to a call", () => {
    expect(loadGoal("u1")).toBe("call");
    saveGoal("u1", "rapport");
    expect(store.get("content-studio-dmgoal-u1")).toBe('"rapport"');
    expect(loadGoal("u1")).toBe("rapport");
    expect(loadGoal("u2")).toBe("call");
    expect(loadGoal(null)).toBe("call");
    store.set("content-studio-dmgoal-u1", '"sell"');
    expect(loadGoal("u1")).toBe("call");
  });
});

describe("topics you handle yourself", () => {
  it("keeps your own topics per profile, synced, once each, up to MAX_TOPICS", () => {
    expect(loadTopics("u1")).toEqual([]);
    addTopic("u1", "  Divorce   cases ");
    addTopic("u1", "divorce CASES");
    addTopic("u1", "   ");
    expect(store.get("content-studio-escalate-u1")).toBe('["Divorce cases"]');
    for (let i = 0; i < MAX_TOPICS + 2; i++) addTopic("u1", `t${i}`);
    expect(JSON.parse(store.get("content-studio-escalate-u1")!)).toHaveLength(MAX_TOPICS);
    expect(removeTopic("u1", "Divorce cases")).not.toContain("Divorce cases");
    expect(loadTopics("u2")).toEqual([]);
    store.set("content-studio-escalate-u2", '{"bad":1}');
    expect(loadTopics("u2")).toEqual([]);
  });

  it("sends them with comments, DMs and a conversation, never with the other tools", async () => {
    addTopic("u1", "divorce");
    invoke.mockResolvedValue({ data: { items: [] }, error: null });
    for (const tool of ["replies", "dms", "thread"] as const) await startRun(tool, "u1", { post: "", pasted: "Karen: Hi", posts: [], form: {} });
    expect(invoke.mock.calls.map((c) => c[1].body.topics)).toEqual([["divorce"], ["divorce"], ["divorce"]]);
    expect(requestBody("comments", { post: "", pasted: "", posts: [{ name: "", text: "p" }], form: {} }, { topics: ["divorce"] })).not.toHaveProperty("topics");
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
