import { describe, expect, it } from "vitest";
import { bestCell, hashtagRanking, parseHashtags, postingTime, postingTimeGrid, type TrackedPost } from "./analytics";

const p = (id: string, draft: string, impressions: number, engaged: number, at: Partial<TrackedPost> = {}): TrackedPost =>
  ({ id, hook: "", draft, platform: "linkedin", format: "text-post", createdAt: "2026-10-01T00:00:00Z", status: "posted",
     metrics: { impressions, reactions: engaged }, impressions, engagementTotal: engaged,
     engagementRate: impressions ? Math.round((engaged / impressions) * 1000) / 10 : 0, ...at }) as unknown as TrackedPost;

describe("parseHashtags", () => {
  it("finds each tag once, lower-cased", () => {
    expect(parseHashtags("CPF tips #CPF #retirement\n#cpf (#SGfinance) end")).toEqual(["cpf", "retirement", "sgfinance"]);
  });
  it("ignores a # in a URL, an entity or a bare number", () => {
    expect(parseHashtags("see site.com/#faq, it&#39;s #1 and a#b, but #2026goals counts")).toEqual(["2026goals"]);
  });
});

describe("hashtagRanking", () => {
  const posts = [
    p("a", "one #cpf #money", 1000, 100),
    p("b", "two #cpf", 1000, 60),
    p("c", "three #money #once", 1000, 20),
    p("d", "four #money", 1000, 20),
    p("e", "no tags", 1000, 500),
  ];
  it("ranks tags used twice or more by pooled engagement rate", () => {
    expect(hashtagRanking(posts)).toEqual([
      { tag: "cpf", count: 2, rate: 8 },
      { tag: "money", count: 3, rate: 4.7 },
    ]);
  });
  it("says nothing on fewer than 3 posts with tags", () => {
    expect(hashtagRanking(posts.slice(0, 2))).toEqual([]);
  });
  it("leaves out posts with no impressions", () => {
    expect(hashtagRanking([...posts.slice(0, 2), p("z", "#cpf", 0, 900)])).toEqual([]);
  });
});

describe("postingTime", () => {
  it("prefers the scheduled time, then the time it was marked posted, then the day alone", () => {
    // Thu 8 Oct 2026, 19:30 chosen
    expect(postingTime(p("a", "", 1, 1, { scheduledFor: "2026-10-08T19:30", postedAt: "2026-10-09T01:00:00Z" }))).toEqual({ day: 3, hour: 19 });
    const marked = new Date(2026, 9, 6, 8, 15); // Tue 8:15 local
    expect(postingTime(p("b", "", 1, 1, { postedAt: marked.toISOString() }))).toEqual({ day: 1, hour: 8 });
    expect(postingTime(p("c", "", 1, 1, { postedAt: "2026-10-11" }))).toEqual({ day: 6, hour: null });
    expect(postingTime(p("d", "", 1, 1, { scheduledFor: "2026-10-12" }))).toEqual({ day: 0, hour: null });
    expect(postingTime(p("e", "", 1, 1))).toBeNull();
  });
});

describe("postingTimeGrid", () => {
  const at = (day: number, hour: number) => new Date(2026, 9, 5 + day, hour, 0).toISOString(); // 5 Oct 2026 is a Monday
  it("buckets by day and hour, and by daypart", () => {
    const g = postingTimeGrid([
      p("a", "", 1000, 50, { postedAt: at(1, 20) }),
      p("b", "", 1000, 30, { postedAt: at(1, 21) }),
      p("c", "", 1000, 10, { postedAt: at(4, 8) }),
    ]);
    expect(g.hours[1][20]).toEqual({ count: 1, rate: 5 });
    expect(g.dayparts[1][2]).toEqual({ count: 2, rate: 4 }); // Tue evening
    expect(g.dayparts[4][0]).toEqual({ count: 1, rate: 1 }); // Fri morning
    expect(g.days[1]).toEqual({ count: 2, rate: 4 });
    expect(g).toMatchObject({ placed: 3, timed: 3, hasTimes: true });
    expect(bestCell(g.dayparts)).toEqual([1, 2]);
    expect(bestCell(g.dayparts, 3)).toBeNull();
  });
  it("falls back to days when most posts have no time", () => {
    const g = postingTimeGrid([
      p("a", "", 1000, 50, { postedAt: "2026-10-06" }),
      p("b", "", 1000, 30, { postedAt: "2026-10-07" }),
      p("c", "", 1000, 10, { postedAt: at(4, 8) }),
    ]);
    expect(g).toMatchObject({ placed: 3, timed: 1, hasTimes: false });
    expect(g.days.map((d) => d.count)).toEqual([0, 1, 1, 0, 1, 0, 0]);
  });
});
