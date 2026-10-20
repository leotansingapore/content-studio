// Tracked short links: /t/<slug> on the app sends people on to a saved
// address and counts taps (clicks) and people per Singapore day; links can
// share a campaign, and a campaign can have a public report at
// /t/report/<slug>. Members only. Server side: supabase/hub/019_tracked_links.sql
// (RLS reads, RPC writes) and the tracked-link edge function. The checks here
// mirror the database's so mistakes show before saving; the database stays
// the judge. Design: docs/tracked-links.md.

import { SUPABASE_URL, supabase } from "@/lib/supabase";
import { activeProfileId } from "@/lib/profiles";
import { MAX_LABEL, MAX_URL, RESERVED_SLUGS, isValidLinkUrl, sgDay, withScheme } from "@/lib/bioPage";
import { fetchMembership, hubAccess } from "@/lib/hub";
import { friendlyError } from "@/lib/teamReview";

export const TRACK_ENDPOINT = `${SUPABASE_URL}/functions/v1/tracked-link`;
export const MAX_TRACKED = 100;
export const MAX_CAMPAIGN = 60;
export { MAX_LABEL, MAX_URL };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const REPORT_RE = /^[a-z0-9]{20}$/;
/** Same as c_self_re in cs_save_tracked_link: our own /t/ and tracked-link addresses. */
const SELF_RE = /^https?:\/\/(consultant-content-studio\.vercel\.app|[a-z0-9-]+\.supabase\.co)\.?(:[0-9]{1,5})?\/(t|functions\/v1\/tracked-link)([/?#]|$)/i;
/** cs_save_tracked_link's list: link-in-bio's plus this feature's own words. */
const RESERVED = new Set([...RESERVED_SLUGS, "t", "track", "tracked-link", "link", "links", "report", "reports", "campaign", "campaigns"]);

export interface TrackedLink {
  id: string;
  campaign_id: string | null;
  slug: string;
  label: string;
  url: string;
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  report_slug: string | null;
}

export interface DayRow {
  link_id: string;
  day: string;
  clicks: number;
  people: number;
}

export interface Counts {
  clicks: number;
  people: number;
}

// ---------------------------------------------------------------------------
// Pure helpers (trackedLinks.test.ts)
// ---------------------------------------------------------------------------

export const trackedUrl = (origin: string, slug: string) => `${origin.replace(/\/+$/, "")}/t/${slug}`;
export const reportUrl = (origin: string, reportSlug: string) => `${origin.replace(/\/+$/, "")}/t/report/${reportSlug}`;

/** A /t/ or tracked-link address of ours: tracking it again would loop. */
export const isTrackedUrl = (url: string) => SELF_RE.test(withScheme(url));

export interface LinkInput {
  slug: string;
  label: string;
  url: string;
  campaign: string;
}

/** The first problem with a link before saving, or null. A blank slug means "pick one for me". */
export function linkInputProblem(l: LinkInput): string | null {
  // In the order the form asks for them.
  const url = withScheme(l.url);
  if (!isValidLinkUrl(url)) return "Use a web address, like https://yoursite.sg/review";
  if (isTrackedUrl(url)) return "That is already a tracked link. Paste the address it goes to.";
  if (!l.label.trim()) return "Give the link a label.";
  if (l.label.trim().length > MAX_LABEL) return `Keep the label to ${MAX_LABEL} characters.`;
  if (l.campaign.trim().length > MAX_CAMPAIGN) return `Keep the campaign name to ${MAX_CAMPAIGN} characters.`;
  const slug = l.slug.trim();
  if (slug && !SLUG_RE.test(slug)) return "Use 3 to 40 lowercase letters, numbers or hyphens for the address.";
  if (RESERVED.has(slug)) return "That address is reserved. Try another.";
  return null;
}

/** Clicks and people per link id on or after `fromDay`. */
export function countsByLink(rows: DayRow[], fromDay: string): Map<string, Counts> {
  const out = new Map<string, Counts>();
  for (const r of rows) {
    if (r.day < fromDay) continue;
    const c = out.get(r.link_id) ?? { clicks: 0, people: 0 };
    out.set(r.link_id, { clicks: c.clicks + r.clicks, people: c.people + r.people });
  }
  return out;
}

/** Clicks per Singapore day for the last `days` days, oldest first, zero-filled; `linkIds` limits it to those links. */
export function dailyClicks(rows: DayRow[], days: number, now: Date, linkIds?: Set<string>): { day: string; clicks: number }[] {
  const by = new Map<string, number>();
  for (const r of rows) if (!linkIds || linkIds.has(r.link_id)) by.set(r.day, (by.get(r.day) ?? 0) + r.clicks);
  return Array.from({ length: days }, (_, i) => {
    const day = sgDay(now, days - 1 - i);
    return { day, clicks: by.get(day) ?? 0 };
  });
}

/**
 * The campaign whose public report goes away if `linkId` is deleted
 * (nextCampaign undefined) or moved to `nextCampaign`: it is the link's
 * campaign, its report is on, and no other link stays in it. Null otherwise.
 * The database deletes a campaign left with no link, report included.
 */
export function reportLostBy(
  links: TrackedLink[],
  campaigns: Campaign[],
  linkId: string,
  nextCampaign?: string,
): Campaign | null {
  const link = links.find((l) => l.id === linkId);
  const camp = campaigns.find((c) => c.id === link?.campaign_id);
  if (!link || !camp?.report_slug) return null;
  if (nextCampaign !== undefined && nextCampaign.trim().toLowerCase() === camp.name.toLowerCase()) return null;
  return links.some((l) => l.id !== linkId && l.campaign_id === camp.id) ? null : camp;
}

/** "Mon 5" style labels for a chart point. */
export function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return d.toLocaleDateString("en-SG", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

// ---------------------------------------------------------------------------
// Owner side (signed in)
// ---------------------------------------------------------------------------

let member: { uid: string; p: Promise<boolean> } | null = null;

/** Whether the signed-in account may make tracked links (admin, client or active member), asked once per account. */
export async function canTrack(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id ?? "";
  if (!uid) return false;
  if (member?.uid !== uid) {
    const p = fetchMembership().then((m) => hubAccess(m) !== "locked");
    member = { uid, p };
    p.catch(() => (member = null));
  }
  return member.p.catch(() => false);
}

export class TrackedLinkError extends Error {}

function fail(error: unknown): never {
  throw new TrackedLinkError(friendlyError(error).replace("Team review isn't", "Tracked links aren't"));
}

export interface Mine {
  links: TrackedLink[];
  campaigns: Campaign[];
  days: DayRow[];
}

/** The brand open now (docs/brand-isolation.md, 024): links and campaigns belong to one brand. */
async function openBrand(): Promise<string> {
  const uid = (await supabase.auth.getSession()).data.session?.user.id;
  return activeProfileId(uid);
}

/** The caller's links and campaigns in the open brand, and the last 30 Singapore days of counts. */
export async function fetchMine(now = new Date()): Promise<Mine> {
  const brand = await openBrand();
  const [l, c, d] = await Promise.all([
    supabase.from("cs_tracked_links").select("id,campaign_id,slug,label,url,created_at").eq("profile_id", brand).order("created_at", { ascending: false }),
    supabase.from("cs_tracked_link_campaigns").select("id,name,report_slug").eq("profile_id", brand).order("name"),
    supabase.from("cs_tracked_link_days").select("link_id,day,clicks,people").gte("day", sgDay(now, 29)).limit(5000),
  ]);
  for (const r of [l, c, d]) if (r.error) fail(r.error);
  const links = (l.data ?? []) as TrackedLink[];
  const ids = new Set(links.map((x) => x.id));
  // the counts carry no brand: keep this brand's links' rows, or the all-links chart adds the other brands' clicks
  return { links, campaigns: (c.data ?? []) as Campaign[], days: ((d.data ?? []) as DayRow[]).filter((r) => ids.has(r.link_id)) };
}

/** Creates (id null) or edits a link. A blank slug keeps the current one, or picks one for a new link. */
export async function saveTrackedLink(id: string | null, l: LinkInput): Promise<TrackedLink> {
  const { data, error } = await supabase.rpc("cs_save_tracked_link", {
    p_id: id,
    p_slug: l.slug.trim() || null,
    p_label: l.label,
    p_url: withScheme(l.url),
    p_campaign: l.campaign.trim() || null,
    p_profile: await openBrand(),
  });
  if (error) fail(error);
  return data as TrackedLink;
}

/** Deletes every tracked link of one brand (removing the brand), with their counts; their addresses are held 30 days. */
export async function deleteBrandLinks(profileId: string): Promise<void> {
  const { data, error } = await supabase.from("cs_tracked_links").select("id").eq("profile_id", profileId);
  if (error) fail(error);
  for (const l of data ?? []) await deleteTrackedLink(l.id as string);
}

export async function deleteTrackedLink(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("cs_delete_tracked_link", { p_id: id });
  if (error) fail(error);
  return Boolean(data);
}

/** Switches a campaign's public report on (returns its slug) or off (null). */
export async function setReport(campaignId: string, on: boolean): Promise<string | null> {
  const { data, error } = await supabase.rpc("cs_set_tracked_link_report", { p_campaign_id: campaignId, p_on: on });
  if (error) fail(error);
  return (data as string | null) ?? null;
}

// ---------------------------------------------------------------------------
// Visitors (public report page, no sign-in)
// ---------------------------------------------------------------------------

export interface PublicReport {
  campaign: string;
  clicks: number;
  people: number;
  days: { day: string; clicks: number; people: number }[];
  links: { label: string; host: string; clicks: number; people: number }[];
}

export async function fetchPublicReport(reportSlug: string): Promise<{ ok: boolean; data?: PublicReport; gone?: boolean }> {
  const slug = reportSlug.toLowerCase();
  if (!REPORT_RE.test(slug)) return { ok: false, gone: true };
  try {
    const res = await fetch(`${TRACK_ENDPOINT}/report/${slug}`);
    if (res.status === 404) return { ok: false, gone: true };
    if (!res.ok) return { ok: false, gone: false };
    return { ok: true, data: (await res.json()) as PublicReport };
  } catch {
    return { ok: false, gone: false };
  }
}
