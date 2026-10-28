// Pure logic for the notify function (index.ts): which phone alerts and
// emails are due for one adviser, and their words. No Deno APIs or network
// here, so vitest covers it. The week and goal rules mirror src/lib/goals.ts
// and src/lib/dueDates.ts; keep them in step. The week's report (weekReport)
// also feeds Analytics' This week card, and its one move is picked by Jev in
// this function and in week-pick.

import { choiceOf, type JevAnswer, type JevQuestion } from "../_shared/jev.ts";
import { scoreAccount, times } from "../_shared/outlier.ts";
import { median } from "../_shared/socialAudit.ts";
import { realMetrics } from "../social/metrics.ts";
import { TIMEZONE } from "../social/posts.ts";
import { instantIn, postZone } from "../_shared/zone.ts";

export const APP_URL = "https://app.postmosis.com";
export const PREFS_PREFIX = "content-studio-notify-";
/** The per-brand synced keys profilesFrom reads (content-studio-<name>-<uid>[~<profile>]), besides the profile list. */
export const BRAND_KEYS = ["drafts", "goals", "positioning", "following", "market", "mentions", "competitor-posts", "competitor-ads"] as const;

const SG_MS = 8 * 3_600_000; // Singapore is UTC+8 all year, no DST
/** A post is "due soon" from an hour before its time to 10 minutes after (a late cron run). */
export const DUE_AHEAD_MS = 60 * 60_000;
export const DUE_LATE_MS = 10 * 60_000;
/** A post with a day but no time is due at 9am that day. */
const DAY_ONLY_HOUR = 9;
const MAX_DUE = 10;
const PLATFORMS = ["linkedin", "instagram", "facebook", "tiktok"] as const;
const PLATFORM_LABEL: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};
const MAX_WEEKLY_GOAL = 21;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface Prefs {
  email: boolean;
  push: boolean;
  /** What moved in the Monday email; only NORTH_STAR_USERS get it (run.ts). */
  brief: boolean;
  /** A phone alert when a followed account posts a hit; same gate. */
  alerts: boolean;
}

/** The switches in My Playbook. Anything but an explicit true is off. */
export function parsePrefs(data: string | null | undefined): Prefs {
  try {
    const p = JSON.parse(data ?? "");
    return { email: p?.email === true, push: p?.push === true, brief: p?.brief === true, alerts: p?.alerts === true };
  } catch {
    return { email: false, push: false, brief: false, alerts: false };
  }
}

const PUSH_ENDPOINT =
  /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+$/;

/** Same rule as the table check in 016_notify.sql: https on a known push service. */
export function isPushEndpoint(url: unknown): url is string {
  return typeof url === "string" && url.length <= 1024 && PUSH_ENDPOINT.test(url);
}

export interface Metrics {
  impressions?: number;
  reactions?: number;
  comments?: number;
  shares?: number;
}

export interface Post {
  id: string;
  hook: string;
  platform: string;
  status?: string;
  scheduledFor?: string;
  /** The IANA zone its time is in (_shared/zone.ts postZone: its Zernio post's, else the one saved with its time); Singapore when absent. */
  tz?: string;
  postedAt?: string;
  metrics?: Metrics;
  format?: string;
  pillar?: string;
  hookFormula?: string;
}

/** A followed or competitor post (TrackedPost). Lists stored before What moved may hold only the date. */
export interface FollowedPost {
  postedAt: string | null;
  id?: string;
  url?: string;
  format?: string;
  caption?: string;
  views?: number | null;
  likes?: number;
  comments?: number;
}

/** An account the adviser follows (src/lib/following.ts), or a competitor's in the same shape: follower snapshots and its newest posts. */
export interface Followed {
  platform: string;
  handle: string;
  history: { at: string; followers: number | null }[];
  posts: FollowedPost[];
  /** Ids new on the latest check. */
  fresh?: string[];
}

/** A competitor's Meta ads (src/lib/competitorAds.ts): ids new on the latest check, and the newest of them by start day. */
export interface CompetitorAds {
  competitorId: string;
  name: string;
  checkedAt: string;
  fresh: string[];
  newest: string;
}

export interface Profile {
  id: string;
  name: string;
  posts: Post[];
  goals: Record<string, number>;
  followed?: Followed[];
  /** Your market (src/lib/market.ts): set up enough to check, and when the last check ran. */
  market?: { ready: boolean; lastCheck: string | null };
  /** Their posts and Their ads on /competitors; absent without the keys. */
  competitorPosts?: Followed[];
  competitorAds?: CompetitorAds[];
  /** What the brand sells and who it serves, for What moved's Jev question (decision 6); absent when neither is set. */
  brand?: { sells: string; serves: string };
}

