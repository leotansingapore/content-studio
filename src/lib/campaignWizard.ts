// The campaign wizard (plan-campaign, Leo only): Who, Angles, Where it runs, Where it posts, Format and pace and Review,
// one open at a time. "Ads only" and "Posts and ads" add Budget after Where it runs, and Ads only drops the two posting
// steps (its length moves to Budget). Finished steps collapse to a row with Change; the open step is ?step= (replace), the first
// unfinished one by default. Every answer waits in this tab's sessionStorage, cs-campaign-wizard-<scoped>, until Add
// or Start over, so leaving and coming back (or a reload) keeps it. A null answer means "not changed yet": the page
// shows its default (every working account, the pace nearest the weekly goal, "<audience> | <Month>").

import { webAddress } from "@/lib/adlauncher";
import { AD_COUNT, AI_VIDEO, REMIX_MAKE, type AdBudget, type Campaign, type CampaignRuns, type CampaignCost, type CampaignFormat, type CampaignPost, campaignFormats } from "@/lib/campaigns";
import type { PlanPlatform } from "@/lib/positioning";
import { priceText, type Price } from "@/lib/prices";
import { scoped } from "@/lib/profiles";
import { DAILY_LIMITS } from "../../supabase/functions/_shared/usageCaps.ts";

export type WizardStep = "who" | "angles" | "where" | "budget" | "accounts" | "pace" | "review";
/** Every step in order; stepsFor gives the ones a campaign takes. */
export const STEPS: WizardStep[] = ["who", "angles", "where", "budget", "accounts", "pace", "review"];
/** A finished step's collapsed row. */
export const STEP_LABEL: Record<WizardStep, string> = {
  who: "Who", angles: "Angles", where: "Where it runs", budget: "Budget", accounts: "Where it posts", pace: "Format and pace", review: "Review",
};

/** Organic: 6 steps. An ads option adds Budget; Ads only posts nothing, so it has no Where it posts or Format and pace. */
export const stepsFor = (runs: CampaignRuns): WizardStep[] =>
  STEPS.filter((s) => (s !== "budget" || runs !== "organic") && ((s !== "accounts" && s !== "pace") || runs !== "ads"));

/** Where it runs: Fastlane's three choices, in our words. */
export const RUNS: { id: CampaignRuns; label: string; line: string }[] = [
  { id: "organic", label: "Organic posts", line: "The accounts you pick post it." },
  { id: "ads", label: "Ads only", line: "Ads go to AdLauncher, paused. Nothing is posted." },
  { id: "both", label: "Posts and ads", line: "Your posts, plus ads on the same angles." },
];
export const runsLabel = (r: CampaignRuns) => RUNS.find((x) => x.id === r)?.label ?? "";

export const PACES: Campaign["perWeek"][] = [2, 3, 5, 7, 14, 21, 28];
/** 7 a week and up read per day: "1 a day" to "4 a day". */
export const paceLabel = (n: number) => (n >= 7 && n % 7 === 0 ? `${n / 7} a day` : `${n} a week`);
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

/** The Budget step as typed: money and ages are strings until Confirm, so a half-typed one can show its error. */
export interface BudgetWork {
  daily: string;
  /** null until typed: the brand's website. */
  url: string | null;
  /** ISO codes, Singapore first by default, up to 10. */
  countries: string[];
  ageMin: string;
  ageMax: string;
}

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
  runs: CampaignRuns;
  budget: BudgetWork;
  /** Confirmed steps (never review: Add ends the wizard). */
  done: WizardStep[];
}

export const NEW_BUDGET: BudgetWork = { daily: "", url: null, countries: ["SG"], ageMin: "18", ageMax: "65" };

export const newWork = (platform: PlanPlatform): WizardWork => ({
  audience: null, angles: [], fresh: [], platforms: [platform], accountIds: null, formats: ["text-post", "carousel"], weeks: 4, perWeek: null,
  pictures: "stock", name: null, runs: "organic", budget: NEW_BUDGET, done: [],
});

// ---- Steps -----------------------------------------------------------------------

