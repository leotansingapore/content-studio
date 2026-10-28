import { describe, expect, it, vi } from "vitest";
import { auditedHandles, captionsForVoice, connectedFor, followerSeries, growthSeries, loadAuditFor, loadLatestIdeas, openAudit, remixUrl, requestIdeas, shortDate, type AuditSnapshot, type RatedPost } from "@/lib/accountAudit";

const hub = vi.hoisted(() => ({ invoke: vi.fn(), rows: [] as unknown[], row: null as unknown, read: [] as unknown[][] }));
vi.mock("@/lib/supabase", () => {
  const query = {
    select: () => query,
    eq: (...a: unknown[]) => (hub.read.push(a), query),
    order: () => query,
    limit: async () => ({ data: hub.rows, error: null }),
    maybeSingle: async () => ({ data: hub.row, error: null }),
  };
  return { supabase: { functions: { invoke: hub.invoke }, from: (t: string) => (hub.read.push(["from", t]), query) } };
});

const rated = (o: Partial<RatedPost> = {}): RatedPost => ({
  id: "C9xyz", url: "https://www.instagram.com/p/C9xyz/", format: "carousel", caption: "Three CPF mistakes\nand how to fix them",
  postedAt: "2026-09-30T02:00:00Z", views: null, likes: 120, comments: 14, shares: null, saves: null, durationSec: null,
  pinned: false, collab: false, interactions: 134, engagementRate: 2.1, ratio: 2.4, young: false, ...o,
});

describe("remixUrl", () => {
  it("names the post as its source, audit:<platform>:<post id>", () => {
    const url = new URL(remixUrl(rated(), "instagram", "leo.tan"), "https://x");
    expect(url.searchParams.get("source")).toBe("audit:instagram:C9xyz");
    expect(url.searchParams.get("format")).toBe("carousel");
  });
});

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

describe("openAudit", () => {
  it("shows the audit service's own reason when it refuses, and a connection line when it says nothing", async () => {
    const refused = (body: unknown) => ({ data: null, error: { context: new Response(JSON.stringify(body), { status: 422 }) } });
    hub.invoke.mockResolvedValueOnce(refused({ error: "@ada.tan is private, so the audit can't read its posts." }));
    await expect(openAudit("instagram", "ada.tan", "")).rejects.toThrow("@ada.tan is private, so the audit can't read its posts.");
    hub.invoke.mockResolvedValueOnce(refused({}));
    await expect(openAudit("instagram", "ada.tan", "")).rejects.toThrow("Couldn't reach the audit service. Check your connection and try again.");
    hub.invoke.mockResolvedValueOnce({ data: null, error: new Error("Failed to send a request") });
    await expect(openAudit("instagram", "ada.tan", "")).rejects.toThrow("Couldn't reach the audit service.");
    hub.invoke.mockResolvedValueOnce({ data: {}, error: null });
    await expect(openAudit("instagram", "ada.tan", "")).rejects.toThrow("The audit service sent nothing back. Try again.");
    hub.invoke.mockResolvedValueOnce({ data: { audit: { id: "a1" }, notice: "Refreshing in the background." }, error: null });
    expect(await openAudit("instagram", "ada.tan", "")).toEqual({ audit: { id: "a1" }, notice: "Refreshing in the background." });
    expect(hub.invoke).toHaveBeenLastCalledWith("audit-social-account", { body: { platform: "instagram", handle: "ada.tan", profession: "" } });
  });

  it("sends the open brand's profession, and an empty one for an adviser's so the server never reads the brand kit", async () => {
    hub.invoke.mockResolvedValue({ data: { audit: { id: "a1" } }, error: null });
    await openAudit("instagram", "ada.tan", "coach");
    expect(hub.invoke).toHaveBeenLastCalledWith("audit-social-account", { body: { platform: "instagram", handle: "ada.tan", profession: "coach" } });
    await openAudit("tiktok", "ada.tan", "");
    expect(hub.invoke).toHaveBeenLastCalledWith("audit-social-account", { body: { platform: "tiktok", handle: "ada.tan", profession: "" } });
  });
});

describe("requestIdeas", () => {
  it("sends the open brand's profession, and none for an adviser's (today's body)", async () => {
    hub.invoke.mockResolvedValue({ data: { ideas: [] }, error: null });
    await requestIdeas("a1", "real estate agent");
    expect(hub.invoke).toHaveBeenLastCalledWith("suggest-post-ideas", { body: { auditId: "a1", profession: "real estate agent" } });
    await requestIdeas("a1", "");
    expect(JSON.parse(JSON.stringify(hub.invoke.mock.lastCall))).toEqual(["suggest-post-ideas", { body: { auditId: "a1" } }]);
  });
});

describe("post ideas", () => {
  it("shows only the newest batch, skipped ideas included", async () => {
    hub.rows = [
      { id: "n1", batch: 3, position: 0, status: "new" },
      { id: "n2", batch: 3, position: 1, status: "dismissed" },
      { id: "o1", batch: 2, position: 0, status: "used" },
    ];
    expect((await loadLatestIdeas("a1")).map((r) => r.id)).toEqual(["n1", "n2"]);
    hub.rows = [];
    expect(await loadLatestIdeas("a1")).toEqual([]);
  });
});

describe("shortDate", () => {
  it("adds the year to a post from another year, so a pinned old post doesn't read as this week", () => {
    const now = new Date();
    const lastYear = new Date(now.getFullYear() - 1, 8, 14, 12).toISOString();
    const thisYear = new Date(now.getFullYear(), 0, 14, 12).toISOString();
    expect(shortDate(lastYear, now)).toContain(String(now.getFullYear() - 1));
    expect(shortDate(thisYear, now)).not.toContain(String(now.getFullYear()));
    expect(shortDate(null, now)).toBe("undated");
  });
});

describe("Use my own posts on /voice", () => {
  const p = (caption: string, collab = false) => ({ caption, collab });
  const long = (n: number, tag = "") => `${tag}${"x".repeat(n - tag.length)}`;
  it("picks the longest captions of 100+ characters, skipping collabs and repeats, at most the empty slots", () => {
    const posts = [p(long(120, "a")), p(long(99, "short")), p(long(300, "collab"), true), p(long(250, "b")), p(long(120, "a")), p(long(180, "c")), p(`  ${long(100, "d")}  `)];
    expect(captionsForVoice(posts, 5)).toEqual([long(250, "b"), long(180, "c"), long(120, "a"), long(100, "d")]);
    expect(captionsForVoice(posts, 2)).toEqual([long(250, "b"), long(180, "c")]);
    expect(captionsForVoice(posts, 0)).toEqual([]);
    expect(captionsForVoice([p(long(99)), p(long(400), true)], 5)).toEqual([]);
  });
  it("reads the saved audit row directly, never through the audit service", async () => {
    hub.read.length = 0;
    hub.invoke.mockClear();
    hub.row = { id: "a1", posts: [] };
    expect(await loadAuditFor("instagram", "ada.tan")).toEqual({ id: "a1", posts: [] });
    expect(hub.read).toEqual([["from", "cs_social_audits"], ["platform", "instagram"], ["handle", "ada.tan"]]);
    hub.row = null;
    expect(await loadAuditFor("tiktok", "ada.tan")).toBeNull();
    expect(hub.invoke).not.toHaveBeenCalled();
  });
});
