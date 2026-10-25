import { beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeError } from "@/lib/edgeFn";
import { HOOK_FORMULAS } from "@/lib/hookFormulas";
import { saveDrafts, type DraftEntry } from "@/lib/draftHistory";
import type { TagEntry } from "./formatWinners";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));

const {
  bestFor, loadTags, makeAnotherUrl, onTags, saveTags, subLine, tagJob, tagPosts, tryItUrl, tryNextHooks, untriedFormats, untriedHooks, winnerRows,
} = await import("./formatWinners");

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const DAY = 86_400_000;
const NOW = Date.parse("2026-10-25T04:00:00Z");
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

class MemStorage {
  m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: new MemStorage(), dispatchEvent: () => true };
  callFn.mockReset();
});

let seq = 0;
const d = (format: string, reactions: number, days: number, extra: Partial<DraftEntry> = {}): DraftEntry =>
  ({ id: `d${seq++}`, createdAt: ago(days + 1), hook: "Hook", draft: `Hook\nA post about CPF number ${seq}.`, pillar: "topic", pillarDetail: "", audience: "", format,
     platform: "linkedin", ctaType: "", status: "posted", postedAt: ago(days), metrics: { reactions }, ...extra });
const many = (n: number, f: (i: number) => DraftEntry) => Array.from({ length: n }, (_, i) => f(i));
const noTags = { tags: {} };

describe("what wins: groups", () => {
  it("scores a group as the median of its posts' ratios to your usual: carousels at twice the median, text posts at it", () => {
    const drafts = [...many(8, (i) => d("carousel", 200, 3 + i * 3)), ...many(11, (i) => d("text-post", 100, 4 + i * 3)), ...many(2, (i) => d("short-video", 100, 5 + i))];
    expect(winnerRows(drafts, "format", noTags, NOW)).toEqual([
      { key: "carousel", label: "Carousels", posts: 8, score: 2, platform: "linkedin" },
      { key: "text-post", label: "Text posts", posts: 11, score: 1, platform: "linkedin" },
      { key: "short-video", label: "Short video", posts: 2, score: null, platform: "linkedin" },
    ]);
  });

  it("scores each network against its own usual, and leaves out posts older than 90 days or with no numbers", () => {
    const drafts = [
      ...many(5, (i) => d("text-post", 1000, 3 + i, { platform: "instagram" })),
      ...many(5, (i) => d("text-post", 100, 4 + i)),
      d("text-post", 9000, 95),
      d("text-post", 0, 5, { metrics: undefined }),
    ];
    expect(winnerRows(drafts, "format", noTags, NOW)).toEqual([{ key: "text-post", label: "Text posts", posts: 10, score: 1, platform: "instagram" }]);
  });

  it("groups hooks by the formula a post was written with, else Jev's tag, and angles by Jev's tag", () => {
    const drafts = [...many(3, () => d("text-post", 100, 5, { hookFormula: "contrarian" })), ...many(3, () => d("text-post", 100, 6)), d("text-post", 100, 7)];
    const tags = { tags: Object.fromEntries(drafts.slice(3).map((x, i) => [x.id, { angle: (i < 3 ? "Storytelling" : "unclear") as TagEntry["angle"], hook: i < 3 ? "number-reveal" : "none", at: ago(1) }])) };
    expect(winnerRows(drafts, "hook", tags, NOW).map((r) => [r.key, r.label, r.posts])).toEqual([["contrarian", "Contrarian take", 3], ["number-reveal", "Number reveal", 3]]);
    expect(winnerRows(drafts, "angle", tags, NOW).map((r) => [r.key, r.label, r.posts])).toEqual([["Storytelling", "Storytelling", 3]]);
  });
});

describe("bestFor", () => {
  const seed = (carousels: DraftEntry[]) => saveDrafts(UID, [...carousels, ...many(6, (i) => d("text-post", 100, 4 + i))]);

  it("names the top group with 3 posts at 1.2x or more", () => {
    seed(many(3, (i) => d("carousel", 120, 10 + i)));
    expect(bestFor(UID, "linkedin", NOW)).toEqual({ format: "carousel" });
    expect(bestFor(UID, "instagram", NOW)).toEqual({});
  });

  it("names nothing under 1.2x or under 3 posts", () => {
    seed(many(3, (i) => d("carousel", 119, 10 + i)));
    expect(bestFor(UID, "linkedin", NOW)).toEqual({});
    seed(many(2, (i) => d("carousel", 400, 10 + i)));
    expect(bestFor(UID, "linkedin", NOW)).toEqual({});
  });
});

