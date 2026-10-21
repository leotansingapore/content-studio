import { beforeEach, describe, expect, it, vi } from "vitest";
import { REWRITE_LEARNINGS, dismissRewriteNudge, logRewrite, loadRewriteLog, rememberRewrite, rewriteNudge } from "@/lib/rewriteLog";
import { activeLearnings, loadLearnings, setLearningOff } from "@/lib/voiceMemory";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const store = new Map<string, string>();
const day = (d: number) => new Date(Date.UTC(2026, 9, d, 3));

beforeEach(() => {
  store.clear();
  const localStorage = {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("window", { localStorage, dispatchEvent: () => true });
});

describe("the rewrite nudge", () => {
  it("shows after the same rewrite is kept on 3 different drafts within 14 days", () => {
    logRewrite(UID, "shorter", "d1", day(1));
    logRewrite(UID, "shorter", "d2", day(5));
    expect(rewriteNudge(UID, day(5))).toBeNull();
    logRewrite(UID, "shorter", "d3", day(10));
    expect(rewriteNudge(UID, day(10))).toBe("shorter");
    expect(REWRITE_LEARNINGS.shorter.nudge).toBe("You often make posts shorter. Start them shorter?");
  });
  it("does not show for the same draft 3 times", () => {
    for (const d of [1, 2, 3]) logRewrite(UID, "casual", "d1", day(d));
    expect(rewriteNudge(UID, day(3))).toBeNull();
  });
  it("does not show over a 15-day spread", () => {
    logRewrite(UID, "simpler", "d1", day(1));
    logRewrite(UID, "simpler", "d2", day(8));
    logRewrite(UID, "simpler", "d3", day(16));
    expect(rewriteNudge(UID, day(16))).toBeNull();
  });
  it("does not show inside 30 days of No thanks, and shows again after", () => {
    for (const d of [1, 2, 3]) logRewrite(UID, "formal", `d${d}`, day(d));
    dismissRewriteNudge(UID, "formal", day(3));
    expect(rewriteNudge(UID, day(3))).toBeNull();
    for (const d of [20, 21, 22]) logRewrite(UID, "formal", `e${d}`, day(d));
    expect(rewriteNudge(UID, day(22))).toBeNull();
    const later = new Date(Date.UTC(2026, 10, 3, 3));
    for (const d of [1, 2, 3]) logRewrite(UID, "formal", `f${d}`, new Date(Date.UTC(2026, 10, d, 3)));
    expect(rewriteNudge(UID, later)).toBe("formal");
  });
  it("logs only the five rewrites, never lines or ask, and keeps the last 20", () => {
    logRewrite(UID, "lines", "d1");
    logRewrite(UID, "ask", "d1");
    logRewrite(UID, "toString", "d1");
    logRewrite(UID, "shorter", "");
    expect(store.has(`cs-rewrites-${UID}`)).toBe(false);
    expect(loadRewriteLog(UID)).toEqual([]);
    for (let i = 0; i < 25; i++) logRewrite(UID, "longer", `d${i}`, day(1));
    expect(loadRewriteLog(UID)).toHaveLength(20);
    expect(loadRewriteLog(UID)[0].draftId).toBe("d5");
  });
  it("Remember saves the posts learning from the fixed map and the nudge goes until it is kept 3 more times", () => {
    for (const d of [1, 2, 3]) logRewrite(UID, "shorter", `d${d}`, day(d));
    const saved = rememberRewrite(UID, "shorter", day(3));
    expect(saved.ok).toBe(true);
    expect(activeLearnings(loadLearnings(UID))).toEqual([
      expect.objectContaining({ text: "Write posts about a third shorter than usual.", scope: "posts", source: "rewrite", rewrite: "shorter" }),
    ]);
    expect(rewriteNudge(UID, day(3))).toBeNull();
    // kept 3 more times while the learning is on: no nudge for something already learned
    for (const d of [4, 5, 6]) logRewrite(UID, "shorter", `e${d}`, day(d));
    expect(rewriteNudge(UID, day(6))).toBeNull();
    // removed on /voice: the habit can nudge again
    setLearningOff(UID, loadLearnings(UID)[0].id, true);
    expect(rewriteNudge(UID, day(6))).toBe("shorter");
  });
  it("reads a broken log as empty", () => {
    store.set(`cs-rewrites-${UID}`, "{nope");
    store.set(`cs-rewrite-nudge-off-${UID}`, "[1]");
    expect(loadRewriteLog(UID)).toEqual([]);
    expect(rewriteNudge(UID, day(1))).toBeNull();
  });
});
