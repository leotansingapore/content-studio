import { describe, expect, it } from "vitest";
import { NotYours, ZernioError, type ZAccount, type Zernio, type ZernioRequest } from "../_shared/zernio";
import { errorReply } from "./logic";
import { metricsErrorReply, parseMetricsRequest, realMetrics, runMetrics, type MetricsRequest } from "./metrics";

const MINE = "0123456789abcdef01234561";
const THEIRS = "0123456789abcdef01234569";
const IG = "65000000000000000000a001";
const LI = "65000000000000000000a004";
const VICTIM = "65000000000000000000b001";
const POST = "67000000000000000000d001";
const THEIR_POST = "67000000000000000000d009";
const NOW = Date.parse("2026-10-11T02:00:00Z");

const acct = (id: string, platform: string, profileId = MINE): ZAccount => ({ _id: id, platform, profileId, username: `u${id.slice(-3)}` });
const TEAM = [acct(IG, "instagram"), acct(LI, "linkedin"), acct(VICTIM, "instagram", THEIRS)];

/**
 * A fake Zernio: "METHOD /path" -> answer or a function of the request. An unrouted call fails the test,
 * and so does any analytics read that doesn't carry the caller's own profileId (H3).
 */
function fake(routes: Record<string, unknown>) {
  const calls: { key: string; req?: ZernioRequest }[] = [];
  const z: Zernio = async (method, path, req) => {
    const key = `${method} ${path}`;
    calls.push({ key, req });
    if (/^\/analytics|follower-stats/.test(path) && req?.query?.profileId !== MINE) throw new Error(`${key} without the caller's profileId`);
    if (!(key in routes)) throw new Error(`unexpected Zernio call ${key}`);
    const r = routes[key];
    if (r instanceof Error) throw r;
    return typeof r === "function" ? r(req) : r;
  };
  return { z, calls, keys: () => calls.map((c) => c.key), req: (key: string) => calls.find((c) => c.key === key)?.req };
}

const accounts = (req?: ZernioRequest) => ({ accounts: TEAM.filter((a) => a.profileId === req?.query?.profileId) });

// Shapes from https://zernio.com/openapi.json (AnalyticsListResponse, PlatformAnalytics, PostAnalytics).
const item = (id: string, accountId: string, extra: Record<string, unknown> = {}) => ({
  _id: id,
  latePostId: null,
  content: "Three things to check before you renew.",
  publishedAt: "2026-10-08T01:00:00.000Z",
  platform: TEAM.find((a) => a._id === accountId)?.platform ?? "instagram",
  isExternal: true,
  analytics: { impressions: 0, reach: 900, views: 1500, likes: 40, comments: 6, shares: 3, saves: 11 },
  platforms: [{ platform: "instagram", accountId, status: "published", platformPostUrl: "https://www.instagram.com/p/abc/" }],
  ...extra,
});

const list = (q: Partial<Extract<MetricsRequest, { action: "metrics" }>> = {}): MetricsRequest => ({
  action: "metrics",
  profileId: "me",
  postId: null,
  from: "2026-07-14",
  to: "2026-10-11",
  accountIds: null,
  page: 1,
  ...q,
});

describe("the request", () => {
  it("answers a malformed id or a missing brand with 404 before any other use (H1)", () => {
    for (const body of [
      { action: "metrics" },
      { action: "metrics", profileId: "ME!" },
      { action: "metrics", profileId: "me", postId: `../accounts/${VICTIM}` },
      { action: "metrics", profileId: "me", accountIds: [IG, "x"] },
      { action: "followers", profileId: "me", accountIds: [] },
      { action: "best-time", profileId: "me", accountIds: [IG.toUpperCase()] },
    ]) {
      expect(parseMetricsRequest(body, NOW), JSON.stringify(body)).toEqual({ ok: false, status: 404, error: "Not found." });
    }
  });

  it("takes Zernio's own default periods and refuses one longer than a year or in the future", () => {
    expect(parseMetricsRequest({ action: "metrics", profileId: "me" }, NOW)).toEqual({ ok: true, req: list({ from: "2026-07-14", to: "2026-10-11" }) });
    expect(parseMetricsRequest({ action: "followers", profileId: "me" }, NOW)).toMatchObject({ ok: true, req: { from: "2025-10-11", to: "2026-10-11" } });
    expect(parseMetricsRequest({ action: "metrics", profileId: "me", from: "2025-10-10", to: "2026-10-11" }, NOW)).toMatchObject({ ok: false, status: 400 });
    expect(parseMetricsRequest({ action: "metrics", profileId: "me", from: "2026-02-30", to: "2026-10-11" }, NOW)).toMatchObject({ ok: false, status: 400 });
    expect(parseMetricsRequest({ action: "metrics", profileId: "me", from: "2026-10-01", to: "2026-10-20" }, NOW)).toMatchObject({ ok: false, status: 400 });
    expect(parseMetricsRequest({ action: "metrics", profileId: "me", from: "2026-10-05", to: "2026-10-01" }, NOW)).toMatchObject({ ok: false, status: 400 });
  });

  it("leaves every other action to the other parsers", () => {
    expect(parseMetricsRequest({ action: "status", profileId: "me" }, NOW)).toBeNull();
    expect(parseMetricsRequest({ action: "post", profileId: "me", postId: POST }, NOW)).toBeNull();
  });
});

