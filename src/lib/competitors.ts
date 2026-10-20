// Competitors (Discover > Competitors, Leo only; docs/north-star/items/find-competitors.md): the businesses a brand
// watches, up to 12 per brand, in one synced key written whole (like Following), so a removal stays removed without
// a tombstone. Links and handles are added on the device (parseInput); a site or a bare name is read by the
// competitors edge function in a job outside React, so leaving the page keeps it going.

import advisorsData from "@/data/advisors.json";
import { ADS } from "@/lib/adsSwipe";
import { loadBrand } from "@/lib/carousel";
import { callFn, EdgeError } from "@/lib/edgeFn";
import { slug } from "@/lib/links";
import { loadMarket } from "@/lib/market";
import { loadPositioning } from "@/lib/positioning";
import { scoped } from "@/lib/profiles";
import { type Brand, type Candidate, type Handles, MAX_CANDIDATES, nameKey, parseInput, type Suggestion } from "../../supabase/functions/competitors/logic.ts";

export { nameKey, parseInput };
export type { Handles, Suggestion };

export const MAX_COMPETITORS = 12;
const MAX_DISMISSED = 200;

export interface Competitor {
  /** slug(name) + "-" + 4 random chars, never reused. */
  id: string;
  name: string;
  /** Host only, "singlife.com". */
  site: string | null;
  /** The first https logo link the site read found (a link, not a picture); initials when it fails to load. */
  logo: string | null;
  why: string;
  /** From an Ad Library link (view_all_page_id). */
  fbPageId: string | null;
  handles: Handles;
  adsCountry: "SG" | "ALL";
  source: "typed" | "suggested" | "website";
  addedAt: string;
}
export interface CompetitorsState {
  list: Competitor[];
  /** Lowercased names "Not them" hid for good, newest first, 200 at most. */
  dismissed: string[];
}

const KEY = "content-studio-competitors-";
const CHANGED = "content-studio-competitors-changed";
const EMPTY = (): CompetitorsState => ({ list: [], dismissed: [] });
export const competitorsKey = (userId: string) => KEY + scoped(userId);

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const HANDLE_KEYS = ["facebook", "instagram", "tiktok", "linkedin", "youtube"] as const;

function clean(raw: unknown): Competitor | null {
  const c = raw as Record<string, unknown> | null;
  const id = str(c?.id, 120);
  const name = str(c?.name, 80);
  if (!id || !name) return null;
  const h = (c?.handles ?? {}) as Record<string, unknown>;
  return {
    id,
    name,
    site: str(c?.site, 200) || null,
    logo: /^https:\/\//.test(str(c?.logo, 500)) ? str(c?.logo, 500) : null,
    why: str(c?.why, 200),
    fbPageId: /^\d{3,25}$/.test(str(c?.fbPageId, 25)) ? str(c?.fbPageId, 25) : null,
    handles: Object.fromEntries(HANDLE_KEYS.map((k) => [k, str(h[k], 80)]).filter(([, v]) => v)) as Handles,
    adsCountry: c?.adsCountry === "ALL" ? "ALL" : "SG",
    source: c?.source === "suggested" || c?.source === "website" ? c.source : "typed",
    addedAt: str(c?.addedAt, 40) || new Date(0).toISOString(),
  };
}

export function loadCompetitors(userId: string): CompetitorsState {
  try {
    const v = JSON.parse(localStorage.getItem(competitorsKey(userId)) ?? "null");
    if (!v || typeof v !== "object") return EMPTY();
    return {
      list: (Array.isArray(v.list) ? v.list : []).map(clean).filter((c): c is Competitor => c !== null).slice(0, MAX_COMPETITORS),
      dismissed: (Array.isArray(v.dismissed) ? v.dismissed : []).filter((d): d is string => typeof d === "string").slice(0, MAX_DISMISSED),
    };
  } catch {
    return EMPTY();
  }
}

