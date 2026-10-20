// Their posts (/competitors?view=posts, Leo only; docs/north-star/items/find-competitor-posts.md): each competitor's
// Instagram and TikTok accounts, read by the competitors edge function (mode "posts", 30 posts) and kept in Following's
// shapes, so applyCheck and followStats work unchanged. One synced key per brand, written whole. Ranked by the outlier
// score (each post against its own account's usual). Checks run outside React through competitorAds.ts's jobs.

import { checkJobs, WEEK } from "@/lib/competitorAds";
import { type Competitor, loadCompetitors } from "@/lib/competitors";
import { callFn } from "@/lib/edgeFn";
import { applyCheck, type FollowedAccount, type FollowPlatform, reach, type TrackedPost } from "@/lib/following";
import { scoped } from "@/lib/profiles";
import { byOutlier, type Outlier, scoreAccount } from "../../supabase/functions/_shared/outlier.ts";
import { normalizeHandle } from "../../supabase/functions/_shared/socialAudit.ts";
import type { TrackResult } from "../../supabase/functions/track-accounts/logic.ts";

/** Keyed by `${competitorId}:${platform}`. */
export type CompetitorPostsState = Record<string, FollowedAccount>;

const KEY = "content-studio-competitor-posts-";
const CHANGED = "content-studio-competitor-posts-changed";
export const competitorPostsKey = (userId: string) => KEY + scoped(userId);
export const POSTS_FAILED = "Couldn't read that account right now. Try again in a few minutes.";
export const FEED_PLATFORMS: FollowPlatform[] = ["instagram", "tiktok"];
export const entryKey = (competitorId: string, platform: FollowPlatform) => `${competitorId}:${platform}`;

export function loadCompetitorPosts(userId: string): CompetitorPostsState {
  try {
    const v = JSON.parse(localStorage.getItem(competitorPostsKey(userId)) ?? "null");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(
      Object.entries(v as Record<string, FollowedAccount>).filter(([, a]) => a && typeof a.handle === "string" && Array.isArray(a.posts) && Array.isArray(a.history)),
    );
  } catch {
    return {};
  }
}

/** A competitor's Instagram and TikTok handles as the checks read them (lowercase, no @); bad ones left out. */
export function handlesOf(c: Pick<Competitor, "handles">): { platform: FollowPlatform; handle: string }[] {
  return FEED_PLATFORMS.flatMap((platform) => {
    const h = c.handles[platform] ? normalizeHandle(platform, c.handles[platform]!) : null;
    return h ? [{ platform, handle: h }] : [];
  });
}

/**
 * Writes the whole state, minus entries whose competitor is gone or whose handle changed. When storage is full it
 * keeps the newest 20 posts per handle, then gives up (the screen keeps what it shows).
 */
export function saveCompetitorPosts(userId: string, s: CompetitorPostsState): CompetitorPostsState {
  const live = new Map(loadCompetitors(userId).list.flatMap((c) => handlesOf(c).map((h) => [entryKey(c.id, h.platform), h.handle] as const)));
  const kept = Object.fromEntries(Object.entries(s).filter(([k, a]) => live.get(k) === a.handle));
  const trimmed = Object.fromEntries(Object.entries(kept).map(([k, a]) => [k, { ...a, posts: a.posts.slice(0, 20) }]));
  let saved = kept;
  for (const t of [kept, trimmed]) {
    try {
      localStorage.setItem(competitorPostsKey(userId), JSON.stringify(t));
      saved = t;
      break;
    } catch {
      // storage full: the smaller try
    }
  }
  globalThis.dispatchEvent?.(new Event(CHANGED));
  return saved;
}

export function onCompetitorPostsChanged(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
}

/** Due: never checked, or last checked 7+ days ago (a new handle has no entry, so it is due). */
export const postsDue = (a: FollowedAccount | undefined, now = Date.now()) => !a?.checkedAt || !(now - Date.parse(a.checkedAt) < WEEK);

// ---- Checks, outside React -----------------------------------------------------------------------------------

const jobs = checkJobs("posts");
export const isCheckingPosts = (k: string) => jobs.isRunning(k);
export const checkingAnyPosts = () => jobs.anyRunning();
export const postsCheckFailure = (k: string) => jobs.failure(k);
export const postsStopped = () => jobs.stopped();
export const onCompetitorPosts = (fn: () => void) => jobs.on(fn);

