// The ad library (/swipe?tab=ads on Leo's sign-ins; docs/north-star/items/find-ad-library.md): every ad the brand
// can learn from in one list, from three stores: its competitors' ads (competitorAds.ts), "In your space" (Meta ads
// for up to 3 search words, kept here) and the weekly Singapore drop (adsSwipe.json). Labels (hook, feeling,
// audience) come from the competitors function's label mode and are kept account-wide, since a label describes the
// ad, not the brand. The space check and the labelling run outside React, so leaving the page keeps them going.

import { ADS, type AdLike, type SwipeAd } from "@/lib/adsSwipe";
import { callFn, EdgeError } from "@/lib/edgeFn";
import { type CompetitorAd, type CompetitorAdsState, canReadAds, libraryUrl, loadCompetitorAds, WEEK } from "@/lib/competitorAds";
import { brandFacts, type Competitor, loadCompetitors, NOT_SWITCHED_ON } from "@/lib/competitors";
import { slug } from "@/lib/links";
import { loadMarket } from "@/lib/market";
import { loadWatch } from "@/lib/mentions";
import { loadPositioning } from "@/lib/positioning";
import { scoped } from "@/lib/profiles";
import { AUDIENCE_TAGS, FEELINGS, HOOK_FAMILIES } from "../../supabase/functions/_shared/tags.ts";
import type { AdLabel, SpaceAd } from "../../supabase/functions/competitors/logic.ts";

export type { AdLabel, SpaceAd };

const DAY = 86_400_000;

// ---- In your space: content-studio-space-ads-<scoped uid> --------------------------------------------------------

export interface SpaceState {
  /** ISO; "" until the first check. */
  checkedAt: string;
  /** Up to 3 search words. */
  keywords: string[];
  /** 60 at most, best fit first. */
  ads: SpaceAd[];
}

const SPACE = "content-studio-space-ads-";
const SPACE_CHANGED = "content-studio-space-ads-changed";
export const spaceAdsKey = (userId: string) => SPACE + scoped(userId);
export const EMPTY_SPACE: SpaceState = { checkedAt: "", keywords: [], ads: [] };
export const SPACE_WORDS = 3;

export function loadSpaceAds(userId: string): SpaceState {
  try {
    const v = JSON.parse(localStorage.getItem(spaceAdsKey(userId)) ?? "null");
    if (!v || typeof v !== "object" || !Array.isArray(v.ads) || !Array.isArray(v.keywords)) return EMPTY_SPACE;
    return {
      checkedAt: typeof v.checkedAt === "string" ? v.checkedAt : "",
      keywords: v.keywords.filter((k: unknown): k is string => typeof k === "string" && k.trim() !== "").slice(0, SPACE_WORDS),
      ads: v.ads.filter((a: unknown) => a && typeof (a as SpaceAd).id === "string"),
    };
  } catch {
    return EMPTY_SPACE;
  }
}

/** Writes the whole state; when storage is full it keeps the best 30 ads, then gives up (the screen keeps what it shows). */
export function saveSpaceAds(userId: string, s: SpaceState): SpaceState {
  let saved = s;
  for (const t of [s, { ...s, ads: s.ads.slice(0, 30) }]) {
    try {
      localStorage.setItem(spaceAdsKey(userId), JSON.stringify(t));
      saved = t;
      break;
    } catch {
      // storage full: the smaller try
    }
  }
  globalThis.dispatchEvent?.(new Event(SPACE_CHANGED));
  return saved;
}

export function onSpaceAdsChanged(cb: () => void): () => void {
  window.addEventListener(SPACE_CHANGED, cb);
  return () => window.removeEventListener(SPACE_CHANGED, cb);
}

/** The editor's words: the saved ones, else Your market topics, then Mentions keywords, then the Plan's topics; 3 at most. */
export function spaceWordsFor(userId: string): string[] {
  const kept = loadSpaceAds(userId).keywords;
  if (kept.length) return kept;
  const out: string[] = [];
  for (const raw of [...loadMarket(userId).topics, ...loadWatch(userId), ...(loadPositioning(userId)?.topics ?? [])]) {
    const w = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (w.length >= 2 && !out.some((x) => x.toLowerCase() === w.toLowerCase())) out.push(w);
    if (out.length === SPACE_WORDS) break;
  }
  return out;
}