/** Writes the whole state; when storage is full, keeps 20 dismissed names, then drops the logo links, then gives up. */
export function saveCompetitors(userId: string, s: CompetitorsState): CompetitorsState {
  const tries = [s, { ...s, dismissed: s.dismissed.slice(0, 20) }, { list: s.list.map((c) => ({ ...c, logo: null })), dismissed: s.dismissed.slice(0, 20) }];
  let saved = s;
  for (const t of tries) {
    try {
      localStorage.setItem(competitorsKey(userId), JSON.stringify(t));
      saved = t;
      break;
    } catch {
      // storage full: the next, smaller try
    }
  }
  globalThis.dispatchEvent?.(new Event(CHANGED));
  return saved;
}

/** Calls `cb` whenever the list is saved on this device (the page, or a read finishing outside React). */
export function onCompetitorsChanged(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
}

/** The same business: one site host, Facebook page id or handle (same platform) in common, or the same name. */
export function sameCompetitor(a: Pick<Competitor, "name" | "site" | "fbPageId" | "handles">, b: Pick<Competitor, "name" | "site" | "fbPageId" | "handles">): boolean {
  if (nameKey(a.name) === nameKey(b.name)) return true;
  if (a.site && a.site === b.site) return true;
  if (a.fbPageId && a.fbPageId === b.fbPageId) return true;
  return HANDLE_KEYS.some((k) => a.handles[k] && a.handles[k]!.toLowerCase() === b.handles[k]?.toLowerCase());
}

export const newId = (name: string) => `${slug(name).slice(0, 40) || "c"}-${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`;

export function addCompetitor(
  userId: string,
  c: Omit<Competitor, "id" | "addedAt">,
  now = new Date(),
): { ok: true; c: Competitor } | { ok: false; reason: "duplicate" | "cap"; existing?: Competitor } {
  const s = loadCompetitors(userId);
  const existing = s.list.find((x) => sameCompetitor(x, c));
  if (existing) return { ok: false, reason: "duplicate", existing };
  if (s.list.length >= MAX_COMPETITORS) return { ok: false, reason: "cap" };
  let id = newId(c.name);
  while (s.list.some((x) => x.id === id)) id = newId(c.name);
  const row: Competitor = { ...c, name: c.name.slice(0, 80), why: c.why.slice(0, 200), id, addedAt: now.toISOString() };
  saveCompetitors(userId, { ...s, list: [...s.list, row] });
  return { ok: true, c: row };
}

/** Takes one off the list and returns it, so Undo can put it back. */
export function removeCompetitor(userId: string, id: string): Competitor | null {
  const s = loadCompetitors(userId);
  const row = s.list.find((c) => c.id === id) ?? null;
  if (row) saveCompetitors(userId, { ...s, list: s.list.filter((c) => c.id !== id) });
  return row;
}

/** Undo: the row back in its place (the list keeps the order competitors were added in). */
export function restoreCompetitor(userId: string, row: Competitor): boolean {
  const s = loadCompetitors(userId);
  if (s.list.length >= MAX_COMPETITORS || s.list.some((c) => c.id === row.id || sameCompetitor(c, row))) return false;
  saveCompetitors(userId, { ...s, list: [...s.list, row].sort((a, b) => a.addedAt.localeCompare(b.addedAt)) });
  return true;
}

export function updateCompetitor(userId: string, id: string, patch: Partial<Omit<Competitor, "id" | "addedAt">>): Competitor | null {
  const s = loadCompetitors(userId);
  const row = s.list.find((c) => c.id === id);
  if (!row) return null;
  const next = { ...row, ...patch };
  saveCompetitors(userId, { ...s, list: s.list.map((c) => (c.id === id ? next : c)) });
  return next;
}

/** "Not them": that name never comes back as a suggestion on this brand. */
export function dismissName(userId: string, name: string): void {
  const s = loadCompetitors(userId);
  saveCompetitors(userId, { ...s, dismissed: [nameKey(name), ...s.dismissed.filter((d) => d !== nameKey(name))].slice(0, MAX_DISMISSED) });
}

// ---- The editor's fields ---------------------------------------------------------------------------------------

