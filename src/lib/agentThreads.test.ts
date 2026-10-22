import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GONE_LINE,
  MAX_CHARS,
  MAX_MSGS,
  MAX_THREADS,
  THREADS_CHANGED,
  appendMsg,
  deleteThread,
  loadThreads,
  newMsg,
  newThread,
  patchMsg,
  renameThread,
  restoreThread,
  seedThread,
  threadsKey,
  titleOf,
  trimThreads,
  type AgentThread,
} from "@/lib/agentThreads";
import { addProfile, scoped, setActiveProfile } from "@/lib/profiles";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const store = new Map<string, string>();
const fired: string[] = [];
let full = false;
const at = (min: number) => new Date(Date.UTC(2026, 9, 22, 9, min));
const saved = <T,>(r: { ok: true; item: T } | { ok: false; error: string }): T => {
  if (r.ok === false) throw new Error(r.error);
  return r.item;
};
const start = (text: string, min = 0) => saved(newThread(UID, [newMsg("user", { text }, at(min)), newMsg("agent", { turn: "starting" }, at(min))], at(min)));

beforeEach(() => {
  store.clear();
  fired.length = 0;
  full = false;
  const localStorage = {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (full) throw new DOMException("full", "QuotaExceededError");
      store.set(k, v);
    },
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("window", { localStorage, dispatchEvent: (e: Event) => fired.push(e.type) });
});

describe("the store", () => {
  it("lives under content-studio-agent-threads- and the brand's scoped id", () => {
    expect(threadsKey(UID)).toBe(`content-studio-agent-threads-${UID}`);
    const brand = addProfile(UID, "ActivityTracker");
    setActiveProfile(UID, brand.id);
    expect(scoped(UID)).toBe(`${UID}~${brand.id}`);
    const t = start("make a carousel about CPF LIFE");
    expect(JSON.parse(store.get(`content-studio-agent-threads-${UID}~${brand.id}`)!)[0].id).toBe(t.id);
    expect(store.has(`content-studio-agent-threads-${UID}`)).toBe(false);
    expect(fired).toContain(THREADS_CHANGED);
  });

  it("reads empty on nothing or bad JSON, and skips rows that are not threads", () => {
    expect(loadThreads(UID)).toEqual([]);
    store.set(threadsKey(UID), "{nope");
    expect(loadThreads(UID)).toEqual([]);
    store.set(threadsKey(UID), JSON.stringify([{ id: "t1" }, null, { id: "t2", title: "Hi", updatedAt: "2026-10-22T09:00:00.000Z", createdAt: "", messages: [] }]));
    expect(loadThreads(UID).map((t) => t.id)).toEqual(["t2"]);
  });

  it("makes ids that are t and m and base 36, never uuid-shaped", () => {
    const t = start("what can you do");
    expect(t.id).toMatch(/^t[0-9a-z]+$/);
    expect(t.messages.map((m) => m.id)).toEqual([expect.stringMatching(/^m[0-9a-z]+$/), expect.stringMatching(/^m[0-9a-z]+$/)]);
    expect(new Set(t.messages.map((m) => m.id)).size).toBe(2);
    for (const id of [t.id, ...t.messages.map((m) => m.id)]) expect(id).not.toMatch(UUID_RE);
  });

  it("refuses with a line when storage is full and keeps what was there", () => {
    const t = start("what can you do");
    full = true;
    expect(appendMsg(UID, t.id, newMsg("user", { text: "and videos?" }))).toEqual({ ok: false, error: "Couldn't save that. Try again." });
    expect(loadThreads(UID)[0].messages).toHaveLength(2);
  });
});

describe("titles", () => {
  it("is the first message, cut to 48 characters at a word", () => {
    expect(titleOf("what can you do")).toBe("what can you do");
    const long = "make a carousel about CPF LIFE for young parents who just started working";
    expect(titleOf(long)).toBe("make a carousel about CPF LIFE for young parents");
    expect(titleOf(long).length).toBeLessThanOrEqual(48);
    expect(titleOf(`${"a".repeat(47)} bcd`)).toBe("a".repeat(47));
    expect(titleOf(`${"x".repeat(48)} more`)).toBe("x".repeat(48));
    expect(titleOf("y".repeat(80))).toBe("y".repeat(48));
    expect(titleOf("  two\n  lines  ")).toBe("two lines");
    expect(titleOf("   ")).toBe("New chat");
    expect(start(long).title).toBe("make a carousel about CPF LIFE for young parents");
  });

  it("renames without moving the chat, and refuses an empty name", () => {
    const a = start("first", 0);
    start("second", 1);
    expect(saved(renameThread(UID, a.id, "CPF LIFE carousel")).title).toBe("CPF LIFE carousel");
    expect(loadThreads(UID).map((t) => t.title)).toEqual(["second", "CPF LIFE carousel"]);
    expect(renameThread(UID, a.id, "  ")).toEqual({ ok: false, error: "Type a name first." });
  });
});

