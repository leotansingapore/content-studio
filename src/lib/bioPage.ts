// Link-in-bio pages: /l/<slug> with the adviser's photo, name, a short line
// and their links, plus click counts per link. One page per brand profile.
// Server side: supabase/hub/015_link_in_bio.sql (RLS reads, RPC writes) and
// the link-in-bio edge function (the public page and the counting redirect).
// The checks here mirror the database's so mistakes show before saving; the
// database stays the judge.

import { SUPABASE_URL, supabase } from "@/lib/supabase";
import { activeProfileId } from "@/lib/profiles";
import { MAX_WA_TEXT } from "@/lib/carousel";
import { friendlyError } from "@/lib/teamReview";

export const BIO_ENDPOINT = `${SUPABASE_URL}/functions/v1/link-in-bio`;
export const MAX_LINKS = 20;
export const MAX_LABEL = 60;
export const MAX_URL = 2048;
export const MAX_NAME = 80;
export const MAX_HEADLINE = 160;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
// eslint-disable-next-line no-control-regex
const URL_RE = /^https?:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][^\s\u0000-\u001f\u007f\\]*)?$/i;

/** Same list as cs_save_bio_page: admin words and the app's own routes. */
export const RESERVED_SLUGS = new Set([
  "admin", "api", "login", "logout", "signup", "auth", "app", "l", "review", "www", "help",
  "support", "settings", "bio", "mb-studio", "content-studio",
  "academy", "analytics", "board", "brand", "calendar", "carousel", "clone", "coach",
  "connect", "create-guide", "diagnosis", "drafts", "edit", "fads", "feedback", "generate",
  "grid", "home", "hub", "inspiration", "media", "plan", "playbook", "profiles", "recruit",
  "reels", "roadmap", "swipe", "team", "trends", "tutorial", "voice", "welcome",
]);

export interface BioLink {
  id?: string;
  label: string;
  url: string;
}