function parseJson(raw: string | null | undefined): unknown {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

function postsFrom(raw: string | undefined, linked: boolean): Post[] {
  const list = parseJson(raw);
  if (!Array.isArray(list)) return [];
  const out: Post[] = [];
  for (const d of list.slice(0, 200)) {
    if (!d || typeof d !== "object" || typeof d.id !== "string" || !d.id) continue;
    const m = d.metrics && typeof d.metrics === "object" ? d.metrics : undefined;
    // the real numbers pulled for a post that went out through Zernio, else, for NORTH_STAR_USERS only, for a
    // hand-posted one linked to its live post (learn-real-numbers), over typed ones
    const pulled = d.zernio?.numbers ?? (linked ? d.live?.numbers : undefined);
    const real = pulled && typeof pulled === "object" ? realMetrics(pulled) : undefined;
    out.push({
      id: d.id,
      hook: str(d.hook) ?? "",
      platform: str(d.platform) ?? "",
      status: str(d.status),
      scheduledFor: str(d.scheduledFor),
      ...(postZone(d) !== TIMEZONE ? { tz: postZone(d) } : {}),
      postedAt: str(d.postedAt),
      metrics:
        real ?? (m ? { impressions: num(m.impressions), reactions: num(m.reactions), comments: num(m.comments), shares: num(m.shares) } : undefined),
      format: str(d.format),
      pillar: str(d.pillar),
      hookFormula: str(d.hookFormula),
    });
  }
  return out;
}

function accountFrom(a: unknown): Followed[] {
  const v = a as { platform?: unknown; handle?: unknown; history?: unknown; posts?: unknown; fresh?: unknown } | null;
  if (!v || typeof v !== "object" || typeof v.handle !== "string" || !v.handle || !Array.isArray(v.history)) return [];
  return [{
    platform: str(v.platform) ?? "",
    handle: clip(v.handle, 60),
    history: v.history.slice(-120).flatMap((x: unknown) => {
      const snap = x as { at?: unknown; followers?: unknown } | null;
      return snap && typeof snap.at === "string" ? [{ at: snap.at, followers: num(snap.followers) ?? null }] : [];
    }),
    posts: (Array.isArray(v.posts) ? v.posts : []).slice(0, 60).flatMap((x: unknown): FollowedPost[] => {
      if (!x || typeof x !== "object") return [];
      const p = x as Record<string, unknown>;
      const postedAt = str(p.postedAt) ?? null;
      // what an outlier needs; a post without an id keeps only its date, as before
      return [typeof p.id === "string" && p.id
        ? { postedAt, id: p.id.slice(0, 120), url: str(p.url) ?? "", format: str(p.format) ?? "", caption: clip(str(p.caption) ?? "", 120),
            views: num(p.views) ?? null, likes: num(p.likes) ?? 0, comments: num(p.comments) ?? 0 }
        : { postedAt }];
    }),
    ...(Array.isArray(v.fresh) ? { fresh: v.fresh.filter((id): id is string => typeof id === "string").slice(0, 60) } : {}),
  }];
}

function followedFrom(raw: string | undefined): Followed[] {
  const list = parseJson(raw);
  return Array.isArray(list) ? list.slice(0, 10).flatMap(accountFrom) : [];
}

const entries = (raw: string | undefined): unknown[] => {
  const v = parseJson(raw);
  return v && typeof v === "object" && !Array.isArray(v) ? Object.values(v) : [];
};

/** Their posts: one Following-shaped account per competitor handle (12 competitors, 2 platforms). */
const competitorPostsFrom = (raw: string | undefined): Followed[] => entries(raw).slice(0, 24).flatMap(accountFrom);

/** Their ads, keyed by competitor id. */
function competitorAdsFrom(raw: string | undefined): CompetitorAds[] {
  const v = parseJson(raw);
  if (!v || typeof v !== "object" || Array.isArray(v)) return [];
  return Object.entries(v).slice(0, 12).flatMap(([competitorId, e]) => {
    const x = e as { checkedAt?: unknown; pageName?: unknown; ads?: unknown; fresh?: unknown } | null;
    if (!x || typeof x.checkedAt !== "string" || !Array.isArray(x.fresh)) return [];
    const fresh = x.fresh.filter((id): id is string => typeof id === "string" && !!id).slice(0, 30);
    if (!fresh.length) return [];
    const started = (Array.isArray(x.ads) ? x.ads : [])
      .flatMap((a) => (a && fresh.includes(a.id) ? [{ id: a.id as string, start: str(a.start) ?? "" }] : []))
      .sort((a, b) => b.start.localeCompare(a.start));
    return [{ competitorId: competitorId.slice(0, 80), name: clip(str(x.pageName) ?? "", 60), checkedAt: x.checkedAt, fresh, newest: started[0]?.id ?? fresh[0] }];
  });
}

/** competitors.ts brandFacts without the brand kit's offers (that row carries the photo and logo as data URLs). */
function brandFrom(positioningRaw: string | undefined, marketRaw: string | undefined): Profile["brand"] {
  const p = (parseJson(positioningRaw) ?? {}) as Record<string, unknown>;
  const m = (parseJson(marketRaw) ?? {}) as Record<string, unknown>;
  const sells = [p.oneLiner, p.edge].map((v) => clip(str(v) ?? "", 300).replace(/[.\s]+$/, "")).filter(Boolean).join(". ");
  const audience = str(p.audience);
  const serves = clip(str(p.audienceDetail)?.trim() || (audience && audience !== "general" ? `${audience.replace("-", " ")}s` : "") || (str(m.audience) ?? ""), 400);
  return sells || serves ? { sells, serves } : undefined;
}

function cleanGoals(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const p of PLATFORMS) {
    const n = Math.round(Number((raw as Record<string, unknown>)[p]));
    if (Number.isFinite(n) && n > 0) out[p] = Math.min(MAX_WEEKLY_GOAL, n);
  }
  return out;
}

/** goals.ts loadGoals: the saved goals, else positioning's cadence on its platform. */
function goalsFrom(goalsRaw: string | undefined, positioningRaw: string | undefined): Record<string, number> {
  if (goalsRaw == null) {
    const p = parseJson(positioningRaw) as Record<string, unknown> | null;
    if (!p || typeof p !== "object") return {};
    return cleanGoals({ [str(p.platform) ?? "linkedin"]: p.cadence ?? 3 });
  }
  return cleanGoals(parseJson(goalsRaw));
}

/**
 * The account's profiles with their posts and goals, from its synced rows
 * (key -> data). Profile keys follow src/lib/profiles.ts: the default profile
 * "me" uses the bare user id, others `${uid}~${profileId}`.
 */
/** The Your market key: ready once it has who they serve plus a question (or Mentions topics); the latest check's time. */
function marketFrom(raw: string | undefined, topicsRaw: string | undefined): Profile["market"] {
  const m = parseJson(raw) as { audience?: unknown; questions?: unknown; checks?: unknown } | null;
  if (!m || typeof m !== "object") return undefined;
  const topics = parseJson(topicsRaw);
  const asks = (Array.isArray(m.questions) && m.questions.length > 0) || (Array.isArray(topics) && topics.length > 0);
  const times = (Array.isArray(m.checks) ? m.checks : [])
    .map((c) => (c as { checkedAt?: unknown } | null)?.checkedAt)
    .filter((t): t is string => typeof t === "string" && Number.isFinite(Date.parse(t)))
    .sort();
  return { ready: typeof m.audience === "string" && m.audience.trim().length > 0 && asks, lastCheck: times[times.length - 1] ?? null };
}