describe("not tried yet", () => {
  it("lists formats with no post in 90 days on the network you post on most, with the niche figure", () => {
    const drafts = [d("text-post", 10, 5), d("carousel", 10, 6), d("short-video", 10, 100), d("short-video", 10, 5, { platform: "tiktok" })];
    expect(untriedFormats(drafts, NOW, [{ value: "short-video", ratio: 1.8 }])).toEqual([{ format: "short-video", label: "Short video", niche: 1.8 }]);
    expect(untriedFormats([d("text-post", 10, 5)], NOW)).toEqual([
      { format: "short-video", label: "Short video", niche: null },
      { format: "carousel", label: "Carousels", niche: null },
    ]);
    expect(untriedFormats([d("text-post", 10, 5)], NOW, [{ value: "carousel", ratio: 2.4 }]).map((f) => f.format)).toEqual(["carousel", "short-video"]);
  });

  it("lists hook formulas with no post in 90 days, by formula or by Jev's tag", () => {
    const drafts = [d("text-post", 10, 5, { hookFormula: "contrarian" }), d("text-post", 10, 6), d("text-post", 10, 100, { hookFormula: "myth-bust" })];
    const left = untriedHooks(drafts, { tags: { [drafts[1].id]: { angle: "Educational", hook: "number-reveal", at: ago(1) } } }, NOW);
    expect(left).toHaveLength(HOOK_FORMULAS.length - 2);
    expect(left).not.toContain("contrarian");
    expect(left).not.toContain("number-reveal");
  });
});

describe("the sub-line", () => {
  it("says last 90 days, or since the oldest post the list still holds", () => {
    const withNumbers = many(3, (i) => d("text-post", 10, 5 + i));
    expect(subLine([...withNumbers, d("text-post", 0, 120, { metrics: undefined })], NOW)).toBe("Last 90 days, 3 posts with numbers");
    expect(subLine([...withNumbers, d("text-post", 0, 67, { metrics: undefined })], NOW)).toBe("Since 19 Aug, 3 posts with numbers");
    expect(subLine([d("text-post", 10, 5)], NOW)).toBe("Since 20 Oct, 1 post with numbers");
  });
});

describe("the hand-off to Write", () => {
  const q = (url: string) => new URLSearchParams(url.split("?")[1]);

  it("Make another carries the format or formula, the network and the no-copy line", () => {
    const fmt = makeAnotherUrl("format", { key: "carousel", label: "Carousels", posts: 8, score: 2.1, platform: "linkedin" });
    expect(q(fmt).get("format")).toBe("carousel");
    expect(q(fmt).get("platform")).toBe("linkedin");
    expect(q(fmt).get("ctx")).toBe(
      "My Carousels posts get 2.1x my usual. Write a new post in that shape on a fresh topic. Do not reuse my earlier wording. Keep it compliant for a licensed Singapore financial adviser.",
    );
    const hook = makeAnotherUrl("hook", { key: "contrarian", label: "Contrarian take", posts: 3, score: 1.4, platform: "instagram" });
    expect([q(hook).get("formula"), q(hook).get("format"), q(hook).get("platform")]).toEqual(["contrarian", null, "instagram"]);
    const angle = makeAnotherUrl("angle", { key: "Storytelling", label: "Storytelling", posts: 4, score: 1.6, platform: "linkedin" });
    expect([q(angle).get("formula"), q(angle).get("format")]).toEqual([null, null]);
    expect(q(angle).get("ctx")).toContain("My Storytelling posts get 1.6x my usual.");
    for (const url of [fmt, hook, angle]) expect(url.length).toBeLessThan(1800);
  });

  it("Try it names what you haven't tried", () => {
    const url = tryItUrl("hook", "myth-bust", "linkedin");
    expect(q(url).get("formula")).toBe("myth-bust");
    expect(q(url).get("ctx")).toBe(`I haven't tried the ${HOOK_FORMULAS.find((f) => f.id === "myth-bust")!.name} hook yet. Write one post with it. Keep it compliant for a licensed Singapore financial adviser.`);
    expect(q(tryItUrl("format", "short-video", "linkedin")).get("ctx")).toContain("I haven't tried Short video yet.");
  });
});

describe("the post tags store", () => {
  it("drops tags for drafts that no longer exist on each write", () => {
    const keep = d("text-post", 10, 5);
    saveDrafts(UID, [keep]);
    saveTags(UID, { tags: { [keep.id]: { angle: "Humour", at: ago(1) }, gone: { angle: "Humour", at: ago(1) } } });
    expect(loadTags(UID)).toEqual({ tags: { [keep.id]: { angle: "Humour", at: ago(1) } } });
  });

  it("reads empty on bad JSON", () => {
    window.localStorage.setItem(`content-studio-post-tags-${UID}`, "{nope");
    expect(loadTags(UID)).toEqual({ tags: {} });
  });
});

