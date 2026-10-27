// AdLauncher in the studio (docs/adlauncher-ads.md): the /adlauncher connection, "Run as an ad" on /image and its
// Ads block. Leo's sign-ins only. The `adlauncher` edge function holds the tokens and guards every call; this file
// wraps its actions, holds the sheet's rules and builds the exact create-campaign call, and keeps the launches made
// from each brand (content-studio-ad-launches-<scoped user id>, synced).

import { callFn, EdgeError } from "@/lib/edgeFn";
import { scoped } from "@/lib/profiles";
import { ADL_ORIGIN, COPY_LIMITS, type AccountSummary, type AdlTool } from "../../supabase/functions/adlauncher/logic.ts";

export { COPY_LIMITS, type AccountSummary };

const FN = "adlauncher";

export interface AdlStatus {
  connected: boolean;
  /** Was connected, and AdLauncher no longer takes the connection. */
  reconnect?: boolean;
  account: AccountSummary | null;
  scope?: string | null;
}

/** A tool's answer: its data when ok, else its refusal in AdLauncher's own words (one shape: this app's tsconfig isn't strict, so a union wouldn't narrow). */
export interface AdlAnswer<T> {
  ok: boolean;
  data?: T;
  error?: string;
  hint?: string;
  code?: string;
}

export const adlStatus = () => callFn<AdlStatus>(FN, { action: "status" });
export const adlStart = () => callFn<{ url: string }>(FN, { action: "start" });
export const adlFinish = (code: string, state: string) => callFn<AdlStatus>(FN, { action: "finish", code, state });
export const adlDisconnect = () => callFn<{ connected: false }>(FN, { action: "disconnect" });
export const adlImage = (dataUrl: string) => callFn<{ url: string }>(FN, { action: "image", dataUrl }, "The picture didn't upload. Try again.");
export const adlCall = <T>(tool: AdlTool, args: Record<string, unknown> = {}) => callFn<AdlAnswer<T>>(FN, { action: "call", tool, args });

/** The server says the connection is gone: the page or sheet offers Reconnect. */
export const needsReconnect = (e: unknown) => e instanceof EdgeError && e.code === "reconnect";

/** A campaign in AdLauncher's web app, by the id create-campaign answers (its own campaign id, not Meta's). An agency
 *  sign-in is sent on from /campaigns/<id> to /agency/campaigns/<id> by AdLauncher itself. */
export const campaignLink = (id: string) => `${ADL_ORIGIN}/campaigns/${encodeURIComponent(id)}`;

const RETURN_KEY = "cs-adl-return";

/** The ad the sheet was on when it sent Leo to connect, so /adlauncher offers the way back (this tab only). */
export function rememberReturn(path: string): void {
  try {
    sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    // private mode: /adlauncher offers Image instead
  }
}

export function readReturn(): string | null {
  try {
    const v = sessionStorage.getItem(RETURN_KEY);
    return v?.startsWith("/image") ? v : null;
  } catch {
    return null;
  }
}

export function clearReturn(): void {
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // nothing kept
  }
}

// ---- the sheet ----

export type AdGoal = "leads" | "website";

/** Meta's CTA values (never the label). All six are allowed on a lead form and on a website ad (AdLauncher _shared/cta.ts). */
export const CTAS = [
  { id: "LEARN_MORE", label: "Learn more" },
  { id: "SIGN_UP", label: "Sign up" },
  { id: "GET_QUOTE", label: "Get quote" },
  { id: "CONTACT_US", label: "Contact us" },
  { id: "BOOK_NOW", label: "Book now" },
  { id: "APPLY_NOW", label: "Apply now" },
] as const;
export type Cta = (typeof CTAS)[number]["id"];

export interface AdForm {
  pageId: string;
  adAccountId: string;
  goal: AdGoal;
  /** Website: where the ad sends people. */
  url: string;
  /** Leads: an instant form can't be made without one (AdLauncher's meta-create-campaign refuses). */
  privacyUrl: string;
  headline: string;
  primaryText: string;
  cta: Cta;
  dailyBudget: string;
  days: string;
  /** The firm's approval code, an adviser's brand only. */
  approval: string;
}

export const MAX_DAYS = 90;
const APPROVAL_RE = /^[A-Za-z0-9][A-Za-z0-9 ./_-]{1,39}$/;

/** An address as typed, with https:// added when it has no scheme; "" when it isn't a web address. */
export function webAddress(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(t) ? t : `https://${t}`);
    return u.protocol === "https:" && u.hostname.includes(".") ? u.toString() : "";
  } catch {
    return "";
  }
}

