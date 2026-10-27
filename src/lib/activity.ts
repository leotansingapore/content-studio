// Everything that ran (north-star agent-activity, Leo only): one log of what you, the agent, Claude, autopilot and
// scheduled runs did, read by /activity. Events live per brand, per month and per device in synced rows
// (content-studio-activity-<YYYY-MM>-<device>-<scoped>), newest first, 1,000 a row, so two devices never overwrite
// each other under cloudSync's last-write-wins; reads merge every device's row and drop repeated ids. Server-written
// events arrive as one inbox row each (content-studio-activityin-<id>-<scoped>) and are moved in on load.
// Logging is off until ActivityRecorder calls setActivityOn(true) for Leo's sessions, so nobody else gets new rows.
// shortcut: synced rows, not a table; move to an insert-only cs_activity table once Leo's rows pass 2 MB or near
// 1,000 (Q13).

import { addDays, keyToDate, localDateKey } from "@/lib/dueDates";
import { links } from "@/lib/links";
import { scoped } from "@/lib/profiles";
import type { Batch } from "@/lib/autopilot";
import type { Campaign } from "@/lib/campaigns";
import { DAILY_LIMITS, type UsageFeature } from "../../supabase/functions/_shared/usageCaps.ts";

export type ActivityWho = "you" | "agent" | "claude" | "autopilot" | "schedule";
/** "correction": the record fixed after something went wrong (a post that didn't go out, a make that failed), Fastlane's Corrections. */
export type ActivityKind = "post" | "make" | "remix" | "brand" | "learning" | "plan" | "run" | "connect" | "correction";
export interface ActivityEvent {
  /** "a" + base36 time + 4 random [a-z0-9], or the source's own id (a Claude draft's); never a uuid. */
  id: string;
  /** ISO time. */
  at: string;
  who: ActivityWho;
  kind: ActivityKind;
  /** Up to 120 characters: past tense, what changed, the thing's name in quotes. */
  title: string;
  /** Up to 300. */
  detail?: string;
  /** A same-origin path only. */
  link?: string;
  /** A paid use, for later cost rows. */
  uses?: { feature: UsageFeature; n: number };
}
export type NewActivity = Omit<ActivityEvent, "id" | "at"> & { id?: string; at?: string };

export const ACTIVITY_PREFIX = "content-studio-activity-";
export const ACTIVITY_INBOX_PREFIX = "content-studio-activityin-";
export const ACTIVITY_CHANGED = "content-studio-activity-changed";
export const MAX_EVENTS = 1000;
const DEVICE_KEY = "cs-device-tag";

const WHO: ActivityWho[] = ["you", "agent", "claude", "autopilot", "schedule"];
const KINDS: ActivityKind[] = ["post", "make", "remix", "brand", "learning", "plan", "run", "connect", "correction"];
export const WHO_LABELS: Record<ActivityWho, string> = { you: "You", agent: "Agent", claude: "Claude", autopilot: "Autopilot", schedule: "Scheduled" };

export type ActivityView = "all" | "agent" | "you" | "claude" | "autopilot" | "corrections" | "schedule" | "learnings" | "plan" | "ai-use";
/** The page's tabs, in order. A tab other than All and AI use shows only when the loaded months hold one of its events. */
export const ACTIVITY_VIEWS: { id: ActivityView; label: string }[] = [
  { id: "all", label: "All" },
  { id: "agent", label: "Agent" },
  { id: "you", label: "You" },
  { id: "claude", label: "Claude" },
  { id: "autopilot", label: "Autopilot" },
  { id: "corrections", label: "Corrections" },
  { id: "schedule", label: "Scheduled runs" },
  { id: "learnings", label: "Learnings" },
  { id: "plan", label: "Plan" },
  { id: "ai-use", label: "AI use" },
];

/** Whether an event belongs in a tab; AI use is its own table, so it holds no events. */
export function inView(e: ActivityEvent, view: ActivityView): boolean {
  if (view === "all") return true;
  if (view === "ai-use") return false;
  if (view === "learnings") return e.kind === "learning";
  if (view === "corrections") return e.kind === "correction";
  if (view === "plan") return e.kind === "plan";
  return e.who === view;
}

// ---------- the switch and the device ----------

let on = false;
/** Logging stays off until Leo's session is known (ActivityRecorder). */
export function setActivityOn(value: boolean): void {
  on = value;
}

