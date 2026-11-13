import { afterEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const listeners = new Map<string, () => void>();
vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; } });
vi.stubGlobal("window", { dispatchEvent: (e: Event) => (listeners.get(e.type)?.(), true), addEventListener: (t: string, f: () => void) => void listeners.set(t, f), removeEventListener() {} });
vi.mock("@/lib/supabase", () => ({ supabase: {}, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" }));

const { itemKey, jobKindOf, noteAddress, savedItem, stopWatching, watchMade } = await import("./makeMade");
const { loadThreads, newThread, newMsg } = await import("./agentThreads");
const { logActivity, setActivityOn } = await import("./activity");

const U = "6d80f027-3395-480c-86a1-8827d3d6cce3";
afterEach(() => {
  store.clear();
  stopWatching();
});

describe("a Made line for a maker beside the chat", () => {
  it("reads a saved item from an address, once it wasn't there on opening", () => {
    expect(itemKey("/generate?pillar=topic&draft=d1")).toBe("draft=d1");
    expect(itemKey("/edit?panel=ai")).toBeNull();
    expect(savedItem("/generate/answer?q=x", "/generate/answer?q=x&draft=d2")).toBe("draft=d2");
    expect(savedItem("/generate?draft=d1", "/generate?draft=d1&step=format")).toBeNull();
    expect(jobKindOf("Video", "/edit?p=v1")).toBe("video");
    expect(jobKindOf("Static ads", "/media?folder=AI")).toBe("image");
    expect(jobKindOf("Words", "/generate?draft=d1")).toBe("remix");
  });

  it("lands the maker's save in the thread once, and a job you ran from Activity's log", () => {
    const t = newThread(U, [newMsg("user", { text: "Answer a question: Is an ILP worth it" })]);
    if (!t.ok) throw new Error("no thread");
    watchMade(U, t.item.id, { name: "Answer a question", kind: "Words" });
    noteAddress(U, "/generate/answer?q=x", "/generate/answer?q=x&draft=d9");
    noteAddress(U, "/generate/answer?q=x", "/generate/answer?q=x&draft=d9&step=2");
    const made = () => loadThreads(U)[0].messages.filter((m) => m.job);
    expect(made()).toHaveLength(1);
    expect(made()[0].job).toMatchObject({ kind: "remix", state: "done", open: "/generate/answer?q=x&draft=d9", title: "Answer a question", drafts: ["d9"] });
    // the agent's own makes are its cards' to show; yours land
    setActivityOn(true);
    logActivity(U, { who: "agent", kind: "make", title: "Made a picture", link: "/media?folder=AI%20images" });
    logActivity(U, { who: "you", kind: "make", title: "Made a slideshow", link: "/slideshow?s=ss1" });
    expect(made().map((m) => m.job?.open)).toEqual(["/generate/answer?q=x&draft=d9", "/slideshow?s=ss1"]);
    expect(made()[1].job?.title).toBe("Slideshow");
  });
});
