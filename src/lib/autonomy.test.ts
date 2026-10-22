import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTONOMY_CHANGED, AUTO_ACT_MIN, AUTO_PICK_MIN, MAX_SHADOW, SHADOW_CHANGED, loadAutonomy, loadShadow, recordShadow, saveAutonomy } from "@/lib/autonomy";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const store = new Map<string, string>();
const fired: string[] = [];
let full = false;

beforeEach(() => {
  store.clear();
  fired.length = 0;
  full = false;
  const localStorage = {
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

describe("the move switch", () => {
  it("reads ask when nothing, bad JSON or anything but auto is saved", () => {
    expect(loadAutonomy(UID)).toEqual({ changes: "ask" });
    store.set(`content-studio-autonomy-${UID}`, "{not json");
    expect(loadAutonomy(UID)).toEqual({ changes: "ask" });
    store.set(`content-studio-autonomy-${UID}`, JSON.stringify({ changes: "always" }));
    expect(loadAutonomy(UID)).toEqual({ changes: "ask" });
  });

  it("saves per account, says it changed, and refuses with a line when storage is full", () => {
    expect(saveAutonomy(UID, { changes: "auto" })).toBeNull();
    expect(JSON.parse(store.get(`content-studio-autonomy-${UID}`)!)).toEqual({ changes: "auto" });
    expect(loadAutonomy(UID)).toEqual({ changes: "auto" });
    expect(fired).toEqual([AUTONOMY_CHANGED]);
    full = true;
    expect(saveAutonomy(UID, { changes: "ask" })).toBe("Couldn't save that. Try again.");
    expect(loadAutonomy(UID)).toEqual({ changes: "auto" });
  });

  it("keeps the proposed thresholds", () => {
    expect([AUTO_ACT_MIN, AUTO_PICK_MIN]).toEqual([0.85, 0.8]);
  });
});

describe("the shadow log", () => {
  const entry = (i: number) => ({ at: new Date(Date.UTC(2026, 9, 22, 9, i)).toISOString(), act: "move", p: { act: 0.9, post: 0.8, day: null }, confirmed: i % 2 === 0 });

  it("is empty on nothing or bad JSON, and keeps the newest first", () => {
    expect(loadShadow(UID)).toEqual([]);
    store.set(`content-studio-agentshadow-${UID}`, "[oops");
    expect(loadShadow(UID)).toEqual([]);
    recordShadow(UID, entry(1));
    recordShadow(UID, entry(2));
    expect(loadShadow(UID).map((s) => s.at)).toEqual([entry(2).at, entry(1).at]);
    expect(loadShadow(UID)[0]).toEqual(entry(2));
    expect(fired).toEqual([SHADOW_CHANGED, SHADOW_CHANGED]);
  });

  it("keeps the newest 200 and drops the oldest", () => {
    for (let i = 0; i < MAX_SHADOW + 5; i++) recordShadow(UID, entry(i));
    const rows = loadShadow(UID);
    expect(MAX_SHADOW).toBe(200);
    expect(rows).toHaveLength(200);
    expect(rows[0].at).toBe(entry(MAX_SHADOW + 4).at);
    expect(rows[199].at).toBe(entry(5).at);
  });

  it("keeps only numbers and nulls in p", () => {
    recordShadow(UID, { at: entry(0).at, act: "move", p: { act: 0.9, post: "x" as unknown as number, day: null, time: Number.NaN }, confirmed: true });
    expect(loadShadow(UID)[0].p).toEqual({ act: 0.9, day: null });
  });
});