let sessionTag: string | null = null;
/** This device's 6-character tag, made once and kept in cs-device-tag (one per session when storage is blocked). */
export function deviceTag(): string {
  try {
    const t = localStorage.getItem(DEVICE_KEY);
    if (t && /^[a-z0-9]{6}$/.test(t)) return t;
  } catch {
    // blocked storage: fall through to a tag for this session
  }
  sessionTag ??= Math.random().toString(36).slice(2, 8).padEnd(6, "0");
  try {
    localStorage.setItem(DEVICE_KEY, sessionTag);
  } catch {
    // kept for this session only
  }
  return sessionTag;
}

// ---------- rows ----------

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const clip = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
/** Same-origin paths only, the dock's go-chip rule: "/x" but never "//x", "/\x" or anything with a colon. */
export const safeLink = (v: unknown): v is string => typeof v === "string" && v.length <= 500 && /^\/(?![/\\])/.test(v) && !/[:\\]/.test(v);
const monthOf = (d: Date) => localDateKey(d).slice(0, 7);
const rowKey = (month: string, device: string, scope: string) => `${ACTIVITY_PREFIX}${month}-${device}-${scope}`;

/** An event as stored, or null when it is not one. Clips the words and drops a link that leaves the app. */
export function cleanEvent(raw: unknown): ActivityEvent | null {
  const e = raw as Partial<ActivityEvent> | null;
  if (!e || typeof e !== "object") return null;
  const id = typeof e.id === "string" && ID.test(e.id) && !UUID.test(e.id) ? e.id : "";
  const time = typeof e.at === "string" ? Date.parse(e.at) : NaN;
  const title = clip(e.title, 120);
  if (!id || Number.isNaN(time) || !title || !WHO.includes(e.who) || !KINDS.includes(e.kind)) return null;
  const out: ActivityEvent = { id, at: new Date(time).toISOString(), who: e.who, kind: e.kind, title };
  const detail = clip(e.detail, 300);
  if (detail) out.detail = detail;
  if (safeLink(e.link)) out.link = e.link;
  const u = e.uses;
  if (u && typeof u.feature === "string" && Object.prototype.hasOwnProperty.call(DAILY_LIMITS, u.feature) && Number.isInteger(u.n) && u.n > 0) out.uses = { feature: u.feature, n: u.n };
  return out;
}

const newest = (a: ActivityEvent, b: ActivityEvent) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id);

function readRow(key: string): ActivityEvent[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.map(cleanEvent).filter((e): e is ActivityEvent => !!e) : [];
  } catch {
    return [];
  }
}

/** Newest first, the oldest past 1,000 dropped. False when storage refuses, and nothing is written. */
function writeRow(key: string, events: ActivityEvent[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify([...events].sort(newest).slice(0, MAX_EVENTS)));
  } catch {
    return false;
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ACTIVITY_CHANGED));
  return true;
}

function storageKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
  } catch {
    // blocked storage reads as empty
  }
  return keys;
}

/** This brand's month rows on this device: { key, month, device }. */
function monthRows(userId: string) {
  const suffix = `-${scoped(userId)}`;
  return storageKeys().flatMap((key) => {
    if (!key.startsWith(ACTIVITY_PREFIX) || !key.endsWith(suffix)) return [];
    const m = /^(\d{4}-\d{2})-([a-z0-9]{6})$/.exec(key.slice(ACTIVITY_PREFIX.length, -suffix.length));
    return m ? [{ key, month: m[1], device: m[2] }] : [];
  });
}

/**
 * Logs one event to this device's row for the event's month, or returns null: logging is off, the event is not
 * valid, or storage refused it. An id already in the row is not logged twice.
 */
export function logActivity(userId: string, e: NewActivity, now = new Date()): ActivityEvent | null {
  if (!on || !userId) return null;
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
  const ev = cleanEvent({ ...e, id: e.id ?? `a${now.getTime().toString(36)}${rand}`, at: e.at ?? now.toISOString() });
  if (!ev) return null;
  const key = rowKey(monthOf(new Date(ev.at)), deviceTag(), scoped(userId));
  const row = readRow(key);
  if (row.some((x) => x.id === ev.id)) return ev;
  return writeRow(key, [ev, ...row]) ? ev : null;
}

