// Apps like yours (/swipe?tab=similar, Leo only; docs/north-star/items/find-similar-accounts.md): about 40 Instagram and
// TikTok accounts like the brand, found by the competitors edge function (mode "similar"), plus the ones added by hand,
// with their posts read through mode "posts" (scope "similar": 30 the first time, the newest 10 each week) and kept in
// Following's shapes, so applyCheck, scoreAccount and byOutlier work unchanged. One synced key per brand, written whole,
// holding the dismissals too. Jobs run outside React (competitorAds.ts's checkJobs), so leaving the page keeps them going.
// Each read's covers, which expire within days, stay on this device (cs-similar-media-) for the social north star.

import { auditedHandles } from "@/lib/accountAudit";
import { checkJobs } from "@/lib/competitorAds";
import { postsDue } from "@/lib/competitorPosts";
import { brandFacts, loadCompetitors, parseInput } from "@/lib/competitors";
import { callFn, EdgeError } from "@/lib/edgeFn";
import { applyCheck, type FollowedAccount, type FollowPlatform, type TrackedPost } from "@/lib/following";
import { scoped } from "@/lib/profiles";
import { loadSocialAccounts } from "@/lib/socialAccounts";
import { byOutlier, type Outlier, scoreAccount } from "../../supabase/functions/_shared/outlier.ts";
import { normalizeHandle } from "../../supabase/functions/_shared/socialAudit.ts";
import {
  accountKey, POSTS_KEPT, SIMILAR_KEEP, SIMILAR_REFRESH, type SimilarAccount, type SimilarKind,
} from "../../supabase/functions/competitors/logic.ts";
import type { TrackResult } from "../../supabase/functions/track-accounts/logic.ts";

export { accountKey };

export interface SimilarEntry {
  platform: FollowPlatform;
  handle: string;
  name: string;
  followers: number | null;
  kind: SimilarKind | null;
  /** "added" by hand (always kept, never judged), "competitor", the "@seed" that listed it, or the search that found it. */
  via: string;
  addedAt: string;
}
export interface SimilarState {
  /** Added ones first, then found ones best first. */
  accounts: SimilarEntry[];
  /** Keyed by accountKey, trimmed to what the card shows. */
  posts: Record<string, FollowedAccount>;
  /** accountKeys "Not this one" took out, newest first: a find never brings them back. */
  dismissed: string[];
  /** The month's spend as the server last said it. */
  month: { spent: number; cap: number } | null;
  /** When a find last answered (null: never, so opening the tab starts one), and the TikTok searches it ran. */
  foundAt?: string | null;
  searches?: string[];
}

const KEY = "content-studio-similar-";
const CHANGED = "content-studio-similar-changed";
export const similarKey = (userId: string) => KEY + scoped(userId);
export const MAX_ADDED = 10;
const MAX_DISMISSED = 200;
/** The card shows two lines of caption; Write's remix brief gets the same. */
const CAPTION = 150;
export const FIND_FAILED = "Couldn't look for accounts right now. Try again in a few minutes.";
export const POSTS_FAILED = "Couldn't read that account right now. Try again in a few minutes.";
const EMPTY = (): SimilarState => ({ accounts: [], posts: {}, dismissed: [], month: null, foundAt: null, searches: [] });
const isAdded = (a: Pick<SimilarEntry, "via">) => a.via === "added";

export function loadSimilar(userId: string): SimilarState {
  try {
    const v = JSON.parse(localStorage.getItem(similarKey(userId)) ?? "null");
    if (!v || typeof v !== "object") return EMPTY();
    return {
      accounts: (Array.isArray(v.accounts) ? v.accounts : []).filter((a: SimilarEntry) => a && typeof a.handle === "string" && (a.platform === "instagram" || a.platform === "tiktok")),
      posts: v.posts && typeof v.posts === "object" && !Array.isArray(v.posts)
        ? Object.fromEntries(Object.entries(v.posts as Record<string, FollowedAccount>).filter(([, a]) => a && Array.isArray(a.posts)))
        : {},
      dismissed: (Array.isArray(v.dismissed) ? v.dismissed : []).filter((d: unknown): d is string => typeof d === "string").slice(0, MAX_DISMISSED),
      month: typeof v.month?.spent === "number" && typeof v.month?.cap === "number" ? v.month : null,
      foundAt: typeof v.foundAt === "string" ? v.foundAt : null,
      searches: (Array.isArray(v.searches) ? v.searches : []).filter((x: unknown): x is string => typeof x === "string").slice(0, 8),
    };
  } catch {
    return EMPTY();
  }
}

