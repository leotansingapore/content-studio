// Search any public post (/swipe?tab=search, Leo only; docs/north-star/items/find-viral-search.md). A search runs on
// the viral-search edge function in a job outside React, so leaving the page keeps it going, and its results land in
// one synced key per brand: the newest 5 searches, written whole, so a dropped search stays dropped. Opening a saved
// search never spends; the same words again within 24 hours reuse it unless the person presses Search again.

import { brandFacts } from "@/lib/competitors";
import { callFn, EdgeError } from "@/lib/edgeFn";
import { links } from "@/lib/links";
import { scoped } from "@/lib/profiles";
import { sourceKey, type RemixSource } from "@/lib/remixSource";
import { type Failed, type Found, PLATFORMS } from "../../supabase/functions/viral-search/logic.ts";

export type { Failed, Found };

export interface SavedSearch {
  q: string;
  /** ISO, when the search came back. */
  at: string;
  results: Found[];
  failed: Failed;
}
export interface ViralSearchState {
  searches: SavedSearch[];
}

export const MAX_SEARCHES = 5;
const MAX_RESULTS = 40;
const DAY = 86_400_000;
const KEY = "content-studio-viral-search-";
const CHANGED = "content-studio-viral-search-changed";
export const viralSearchKey = (userId: string) => KEY + scoped(userId);

export const SEARCH_FAILED = "Couldn't search right now. Try again in a few minutes.";
export const NOT_ON = "Search isn't switched on for your account yet.";

const keyOf = (q: string) => q.replace(/\s+/g, " ").trim().toLowerCase();
/** The same search: case and spacing don't count. */
export const sameQ = (a: string, b: string) => keyOf(a) === keyOf(b);

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.slice(0, max) : null);

function cleanFound(raw: unknown): Found | null {
  const f = (raw ?? {}) as Record<string, unknown>;
  const platform = PLATFORMS.find((p) => p === f.platform);
  if (!platform || typeof f.id !== "string" || typeof f.url !== "string" || !f.url.startsWith("https://")) return null;
  return {
    id: f.id,
    platform,
    url: f.url,
    author: str(f.author, 80),
    title: str(f.title, 120),
    caption: str(f.caption, 200),
    cover: typeof f.cover === "string" && f.cover.startsWith("https://") ? f.cover : null,
    views: num(f.views),
    likes: num(f.likes),
    comments: num(f.comments),
    shares: num(f.shares),
    followers: num(f.followers),
    postedAt: str(f.postedAt, 40),
    durationSec: num(f.durationSec),
    slideshow: f.slideshow === true,
    ratio: num(f.ratio),
    relevance: num(f.relevance),
  };
}

function cleanSearch(raw: unknown): SavedSearch | null {
  const s = (raw ?? {}) as Record<string, unknown>;
  if (typeof s.q !== "string" || !s.q.trim() || typeof s.at !== "string" || !Array.isArray(s.results)) return null;
  const failed = (s.failed ?? {}) as Record<string, unknown>;
  return {
    q: s.q.replace(/\s+/g, " ").trim().slice(0, 60),
    at: s.at,
    results: s.results.map(cleanFound).filter((f): f is Found => f !== null).slice(0, MAX_RESULTS),
    failed: Object.fromEntries(PLATFORMS.filter((p) => typeof failed[p] === "string").map((p) => [p, String(failed[p]).slice(0, 60)])),
  };
}

export function loadViralSearches(userId: string): ViralSearchState {
  try {
    const v = JSON.parse(localStorage.getItem(viralSearchKey(userId)) ?? "null");
    return { searches: (Array.isArray(v?.searches) ? v.searches : []).map(cleanSearch).filter((s: SavedSearch | null): s is SavedSearch => s !== null).slice(0, MAX_SEARCHES) };
  } catch {
    return { searches: [] };
  }
}