/** Every device's events for these months ("YYYY-MM"), one per id, newest first. */
export function loadActivity(userId: string, months: string[]): ActivityEvent[] {
  const want = new Set(months);
  const byId = new Map<string, ActivityEvent>();
  for (const r of monthRows(userId)) if (want.has(r.month)) for (const e of readRow(r.key)) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()].sort(newest);
}

/** The newest `n` events from the two latest months any device logged ("Your work" beside the agent's chat). */
export const recentActivity = (userId: string, n: number): ActivityEvent[] => loadActivity(userId, activityMonths(userId).slice(0, 2)).slice(0, n);

/** The months ("YYYY-MM") any device has logged for this brand, newest first: what "Show <Month>" can reach. */
export function activityMonths(userId: string): string[] {
  return [...new Set(monthRows(userId).map((r) => r.month))].sort().reverse();
}

/**
 * Moves the server-written inbox rows for this brand into this device's month rows and removes them; an id already
 * logged on any device is dropped. Returns how many were added. Storage full: the inbox rows stay for the next load.
 */
export function absorbActivityInbox(userId: string): number {
  const suffix = `-${scoped(userId)}`;
  const keys = storageKeys().filter((k) => k.startsWith(ACTIVITY_INBOX_PREFIX) && k.endsWith(suffix));
  if (!keys.length) return 0;
  const byMonth = new Map<string, ActivityEvent[]>();
  for (const k of keys) {
    let raw: unknown = null;
    try {
      raw = JSON.parse(localStorage.getItem(k) ?? "null");
    } catch {
      // a malformed row is removed below with the rest
    }
    const ev = raw && typeof raw === "object" ? cleanEvent({ ...raw, id: k.slice(ACTIVITY_INBOX_PREFIX.length, -suffix.length) }) : null;
    if (ev) byMonth.set(monthOf(new Date(ev.at)), [...(byMonth.get(monthOf(new Date(ev.at))) ?? []), ev]);
  }
  let added = 0;
  const device = deviceTag();
  for (const [month, events] of byMonth) {
    const have = new Set(loadActivity(userId, [month]).map((e) => e.id));
    const fresh = events.filter((e) => !have.has(e.id) && have.add(e.id)); // and each id once within the inbox
    if (!fresh.length) continue;
    const key = rowKey(month, device, scoped(userId));
    if (!writeRow(key, [...fresh, ...readRow(key)])) return added;
    added += fresh.length;
  }
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {
      // left for the next load; the id check keeps it from logging twice
    }
  }
  return added;
}

/** Re-reads on a log here, in another tab or from sync. */
export function onActivityChanged(fn: () => void): () => void {
  const storage = (e: StorageEvent) => (e.key === null || e.key.startsWith(ACTIVITY_PREFIX) || e.key.startsWith(ACTIVITY_INBOX_PREFIX)) && fn();
  window.addEventListener(ACTIVITY_CHANGED, fn);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(ACTIVITY_CHANGED, fn);
    window.removeEventListener("storage", storage);
  };
}