/** Writes the whole state, minus posts of accounts no longer on it. When storage is full it keeps 20 posts an account, then gives up. */
export function saveSimilar(userId: string, s: SimilarState): SimilarState {
  const live = new Set(s.accounts.map(accountKey));
  const kept = { ...s, posts: Object.fromEntries(Object.entries(s.posts).filter(([k]) => live.has(k))) };
  const trimmed = { ...kept, posts: Object.fromEntries(Object.entries(kept.posts).map(([k, a]) => [k, { ...a, posts: a.posts.slice(0, 20) }])) };
  let saved = kept;
  for (const t of [kept, trimmed]) {
    try {
      localStorage.setItem(similarKey(userId), JSON.stringify(t));
      saved = t;
      break;
    } catch {
      // storage full: the smaller try
    }
  }
  globalThis.dispatchEvent?.(new Event(CHANGED));
  return saved;
}

export function onSimilarChanged(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
}

/** A find folded in: new accounts after the ones there (never a dismissed or shown one), found ones 40 at most; added ones untouched. */
export function mergeFound(s: SimilarState, found: SimilarAccount[], now = new Date()): SimilarState {
  const taken = new Set([...s.accounts.map(accountKey), ...s.dismissed]);
  let room = SIMILAR_KEEP - s.accounts.filter((a) => !isAdded(a)).length;
  const fresh: SimilarEntry[] = [];
  for (const a of found) {
    if (room <= 0 || taken.has(accountKey(a))) continue;
    taken.add(accountKey(a));
    room--;
    fresh.push({ platform: a.platform, handle: a.handle, name: a.name.slice(0, 80), followers: a.followers, kind: a.kind, via: a.via.slice(0, 60), addedAt: now.toISOString() });
  }
  return { ...s, accounts: [...s.accounts, ...fresh] };
}

/** What "Add an account you like" read: a profile link names its platform; "@name" or a bare name could be either. */
export function readAddInput(raw: string): { handle: string; platforms: FollowPlatform[] } | null {
  const t = raw.trim();
  const p = parseInput(/^[A-Za-z0-9._]{2,30}$/.test(t) ? `@${t}` : t);
  if (p?.kind !== "link") return null;
  if (t.includes("tiktok.com")) {
    const h = p.handles.tiktok ? normalizeHandle("tiktok", p.handles.tiktok) : null;
    return h ? { handle: h, platforms: ["tiktok"] } : null;
  }
  const ig = p.handles.instagram ? normalizeHandle("instagram", p.handles.instagram) : null;
  if (!ig) return null;
  return { handle: ig, platforms: t.includes("instagram.com") ? ["instagram"] : ["instagram", "tiktok"] };
}

export type AddResult = "added" | "already" | "full" | "invalid";

/** An account added by hand: always kept, never judged, its posts read like the rest; a found one becomes added. */
export function addAccount(userId: string, platform: FollowPlatform, handle: string, now = new Date()): AddResult {
  const h = normalizeHandle(platform, handle);
  if (!h) return "invalid";
  const s = loadSimilar(userId);
  const key = accountKey({ platform, handle: h });
  const there = s.accounts.find((a) => accountKey(a) === key);
  if (there && isAdded(there)) return "already";
  if (s.accounts.filter(isAdded).length >= MAX_ADDED) return "full";
  const row: SimilarEntry = there ? { ...there, via: "added" } : { platform, handle: h, name: h, followers: null, kind: null, via: "added", addedAt: now.toISOString() };
  saveSimilar(userId, {
    ...s,
    accounts: [row, ...s.accounts.filter((a) => accountKey(a) !== key)],
    dismissed: s.dismissed.filter((d) => d !== key),
  });
  void runDueSimilar(userId);
  return "added";
}

