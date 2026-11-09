import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({ body: null as unknown, hooks: [] as { text: string; format: string }[] }));
vi.mock("@/lib/edgeFn", () => ({ callFn: async (_name: string, body: unknown) => ((sent.body = body), { hooks: sent.hooks }) }));

import { addOwn, bringBack, keepHook, keptHooks, KEEP_NO, loadDesk, saveDesk, splitOwn, turnDown, writeHooks } from "./hookWriter";
import { MAX_PER_KIND, saveSnippet } from "./replySnippets";
import { addFact } from "./voiceMemory";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const mem = () => {
  const m = new Map<string, string>();
  return { get length() { return m.size; }, key: (i: number) => [...m.keys()][i] ?? null, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() };
};
beforeEach(() => {
  const s = mem();
  vi.stubGlobal("window", { localStorage: s, location: { pathname: "/hooks", search: "", hash: "" }, history: { state: null, replaceState: () => undefined }, dispatchEvent: () => true });
  vi.stubGlobal("localStorage", s);
  sent.body = null;
});
afterEach(() => vi.unstubAllGlobals());

const batch = (...texts: string[]) => texts.map((text) => ({ text, format: "pov" }));

describe("a batch", () => {
  it("lands on top of the hooks still unanswered, and is kept for the brand", async () => {
    sent.hooks = batch("first hook of batch one", "second hook of batch one");
    await writeHooks(UID, "busy weeks", 5, null);
    sent.hooks = batch("first hook of batch two");
    const d = await writeHooks(UID, "busy mornings", 5, "pov");
    expect(d.topic).toBe("busy mornings");
    expect(d.fresh.map((h) => h.text)).toEqual(["first hook of batch two", "first hook of batch one", "second hook of batch one"]);
    expect(loadDesk(UID)).toEqual(d);
  });

  it("sends the brand's facts, the kept hooks and the turned-down ones", async () => {
    addFact(UID, "Tidy is free to download on the App Store");
    saveSnippet(UID, { name: "", text: "POV: Monday ate your plan again", kind: "hook" });
    saveDesk(UID, { topic: "", fresh: [], no: ["Plan better today"] });
    sent.hooks = batch("a new hook here");
    await writeHooks(UID, "busy weeks", 10, null);
    expect(sent.body).toMatchObject({ topic: "busy weeks", n: 10, format: null, facts: "Tidy is free to download on the App Store", kept: ["POV: Monday ate your plan again"], rejected: ["Plan better today"] });
  });
});

describe("Keep and Not this", () => {
  beforeEach(() => saveDesk(UID, { topic: "t", fresh: [{ id: "a", text: "hook a is good", format: "pov" }, { id: "b", text: "hook b is meh", format: "other" }, { id: "c", text: "hook c is meh", format: "other" }], no: [] }));

  it("Keep makes it one of My hooks and takes it out of the batch", () => {
    expect(keepHook(UID, "a")).toBeNull();
    expect(keptHooks(UID).map((s) => s.text)).toEqual(["hook a is good"]);
    expect(loadDesk(UID).fresh.map((h) => h.id)).toEqual(["b", "c"]);
  });

  it("Not this takes them out and remembers them for the next batch", () => {
    turnDown(UID, ["b", "c"]);
    expect(loadDesk(UID)).toMatchObject({ fresh: [{ id: "a" }], no: ["hook b is meh", "hook c is meh"] });
  });

  it("Undo of Not this puts the hooks back on top and stops them steering the next batch", () => {
    saveDesk(UID, { ...loadDesk(UID), no: ["an older no"] });
    const gone = turnDown(UID, ["b", "c"]);
    expect(gone.map((h) => h.id)).toEqual(["b", "c"]);
    bringBack(UID, gone);
    expect(loadDesk(UID)).toMatchObject({ fresh: [{ id: "b" }, { id: "c" }, { id: "a" }], no: ["an older no"] });
    bringBack(UID, gone);
    expect(loadDesk(UID).fresh).toHaveLength(3);
  });

  it("a full list says so and leaves the hook in the batch", () => {
    for (let i = 0; i < MAX_PER_KIND; i++) saveSnippet(UID, { name: "", text: `kept hook number ${i}`, kind: "hook" });
    expect(keepHook(UID, "a")).toBe("full");
    expect(loadDesk(UID).fresh).toHaveLength(3);
  });

  it("remembers only the newest turned-down hooks", () => {
    saveDesk(UID, { topic: "", fresh: [], no: Array.from({ length: KEEP_NO + 5 }, (_, i) => `no ${i}`) });
    expect(loadDesk(UID).no).toHaveLength(KEEP_NO);
    expect(loadDesk(UID).no[0]).toBe("no 5");
  });
});

describe("your own hooks", () => {
  it("splits on blank lines and keeps a line break inside a hook", () => {
    expect(splitOwn("3 years of this\nand i only just found out\n\n  POV: you  \n\n\n")).toEqual(["3 years of this\nand i only just found out", "POV: you"]);
  });
  it("adds each once and stops at the limit", () => {
    expect(addOwn(UID, "one hook\n\none hook\n\ntwo hook")).toEqual({ added: 2, full: false });
    for (let i = 0; i < MAX_PER_KIND; i++) saveSnippet(UID, { name: "", text: `filler ${i}`, kind: "hook" });
    expect(addOwn(UID, "three hook")).toEqual({ added: 0, full: true });
  });
});
