// The campaign wizard (plan-campaign, Leo only): five steps, Who, Angles, Where, Format and pace and Review, one
// open at a time. Finished steps collapse to a row with Change; the open step is ?step= (replace), the first
// unfinished one by default. Every answer waits in this tab's sessionStorage, cs-campaign-wizard-<scoped>, until Add
// or Start over, so leaving and coming back (or a reload) keeps it. A null answer means "not changed yet": the page
// shows its default (every working account, the pace nearest the weekly goal, "<audience> | <Month>").

import { AI_VIDEO, REMIX_MAKE, type Campaign, type CampaignCost, type CampaignFormat, type CampaignPost, campaignFormats } from "@/lib/campaigns";
import type { PlanPlatform } from "@/lib/positioning";
import { priceText, type Price } from "@/lib/prices";
import { scoped } from "@/lib/profiles";
import { DAILY_LIMITS } from "../../supabase/functions/_shared/usageCaps.ts";

export type WizardStep = "who" | "angles" | "where" | "pace" | "review";
export const STEPS: WizardStep[] = ["who", "angles", "where", "pace", "review"];
/** A finished step's collapsed row. */
export const STEP_LABEL: Record<WizardStep, string> = { who: "Who", angles: "Angles", where: "Where", pace: "Format and pace", review: "Review" };

export const PACES: Campaign["perWeek"][] = [2, 3, 5, 7];
export const paceLabel = (n: number) => (n === 7 ? "1 a day" : `${n} a week`);
export const MIN_WEEKS = 1;
export const MAX_WEEKS = 8;
export const MAX_NAME = 80;
export const MAX_ACCOUNTS = 5;

export const FORMAT_NAME: Record<CampaignFormat, string> = {
  "text-post": "Text post",
  carousel: "Carousel",
  "short-video": "Short video script",
  slideshow: "Slideshow",
  wall: "Wall of text",
  "ai-video": "AI video",
};
export const FORMAT_HINT: Record<CampaignFormat, string> = {
  "text-post": "words only",
  carousel: "slides from the words",
  "short-video": "you film it",
  slideshow: "words on photos, made at Make",
  wall: "one bold claim on a clip, made at Make",
  "ai-video": "no filming",
};

export interface WizardWork {
  /** The audience id. */
  audience: string | null;
  /** The confirmed angles' copies. */
  angles: Campaign["angles"];
  /** Angles new to this audience at their first Confirm: the review marks them "(new)". */
  fresh: string[];
  platforms: PlanPlatform[];
  /** Connected accounts picked; null until changed (every working account, up to 5). */
  accountIds: string[] | null;
  formats: CampaignFormat[];
  weeks: number;
  /** null until picked: the pace nearest the weekly goal. */
  perWeek: Campaign["perWeek"] | null;
  pictures: Campaign["pictures"];
  /** null until typed: "<audience> | <Month>". */
  name: string | null;
  /** Confirmed steps (never review: Add ends the wizard). */
  done: WizardStep[];
}

export const newWork = (platform: PlanPlatform): WizardWork => ({
  audience: null, angles: [], fresh: [], platforms: [platform], accountIds: null, formats: ["text-post", "carousel"], weeks: 4, perWeek: null,
  pictures: "stock", name: null, done: [],
});

// ---- Steps -----------------------------------------------------------------------

/** The first step not confirmed yet; review once the four before it are. */
export const firstOpen = (w: Pick<WizardWork, "done">): WizardStep => STEPS.find((s) => !w.done.includes(s)) ?? "review";

/** The step ?step= asks for when it can open (confirmed already, or every step before it is); else the first unfinished. */
export function openStep(asked: string | null, w: Pick<WizardWork, "done">): WizardStep {
  const i = STEPS.indexOf(asked as WizardStep);
  if (i < 0) return firstOpen(w);
  return w.done.includes(STEPS[i]) || STEPS.slice(0, i).every((s) => w.done.includes(s)) ? STEPS[i] : firstOpen(w);
}

export const confirmed = (w: WizardWork, step: WizardStep): WizardWork => (w.done.includes(step) ? w : { ...w, done: [...w.done, step] });

/** A row picked on step 1. Another audience drops the confirmed angles, which belong to the one before. */
export const pickAudience = (w: WizardWork, id: string): WizardWork =>
  id === w.audience ? w : { ...w, audience: id, angles: [], fresh: [], done: w.done.filter((s) => s !== "angles") };

