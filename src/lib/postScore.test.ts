import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftEntry } from "@/lib/draftHistory";

const fn = vi.hoisted(() => ({ calls: [] as [string, unknown][] }));
vi.mock("@/lib/edgeFn", () => ({
  callFn: async (name: string, body: unknown) => {
    fn.calls.push([name, body]);
    return { score: 7.1, down: ["cta"] };
  },
}));

import { carouselScoreText, currentScore, loadScores, saveScore, scorePost, scoreVsResults, textKey, tipFor } from "@/lib/postScore";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  fn.calls.length = 0;
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } });
});
afterEach(() => vi.unstubAllGlobals());

describe("post score cache", () => {
  it("fingerprints the platform and the exact text, ignoring outer whitespace", async () => {
    expect(textKey("instagram", "  Hello there  ")).toBe(textKey("instagram", "Hello there"));
    expect(textKey("instagram", "Hello there")).not.toBe(textKey("linkedin", "Hello there"));
    expect(textKey("instagram", "Hello there")).not.toBe(textKey("instagram", "Hello there!"));
  });

  it("keeps scores on this device only, newest 40", async () => {
    for (let i = 0; i < 45; i++) saveScore("u1", `k${i}`, { score: i / 10, down: [] }, 1000 + i);
    const kept = loadScores("u1");
    expect(Object.keys(kept)).toHaveLength(40);
    expect(kept.k44).toMatchObject({ score: 4.4 });
    expect(kept.k0).toBeUndefined();
    expect([...store.keys()]).toEqual(["cs-postscore-u1"]);
    expect(loadScores(null)).toEqual({});
  });
});

describe("scorePost", () => {
  it("sends today's body when no format is given, and the format only when it is", async () => {
    await scorePost("text", "linkedin");
    await scorePost("text", "instagram", "carousel");
    expect(fn.calls).toEqual([
      ["post-score", { text: "text", platform: "linkedin" }],
      ["post-score", { text: "text", platform: "instagram", format: "carousel" }],
    ]);
    expect(tipFor("cta", "short-video")).toBe("End with one clear ask, said out loud and in the caption.");
  });
});

describe("carouselScoreText", () => {
  const slides = [
    { title: "3 things to check on your hospital plan", body: "" },
    { title: "Ward class", body: "Pick the ward\nyou would stay in." },
    { title: "", body: "" },
    { title: "Found this useful?", body: "Save it." },
  ];

  it("writes a Slide N line per slide with text, then the caption", () => {
    expect(carouselScoreText(slides, "  Which one did you miss?  ")).toBe(
      "Slide 1: 3 things to check on your hospital plan\nSlide 2: Ward class. Pick the ward you would stay in.\nSlide 3: Found this useful? Save it.\n\nCaption: Which one did you miss?",
    );
  });

  it("writes no caption line when there is none", () => {
    expect(carouselScoreText(slides)).not.toContain("Caption");
    expect(carouselScoreText(slides, "  ")).toBe(carouselScoreText(slides));
  });
});

const day = (n: number) => new Date(Date.UTC(2026, 9, n, 1)).toISOString();
const entry = (id: string, over: Partial<DraftEntry> & { score?: unknown } = {}): DraftEntry & { score?: unknown } => ({
  id,
  createdAt: day(1),
  hook: "Hook",
  draft: `Post ${id}: three things to check on your hospital plan before you renew it.`,
  pillar: "educate",
  pillarDetail: "",
  audience: "parents",
  format: "text-post",
  platform: "linkedin",
  ctaType: "comment",
  ...over,
});
const scored = (d: DraftEntry & { score?: unknown }, v: number, down: string[] = []) => ({ ...d, score: { v, down, key: textKey(d.platform, d.draft), at: day(2) } });