export interface BioPage {
  id: string;
  profile_id: string;
  slug: string;
  display_name: string;
  headline: string;
  photo: string | null;
  links: BioLink[];
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClickRow {
  page_id: string;
  link_id: string;
  day: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Pure helpers (bioPage.test.ts)
// ---------------------------------------------------------------------------

/** "Ada Tan, CFP" -> "ada-tan-cfp": what someone can type into the address box. */
export function normalizeSlug(input: string): string {
  return (input ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

export function slugProblem(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return "Use 3 to 40 lowercase letters, numbers or hyphens.";
  if (RESERVED_SLUGS.has(slug)) return "That address is reserved. Try another.";
  return null;
}

/** "calendly.com/ada" -> "https://calendly.com/ada"; anything with a scheme is left alone. */
export function withScheme(url: string): string {
  const u = (url ?? "").trim();
  if (!u) return u;
  return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u.replace(/^\/+/, "")}`;
}

export function isValidLinkUrl(url: string): boolean {
  return url.length <= MAX_URL && URL_RE.test(url);
}

/** The first problem with a link row, or null. */
export function linkProblem(link: BioLink): string | null {
  if (!link.label.trim()) return "Give this link a label.";
  if (link.label.trim().length > MAX_LABEL) return `Keep the label to ${MAX_LABEL} characters.`;
  if (!isValidLinkUrl(withScheme(link.url))) return "Use a web address, like https://calendly.com/you";
  return null;
}

// ---- DM links: a link that opens a chat with you ------------------------------------
// The brand kit keeps the usernames and number (carousel.ts); these check their
// format and build the links. Pattern from zernio-dev/zernflow getDmLink (MIT).

const bare = (input: string) =>
  (input ?? "").trim().replace(/^https?:\/\//i, "").replace(/^(?:www|web)\./i, "").replace(/^m\.(?=facebook\.com)/i, "");

/** "@jane", "jane" or an instagram.com or ig.me link -> "jane"; null when it can't be an Instagram username. */
export function igUsername(input: string): string | null {
  const h = bare(input).replace(/^(instagram\.com|ig\.me\/m)\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "").toLowerCase();
  return /^(?!.*\.\.)(?!\.)(?!.*\.$)[a-z0-9._]{1,30}$/.test(h) ? h : null;
}

/** "my.page", "@my.page" or a facebook.com or m.me link -> "my.page" (a page id works too); null otherwise. */
export function fbPageName(input: string): string | null {
  const b = bare(input).replace(/^(facebook\.com|fb\.com|m\.me)\//i, "").replace(/^@/, "");
  const id = /^profile\.php\?(?:.*&)?id=(\d+)/i.exec(b)?.[1];
  const h = id ?? b.replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9.]{5,50}$/.test(h) ? h : null;
}

/**
 * A WhatsApp number as the digits wa.me takes: "+65 9123 4567", "65 9123 4567"
 * and "9123 4567" all give "6591234567"; another country needs the + and its
 * code. Null when it can't be a number.
 */
export function waDigits(input: string): string | null {
  const t = (input ?? "").trim().replace(/[\s().-]/g, "");
  const sg = (d: string) => (/^[3689]\d{7}$/.test(d) ? `65${d}` : null);
  if (t.startsWith("+")) {
    const d = t.slice(1);
    if (!/^[1-9]\d{7,14}$/.test(d)) return null;
    return d.startsWith("65") ? sg(d.slice(2)) : d;
  }
  if (!/^\d+$/.test(t)) return null;
  return t.length === 10 && t.startsWith("65") ? sg(t.slice(2)) : sg(t);
}

export const DM_PROBLEM = {
  instagram: "Use the username: letters, numbers, periods and underscores, up to 30.",
  facebook: "Use the page's username from its address, like facebook.com/your.page.",
  whatsapp: "Use a Singapore number, or + and the country code for another country.",
} as const;

export type DmFields = { instagram: string; facebook: string; whatsapp: string; whatsappText: string };

export interface DmLink {
  id: "instagram" | "facebook" | "whatsapp";
  /** The label a link-in-bio button gets. */
  label: string;
  url: string;
}

/** The links that open a chat with you, for each field that is filled in and valid. */
export function dmLinks(f: DmFields): DmLink[] {
  const ig = igUsername(f.instagram);
  const fb = fbPageName(f.facebook);
  const wa = waDigits(f.whatsapp);
  const text = f.whatsappText.trim().slice(0, MAX_WA_TEXT);
  return [
    ...(ig ? [{ id: "instagram" as const, label: "DM me on Instagram", url: `https://ig.me/m/${ig}` }] : []),
    ...(fb ? [{ id: "facebook" as const, label: "Message me on Facebook", url: `https://m.me/${fb}` }] : []),
    ...(wa ? [{ id: "whatsapp" as const, label: "WhatsApp me", url: `https://wa.me/${wa}${text ? `?text=${encodeURIComponent(text)}` : ""}` }] : []),
  ];
}

/**
 * The DM fields from the brand kit; a field never set there starts from the
 * Instagram or Facebook account added on Analytics. Cleared stays cleared.
 */
export function dmFields(
  brand: Partial<Record<keyof DmFields, string>> | null,
  accounts: { instagram?: { handle: string }; facebook?: { handle: string } },
): DmFields {
  return {
    instagram: brand?.instagram ?? igUsername(accounts.instagram?.handle ?? "") ?? "",
    facebook: brand?.facebook ?? fbPageName(accounts.facebook?.handle ?? "") ?? "",
    whatsapp: brand?.whatsapp ?? "",
    whatsappText: brand?.whatsappText ?? "",
  };
}

/** "YYYY-MM-DD" in Singapore time, `daysAgo` days before `now` (clicks are counted by SG day). */
export function sgDay(now: Date, daysAgo = 0): string {
  const sg = new Date(now.getTime() + 8 * 3600_000 - daysAgo * 86_400_000);
  return sg.toISOString().slice(0, 10);
}

/** Clicks per link id on or after `fromDay`. */
export function clickTotals(rows: ClickRow[], fromDay: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) if (r.day >= fromDay) out.set(r.link_id, (out.get(r.link_id) ?? 0) + r.count);
  return out;
}

export function publicPageUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, "")}/l/${slug}`;
}

export function clickHref(slug: string, linkId: string): string {
  return `${BIO_ENDPOINT}/${encodeURIComponent(slug)}/${encodeURIComponent(linkId)}`;
}

// ---------------------------------------------------------------------------
// Owner side (signed in)
// ---------------------------------------------------------------------------

export class BioPageError extends Error {}

function fail(error: unknown): never {
  throw new BioPageError(friendlyError(error).replace("Team review isn't", "Link in bio isn't"));
}

const PAGE_COLS = "id,profile_id,slug,display_name,headline,photo,links,published,created_at,updated_at";

/** Every page on the account (one per profile), so pages left by a deleted profile can be removed. */
export async function fetchMyBioPages(): Promise<BioPage[]> {
  const { data, error } = await supabase.from("cs_bio_pages").select(PAGE_COLS).order("created_at");
  if (error) fail(error);
  return (data ?? []) as BioPage[];
}

export interface SaveInput {
  profileId: string;
  slug: string;
  displayName: string;
  headline: string;
  photo: string | null;
  links: BioLink[];
  published: boolean;
}

export async function saveBioPage(input: SaveInput): Promise<BioPage> {
  const { data, error } = await supabase.rpc("cs_save_bio_page", {
    p_profile_id: input.profileId,
    p_slug: input.slug,
    p_display_name: input.displayName,
    p_headline: input.headline,
    p_photo: input.photo,
    p_links: input.links.map((l) => ({ ...(l.id ? { id: l.id } : {}), label: l.label, url: withScheme(l.url) })),
    p_published: input.published,
  });
  if (error) fail(error);
  return data as BioPage;
}

export async function deleteBioPage(profileId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("cs_delete_bio_page", { p_profile_id: profileId });
  if (error) fail(error);
  return Boolean(data);
}

export async function fetchClicks(pageId: string, fromDay: string): Promise<ClickRow[]> {
  const { data, error } = await supabase
    .from("cs_bio_clicks")
    .select("page_id,link_id,day,count")
    .eq("page_id", pageId)
    .gte("day", fromDay)
    .limit(2000);
  if (error) fail(error);
  return (data ?? []) as ClickRow[];
}

export function currentProfileId(userId: string): string {
  return activeProfileId(userId);
}

// ---------------------------------------------------------------------------
// Visitors (public page, no sign-in)
// ---------------------------------------------------------------------------

export interface PublicBio {
  slug: string;
  display_name: string;
  headline: string;
  photo: string | null;
  links: { id: string; label: string }[];
}

export async function fetchPublicBio(slug: string): Promise<{ ok: boolean; data?: PublicBio; gone?: boolean }> {
  if (!SLUG_RE.test(slug)) return { ok: false, gone: true };
  try {
    const res = await fetch(`${BIO_ENDPOINT}/${encodeURIComponent(slug)}`);
    if (res.status === 404) return { ok: false, gone: true };
    if (!res.ok) return { ok: false, gone: false };
    const json = (await res.json()) as PublicBio & { gone?: boolean };
    return json.gone ? { ok: false, gone: true } : { ok: true, data: json };
  } catch {
    return { ok: false, gone: false };
  }
}