/** The first thing stopping Check, in plain words; null when the ad can be checked. */
export function formProblem(f: AdForm, person: boolean): string | null {
  if (!f.pageId) return "Pick a Facebook Page.";
  if (!f.adAccountId) return "Pick an ad account.";
  if (!f.headline.trim()) return "Add a headline.";
  if (f.headline.length > COPY_LIMITS.headline) return `Shorten the headline to ${COPY_LIMITS.headline} characters.`;
  if (!f.primaryText.trim()) return "Add the ad's text.";
  if (f.primaryText.length > COPY_LIMITS.primaryText) return `Shorten the text to ${COPY_LIMITS.primaryText} characters.`;
  if (f.goal === "website" && !webAddress(f.url)) return "Add the website address the ad opens.";
  if (f.goal === "leads" && !webAddress(f.privacyUrl)) return "Add your privacy policy address. The lead form needs it.";
  if (!(Number(f.dailyBudget) > 0)) return "Set a daily budget above 0.";
  const days = Number(f.days);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) return `Run it for 1 to ${MAX_DAYS} days.`;
  if (person && !APPROVAL_RE.test(f.approval.trim())) return "Add the firm's approval code.";
  return null;
}

const DAY = 86_400_000;
const SG = 8 * 3_600_000; // Singapore has no daylight saving

/** Midnight at the start of tomorrow in Singapore: the ad is made paused today and can start from tomorrow. */
export const startOf = (now: number) => new Date((Math.floor((now + SG) / DAY) + 1) * DAY - SG);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "28 Oct 2026", in Singapore. */
export const sgDate = (d: Date) => {
  const s = new Date(d.getTime() + SG);
  return `${s.getUTCDate()} ${MONTHS[s.getUTCMonth()]} ${s.getUTCFullYear()}`;
};

/** The campaign's name in AdLauncher: the headline, the approval code on an adviser's brand, and the day it was made. */
export function campaignName(f: AdForm, person: boolean, now: number): string {
  const head = f.headline.trim().replace(/\s+/g, " ");
  return [head.length > 60 ? `${head.slice(0, 57)}...` : head, person ? f.approval.trim() : "", sgDate(new Date(now))].filter(Boolean).join(" | ");
}

export const SINGAPORE = [{ key: "SG", type: "country" }];
/** The standard questions AdLauncher's lead form asks when given none, sent so the check shows them. */
export const LEAD_QUESTIONS = ["full_name", "email", "phone_number"];

/** preflight-launch's arguments: it checks the token, the account, the Page, the lead terms and the budget floor. */
export const preflightArgs = (f: AdForm) => ({ pageId: f.pageId, adAccountId: f.adAccountId, dailyBudget: Number(f.dailyBudget), locations: SINGAPORE });

/** create-campaign's arguments. Check sends them with dryRun: true; Create paused sends the same with dryRun: false. */
export function campaignArgs(f: AdForm, o: { name: string; imageUrl: string; now: number }): Record<string, unknown> {
  const start = startOf(o.now);
  const leads = f.goal === "leads";
  return {
    name: o.name,
    pageId: f.pageId,
    adAccountId: f.adAccountId,
    objective: leads ? "OUTCOME_LEADS" : "OUTCOME_TRAFFIC",
    destinationType: leads ? "ON_AD" : "WEBSITE",
    ...(leads ? { formQuestions: LEAD_QUESTIONS, privacyPolicyUrl: webAddress(f.privacyUrl) } : { destinationUrl: webAddress(f.url) }),
    dailyBudget: Number(f.dailyBudget),
    startDate: start.toISOString(),
    endDate: new Date(start.getTime() + Number(f.days) * DAY).toISOString(),
    locations: SINGAPORE,
    adCreative: { headline: f.headline.trim(), primaryText: f.primaryText.trim() },
    cta: f.cta,
    mediaType: "image",
    imageUrl: o.imageUrl,
    dryRun: true,
  };
}

// ---- what AdLauncher answers (mcp-server-v2 outputSchemas) ----