describe("currentScore", () => {
  const d = scored(entry("d1"), 7.8, ["hook", "cta"]);

  it("returns the score while the key matches the text, and null once the text changes", () => {
    expect(currentScore(d)).toEqual({ v: 7.8, down: ["hook", "cta"], key: textKey("linkedin", d.draft), at: day(2) });
    expect(currentScore({ ...d, draft: `${d.draft} Edited.` })).toBeNull();
    expect(currentScore({ ...d, platform: "instagram" })).toBeNull();
  });

  it("reads a carousel's score against the text it was scored on", () => {
    const text = carouselScoreText([{ title: "Cover", body: "Point" }]);
    const c = { platform: "instagram", score: { v: 6, down: [], key: textKey("instagram", text), at: day(2) } };
    expect(currentScore(c, text)).toMatchObject({ v: 6 });
    expect(currentScore(c)).toBeNull();
  });

  it("is null for a v over 10, an unknown factor id, more than 3 factors, a long key, and an older draft with no score", () => {
    expect(currentScore({ ...d, score: { ...d.score, v: 10.5 } })).toBeNull();
    expect(currentScore({ ...d, score: { ...d.score, v: -1 } })).toBeNull();
    expect(currentScore({ ...d, score: { ...d.score, v: "7" } })).toBeNull();
    expect(currentScore({ ...d, score: { ...d.score, down: ["hook", "vibes"] } })).toBeNull();
    expect(currentScore({ ...d, score: { ...d.score, down: ["hook", "cta", "oneIdea", "readable"] } })).toBeNull();
    expect(currentScore({ ...d, score: { ...d.score, key: "x".repeat(40) } })).toBeNull();
    expect(currentScore({ ...d, score: { ...d.score, at: undefined } })).toBeNull();
    expect(currentScore(entry("d2"))).toBeNull();
    expect(currentScore({ ...d, score: "7.8" })).toBeNull();
  });
});

describe("scoreVsResults", () => {
  // ten posted posts, scores 1 to 10, the top five at 6% engagement and the bottom five at 3%
  const posted = (i: number, rate: number, over: Partial<DraftEntry> = {}) =>
    scored(entry(`p${i}`, { status: "posted", postedAt: day(i + 1), metrics: { impressions: 1000, reactions: rate * 10, comments: 0, shares: 0 }, ...over }), i);
  const ten = Array.from({ length: 10 }, (_, k) => posted(k + 1, k >= 5 ? 6 : 3));

  it("is null under 10 posts", () => {
    expect(scoreVsResults(ten.slice(0, 9))).toBeNull();
    expect(scoreVsResults([])).toBeNull();
  });

  it("splits at the median score: the higher half's mean rate over the lower half's", () => {
    expect(scoreVsResults(ten)).toEqual({ n: 10, ratio: 2 });
    expect(scoreVsResults([...ten].reverse())).toEqual({ n: 10, ratio: 2 });
    // an odd count leaves the middle post out of both halves
    expect(scoreVsResults([...ten, posted(5.5, 100)])).toEqual({ n: 11, ratio: 2 });
  });

  it("leaves out stale scores, posts with no impressions and drafts not posted", () => {
    const stale = { ...posted(11, 50), draft: "Changed after scoring, so the score no longer counts." };
    const unseen = posted(12, 50, { metrics: { reactions: 40 } });
    const draft = posted(13, 50, { status: "draft" });
    expect(scoreVsResults([...ten, stale, unseen, draft])).toEqual({ n: 10, ratio: 2 });
    expect(scoreVsResults([...ten.slice(0, 9), stale])).toBeNull();
  });

  it("uses the real numbers pulled for a post over its typed ones", () => {
    const real = ten.map((d, k) => (k < 5 ? { ...d, zernio: { key: "z", numbers: { impressions: 1000, reach: 0, views: 0, likes: 60, comments: 0, shares: 0, saves: 0, at: day(20) } } } : d));
    expect(scoreVsResults(real)).toEqual({ n: 10, ratio: 1 });
  });

  it("gives no ratio when the lower half had no engagement", () => {
    expect(scoreVsResults(ten.map((d, k) => (k < 5 ? { ...d, metrics: { impressions: 1000, reactions: 0 } } : d)))).toEqual({ n: 10, ratio: null });
  });
});
