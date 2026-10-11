import { beforeEach, describe, expect, it } from "vitest";
import { loadDrafts, saveDrafts, setDraftNumbers, type DraftEntry } from "./draftHistory";
import { getTrackedPosts } from "./analytics";
import { extraLine, matchPulled, type MetricsPost, type Numbers } from "./realNumbers";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const ZP = "67000000000000000000d001";

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: new MemStorage() };
});

const n = (x: Partial<Numbers>): Numbers => ({ impressions: 0, reach: 0, views: 0, likes: 0, comments: 0, shares: 0, saves: 0, ...x });
const pulled = (id: string, zernioPostId: string | null, numbers: Numbers): MetricsPost =>
  ({ id, zernioPostId, platform: "instagram", accountId: "65000000000000000000a001", publishedAt: "2026-10-08T01:00:00Z", text: "Hi", url: null, numbers });
const draft = (id: string, extra: Partial<DraftEntry>): DraftEntry =>
  ({ id, createdAt: "2026-10-01T00:00:00Z", hook: id, draft: "Body", pillar: "", pillarDetail: "", audience: "", format: "", platform: "instagram", ctaType: "", status: "posted", postedAt: "2026-10-08T09:00:00+08:00", ...extra });

describe("matchPulled", () => {
  it("gives a post to the draft that sent its Zernio post, summed over its accounts, and lists the rest as outside the app", () => {
    const drafts = [draft("a", { zernio: { key: "k", postId: ZP } }), draft("b", { metrics: { impressions: 50 } })];
    const { byDraft, outside } = matchPulled(drafts, [
      pulled("e1", ZP, n({ reach: 900, likes: 40 })),
      pulled("e2", ZP, n({ reach: 100, likes: 2, saves: 3 })),
      pulled("e3", null, n({ views: 70 })),
      pulled("e4", "67000000000000000000d777", n({ likes: 1 })),
    ]);
    expect(byDraft).toEqual(new Map([["a", n({ reach: 1000, likes: 42, saves: 3 })]]));
    expect(outside.map((p) => p.id)).toEqual(["e3", "e4"]);
  });
});

describe("real numbers on Analytics", () => {
  it("shows a posted-through-the-app draft's real numbers in place of typed ones, and never changes the typed ones", () => {
    saveDrafts(UID, [
      draft("a", { metrics: { impressions: 10, reactions: 1 }, zernio: { key: "k", postId: ZP } }),
      draft("b", { metrics: { impressions: 50, reactions: 5 } }),
    ]);
    setDraftNumbers(UID, new Map([["a", n({ reach: 900, views: 1500, likes: 40, comments: 6, shares: 3, saves: 11 })]]), "2026-10-11T01:00:00Z");
    const stored = loadDrafts(UID);
    expect(stored[0].metrics).toEqual({ impressions: 10, reactions: 1 });
    expect(stored[0].zernio?.numbers).toMatchObject({ reach: 900, at: "2026-10-11T01:00:00Z" });
    expect(stored[1]).not.toHaveProperty("zernio");
    const tracked = getTrackedPosts(UID);
    expect(tracked.map((p) => [p.id, p.impressions, p.engagementTotal])).toEqual([
      ["a", 900, 49],
      ["b", 50, 5],
    ]);
  });

  it("writes nothing when the numbers haven't changed", () => {
    saveDrafts(UID, [draft("a", { zernio: { key: "k", postId: ZP, numbers: { ...n({ likes: 4 }), at: "2026-10-10T01:00:00Z" } } })]);
    const stored = () => window.localStorage.getItem(`content-studio-drafts-${UID}`);
    const before = stored();
    setDraftNumbers(UID, new Map([["a", n({ likes: 4 })]]), "2026-10-11T01:00:00Z");
    expect(stored()).toBe(before);
  });

  it("names the numbers the typed columns don't have", () => {
    expect(extraLine(n({ views: 1500, reach: 900, saves: 0 }))).toBe("1,500 views, 900 reach");
    expect(extraLine(n({ views: 1, reach: 1, saves: 1 }))).toBe("1 view, 1 reach, 1 save");
    expect(extraLine(n({}))).toBe("");
  });
});