describe("tagging your posts", () => {
  const answer = (posts: { id: string; needHook: boolean }[]) => ({
    tags: Object.fromEntries(posts.map((p) => [p.id, p.needHook ? { angle: "Educational", hook: "number-reveal" } : { angle: "Educational" }])),
  });

  it("sends untagged posted posts with numbers, newest first, 20 at a time, until all are tagged", async () => {
    const drafts = [...many(25, (i) => d("text-post", 10, 3 + i)), d("text-post", 10, 2, { hookFormula: "contrarian" }), d("text-post", 0, 1, { metrics: undefined }), d("text-post", 10, 1, { status: "draft" })];
    saveDrafts(UID, drafts);
    callFn.mockImplementation(async (_n: string, body: { posts: { id: string; needHook: boolean }[] }) => answer(body.posts));
    const seen: string[] = [];
    const off = onTags(() => seen.push(`${tagJob(UID).done}/${tagJob(UID).total}`));
    await tagPosts(UID, () => NOW);
    off();
    expect(callFn.mock.calls.map(([name, body]) => [name, body.mode, body.posts.length])).toEqual([["writing-judge", "tags", 20], ["writing-judge", "tags", 6]]);
    const first = callFn.mock.calls[0][1].posts[0];
    expect(first).toEqual({ id: drafts[25].id, text: drafts[25].draft, needHook: false });
    expect(Object.keys(loadTags(UID).tags)).toHaveLength(26);
    expect(loadTags(UID).tags[drafts[0].id]).toEqual({ angle: "Educational", hook: "number-reveal", at: new Date(NOW).toISOString() });
    expect(seen).toEqual(["0/26", "20/26", "26/26", "26/26"]);
    await tagPosts(UID, () => NOW);
    expect(callFn).toHaveBeenCalledTimes(2);
  });

  it("stores nothing on a Jev null, stops on the cap with its line, and keeps only answers it can read", async () => {
    saveDrafts(UID, many(3, (i) => d("text-post", 10, 3 + i)));
    callFn.mockResolvedValue({ tags: null });
    await tagPosts(UID, () => NOW);
    expect(loadTags(UID)).toEqual({ tags: {} });
    expect(tagJob(UID).error).toEqual({ message: "Angles show once your posts are read. Try again later.", code: "unavailable" });
    callFn.mockRejectedValue(new EdgeError("Tags are used up for today.", 429, "daily_limit"));
    await tagPosts(UID, () => NOW);
    expect(tagJob(UID).error).toEqual({ message: "Tags are used up for today.", code: "daily_limit" });
    callFn.mockImplementation(async (_n: string, body: { posts: { id: string }[] }) => ({
      tags: { [body.posts[0].id]: { angle: "Nonsense" }, [body.posts[1].id]: { angle: "Humour", hook: "not-a-formula" }, [body.posts[2].id]: { angle: "unclear", hook: "unclear" }, other: { angle: "Humour" } },
    }));
    await tagPosts(UID, () => NOW);
    const ids = callFn.mock.calls.at(-1)![1].posts.map((p: { id: string }) => p.id);
    expect(loadTags(UID).tags).toEqual({ [ids[1]]: { angle: "Humour", at: new Date(NOW).toISOString() }, [ids[2]]: { angle: "unclear", hook: "unclear", at: new Date(NOW).toISOString() } });
    expect(window.localStorage.getItem(`content-studio-post-tags-${UID}`)).not.toMatch(/Nonsense|not-a-formula/);
    expect(tagJob(UID).error).toBeNull();
  });
});

describe("hooks to try next", () => {
  const positioning = () => window.localStorage.setItem(`content-studio-positioning-${UID}`, JSON.stringify({ audience: "young-adult", audienceDetail: "fresh grads", topics: ["CPF", "insurance"] }));

  it("asks once a week with your audience, topics, best hooks and untried formulas", async () => {
    positioning();
    saveDrafts(UID, [d("text-post", 300, 5, { hook: "Best one" }), d("text-post", 100, 6), d("text-post", 100, 7), d("text-post", 100, 8, { hookFormula: "contrarian" })]);
    callFn.mockResolvedValue({ hooks: ["myth-bust", "number-reveal"] });
    expect(await tryNextHooks(UID, NOW)).toEqual(["myth-bust", "number-reveal"]);
    expect(await tryNextHooks(UID, NOW + DAY / 4)).toEqual(["myth-bust", "number-reveal"]);
    expect(callFn).toHaveBeenCalledTimes(1);
    const body = callFn.mock.calls[0][1];
    expect(body).toMatchObject({ mode: "try-next", audience: "fresh grads", topics: ["CPF", "insurance"] });
    expect(body.best[0]).toBe("Best one");
    expect(body.untried).not.toContain("contrarian");
    expect(loadTags(UID).tryNext).toEqual({ week: "2026-10-19", hooks: ["myth-bust", "number-reveal"] });
    // Monday: a new Singapore week
    await tryNextHooks(UID, NOW + DAY);
    expect(callFn).toHaveBeenCalledTimes(2);
  });

  it("is hidden without positioning, and caches nothing when Jev has no answer", async () => {
    saveDrafts(UID, [d("text-post", 100, 5)]);
    expect(await tryNextHooks(UID, NOW)).toEqual([]);
    expect(callFn).not.toHaveBeenCalled();
    positioning();
    callFn.mockResolvedValue({ hooks: null });
    expect(await tryNextHooks(UID, NOW)).toEqual([]);
    expect(loadTags(UID).tryNext).toBeUndefined();
  });
});