/** Step 1 answered (its Confirm, or ?audience=). */
export const withAudience = (w: WizardWork, id: string): WizardWork => confirmed(pickAudience(w, id), "who");

/** The audience is gone (removed on /audiences): step 1 and the angles are open again. */
export const withoutAudience = (w: WizardWork): WizardWork =>
  ({ ...w, audience: null, angles: [], fresh: [], done: w.done.filter((s) => s !== "who" && s !== "angles") });

/** The angles new to this audience: never saved before this Confirm (createdAt equal to usedAt), or new at an earlier one. */
export function freshAngles(picked: { id: string }[], saved: { id: string; createdAt: string; usedAt?: string }[], before: string[]): string[] {
  return picked.filter((a) => {
    const s = saved.find((x) => x.id === a.id);
    return before.includes(a.id) || !s || s.createdAt === s.usedAt;
  }).map((a) => a.id);
}

// ---- Answers -------------------------------------------------------------------

/** The pace nearest the weekly goal (ties to the slower), else 3 a week. */
export function nearestPace(goal: number | undefined): Campaign["perWeek"] {
  if (!goal || goal < 1) return 3;
  return PACES.reduce((best, p) => (Math.abs(p - goal) < Math.abs(best - goal) ? p : best));
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "<audience> | <Month>", the start week's month, at most 80 characters. */
export const defaultName = (audience: string, start: Date) => `${audience.trim().slice(0, MAX_NAME - 13)} | ${MONTHS[start.getMonth()]}`;

/** "Mon 26 Oct". */
export const shortDay = (d: Date) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;

/** "LinkedIn", "LinkedIn and Instagram", "LinkedIn, Instagram and TikTok". */
export function listJoin(items: string[]): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const times = (p: Price, n: number): Price => ({ usd: p.usd * n, kind: p.kind });

/** The line under Where and Format: at least one place, and a format besides AI video. */
export const whereLine = (picked: number): string | null => (picked ? null : "Pick at least one place.");
export function formatLine(formats: CampaignFormat[]): string | null {
  if (!formats.length) return "Pick at least one format.";
  return formats.every((f) => f === "ai-video") ? "Pick at least one format besides AI video." : null;
}

/** The posts' formats only, for the price before anything is laid out (campaignCost reads format and state). */
export const previewPosts = (formats: CampaignFormat[], perWeek: number, weeks: number): CampaignPost[] =>
  campaignFormats(formats, perWeek, weeks).map((format, i) => ({ n: i + 1, day: "", angleId: "", format, stage: "attraction", pillar: "topic", ctaType: "", state: "waiting" }));

/** Step 4's live summary: "12 posts over 4 weeks, each on LinkedIn and Instagram.", then what is made at Make. */
export function summaryLines(posts: number, weeks: number, where: string[], cost: CampaignCost): string[] {
  const lines = [`${plural(posts, "post")} over ${plural(weeks, "week")}${where.length ? `, each on ${listJoin(where)}` : ""}.`];
  const { slideshows, walls, videos } = cost.made;
  if (slideshows + walls) {
    const what = listJoin([...(slideshows ? [plural(slideshows, "slideshow")] : []), ...(walls ? [plural(walls, "wall of text", "walls of text")] : [])]);
    lines.push(`${what}, ${lower(priceText(times(REMIX_MAKE, slideshows + walls)))}, each made when you press Make.`);
  }
  if (videos) {
    lines.push(`${videos} of them ${videos === 1 ? "an AI video" : "AI videos"}, ${lower(priceText(times(AI_VIDEO, videos)))}. One a week, so the daily limit of ${DAILY_LIMITS["ai-video"]} covers ${videos === 1 ? "it" : "them"}.`);
  }
  return lines;
}

/** The review's and the result card's cost line: "8 posts cost nothing to make. 4 AI videos come to about US$11.08, and today's limit covers 2." */
export function costLine(cost: CampaignCost): string {
  const covers = (n: number, c: number | null) => (c === null ? "." : `, and today's limit covers ${c >= n ? (n === 1 ? "it" : `all ${n}`) : c}.`);
  const { slideshows, walls, videos } = cost.made;
  const out: string[] = [];
  if (cost.free) out.push(`${plural(cost.free, "post")} ${cost.free === 1 ? "costs" : "cost"} nothing to make.`);
  const remix = slideshows + walls;
  if (remix) {
    const what = listJoin([...(slideshows ? [plural(slideshows, "slideshow")] : []), ...(walls ? [plural(walls, "wall of text", "walls of text")] : [])]);
    out.push(`${what} ${remix === 1 ? "comes" : "come"} to ${lower(priceText(times(REMIX_MAKE, remix)))}${covers(remix, cost.covers.remix)}`);
  }
  if (videos) out.push(`${plural(videos, "AI video")} ${videos === 1 ? "comes" : "come"} to ${lower(priceText(times(AI_VIDEO, videos)))}${covers(videos, cost.covers.videos)}`);
  return out.join(" ");
}

/** Under Add when today's campaign-draft uses can't write every post (7 a use); null when they can or are unread. */
export function writeLimitLine(posts: number, left: number | null): string | null {
  if (left === null || left * 7 >= posts) return null;
  if (left === 0) return "Today's limit for writing campaign posts is used. They are written after 8am Singapore time.";
  return `Today's limit writes ${left * 7} of these posts. The rest are written after 8am Singapore time.`;
}

/** "Success looks like": "12 posts, 1 winner". */
export const successLine = (target: { posts: number; winners: number }) => `${plural(target.posts, "post")}, ${plural(target.winners, "winner")}`;

/** The result card: "5 angles, LinkedIn and Instagram, 3 a week for 4 weeks, 12 posts. The words are being written now, and you can leave this page." */
export const addedLine = (c: Pick<Campaign, "angles" | "weeks" | "perWeek" | "posts">, where: string[]) =>
  `${plural(c.angles.length, "angle")}, ${listJoin(where)}, ${paceLabel(c.perWeek)} for ${plural(c.weeks, "week")}, ${plural(c.posts.length, "post")}. The words are being written now, and you can leave this page.`;

// ---- Typed work ------------------------------------------------------------------

const KEY = "cs-campaign-wizard-";
const PLATFORMS: PlanPlatform[] = ["linkedin", "instagram", "facebook", "tiktok"];
const ALL_FORMATS = Object.keys(FORMAT_NAME) as CampaignFormat[];

const strings = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, max)) : []);