export interface EditFields {
  name: string;
  site: string;
  facebook: string;
  instagram: string;
  tiktok: string;
  linkedin: string;
  youtube: string;
  why: string;
  adsCountry: "SG" | "ALL";
}

export const editFields = (c: Competitor): EditFields => ({
  name: c.name,
  site: c.site ?? "",
  facebook: c.fbPageId ? `https://www.facebook.com/ads/library/?view_all_page_id=${c.fbPageId}` : c.handles.facebook ?? "",
  instagram: c.handles.instagram ?? "",
  tiktok: c.handles.tiktok ?? "",
  linkedin: c.handles.linkedin ?? "",
  youtube: c.handles.youtube ?? "",
  why: c.why,
  adsCountry: c.adsCountry,
});

/** One handle field: a link on that platform, or the handle typed bare (with or without @). "" when empty. */
function fieldHandle(platform: keyof Handles, raw: string): string | null {
  const t = raw.trim();
  if (!t) return "";
  const p = parseInput(t.startsWith("@") ? t.slice(1) : t);
  if (p?.kind === "link" && p.handles[platform]) return p.handles[platform]!;
  const bare = t.replace(/^@/, "");
  if (platform === "linkedin") return /^(company|in)\/[A-Za-z0-9._-]{2,60}$/.test(bare) ? bare : /^[A-Za-z0-9._-]{2,60}$/.test(bare) ? `company/${bare}` : null;
  return /^[A-Za-z0-9._-]{2,60}$/.test(bare) ? bare : null;
}

/** The editor's fields as a change to the row, or the first field that can't be read. */
export function readEdit(f: EditFields): { ok: true; patch: Partial<Competitor> } | { ok: false; field: keyof EditFields } {
  const name = f.name.trim().slice(0, 80);
  if (name.length < 2) return { ok: false, field: "name" };
  const site = f.site.trim() ? parseInput(f.site) : null;
  if (f.site.trim() && site?.kind !== "site") return { ok: false, field: "site" };
  const fb = f.facebook.trim() ? parseInput(f.facebook) : null;
  const fbPageId = fb?.kind === "link" ? fb.fbPageId : null;
  const handles: Handles = {};
  for (const k of HANDLE_KEYS) {
    const v = k === "facebook" && fbPageId ? "" : fieldHandle(k, f[k]);
    if (v === null) return { ok: false, field: k };
    if (v) handles[k] = v;
  }
  return { ok: true, patch: { name, site: site?.kind === "site" ? site.site : null, fbPageId, handles, why: f.why.trim().slice(0, 200), adsCountry: f.adsCountry } };
}

// ---- Reading a site or a name (outside React) ------------------------------------------------------------------

export interface Choice { name: string; /** the search result's address: parseInput reads it as a site or a link */ site: string; title: string }
type ReadAnswer = { found: { name: string; site: string | null; logo: string | null; handles: Handles } } | { choices: Choice[] } | { notFound: true };
export type ReadState =
  | { status: "running"; input: string }
  | { status: "choices"; input: string; choices: Choice[] }
  | { status: "notFound"; input: string }
  | { status: "failed"; input: string; message: string };
/** A line for a toast, and optionally a row whose editor should open (put in the URL by the page). */
export interface Notice { title: string; edit?: string }

export const READ_FAILED = "Couldn't read their site. Try again in a few minutes.";
export const NOT_SWITCHED_ON = "Competitors is not switched on for this account.";

