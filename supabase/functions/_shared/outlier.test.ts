import { describe, expect, it } from "vitest";
import { byOutlier, OUTLIER, rankOf, scoreAccount, tierOf, times, type Outlier, type OutlierPost } from "./outlier.ts";

const NOW = Date.parse("2026-10-20T00:00:00Z");
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();
let n = 0;
/** A video post with views, settled (100+ hours old) unless told otherwise. */
const vid = (views: number, hours = 100 + n, id = `v${++n}`): OutlierPost => ({ id, postedAt: ago(hours), views, likes: 1, comments: 0 });
const photo = (likes: number, extra: Partial<OutlierPost> = {}): OutlierPost => ({ id: `p${++n}`, postedAt: ago(100 + n), views: null, likes, comments: 0, ...extra });

describe("scoreAccount", () => {
  it("takes the median of the other posts, on odd and even counts", () => {
    const odd = [vid(10), vid(20), vid(30), vid(1000, 100, "top")];
    expect(scoreAccount(odd, NOW).top).toMatchObject({ baseline: 20, ratio: 50, posts: 3 });
    const even = [vid(10), vid(20), vid(30), vid(40), vid(1000, 100, "top")];
    expect(scoreAccount(even, NOW).top).toMatchObject({ baseline: 25, ratio: 40, posts: 4 });
  });

  it("leaves the scored post out of its own baseline", () => {
    const small = Array.from({ length: 9 }, () => vid(100));
    expect(scoreAccount([...small, vid(10_000, 100, "big")], NOW).big).toMatchObject({ baseline: 100, ratio: 100, tier: "mega" });
    // with itself in, four small posts and the big one would give a baseline of 30, not 25
    expect(scoreAccount([vid(10), vid(20), vid(30), vid(40), vid(1000, 100, "big")], NOW).big.ratio).toBe(40);
  });

  it("does not judge a post under 48 hours old, nor count it in anyone's baseline", () => {
    const s = scoreAccount([vid(100, 100, "a"), vid(200), vid(300), vid(10_000, 47, "y47"), vid(10_000, 49, "o49")], NOW);
    expect(s.y47).toMatchObject({ ratio: null, tier: null, reason: "young", confidence: null, rank: -1 });
    expect(s.o49).toMatchObject({ reason: null, baseline: 200, ratio: 50 });
    // a's baseline is 200, 300 and o49's 10,000; with y47 in it would be 5,150
    expect(s.a.baseline).toBe(300);
  });

  it("compares posts without views against interactions only", () => {
    // 80 likes + 10 comments + 5 shares + 5 saves = 100, against the other photos' 20; the videos' 5,000 stay out
    const posts = [vid(5000), vid(5000), vid(5000), vid(10_000, 100, "video"), photo(10), photo(20), photo(30), photo(80, { id: "photo", comments: 10, shares: 5, saves: 5 })];
    const s = scoreAccount(posts, NOW);
    expect(s.photo).toMatchObject({ basis: "interactions", baseline: 20, ratio: 5, posts: 3 });
    expect(s.video).toMatchObject({ basis: "views", baseline: 5000, ratio: 2 });
  });

  it("needs 3 baseline posts to score, and 5 to be sure", () => {
    const first = (count: number) => {
      const posts = [vid(300, 100, "first"), ...Array.from({ length: count - 1 }, () => vid(100))];
      return scoreAccount(posts, NOW).first;
    };
    expect(first(3)).toMatchObject({ posts: 2, ratio: null, reason: "few-posts", confidence: null, rank: -1 });
    expect(first(4)).toMatchObject({ posts: 3, ratio: 3, confidence: "low" });
    expect(first(5)).toMatchObject({ posts: 4, confidence: "low" });
    expect(first(6)).toMatchObject({ posts: 5, confidence: "high" });
  });

  it("counts only the 20 most recent settled posts", () => {
    const recent = [vid(1000, 50, "x"), ...Array.from({ length: 10 }, (_, i) => vid(100, 51 + i)), ...Array.from({ length: 9 }, (_, i) => vid(200, 61 + i))];
    const s = scoreAccount([...recent, vid(1_000_000, 500, "old")], NOW);
    // with the 21st, older outlier in, x's baseline would be 150
    expect(s.x).toMatchObject({ posts: 19, baseline: 100, ratio: 10 });
    expect(OUTLIER.baselinePosts).toBe(20);
  });

  it("calls a zero baseline no-numbers, never Infinity or NaN", () => {
    const s = scoreAccount([vid(0), vid(0), vid(0), vid(0), vid(50, 100, "some")], NOW);
    expect(s.some).toMatchObject({ baseline: 0, ratio: null, tier: null, reason: "no-numbers", rank: -1 });
    for (const o of Object.values(s)) {
      expect(o.ratio).toBeNull();
      expect(Number.isFinite(o.rank)).toBe(true);
    }
  });

  it("counts an undated post as settled and oldest", () => {
    const s = scoreAccount([vid(100), vid(100), vid(100), { id: "undated", postedAt: null, views: 400, likes: 0, comments: 0 }], NOW);
    expect(s.undated).toMatchObject({ reason: null, ratio: 4 });
  });
});

describe("tiers, rank and text", () => {
  it("puts the tier edges where the spec says", () => {
    expect([0.49, 0.5, 1.49, 1.5, 2.99, 3, 9.99, 10].map(tierOf)).toEqual(["below", "usual", "usual", "above", "above", "viral", "viral", "mega"]);
  });

  it("ranks a 3x on a big account above a 5x on a tiny one, never below 0 for a real ratio, and no score last", () => {
    expect(rankOf(3, 50_000)).toBeCloseTo(11.89, 2);
    expect(rankOf(5, 200)).toBeCloseTo(8.53, 2);
    expect(rankOf(0.8, 50_000)).toBe(0);
    expect(rankOf(5, 2)).toBeCloseTo(Math.log(5) * Math.log(10), 6);
    expect(rankOf(null, 100)).toBeLessThan(0);
  });

  it("writes the ratio in ASCII, one decimal under 10 and whole from 10", () => {
    expect(times(3.24)).toBe("3.2x");
    expect(times(14.6)).toBe("15x");
  });
});

describe("byOutlier", () => {
  const o = (ratio: number | null, baseline: number, confidence: "high" | "low" = "high"): Outlier => ({
    ratio, tier: ratio === null ? null : tierOf(ratio), basis: "views", baseline, posts: confidence === "high" ? 19 : 3,
    confidence: ratio === null ? null : confidence, reason: ratio === null ? "young" : null, rank: rankOf(ratio, baseline),
  });

  it("puts unscored posts last and ranks across account sizes", () => {
    const young = o(null, 50_000);
    const bigTwo = o(2, 50_000);
    const tinyFive = o(5, 20);
    expect([young, tinyFive, bigTwo].sort(byOutlier)).toEqual([bigTwo, tinyFive, young]);
  });

  it("puts a sure score before a shaky one of the same tier, even when the shaky one ranks higher", () => {
    const shaky = o(5, 50_000, "low");
    const sure = o(4, 1000);
    expect(shaky.rank).toBeGreaterThan(sure.rank);
    expect([shaky, sure].sort(byOutlier)).toEqual([sure, shaky]);
  });

  it("breaks a rank tie on the higher ratio", () => {
    const flat = o(0.9, 1000);
    const low = o(0.6, 1000);
    expect([low, flat].sort(byOutlier)).toEqual([flat, low]);
  });
});
