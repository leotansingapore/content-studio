// Add a brand from its App Store link (/brands/new). Apple's public lookup, search and review feeds answer any
// origin (CORS *), so the read runs in the browser: no function, no key, no scraping. Three reads:
//   1. the listing: name, icon, genre, price, rating and how many ratings, screenshots, the seller's website
//   2. apps like it: Apple's own search on the listing's subtitle (or genre), other sellers only
//   3. what their users complain about: 1 and 2 star reviews of those apps, in the reviewers' words
// What the person keeps is saved as voice-memory facts, which Write, campaigns and Claude's get_brand already read.
import type { BrandDna } from "@/lib/addBrand";
import { FACT_CHARS } from "@/lib/voiceMemory";

export interface AppListing {
  id: number;
  /** The brand name: the store title before its subtitle ("Structured" from "Structured: Daily Planner Todo"). */
  name: string;
  /** The rest of the store title, used to find apps like it. */
  subtitle: string;
  genre: string;
  seller: string;
  sellerUrl: string | null;
  icon: string | null;
  screenshots: string[];
  description: string;
  /** Average stars, null when the store shows none. */
  rating: number | null;
  ratings: number;
  /** "Free" or the store's own price text ("$4.99"). */
  price: string;
  url: string;
  country: string;
}
export interface Rival {
  id: number;
  name: string;
  icon: string | null;
}
export interface Complaint {
  /** The review's own id, so a pick survives a reload. */
  id: string;
  app: string;
  stars: number;
  text: string;
}

const API = "https://itunes.apple.com";
const TIMEOUT_MS = 10_000;
/** Apps like it whose reviews are read, and complaints kept from each and in all. */
export const MAX_RIVALS = 4;
const PER_RIVAL = 4;
export const MAX_COMPLAINTS = 12;
/** Complaints the person may keep as facts. */
export const MAX_PAINS = 5;