const reads = new Map<string, ReadState>();
const notices: Notice[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const readKey = (userId: string, id: string) => `${scoped(userId)}:${id}`;

export const readState = (userId: string, id: string): ReadState | undefined => reads.get(readKey(userId, id));
/** The toasts and editors the jobs asked for since the last call; the page shows them once. */
export const takeNotices = (): Notice[] => notices.splice(0);
export function onCompetitors(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** A finished read folded into its row; a row that turns out to repeat another is dropped with a toast. */
export function applyFound(userId: string, id: string, f: Extract<ReadAnswer, { found: unknown }>["found"]): void {
  const s = loadCompetitors(userId);
  const row = s.list.find((c) => c.id === id);
  if (!row) return; // removed while it was read
  const next: Competitor = { ...row, name: (f.name || row.name).slice(0, 80), site: f.site ?? row.site, logo: f.logo ?? row.logo, handles: { ...f.handles, ...row.handles } };
  const twin = s.list.find((c) => c.id !== id && sameCompetitor(c, next));
  if (twin) {
    saveCompetitors(userId, { ...s, list: s.list.filter((c) => c.id !== id) });
    notices.push({ title: `You already watch ${twin.name}.` });
    return;
  }
  saveCompetitors(userId, { ...s, list: s.list.map((c) => (c.id === id ? next : c)) });
}

export async function runRead(userId: string, id: string, input: string): Promise<void> {
  const k = readKey(userId, id);
  if (reads.get(k)?.status === "running") return;
  reads.set(k, { status: "running", input });
  emit();
  try {
    const r = await callFn<ReadAnswer>("competitors", { mode: "read", input }, READ_FAILED);
    if ("found" in r && r.found) {
      reads.delete(k);
      applyFound(userId, id, r.found);
    } else if ("choices" in r && r.choices?.length) {
      reads.set(k, { status: "choices", input, choices: r.choices.slice(0, 3) });
    } else {
      reads.set(k, { status: "notFound", input });
      notices.push({ title: "", edit: id });
    }
  } catch (e) {
    const err = e as EdgeError;
    if (err.status === 429 || err.status === 403) {
      // links need no server call, so the row stays open for one
      reads.delete(k);
      notices.push({ title: err.status === 403 ? NOT_SWITCHED_ON : err.message, edit: id });
    } else {
      reads.set(k, { status: "failed", input, message: READ_FAILED });
    }
  } finally {
    emit();
  }
}

/** "Which one?": a social result becomes handles; a website is read for its logo and pages. */
export function pickChoice(userId: string, id: string, c: Choice): void {
  const k = readKey(userId, id);
  const p = parseInput(c.site);
  reads.delete(k);
  if (p?.kind === "link") {
    const row = loadCompetitors(userId).list.find((x) => x.id === id);
    if (row) applyFound(userId, id, { name: row.name, site: null, logo: null, handles: p.handles });
    if (p.fbPageId) updateCompetitor(userId, id, { fbPageId: p.fbPageId });
    emit();
  } else if (p?.kind === "site") {
    updateCompetitor(userId, id, { site: p.site });
    void runRead(userId, id, p.site);
  } else emit();
}

/** "None of these": the row opens its editor for a link. */
export function noneOfThese(userId: string, id: string): void {
  const k = readKey(userId, id);
  const input = reads.get(k)?.input ?? "";
  reads.set(k, { status: "notFound", input });
  notices.push({ title: "", edit: id });
  emit();
}

// ---- Suggestions -------------------------------------------------------------------------------------------------

/** What the brand sells and who it serves, from the brand kit, F.A.D.S. and Your market (find-niche-feed's rule). */
export function brandFacts(userId: string): Brand {
  const kit = loadBrand(userId);
  const pos = loadPositioning(userId);
  const market = loadMarket(userId);
  const offers = (kit?.offers ?? []).map((o) => o.name.trim()).filter(Boolean).join(", ");
  const audience = pos?.audience && pos.audience !== "general" ? `${pos.audience.replace("-", " ")}s` : "";
  return {
    name: (kit?.name || market.name).trim(),
    site: market.site.trim(),
    // a part that already ends a sentence gets a space, not ". " (a one-liner ending "app." gave "app.. Built")
    sells: [offers, pos?.oneLiner, pos?.edge].map((v) => (v ?? "").trim()).filter(Boolean)
      .reduce((all, v) => (all ? `${all}${/[.!?]$/.test(all) ? " " : ". "}${v}` : v), "").slice(0, 600),
    serves: (pos?.audienceDetail?.trim() || audience || market.audience.trim()).slice(0, 400),
    topics: (pos?.topics?.length ? pos.topics : market.topics).slice(0, 12),
  };
}

interface Advisor { id: string; name: string; handle: string; platform: string; company?: string; why_follow?: string }

/**
 * Up to 80 real names to score, built on the device: Your market's named brands from its last 3 checks first, then
 * the hand-picked creators, then the Ads swipe advertisers. Deduped by lowercased name, minus the list and "Not them".
 */
export function suggestCandidates(userId: string): Candidate[] {
  const s = loadCompetitors(userId);
  const taken = new Set([...s.list.map((c) => nameKey(c.name)), ...s.dismissed]);
  const out: Candidate[] = [];
  const add = (c: Candidate) => {
    const k = nameKey(c.name);
    if (!k || taken.has(k) || out.length >= MAX_CANDIDATES) return;
    taken.add(k);
    out.push(c);
  };
  for (const check of loadMarket(userId).checks.slice(-3).reverse())
    for (const g of check.geo) for (const name of g.named ?? []) add({ key: `m${out.length}`, name, about: `Named when ChatGPT was asked "${g.question}"` });
  for (const a of advisorsData as Advisor[]) add({ key: `a:${a.id}`, name: a.name, about: [`${a.handle} on ${a.platform}`, a.company, a.why_follow].filter(Boolean).join(". ") });
  for (const ad of ADS) add({ key: `ad:${slug(ad.advertiser)}`, name: ad.advertiser, about: `Runs ${ad.industry} ads on Facebook and Instagram in Singapore` });
  return out;
}

/** A suggestion as a row: a hand-picked creator brings their handle. */
export function fromSuggestion(s: Suggestion): Omit<Competitor, "id" | "addedAt"> {
  const a = (advisorsData as Advisor[]).find((x) => nameKey(x.name) === nameKey(s.name));
  const handle = a ? parseInput(a.handle) : null;
  const platform = a?.platform as keyof Handles | undefined;
  const handles: Handles = handle?.kind === "link" && platform && HANDLE_KEYS.includes(platform) ? { [platform]: handle.name } : {};
  return { name: s.name, site: s.site, logo: null, why: s.why, fbPageId: null, handles, adsCountry: "SG", source: "suggested" };
}

export interface SuggestResult { at: string; suggestions: Suggestion[]; note?: string }
// the last answer on this device, so a reload doesn't throw away a paid run
const SUGGESTED = "cs-competitor-suggestions-";
let suggesting = false;

export function loadSuggestions(userId: string): SuggestResult | null {
  try {
    const v = JSON.parse(localStorage.getItem(SUGGESTED + scoped(userId)) ?? "null");
    return v && Array.isArray(v.suggestions) ? v : null;
  } catch {
    return null;
  }
}

export const isSuggesting = () => suggesting;

export async function runSuggest(userId: string): Promise<void> {
  if (suggesting) return;
  suggesting = true;
  emit();
  const s = loadCompetitors(userId);
  try {
    const r = await callFn<{ suggestions: Suggestion[]; note?: string }>(
      "competitors",
      { mode: "suggest", brand: brandFacts(userId), candidates: suggestCandidates(userId), exclude: [...s.list.map((c) => nameKey(c.name)), ...s.list.map((c) => c.site ?? "").filter(Boolean), ...s.dismissed] },
      "Couldn't suggest anything right now. Try again in a few minutes.",
    );
    const keep: SuggestResult = { at: new Date().toISOString(), suggestions: Array.isArray(r.suggestions) ? r.suggestions.slice(0, 6) : [], ...(r.note ? { note: r.note } : {}) };
    try {
      localStorage.setItem(SUGGESTED + scoped(userId), JSON.stringify(keep));
    } catch {
      // a device hint only
    }
  } catch (e) {
    const err = e as EdgeError;
    notices.push({ title: err.status === 403 ? NOT_SWITCHED_ON : err.message });
  } finally {
    suggesting = false;
    emit();
  }
}
