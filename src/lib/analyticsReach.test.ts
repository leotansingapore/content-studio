import { beforeEach, describe, expect, it } from "vitest";
import { commentRatio, rankPosts, reachMultiple, type TrackedPost } from "./analytics";
import { loadFollowers, setFollowers } from "./socialAccounts";

const p = (id: string, platform: string, impressions: number, reactions: number, comments: number): TrackedPost =>
  ({ id, platform, impressions, metrics: { impressions, reactions, comments }, engagementTotal: reactions + comments, engagementRate: 0 }) as unknown as TrackedPost;

describe("reach past followers", () => {
  it("is impressions per follower on the post's platform, to one decimal", () => {
    expect(reachMultiple(p("a", "linkedin", 2400, 10, 1), { linkedin: 1000 })).toBe(2.4);
    expect(reachMultiple(p("b", "instagram", 300, 10, 1), { instagram: 1200 })).toBe(0.3);
  });

  it("is unknown without a follower count for that platform or without impressions", () => {
    expect(reachMultiple(p("a", "linkedin", 2400, 10, 1), { instagram: 1000 })).toBeNull();
    expect(reachMultiple(p("a", "linkedin", 2400, 10, 1), { linkedin: 0 })).toBeNull();
    expect(reachMultiple(p("a", "linkedin", 0, 10, 1), { linkedin: 1000 })).toBeNull();
  });
});

describe("comments per like", () => {
  it("is comments over likes, to two decimals, and unknown with no likes", () => {
    expect(commentRatio(p("a", "linkedin", 1000, 40, 6))).toBe(0.15);
    expect(commentRatio(p("b", "linkedin", 1000, 3, 0))).toBe(0);
    expect(commentRatio(p("c", "linkedin", 1000, 0, 5))).toBeNull();
  });
});

describe("ranking by reach and by conversation", () => {
  const posts = [p("a", "linkedin", 900, 40, 12), p("b", "linkedin", 12000, 300, 6), p("c", "instagram", 5000, 0, 0)];

  it("puts the post that travelled furthest first and leaves out posts it can't measure", () => {
    expect(rankPosts(posts, "reachMultiple", 5, { linkedin: 3000 }).map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("puts the post that started the most conversation first, even with far fewer impressions", () => {
    expect(rankPosts(posts, "commentRatio").map((x) => x.id)).toEqual(["a", "b"]);
  });
});

class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

describe("follower counts typed in Add your numbers", () => {
  const UID = "9b0f4c55-4d1e-4c3a-8f0e-2a7d6e5c1b90";
  beforeEach(() => {
    (globalThis as { window?: unknown }).window = { localStorage: new MemStorage() };
  });

  it("keeps a whole number per platform and forgets a cleared or bad one", () => {
    expect(setFollowers(UID, "linkedin", 1234.6)).toEqual({ linkedin: 1235 });
    setFollowers(UID, "instagram", 800);
    setFollowers(UID, "instagram", null);
    setFollowers(UID, "facebook", -5);
    setFollowers(UID, "tiktok", Number.NaN);
    expect(loadFollowers(UID)).toEqual({ linkedin: 1235 });
  });
});