/** "Not this one": the account and its posts go, and no find brings it back (adding it by hand does). */
export function dismissAccount(userId: string, key: string): void {
  const { [key]: _gone, ...media } = loadMedia(userId);
  writeMedia(userId, media);
  const s = loadSimilar(userId);
  saveSimilar(userId, { ...s, accounts: s.accounts.filter((a) => accountKey(a) !== key), dismissed: [key, ...s.dismissed.filter((d) => d !== key)].slice(0, MAX_DISMISSED) });
}

/**
 * The find's body: the brand's facts; as seeds the added accounts first, then the competitors' Instagram and TikTok
 * handles; as exclude everything shown, added or dismissed, and the brand's own accounts.
 */
export function findRequest(userId: string) {
  const s = loadSimilar(userId);
  const added = s.accounts.filter(isAdded);
  const competitors = loadCompetitors(userId).list;
  const seeds = (p: FollowPlatform) => [...new Set([
    ...added.filter((a) => a.platform === p).map((a) => a.handle),
    ...competitors.map((c) => (c.handles[p] ? normalizeHandle(p, c.handles[p]!) : null)).filter((h): h is string => Boolean(h)),
  ])];
  return {
    mode: "similar" as const,
    brand: brandFacts(userId),
    seeds: { instagram: seeds("instagram"), tiktok: seeds("tiktok") },
    exclude: [...new Set([...s.accounts.map(accountKey), ...s.dismissed, ...auditedHandles(loadSocialAccounts(userId)).map(accountKey)])],
  };
}

// ---- Finding, outside React ------------------------------------------------------------------------------------

type FindAnswer = { accounts: SimilarAccount[]; note?: string; phrases?: string[]; month?: { spent: number; cap: number } };
let finding = false;
let findNote: { text: string; error: boolean } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const isFinding = () => finding;
/** The last find's note: Jev's "nothing kept" line, how many were added, or the refusal. */
export const lastFind = () => findNote;
export function onSimilar(fn: () => void): () => void {
  listeners.add(fn);
  const off = jobs.on(fn);
  return () => {
    listeners.delete(fn);
    off();
  };
}

/** The first find for a brand starts by itself (Leo 1 Nov: "should be automatically added", "like a competitor search"); a failed one tries again next time, an answered one never repeats itself. */
export const autoFindDue = (s: SimilarState) => !s.foundAt && !finding;

export async function runFind(userId: string): Promise<void> {
  if (finding) return;
  finding = true;
  findNote = null;
  emit();
  try {
    const r = await callFn<FindAnswer>("competitors", findRequest(userId), FIND_FAILED);
    const s = loadSimilar(userId);
    const next = mergeFound(s, Array.isArray(r.accounts) ? r.accounts : []);
    const added = next.accounts.length - s.accounts.length;
    saveSimilar(userId, { ...next, month: r.month ?? s.month, foundAt: new Date().toISOString(), searches: Array.isArray(r.phrases) ? r.phrases.slice(0, 8) : s.searches ?? [] });
    findNote = r.note ? { text: r.note, error: false } : { text: added ? `Found ${added} new account${added === 1 ? "" : "s"}. Reading their posts now.` : "No new accounts this time.", error: false };
    void runDueSimilar(userId);
  } catch (e) {
    const err = e instanceof EdgeError ? e : new EdgeError(FIND_FAILED, 0);
    findNote = { text: err.message, error: true };
  } finally {
    finding = false;
    emit();
  }
}

// ---- Posts, outside React --------------------------------------------------------------------------------------

/** A re-read's posts over the stored ones by id (its numbers win), newest first, 30 at most. */
export function mergePosts(prev: TrackedPost[], fresh: TrackedPost[], max = POSTS_KEPT): TrackedPost[] {
  const ids = new Set(fresh.map((p) => p.id));
  return [...fresh, ...prev.filter((p) => !ids.has(p.id))]
    .sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""))
    .slice(0, max);
}

