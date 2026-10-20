import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeError } from "@/lib/edgeFn";
import type { FollowedAccount, TrackedPost } from "@/lib/following";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));
vi.mock("@/lib/competitors", () => ({
  brandFacts: () => ({ name: "ActivityTracker", site: "activity-tracker.io", sells: "A sales activity tracker", serves: "Self-employed salespeople", topics: ["Follow-ups"] }),
}));
vi.mock("@/lib/reelClone", () => ({ voiceForClone: () => ({ summary: "Plain and direct", samples: [] }), winnersFor: () => [] }));
vi.mock("@/lib/voiceProfile", () => ({ loadVoiceProfile: () => null }));

const p = await import("./patterns");

class MemStorage {
  s = new Map<string, string>();
  full = Infinity;
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, val: string) {
    if (val.length > this.full) throw new DOMException("full", "QuotaExceededError");
    this.s.set(k, val);
  }
  removeItem(k: string) { this.s.delete(k); }
}
let storage: MemStorage;
const changed = vi.fn();

beforeEach(() => {
  storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("dispatchEvent", (e: Event) => changed(e.type));
  callFn.mockReset();
  changed.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

// counted from today, so the 48-hour line never rots
const NOW = Date.now();
const DAY = 86_400_000;
/** k days old; views null makes it a photo scored on likes plus comments. */
const post = (id: string, days: number, views: number | null, likes = 10, comments = 0): TrackedPost => ({
  id, url: `https://www.instagram.com/p/${id}/`, format: views === null ? "image" : "video", caption: `Caption ${id}`,
  postedAt: new Date(NOW - days * DAY).toISOString(), views, likes, comments,
});
const account = (posts: TrackedPost[], checkedAt = "2026-10-19T00:00:00.000Z"): FollowedAccount => ({
  platform: "instagram", handle: "mrbrown", addedAt: "2026-10-01T00:00:00Z", history: [], posts, seen: [], fresh: [], checkedAt,
});
const entry = (o: Partial<import("./patterns").PatternEntry> = {}) => ({
  checkedAt: "2026-10-19T00:00:00.000Z", ranAt: "2026-10-19T01:00:00.000Z", tags: {}, patterns: [], ideas: [], from: "best" as const, best: [], ...o,
});

describe("which posts go", () => {
  it("scores views when a post has them and likes plus comments when it doesn't, best first", () => {
    const videos = Array.from({ length: 6 }, (_, k) => post(`v${k}`, k + 3, k === 0 ? 5000 : 1000));
    const photos = Array.from({ length: 6 }, (_, k) => post(`i${k}`, k + 3, null, k === 0 ? 60 : 20, k === 0 ? 0 : 5));
    const { scored, best } = p.scoredPosts(account([...videos, ...photos]), NOW);
    expect(scored).toHaveLength(12);
    expect(best.map((s) => s.post.id)).toEqual(["v0", "i0"]);
    expect(best.map((s) => s.outlier.ratio)).toEqual([5, 2.4]);
    expect(best[0].outlier.basis).toBe("views");
    expect(best[1].outlier.basis).toBe("interactions");
  });

  it("leaves posts under 48 hours out, and puts only the top 3 at 1.5x or more in best", () => {
    const posts = [
      post("young", 1, 90_000),
      ...[3, 2.5, 2, 1.6, 1.4].map((r, k) => post(`b${k}`, k + 3, r * 1000)),
      ...Array.from({ length: 6 }, (_, k) => post(`u${k}`, k + 9, 1000)),
    ];
    const { scored, best } = p.scoredPosts(account(posts), NOW);
    expect(scored.map((s) => s.post.id)).not.toContain("young");
    expect(scored).toHaveLength(11);
    expect(best.map((s) => s.post.id)).toEqual(["b0", "b1", "b2"]);
    expect(p.scoredPosts(account(posts.map((x) => ({ ...x, views: 1000 }))), NOW).best).toEqual([]);
  });

  it("needs 8 posts with numbers to run", () => {
    expect(p.MIN_POSTS).toBe(8);
    expect(p.scoredPosts(account([post("a", 3, 100), post("b", 4, 100)]), NOW).scored).toHaveLength(0);
  });
});

describe("the cache", () => {
  it("lives under content-studio-patterns- plus the brand's scoped id, per account, and reads bad JSON as empty", () => {
    p.savePattern("u1", "instagram:mrbrown", entry());
    expect(JSON.parse(storage.getItem("content-studio-patterns-u1")!)).toEqual({ "instagram:mrbrown": entry() });
    expect(changed).toHaveBeenCalledWith("content-studio-patterns-changed");
    storage.setItem("content-studio-patterns-u1", "{nope");
    expect(p.loadPatterns("u1")).toEqual({});
    storage.setItem("content-studio-patterns-u1", JSON.stringify({ a: { checkedAt: "x" }, b: entry(), c: [] }));
    expect(Object.keys(p.loadPatterns("u1"))).toEqual(["b"]);
  });

  it("drops the oldest runs when storage is full instead of failing", () => {
    p.savePattern("u1", "instagram:a", entry({ ranAt: "2026-10-01T00:00:00Z" }));
    p.savePattern("u1", "instagram:b", entry({ ranAt: "2026-10-02T00:00:00Z" }));
    storage.full = storage.getItem("content-studio-patterns-u1")!.length + 10;
    p.savePattern("u1", "instagram:c", entry({ ranAt: "2026-10-03T00:00:00Z" }));
    expect(Object.keys(p.loadPatterns("u1")).sort()).toEqual(["instagram:b", "instagram:c"]);
  });

  it("offers Run again only after a newer Following check", () => {
    const e = entry({ checkedAt: "2026-10-19T00:00:00.000Z" });
    expect(p.isStale(e, { checkedAt: "2026-10-19T00:00:00.000Z" })).toBe(false);
    expect(p.isStale(e, { checkedAt: "2026-10-26T00:00:00.000Z" })).toBe(true);
    expect(p.isStale(undefined, { checkedAt: "2026-10-26T00:00:00.000Z" })).toBe(false);
  });
});

describe("a run", () => {
  const posts = [...[3, 2.5, 2].map((r, k) => post(`b${k}`, k + 3, r * 1000)), ...Array.from({ length: 7 }, (_, k) => post(`u${k}`, k + 9, 1000)), post("young", 1, 50)];
  const result = { tags: { b0: { formula: "list", structure: null, topic: null } }, patterns: [], ideas: [{ hook: "Hook one here", format: "post", angle: "a", patterns: [] }], from: "best" };

  it("sends the scored posts best first, the top 3, the brand and the voice, then caches the answer with the check it read", async () => {
    callFn.mockResolvedValue(result);
    await p.runPatterns("u1", account(posts));
    const [name, body] = callFn.mock.calls[0];
    expect(name).toBe("remix-patterns");
    expect(body.posts.map((x: { id: string }) => x.id)).toEqual(["b0", "b1", "b2", "u0", "u1", "u2", "u3", "u4", "u5", "u6"]);
    expect(body.posts[0]).toEqual({ id: "b0", caption: "Caption b0", format: "video" });
    expect(body.best).toEqual(["b0", "b1", "b2"]);
    expect(body.brand).toEqual({ name: "ActivityTracker", serves: "Self-employed salespeople", sells: "A sales activity tracker", topics: ["Follow-ups"] });
    expect(body.voice).toEqual({ summary: "Plain and direct", samples: [] });
    expect(body.checkedAt).toBe("2026-10-19T00:00:00.000Z");
    const saved = p.loadPatterns("u1")["instagram:mrbrown"];
    expect(saved).toMatchObject({ ...result, checkedAt: "2026-10-19T00:00:00.000Z", best: ["b0", "b1", "b2"] });
    expect(p.patternRun({ platform: "instagram", handle: "mrbrown" })).toBeNull();
  });

  it("keeps the server's words when a run is refused, and saves nothing", async () => {
    callFn.mockRejectedValue(new EdgeError("You've used all 10 for today. It resets at 8am Singapore time.", 429, "daily_limit"));
    await p.runPatterns("u1", account(posts));
    expect(p.patternFailure({ platform: "instagram", handle: "mrbrown" })).toEqual({ message: "You've used all 10 for today. It resets at 8am Singapore time.", code: "daily_limit" });
    expect(p.loadPatterns("u1")).toEqual({});
  });

  it("drops the answer of a cancelled run", async () => {
    let answer: (v: unknown) => void = () => {};
    callFn.mockReturnValue(new Promise((r) => (answer = r)));
    const running = p.runPatterns("u1", account(posts));
    await vi.waitFor(() => expect(callFn).toHaveBeenCalled());
    expect(p.patternRun({ platform: "instagram", handle: "mrbrown" })?.n).toBe(10);
    p.cancelPatterns({ platform: "instagram", handle: "mrbrown" });
    answer(result);
    await running;
    expect(p.loadPatterns("u1")).toEqual({});
    expect(p.patternFailure({ platform: "instagram", handle: "mrbrown" })).toBeNull();
  });

  it("walks its three steps on the usual timing", () => {
    expect(p.steps(10)).toEqual(["Reading their 10 posts", "Finding what their best posts share", "Writing ideas for you"]);
    expect([0, 1499, 1500, 5999, 6000].map(p.stepAt)).toEqual([0, 0, 1, 1, 2]);
  });
});

describe("ideas as sources", () => {
  const a = { platform: "instagram" as const, handle: "mrbrown" };
  const idea = { hook: "I checked [N] pipelines this year. Most had the same gap.", format: "carousel" as const, angle: "Why follow-ups slip for solo sellers", patterns: ["Number reveal hooks", "List posts"] };

  it("is a pattern: source on the idea, named after the account", () => {
    expect(p.ideaSource(a, idea, 2)).toEqual({
      key: "pattern:instagram:mrbrown:2",
      kind: "pattern",
      format: "carousel",
      platform: "instagram",
      author: "@mrbrown",
      title: idea.hook,
      caption: `${idea.hook}\nWhy follow-ups slip for solo sellers\nPattern from @mrbrown's best posts: Number reveal hooks, List posts.`,
      remixedAt: "",
    });
    expect(p.ideaSource(a, { ...idea, format: "script" }, 1).format).toBe("video");
  });

  it("opens Write on the hook, its formula, its format and the source", () => {
    const u = new URL(p.ideaWriteUrl(a, idea, 2), "https://x");
    expect(u.pathname).toBe("/generate");
    expect(u.searchParams.get("detail")).toBe(idea.hook);
    expect(u.searchParams.get("formula")).toBe("number-reveal");
    expect(u.searchParams.get("format")).toBe("carousel");
    expect(u.searchParams.get("source")).toBe("pattern:instagram:mrbrown:2");
    expect(u.searchParams.get("ctx")).toContain("Use the pattern, not their words or topic.");
    expect(new URL(p.ideaWriteUrl(a, { ...idea, patterns: [] }, 1), "https://x").searchParams.has("formula")).toBe(false);
  });
});