/** The first of the campaign's steps not confirmed yet; review once every one before it is. */
export const firstOpen = (w: Pick<WizardWork, "done" | "runs">): WizardStep => stepsFor(w.runs).find((s) => !w.done.includes(s)) ?? "review";

/** The step ?step= asks for when it can open (confirmed already, or every step before it is); else the first unfinished. */
export function openStep(asked: string | null, w: Pick<WizardWork, "done" | "runs">): WizardStep {
  const steps = stepsFor(w.runs);
  const i = steps.indexOf(asked as WizardStep);
  if (i < 0) return firstOpen(w);
  return w.done.includes(steps[i]) || steps.slice(0, i).every((s) => w.done.includes(s)) ? steps[i] : firstOpen(w);
}

/** "3 of 7": the step's place among the campaign's steps. */
export const stepCount = (step: WizardStep, runs: CampaignRuns) => `${stepsFor(runs).indexOf(step) + 1} of ${stepsFor(runs).length}`;

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

// ---- Budget --------------------------------------------------------------------

export const MIN_DAILY = 25;
export const MAX_DAILY = 100_000;
export const MAX_COUNTRIES = 10;
export const MIN_AGE = 18;
export const MAX_AGE = 65;

/** A typed amount, forgiving "US$1,000" and "$ 50"; NaN when it isn't one. */
export const parseMoney = (t: string) => (t.trim() ? Number(t.replace(/usd|us|\$|,|\s/gi, "")) : NaN);

/** Each Budget field's inline error; an empty daily budget has none yet (Confirm still waits for it). */
export function budgetProblems(b: BudgetWork, website = ""): Partial<Record<"daily" | "url" | "countries" | "ages", string>> {
  const out: Partial<Record<"daily" | "url" | "countries" | "ages", string>> = {};
  const daily = parseMoney(b.daily);
  if (b.daily.trim() && !(daily >= MIN_DAILY && daily <= MAX_DAILY)) out.daily = "Keep the daily budget between US$25 and US$100,000.";
  if (!webAddress(b.url ?? website)) out.url = (b.url ?? website).trim() ? "Use an https address on your own site." : "Add the page the ads send people to.";
  if (!b.countries.length) out.countries = "Pick at least one country.";
  const [lo, hi] = [Number(b.ageMin), Number(b.ageMax)];
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < MIN_AGE || hi > MAX_AGE || lo > hi) out.ages = "Ages go from 18 to 65, the youngest first.";
  return out;
}

/** Why Budget's Confirm waits, or null. The fields carry their own errors; this line only names the missing budget. */
export function budgetReason(b: BudgetWork, website = ""): string | null {
  if (Object.keys(budgetProblems(b, website)).length) return "";
  return b.daily.trim() ? null : "Type a daily budget.";
}

/** The typed Budget as the campaign keeps it (call once budgetReason is null). */
export const toBudget = (b: BudgetWork, website = ""): AdBudget => ({
  daily: Math.round(parseMoney(b.daily) * 100) / 100, url: webAddress(b.url ?? website), countries: b.countries.slice(0, MAX_COUNTRIES),
  ages: [Number(b.ageMin), Number(b.ageMax)],
});