/** `linked`: the uid is on NORTH_STAR_USERS, so a hand-posted draft's linked live numbers count. */
export function profilesFrom(uid: string, data: Record<string, string>, linked = false): Profile[] {
  const listed = parseJson(data[`content-studio-profiles-${uid}`]);
  const valid = (Array.isArray(listed) ? listed : []).filter(
    (p): p is { id: string; name: string } =>
      !!p && typeof p.id === "string" && /^[a-z0-9]{1,40}$/.test(p.id) && typeof p.name === "string" && !!p.name,
  );
  const me = valid.find((p) => p.id === "me") ?? { id: "me", name: "Me" };
  return [me, ...valid.filter((p) => p.id !== "me")].map((p) => {
    const scope = p.id === "me" ? uid : `${uid}~${p.id}`;
    const brand = brandFrom(data[`content-studio-positioning-${scope}`], data[`content-studio-market-${scope}`]);
    return {
      id: p.id,
      name: clip(p.name, 40),
      posts: postsFrom(data[`content-studio-drafts-${scope}`], linked),
      goals: goalsFrom(data[`content-studio-goals-${scope}`], data[`content-studio-positioning-${scope}`]),
      followed: followedFrom(data[`content-studio-following-${scope}`]),
      ...(data[`content-studio-market-${scope}`] === undefined ? {} : { market: marketFrom(data[`content-studio-market-${scope}`], data[`content-studio-mentions-${scope}`]) }),
      ...(data[`content-studio-competitor-posts-${scope}`] === undefined ? {} : { competitorPosts: competitorPostsFrom(data[`content-studio-competitor-posts-${scope}`]) }),
      ...(data[`content-studio-competitor-ads-${scope}`] === undefined ? {} : { competitorAds: competitorAdsFrom(data[`content-studio-competitor-ads-${scope}`]) }),
      ...(brand ? { brand } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// Singapore calendar
// ---------------------------------------------------------------------------

const isoDay = (utcMs: number) => new Date(utcMs).toISOString().slice(0, 10);
const shifted = (at: number) => new Date(at + SG_MS);

/** The Singapore day ("YYYY-MM-DD") of an instant. */
export const sgDay = (at: number) => isoDay(at + SG_MS);
export const sgHour = (at: number) => shifted(at).getUTCHours();
/** Monday = 0 ... Sunday = 6, in Singapore. */
export const sgWeekday = (at: number) => (shifted(at).getUTCDay() + 6) % 7;

function dayParts(day: string): [number, number, number] {
  return [Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))];
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = dayParts(day);
  return isoDay(Date.UTC(y, m, d + n));
}

export function mondayOf(day: string): string {
  const [y, m, d] = dayParts(day);
  return addDays(day, -((new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7));
}

/** The Singapore day a post went out (postedAt is an instant, or a bare day from an import). */
export function postedDayOf(postedAt: string | undefined): string | null {
  if (!postedAt) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(postedAt)) return postedAt;
  const t = Date.parse(postedAt);
  return Number.isNaN(t) ? null : sgDay(t);
}

/**
 * When a scheduled post is due: "YYYY-MM-DDTHH:MM" is that time on the clock in
 * `tz` (the post's own zone, DST-safe as Zernio is sent it), Singapore when it
 * has none; anything else starting with a day (a bare day, the board's older
 * ISO timestamps) counts as that day without a time, due at 9am.
 */
export function dueAt(scheduledFor: string | undefined, tz?: string): { at: number; day: string; time: string | null } | null {
  const timed = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(scheduledFor ?? "");
  if (timed) {
    const [, y, m, d, hh, mm] = timed.map(Number);
    const [day, time] = [scheduledFor!.slice(0, 10), scheduledFor!.slice(11, 16)];
    return { at: tz ? instantIn(day, time, tz) : Date.UTC(y, m - 1, d, hh, mm) - SG_MS, day, time };
  }
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(scheduledFor ?? "");
  if (!day) return null;
  const [, y, m, d] = day.map(Number);
  return { at: tz ? instantIn(day[0], `${String(DAY_ONLY_HOUR).padStart(2, "0")}:00`, tz) : Date.UTC(y, m - 1, d, DAY_ONLY_HOUR) - SG_MS, day: day[0], time: null };
}

/** "7:30pm", "9am", "12pm" (dueDates.ts timeLabel). */
export function timeLabel(time: string): string {
  const h = Number(time.slice(0, 2));
  const m = time.slice(3, 5);
  return `${h % 12 || 12}${m === "00" ? "" : `:${m}`}${h < 12 ? "am" : "pm"}`;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "5 Oct". */
const shortDate = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
/** "Tue 7 Oct". */
const dayLabel = (day: string) => {
  const [y, m, d] = dayParts(day);
  return `${DAY_NAMES[(new Date(Date.UTC(y, m, d)).getUTCDay() + 6) % 7]} ${shortDate(day)}`;
};

/** One line of user text: control characters and runs of space folded, cut to n with "...". */
export function clip(text: string, n: number): string {
  // deno-lint-ignore no-control-regex
  const flat = text.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return flat.length <= n ? flat : `${flat.slice(0, n - 3).trimEnd()}...`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const platformLabel = (p: string) => PLATFORM_LABEL[p] ?? "Post";
const hookOf = (p: Post, n: number) => clip(p.hook || "Untitled post", n);

// ---------------------------------------------------------------------------
// Week progress (goals.ts weekProgress)
// ---------------------------------------------------------------------------

export function weekProgress(posts: Post[], goals: Record<string, number>, dayInWeek: string) {
  const start = mondayOf(dayInWeek);
  const end = addDays(start, 6);
  const inWeek = (day: string | null | undefined) => !!day && day >= start && day <= end;
  let goal = 0;
  let posted = 0;
  let scheduled = 0;
  let toDo = 0;
  for (const platform of PLATFORMS) {
    const mine = posts.filter((d) => d.platform === platform);
    const p = mine.filter((d) => d.status === "posted" && inWeek(postedDayOf(d.postedAt))).length;
    const s = mine.filter((d) => d.status === "scheduled" && inWeek(d.scheduledFor?.slice(0, 10))).length;
    const g = goals[platform] ?? 0;
    goal += g;
    posted += p;
    scheduled += s;
    toDo += Math.max(0, g - p - s);
  }
  return { goal, posted, scheduled, toDo };
}

// ---------------------------------------------------------------------------
// Phone alerts
// ---------------------------------------------------------------------------

export interface PushMessage {
  title: string;
  body: string;
  /** Path inside the app to open when the alert is tapped. */
  url: string;
  tag: string;
  /** Seconds the push service keeps trying; a due alert is useless an hour late. */
  ttl: number;
}

export interface DuePost {
  item: string;
  profileId: string;
  post: Post;
  time: string | null;
}

/** Scheduled posts due within the hour, soonest first, each with its sent-log item. */
export function duePosts(profiles: Profile[], now: number): DuePost[] {
  const out: (DuePost & { at: number })[] = [];
  for (const p of profiles) {
    for (const post of p.posts) {
      if (post.status !== "scheduled") continue;
      const due = dueAt(post.scheduledFor, post.tz);
      if (!due || due.at <= now - DUE_LATE_MS || due.at > now + DUE_AHEAD_MS) continue;
      out.push({
        item: `due:${p.id}:${post.id.slice(0, 80)}:${post.scheduledFor!.slice(0, 16)}`,
        profileId: p.id,
        post,
        time: due.time,
        at: due.at,
      });
    }
  }
  return out
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_DUE)
    .map(({ at: _at, ...rest }) => rest);
}

/** One alert for the due posts that were claimed: the post itself, or a count. */
export function dueMessage(due: DuePost[]): PushMessage | null {
  if (!due.length) return null;
  if (due.length === 1) {
    const [{ post, profileId, time, item }] = due;
    const profile = `&profile=${encodeURIComponent(profileId)}`;
    return {
      title: time ? `Due at ${timeLabel(time)}` : "Due today",
      body: `${platformLabel(post.platform)}: ${hookOf(post, 120)}`,
      url: `/generate?draft=${encodeURIComponent(post.id)}${profile}`,
      tag: item,
      ttl: 3600,
    };
  }
  return {
    title: `${due.length} posts are due`,
    body: clip(due.map((d) => hookOf(d.post, 60)).join(" / "), 180),
    url: "/home",
    tag: "due",
    ttl: 3600,
  };
}

/**
 * Thursday from 6pm Singapore: this week's goal still has posts that are
 * neither out nor scheduled (Home's "to do"). Sent-log item goal:<day>, so at
 * most once a day.
 */
export function goalAlert(profiles: Profile[], now: number): { item: string; message: PushMessage } | null {
  if (sgWeekday(now) !== 3 || sgHour(now) < 18) return null;
  const today = sgDay(now);
  const behind = profiles
    .map((p) => ({ p, w: weekProgress(p.posts, p.goals, today) }))
    .filter((x) => x.w.toDo > 0);
  if (!behind.length) return null;
  const line = (w: { posted: number; goal: number; toDo: number }) => `${w.posted} of ${w.goal} posted, ${w.toDo} to do`;
  const body =
    profiles.length === 1
      ? `${line(behind[0].w)}.`
      : behind.map((x) => `${x.p.name}: ${line(x.w)}`).join(". ") + ".";
  return {
    item: `goal:${today}`,
    message: { title: "This week's goal is behind", body: clip(body, 180), url: "/home", tag: "goal", ttl: 6 * 3600 },
  };
}

/** An allowed account with a set-up profile whose own week's check is unused (each brand profile has one a week). */
export function marketOpen(profiles: Profile[], now: number, enabled: boolean): boolean {
  if (!enabled) return false;
  // the server opens a profile's week 7 UTC days after its last check's UTC day (market/logic.ts weekGate)
  const open = (last: string | null) => !last || now >= Date.parse(`${last.slice(0, 10)}T00:00:00Z`) + 7 * 86_400_000;
  return profiles.some((p) => p.market?.ready && open(p.market.lastCheck));
}

/**
 * Monday from 9am, the account's week of Your market is open (the check is one a week per account, shared by its
 * profiles): a nudge to run it. `enabled` is the market function's MARKET_USERS allow-list for this account.
 */
export function marketAlert(profiles: Profile[], now: number, enabled: boolean): { item: string; message: PushMessage } | null {
  if (sgWeekday(now) !== 0 || sgHour(now) < 9 || !marketOpen(profiles, now, enabled)) return null;
  return {
    item: `market:${sgDay(now)}`,
    message: { title: "This week's market check is open", body: "See the news and client questions to post about this week.", url: "/market", tag: "market", ttl: 12 * 3600 },
  };
}

// ---------------------------------------------------------------------------
// Monday email
// ---------------------------------------------------------------------------

export interface Email {
  item: string;
  subject: string;
  text: string;
}

const engagementOf = (m?: Metrics) => (m?.reactions ?? 0) + (m?.comments ?? 0) + (m?.shares ?? 0);

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const impressionsOf = (p: Post) => p.metrics?.impressions ?? 0;
const hasNumbers = (p: Post) => engagementOf(p.metrics) > 0 || impressionsOf(p) > 0;

// ---------------------------------------------------------------------------
// The week's report (gap g44): the Monday email and Analytics' This week card
// both read weekReport. Counts and facts only; the one move for the week is
// picked by Jev (moveAsk, pickedMove), never by a rule here.
// ---------------------------------------------------------------------------

/** The names the app shows; logic.test.ts keeps them in step with analytics.ts and hookFormulas.ts. */
export const FORMAT_NOUN: Record<string, string> = { "text-post": "text posts", carousel: "carousels", "short-video": "short videos", story: "stories" };
export const PILLAR_NAME: Record<string, string> = { interest: "Interest", identity: "Identity", topic: "Topic", market: "Market" };
export const HOOK_NAME: Record<string, string> = {
  contrarian: "Contrarian take", "number-reveal": "Number reveal", mistake: "Mistake confession", "before-after": "Before and after",
  list: "The list", insider: "Insider view", callout: "The callout", dilemma: "Real dilemma", "cold-open": "Cold open",
  receipt: "The receipt", "myth-bust": "Myth bust", "side-by-side": "Side by side", permission: "Permission", blunt: "Short and blunt",
  warning: "The warning", "good-great": "Good vs great", "time-saved": "Time saved", "my-rule": "My rule", curiosity: "Curiosity gap",
  "walk-away": "The walk-away", "give-it-away": "Give it away",
};
type Label = "format" | "pillar" | "hookFormula";
const LABEL_NAMES: Record<Label, Record<string, string>> = { format: FORMAT_NOUN, pillar: PILLAR_NAME, hookFormula: HOOK_NAME };

export interface ReportPost {
  id: string;
  hook: string;
  platform: string;
  impressions: number;
  engagements: number;
}

/** A label most of the best posts share: count of `of` best posts, and how many of the weakest had it too. */
export interface Shared {
  label: Label;
  key: string;
  count: number;
  of: number;
  inWorst: number;
}

/** A followed account's follower change over the week, and how many of its newest posts went out in it. */
export interface Mover {
  handle: string;
  platform: string;
  gained: number;
  followers: number;
  posts: number;
}

export interface WeekReport {
  /** The 7 Singapore days reported, start to end. */
  start: string;
  end: string;
  posts: number;
  prevPosts: number;
  impressions: number;
  prevImpressions: number;
  engagements: number;
  prevEngagements: number;
  /** Posts in the week with no numbers added. */
  missing: number;
  goal: number;
  best: ReportPost[];
  worst: ReportPost[];
  shared: Shared[];
  movers: Mover[];
}

const dayOf = (at: string | null | undefined) => {
  const t = Date.parse(at ?? "");
  return Number.isNaN(t) ? null : sgDay(t);
};

/** The 7 days ending `end` against the 7 before: posts, the numbers typed in, best and weakest 3, what the best share, and followed accounts' movement. */
export function weekReport(posts: Post[], followed: Followed[], end: string, goal = 0): WeekReport {
  const start = addDays(end, -6);
  const postedIn = (a: string, b: string) =>
    posts.filter((p) => {
      const d = p.status === "posted" ? postedDayOf(p.postedAt) : null;
      return !!d && d >= a && d <= b;
    });
  const week = postedIn(start, end);
  const before = postedIn(addDays(end, -13), addDays(end, -7));
  const sum = (ps: Post[], f: (p: Post) => number) => ps.reduce((n, p) => n + f(p), 0);
  const rank = (a: Post, b: Post) => engagementOf(b.metrics) - engagementOf(a.metrics) || impressionsOf(b) - impressionsOf(a);
  const ranked = week.filter(hasNumbers).sort(rank);
  // best and weakest never overlap: on fewer than 6 posts each takes half, and a post level with the last best is not weakest
  const best = ranked.slice(0, Math.min(3, Math.ceil(ranked.length / 2)));
  const worst = ranked.slice(ranked.length - Math.min(3, Math.floor(ranked.length / 2))).reverse().filter((p) => rank(best[best.length - 1], p) < 0);
  const shared: Shared[] = [];
  if (best.length >= 2) {
    for (const label of ["format", "pillar", "hookFormula"] as const) {
      const counts = new Map<string, number>();
      for (const p of best) {
        const k = p[label];
        if (k && LABEL_NAMES[label][k]) counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      const top = [...counts].sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] >= 2) shared.push({ label, key: top[0], count: top[1], of: best.length, inWorst: worst.filter((p) => p[label] === top[0]).length });
    }
  }
  const movers = followed
    .flatMap((a) => {
      const snaps = a.history
        .flatMap((x) => (x.followers !== null && dayOf(x.at) ? [{ day: dayOf(x.at)!, t: Date.parse(x.at), followers: x.followers }] : []))
        .sort((x, y) => x.t - y.t);
      const inWeek = snaps.filter((x) => x.day >= start && x.day <= end);
      // from the week before at the oldest: an account last checked months ago would pass all that growth off as this week's
      const from = snaps.filter((x) => x.day < start && x.day >= addDays(start, -7)).pop() ?? inWeek[0];
      const to = inWeek[inWeek.length - 1];
      if (!from || !to || from === to) return [];
      const fresh = a.posts.filter((p) => {
        const d = dayOf(p.postedAt);
        return !!d && d >= start && d <= end;
      }).length;
      return [{ handle: a.handle, platform: a.platform, gained: to.followers - from.followers, followers: to.followers, posts: fresh }];
    })
    .sort((a, b) => b.gained - a.gained);
  const brief = (p: Post): ReportPost => ({ id: p.id, hook: p.hook, platform: p.platform, impressions: impressionsOf(p), engagements: engagementOf(p.metrics) });
  return {
    start,
    end,
    posts: week.length,
    prevPosts: before.length,
    impressions: sum(week, impressionsOf),
    prevImpressions: sum(before, impressionsOf),
    engagements: sum(week, (p) => engagementOf(p.metrics)),
    prevEngagements: sum(before, (p) => engagementOf(p.metrics)),
    missing: week.length - ranked.length,
    goal,
    best: best.map(brief),
    worst: worst.map(brief),
    shared,
    movers,
  };
}

/** "+52%" against the week before; null when the week before had none. */
export function pctChange(now: number, before: number): string | null {
  if (before <= 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

/** "+1 on the week before", "same as the week before"; null when both weeks are empty. */
export function postsChange(r: Pick<WeekReport, "posts" | "prevPosts">): string | null {
  if (!r.posts && !r.prevPosts) return null;
  const d = r.posts - r.prevPosts;
  return d === 0 ? "same as the week before" : `${d > 0 ? "+" : ""}${d} on the week before`;
}

/** "2 of your top 3 were carousels (none of the weakest)". */
export function sharedLine(s: Shared, weakest: number): string {
  const name = LABEL_NAMES[s.label][s.key];
  const what =
    s.label === "format" ? `were ${name}` : s.label === "pillar" ? `were ${name} pillar posts` : `opened with the ${name} hook`;
  const tail = !weakest
    ? ""
    : weakest === 1
      ? s.inWorst ? " (the weakest too)" : " (not the weakest)"
      : ` (${s.inWorst ? `${s.inWorst} of the weakest ${weakest}` : "none of the weakest"})`;
  return `${s.count} of your top ${s.of} ${what}${tail}`;
}

/** "@rival gained 120 followers (5,400 now), 3 new posts". */
export function moverLine(m: Mover): string {
  const verb = m.gained >= 0 ? "gained" : "lost";
  const n = Math.abs(m.gained);
  return `@${m.handle} ${verb} ${fmt(n)} follower${n === 1 ? "" : "s"} (${fmt(m.followers)} now)${m.posts ? `, ${plural(m.posts, "new post")}` : ""}`;
}

const postLine = (p: ReportPost) =>
  `"${clip(p.hook || "Untitled post", 70)}" (${platformLabel(p.platform)}): ${[
    p.impressions ? `${fmt(p.impressions)} impressions` : "",
    `${fmt(p.engagements)} engagements`,
  ].filter(Boolean).join(", ")}`;

/** The report as plain lines: the numbers with their change, best and weakest, the shared labels, followed accounts. */
export function reportLines(r: WeekReport): string[] {
  const lines: string[] = [];
  if (r.impressions || r.engagements || r.prevImpressions || r.prevEngagements) {
    const withPct = (n: number, before: number, word: string) => {
      const c = pctChange(n, before);
      return `${fmt(n)} ${word}${c ? ` (${c})` : ""}`;
    };
    lines.push(`${withPct(r.impressions, r.prevImpressions, "impressions")}, ${withPct(r.engagements, r.prevEngagements, "engagements")}.`);
  }
  if (r.best.length === 1 && !r.worst.length) lines.push(`Best post: ${postLine(r.best[0])}`);
  else if (r.best.length) {
    lines.push("Best posts", ...r.best.map((p, i) => `${i + 1}. ${postLine(p)}`));
    lines.push("Weakest", ...r.worst.map((p, i) => `${i + 1}. ${postLine(p)}`));
  }
  if (r.shared.length) lines.push(`What your best posts share: ${r.shared.map((s) => sharedLine(s, r.worst.length)).join("; ")}.`);
  if (r.movers.length) lines.push(`Accounts you follow: ${r.movers.map(moverLine).join("; ")}.`);
  return lines;
}

export type MoveId = "pattern" | "reuse" | "numbers" | "cadence" | "rival";
export const MOVE_IDS: readonly MoveId[] = ["pattern", "reuse", "numbers", "cadence", "rival"];
export interface Move {
  id: MoveId;
  text: string;
}

/** The moves the week's numbers support, one per kind. Which ONE to make is Jev's call (moveAsk). */
export function weekMoves(r: WeekReport): Move[] {
  const out: Move[] = [];
  const s = [...r.shared].sort((a, b) => b.count - a.count || a.inWorst - b.inWorst)[0];
  if (s) {
    const name = LABEL_NAMES[s.label][s.key];
    const what = s.label === "format" ? name : s.label === "pillar" ? `${name} pillar posts` : `posts opening with the ${name} hook`;
    out.push({ id: "pattern", text: `Make 2 more ${what} this week, like ${s.count} of your top ${s.of}.` });
  }
  if (r.best[0]) out.push({ id: "reuse", text: `Turn your best post, "${clip(r.best[0].hook || "Untitled post", 60)}", into a new post in another format.` });
  if (r.missing) out.push({ id: "numbers", text: `Add the numbers for ${plural(r.missing, "recent post")} with none yet.` });
  const target = Math.max(r.goal, r.prevPosts);
  if (target > r.posts) out.push({ id: "cadence", text: `Post ${plural(target, "time")} this week, up from ${r.posts}.` });
  const m = r.movers[0];
  if (m && m.gained > 0) out.push({ id: "rival", text: `Remix a post from @${m.handle}, who gained ${fmt(m.gained)} follower${m.gained === 1 ? "" : "s"}.` });
  return out;
}

/** What Jev reads: the posting line and the report. */
export function reportFacts(r: WeekReport): string {
  const change = postsChange(r);
  return [`${plural(r.posts, "post")} posted${r.goal ? ` against a goal of ${r.goal}` : ""}${change ? `, ${change}` : ""}.`, ...reportLines(r)].join("\n");
}

/** Jev's question: which one move this week. Null with fewer than 2 moves, where there is nothing to choose. */
export function moveAsk(facts: string, moves: Move[]): { state: string; questions: Record<string, JevQuestion> } | null {
  if (moves.length < 2) return null;
  return {
    state: `A financial adviser in Singapore posts on social media to win clients. Their last 7 days:\n${facts}`,
    questions: {
      move: {
        type: "choice",
        instructions:
          "Which ONE of these moves should the adviser make this week? Pick the one their numbers back most strongly and that is most likely to bring more engagement and client conversations.",
        criteria: Object.fromEntries(moves.map((m) => [m.id, m.text])),
      },
    },
  };
}

/** The move Jev picked, or null (no answer, or one that was not offered). */
export function pickedMove(answers: Record<string, JevAnswer> | null, moves: Move[]): Move | null {
  const id = choiceOf(answers, "move", moves.map((m) => m.id));
  return moves.find((m) => m.id === id) ?? null;
}

/** week-pick's body, checked: the facts as text and 2 to 5 known moves, each once. Null when anything is off. */
export function moveBody(body: unknown): { facts: string; moves: Move[] } | null {
  const b = body as { facts?: unknown; moves?: unknown } | null;
  if (!b || typeof b.facts !== "string" || !Array.isArray(b.moves) || b.moves.length < 2 || b.moves.length > MOVE_IDS.length) return null;
  const moves: Move[] = [];
  for (const x of b.moves as { id?: unknown; text?: unknown }[]) {
    if (!x || !MOVE_IDS.includes(x.id as MoveId) || typeof x.text !== "string" || !x.text.trim() || moves.some((m) => m.id === x.id)) return null;
    moves.push({ id: x.id as MoveId, text: clip(x.text, 240) });
  }
  // deno-lint-ignore no-control-regex
  return { facts: b.facts.replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ").slice(0, 2500), moves };
}

function resultLine(posted: number, goal: number, change: string | null): string {
  const tail = change ? ` (${change})` : "";
  if (goal <= 0) return `${plural(posted, "post")} posted${tail}.`;
  if (posted >= goal) return `Goal met: ${posted} of ${goal} posted${tail}.`;
  return `${posted} of ${goal} posted${tail}.`;
}

/** The profiles the Monday email reports on, with last week's progress, report and this week's schedule. */
export function emailWeeks(profiles: Profile[], now: number, brief: Record<string, Finding[]> = {}) {
  const monday = sgDay(now);
  const lastStart = addDays(monday, -7);
  const lastEnd = addDays(monday, -1);
  const sunday = addDays(monday, 6);
  const inRange = (day: string | null | undefined, a: string, b: string) => !!day && day >= a && day <= b;
  return profiles
    .map((p) => {
      const last = weekProgress(p.posts, p.goals, lastStart);
      const report = weekReport(p.posts, p.followed ?? [], lastEnd, last.goal);
      const coming = p.posts
        .filter((d) => d.status === "scheduled" && inRange(d.scheduledFor?.slice(0, 10), monday, sunday))
        .flatMap((d) => {
          const due = dueAt(d.scheduledFor, d.tz);
          return due ? [{ d, due }] : [];
        })
        .sort((a, b) => a.due.at - b.due.at);
      return { p, last, report, coming };
    })
    // The default profile always reports; another only when it has something to say.
    .filter((w, i) => i === 0 || w.last.goal > 0 || w.last.posted > 0 || w.coming.length > 0 || (brief[w.p.id]?.length ?? 0) >= 2);
}

/**
 * Monday from 8am Singapore: last week's posts against the goal and the week
 * before, the best and weakest by their numbers, what the best share, followed
 * accounts' movement, the one move Jev picked (`picks`, by profile id; none
 * without one), and what is scheduled this week, per profile. Sent-log item
 * email:<monday>, so once a week. `brief` (NORTH_STAR_USERS only) puts What
 * moved first in a profile's block; without it the email is as it always was.
 */
export function weeklyEmail(
  profiles: Profile[],
  now: number,
  picks: Record<string, MoveId> = {},
  marketCheckOpen = false,
  brief: Record<string, Finding[]> = {},
): Email | null {
  if (sgWeekday(now) !== 0 || sgHour(now) < 8) return null;
  const monday = sgDay(now);
  const lastStart = addDays(monday, -7);
  const lastEnd = addDays(monday, -1);
  const weeks = emailWeeks(profiles, now, brief);

  const blocks = weeks.map(({ p, last, report, coming }) => {
    const lines: string[] = [];
    if (weeks.length > 1) lines.push(p.name.toUpperCase(), "");
    const moved = briefLines(brief[p.id] ?? []);
    if (moved.length) lines.push(...moved, "");
    lines.push(`Last week, ${shortDate(lastStart)} to ${shortDate(lastEnd)}`, resultLine(last.posted, last.goal, postsChange(report)));
    lines.push(...reportLines(report));
    if (!report.best.length && last.posted > 0) lines.push("Log the numbers for last week's posts in My posts to see your best one.");
    const move = weekMoves(report).find((m) => m.id === picks[p.id]);
    if (move) lines.push("", `One thing this week: ${move.text}`);
    lines.push("", "This week");
    if (!coming.length) lines.push("Nothing scheduled yet.");
    for (const { d, due } of coming.slice(0, 7)) {
      const when = due.time ? `${dayLabel(due.day)}, ${timeLabel(due.time)}` : dayLabel(due.day);
      lines.push(`${when}, ${platformLabel(d.platform)}: "${hookOf(d, 70)}"`);
    }
    if (coming.length > 7) lines.push(`And ${coming.length - 7} more.`);
    return lines.join("\n");
  });

  const totalPosted = weeks.reduce((s, w) => s + w.last.posted, 0);
  const totalGoal = weeks.reduce((s, w) => s + w.last.goal, 0);
  const subject =
    totalGoal <= 0
      ? `Last week: ${plural(totalPosted, "post")} posted`
      : totalPosted >= totalGoal
        ? `Last week: goal met, ${totalPosted} of ${totalGoal} posted`
        : `Last week: ${totalPosted} of ${totalGoal} posted`;
  const text = [
    ...blocks.flatMap((b) => [b, ""]),
    ...(marketCheckOpen ? [`Your market: this week's check is open. See the news and client questions to post about: ${APP_URL}/market`, ""] : []),
    `Open Postmosis: ${APP_URL}/home`,
    "",
    "You get this every Monday because it is switched on in My Playbook. Switch it off there to stop.",
  ].join("\n");
  return { item: `email:${monday}`, subject, text };
}

// ---------------------------------------------------------------------------
// What moved (find-alerts-digest): a short list of findings from the synced
// stores, in the Monday email and on Home, and one phone alert a day when a
// followed account posts a hit. NORTH_STAR_USERS only (run.ts, week-pick's
// brief mode). Jev keeps the findings worth the week; every word is a template.
// ---------------------------------------------------------------------------

export type FindingKind = "outlier" | "post" | "ad" | "growing";
/** The fallback order: what Home and the email show when Jev has no answer. */
export const FINDING_KINDS: readonly FindingKind[] = ["outlier", "post", "ad", "growing"];
export const FINDING_LABEL: Record<FindingKind, string> = { outlier: "Outlier", post: "Your post", ad: "New ad", growing: "Growing" };
export const FINDING_ACTION: Record<FindingKind, string> = { outlier: "Make this", post: "Make another", ad: "See the ads", growing: "See them" };

export type OutlierFinding = { kind: "outlier"; id: string; platform: string; handle: string; post: Required<FollowedPost>; ratio: number; views: boolean; rank: number };
export type Finding =
  | OutlierFinding
  | { kind: "post"; id: string; post: Post; ratio: number }
  | { kind: "ad"; id: string; name: string; n: number; ad: string }
  | { kind: "growing"; id: string; handle: string; gained: number };

/** Jev keeps a finding at this yes-probability or more. Proposal (decision 7): read the dry runs between 0.35 and 0.65. */
export const BRIEF_MIN = 0.5;
export const BRIEF_MAX = 5;
/** Findings put to Jev, best first (question ids f0 to f9). */
export const BRIEF_ASK = 10;
const DAY_MS = 86_400_000;

/** Posts at 3x their own account's usual or more (viral or mega, 5+ posts to compare), best first, each once. */
function outliersIn(accounts: Followed[], now: number, keep: (a: Followed, p: Required<FollowedPost>) => boolean): OutlierFinding[] {
  const out: OutlierFinding[] = [];
  for (const a of accounts) {
    const posts = a.posts.filter((p): p is Required<FollowedPost> => !!p.id);
    const scores = scoreAccount(posts, now);
    for (const p of posts) {
      const s = scores[p.id];
      if (s.ratio === null || (s.tier !== "viral" && s.tier !== "mega") || s.confidence !== "high" || !keep(a, p)) continue;
      out.push({ kind: "outlier", id: `outlier:${a.platform}:${p.id}`, platform: a.platform, handle: a.handle, post: p, ratio: s.ratio, views: s.basis === "views", rank: s.rank });
    }
  }
  out.sort((a, b) => b.rank - a.rank || Date.parse(b.post.postedAt!) - Date.parse(a.post.postedAt!));
  return out.filter((f, i) => out.findIndex((g) => g.id === f.id) === i);
}

const ageOf = (p: { postedAt: string | null }, now: number) => now - Date.parse(p.postedAt ?? "");

/**
 * The week's findings for one brand, in fallback order (Outlier, Your post, New ad, Growing), at most 10: followed
 * and competitor posts from the last 7 days at 3x their account's usual, your own posts of the 7 days before today
 * at 2x the median of the 8 weeks before them, competitors with ads new on a check in the last 7 days, and the
 * followed account that grew most when it gained 3% and 250 followers.
 */
export function briefFindings(p: Profile, now: number): Finding[] {
  const today = sgDay(now);
  const start = addDays(today, -7);
  const outliers = outliersIn([...(p.followed ?? []), ...(p.competitorPosts ?? [])], now, (_, x) => ageOf(x, now) <= 7 * DAY_MS);

  const postedOn = (x: Post) => (x.status === "posted" ? postedDayOf(x.postedAt) : null);
  const before = p.posts.filter((x) => {
    const d = postedOn(x);
    return !!d && d >= addDays(start, -56) && d < start && hasNumbers(x);
  });
  const usual = before.length >= 3 ? median(before.map((x) => engagementOf(x.metrics))) : null;
  const own: Finding[] = usual
    ? p.posts
        .flatMap((x) => {
          const d = postedOn(x);
          const ratio = engagementOf(x.metrics) / usual;
          return d && d >= start && d < today && ratio >= 2 ? [{ kind: "post" as const, id: `post:${x.id.slice(0, 120)}`, post: x, ratio }] : [];
        })
        .sort((a, b) => b.ratio - a.ratio)
    : [];

  const ads: Finding[] = (p.competitorAds ?? [])
    .filter((e) => now - Date.parse(e.checkedAt) < 7 * DAY_MS)
    .sort((a, b) => b.fresh.length - a.fresh.length)
    .map((e) => ({ kind: "ad", id: `ad:${e.competitorId}`, name: e.name, n: e.fresh.length, ad: e.newest }));

  const m = weekReport([], p.followed ?? [], addDays(today, -1)).movers[0];
  const growing: Finding[] = m && m.gained >= 250 && m.gained >= 0.03 * (m.followers - m.gained)
    ? [{ kind: "growing", id: `growing:${m.platform}:${m.handle}`, handle: m.handle, gained: m.gained }]
    : [];
  return [...outliers, ...own, ...ads, ...growing].slice(0, BRIEF_ASK);
}

const usualOf = (f: OutlierFinding) => `${times(f.ratio)} their usual ${f.views ? "views" : "engagement"}`;

/** The finding in words, without its label. */
export function findingLine(f: Finding): string {
  switch (f.kind) {
    case "outlier": {
      const noun = f.post.format === "video" ? (f.platform === "instagram" ? "reel" : "video") : "post";
      const said = clip(f.post.caption, 60);
      return `@${f.handle}'s ${noun} did ${usualOf(f)}.${said ? ` "${said}"` : ""}`;
    }
    case "post":
      return `"${clip(f.post.hook || "Untitled post", 60)}" got ${times(f.ratio)} your usual engagement.`;
    case "ad":
      return `${f.name || "A competitor"} started ${plural(f.n, "new ad")} this week.`;
    case "growing":
      return `@${f.handle} gained ${fmt(f.gained)} followers this week.`;
  }
}

/** src/lib/links.ts's query: logic.test.ts holds these links equal to links.clone, links.generate and links.competitors. */
const query = (o: Record<string, string>) => new URLSearchParams(o).toString().replace(/%2C/g, ",");
const MAS = "No promised returns, no named insurer products, no invented numbers.";

/** Where a finding's button goes, a path in the app: a video to Clone a reel, other posts to Write, ads to their drawer. */
export function findingUrl(f: Finding): string {
  switch (f.kind) {
    case "outlier":
      if (f.post.format === "video" && f.post.url) return `/clone?${query({ url: f.post.url })}`;
      return `/generate?${query({
        pillar: "topic",
        detail: f.post.caption.split(/[.!?]/)[0].slice(0, 80) || `@${f.handle}'s post`,
        ctx: `A post by @${f.handle} did ${usualOf(f)}. What it says: "${f.post.caption}". Write my own take in my voice. Do not copy its wording. ${MAS}`,
        source: `follow:${f.platform}:${f.post.id}`,
      })}`;
    case "post":
      return `/generate?${query({
        detail: clip(f.post.hook || "Untitled post", 80),
        ctx: `My post "${clip(f.post.hook || "Untitled post", 120)}" did ${times(f.ratio)} my usual engagement. Write a new post on the same idea in a different format. ${MAS}`,
        format: (f.post.format ?? "text-post") === "text-post" ? "carousel" : "text-post",
      })}`;
    case "ad":
      return `/competitors?${query({ ad: f.ad })}`;
    case "growing":
      return "/following";
  }
}

/** The email's WHAT MOVED block, numbered, each with its full link; nothing under 2 findings (a thin week is skipped). */
export function briefLines(findings: Finding[]): string[] {
  if (findings.length < 2) return [];
  return ["WHAT MOVED", ...findings.flatMap((f, i) => [`${i + 1}. ${FINDING_LABEL[f.kind]}: ${findingLine(f)}`, `   ${FINDING_ACTION[f.kind]}: ${APP_URL}${findingUrl(f)}`])];
}

/** What Jev reads for a finding: the email and Home's card send the same. */
export interface BriefItem {
  id: string;
  kind: FindingKind;
  line: string;
}

/** One yes or no per finding, ids f0 to f9: is it worth this brand's time this week? The state names the brand (decision 6). */
export function briefAsk(items: BriefItem[], brand?: { sells: string; serves: string }): { state: string; questions: Record<string, JevQuestion> } {
  const fact = (label: string, v: string | undefined) => (v?.trim() ? `${label}: ${v.trim().replace(/[.\s]+$/, "")}.` : "");
  return {
    state: [
      "A business posts on social media to win clients.",
      fact("What it sells", brand?.sells),
      fact("Who it serves", brand?.serves),
      "This week's findings:",
      ...items.map((f, i) => `${i + 1}. ${FINDING_LABEL[f.kind]}: ${f.line}`),
    ].filter(Boolean).join("\n"),
    questions: Object.fromEntries(items.map((_, i) => [`f${i}`, {
      type: "noul" as const,
      instructions: `Is finding ${i + 1} worth this business's time this week: something concrete they could post about or learn from for the people they serve?`,
    }])),
  };
}

