// Research (wave 2, Leo only): up to 100 watched Instagram creators per brand, each re-read every 2 days by Leo's Mac
// while the page is open, and their reels ranked by how far each beat its creator's median (outlier.ts).
//
// The watch list is one synced key, content-studio-research-<brand>, as Following keeps its accounts: the handles, the
// suggestions skipped, and the accounts that can't be read. It changes only when Leo watches, removes or skips, so a
// tab left open on another device never writes over it after every read. What each read brings (name, followers,
// reels) stays on this device (cs-research-reads-<brand>), as Apps like yours keeps its covers: 100 creators of 12 reels
// is about 1 MB with their cover links, rewritten after every read. Another device fills its own feed as it reads.

import { scoped } from "@/lib/profiles";
import { pollDesk, runDesk, type RunOpts } from "@/lib/scriptDesk";
import { byOutlier, scoreAccount, type Outlier } from "../../supabase/functions/_shared/outlier.ts";
import {
  READ_LIMIT_MS, cleanHandle, type DiscoverCreator, type IgPause, type IgProfile, type IgReel,
} from "../../supabase/functions/script-desk/logic.ts";

export type { DiscoverCreator, IgPause, IgProfile, IgReel };
export { cleanHandle };

export const MAX_WATCHED = 100;
export const STALE_MS = 2 * 86_400_000;
/** Reads the page keeps open at once: one of the Mac's two read slots, so the other is free for a search. */
export const READS_AT_ONCE = 1;
/** Suggested creators: 3 with 100K to 1M followers and 3 with 10K to 100K. */
export const BANDS = [
  { from: 100_000, to: 1_000_000, take: 3 },
  { from: 10_000, to: 100_000, take: 3 },
] as const;

export interface Watched {
  handle: string;
  addedAt: string;
  /** From a search, until this device reads them itself. */
  name?: string;
  followers?: number | null;
  /** An account that can't be read (private, gone) and when that was found: tried again after 2 days. */
  readAt?: string;
  error?: string;
}

export interface ResearchList {
  creators: Watched[];
  /** Suggestions passed over, never suggested again. */
  skipped: string[];
}

/** A reel as this device keeps it: no video address (it expires within hours), the caption clipped. */
export type KeptReel = Omit<IgReel, "video" | "url" | "owner">;
export interface KeptRead {
  at: string;
  name?: string;
  followers?: number | null;
  avatar: string;
  reels: KeptReel[];
}

const LIST = "content-studio-research-";
const READS = "cs-research-reads-";
const PENDING = "cs-research-pending-";
// the Mac's pause covers every brand: it is the Mac Instagram stopped
const PAUSE = "cs-research-pause";

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return v && typeof v === "object" ? (v as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
    return true;
  } catch {
    // storage full or blocked: what's on screen stays until the page is left
    return false;
  }
};

export function loadList(userId: string): ResearchList {
  const raw = readJson<Partial<ResearchList>>(LIST + scoped(userId), {});
  const creators = (Array.isArray(raw.creators) ? raw.creators : []).filter((c) => c && cleanHandle(c.handle) === c.handle).slice(0, MAX_WATCHED);
  return { creators, skipped: Array.isArray(raw.skipped) ? raw.skipped.filter((h) => typeof h === "string").slice(-500) : [] };
}
export const saveList = (userId: string, list: ResearchList) => (writeJson(LIST + scoped(userId), list), list);

/** The list with these usernames or links added at the end, past the ones already watched, up to MAX_WATCHED. */
export function addCreators(list: ResearchList, raw: string[], now = new Date()): { list: ResearchList; added: string[]; bad: string[]; full: boolean } {
  const have = new Set(list.creators.map((c) => c.handle));
  const added: string[] = [];
  const bad: string[] = [];
  let full = false;
  for (const r of raw.map((x) => x.trim()).filter(Boolean)) {
    const h = cleanHandle(r);
    if (!h) bad.push(r);
    else if (have.has(h)) continue;
    else if (have.size >= MAX_WATCHED) full = true;
    else (have.add(h), added.push(h));
  }
  const creators = [...list.creators, ...added.map((handle) => ({ handle, addedAt: now.toISOString() }))];
  return { list: { ...list, creators }, added, bad, full };
}

/** Pasted text split into usernames: by spaces, commas or lines. */
export const handlesIn = (text: string) => text.split(/[\s,;]+/).filter(Boolean);

export const loadReads = (userId: string) => readJson<Record<string, KeptRead>>(READS + scoped(userId), {});

/**
 * A read's answer folded into this device's reads (the synced list is untouched), and the reads handed back even when
 * storage is full, so the page counts the creator as read either way. A full device keeps the numbers without the
 * covers and captions rather than nothing.
 */
export function keepRead(userId: string, handle: string, r: { profile: IgProfile | null; reels: IgReel[] }, base = loadReads(userId), now = new Date()): Record<string, KeptRead> {
  const reads = { ...base };
  const old = new Map((reads[handle]?.reels ?? []).map((x) => [x.code, x]));
  reads[handle] = {
    at: now.toISOString(),
    name: r.profile?.name || reads[handle]?.name,
    followers: r.profile?.followers ?? reads[handle]?.followers ?? null,
    avatar: r.profile?.avatar ?? reads[handle]?.avatar ?? "",
    // a reel read before keeps its caption when this read opened no embed page for it
    reels: r.reels.slice(0, 12).map(({ video: _v, url: _u, owner: _o, ...x }) => ({ ...x, caption: (x.caption || old.get(x.code)?.caption || "").slice(0, 300) })),
  };
  // only watched creators' reads stay
  const watched = new Set(loadList(userId).creators.map((c) => c.handle));
  for (const h of Object.keys(reads)) if (!watched.has(h)) delete reads[h];
  if (!writeJson(READS + scoped(userId), reads)) {
    const lean = Object.fromEntries(Object.entries(reads).map(([h, k]) => [h, { ...k, avatar: "", reels: k.reels.map((x) => ({ ...x, thumb: "", caption: "" })) }]));
    writeJson(READS + scoped(userId), lean);
  }
  return reads;
}