describe("post numbers", () => {
  it("reads every analytics page with the brand's own profile and keeps only the caller's accounts' posts (H3)", async () => {
    const f = fake({
      "GET /accounts": accounts,
      "GET /analytics": {
        posts: [
          item("e1", IG),
          item("e2", VICTIM),
          item("e3", IG, { platforms: [{ accountId: IG }, { accountId: VICTIM }] }),
          item("e4", IG, { platforms: [] }),
          item("e5", LI, { isAd: true }),
          item("e6", LI, { latePostId: POST, isExternal: false }),
        ],
        pagination: { page: 1, limit: 100, total: 6, pages: 2 },
      },
    });
    const r = await runMetrics(f.z, MINE, list());
    expect(r.status).toBe(200);
    expect((r.body.posts as { id: string }[]).map((p) => p.id)).toEqual(["e1", "e6"]);
    expect(r.body).toMatchObject({ page: 1, pages: 2 });
    expect(r.body.posts).toContainEqual(expect.objectContaining({ id: "e6", zernioPostId: POST, platform: "linkedin", accountId: LI }));
    expect(r.body.posts).toContainEqual(
      expect.objectContaining({ id: "e1", zernioPostId: null, url: "https://www.instagram.com/p/abc/", numbers: { impressions: 0, reach: 900, views: 1500, likes: 40, comments: 6, shares: 3, saves: 11 } }),
    );
    expect(f.req("GET /analytics")?.query).toMatchObject({ profileId: MINE, fromDate: "2026-07-14", toDate: "2026-10-11", limit: "100", page: "1", accountId: undefined });
  });

  it("checks requested accounts and keeps only theirs, naming one account to Zernio", async () => {
    const f = fake({ "GET /accounts": accounts, "GET /analytics": { posts: [item("e1", IG), item("e2", LI)] } });
    const r = await runMetrics(f.z, MINE, list({ accountIds: [LI] }));
    expect((r.body.posts as { id: string }[]).map((p) => p.id)).toEqual(["e2"]);
    expect(f.req("GET /analytics")?.query?.accountId).toBe(LI);
    await expect(runMetrics(fake({ "GET /accounts": accounts }).z, MINE, list({ accountIds: [VICTIM] }))).rejects.toBeInstanceOf(NotYours);
  });

  it("answers a post from another adviser with 404 and never asks Zernio for its numbers (H2)", async () => {
    const f = fake({
      "GET /accounts": accounts,
      [`GET /posts/${THEIR_POST}`]: { post: { _id: THEIR_POST, platforms: [{ platform: "instagram", accountId: VICTIM }] } },
    });
    const e = await runMetrics(f.z, MINE, list({ postId: THEIR_POST })).catch((x) => x);
    expect(e).toBeInstanceOf(NotYours);
    expect(errorReply(e)).toEqual({ status: 404, body: { error: "Not found." } });
    expect(f.keys()).not.toContain("GET /analytics");
  });

  it("reads one of the caller's own posts by id after the post check", async () => {
    const f = fake({
      "GET /accounts": accounts,
      [`GET /posts/${POST}`]: { post: { _id: POST, platforms: [{ platform: "instagram", accountId: IG }] } },
      "GET /analytics": { postId: "e9", latePostId: POST, content: "Hi", status: "published", analytics: { likes: 4 }, platformAnalytics: [{ platform: "instagram", accountId: IG }] },
    });
    const r = await runMetrics(f.z, MINE, list({ postId: POST }));
    expect(f.keys()).toEqual(["GET /accounts", `GET /posts/${POST}`, "GET /analytics"]);
    expect(f.req("GET /analytics")?.query).toMatchObject({ postId: POST, profileId: MINE });
    expect(r.body.post).toMatchObject({ id: "e9", zernioPostId: POST, numbers: { likes: 4 } });
  });

  it("makes no analytics call before the brand's first connect or with no accounts", async () => {
    const none = fake({});
    expect((await runMetrics(none.z, null, list())).body).toEqual({ accounts: [], posts: [], page: 1, pages: 1 });
    expect(none.calls).toEqual([]);
    await expect(runMetrics(none.z, null, list({ postId: POST }))).rejects.toBeInstanceOf(NotYours);
    const empty = fake({ "GET /accounts": { accounts: [] } });
    expect((await runMetrics(empty.z, MINE, list())).body).toMatchObject({ posts: [] });
    expect(empty.keys()).toEqual(["GET /accounts"]);
  });
});

