// The carousel library (/carousels): Instagram carousels that beat their creator's usual engagement, imported from
// Top Carousels with its owner's permission (Leo, 30 Oct 2026) into cs_carousels (supabase/hub/029) and the public
// cs-carousels bucket. This file holds what the page reads and keeps: the filters as URL params, the query they
// make, the score colours, the device's saved carousels, folders, tracked creators and saved searches (synced:
// content-studio- prefix, per brand), and the Best for your brand answer (cs- prefix, this device, 7 days).

import { fitHash, sortByFit, type FitInput } from "@/lib/creatorFit";
import { scoped } from "@/lib/profiles";
import { supabase } from "@/lib/supabase";

export const TOPICS = [
  "AI & technology", "Art & photography", "Business", "Content creation", "Design", "Education",
  "Entertainment & pop culture", "Fashion & beauty", "Food & cooking", "Health & fitness", "History & culture",
  "Lifestyle & travel", "Mindset & motivation", "Personal finance", "Productivity", "Psychology", "Relationships",
] as const;
export const FORMATS = ["Tutorial", "List", "Story", "Opinion", "Case study", "Save for later", "News", "Showcase", "Quiz"] as const;

export const SORTS = [
  { value: "published", label: "Newest published" },
  { value: "oldest", label: "Oldest published" },
  { value: "score", label: "Highest outlier score" },
  { value: "engagement", label: "Most engagement" },
  { value: "imported", label: "Recently imported" },
  { value: "brand", label: "Best for your brand" },
] as const;
export type Sort = (typeof SORTS)[number]["value"];

export const DATES = [
  { value: "", label: "All time" },
  { value: "7", label: "Last week" },
  { value: "30", label: "Last month" },
  { value: "90", label: "3 months" },
  { value: "180", label: "6 months" },
  { value: "365", label: "Last year" },
  { value: "730", label: "2 years" },
] as const;

export const VIEWS = [
  { value: "all", label: "All outliers" },
  { value: "trending", label: "Trending this week" },
  { value: "saved", label: "Saved" },
  { value: "tracked", label: "Tracked creators" },
] as const;
export type View = (typeof VIEWS)[number]["value"];

/** Trending this week: posted in the last 14 days (a score settles about a week after posting). */
export const TRENDING_DAYS = 14;
export const PAGE_SIZE = 24;

export interface Filters {
  q: string;
  topic: string;
  format: string;
  /** Outlier score, engagements (likes + comments) and slides: "" is open. */
  smin: string;
  smax: string;
  emin: string;
  emax: string;
  lmin: string;
  lmax: string;
  /** Posted in the last N days; "" is all time. */
  days: string;
  hide: string[];
  sort: Sort;
  view: View;
  creator: string;
  folder: string;
}

/** The params that make a search: the view, the folder and the card size are not part of a saved search. */
export const FILTER_KEYS = ["q", "topic", "format", "smin", "smax", "emin", "emax", "lmin", "lmax", "days", "hide", "sort", "creator"] as const;

const num = (v: string | null) => (v && /^\d+(\.\d+)?$/.test(v) ? v : "");
const pick = <T extends string>(v: string | null, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const oneOf = (v: string | null, allowed: readonly string[]) => (v && allowed.includes(v) ? v : "");

export function filtersFrom(params: URLSearchParams): Filters {
  const view = pick(params.get("view"), VIEWS.map((v) => v.value), "all");
  return {
    q: (params.get("q") ?? "").slice(0, 100),
    topic: oneOf(params.get("topic"), TOPICS),
    format: oneOf(params.get("format"), FORMATS),
    smin: num(params.get("smin")),
    smax: num(params.get("smax")),
    emin: num(params.get("emin")),
    emax: num(params.get("emax")),
    lmin: num(params.get("lmin")),
    lmax: num(params.get("lmax")),
    days: oneOf(params.get("days"), DATES.map((d) => d.value)),
    hide: (params.get("hide") ?? "").split(",").filter((t) => (TOPICS as readonly string[]).includes(t)),
    sort: pick(params.get("sort"), SORTS.map((s) => s.value), view === "trending" ? "score" : "published"),
    view,
    creator: /^[A-Za-z0-9._]{1,30}$/.test(params.get("creator") ?? "") ? params.get("creator")! : "",
    folder: (params.get("folder") ?? "").slice(0, 40),
  };
}

/** How many of the panel's filters are set, for the Filters button. */
export function activeCount(f: Filters): number {
  return [f.topic, f.format, f.smin || f.smax, f.emin || f.emax, f.lmin || f.lmax, f.days, f.hide.length ? "x" : ""].filter(Boolean).length;
}

/** Just the search's params, in a fixed order, for a saved search's address. */
export function searchQuery(params: URLSearchParams): string {
  const out = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = params.get(k);
    if (v) out.set(k, v);
  }
  return out.toString();
}