/** A read folded into the stored account through applyCheck: new posts only marked new, kept to what the card shows. */
export function applySimilarCheck(prev: FollowedAccount | undefined, r: TrackResult & { checkedAt: string }): FollowedAccount {
  const base: FollowedAccount = prev ?? { platform: r.platform, handle: r.handle, addedAt: r.checkedAt, history: [], posts: [], seen: [], fresh: [] };
  // the store keeps no seen list: what it held is what was seen
  const a = applyCheck({ ...base, seen: base.posts.map((p) => p.id) }, { ...r, posts: mergePosts(base.posts, r.posts) });
  // covers stay on this device (rememberMedia): their links expire within days and would triple the synced key
  return { ...a, history: a.history.slice(-1), seen: [], posts: a.posts.map(({ cover: _c, seconds: _s, slides: _n, ...p }) => ({ ...p, caption: p.caption.slice(0, CAPTION) })) };
}

// ---- Covers, on this device only ---------------------------------------------------------------------------------

/** A post's cover, a video's seconds and a slideshow's slides, as the read gave them (for the social north star). */
export type PostMedia = Pick<TrackedPost, "cover" | "seconds" | "slides">;
const MEDIA = "cs-similar-media-";
/** An account's best posts whose media is kept: the social north star reads at most this many of each account. */
export const MEDIA_KEPT = 8;

