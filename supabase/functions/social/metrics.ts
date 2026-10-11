// Real post numbers (Analytics > Use my real numbers): an adviser's post analytics, daily follower counts
// and Zernio's best times, read live from Zernio for their own connected accounts. Every read goes through
// the H3 helper in _shared/zernio.ts (profileId always the brand's own, every item filtered again by the
// caller's accounts), and a postId reaches /v1/analytics only after the post check (H2). Rules:
// docs/zernio-connection.md. Shapes are from https://zernio.com/openapi.json as of 2026-10-11, not yet seen
// against a live key. Pure: Zernio comes in. Also imported by the app and by notify (realMetrics).

import { NotYours, ZernioError, callerAccounts, checkPost, isProfileId, isZernioId, refId, requireAccounts, scopedList, scopedPage, type Zernio } from "../_shared/zernio.ts";

export const METRICS_ACTIONS = ["metrics", "followers", "best-time"] as const;
export type MetricsAction = (typeof METRICS_ACTIONS)[number];

/** Zernio's analytics read at most 366 days at once. */
export const MAX_DAYS = 366;
/** Posts per page: Zernio's most. */
export const PAGE_SIZE = 100;
const MAX_PAGE = 50;
const DAY = 86_400_000;

export type MetricsRequest =
  /** postId: one post's numbers (after the post check); otherwise a page of every post in from..to */
  | { action: "metrics"; profileId: string; postId: string | null; from: string; to: string; accountIds: string[] | null; page: number }
  | { action: "followers"; profileId: string; from: string; to: string; accountIds: string[] | null }
  | { action: "best-time"; profileId: string; accountIds: string[] | null };

type Parsed = { ok: true; req: MetricsRequest } | { ok: false; status: number; error: string };
const notFound: Parsed = { ok: false, status: 404, error: "Not found." };
const bad = (error: string): Parsed => ({ ok: false, status: 400, error });

const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);
/** A real YYYY-MM-DD day (not 2026-02-30), or null. */
const dayOf = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && utcDay(Date.parse(`${v}T00:00:00Z`) || 0) === v ? v : null);

/** Null when the action is not a metrics one. H1: a malformed id is a 404 before any other use. */
export function parseMetricsRequest(body: unknown, now = Date.now()): Parsed | null {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const action = b.action as MetricsAction;
  if (!METRICS_ACTIONS.includes(action)) return null;
  if (!isProfileId(b.profileId)) return notFound;
  const profileId = b.profileId;
  let accountIds: string[] | null = null;
  if (b.accountIds !== undefined && b.accountIds !== null) {
    if (!Array.isArray(b.accountIds) || b.accountIds.length === 0 || b.accountIds.length > 12 || !b.accountIds.every(isZernioId)) return notFound;
    accountIds = [...new Set(b.accountIds as string[])];
  }
  if (action === "best-time") return { ok: true, req: { action, profileId, accountIds } };
  if (action === "metrics" && b.postId !== undefined && b.postId !== null) {
    if (!isZernioId(b.postId)) return notFound;
    return { ok: true, req: { action, profileId, postId: b.postId, from: "", to: "", accountIds: null, page: 1 } };
  }
  // Zernio's own defaults: today, and 90 days (posts) or a year (followers) before it
  const to = b.to === undefined ? utcDay(now) : dayOf(b.to);
  const from = b.from === undefined && to ? utcDay(Date.parse(to) - (action === "followers" ? MAX_DAYS - 1 : 89) * DAY) : dayOf(b.from);
  if (!from || !to || from > to || to > utcDay(now + DAY)) return bad("Pick the period again.");
  if ((Date.parse(to) - Date.parse(from)) / DAY + 1 > MAX_DAYS) return bad("Pick a period of up to a year.");
  if (action === "followers") return { ok: true, req: { action, profileId, from, to, accountIds } };
  const page = Number.isInteger(b.page) && (b.page as number) >= 1 && (b.page as number) <= MAX_PAGE ? (b.page as number) : 1;
  return { ok: true, req: { action, profileId, postId: null, from, to, accountIds, page } };
}

// ---- what the app sees ----

/** A post's numbers as Zernio reports them. */
export interface Numbers {
  impressions: number;
  reach: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}

export interface MetricsPost {
  id: string;
  /** The Zernio post it came from, when it went out through Zernio. A draft posted from the app keeps the same id. */
  zernioPostId: string | null;
  platform: string;
  accountId: string;
  publishedAt: string | null;
  text: string;
  url: string | null;
  numbers: Numbers;
}

export interface AccountRef {
  id: string;
  platform: string;
  username: string;
}

export interface FollowerSeries extends AccountRef {
  followers: number | null;
  /** Daily counts, oldest first. */
  series: { date: string; followers: number }[];
}

export interface BestTimes extends AccountRef {
  /** day 0 = Monday; the hour is UTC, as Zernio groups them. */
  slots: { day: number; utcHour: number; engagement: number; posts: number }[];
}

const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");
const https = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v : null);

export function numbersOf(a: unknown): Numbers {
  const m = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
  return { impressions: count(m.impressions), reach: count(m.reach), views: count(m.views), likes: count(m.likes), comments: count(m.comments), shares: count(m.shares), saves: count(m.saves) };
}

/**
 * The app's own four numbers from Zernio's: impressions is the first of impressions, reach and views that
 * is not zero (Zernio's own basis for a post's engagement rate), reactions are likes.
 */