/** The subset of PostgREST's builder the filters use, so the query is tested without a network. */
export interface Query<Self> {
  eq(col: string, v: string): Self;
  gte(col: string, v: string | number): Self;
  lte(col: string, v: string | number): Self;
  in(col: string, v: string[]): Self;
  not(col: string, op: string, v: string): Self;
  ilike(col: string, pattern: string): Self;
  order(col: string, o: { ascending: boolean; nullsFirst?: boolean }): Self;
}

/** A search term inside ilike's % wildcards: its own %, _ and \ match themselves. */
export const likeTerm = (q: string) => `%${q.trim().toLowerCase().replace(/[\\%_]/g, "\\$&")}%`;
const quoted = (s: string) => `"${s.replace(/"/g, '\\"')}"`;

/** Every filter on the query. The view's own narrowing (saved ids, tracked creators) is added by the caller. */
export function applyFilters<Q extends Query<Q>>(query: Q, f: Filters, now = Date.now()): Q {
  let q = query;
  if (f.q.trim()) q = q.ilike("search", likeTerm(f.q));
  if (f.topic) q = q.eq("topic", f.topic);
  if (f.format) q = q.eq("format", f.format);
  if (f.creator) q = q.eq("creator", f.creator);
  if (f.smin) q = q.gte("multiple", f.smin);
  if (f.smax) q = q.lte("multiple", f.smax);
  if (f.emin) q = q.gte("engagements", f.emin);
  if (f.emax) q = q.lte("engagements", f.emax);
  if (f.lmin) q = q.gte("slides", f.lmin);
  if (f.lmax) q = q.lte("slides", f.lmax);
  const days = f.view === "trending" ? TRENDING_DAYS : Number(f.days);
  if (days) q = q.gte("posted_at", new Date(now - days * 86_400_000).toISOString());
  if (f.hide.length) q = q.not("topic", "in", `(${f.hide.map(quoted).join(",")})`);
  const order: Record<Exclude<Sort, "brand">, [string, boolean]> = {
    published: ["posted_at", false],
    oldest: ["posted_at", true],
    score: ["multiple", false],
    engagement: ["engagements", false],
    imported: ["imported_at", false],
  };
  // Best for your brand sorts on the device; the query brings the biggest outliers for it to rank
  const [col, ascending] = order[f.sort === "brand" ? "score" : f.sort];
  q = q.order(col, { ascending });
  // the same day or score: newest first, then the id, so a page boundary never repeats or skips a carousel
  if (col !== "posted_at") q = q.order("posted_at", { ascending: false });
  return q.order("id", { ascending: true });
}

export const CARD_COLUMNS = "id, ig_url, creator, title, topic, format, slides, likes, comments, engagements, multiple, baseline, posted_at, imported_at";
export const DETAIL_COLUMNS = `${CARD_COLUMNS}, caption, slide_text, slide_count, video_positions, flags`;

export interface CarouselCard {
  id: string;
  ig_url: string;
  creator: string;
  title: string;
  topic: string | null;
  format: string | null;
  slides: number;
  likes: number;
  comments: number;
  engagements: number;
  multiple: number;
  baseline: number | null;
  posted_at: string;
  imported_at: string;
}

export interface CarouselRow extends CarouselCard {
  caption: string;
  slide_text: string[];
  slide_count: number | null;
  video_positions: number[];
  flags: string[];
}