/** Jev's keeps (BRIEF_MIN and up), surest first, at most 5; with no answer, the first 5 in fallback order. */
export function pickedFindings<T>(answers: Record<string, JevAnswer> | null, findings: T[]): T[] {
  if (!answers) return findings.slice(0, BRIEF_MAX);
  return findings
    .flatMap((f, i) => {
      const p = answers[`f${i}`]?.noul;
      return typeof p === "number" && p >= BRIEF_MIN ? [{ f, p }] : [];
    })
    .sort((a, b) => b.p - a.p)
    .slice(0, BRIEF_MAX)
    .map((x) => x.f);
}

/** week-pick's brief body, checked: 2 to 10 findings, each once, and the brand's facts. Null when anything is off. */
export function briefBody(body: unknown): { items: BriefItem[]; brand: { sells: string; serves: string } } | null {
  const b = body as { findings?: unknown; brand?: unknown } | null;
  if (!b || !Array.isArray(b.findings) || b.findings.length < 2 || b.findings.length > BRIEF_ASK) return null;
  const items: BriefItem[] = [];
  for (const x of b.findings as { id?: unknown; kind?: unknown; line?: unknown }[]) {
    if (
      !x || typeof x.id !== "string" || !x.id || x.id.length > 200 || !FINDING_KINDS.includes(x.kind as FindingKind) ||
      typeof x.line !== "string" || !x.line.trim() || items.some((f) => f.id === x.id)
    ) return null;
    items.push({ id: x.id, kind: x.kind as FindingKind, line: clip(x.line, 300) });
  }
  const brand = (b.brand && typeof b.brand === "object" ? b.brand : {}) as Record<string, unknown>;
  return { items, brand: { sells: clip(str(brand.sells) ?? "", 600), serves: clip(str(brand.serves) ?? "", 400) } };
}

