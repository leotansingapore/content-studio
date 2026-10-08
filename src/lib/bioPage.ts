// Link-in-bio pages: /l/<slug> with the adviser's photo, name, a short line
// and their links, plus click counts per link. One page per brand profile.
// Server side: supabase/hub/015_link_in_bio.sql (RLS reads, RPC writes) and
// the link-in-bio edge function (the public page and the counting redirect).
// The checks here mirror the database's so mistakes show before saving; the
// database stays the judge.

import { SUPABASE_URL, supabase } from "@/lib/supabase";
import { activeProfileId } from "@/lib/profiles";
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