export function realMetrics(n: Partial<Numbers>): { impressions: number; reactions: number; comments: number; shares: number } {
  const c = numbersOf(n);
  return { impressions: c.impressions || c.reach || c.views, reactions: c.likes, comments: c.comments, shares: c.shares };
}

// deno-lint-ignore no-explicit-any
export function postView(p: any): MetricsPost {
  const first = (Array.isArray(p?.platforms) ? p.platforms : Array.isArray(p?.platformAnalytics) ? p.platformAnalytics : [])[0] ?? {};
  const late = isZernioId(p?.latePostId) ? p.latePostId : p?.isExternal === false && isZernioId(p?._id) ? p._id : null;
  return {
    id: str(p?._id ?? p?.postId, 40),
    zernioPostId: late,
    platform: str(p?.platform || first?.platform, 40),
    accountId: refId(first?.accountId),
    publishedAt: str(p?.publishedAt, 40) || null,
    text: str(p?.content),
    url: https(p?.platformPostUrl) ?? https(first?.platformPostUrl),
    numbers: numbersOf(p?.analytics),
  };
}

function seriesOf(v: unknown): FollowerSeries["series"] {
  const list = Array.isArray(v) ? v : [];
  return list
    .filter((x) => dayOf(x?.date) && typeof x?.followers === "number" && Number.isFinite(x.followers) && x.followers >= 0)
    .map((x) => ({ date: x.date as string, followers: Math.round(x.followers) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(-400);
}

// deno-lint-ignore no-explicit-any
const slotView = (s: any) =>
  Number.isInteger(s?.day_of_week) && s.day_of_week >= 0 && s.day_of_week <= 6 && Number.isInteger(s?.hour) && s.hour >= 0 && s.hour <= 23
    ? [{ day: s.day_of_week, utcHour: s.hour, engagement: Math.round((Number(s.avg_engagement) || 0) * 10) / 10, posts: count(s.post_count) }]
    : [];

// ---- the actions ----

type Reply = { status: number; body: Record<string, unknown> };
const ok = (body: Record<string, unknown>): Reply => ({ status: 200, body });

/** Runs one metrics action for the caller's brand. mapped: the brand's Zernio profile, or null before its first connect. */
export async function runMetrics(z: Zernio, mapped: string | null, q: MetricsRequest): Promise<Reply> {
  const single = q.action === "metrics" && q.postId;
  if (!mapped) {
    if (single) throw new NotYours("no profile");
    return ok({ accounts: [], ...(q.action === "metrics" ? { posts: [], page: 1, pages: 1 } : {}) });
  }
  const own = await callerAccounts(z, mapped);
  const ids = new Set(own.map((a) => a._id));
  const accounts: AccountRef[] = own.map((a) => ({ id: a._id, platform: a.platform, username: a.username ?? "" }));

  if (q.action === "metrics" && q.postId) {
    // H2: that endpoint also takes other ids (external platform ones), so the post is checked first
    await checkPost(z, ids, q.postId);
    const [item] = await scopedList(z, "/analytics", mapped, ids, { postId: q.postId });
    return ok({ post: item ? postView(item) : null });
  }

  const wanted = q.accountIds ? requireAccounts(ids, q.accountIds) : [...ids];
  // only the asked-for accounts survive the H3 filter
  const keep = new Set(wanted);
  const nameOf = (id: string) => accounts.find((a) => a.id === id)!;

  if (q.action === "metrics") {
    if (!wanted.length) return ok({ accounts, posts: [], page: 1, pages: 1 });
    const { items, pages } = await scopedPage(z, "/analytics", mapped, keep, {
      fromDate: q.from,
      toDate: q.to,
      limit: String(PAGE_SIZE),
      page: String(q.page),
      sortBy: "date",
      order: "desc",
      accountId: wanted.length === 1 ? wanted[0] : undefined,
    });
    // a post with paid delivery in its numbers is not organic reach (Zernio's isAd)
    const posts = (items as Record<string, unknown>[]).filter((p) => p?.isAd !== true).map(postView);
    return ok({ accounts, posts, page: q.page, pages });
  }

  if (!wanted.length) return ok({ accounts: [] });

  if (q.action === "followers") {
    const items = (await scopedList(z, "/accounts/follower-stats", mapped, keep, {
      accountIds: wanted.join(","),
      fromDate: q.from,
      toDate: q.to,
      granularity: "daily",
    })) as Record<string, unknown>[];
    const out: FollowerSeries[] = items.map((i) => {
      const a = nameOf(refId(i._id));
      return { ...a, followers: typeof i.currentFollowers === "number" && i.currentFollowers >= 0 ? Math.round(i.currentFollowers) : null, series: seriesOf(i.series) };
    });
    return ok({ accounts: out });
  }

  // best-time: Zernio's slots name no account, so one read per checked account
  const out: BestTimes[] = [];
  for (const id of wanted) {
    const slots = await scopedList(z, "/analytics/best-time", mapped, keep, { accountId: id });
    out.push({ ...nameOf(id), slots: slots.flatMap(slotView) });
  }
  return ok({ accounts: out });
}

/** Zernio's refusals of an analytics read in plain words; null leaves it to the shared errorReply. */
export function metricsErrorReply(e: unknown): Reply | null {
  if (!(e instanceof ZernioError)) return null;
  // legacy Zernio plans need the Analytics add-on: /v1/analytics answers 402, follower stats 403
  if (e.status === 402 || e.status === 403) return { status: 402, body: { code: "no_analytics", error: "Analytics isn't on this Zernio plan." } };
  if (e.status === 424) return { status: 409, body: { code: "not_posted", error: "That post didn't go out, so it has no numbers." } };
  return null;
}