/** Due: words set, and never checked or last checked 7+ days ago. */
export const spaceDue = (s: SpaceState, now = Date.now()) => s.keywords.length > 0 && !(now - Date.parse(s.checkedAt) < WEEK);

// ---- Labels: content-studio-ad-labels-<uid> (bare uid) -----------------------------------------------------------

const LABELS = "content-studio-ad-labels-";
const LABELS_CHANGED = "content-studio-ad-labels-changed";
export const adLabelsKey = (userId: string) => LABELS + userId;
export const MAX_LABELS = 2000;

export function loadAdLabels(userId: string): Record<string, AdLabel> {
  try {
    const v = JSON.parse(localStorage.getItem(adLabelsKey(userId)) ?? "null");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, AdLabel>) : {};
  } catch {
    return {};
  }
}

/**
 * Adds labels, newest last, and keeps the newest 2,000 (1,000 when storage is full). shortcut: the order is the
 * object's insertion order, which holds for Meta's 15+ digit ids but not for ids under 2^32; store a time per
 * label if short ids ever arrive.
 */
export function saveAdLabels(userId: string, add: Record<string, AdLabel>): Record<string, AdLabel> {
  const prev = Object.entries(loadAdLabels(userId)).filter(([id]) => !(id in add));
  const all = [...prev, ...Object.entries(add)];
  let saved: Record<string, AdLabel> = {};
  for (const n of [MAX_LABELS, MAX_LABELS / 2]) {
    const t = Object.fromEntries(all.slice(-n));
    try {
      localStorage.setItem(adLabelsKey(userId), JSON.stringify(t));
      saved = t;
      break;
    } catch {
      // storage full: the smaller try
    }
  }
  globalThis.dispatchEvent?.(new Event(LABELS_CHANGED));
  return saved;
}

export function onAdLabelsChanged(cb: () => void): () => void {
  window.addEventListener(LABELS_CHANGED, cb);
  return () => window.removeEventListener(LABELS_CHANGED, cb);
}

// ---- Jobs, outside React: the space check and the labelling --------------------------------------------------------

export const SPACE_FAILED = "Couldn't read Meta's ad library right now. Try again in a few minutes.";
/** Refusals worth trying again on the next visit: nothing was spent. */
const NOTHING_SPENT = [403, 429, 503];

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let spaceRun: string[] | null = null;
let spaceError: EdgeError | null = null;
let missed: string[] = [];
let sorting = 0;
const asked = new Set<string>();

/** The words being read now, or null. */
export const spaceRunning = () => spaceRun;
/** Why the last space check failed, until the next one starts. */
export const spaceFailure = () => spaceError;
/** Words whose run failed on the last check that came back. */
export const spaceMissed = () => missed;
/** Ads being sorted by hook and feeling now (0 when none). */
export const sortingAds = () => sorting;

