// Pure logic for the notify function (index.ts): which phone alerts and
// emails are due for one adviser, and their words. No Deno APIs or network
// here, so vitest covers it. The week and goal rules mirror src/lib/goals.ts
// and src/lib/dueDates.ts; keep them in step. The week's report (weekReport)
// also feeds Analytics' This week card, and its one move is picked by Jev in
// this function and in week-pick.

import { choiceOf, type JevAnswer, type JevQuestion } from "../_shared/jev.ts";

export const APP_URL = "https://consultant-content-studio.vercel.app";
export const PREFS_PREFIX = "content-studio-notify-";

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
}

/** The switches in My Playbook. Anything but an explicit true is off. */
export function parsePrefs(data: string | null | undefined): Prefs {
  try {
    const p = JSON.parse(data ?? "");
    return { email: p?.email === true, push: p?.push === true };
  } catch {
    return { email: false, push: false };
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
  postedAt?: string;
  metrics?: Metrics;
  format?: string;
  pillar?: string;
  hookFormula?: string;
}

/** An account the adviser follows (src/lib/following.ts): follower snapshots and its newest posts. */
export interface Followed {
  platform: string;
  handle: string;
  history: { at: string; followers: number | null }[];
  posts: { postedAt: string | null }[];
}

export interface Profile {
  id: string;
  name: string;
  posts: Post[];
  goals: Record<string, number>;
  followed?: Followed[];
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

function postsFrom(raw: string | undefined): Post[] {
  const list = parseJson(raw);
  if (!Array.isArray(list)) return [];
  const out: Post[] = [];
  for (const d of list.slice(0, 200)) {
    if (!d || typeof d !== "object" || typeof d.id !== "string" || !d.id) continue;
    const m = d.metrics && typeof d.metrics === "object" ? d.metrics : undefined;
    out.push({
      id: d.id,
      hook: str(d.hook) ?? "",
      platform: str(d.platform) ?? "",
      status: str(d.status),
      scheduledFor: str(d.scheduledFor),
      postedAt: str(d.postedAt),
      metrics: m
        ? { impressions: num(m.impressions), reactions: num(m.reactions), comments: num(m.comments), shares: num(m.shares) }
        : undefined,
      format: str(d.format),
      pillar: str(d.pillar),
      hookFormula: str(d.hookFormula),
    });
  }
  return out;
}

function followedFrom(raw: string | undefined): Followed[] {
  const list = parseJson(raw);
  if (!Array.isArray(list)) return [];
  return list.slice(0, 10).flatMap((a) =>
    a && typeof a === "object" && typeof a.handle === "string" && a.handle && Array.isArray(a.history)
      ? [{
          platform: str(a.platform) ?? "",
          handle: clip(a.handle, 60),
          history: a.history.slice(-120).flatMap((x: unknown) => {
            const snap = x as { at?: unknown; followers?: unknown } | null;
            return snap && typeof snap.at === "string" ? [{ at: snap.at, followers: num(snap.followers) ?? null }] : [];
          }),
          posts: (Array.isArray(a.posts) ? a.posts : []).slice(0, 60).flatMap((x: unknown) =>
            x && typeof x === "object" ? [{ postedAt: str((x as { postedAt?: unknown }).postedAt) ?? null }] : []),
        }]
      : []);
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
export function profilesFrom(uid: string, data: Record<string, string>): Profile[] {
  const listed = parseJson(data[`content-studio-profiles-${uid}`]);
  const valid = (Array.isArray(listed) ? listed : []).filter(
    (p): p is { id: string; name: string } =>
      !!p && typeof p.id === "string" && /^[a-z0-9]{1,40}$/.test(p.id) && typeof p.name === "string" && !!p.name,
  );
  const me = valid.find((p) => p.id === "me") ?? { id: "me", name: "Me" };
  return [me, ...valid.filter((p) => p.id !== "me")].map((p) => {
    const scope = p.id === "me" ? uid : `${uid}~${p.id}`;
    return {
      id: p.id,
      name: clip(p.name, 40),
      posts: postsFrom(data[`content-studio-drafts-${scope}`]),
      goals: goalsFrom(data[`content-studio-goals-${scope}`], data[`content-studio-positioning-${scope}`]),
      followed: followedFrom(data[`content-studio-following-${scope}`]),
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
 * When a scheduled post is due: "YYYY-MM-DDTHH:MM" is that Singapore time;
 * anything else starting with a day (a bare day, the board's older ISO
 * timestamps) counts as that day without a time, due at 9am.
 */
export function dueAt(scheduledFor: string | undefined): { at: number; day: string; time: string | null } | null {
  const timed = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(scheduledFor ?? "");
  if (timed) {
    const [, y, m, d, hh, mm] = timed.map(Number);
    return { at: Date.UTC(y, m - 1, d, hh, mm) - SG_MS, day: scheduledFor!.slice(0, 10), time: scheduledFor!.slice(11, 16) };
  }
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(scheduledFor ?? "");
  if (!day) return null;
  const [, y, m, d] = day.map(Number);
  return { at: Date.UTC(y, m - 1, d, DAY_ONLY_HOUR) - SG_MS, day: day[0], time: null };
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
      const due = dueAt(post.scheduledFor);
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
    const profile = profileId === "me" ? "" : `&profile=${encodeURIComponent(profileId)}`;
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
  const ranked = week
    .filter(hasNumbers)
    .sort((a, b) => engagementOf(b.metrics) - engagementOf(a.metrics) || impressionsOf(b) - impressionsOf(a));
  // best and weakest never overlap: on fewer than 6 posts each takes half
  const best = ranked.slice(0, Math.min(3, Math.ceil(ranked.length / 2)));
  const worst = ranked.slice(ranked.length - Math.min(3, Math.floor(ranked.length / 2))).reverse();
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
      const from = snaps.filter((x) => x.day < start).pop() ?? inWeek[0];
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
  if (target > r.posts) out.push({ id: "cadence", text: `Post ${target} times this week, up from ${r.posts}.` });
  const m = r.movers[0];
  if (m && m.gained > 0) out.push({ id: "rival", text: `Remix a post from @${m.handle}, who gained ${fmt(m.gained)} followers.` });
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
export function emailWeeks(profiles: Profile[], now: number) {
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
          const due = dueAt(d.scheduledFor);
          return due ? [{ d, due }] : [];
        })
        .sort((a, b) => a.due.at - b.due.at);
      return { p, last, report, coming };
    })
    // The default profile always reports; another only when it has something to say.
    .filter((w, i) => i === 0 || w.last.goal > 0 || w.last.posted > 0 || w.coming.length > 0);
}

/**
 * Monday from 8am Singapore: last week's posts against the goal and the week
 * before, the best and weakest by their numbers, what the best share, followed
 * accounts' movement, the one move Jev picked (`picks`, by profile id; none
 * without one), and what is scheduled this week, per profile. Sent-log item
 * email:<monday>, so once a week.
 */
export function weeklyEmail(profiles: Profile[], now: number, picks: Record<string, MoveId> = {}): Email | null {
  if (sgWeekday(now) !== 0 || sgHour(now) < 8) return null;
  const monday = sgDay(now);
  const lastStart = addDays(monday, -7);
  const lastEnd = addDays(monday, -1);
  const weeks = emailWeeks(profiles, now);

  const blocks = weeks.map(({ p, last, report, coming }) => {
    const lines: string[] = [];
    if (weeks.length > 1) lines.push(p.name.toUpperCase(), "");
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
    `Open Content Studio: ${APP_URL}/home`,
    "",
    "You get this every Monday because it is switched on in My Playbook. Switch it off there to stop.",
  ].join("\n");
  return { item: `email:${monday}`, subject, text };
}
