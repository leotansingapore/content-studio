// Pure logic for the notify function (index.ts): which phone alerts and
// emails are due for one adviser, and their words. No Deno APIs or network
// here, so vitest covers it. The week and goal rules mirror src/lib/goals.ts
// and src/lib/dueDates.ts; keep them in step.

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
}

export interface Profile {
  id: string;
  name: string;
  posts: Post[];
  goals: Record<string, number>;
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
    });
  }
  return out;
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

function numbersLine(m: Metrics): string {
  const parts: string[] = [];
  for (const [n, word] of [[m.impressions, "impression"], [m.reactions, "reaction"], [m.comments, "comment"], [m.shares, "share"]] as const) {
    const v = Math.round(n ?? 0);
    if (v > 0) parts.push(`${v.toLocaleString("en-US")} ${word}${v === 1 ? "" : "s"}`);
  }
  return parts.join(", ");
}

function resultLine(posted: number, goal: number): string {
  if (goal <= 0) return `${plural(posted, "post")} posted.`;
  if (posted >= goal) return `Goal met: ${posted} of ${goal} posted.`;
  return `${posted} of ${goal} posted.`;
}

/**
 * Monday from 8am Singapore: last week's posts against the goal, the best one
 * by its numbers, and what is scheduled this week, per profile. Sent-log item
 * email:<monday>, so once a week.
 */
export function weeklyEmail(profiles: Profile[], now: number): Email | null {
  if (sgWeekday(now) !== 0 || sgHour(now) < 8) return null;
  const monday = sgDay(now);
  const lastStart = addDays(monday, -7);
  const lastEnd = addDays(monday, -1);
  const sunday = addDays(monday, 6);
  const inRange = (day: string | null | undefined, a: string, b: string) => !!day && day >= a && day <= b;

  const weeks = profiles
    .map((p) => {
      const last = weekProgress(p.posts, p.goals, lastStart);
      const best = p.posts
        .filter((d) => d.status === "posted" && inRange(postedDayOf(d.postedAt), lastStart, lastEnd))
        .filter((d) => d.metrics && (engagementOf(d.metrics) > 0 || (d.metrics.impressions ?? 0) > 0))
        .sort(
          (a, b) =>
            engagementOf(b.metrics) - engagementOf(a.metrics) ||
            (b.metrics?.impressions ?? 0) - (a.metrics?.impressions ?? 0),
        )[0];
      const coming = p.posts
        .filter((d) => d.status === "scheduled" && inRange(d.scheduledFor?.slice(0, 10), monday, sunday))
        .flatMap((d) => {
          const due = dueAt(d.scheduledFor);
          return due ? [{ d, due }] : [];
        })
        .sort((a, b) => a.due.at - b.due.at);
      return { p, last, best, coming };
    })
    // The default profile always reports; another only when it has something to say.
    .filter((w, i) => i === 0 || w.last.goal > 0 || w.last.posted > 0 || w.coming.length > 0);

  const blocks = weeks.map(({ p, last, best, coming }) => {
    const lines: string[] = [];
    if (weeks.length > 1) lines.push(p.name.toUpperCase(), "");
    lines.push(`Last week, ${shortDate(lastStart)} to ${shortDate(lastEnd)}`, resultLine(last.posted, last.goal));
    if (best) lines.push(`Best post: "${hookOf(best, 80)}" (${numbersLine(best.metrics!)})`);
    else if (last.posted > 0) lines.push("Log the numbers for last week's posts in My posts to see your best one.");
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
