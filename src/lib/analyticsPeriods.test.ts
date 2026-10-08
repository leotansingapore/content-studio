import { describe, expect, it } from "vitest";
import { comparePeriods, postsCsv, rankPosts, withinDays, type TrackedPost } from "./analytics";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const p = (id: string, daysAgo: number, impressions: number, reactions: number, comments = 0, hook = id): TrackedPost =>
  ({ id, hook, draft: hook, platform: "linkedin", format: "text-post", createdAt: "", postedAt: new Date(NOW - daysAgo * 86_400_000).toISOString(),
     metrics: { impressions, reactions, comments, shares: 0 }, impressions, engagementTotal: reactions + comments,
     engagementRate: impressions ? Math.round(((reactions + comments) / impressions) * 1000) / 10 : 0 }) as unknown as TrackedPost;

describe("comparePeriods", () => {
  it("compares this window with the one before it", () => {
    const posts = [p("a", 2, 1000, 50), p("b", 10, 500, 10), p("c", 40, 400, 20), p("d", 70, 999, 99)];
    const r = comparePeriods(posts, 30, NOW);
    expect(r.current).toMatchObject({ posts: 2, impressions: 1500, engagements: 60, rate: 4 });
    expect(r.previous).toMatchObject({ posts: 1, impressions: 400, engagements: 20, rate: 5 });
    expect(r.change).toEqual({ posts: 100, impressions: 275, engagements: 200, rate: -20 });
  });
  it("has no change to show when the previous window is empty", () => {
    expect(comparePeriods([p("a", 1, 10, 1)], 7, NOW).change.posts).toBeNull();
  });
});

describe("withinDays", () => {
  it("keeps the posts from the period's days, or every post for All time", () => {
    const posts = [p("a", 2, 1, 0), p("b", 10, 1, 0), p("c", 40, 1, 0), p("future", -1, 1, 0)];
    expect(withinDays(posts, 7, NOW).map((x) => x.id)).toEqual(["a"]);
    expect(withinDays(posts, 30, NOW).map((x) => x.id)).toEqual(["a", "b"]);
    expect(withinDays(posts, 0, NOW)).toBe(posts);
  });
});

describe("rankPosts and postsCsv", () => {
  it("ranks by the chosen metric", () => {
    const posts = [p("a", 1, 100, 5, 9), p("b", 1, 900, 1, 0), p("c", 1, 50, 30, 1)];
    expect(rankPosts(posts, "impressions").map((x) => x.id)).toEqual(["b", "a", "c"]);
    expect(rankPosts(posts, "comments").map((x) => x.id)).toEqual(["a", "c", "b"]);
    expect(rankPosts(posts, "engagementRate", 1).map((x) => x.id)).toEqual(["c"]);
  });
  it("writes a CSV that survives commas, quotes and line breaks", () => {
    const csv = postsCsv([p("a", 1, 100, 5, 0, 'He said "CPF, then\nHDB"')]);
    const [head, row] = csv.split(/\n(?=\d{4}-)/);
    expect(head.startsWith("Posted,Platform,Format,Hook")).toBe(true);
    expect(row).toContain('"He said ""CPF, then\nHDB"""');
  });
});
