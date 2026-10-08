import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let map: Map<string, string>;
beforeEach(() => {
  map = new Map();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) } });
});
afterEach(() => vi.unstubAllGlobals());

describe("mentions", () => {
  it("keeps up to five tidy keywords per profile in a synced key", async () => {
    const { saveWatch, loadWatch } = await import("@/lib/mentions");
    saveWatch("u1", [" Leo  Tan ", "Leo Tan", "x", "CPF", "a1", "a2", "a3", "a4"]);
    expect(loadWatch("u1")).toEqual(["Leo Tan", "CPF", "a1", "a2", "a3"]);
    expect([...map.keys()]).toEqual(["content-studio-mentions-u1"]);
  });

  it("counts results this device hasn't shown yet, once each", async () => {
    const { markSeen, loadSeen, countNew } = await import("@/lib/mentions");
    markSeen("u1", ["https://a.sg/1"]);
    const r = [
      { keyword: "A", items: [{ url: "https://a.sg/1" }, { url: "https://a.sg/2" }] },
      { keyword: "B", items: [{ url: "https://a.sg/2" }, { url: "https://a.sg/3" }] },
    ] as never;
    expect(countNew(r, loadSeen("u1"))).toBe(2);
    expect(map.has("cs-mentions-seen-u1")).toBe(true);
  });
});