describe("followers and best times", () => {
  it("keeps only the caller's accounts' daily counts, even when Zernio sends others (H3)", async () => {
    const f = fake({
      "GET /accounts": accounts,
      "GET /accounts/follower-stats": {
        accounts: [
          { _id: IG, platform: "instagram", currentFollowers: 1250 },
          { _id: VICTIM, platform: "instagram", currentFollowers: 9000 },
        ],
        stats: {
          [IG]: [{ date: "2026-10-02", followers: 1250 }, { date: "2026-10-01", followers: 1200 }, { date: "bad", followers: 3 }],
          [VICTIM]: [{ date: "2026-10-01", followers: 9000 }],
          [LI]: [{ date: "2026-10-01", followers: 77 }],
        },
      },
    });
    const r = await runMetrics(f.z, MINE, { action: "followers", profileId: "me", from: "2025-10-11", to: "2026-10-11", accountIds: null });
    expect(r.body.accounts).toEqual([
      { id: IG, platform: "instagram", username: "u001", followers: 1250, series: [{ date: "2026-10-01", followers: 1200 }, { date: "2026-10-02", followers: 1250 }] },
    ]);
    expect(f.req("GET /accounts/follower-stats")?.query).toMatchObject({ profileId: MINE, accountIds: `${IG},${LI}`, granularity: "daily" });
  });

  it("asks for best times one checked account at a time", async () => {
    const f = fake({
      "GET /accounts": accounts,
      "GET /analytics/best-time": (req?: ZernioRequest) => ({ slots: req?.query?.accountId === IG ? [{ day_of_week: 2, hour: 11, avg_engagement: 51.04, post_count: 4 }, { day_of_week: 9, hour: 1 }] : [] }),
    });
    const r = await runMetrics(f.z, MINE, { action: "best-time", profileId: "me", accountIds: null });
    expect(r.body.accounts).toEqual([
      { id: IG, platform: "instagram", username: "u001", slots: [{ day: 2, utcHour: 11, engagement: 51, posts: 4 }] },
      { id: LI, platform: "linkedin", username: "u004", slots: [] },
    ]);
    expect(f.calls.filter((c) => c.key === "GET /analytics/best-time").map((c) => c.req?.query?.accountId)).toEqual([IG, LI]);
  });
});

describe("in plain words", () => {
  it("says analytics isn't on the plan for Zernio's 402 or 403", () => {
    for (const status of [402, 403]) {
      expect(metricsErrorReply(new ZernioError(status, "analytics_addon_required", "Analytics add-on required"))).toEqual({
        status: 402,
        body: { code: "no_analytics", error: "Analytics isn't on this Zernio plan." },
      });
    }
    expect(metricsErrorReply(new ZernioError(504, "timeout", "slow"))).toBeNull();
  });

  it("turns Zernio's numbers into the app's four, impressions first then reach then views", () => {
    expect(realMetrics({ impressions: 0, reach: 900, views: 1500, likes: 40, comments: 6, shares: 3, saves: 11 })).toEqual({ impressions: 900, reactions: 40, comments: 6, shares: 3 });
    expect(realMetrics({ impressions: 2000, reach: 900 })).toEqual({ impressions: 2000, reactions: 0, comments: 0, shares: 0 });
    expect(realMetrics({ views: 300 }).impressions).toBe(300);
  });
});
