import { describe, expect, it } from "vitest";
import { auditedHandles, connectedFor, followerSeries, growthSeries, type AuditSnapshot } from "@/lib/accountAudit";

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

describe("growthSeries", () => {
  const days = (n: number, from = "2026-08-01") =>
    Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse(`${from}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10), followers: 1000 + i }));

  it("is the audit's own series when Zernio has no counts", () => {
    const rows = [snap("2026-10-10T02:00:00Z", 1210), snap("2026-10-03T02:00:00Z", 1180)];
    expect(growthSeries(rows)).toEqual({ points: followerSeries(rows), weekly: false });
  });

  it("adds Zernio's daily counts to the audit's, one point a day up to a month", () => {
    const { points: series, weekly } = growthSeries([snap("2026-07-30T02:00:00Z", 990)], days(20));
    expect(weekly).toBe(false);
    expect(series).toHaveLength(21);
    expect(series[0]).toMatchObject({ followers: 990, change: null });
    expect(series[1]).toMatchObject({ followers: 1000, change: 10 });
    expect(series[20].at).toBe("2026-08-20T12:00:00Z");
  });

  it("goes to one point a week, the week's last count, once there are more than a month of days", () => {
    // 1 Aug 2026 is a Saturday: its week (from Mon 27 Jul) holds 1 and 2 Aug, then whole weeks to Sun 29 Nov
    const { points: series, weekly } = growthSeries([], days(121));
    expect(weekly).toBe(true);
    expect(series[0]).toMatchObject({ at: "2026-08-02T12:00:00Z", followers: 1001, change: null });
    expect(series[1]).toMatchObject({ at: "2026-08-09T12:00:00Z", followers: 1008, change: 7 });
    expect(series).toHaveLength(18);
  });
});

describe("connectedFor", () => {
  it("finds the connected account an audit panel is about, by platform and handle", () => {
    const audited = auditedHandles({ instagram: { handle: "@Demo.Adviser" }, tiktok: { handle: "" }, linkedin: { handle: "demo" } } as never);
    expect(audited).toEqual([{ platform: "instagram", handle: "demo.adviser" }]);
    const list = [
      { platform: "tiktok", username: "demo.adviser" },
      { platform: "instagram", username: "@demo.adviser" },
    ];
    expect(connectedFor(list, "instagram", "demo.adviser")).toBe(list[1]);
    expect(connectedFor(list, "instagram", "someone.else")).toBeUndefined();
  });
});
