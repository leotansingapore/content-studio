import { describe, expect, it } from "vitest";
import { applyCheck, followStats, remixUrl, type FollowedAccount, type TrackedPost } from "@/lib/following";

const post = (id: string, day: number, extra: Partial<TrackedPost> = {}): TrackedPost => ({
  id, url: `https://www.instagram.com/p/${id}/`, format: "video", caption: "Most people buy insurance backwards. Here's why.",
  postedAt: `2026-10-${String(day).padStart(2, "0")}T10:00:00Z`, views: 100, likes: 5, comments: 1, ...extra,
});
const base: FollowedAccount = { platform: "instagram", handle: "acct", addedAt: "2026-09-01T00:00:00Z", history: [], posts: [], seen: [], fresh: [] };
const check = (at: string, followers: number, posts: TrackedPost[]) => ({
  platform: "instagram" as const, handle: "acct", name: "Acct", url: "https://www.instagram.com/acct/", followers, postsCount: 10, posts, checkedAt: at,
});

describe("following", () => {
  it("marks nothing new on the first check, then only posts not seen before", () => {
    const a1 = applyCheck(base, check("2026-10-01T09:00:00Z", 1000, [post("a", 1), post("b", 2)]));
    expect(a1.fresh).toEqual([]);
    const a2 = applyCheck(a1, check("2026-10-03T09:00:00Z", 1040, [post("c", 3), post("a", 1)]));
    expect(a2.fresh).toEqual(["c"]);
    expect(a2.seen).toEqual(expect.arrayContaining(["a", "b", "c"]));
    expect(a2.history.map((s) => s.followers)).toEqual([1000, 1040]);
  });

  it("keeps one snapshot a day, the latest", () => {
    const a1 = applyCheck(base, check("2026-10-01T09:00:00Z", 1000, []));
    const a2 = applyCheck(a1, check("2026-10-01T18:00:00Z", 1010, []));
    expect(a2.history).toEqual([{ at: "2026-10-01T18:00:00Z", followers: 1010 }]);
  });

  it("works out growth over 30 days, posting pace and the best post", () => {
    const a = { ...base, checkedAt: "x", history: [
      { at: "2026-08-20T00:00:00Z", followers: 500 },
      { at: "2026-09-10T00:00:00Z", followers: 900 },
      { at: "2026-10-08T00:00:00Z", followers: 1000 },
    ], posts: [post("a", 1, { views: 50 }), post("b", 4, { views: 900 }), post("c", 7, { views: null, likes: 40, comments: 2 })] };
    const s = followStats(a, Date.parse("2026-10-08T00:00:00Z"));
    expect(s.followers).toBe(1000);
    expect(s.growth).toBe(100);
    expect(s.growthDays).toBe(28);
    expect(s.perWeek).toBe(3);
    expect(s.best?.id).toBe("b");
    expect(followStats({ ...a, history: [a.history[2]] }, Date.parse("2026-10-08T00:00:00Z")).growth).toBeNull();
  });

  it("sends a video to Clone a reel and anything else to Write with a no-copy brief", () => {
    expect(remixUrl(base, post("a", 1))).toBe("/clone?url=https%3A%2F%2Fwww.instagram.com%2Fp%2Fa%2F");
    const url = remixUrl(base, post("b", 1, { format: "carousel" }));
    const p = new URLSearchParams(url.split("?")[1]);
    expect(url.startsWith("/generate?")).toBe(true);
    expect(p.get("detail")).toBe("Most people buy insurance backwards");
    expect(p.get("ctx")).toContain("Do not copy its wording");
  });
});