/** "US$1,400", "US$12.50". */
export const usd = (n: number) => `US$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

// ISO 3166 codes Meta can aim at (no Antarctica, uninhabited islands or embargoed countries); names come from Intl
const COUNTRY_CODES = (
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM " +
  "CN CO CR CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY " +
  "HK HN HR HT HU ID IE IL IM IN IO IQ IS IT JE JM JO JP KE KG KH KI KM KN KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG " +
  "MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA " +
  "RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ " +
  "VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW"
).split(" ");

let regionNames: Intl.DisplayNames | null = null;
/** "Singapore" for "SG"; the code itself where the browser can't name it. */
export function countryName(code: string): string {
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Every country by name, for the Budget step's list. */
export const countryList = () => COUNTRY_CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name));

/** The country a typed name (any case) or code means, else null. */
export function matchCountry(typed: string): string | null {
  const t = typed.trim().toLowerCase();
  if (!t) return null;
  return COUNTRY_CODES.find((c) => c.toLowerCase() === t || countryName(c).toLowerCase() === t) ?? null;
}

/** Budget's collapsed row: "US$50 a day | Singapore, Malaysia | 18 to 65". */
export const budgetLine = (b: AdBudget) => `${usd(b.daily)} a day | ${b.countries.map(countryName).join(", ")} | ${b.ages[0]} to ${b.ages[1]}`;

/** "Over the run": "US$1,400 across 4 weeks". */
export const overRunLine = (daily: number, weeks: number) => `${usd(daily * weeks * 7)} across ${weeks} ${weeks === 1 ? "week" : "weeks"}`;

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
  // a slideshow or wall spends a remix and a picture pick: the tighter limit is the one named (live-p5dog D12)
  const remixCovers = (n: number, { remix: r, picks: p }: CampaignCost["covers"]) => {
    if (r === null || p === null) return covers(n, r);
    if (Math.min(r, p) >= n) return `, and today's limits cover ${n === 1 ? "it" : `all ${n}`}.`;
    return p < r ? `, and today's limit for picking pictures covers ${p}.` : `, and today's remix limit covers ${r}.`;
  };
  const { slideshows, walls, videos } = cost.made;
  const out: string[] = [];
  if (cost.free) out.push(`${plural(cost.free, "post")} ${cost.free === 1 ? "costs" : "cost"} nothing to make.`);
  const remix = slideshows + walls;
  if (remix) {
    const what = listJoin([...(slideshows ? [plural(slideshows, "slideshow")] : []), ...(walls ? [plural(walls, "wall of text", "walls of text")] : [])]);
    out.push(`${what} ${remix === 1 ? "comes" : "come"} to ${lower(priceText(times(REMIX_MAKE, remix)))}${remixCovers(remix, cost.covers)}`);
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

/** The review's and the result card's line for the ads: what making them comes to. */
export const adsCostLine = (n = AD_COUNT) => `${plural(n, "ad")} ${n === 1 ? "comes" : "come"} to ${lower(priceText(times(REMIX_MAKE, n)))}, each written when you press Make.`;

/** The result card: "5 angles, LinkedIn and Instagram, 3 a week for 4 weeks, 12 posts. The words are being written now, and you can leave this page." */
export function addedLine(c: Pick<Campaign, "angles" | "weeks" | "perWeek" | "posts" | "runs" | "ads">, where: string[]): string {
  const ads = c.ads?.length ?? 0;
  if (c.runs === "ads") return `${plural(c.angles.length, "angle")}, ${plural(ads, "ad draft")} over ${plural(c.weeks, "week")}. Each ad is written when you press Make on it.`;
  const head = `${plural(c.angles.length, "angle")}, ${listJoin(where)}, ${paceLabel(c.perWeek)} for ${plural(c.weeks, "week")}, ${plural(c.posts.length, "post")}`;
  return ads
    ? `${head} and ${plural(ads, "ad draft")}. The posts' words are being written now, and you can leave this page.`
    : `${head}. The words are being written now, and you can leave this page.`;
}

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
  const b = r.budget && typeof r.budget === "object" ? (r.budget as Record<string, unknown>) : {};
  const text = (v: unknown, max: number, fallback: string) => (typeof v === "string" ? v.slice(0, max) : fallback);
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
    runs: RUNS.some((x) => x.id === r.runs) ? (r.runs as CampaignRuns) : "organic",
    budget: {
      daily: text(b.daily, 20, ""),
      url: typeof b.url === "string" ? b.url.slice(0, 500) : null,
      countries: Array.isArray(b.countries) ? strings(b.countries, 2).filter((c) => COUNTRY_CODES.includes(c)).slice(0, MAX_COUNTRIES) : NEW_BUDGET.countries,
      ageMin: text(b.ageMin, 3, NEW_BUDGET.ageMin),
      ageMax: text(b.ageMax, 3, NEW_BUDGET.ageMax),
    },
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