// ---------- words ----------

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const shortDay = (d: Date) => `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
const clock = (d: Date) => `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() < 12 ? "am" : "pm"}`;

/** WHEN: "just now", "5 min ago" or "3 h ago" today, "9:14 pm" yesterday, "Mon 13 Oct" before that (local time). */
export function whenWords(at: string, now = new Date()): string {
  const d = new Date(at);
  const day = localDateKey(d);
  const today = localDateKey(now);
  if (day >= today) {
    const min = Math.floor((now.getTime() - d.getTime()) / 60_000);
    return min < 1 ? "just now" : min < 60 ? `${min} min ago` : `${Math.floor(min / 60)} h ago`;
  }
  return day === addDays(today, -1) ? clock(d) : shortDay(d);
}

export interface ActivityGroup {
  /** "today", "yesterday", "earlier" or the month "YYYY-MM". */
  key: string;
  label: string;
  events: ActivityEvent[];
}

/** Today, Yesterday, Earlier this month, then one group per month ("September 2026"), newest first. */
export function groupByWhen(events: ActivityEvent[], now = new Date()): ActivityGroup[] {
  const today = localDateKey(now);
  const yesterday = addDays(today, -1);
  const groups: ActivityGroup[] = [];
  for (const e of [...events].sort(newest)) {
    const d = new Date(e.at);
    const day = localDateKey(d);
    const [key, label] =
      day >= today
        ? ["today", "Today"]
        : day === yesterday
          ? ["yesterday", "Yesterday"]
          : day.slice(0, 7) === today.slice(0, 7)
            ? ["earlier", "Earlier this month"]
            : [day.slice(0, 7), `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`];
    const g = groups.find((x) => x.key === key);
    if (g) g.events.push(e);
    else groups.push({ key, label, events: [e] });
  }
  return groups;
}

// ---------- AI use ----------

/** Declared by the contracts task in the same wave; listed here so no cap ships without a label. */
type Phase6Cap = "agent-act" | "mcp-calls" | "skill-answer";

/** One plain label per DAILY_LIMITS key (activity.test.ts checks every key has one). */
export const AI_USE_LABELS: Record<UsageFeature | Phase6Cap, string> = {
  "reel-clone": "Reels cloned",
  "reel-concepts": "Reel concepts",
  storyboard: "Shot lists",
  "reel-visuals": "Reel frames read",
  "reel-style": "Reel styles copied",
  "reel-video": "Reel videos fetched",
  "idea-dump": "Ideas into posts",
  "repurpose-long": "Long pieces into posts",
  carousel: "Carousels",
  "video-transcribe": "Video transcripts",
  "vibe-edit": "Video chat edits",
  "video-clips": "Clips from a video",
  "video-translate": "Video translations",
  "video-cutaways": "Cutaways",
  "video-publish": "Video titles and covers",
  "motion-picks": "Zooms and pop-ups",
  feeds: "Feed reads",
  mentions: "Mentions checks",
  "yt-captions": "YouTube captions",
  "track-accounts": "Followed accounts read",
  "market-check": "Market checks",
  "market-check-global": "Market checks, everyone",
  "market-suggest": "Market suggestions",
  "engage-picks": "Engage picks",
  "week-pick": "Moves of the week",
  "assistant-act": "Assistant messages",
  "stock-search": "Stock searches",
  "broll-picks": "B-roll picks",
  "montage-beats": "Montages",
  "montage-pick": "Montage clips",
  "cold-open": "Cold opens",
  "video-captions": "Video post captions",
  "video-watch": "Video watch-throughs",
  "ai-image": "Pictures",
  "ai-image-fix": "Picture fixes",
  "ai-image-fix-global": "Picture fixes, everyone",
  "ai-broll": "AI B-roll clips",
  "ai-broll-global": "AI B-roll clips, everyone",
  "ai-voice": "Voiceovers",
  "ai-music": "Music tracks",
  "ai-music-global": "Music tracks, everyone",
  "music-mood": "Music moods",
  "post-score": "Post scores",
  "writing-judge": "Writing checks",
  "profile-score": "Profile scores",
  "fact-check": "Fact checks",
  "engage-replies": "Reply drafts",
  "engage-dms": "DM drafts",
  "engage-comments": "Comment drafts",
  "engage-connect": "Connection notes",
  "ai-video": "AI videos",
  "ai-video-global": "AI videos, everyone",
  "ai-video-script": "Explainer scripts",
  "ai-clip": "Template clips",
  "ai-clip-global": "Template clips, everyone",
  "social-connect": "Account connections",
  "social-read": "Social account reads",
  "social-automation-write": "Auto-DM changes",
  "social-schedule": "Posts set to post for you",
  "social-presign": "File uploads for posting",
  "team-comment": "Team notes",
  "brand-dna": "Brand reads",
  "remix-make": "Remixes",
  "remix-teardown": "Post breakdowns",
  "remix-fit": "Brand fit checks",
  "remix-link": "Links read",
  "remix-image": "Pictures read",
  "competitor-read": "Competitors added",
  "competitor-suggest": "Competitor suggestions",
  "competitor-ads": "Competitor ad checks",
  "competitor-ads-global": "Competitor ad checks, everyone",
  "competitor-posts": "Competitor post reads",
  "competitor-posts-global": "Competitor post reads, everyone",
  "space-ads": "Ads in your space",
  "space-ads-global": "Ads in your space, everyone",
  "ad-labels": "Ad labels",
  "niche-match": "Feed matches",
  "viral-search": "Viral searches",
  "viral-search-global": "Viral searches, everyone",
  "post-tags": "Post tags",
  "brief-pick": "What moved picks",
  "creator-fit": "Creator fit checks",
  "search-topics": "Search checks",
  "search-topics-global": "Search checks, everyone",
  "remix-patterns": "What worked reads",
  "own-words": "Words for your video",
  "page-read": "Articles read",
  "thread-copy": "Threads",
  "edit-ask": "Slide edits",
  "caption-keywords": "Caption keywords",
  "likeness-check": "Consent checks",
  "ai-presenter": "AI presenters",
  "ai-presenter-global": "AI presenters, everyone",
  "brand-products": "Products read",
  "brand-image": "Brand pictures fetched",
  "media-sort": "Media sorted",
  "post-translate": "Post translations",
  "audience-suggest": "Audience suggestions",
  "campaign-angles": "Campaign angles",
  "campaign-draft": "Campaign posts written",
  "campaign-swap": "Campaign posts rewritten",
  "ideas-daily": "Idea sets",
  "agent-act": "Agent messages",
  "mcp-calls": "Claude tool calls",
  "skill-answer": "Answers to competitor ads",
  "launch-film": "Launch films",
  "film-edit": "Launch film changes",
  "edit-read": "Edit reads",
  "edit-version": "Video versions",
  "winner-check": "Winner checks",
  "post-match": "Post matches",
  "post-grade": "Post grades",
  "post-angles": "Post tags",
};

export interface AiUseRow {
  day: string;
  feature: string;
  label: string;
  uses: number;
  /** The daily limit, or null for a cap no longer in the code. */
  limit: number | null;
}

/**
 * The AI use table from cs_ai_usage rows, newest day first: drops the across-everyone "-global" counters and the
 * claimOnce rows (a ":" in the key) that Leo's account also holds, and rows a refund took back to 0.
 */
export function aiUseRows(rows: { feature: string; day: string; count: number }[]): AiUseRow[] {
  const labels = AI_USE_LABELS as Record<string, string>;
  const limits = DAILY_LIMITS as Record<string, number>;
  return rows
    .filter((r) => typeof r.feature === "string" && !r.feature.endsWith("-global") && !r.feature.includes(":") && r.count > 0)
    .map((r) => ({ day: r.day, feature: r.feature, label: labels[r.feature] ?? r.feature, uses: r.count, limit: limits[r.feature] ?? null }))
    .sort((a, b) => b.day.localeCompare(a.day) || a.label.localeCompare(b.label));
}

// ---------- Plan and Autopilot, derived ----------

/**
 * Campaigns and approved autopilot weeks as Plan and Autopilot events, worked out from their stores on each read
 * (phase 5 writes no activity rows): a campaign is one Plan event at its createdAt; a week with an approved post is
 * one Autopilot event at the time its writing started. A campaign whose Plan row is in `logged` already (the agent
 * logs its own, as the agent's) gets none here, so it shows once (live-p6replay D6).
 */
export function planRows(
  campaigns: Pick<Campaign, "id" | "name" | "createdAt" | "audienceName" | "posts" | "weeks" | "perWeek">[],
  autopilot: { batches: Pick<Batch, "week" | "posts" | "startedAt">[] } | null,
  logged: Pick<ActivityEvent, "kind" | "title" | "at">[] = [],
): ActivityEvent[] {
  const inLog = (e: ActivityEvent | null) => !!e && logged.some((l) => l.kind === "plan" && l.title === e.title && Math.abs(Date.parse(l.at) - Date.parse(e.at)) < 60_000);
  const plans = campaigns.map((c) =>
    cleanEvent({
      id: `plan-${c.id}`,
      at: c.createdAt,
      who: "you",
      kind: "plan",
      title: `Planned "${c.name}"`,
      detail: `${c.posts.length} posts for ${c.audienceName}, ${c.perWeek} a week for ${c.weeks} ${c.weeks === 1 ? "week" : "weeks"}.`,
      link: links.campaign(c.id),
    }),
  ).filter((e) => !inLog(e));
  const weeks = (autopilot?.batches ?? []).map((b) => {
    const approved = b.posts.filter((p) => p.state === "approved").length;
    if (!approved) return null;
    return cleanEvent({
      id: `autopilot-${b.week}`,
      at: b.startedAt ?? keyToDate(b.week).toISOString(),
      who: "autopilot",
      kind: "plan",
      title: `Wrote the posts for the week of ${shortDay(keyToDate(b.week))}`,
      detail: `${approved} of ${b.posts.length} approved.`,
      link: links.plan({ section: "autopilot", week: b.week }),
    });
  });
  return [...plans, ...weeks].filter((e): e is ActivityEvent => !!e).sort(newest);
}