describe("messages", () => {
  it("appends and patches, moving the chat to the top, and clips text at 2,000", () => {
    const a = start("first", 0);
    const b = start("second", 1);
    const m = newMsg("agent", { text: "z".repeat(2_500) }, at(2));
    appendMsg(UID, a.id, m, at(2));
    expect(loadThreads(UID).map((t) => t.id)).toEqual([a.id, b.id]);
    expect(loadThreads(UID)[0].messages[2].text).toHaveLength(2_000);
    patchMsg(UID, b.id, b.messages[1].id, { turn: "done", meta: { steps: 2, ms: 14_200 } }, at(3));
    const top = loadThreads(UID)[0];
    expect(top.id).toBe(b.id);
    expect(top.updatedAt).toBe(at(3).toISOString());
    expect(top.messages[1]).toMatchObject({ id: b.messages[1].id, role: "agent", turn: "done", meta: { steps: 2, ms: 14_200 } });
  });

  it("refuses a message or chat that is gone", () => {
    const a = start("first");
    expect(patchMsg(UID, a.id, "mnope", { turn: "done" })).toEqual({ ok: false, error: GONE_LINE });
    expect(appendMsg(UID, "tnope", newMsg("user", { text: "hi" }))).toEqual({ ok: false, error: GONE_LINE });
  });

  it("seeds a chat that opens with the agent's words and chips", () => {
    const t = saved(seedThread(UID, "Weekly retro, 20 Oct", "Your best post was the CPF LIFE carousel.", [{ path: "/skills?run=r1", label: "Open the result" }], at(0)));
    expect(t.title).toBe("Weekly retro, 20 Oct");
    expect(t.messages).toEqual([
      { id: expect.stringMatching(/^m/), at: at(0).toISOString(), role: "agent", text: "Your best post was the CPF LIFE carousel.", go: [{ path: "/skills?run=r1", label: "Open the result" }] },
    ]);
  });
});

describe("limits", () => {
  const thread = (i: number, messages = 1, chars = 10): AgentThread => ({
    id: `t${i}`,
    title: `chat ${i}`,
    createdAt: at(i).toISOString(),
    updatedAt: at(i).toISOString(),
    messages: Array.from({ length: messages }, (_, j) => ({ id: `m${i}x${j}`, at: at(i).toISOString(), role: "user" as const, text: "w".repeat(chars) })),
  });

  it("keeps the 20 newest chats", () => {
    const kept = trimThreads(Array.from({ length: MAX_THREADS + 3 }, (_, i) => thread(i)));
    expect(MAX_THREADS).toBe(20);
    expect(kept).toHaveLength(20);
    expect(kept[0].id).toBe("t22");
    expect(kept[19].id).toBe("t3");
  });

  it("keeps the 60 newest messages of a chat", () => {
    const [t] = trimThreads([thread(1, MAX_MSGS + 5)]);
    expect(MAX_MSGS).toBe(60);
    expect(t.messages).toHaveLength(60);
    expect(t.messages[0].id).toBe("m1x5");
    expect(t.messages[59].id).toBe("m1x64");
  });

  it("drops the oldest chats until the whole list is under 300,000 characters", () => {
    const big = [thread(1, 60, 2_000), thread(2, 60, 2_000), thread(3, 60, 2_000)];
    expect(JSON.stringify(big).length).toBeGreaterThan(MAX_CHARS);
    const kept = trimThreads(big);
    expect(MAX_CHARS).toBe(300_000);
    expect(kept.map((t) => t.id)).toEqual(["t3", "t2"]);
    expect(JSON.stringify(kept).length).toBeLessThanOrEqual(MAX_CHARS);
  });

  it("applies them on every save: a 21st chat drops the oldest", () => {
    for (let i = 0; i < 21; i++) start(`chat ${i}`, i);
    const list = loadThreads(UID);
    expect(list).toHaveLength(20);
    expect(list.map((t) => t.title)).not.toContain("chat 0");
    expect(list[0].title).toBe("chat 20");
  });
});

describe("delete", () => {
  it("writes the list without the chat, and Undo puts it back in its place", () => {
    const a = start("first", 0);
    const b = start("second", 1);
    const c = start("third", 2);
    const gone = deleteThread(UID, b.id);
    expect(gone?.id).toBe(b.id);
    expect(JSON.parse(store.get(threadsKey(UID))!).map((t: AgentThread) => t.id)).toEqual([c.id, a.id]);
    expect(deleteThread(UID, b.id)).toBeNull();
    expect(saved(restoreThread(UID, gone!)).id).toBe(b.id);
    expect(loadThreads(UID).map((t) => t.id)).toEqual([c.id, b.id, a.id]);
  });
});
