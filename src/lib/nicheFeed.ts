// For you (/swipe?tab=foryou, Leo only; docs/north-star/items/find-niche-feed.md): every post and ad the app already
// holds in one feed, with the ones Jev says fit this brand first. Seven sources, ids prefixed so they never collide:
// tp: top posts, tr: trends, fo: Following, cp: competitor posts, ca: competitor ads, sa: In your space, sg: the
// Singapore drop's ads. Nothing is scraped here. The matching is a job outside React (the competitors function's
// "match" mode, 80 items a run on the niche-match cap); scores, hidden cards and Today's 5 live per brand in one
// synced key, content-studio-niche-<scoped uid>.

import { ADS_FETCHED, buildAdWriteUrl } from "@/lib/adsSwipe";
import { type LibraryAd, likeOf, loadLibrary, metaLine } from "@/lib/adLibrary";
import { type FeedPost, feedPosts, loadCompetitorPosts } from "@/lib/competitorPosts";
import { brandFacts, loadCompetitors } from "@/lib/competitors";
import { callFn } from "@/lib/edgeFn";
import { type FollowedAccount, loadFollowing, remixUrl, type TrackedPost } from "@/lib/following";
import { sgDay } from "@/lib/goals";
import { scoped } from "@/lib/profiles";
import { dayMonth, fromAd, fromFollowPost, fromTopPost, fromTrend, type RemixSource } from "@/lib/remixSource";
import { buildRemixUrl, compactNum, generatorFormat, getAllTopPosts, type TopPostWithAdvisor } from "@/lib/topPosts";
import { buildTrendRemixUrl, getTrends, type TrendEntry } from "@/lib/trends";
import { byOutlier, type Outlier, scoreAccount } from "../../supabase/functions/_shared/outlier.ts";
import { MATCH_MAX, MATCH_TEXT } from "../../supabase/functions/competitors/logic.ts";

const DAY = 86_400_000;

export type FeedFrom = "tp" | "tr" | "fo" | "cp" | "ca" | "sa" | "sg";
export const CHIPS: Record<FeedFrom, string> = {
  tp: "SG creator", tr: "Trend", fo: "Following", cp: "Your competitor", ca: "Your competitor", sa: "In your space", sg: "Singapore pick",
};

export interface FeedItem {
  id: string;
  from: FeedFrom;
  kind: "organic" | "ad";
  /** "@handle" or the advertiser: Today's 5 takes at most 2 from one. */
  account: string;
  /** Who the card names: a creator's or competitor's name, else the account. */
  who: string;
  /** Caption, or headline and body: what search and Jev read. */
  text: string;
  /** "Reel, 12 Oct, Instagram" or "Video | 45 days". */
  meta: string;
  /** "88K views, 1.2K likes"; "" for ads. */
  numbers: string;
  /** Organic posts whose account has a usual (Following, competitors); null where the data has none. */
  outlier: Outlier | null;
  /** The post's date, or the ad's start (ms); 0 when unknown. */
  at: number;
  active: boolean;
  /** Ads: days running so far, or the days it ran. */
  days: number | null;
  source: RemixSource;
  /** Remix's link for the frame before the session is read. */
  remixUrl: string;
  /** The original, https. */
  url: string | null;
}

// ---- The pool ----------------------------------------------------------------------------------------------------

export interface FeedStores {
  topPosts: TopPostWithAdvisor[];
  trends: TrendEntry[];
  following: FollowedAccount[];
  competitorPosts: FeedPost[];
  /** The ad library: competitors' ads, In your space and the drop, each ad once. */
  ads: LibraryAd[];
}

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);
const PLATFORM: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", facebook: "Facebook", youtube: "YouTube" };
const FORMAT: Record<string, string> = { "short-video": "Reel", video: "Video", carousel: "Carousel", "text-post": "Post", image: "Photo" };
const formatName = (format: string, platform: string) => (format === "video" || format === "short-video") && platform !== "instagram" ? "Video" : FORMAT[format] ?? "Post";
const metaOf = (format: string, platform: string, at: number) =>
  [formatName(format, platform), at ? dayMonth(new Date(at).toISOString()) : "", PLATFORM[platform] ?? platform].filter(Boolean).join(", ");
const numbersOf = (views: number | null | undefined, likes: number | undefined, comments: number | undefined) =>
  (views ? [`${compactNum(views)} views`, `${compactNum(likes ?? 0)} likes`] : [`${compactNum(likes ?? 0)} likes`, `${compactNum(comments ?? 0)} comments`]).join(", ");

