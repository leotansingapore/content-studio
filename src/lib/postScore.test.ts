import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
});
afterEach(() => vi.unstubAllGlobals());

describe("post score cache", () => {
  it("fingerprints the platform and the exact text, ignoring outer whitespace", async () => {
    const { textKey } = await import("@/lib/postScore");
    expect(textKey("instagram", "  Hello there  ")).toBe(textKey("instagram", "Hello there"));
    expect(textKey("instagram", "Hello there")).not.toBe(textKey("linkedin", "Hello there"));
    expect(textKey("instagram", "Hello there")).not.toBe(textKey("instagram", "Hello there!"));
  });

  it("keeps scores on this device only, newest 40", async () => {
    const { loadScores, saveScore } = await import("@/lib/postScore");
    for (let i = 0; i < 45; i++) saveScore("u1", `k${i}`, { score: i / 10, down: [] }, 1000 + i);
    const kept = loadScores("u1");
    expect(Object.keys(kept)).toHaveLength(40);
    expect(kept.k44).toMatchObject({ score: 4.4 });
    expect(kept.k0).toBeUndefined();
    expect([...store.keys()]).toEqual(["cs-postscore-u1"]);
    expect(loadScores(null)).toEqual({});
  });
});