/** The phone alert's candidates: followed posts new on the latest check, 2 to 5 days old, at 3x or more, best first. */
export function outlierHits(profiles: Profile[], now: number): OutlierFinding[] {
  return outliersIn(profiles.flatMap((p) => p.followed ?? []), now, (a, x) => !!a.fresh?.includes(x.id) && ageOf(x, now) <= 5 * DAY_MS);
}

/** Claimed with the alert, so a second one that Singapore day is refused. */
export const alertDay = (now: number) => `alert-day:${sgDay(now)}`;

/**
 * One alert for the best hit not alerted before (`logged`: the sent log for alertDay and the hits), from 9am to
 * 9pm Singapore, at most one a day; the others wait for Monday's brief. Sent-log items alert-day:<day> and the hit's
 * outlier:<platform>:<post id>.
 */
export function outlierAlert(hits: OutlierFinding[], now: number, logged: Set<string>): { items: string[]; message: PushMessage } | null {
  const hour = sgHour(now);
  if (hour < 9 || hour >= 21 || logged.has(alertDay(now))) return null;
  const f = hits.find((h) => !logged.has(h.id));
  if (!f) return null;
  return {
    items: [alertDay(now), f.id],
    message: { title: `@${f.handle} posted a hit`, body: `${usualOf(f)}. Tap to make your own.`, url: findingUrl(f), tag: "outlier", ttl: 3 * 3600 },
  };
}