// The site test campaigns run on what they post (supabase/functions/_shared/slideCampaign.ts domainsIn), plus links
// and handles: a site with any ending, look-alike dots ("rival\uFF0Eapp") or spelled out ("rival dot app"). Campaigns
// trust memory facts as the owner's own words, so a quote that names a site must never become one.
const LINKISH = /https?:|www\.|@\w|\b[a-z0-9-]+\.[a-z]{2,}\b|\b[a-z0-9-]+\s*(?:\[\.\]|\(\.\)|\[dot\]|\(dot\)|\s+dot\s+)\s*[a-z]{2,}\b/i;
const linkish = (t: string) => LINKISH.test(t.replace(/[\u3002\uFF0E\uFF61\u2024\uFE52]/g, "."));
const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const https = (v: unknown) => (/^https:\/\/[^\s"'<>]+$/.test(str(v)) ? str(v) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The app id and store country from an App Store link ("apps.apple.com/sg/app/x/id123"), or null for anything else. */
export function appStoreLink(input: string): { id: number; country: string } | null {
  const s = input.trim();
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (!/^(apps|itunes)\.apple\.com$/i.test(u.hostname)) return null;
  const id = u.pathname.match(/\/id(\d{5,12})(?:\/|$)/)?.[1];
  if (!id) return null;
  return { id: Number(id), country: u.pathname.match(/^\/([a-z]{2})\//i)?.[1]?.toLowerCase() ?? "us" };
}

/** "Structured: Daily Planner Todo" -> ["Structured", "Daily Planner Todo"]; a title with no subtitle keeps it whole. */
export function splitTitle(title: string): [string, string] {
  const t = str(title);
  const m = t.match(/^(.+?)\s*(?::|\s[-–—|]\s)\s*(.+)$/);
  return m ? [m[1].slice(0, 40), m[2]] : [t.slice(0, 40), ""];
}

/** The listing from a lookup answer, or null when Apple has no such app in that store. */
export function toListing(raw: unknown, country: string): AppListing | null {
  const r = (raw as { results?: unknown } | null)?.results;
  const a = (Array.isArray(r) ? r[0] : null) as Record<string, unknown> | null;
  if (!a || num(a.trackId) === null || !str(a.trackName)) return null;
  const [name, subtitle] = splitTitle(str(a.trackName));
  const shots = Array.isArray(a.screenshotUrls) ? a.screenshotUrls.map(https).filter((u): u is string => !!u).slice(0, 8) : [];
  return {
    id: a.trackId as number,
    name,
    subtitle,
    genre: str(a.primaryGenreName),
    seller: str(a.sellerName) || str(a.artistName),
    sellerUrl: https(a.sellerUrl),
    icon: https(a.artworkUrl512) ?? https(a.artworkUrl100),
    screenshots: shots,
    description: typeof a.description === "string" ? a.description.trim() : "",
    rating: num(a.averageUserRating),
    ratings: num(a.userRatingCount) ?? 0,
    price: str(a.formattedPrice) || (num(a.price) === 0 ? "Free" : ""),
    url: https(a.trackViewUrl)?.replace(/\?.*$/, "") ?? `https://apps.apple.com/${country}/app/id${a.trackId}`,
    country,
  };
}

/** The description's opening line, cut at a sentence end to fit the one-liner. */
export function openingLine(description: string, max = 160): string {
  const first = description.split(/\n/).map(str).find(Boolean) ?? "";
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > 40 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}...`;
}

/** "Productivity" -> "productivity app", the brand's answer to "What do you do?". */
export const appProfession = (l: AppListing) => (l.genre ? `${l.genre.toLowerCase()} app` : "app");

const monthYear = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

/** Facts the listing proves, each one the store states: what it is, its price, its rating with the count and date. */
export function proofLines(l: AppListing, now = new Date()): string[] {
  const lines = [
    l.genre && `${l.name} is a ${l.genre.toLowerCase()} app on the App Store`,
    l.price && (/^free$/i.test(l.price) ? `${l.name} is free to download on the App Store` : `${l.name} costs ${l.price} on the App Store`),
    // a handful of ratings proves nothing, so the line needs 20
    l.rating !== null && l.ratings >= 20 &&
      `${l.name} is rated ${l.rating.toFixed(1)} out of 5 from ${l.ratings.toLocaleString("en-US")} App Store ratings (${l.country.toUpperCase()} store, ${monthYear(now)})`,
  ];
  return lines.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= FACT_CHARS);
}

/** Apps like it from a search answer: other sellers, enough ratings to have reviews, the listing itself left out. */
export function toRivals(raw: unknown, self: AppListing): Rival[] {
  const r = (raw as { results?: unknown } | null)?.results;
  if (!Array.isArray(r)) return [];
  const out: Rival[] = [];
  for (const x of r as Record<string, unknown>[]) {
    const id = num(x?.trackId);
    if (id === null || id === self.id || str(x.sellerName) === self.seller || (num(x.userRatingCount) ?? 0) < 50) continue;
    out.push({ id, name: splitTitle(str(x.trackName))[0], icon: https(x.artworkUrl100) });
    if (out.length === MAX_RIVALS) break;
  }
  return out;
}

/**
 * The reviewer's own words, shortened to fit a fact. A review's title usually names the problem ("Customer service is
 * terrible") while its first sentence is often a run-up ("I've used planners for years."), so a title of 3 words or
 * more wins; a thinner one gives way to the body's first sentence.
 */
export function quoteOf(title: string, body: string, max: number): string {
  const t = str(title);
  const sentence = str(body).split(/(?<=[.!?])\s/)[0] ?? "";
  const pick = t.split(" ").length >= 3 || sentence.length < 20 ? t : sentence;
  if (pick.length <= max) return pick;
  const cut = pick.slice(0, max - 3);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 20))}...`;
}

/** What the fact says, so a writer can open on the problem without pinning it on this brand. */
export const painFact = (genre: string, quote: string) => `Users of other ${genre ? `${genre.toLowerCase()} ` : ""}apps complain: "${quote}"`;

/** 1 and 2 star reviews from one app's review feed, each quote short enough for its fact. */
export function toComplaints(raw: unknown, app: string, genre: string): Complaint[] {
  const e = (raw as { feed?: { entry?: unknown } } | null)?.feed?.entry;
  // a feed with one review answers an object, not a list
  const rows = (Array.isArray(e) ? e : e ? [e] : []) as Record<string, { label?: unknown } | undefined>[];
  const room = FACT_CHARS - painFact(genre, "").length;
  const out: Complaint[] = [];
  for (const x of rows) {
    const stars = Number(str(x?.["im:rating"]?.label));
    const id = str(x?.id?.label);
    if (!id || !(stars >= 1 && stars <= 2)) continue;
    const text = quoteOf(str(x.title?.label), str(x.content?.label), room);
    // the fact reaches writers that post unattended (campaigns), so a quote naming a site or handle is left out
    if (text.length < 12 || linkish(text)) continue;
    out.push({ id, app, stars, text });
    if (out.length === PER_RIVAL) break;
  }
  return out;
}

async function getJson(url: string, f: typeof fetch): Promise<unknown> {
  const res = await f(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`App Store answered ${res.status}`);
  return res.json();
}

export async function readListing(link: { id: number; country: string }, f: typeof fetch = fetch): Promise<AppListing | null> {
  return toListing(await getJson(`${API}/lookup?id=${link.id}&country=${link.country}`, f), link.country);
}

/** Apps like it, from Apple's search on the listing's subtitle or else its genre. Empty when the search fails. */
export async function readRivals(l: AppListing, f: typeof fetch = fetch): Promise<Rival[]> {
  const term = l.subtitle || l.genre;
  if (!term) return [];
  try {
    return toRivals(await getJson(`${API}/search?term=${encodeURIComponent(term)}&entity=software&country=${l.country}&limit=15`, f), l);
  } catch {
    return [];
  }
}

/** Complaints from every rival's newest reviews, read side by side; a feed that fails just adds none. */
export async function readComplaints(rivals: Rival[], l: AppListing, f: typeof fetch = fetch): Promise<Complaint[]> {
  const feeds = await Promise.all(
    rivals.map((r) =>
      getJson(`${API}/${l.country}/rss/customerreviews/page=1/id=${r.id}/sortby=mostrecent/json`, f)
        .then((raw) => toComplaints(raw, r.name, l.genre))
        .catch(() => [] as Complaint[]),
    ),
  );
  // one from each app in turn, so the first app's four don't crowd out the rest
  const out: Complaint[] = [];
  for (let i = 0; i < PER_RIVAL; i++) for (const list of feeds) if (list[i]) out.push(list[i]);
  return out.slice(0, MAX_COMPLAINTS);
}

/** What /brands/new keeps of an app read, beside the site read. `proof` and `pains` are what the person ticked. */
export interface AppRead {
  listing: AppListing;
  rivals: Rival[];
  complaints: Complaint[];
  proof: string[];
  pains: string[];
}

export const isAppRead = (v: unknown): v is AppRead => {
  const a = v as Partial<AppRead> | null;
  const strings = (x: unknown) => Array.isArray(x) && x.every((s) => typeof s === "string");
  return (
    !!a && typeof a === "object" && !!a.listing && typeof a.listing.id === "number" && typeof a.listing.name === "string" &&
    Array.isArray(a.rivals) && Array.isArray(a.complaints) && strings(a.proof) && strings(a.pains)
  );
};

/** The facts an app read adds to the new brand: the ticked proof lines, then the ticked complaints. */
export function appFacts(a: AppRead): string[] {
  const picked = new Set(a.pains);
  return [...a.proof, ...a.complaints.filter((c) => picked.has(c.id)).slice(0, MAX_PAINS).map((c) => painFact(a.listing.genre, c.text))];
}

/**
 * The cards' starting values: the app's own website read (colour, social accounts, audience, voice) when there is
 * one, with the store's name, icon, opening line and genre in place of what the site lacks.
 */
export function appDna(l: AppListing, site: BrandDna | null): BrandDna {
  return {
    url: l.url,
    colour: null,
    handles: {},
    audience: "general",
    audienceDetail: "",
    edge: "",
    voice: "",
    ...site,
    name: l.name,
    logo: l.icon ?? site?.logo ?? null,
    oneLiner: site?.oneLiner || openingLine(l.description),
    topics: site?.topics.length ? site.topics : l.genre ? [l.genre] : [],
  };
}