/** A stored wizard as the page reads it, every field checked; null when it isn't one. */
export function readWork(raw: unknown): WizardWork | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const base = newWork("linkedin");
  const angles = (Array.isArray(r.angles) ? r.angles : [])
    .filter((a) => a && typeof a.id === "string" && typeof a.title === "string")
    .map((a) => ({ id: String(a.id).slice(0, 40), title: String(a.title).slice(0, 40), line: typeof a.line === "string" ? a.line.slice(0, 140) : "" }));
  const formats = strings(r.formats, 20).filter((f): f is CampaignFormat => (ALL_FORMATS as string[]).includes(f));
  const weeks = Number(r.weeks);
  return {
    audience: typeof r.audience === "string" && r.audience ? r.audience.slice(0, 40) : null,
    angles,
    fresh: strings(r.fresh, 40),
    platforms: strings(r.platforms, 20).filter((p): p is PlanPlatform => (PLATFORMS as string[]).includes(p)),
    accountIds: Array.isArray(r.accountIds) ? strings(r.accountIds, 80).slice(0, MAX_ACCOUNTS) : null,
    formats: Array.isArray(r.formats) ? formats : base.formats,
    weeks: Number.isInteger(weeks) && weeks >= MIN_WEEKS && weeks <= MAX_WEEKS ? weeks : base.weeks,
    perWeek: PACES.includes(r.perWeek as Campaign["perWeek"]) ? (r.perWeek as Campaign["perWeek"]) : null,
    pictures: r.pictures === "mine" ? "mine" : "stock",
    name: typeof r.name === "string" ? r.name.slice(0, MAX_NAME) : null,
    done: strings(r.done, 10).filter((s): s is WizardStep => STEPS.includes(s as WizardStep) && s !== "review"),
  };
}

export function loadWizard(userId: string): WizardWork | null {
  try {
    return readWork(JSON.parse(sessionStorage.getItem(KEY + scoped(userId)) ?? "null"));
  } catch {
    return null;
  }
}

/** Keeps the wizard for this tab; null clears it (Add, Start over). */
export function saveWizard(userId: string, w: WizardWork | null): void {
  try {
    if (w) sessionStorage.setItem(KEY + scoped(userId), JSON.stringify(w));
    else sessionStorage.removeItem(KEY + scoped(userId));
  } catch {
    // blocked or full: the page keeps the answers until it is left
  }
}