/** Puts a search first (replacing the same words), keeps the newest 5; when storage is full, keeps fewer. */
export function saveViralSearch(userId: string, s: SavedSearch): ViralSearchState {
  const clean = cleanSearch(s);
  const searches = [...(clean ? [clean] : []), ...loadViralSearches(userId).searches.filter((x) => !sameQ(x.q, s.q))].slice(0, MAX_SEARCHES);
  let saved: ViralSearchState = { searches };
  for (const n of [MAX_SEARCHES, 2, 1]) {
    try {
      saved = { searches: searches.slice(0, n) };
      localStorage.setItem(viralSearchKey(userId), JSON.stringify(saved));
      break;
    } catch {
      // storage full: the next, shorter list
    }
  }
  globalThis.dispatchEvent?.(new Event(CHANGED));
  return saved;
}

/** Calls `cb` whenever a search is saved on this device (the tab, or a search finishing outside React). */
export function onViralSearchChanged(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
}

/** The saved search for these words, however old (showing it is free). */
export const findSearch = (userId: string, q: string): SavedSearch | null => loadViralSearches(userId).searches.find((s) => sameQ(s.q, q)) ?? null;

/** The saved search for these words from the last 24 hours, which Search reuses instead of paying again. */
export function freshSearch(userId: string, q: string, now = Date.now()): SavedSearch | null {
  const s = findSearch(userId, q);
  return s && now - Date.parse(s.at) < DAY ? s : null;
}

// ---- The search job, outside React -----------------------------------------------------------------------------

const running = new Set<string>();
const failures = new Map<string, { message: string; code: string }>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const isSearching = (q: string) => running.has(keyOf(q));
export const searchFailure = (q: string) => failures.get(keyOf(q)) ?? null;
export function onViralSearch(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Searches TikTok and YouTube for `q` (one paid use), unless these words were searched in the last 24 hours and `again` is false. */
export async function runSearch(userId: string, q: string, again = false): Promise<void> {
  const words = q.replace(/\s+/g, " ").trim();
  const k = keyOf(words);
  if (running.has(k) || (!again && freshSearch(userId, words))) return;
  running.add(k);
  failures.delete(k);
  emit();
  try {
    const { sells, serves } = brandFacts(userId);
    const r = await callFn<{ results: Found[]; failed: Failed }>("viral-search", { q: words, brand: { sells, serves } }, SEARCH_FAILED);
    saveViralSearch(userId, { q: words, at: new Date().toISOString(), results: Array.isArray(r?.results) ? r.results : [], failed: r?.failed ?? {} });
  } catch (e) {
    const err = e as EdgeError;
    failures.set(k, { message: err.status === 403 ? NOT_ON : err.message || SEARCH_FAILED, code: err.code ?? "" });
  } finally {
    running.delete(k);
    emit();
  }
}

// ---- Remix ------------------------------------------------------------------------------------------------------

/** Clone a reel reads TikTok and YouTube links itself (remix-link), so both open there (decision 4). */
export const remixUrlFor = (f: Pick<Found, "url">) => links.clone({ url: f.url });

/** The source RemixButton opens the sheet on: a link: key, the same one remix-link saves when it reads the video. */
export function sourceFor(f: Found): RemixSource {
  const numbers = Object.fromEntries(
    Object.entries({ views: f.views, likes: f.likes, comments: f.comments, ratio: f.ratio }).filter(([, v]) => v !== null),
  ) as RemixSource["numbers"];
  const s: RemixSource = {
    key: sourceKey.link(f.platform, f.id.slice(f.platform.length + 1)),
    kind: "link",
    format: "video",
    platform: f.platform,
    url: f.url,
    author: f.author ?? undefined,
    title: (f.title ?? f.caption ?? "").split("\n")[0].slice(0, 120) || undefined,
    caption: f.caption ?? undefined,
    cover: f.cover ?? undefined,
    numbers: Object.keys(numbers ?? {}).length ? numbers : undefined,
    remixedAt: "",
  };
  return Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as unknown as RemixSource;
}