function trackedItem(from: "fo" | "cp", a: FollowedAccount, p: TrackedPost, who: string, outlier: Outlier | null): FeedItem {
  const at = time(p.postedAt);
  return {
    id: `${from}:${a.platform}:${p.id}`, from, kind: "organic", account: `@${a.handle}`, who, text: p.caption, meta: metaOf(p.format, a.platform, at),
    numbers: numbersOf(p.views, p.likes, p.comments), outlier, at, active: false, days: null, source: fromFollowPost(a, p), remixUrl: remixUrl(a, p), url: p.url || null,
  };
}

const AD_FROM = (scope: string): FeedFrom => (scope === "space" ? "sa" : scope === "sg" ? "sg" : "ca");

/** Every source as one list, in source order. A competitor's post that is also followed shows once, as the competitor's. */
export function buildFeed(s: FeedStores, now = Date.now()): FeedItem[] {
  const out: FeedItem[] = [];
  const posts = new Set<string>();
  for (const f of s.competitorPosts) {
    posts.add(`${f.account.platform}:${f.post.id}`);
    out.push(trackedItem("cp", f.account, f.post, f.competitor.name, f.outlier));
  }
  for (const a of s.following) {
    const scores = scoreAccount(a.posts, now);
    for (const p of a.posts) if (!posts.has(`${a.platform}:${p.id}`)) out.push(trackedItem("fo", a, p, a.name || `@${a.handle}`, scores[p.id] ?? null));
  }
  for (const p of s.topPosts) {
    const at = time(p.timestamp);
    out.push({
      id: `tp:${p.advisorId}-${p.shortCode}`, from: "tp", kind: "organic", account: p.handle, who: p.advisorName, text: p.caption || p.idea?.hook || "",
      meta: metaOf(generatorFormat(p), "instagram", at), numbers: numbersOf(p.views, p.likes, p.comments), outlier: null, at, active: false, days: null,
      source: fromTopPost(p, { id: p.advisorId, name: p.advisorName, handle: p.handle }), remixUrl: buildRemixUrl(p, { name: p.advisorName, handle: p.handle }), url: p.url || null,
    });
  }
  for (const t of s.trends) {
    const at = time(t.observed_at ?? t.date_found);
    const account = t.author ? `@${t.author.replace(/^@/, "")}` : t.source_label;
    out.push({
      id: `tr:${t.id}`, from: "tr", kind: "organic", account, who: account, text: [t.title, t.trend_source ?? t.why_it_works].filter(Boolean).join(". "),
      meta: metaOf(t.format, t.platform, at), numbers: t.likes || t.views ? numbersOf(t.views, t.likes, t.comments) : "", outlier: null, at, active: false, days: null,
      source: fromTrend(t), remixUrl: buildTrendRemixUrl(t), url: t.source_url || null,
    });
  }
  for (const ad of s.ads) {
    const like = likeOf(ad);
    out.push({
      id: `${AD_FROM(ad.scope)}:${ad.id}`, from: AD_FROM(ad.scope), kind: "ad", account: ad.advertiser, who: ad.advertiser,
      text: [ad.headline, ad.body].filter(Boolean).join(". "), meta: metaLine(ad), numbers: "", outlier: null, at: time(ad.start), active: ad.active, days: ad.days,
      source: fromAd(like, now), remixUrl: buildAdWriteUrl(like), url: ad.libraryUrl || null,
    });
  }
  return out;
}

/** The feed from this device's stores. */
export function loadFeed(userId: string, now = Date.now()): FeedItem[] {
  const { list } = loadCompetitors(userId);
  return buildFeed({
    topPosts: getAllTopPosts(),
    trends: getTrends(),
    following: loadFollowing(userId),
    competitorPosts: feedPosts(list, loadCompetitorPosts(userId), {}, now),
    ads: loadLibrary(userId, now),
  }, now);
}

/** "Updated 19 Oct.": the newest date among the sources (a post's date, a trend's, a drop's), or null. */
export function updatedAt(items: FeedItem[]): number | null {
  const newest = Math.max(0, ...items.filter((i) => i.kind === "organic").map((i) => i.at), time(ADS_FETCHED));
  return newest || null;
}

// ---- Order: matched first, outlier score inside each group, 4 posts to each ad ---------------------------------

/** Proposed cut (build brief decision 7): Leo hand-labels 30 items per brand before anyone relies on it. */
export const MATCH_AT = 0.6;
export type FeedKind = "all" | "organic" | "ads";

const NONE: Outlier = { ratio: null, tier: null, basis: null, baseline: null, posts: 0, confidence: null, reason: null, rank: -1 };
const byPost = (a: FeedItem, b: FeedItem) => byOutlier(a.outlier ?? NONE, b.outlier ?? NONE) || b.at - a.at;
const byAd = (a: FeedItem, b: FeedItem) => Number(b.active) - Number(a.active) || (b.days ?? -1) - (a.days ?? -1) || b.at - a.at;