/** One competitor handle now (Check now or the weekly round). */
export function runPostsCheck(userId: string, competitorId: string, platform: FollowPlatform, handle: string): Promise<boolean> {
  const k = entryKey(competitorId, platform);
  return jobs.run(k, async () => {
    const r = await callFn<TrackResult & { checkedAt: string }>("competitors", { mode: "posts", platform, handle }, POSTS_FAILED);
    // read again: the list may have changed while the check ran
    const state = loadCompetitorPosts(userId);
    const prev = state[k]?.handle === handle ? state[k] : { platform, handle, addedAt: r.checkedAt, history: [], posts: [], seen: [], fresh: [] };
    saveCompetitorPosts(userId, { ...state, [k]: applyCheck(prev, r) });
  }, POSTS_FAILED);
}

/** Check now on one competitor: its handles one at a time (only `platform`'s when given), stopping at a refusal. */
export async function checkCompetitorPosts(userId: string, c: Competitor, platform?: FollowPlatform): Promise<void> {
  for (const h of handlesOf(c)) {
    if (platform && h.platform !== platform) continue;
    if (!(await runPostsCheck(userId, c.id, h.platform, h.handle))) return;
  }
}

/** The handles a round would check now. */
export function duePosts(userId: string, now = Date.now()): { competitorId: string; platform: FollowPlatform; handle: string }[] {
  const state = loadCompetitorPosts(userId);
  return loadCompetitors(userId).list.flatMap((c) =>
    handlesOf(c)
      .filter((h) => {
        const a = state[entryKey(c.id, h.platform)];
        return a?.handle !== h.handle || postsDue(a, now);
      })
      .map((h) => ({ competitorId: c.id, ...h })),
  );
}

/** Opening Their posts: every due handle, one at a time (manual: Check now under All). */
export function runDuePosts(userId: string, manual = false): Promise<void> {
  return jobs.round(userId, () => duePosts(userId).map((d) => ({
    target: `${d.competitorId}:${d.platform}:${d.handle}`,
    go: () => runPostsCheck(userId, d.competitorId, d.platform, d.handle),
  })), manual);
}

// ---- The merged feed and the pace table ------------------------------------------------------------------------

export type PostSort = "outlier" | "views" | "newest";
export interface FeedPost { key: string; competitor: Competitor; account: FollowedAccount; post: TrackedPost; outlier: Outlier; fresh: boolean }

const time = (p: TrackedPost) => (p.postedAt ? Date.parse(p.postedAt) || 0 : 0);

/** Every stored post of the competitors on the list, filtered by competitor and platform, in the chosen order. */
export function feedPosts(
  list: Competitor[],
  state: CompetitorPostsState,
  o: { c?: string; platform?: FollowPlatform | "all"; sort?: PostSort } = {},
  now = Date.now(),
): FeedPost[] {
  const out: FeedPost[] = [];
  for (const c of list) {
    if (o.c && o.c !== "all" && o.c !== c.id) continue;
    for (const h of handlesOf(c)) {
      if (o.platform && o.platform !== "all" && o.platform !== h.platform) continue;
      const a = state[entryKey(c.id, h.platform)];
      if (a?.handle !== h.handle) continue;
      const scores = scoreAccount(a.posts, now);
      for (const p of a.posts) out.push({ key: `${a.platform}:${p.id}`, competitor: c, account: a, post: p, outlier: scores[p.id], fresh: a.fresh.includes(p.id) });
    }
  }
  const newer = (x: FeedPost, y: FeedPost) => time(y.post) - time(x.post);
  const by: Record<PostSort, (x: FeedPost, y: FeedPost) => number> = {
    outlier: (x, y) => byOutlier(x.outlier, y.outlier) || newer(x, y),
    views: (x, y) => reach(y.post) - reach(x.post) || newer(x, y),
    newest: newer,
  };
  return out.sort(by[o.sort ?? "outlier"]);
}

/** The best settled ratio among an account's posts, or null when none is scored. */
export function bestRatio(a: FollowedAccount, now = Date.now()): number | null {
  const ratios = Object.values(scoreAccount(a.posts, now)).map((o) => o.ratio).filter((r): r is number => r !== null);
  return ratios.length ? Math.max(...ratios) : null;
}