/** A read that failed for good (private, gone): marked, and left for 2 days like a good read. */
export function markFailed(userId: string, handle: string, error: string, now = new Date()): ResearchList {
  const list = loadList(userId);
  return saveList(userId, { ...list, creators: list.creators.map((c) => (c.handle === handle ? { ...c, readAt: now.toISOString(), error } : c)) });
}

export const loadPending = (userId: string) => readJson<Record<string, { job: string; at: number }>>(PENDING + scoped(userId), {});
export const savePending = (userId: string, p: Record<string, { job: string; at: number }>) => writeJson(PENDING + scoped(userId), p);

export function loadPause(now = Date.now()): IgPause | null {
  const p = readJson<IgPause | null>(PAUSE, null);
  return p && Date.parse(p.until) > now ? p : null;
}
export const savePause = (p: IgPause) => writeJson(PAUSE, p);

/** Who to read next: never read on this device first, then the longest ago; none read in the last 2 days, none in flight. */
export function dueCreators(list: ResearchList, reads: Record<string, KeptRead>, pending: Record<string, unknown>, now = Date.now()): string[] {
  // (pending: this tab's reads and every other tab's, as saved)
  const lastOf = (c: Watched) => Math.max(Date.parse(reads[c.handle]?.at ?? "") || 0, c.error ? Date.parse(c.readAt ?? "") || 0 : 0);
  return list.creators
    .filter((c) => !pending[c.handle] && now - lastOf(c) >= STALE_MS)
    .sort((a, b) => lastOf(a) - lastOf(b))
    .map((c) => c.handle);
}

export interface FeedItem {
  creator: Watched;
  reel: KeptReel;
  outlier: Outlier;
}

/** Every watched creator's reels, each against that creator's median, best first; pinned reels left out. */
export function feedOf(list: ResearchList, reads: Record<string, KeptRead>, now = Date.now()): FeedItem[] {
  const items: FeedItem[] = [];
  for (const creator of list.creators) {
    // pinned reels are a creator's old best: neither in the feed nor in their usual
    const reels = (reads[creator.handle]?.reels ?? []).filter((r) => !r.pinned);
    const scores = scoreAccount(reels.map((r) => ({ id: r.code, postedAt: r.takenAt, views: r.views, likes: r.likes ?? 0, comments: r.comments ?? 0 })), now);
    for (const reel of reels) if (scores[reel.code]?.ratio != null) items.push({ creator, reel, outlier: scores[reel.code] });
  }
  return items.sort((a, b) => byOutlier(a.outlier, b.outlier) || (Date.parse(b.reel.takenAt ?? "") || 0) - (Date.parse(a.reel.takenAt ?? "") || 0));
}

/**
 * The next reads to start: due creators not already being read (here, in another tab, or starting), and none that
 * failed this visit, up to the room left.
 */
export const pickReads = (due: string[], busy: Set<string>, failed: Set<string>, room: number) =>
  due.filter((h) => !busy.has(h) && !failed.has(h)).slice(0, Math.max(0, room - busy.size));

/** A failure about one creator (its page couldn't be read), as against the Mac or the worker failing every read. */
export const aboutCreator = (why: string, handle: string) => why.includes(`@${handle}`);
/** An account that can't be read for good: private, or not there. */
export const unreadable = (why: string) => /private|no Instagram account/.test(why);

/** Suggestions in their two follower bands, best first, none watched or skipped already. */
export function suggestedOf(found: DiscoverCreator[], list: ResearchList): DiscoverCreator[] {
  const out = new Set([...list.creators.map((c) => c.handle), ...list.skipped]);
  const fresh = found.filter((c) => c.profile?.followers != null && !out.has(c.handle));
  return BANDS.flatMap((b) => fresh.filter((c) => c.profile!.followers! >= b.from && c.profile!.followers! < b.to).slice(0, b.take));
}

/** A creator's grid read on Leo's Mac; the codes this device already has skip their embed pages. */
export const readCreator = (handle: string, known: string[], opts: RunOpts) =>
  runDesk<{ profile: IgProfile | null; reels: IgReel[]; paused: IgPause | null }>({ action: "ig_reels", handle, known }, { giveUpMs: READ_LIMIT_MS.ig_reels + 60_000, ...opts });
export const pollRead = (job: string, opts: Omit<RunOpts, "userId" | "onFiled">) =>
  pollDesk<{ profile: IgProfile | null; reels: IgReel[]; paused: IgPause | null }>(job, { giveUpMs: READ_LIMIT_MS.ig_reels + 60_000, ...opts });

/** Find creators on a topic, or Suggested creators from the brand's niche and main audience. */
export const findCreators = (q: { topic: string } | { suggest: true }, opts: RunOpts) =>
  runDesk<{ creators: DiscoverCreator[]; paused: IgPause | null }>(
    "suggest" in q ? { action: "discover", mode: "suggest" } : { action: "discover", topic: q.topic },
    { giveUpMs: READ_LIMIT_MS.discover + 60_000, ...opts },
  );

/** Where a reel goes from the feed: Clone a reel, which reads it and shows the script desk. */
export const cloneUrl = (code: string) => `/clone?${new URLSearchParams({ url: `https://www.instagram.com/reel/${code}/` })}`;