export function onAdLibrary(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Every tracked competitor's Facebook page, so the space search never shows their ads. */
export function trackedPageIds(userId: string): string[] {
  const ads = loadCompetitorAds(userId);
  return [...new Set(loadCompetitors(userId).list.flatMap((c) => [c.fbPageId, ads[c.id]?.pageId ?? null]).filter((x): x is string => Boolean(x)))];
}

/** Saves the words (the ads stay until the next check comes back). */
export function setSpaceWords(userId: string, words: string[]): SpaceState {
  const keywords = words.map((w) => w.replace(/\s+/g, " ").trim().slice(0, 60)).filter((w, k, all) => w.length >= 2 && all.findIndex((x) => x.toLowerCase() === w.toLowerCase()) === k).slice(0, SPACE_WORDS);
  return saveSpaceAds(userId, { ...loadSpaceAds(userId), keywords });
}

/** One space check now (Save, Check now, or the weekly one on open); false when it failed. */
export async function runSpaceCheck(userId: string): Promise<boolean> {
  const keywords = loadSpaceAds(userId).keywords;
  if (spaceRun || !keywords.length) return true;
  spaceRun = keywords;
  spaceError = null;
  emit();
  try {
    const { name, sells, serves } = brandFacts(userId);
    const r = await callFn<{ ads: SpaceAd[]; failed: string[]; checkedAt: string }>(
      "competitors", { mode: "space", brand: { name, sells, serves }, keywords, excludePageIds: trackedPageIds(userId) }, SPACE_FAILED,
    );
    // read again: the words may have been edited while the check ran
    saveSpaceAds(userId, { ...loadSpaceAds(userId), checkedAt: r.checkedAt, ads: Array.isArray(r.ads) ? r.ads : [] });
    missed = Array.isArray(r.failed) ? r.failed : [];
    return true;
  } catch (e) {
    spaceError = e instanceof EdgeError ? e : new EdgeError(SPACE_FAILED, 0);
    if (spaceError.status === 403) spaceError.message = NOT_SWITCHED_ON;
    return false;
  } finally {
    spaceRun = null;
    emit();
  }
}

// Device hint: when the weekly check last tried, so a failed read isn't paid for again on every visit (decision 8).
const triedKey = (userId: string) => `cs-space-tried-${scoped(userId)}`;

/** Opening the library: checks the space when it is 7+ days old, at most once a week from here. */
export async function runDueSpace(userId: string, now = Date.now()): Promise<void> {
  if (!spaceDue(loadSpaceAds(userId), now)) return;
  try {
    const t = Date.parse(localStorage.getItem(triedKey(userId)) ?? "");
    if (now - t < WEEK) return;
    localStorage.setItem(triedKey(userId), new Date(now).toISOString());
  } catch {
    // a device hint only
  }
  if (!(await runSpaceCheck(userId)) && NOTHING_SPENT.includes(spaceError?.status ?? 0)) {
    try {
      localStorage.removeItem(triedKey(userId));
    } catch {
      // a device hint only
    }
  }
}

export const LABEL_BATCH = 60;

/**
 * Sorts the ads with no label yet, 60 a call, one call at a time. Each ad is asked once per visit, so an ad Jev
 * can't place never loops; a refusal or failure stops the round and the rest wait for the next visit.
 */
export async function labelAds(userId: string, ads: { id: string; headline: string | null; body: string }[]): Promise<void> {
  if (sorting) return;
  const have = loadAdLabels(userId);
  const todo = ads.filter((a) => !have[a.id] && !asked.has(a.id) && /^\d{3,30}$/.test(a.id) && (a.headline || a.body));
  if (!todo.length) return;
  sorting = todo.length;
  emit();
  try {
    for (let i = 0; i < todo.length; i += LABEL_BATCH) {
      const batch = todo.slice(i, i + LABEL_BATCH);
      for (const a of batch) asked.add(a.id);
      const r = await callFn<{ labels: Record<string, AdLabel> }>("competitors", { mode: "label", ads: batch.map((a) => ({ id: a.id, headline: a.headline ?? "", body: a.body })) });
      if (r?.labels && typeof r.labels === "object") saveAdLabels(userId, r.labels);
      sorting = todo.length - i - batch.length;
      emit();
    }
  } catch {
    // in the background: unlabelled ads stay under "Any" and are asked again on the next visit
  } finally {
    sorting = 0;
    emit();
  }
}

// ---- One list ----------------------------------------------------------------------------------------------------

export type Scope = "space" | "sg" | string;
export type AdFormat = "image" | "video" | "carousel" | "text";

export interface LibraryAd {
  id: string;
  /** A competitor's id, "space" or "sg". */
  scope: Scope;
  advertiser: string;
  format: AdFormat;
  headline: string | null;
  body: string;
  cta: string | null;
  link: string | null;
  /** Meta's link (expires) or the drop's committed picture. */
  image: string | null;
  video: string | null;
  start: string | null;
  end: string | null;
  active: boolean;
  /** Days running so far, or the days it ran; null without a start. */
  days: number | null;
  proven: boolean;
  /** Lowercase: facebook, instagram, messenger, threads... */
  platforms: string[];
  /** HOOK_FAMILIES id: the drop's own family, else the label's. */
  hook: string | null;
  emotion: string | null;
  audience: string | null;
  /** The drop's industry; null for the others. */
  industry: string | null;
  libraryUrl: string;
  /** In your space: Jev's fit to the brand, null when it wasn't judged. */
  fit?: number | null;
  /** New on the competitor's latest check. */
  fresh?: boolean;
  /** That check read every ad Meta lists for the competitor there (competitor ads only). */
  complete?: boolean;
}

/** Whole days from the start to the end, or to `now` while it runs; null without a readable start. */
export function adDays(a: { start: string | null; end: string | null; active: boolean }, now = Date.now()): number | null {
  const s = a.start ? Date.parse(a.start) : NaN;
  if (!Number.isFinite(s)) return null;
  const e = a.active || !a.end ? now : Date.parse(a.end);
  return Number.isFinite(e) ? Math.max(0, Math.floor((e - s) / DAY)) : null;
}

/** "Proven ad": running for 30+ days, or ran 90+ days in all. Public data has no spend, so run length is the proof. */
export const isProven = (active: boolean, days: number | null) => days !== null && ((active && days >= 30) || days >= 90);

export const hookIdOf = (name: string | null | undefined) => HOOK_FAMILIES.find((h) => h.name.toLowerCase() === (name ?? "").trim().toLowerCase())?.id ?? null;
export const hookName = (id: string | null | undefined) => HOOK_FAMILIES.find((h) => h.id === id)?.name ?? null;
export const feelingName = (id: string | null | undefined) => FEELINGS.find((f) => f.id === id)?.label ?? null;
export const audienceName = (id: string | null | undefined) => AUDIENCE_TAGS.find((a) => a.id === id)?.label ?? null;

const FORMATS: AdFormat[] = ["image", "video", "carousel", "text"];
const formatOf = (f: string): AdFormat => (FORMATS.includes(f as AdFormat) ? (f as AdFormat) : "image");

function fromStore(ad: CompetitorAd, scope: Scope, advertiser: string, label: AdLabel | undefined, now: number): LibraryAd {
  const days = adDays(ad, now);
  return {
    id: ad.id, scope, advertiser, format: formatOf(ad.format), headline: ad.headline, body: ad.body, cta: ad.cta, link: ad.link, image: ad.image, video: ad.video,
    start: ad.start, end: ad.end, active: ad.active, days, proven: isProven(ad.active, days), platforms: ad.platforms.map((p) => p.toLowerCase()),
    hook: label?.hook ?? hookIdOf(ad.hookFamily), emotion: label?.emotion ?? null, audience: label?.audience ?? null, industry: null, libraryUrl: libraryUrl(ad.id),
  };
}

export const competitorLibraryAd = (ad: CompetitorAd, c: Pick<Competitor, "id" | "name">, label?: AdLabel, fresh = false, now = Date.now()): LibraryAd =>
  ({ ...fromStore(ad, c.id, c.name, label, now), fresh });

export const spaceLibraryAd = (ad: SpaceAd, label?: AdLabel, now = Date.now()): LibraryAd =>
  ({ ...fromStore(ad, "space", ad.advertiser, label, now), fit: ad.fit ?? null });

/** A drop ad: no end date, so it reads as running; its own hook family wins over a label. */
export function dropLibraryAd(ad: SwipeAd, label?: AdLabel, now = Date.now()): LibraryAd {
  const days = adDays({ start: ad.start, end: null, active: true }, now);
  return {
    id: ad.adId, scope: "sg", advertiser: ad.advertiser, format: formatOf(ad.format), headline: ad.headline, body: ad.body, cta: ad.cta, link: ad.link,
    image: ad.image || null, video: null, start: ad.start, end: null, active: true, days, proven: isProven(true, days),
    platforms: ad.platforms.map((p) => p.toLowerCase()), hook: hookIdOf(ad.hookFamily) ?? label?.hook ?? null, emotion: label?.emotion ?? null,
    audience: label?.audience ?? null, industry: ad.industry || null, libraryUrl: ad.libraryUrl,
  };
}

export interface LibraryStores {
  list: Competitor[];
  competitorAds: CompetitorAdsState;
  space: SpaceState;
  drop: SwipeAd[];
  labels: Record<string, AdLabel>;
}

/**
 * The three stores as one list: competitors' ads (most ads first), then your space, then the drop. An ad found
 * twice is kept once, as a competitor ad; a space ad from a page now tracked is left out.
 */
export function buildLibrary(s: LibraryStores, now = Date.now()): LibraryAd[] {
  const out: LibraryAd[] = [];
  const ids = new Set<string>();
  const add = (a: LibraryAd) => {
    if (ids.has(a.id)) return;
    ids.add(a.id);
    out.push(a);
  };
  const pages = new Set<string>();
  for (const c of s.list) {
    const e = s.competitorAds[c.id];
    if (c.fbPageId) pages.add(c.fbPageId);
    if (e?.pageId) pages.add(e.pageId);
    if (!canReadAds(c) || !e) continue;
    for (const ad of e.ads) add({ ...competitorLibraryAd(ad, c, s.labels[ad.id], e.fresh.includes(ad.id), now), complete: e.complete === true });
  }
  for (const ad of s.space.ads) if (!ad.pageId || !pages.has(ad.pageId)) add(spaceLibraryAd(ad, s.labels[ad.id], now));
  for (const ad of s.drop) add(dropLibraryAd(ad, s.labels[ad.adId], now));
  return out;
}

/** The library from this device's stores. */
export const loadLibrary = (userId: string, now = Date.now()) =>
  buildLibrary({ list: loadCompetitors(userId).list, competitorAds: loadCompetitorAds(userId), space: loadSpaceAds(userId), drop: ADS, labels: loadAdLabels(userId) }, now);

/** Leo's ads tab shows whenever any store has ads, the drop or not. */
export const hasLibraryAds = (userId: string) =>
  ADS.length > 0 || loadSpaceAds(userId).ads.length > 0 || Object.values(loadCompetitorAds(userId)).some((e) => e.ads.length > 0);

/** An ad in the shape remixes take (fromAd, buildAdWriteUrl); a drop ad's is the drop's own, so its Write link stays the same. */
export const likeOf = (a: LibraryAd): AdLike => ({
  adId: a.id, advertiser: a.advertiser, format: a.format, headline: a.headline, body: a.body, cta: a.cta, link: a.link, start: a.start,
  platforms: a.platforms, image: a.image ?? "", libraryUrl: a.libraryUrl, industry: a.industry, hookFamily: hookName(a.hook),
});

// ---- Filters, search, sorts and counts ---------------------------------------------------------------------------

export const RUNS = ["7", "30", "90"] as const;
export const AD_FORMATS = ["image", "video", "carousel"] as const;
export const AD_PLATFORMS = ["facebook", "instagram", "messenger", "threads"] as const;
export const SORTS = ["relevant", "longest", "newest"] as const;
export type LibrarySort = (typeof SORTS)[number];

/** "all" (or "" for run) means no filter, as the URL leaves defaults out. */
export interface LibraryFilters {
  q: string;
  scope: string;
  hook: string;
  running: boolean;
  run: string;
  format: string;
  platform: string;
  emotion: string;
  audience: string;
  /** An industry's slug; only under scope "sg". */
  industry: string;
}

export const NO_FILTERS: LibraryFilters = { q: "", scope: "all", hook: "all", running: false, run: "", format: "all", platform: "all", emotion: "all", audience: "all", industry: "all" };

const wordsOf = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * Where a search found its words: in the headline or body, in the labels (and the drop's industry), in the
 * advertiser. null when any word is found nowhere: every word must match, as the drop's search always did.
 */
export function searchMatch(a: LibraryAd, words: string[]): [number, number, number] | null {
  const text = `${a.headline ?? ""} ${a.body}`.toLowerCase();
  const labels = [hookName(a.hook), feelingName(a.emotion), audienceName(a.audience), a.industry].filter(Boolean).join(" ").toLowerCase();
  const who = a.advertiser.toLowerCase();
  const m: [number, number, number] = [0, 0, 0];
  for (const w of words) {
    const at = [text.includes(w), labels.includes(w), who.includes(w)];
    if (!at.some(Boolean)) return null;
    at.forEach((hit, k) => (m[k] += Number(hit)));
  }
  return m;
}

/** Every filter but the scope (the pills count across scopes with the rest applied). */
function passesFilters(a: LibraryAd, f: LibraryFilters, words: string[]): boolean {
  if (f.hook !== "all" && a.hook !== f.hook) return false;
  if (f.running && !a.active) return false;
  if (f.run && (a.days ?? -1) < Number(f.run)) return false;
  if (f.format !== "all" && a.format !== f.format) return false;
  if (f.platform !== "all" && !a.platforms.includes(f.platform)) return false;
  if (f.emotion !== "all" && a.emotion !== f.emotion) return false;
  if (f.audience !== "all" && a.audience !== f.audience) return false;
  return !words.length || searchMatch(a, words) !== null;
}

const inScope = (a: LibraryAd, scope: string) => scope === "all" || a.scope === scope;

/** The cards: every filter, the scope, and the industry under "sg". */
export function filterLibrary(all: LibraryAd[], f: LibraryFilters): LibraryAd[] {
  const words = wordsOf(f.q);
  return all.filter((a) => inScope(a, f.scope) && passesFilters(a, f, words) && (f.scope !== "sg" || f.industry === "all" || slug(a.industry ?? "") === f.industry));
}

const newer = (a: LibraryAd, b: LibraryAd) => (b.start ?? "").localeCompare(a.start ?? "");
const longer = (a: LibraryAd, b: LibraryAd) => (b.days ?? -1) - (a.days ?? -1);

/**
 * Most relevant: with no search, proven ads first, then running, then newest; with a search, more words in the
 * headline or body first, then in the labels, then in the advertiser, ties by days running. Longest running by days;
 * Newest by start date. Ties keep the id order, so the list never shuffles.
 */
export function sortLibrary(list: LibraryAd[], sort: LibrarySort, q = ""): LibraryAd[] {
  const words = wordsOf(q);
  const by = (a: LibraryAd, b: LibraryAd): number => {
    if (sort === "longest") return longer(a, b) || newer(a, b);
    if (sort === "newest") return newer(a, b) || longer(a, b);
    if (words.length) {
      const x = searchMatch(a, words) ?? [0, 0, 0];
      const y = searchMatch(b, words) ?? [0, 0, 0];
      return y[0] - x[0] || y[1] - x[1] || y[2] - x[2] || longer(a, b);
    }
    return Number(b.proven) - Number(a.proven) || Number(b.active) - Number(a.active) || newer(a, b);
  };
  return [...list].sort((a, b) => by(a, b) || a.id.localeCompare(b.id));
}

export interface ScopeCounts {
  all: number;
  /** Each competitor with ads in the library, most ads first; n is with the filters applied. */
  competitors: { id: string; name: string; n: number }[];
  space: number;
  sg: number;
}

/** The pills: every filter but the scope applied, so the picked pill's count is the number of cards. */
export function scopeCounts(all: LibraryAd[], f: LibraryFilters, list: Pick<Competitor, "id" | "name">[]): ScopeCounts {
  const words = wordsOf(f.q);
  const shown = all.filter((a) => passesFilters(a, f, words));
  const n = (scope: string) => shown.filter((a) => a.scope === scope).length;
  const sg = f.scope === "sg" && f.industry !== "all" ? shown.filter((a) => a.scope === "sg" && slug(a.industry ?? "") === f.industry).length : n("sg");
  return {
    all: shown.length,
    competitors: list
      .filter((c) => all.some((a) => a.scope === c.id))
      .map((c) => ({ id: c.id, name: c.name, n: n(c.id), total: all.filter((a) => a.scope === c.id).length }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
      .map(({ id, name, n }) => ({ id, name, n })),
    space: n("space"),
    sg,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "58 ads from 42 brands", plus ", running now" with that filter on. */
export function countLine(cards: LibraryAd[], running: boolean): string {
  const brands = new Set(cards.map((a) => a.advertiser.trim().toLowerCase())).size;
  return `${plural(cards.length, "ad")} from ${plural(brands, "brand")}${running ? ", running now" : ""}`;
}

/** The hook families the ads in view carry, in the list's order: the "Try a hook" chips. */
export const hooksPresent = (ads: LibraryAd[]) => HOOK_FAMILIES.filter((h) => ads.some((a) => a.hook === h.id));

/** The drop's industries among `ads`, most ads first (the chips under Singapore picks). */
export function industriesOf(ads: LibraryAd[]): { value: string; n: number }[] {
  const m = new Map<string, number>();
  for (const a of ads) if (a.industry) m.set(a.industry, (m.get(a.industry) ?? 0) + 1);
  return [...m].map(([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n || a.value.localeCompare(b.value));
}

/** "Video | 21 days" or "Image | Ran 21 days". */
export function metaLine(a: LibraryAd): string {
  const f = a.format[0].toUpperCase() + a.format.slice(1);
  if (a.days === null) return f;
  return `${f} | ${a.active ? "" : "Ran "}${plural(a.days, "day")}`;
}