/** Top Carousels' score colours: Typical, Outlier, Strong, Exceptional, Breakout. */
export const TIERS = [
  { from: 10, label: "Breakout", className: "bg-rose-600 text-white dark:bg-rose-500" },
  { from: 6, label: "Exceptional", className: "bg-fuchsia-600 text-white dark:bg-fuchsia-500" },
  { from: 4, label: "Strong", className: "bg-purple-600 text-white dark:bg-purple-500" },
  { from: 2, label: "Outlier", className: "bg-blue-600 text-white dark:bg-blue-500" },
  { from: 0, label: "Typical", className: "bg-slate-600 text-white dark:bg-slate-500" },
] as const;
export const tierOf = (multiple: number) => TIERS.find((t) => multiple >= t.from) ?? TIERS[TIERS.length - 1];
export const multipleLabel = (m: number) => `${m >= 100 ? Math.round(m) : m.toFixed(1)}x`;

/** 20.4K, 3.1M, 940. */
export function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(n);
}

/** 6d ago, 3w ago, 4mo ago, 2y ago. */
export function ago(iso: string, now = Date.now()): string {
  const d = Math.max(0, Math.floor((now - Date.parse(iso)) / 86_400_000));
  if (d < 1) return "today";
  if (d < 14) return `${d}d ago`;
  if (d < 60) return `${Math.floor(d / 7)}w ago`;
  if (d < 730) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

export const slidePath = (id: string, n: number) => `${id}/${n}.webp`;
export const coverPath = (id: string) => `${id}/cover.webp`;
/** A slide's or cover's address in the public cs-carousels bucket (no request: the client builds it). */
export const publicUrl = (path: string) => supabase.storage.from("cs-carousels").getPublicUrl(path).data.publicUrl;

// ---- what this brand keeps: saved carousels in folders, tracked creators, saved searches ----------------------

export interface Shelf {
  folders: { id: string; name: string }[];
  saved: { id: string; folder: string | null; at: string }[];
  tracked: string[];
  searches: { id: string; name: string; query: string }[];
}

export const SHELF_PREFIX = "content-studio-carousels-";
export const MAX_SAVED = 500;
export const MAX_FOLDERS = 30;
export const MAX_TRACKED = 50;
export const MAX_SEARCHES = 30;

const EMPTY: Shelf = { folders: [], saved: [], tracked: [], searches: [] };
const arr = <T>(v: unknown, ok: (x: T) => boolean): T[] => (Array.isArray(v) ? (v as T[]).filter(ok) : []);

export function loadShelf(userId: string): Shelf {
  try {
    const v = JSON.parse(localStorage.getItem(SHELF_PREFIX + scoped(userId)) ?? "null") ?? {};
    return {
      folders: arr<Shelf["folders"][number]>(v.folders, (x) => typeof x?.id === "string" && typeof x?.name === "string"),
      saved: arr<Shelf["saved"][number]>(v.saved, (x) => typeof x?.id === "string"),
      tracked: arr<string>(v.tracked, (x) => typeof x === "string"),
      searches: arr<Shelf["searches"][number]>(v.searches, (x) => typeof x?.id === "string" && typeof x?.query === "string"),
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveShelf(userId: string, shelf: Shelf): boolean {
  try {
    localStorage.setItem(SHELF_PREFIX + scoped(userId), JSON.stringify(shelf));
    return true;
  } catch {
    return false;
  }
}

const newId = () => Math.random().toString(36).slice(2, 10);

/** Saves it (into a folder, or none), moves it when already saved to another folder, or un-saves it. */
export function toggleSaved(s: Shelf, id: string, folder: string | null = null, now = new Date()): Shelf {
  const had = s.saved.find((x) => x.id === id);
  if (had && had.folder === folder) return { ...s, saved: s.saved.filter((x) => x.id !== id) };
  const rest = s.saved.filter((x) => x.id !== id);
  return { ...s, saved: [{ id, folder, at: had?.at ?? now.toISOString() }, ...rest].slice(0, MAX_SAVED) };
}

export function addFolder(s: Shelf, name: string): { shelf: Shelf; id: string | null } {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!clean || s.folders.length >= MAX_FOLDERS) return { shelf: s, id: null };
  const same = s.folders.find((f) => f.name.toLowerCase() === clean.toLowerCase());
  if (same) return { shelf: s, id: same.id };
  const id = newId();
  return { shelf: { ...s, folders: [...s.folders, { id, name: clean }] }, id };
}

/** The folder goes; what was in it stays saved, with no folder. */
export function removeFolder(s: Shelf, id: string): Shelf {
  return { ...s, folders: s.folders.filter((f) => f.id !== id), saved: s.saved.map((x) => (x.folder === id ? { ...x, folder: null } : x)) };
}

export function toggleTracked(s: Shelf, creator: string): Shelf {
  const c = creator.replace(/^@/, "");
  if (s.tracked.includes(c)) return { ...s, tracked: s.tracked.filter((x) => x !== c) };
  return { ...s, tracked: [c, ...s.tracked].slice(0, MAX_TRACKED) };
}

export function addSearch(s: Shelf, name: string, query: string): Shelf {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 60);
  if (!clean || !query) return s;
  const rest = s.searches.filter((x) => x.query !== query);
  return { ...s, searches: [{ id: newId(), name: clean, query }, ...rest].slice(0, MAX_SEARCHES) };
}

export const removeSearch = (s: Shelf, id: string): Shelf => ({ ...s, searches: s.searches.filter((x) => x.id !== id) });

/** A name for a search from what it filters: "Business, List, 4x+". */
export function searchName(f: Filters): string {
  const parts = [f.q && `"${f.q}"`, f.creator && `@${f.creator}`, f.topic, f.format, f.smin && `${f.smin}x+`, f.days && DATES.find((d) => d.value === f.days)?.label];
  return parts.filter(Boolean).join(", ") || "All outliers";
}

// ---- Best for your brand -----------------------------------------------------------------------------------------

const FIT_KEY = "cs-carousel-fit-";
const FIT_DAYS = 7;

export interface FitAnswer {
  fit: Record<string, number>;
  topics: string[];
}

/** The ranking for this input, or null when there is none, it is 7+ days old or the brand's input changed. */
export function loadCarouselFit(userId: string, input: FitInput, now = Date.now()): FitAnswer | null {
  try {
    const v = JSON.parse(localStorage.getItem(FIT_KEY + scoped(userId)) ?? "null");
    if (!v || v.inputHash !== fitHash(input) || !v.fit || typeof v.fit !== "object") return null;
    if (!(now - Date.parse(v.at) < FIT_DAYS * 86_400_000)) return null;
    return { fit: v.fit, topics: Array.isArray(v.topics) ? v.topics : [] };
  } catch {
    return null;
  }
}

export function saveCarouselFit(userId: string, input: FitInput, answer: FitAnswer, now = Date.now()): void {
  try {
    localStorage.setItem(FIT_KEY + scoped(userId), JSON.stringify({ at: new Date(now).toISOString(), inputHash: fitHash(input), ...answer }));
  } catch { /* full storage: the ranking still shows for this visit */ }
}

/** Highest fit first, the bigger multiple breaking ties; carousels Jev didn't score are left out. */
export function rankByFit<T extends CarouselCard>(rows: T[], fit: Record<string, number>): T[] {
  const byMultiple = [...rows].sort((a, b) => b.multiple - a.multiple);
  return sortByFit(byMultiple.filter((r) => typeof fit[r.id] === "number"), fit);
}

// ---- remix --------------------------------------------------------------------------------------------------------

/** The words a remix reads: the title, then each slide's text, then the caption, at most 2000 characters. */
export function remixText(row: Pick<CarouselRow, "title" | "slide_text" | "caption">): string {
  const slides = row.slide_text.map((t, i) => (t.trim() ? `Slide ${i + 1}: ${t.replace(/\s+/g, " ").trim()}` : "")).filter(Boolean);
  return [row.title.trim(), ...slides, row.caption.trim() && `Caption: ${row.caption.trim()}`].filter(Boolean).join("\n").slice(0, 2000);
}