/** accountKey -> post id -> media. Outside the content-studio- prefix, so it never syncs. */
export function loadMedia(userId: string): Record<string, Record<string, PostMedia>> {
  try {
    const v = JSON.parse(localStorage.getItem(MEDIA + scoped(userId)) ?? "null");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function writeMedia(userId: string, all: Record<string, Record<string, PostMedia>>): void {
  try {
    localStorage.setItem(MEDIA + scoped(userId), JSON.stringify(all));
  } catch {
    // a device cache only: the north star labels from the words alone
  }
  // after the read's saveSimilar, so the north star's tiles draw the covers that just came in
  globalThis.dispatchEvent?.(new Event(CHANGED));
}

/** Keeps the media of the posts in `keep` (the account's best), from this read or the last one; the rest go. */
export function rememberMedia(userId: string, key: string, posts: TrackedPost[], keep: string[]): void {
  const all = loadMedia(userId);
  const read = new Map(posts.map((p) => [p.id, Object.fromEntries(Object.entries({ cover: p.cover, seconds: p.seconds, slides: p.slides }).filter(([, v]) => v !== undefined)) as PostMedia]));
  const kept = keep.flatMap((id) => {
    const m = read.get(id) ?? all[key]?.[id];
    return m && Object.keys(m).length ? [[id, m] as const] : [];
  });
  writeMedia(userId, { ...all, [key]: Object.fromEntries(kept) });
}

/** An account's best posts, best first: scored at or above their usual, MEDIA_KEPT at most. */
export function bestPostIds(posts: TrackedPost[], now = Date.now(), max = MEDIA_KEPT): string[] {
  const scores = scoreAccount(posts, now);
  return posts.filter((p) => (scores[p.id]?.ratio ?? 0) >= 1).sort((a, b) => byOutlier(scores[a.id], scores[b.id])).slice(0, max).map((p) => p.id);
}

const jobs = checkJobs("similar");
export const isReading = (key: string) => jobs.isRunning(key);
/** A find, a read or a round of reads is under way: the social north star waits for it before it builds. */
export const similarBusy = () => finding || jobs.busy();
export const readingAny = () => jobs.anyRunning();
export const readFailure = (key: string) => jobs.failure(key);
export const readsStopped = () => jobs.stopped();

/** One account's posts now: 30 the first time, the newest 10 after. */
export function runSimilarPosts(userId: string, platform: FollowPlatform, handle: string): Promise<boolean> {
  const key = accountKey({ platform, handle });
  return jobs.run(key, async () => {
    // a first read, or one from before covers were kept on this device: 30 posts, so the best ones get their covers
    const first = !loadSimilar(userId).posts[key]?.checkedAt || !(key in loadMedia(userId));
    const r = await callFn<TrackResult & { checkedAt: string; month?: { spent: number; cap: number } }>(
      "competitors", { mode: "posts", platform, handle, scope: "similar", limit: first ? POSTS_KEPT : SIMILAR_REFRESH }, POSTS_FAILED,
    );
    // read again: the list may have changed while the read ran
    const s = loadSimilar(userId);
    if (!s.accounts.some((a) => accountKey(a) === key)) return;
    saveSimilar(userId, {
      ...s,
      accounts: s.accounts.map((a) => (accountKey(a) === key ? { ...a, name: a.name === a.handle && r.name ? r.name.slice(0, 80) : a.name, followers: r.followers ?? a.followers } : a)),
      posts: { ...s.posts, [key]: applySimilarCheck(s.posts[key], r) },
      month: r.month ?? s.month,
    });
    rememberMedia(userId, key, r.posts, bestPostIds(loadSimilar(userId).posts[key]?.posts ?? []));
  }, POSTS_FAILED);
}

/**
 * The accounts a round reads now: never read, read 7+ days ago, or read with no covers kept on this device (before
 * 1 Nov covers were not kept, so the social north star's examples showed no pictures). A read always leaves the
 * account's entry in the media cache, empty or not, so that last one happens once a device.
 */
export function dueSimilar(userId: string, now = Date.now()): SimilarEntry[] {
  const s = loadSimilar(userId);
  const media = loadMedia(userId);
  return s.accounts.filter((a) => {
    const read = s.posts[accountKey(a)];
    return postsDue(read, now) || (Boolean(read?.checkedAt) && !(accountKey(a) in media));
  });
}

/** Opening the tab (and after a find or an add): every due account, one at a time, stopping at a refusal. */
export function runDueSimilar(userId: string, manual = false): Promise<void> {
  return jobs.round(userId, () => dueSimilar(userId).map((a) => ({ target: accountKey(a), go: () => runSimilarPosts(userId, a.platform, a.handle) })), manual);
}

// ---- The feed ----------------------------------------------------------------------------------------------------

export type SimilarFilter = "all" | "slideshows" | "carousels" | "reels" | "ugc";
export const SIMILAR_FILTERS: SimilarFilter[] = ["all", "slideshows", "carousels", "reels", "ugc"];
export interface SimilarPost { key: string; entry: SimilarEntry; account: FollowedAccount; post: TrackedPost; outlier: Outlier; fresh: boolean }

/** Slideshows are TikTok photo posts, carousels Instagram's; UGC is any post from an account Jev called a creator. */
export function inFilter(f: SimilarFilter, e: Pick<SimilarEntry, "platform" | "kind">, p: Pick<TrackedPost, "format">): boolean {
  if (f === "slideshows") return e.platform === "tiktok" && p.format === "carousel";
  if (f === "carousels") return e.platform === "instagram" && p.format === "carousel";
  if (f === "reels") return p.format === "video";
  if (f === "ugc") return e.kind === "creator";
  return true;
}

/** Every stored post of the accounts on the list, in the filter, best outlier score first, then newest. */
export function similarFeed(s: SimilarState, f: SimilarFilter = "all", now = Date.now()): SimilarPost[] {
  const out: SimilarPost[] = [];
  for (const e of s.accounts) {
    const a = s.posts[accountKey(e)];
    if (!a) continue;
    const scores = scoreAccount(a.posts, now);
    for (const p of a.posts) if (inFilter(f, e, p)) out.push({ key: `${e.platform}:${p.id}`, entry: e, account: a, post: p, outlier: scores[p.id], fresh: a.fresh.includes(p.id) });
  }
  const time = (p: TrackedPost) => (p.postedAt ? Date.parse(p.postedAt) || 0 : 0);
  return out.sort((x, y) => byOutlier(x.outlier, y.outlier) || time(y.post) - time(x.post));
}