export interface PageRow {
  pageId: string;
  name: string;
  isDefault?: boolean;
}
export interface AdAccountRow {
  adAccountId: string;
  name?: string | null;
  currency?: string | null;
  status?: string | null;
}
export interface PreflightCheck {
  id: string;
  name: string;
  outcome: "pass" | "fail" | "unknown";
  detail: string;
  fix: string | null;
}
export interface Preflight {
  passed: boolean;
  pageName?: string | null;
  currency?: string | null;
  minDailyBudget?: number | null;
  checks: PreflightCheck[];
}
export interface CampaignResult {
  campaignId: string | null;
  externalCampaignId: string | null;
  status?: string;
  dryRun: boolean;
  pageName?: string | null;
  adAccountId?: string;
  currency?: string;
  budget?: { kind: string; amount: number; effectiveDaily: number | null };
  leadForm?: { questions?: string[]; privacyPolicyUrl?: string | null } | null;
  duplicateOf?: string | null;
  warnings?: string[];
}
export interface CampaignStatus {
  campaignId: string;
  externalCampaignId: string | null;
  recordStatus: string | null;
  effectiveStatus: string | null;
  reviewFeedback: string | null;
}
export interface CampaignMetrics {
  totals?: { spend: number; leads: number; impressions: number; clicks: number; cpl: number | null };
}

/** Meta's effective_status in a word or two. */
export function statusWord(s: Pick<CampaignStatus, "effectiveStatus" | "recordStatus"> | null | undefined): string {
  const e = s?.effectiveStatus ?? "";
  if (e === "ACTIVE") return "Running";
  if (/PAUSED/.test(e)) return "Paused";
  if (e === "IN_PROCESS" || e === "PENDING_REVIEW") return "In review";
  if (e === "DISAPPROVED") return "Not approved";
  if (e === "WITH_ISSUES") return "Has a problem";
  if (e === "ARCHIVED" || e === "DELETED") return "Deleted";
  return e ? e.toLowerCase().replace(/_/g, " ") : s?.recordStatus === "failed" ? "Failed" : "Not on Meta yet";
}

// ---- the launches made from a brand ----

export interface AdLaunch {
  id: string;
  /** When it was created, ISO. */
  at: string;
  /** AdLauncher's campaign id (what its web app and the result tools take). */
  campaignId: string;
  metaCampaignId: string | null;
  name: string;
  goal: AdGoal;
  approval?: string;
  /** The /image design it came from, and that design's post, if any. */
  designId?: string;
  draftId?: string;
  dailyBudget: number;
  days: number;
  currency: string | null;
  url?: string;
  privacyUrl?: string;
}

const KEY = "content-studio-ad-launches-";
const MAX_LAUNCHES = 200;
/** Fired on window when this device saves a launch, so the Ads block shows it at once. */
export const LAUNCHES_CHANGED = "cs-ad-launches";

function store(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadLaunches(userId: string): AdLaunch[] {
  try {
    const v = JSON.parse(store()?.getItem(KEY + scoped(userId)) ?? "[]");
    return Array.isArray(v) ? v.filter((l) => l && typeof l.campaignId === "string" && typeof l.at === "string") : [];
  } catch {
    return [];
  }
}

/** Newest first, one per campaign. False when this device's storage is full. */
export function saveLaunch(userId: string, l: AdLaunch): boolean {
  try {
    const next = [l, ...loadLaunches(userId).filter((x) => x.campaignId !== l.campaignId)].slice(0, MAX_LAUNCHES);
    store()?.setItem(KEY + scoped(userId), JSON.stringify(next));
    globalThis.window?.dispatchEvent?.(new Event(LAUNCHES_CHANGED));
    return true;
  } catch {
    return false;
  }
}

/** The privacy policy address used last on this brand, so the next lead ad starts with it. */
export const lastPrivacyUrl = (userId: string) => loadLaunches(userId).find((l) => l.privacyUrl)?.privacyUrl ?? "";

// ---- results, read at most every 30 minutes per campaign (this device only) ----

export const RESULTS_EVERY_MS = 30 * 60_000;
const RESULTS_KEY = "cs-ad-results";

export interface AdResult {
  at: number;
  status: string;
  spend: number | null;
  leads: number | null;
  cpl: number | null;
}

export function loadResults(): Record<string, AdResult> {
  try {
    const v = JSON.parse(store()?.getItem(RESULTS_KEY) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function saveResult(campaignId: string, r: AdResult): void {
  try {
    store()?.setItem(RESULTS_KEY, JSON.stringify({ ...loadResults(), [campaignId]: r }));
  } catch {
    // shown for this visit; read again next time
  }
}

export const resultDue = (r: AdResult | undefined, now: number) => !r || now - r.at >= RESULTS_EVERY_MS;

/** get-campaign-metrics' window: the day it was made to today, YYYY-MM-DD in Singapore. */
export function metricsWindow(at: string, now: number): { startDate: string; endDate: string } {
  const day = (t: number) => new Date(t + SG).toISOString().slice(0, 10);
  return { startDate: day(Date.parse(at)), endDate: day(now) };
}