/** `every` organic posts, then an ad, until one list runs out; the rest follow. */
export function interleave(posts: FeedItem[], ads: FeedItem[], every = 4): FeedItem[] {
  const out: FeedItem[] = [];
  let p = 0;
  let a = 0;
  while (p < posts.length || a < ads.length) {
    for (let k = 0; k < every && p < posts.length; k++) out.push(posts[p++]);
    if (a < ads.length) out.push(ads[a++]);
  }
  return out;
}

const ordered = (items: FeedItem[], kind: FeedKind) => {
  const posts = kind === "ads" ? [] : items.filter((i) => i.kind === "organic").sort(byPost);
  const ads = kind === "organic" ? [] : items.filter((i) => i.kind === "ad").sort(byAd);
  return interleave(posts, ads);
};

export const searchHit = (i: FeedItem, q: string) => {
  const hay = `${i.text} ${i.account} ${i.who}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
};

/** The feed as it shows: hidden cards out, the kind and search applied, matched (Jev MATCH_AT or more) first. */
export function arrange(
  items: FeedItem[],
  scores: Record<string, number>,
  o: { kind?: FeedKind; q?: string; hidden?: readonly string[] } = {},
): { matched: FeedItem[]; other: FeedItem[] } {
  const hidden = new Set(o.hidden ?? []);
  const shown = items.filter((i) => !hidden.has(i.id) && (!o.q?.trim() || searchHit(i, o.q)));
  const fits = (i: FeedItem) => (scores[i.id] ?? 0) >= MATCH_AT;
  return { matched: ordered(shown.filter(fits), o.kind ?? "all"), other: ordered(shown.filter((i) => !fits(i)), o.kind ?? "all") };
}

// ---- Today's 5 -----------------------------------------------------------------------------------------------------

export const PICKS = 5;

/**
 * The day's picks: kept all day once made; otherwise the first matched items (in feed order) not hidden and not picked
 * in the 7 days before, at most 2 ads and 2 from one account.
 */
export function pickToday(matched: FeedItem[], s: Pick<NicheState, "picks" | "picked" | "hidden">, today: string): string[] {
  if (s.picks.day === today) return s.picks.ids;
  const recent = (id: string) => {
    const d = s.picked[id];
    return Boolean(d) && Date.parse(today) - Date.parse(d) < 7 * DAY;
  };
  const out: FeedItem[] = [];
  for (const i of matched) {
    if (out.length === PICKS) break;
    if (s.hidden.includes(i.id) || recent(i.id)) continue;
    if (i.kind === "ad" && out.filter((x) => x.kind === "ad").length >= 2) continue;
    if (out.filter((x) => x.account === i.account).length >= 2) continue;
    out.push(i);
  }
  return out.map((i) => i.id);
}

// ---- The store: content-studio-niche-<scoped uid> ------------------------------------------------------------------

export interface NicheState {
  /** A hash of the brand facts sent to Jev; a change clears the scores. */
  brandSig: string;
  /** Item id -> Jev's probability, 2,000 newest kept. */
  scores: Record<string, number>;
  /** Item ids, newest last, 500 at most. */
  hidden: string[];
  picks: { day: string; ids: string[] };
  /** Item id -> the day it was picked, 500 newest, for the 7-day rotation. */
  picked: Record<string, string>;
}

const KEY = "content-studio-niche-";
const CHANGED = "content-studio-niche-changed";
export const nicheKey = (userId: string) => KEY + scoped(userId);
export const EMPTY_NICHE: NicheState = { brandSig: "", scores: {}, hidden: [], picks: { day: "", ids: [] }, picked: {} };
export const MAX_SCORES = 2000;
export const MAX_HIDDEN = 500;
export const MAX_PICKED = 500;

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const entries = <T>(v: unknown, ok: (x: unknown) => x is T): Record<string, T> =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => ok(x))) as Record<string, T> : {};
const newest = <T>(r: Record<string, T>, n: number) => Object.fromEntries(Object.entries(r).slice(-n));

export function loadNiche(userId: string): NicheState {
  try {
    const v = JSON.parse(localStorage.getItem(nicheKey(userId)) ?? "null");
    if (!v || typeof v !== "object") return EMPTY_NICHE;
    return {
      brandSig: typeof v.brandSig === "string" ? v.brandSig : "",
      scores: entries(v.scores, (x): x is number => typeof x === "number"),
      hidden: strings(v.hidden),
      picks: { day: typeof v.picks?.day === "string" ? v.picks.day : "", ids: strings(v.picks?.ids) },
      picked: entries(v.picked, (x): x is string => typeof x === "string"),
    };
  } catch {
    return EMPTY_NICHE;
  }
}

/** Writes the whole state, trimmed to its caps; when storage is full it halves the scores, then gives up (the screen keeps what it shows). */
export function saveNiche(userId: string, s: NicheState): NicheState {
  const trimmed = { ...s, scores: newest(s.scores, MAX_SCORES), hidden: s.hidden.slice(-MAX_HIDDEN), picked: newest(s.picked, MAX_PICKED) };
  let saved = trimmed;
  for (const t of [trimmed, { ...trimmed, scores: newest(trimmed.scores, MAX_SCORES / 4) }]) {
    try {
      localStorage.setItem(nicheKey(userId), JSON.stringify(t));
      saved = t;
      break;
    } catch {
      // storage full: fewer scores, which are asked again
    }
  }
  globalThis.dispatchEvent?.(new Event(CHANGED));
  return saved;
}

export function onNicheChanged(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
}

/** Hide one card for this brand; Undo is unhide. */
export const hideItem = (userId: string, id: string) => {
  const s = loadNiche(userId);
  return saveNiche(userId, { ...s, hidden: [...s.hidden.filter((x) => x !== id), id] });
};
export const unhideItem = (userId: string, id: string) => {
  const s = loadNiche(userId);
  return saveNiche(userId, { ...s, hidden: s.hidden.filter((x) => x !== id) });
};

/** A short hash of exactly what the brand sells and who it serves, as sent to Jev. */
export function brandSig(b: { sells: string; serves: string }): string {
  let h = 5381;
  for (const c of `${b.sells}\n${b.serves}`) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

/** The state read against today's brand facts: a changed brand starts with no scores. */
export function nicheFor(userId: string, sig: string): NicheState {
  const s = loadNiche(userId);
  return s.brandSig === sig ? s : saveNiche(userId, { ...s, brandSig: sig, scores: {} });
}

// ---- The matching job, outside React ---------------------------------------------------------------------------

const running = new Map<string, number>();
/** Brands whose matching was refused, capped or answered nothing this session: the banner shows. */
const off = new Set<string>();
/** Asked this session, so a null answer waits for the next page load rather than looping. */
const asked = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const matching = (userId: string) => running.get(scoped(userId)) ?? 0;
export const matchOff = (userId: string) => off.has(scoped(userId));
export function onMatch(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Today's 5, made once a Singapore day from the matched items and kept in the synced key. */
export function settlePicks(userId: string, feed: FeedItem[], now = Date.now()): void {
  const s = loadNiche(userId);
  const today = sgDay(now);
  if (s.picks.day === today) return;
  const ids = pickToday(arrange(feed, s.scores, { hidden: s.hidden }).matched, s, today);
  if (!ids.length) return;
  saveNiche(userId, { ...s, picks: { day: today, ids }, picked: { ...s.picked, ...Object.fromEntries(ids.map((id) => [id, today])) } });
}

/**
 * One match run: up to 80 items without a score, best first, sent once (one niche-match use); the scores land in the
 * synced key and the feed re-sorts once. Then Today's 5. Without brand facts nothing is sent.
 */
export async function runMatch(userId: string, feed = loadFeed(userId), now = Date.now()): Promise<void> {
  const k = scoped(userId);
  if (running.has(k)) return;
  if (off.has(k)) return settlePicks(userId, feed, now);
  const brand = brandFacts(userId);
  if (!brand.sells && !brand.serves) return;
  const sig = brandSig(brand);
  const s = nicheFor(userId, sig);
  const todo = arrange(feed, s.scores, { hidden: s.hidden }).other
    .filter((i) => !(i.id in s.scores) && !asked.has(`${k}|${sig}|${i.id}`) && i.text.trim())
    .slice(0, MATCH_MAX);
  if (!todo.length) return settlePicks(userId, feed, now);
  todo.forEach((i) => asked.add(`${k}|${sig}|${i.id}`));
  running.set(k, todo.length);
  emit();
  try {
    const r = await callFn<{ scores?: Record<string, number> }>("competitors", {
      mode: "match",
      brand: { name: brand.name, sells: brand.sells, serves: brand.serves },
      items: todo.map((i) => ({ id: i.id, from: i.account, kind: i.kind, text: i.text.slice(0, MATCH_TEXT) })),
    });
    const ids = new Set(todo.map((i) => i.id));
    const got = Object.entries(r?.scores ?? {}).filter(([id, v]) => ids.has(id) && typeof v === "number");
    // 200 with no scores: Jev is down
    if (!got.length) off.add(k);
    const cur = loadNiche(userId);
    if (got.length && cur.brandSig === sig) saveNiche(userId, { ...cur, scores: { ...cur.scores, ...Object.fromEntries(got) } });
  } catch {
    // refused, over the cap or failed: cached scores still apply
    off.add(k);
  } finally {
    running.delete(k);
    settlePicks(userId, feed, now);
    emit();
  }
}
