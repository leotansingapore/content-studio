import { describe, expect, it } from "vitest";
import { followerSeries, type AuditSnapshot } from "@/lib/accountAudit";

const snap = (takenAt: string, followers: number | null): AuditSnapshot => ({
  taken_at: takenAt,
  followers,
  posts_analyzed: 30,
  median_views: null,
  median_engagement_rate: null,
  posts_per_week: null,
});

describe("followerSeries", () => {
  it("keeps one point a day (its last snapshot), oldest first, with the change from the point before", () => {
    // Any order in; two refreshes on 3 Oct, an hour apart (the same day in any time zone).
    const rows = [
      snap("2026-10-10T02:00:00+00:00", 1210),
      snap("2026-10-03T10:00:00+00:00", 1175),
      snap("2026-09-26T02:00:00+00:00", 1190),
      snap("2026-10-03T11:00:00+00:00", 1180),
    ];
    expect(followerSeries(rows).map((p) => [p.at.slice(0, 10), p.followers, p.change])).toEqual([
      ["2026-09-26", 1190, null],
      ["2026-10-03", 1180, -10],
      ["2026-10-10", 1210, 30],
    ]);
  });

  it("leaves out snapshots with no follower count", () => {
    const rows = [snap("2026-10-10T02:00:00Z", 1210), snap("2026-10-03T02:00:00Z", null), snap("2026-09-26T02:00:00Z", 1190)];
    expect(followerSeries(rows).map((p) => [p.followers, p.change])).toEqual([[1190, null], [1210, 20]]);
  });

  it("keeps the newest points when there are more than the chart shows, the first still measured from the one before", () => {
    const rows = Array.from({ length: 20 }, (_, i) => snap(`2026-08-${String(31 - i).padStart(2, "0")}T02:00:00Z`, 1000 + (20 - i) * 5));
    const series = followerSeries(rows, 12);
    expect(series).toHaveLength(12);
    expect(series[0]).toMatchObject({ at: "2026-08-20T02:00:00Z", followers: 1045, change: 5 });
    expect(series[11]).toMatchObject({ at: "2026-08-31T02:00:00Z", followers: 1100 });
  });
});
