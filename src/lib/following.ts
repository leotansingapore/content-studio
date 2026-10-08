// Following (Discover > Following): up to 5 public Instagram or TikTok accounts
// an adviser watches, competitors or creators. Each check (track-accounts edge
// function) adds a follower snapshot and the newest posts; posts not seen on an
// earlier check are marked new so they can be remixed. The whole list is one
// synced key, so removing an account rewrites the list and stays removed.

import { callFn } from "@/lib/edgeFn";
import { scoped } from "@/lib/profiles";
import type { TrackedPost, TrackResult } from "../../supabase/functions/track-accounts/logic.ts";

export type { TrackedPost };
export type FollowPlatform = TrackResult["platform"];

export interface Snapshot {
  at: string;
  followers: number | null;
}

export interface FollowedAccount {
  platform: FollowPlatform;
  handle: string;
  addedAt: string;
  name?: string;
  url?: string;
  history: Snapshot[];
  posts: TrackedPost[];
  /** Post ids from earlier checks. */
  seen: string[];
  /** Ids that were new on the latest check. */
  fresh: string[];
  checkedAt?: string;
}

export const MAX_FOLLOWED = 5;
const KEY = "content-studio-following-";
const DAY = 86_400_000;

export function loadFollowing(userId: string): FollowedAccount[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY + scoped(userId)) ?? "[]");
    return Array.isArray(list) ? list.filter((a) => a && typeof a.handle === "string" && Array.isArray(a.history)) : [];
  } catch {
    return [];
  }
}

export function saveFollowing(userId: string, list: FollowedAccount[]): FollowedAccount[] {
  try {
    localStorage.setItem(KEY + scoped(userId), JSON.stringify(list));
  } catch { /* full storage: the list still shows until the page reloads */ }
  return list;
}

export const sameAccount = (a: Pick<FollowedAccount, "platform" | "handle">, b: Pick<FollowedAccount, "platform" | "handle">) =>
  a.platform === b.platform && a.handle === b.handle;

/** A check folded into an account: one snapshot per day, posts replaced, new ones marked. */
export function applyCheck(a: FollowedAccount, r: TrackResult & { checkedAt: string }): FollowedAccount {
  const day = r.checkedAt.slice(0, 10);
  const history = [...a.history.filter((s) => s.at.slice(0, 10) !== day), { at: r.checkedAt, followers: r.followers }].slice(-90);
  const firstCheck = !a.checkedAt;
  const fresh = firstCheck ? [] : r.posts.filter((p) => !a.seen.includes(p.id)).map((p) => p.id);
  return {
    ...a,
    handle: r.handle,
    name: r.name || a.name,
    url: r.url || a.url,
    history,
    posts: r.posts,
    seen: [...new Set([...r.posts.map((p) => p.id), ...a.seen])].slice(0, 300),
    fresh,
    checkedAt: r.checkedAt,
  };
}

export interface FollowStats {
  followers: number | null;
  /** Followers gained since the oldest snapshot of the last 30 days; null with one snapshot. */
  growth: number | null;
  growthDays: number;
  /** Posts a week, from the dates of the posts read. */
  perWeek: number | null;
  /** The post with the most views, or interactions where views are hidden. */
  best: TrackedPost | null;
}

const reach = (p: TrackedPost) => p.views ?? p.likes + p.comments;

export function followStats(a: FollowedAccount, now = Date.now()): FollowStats {
  const last = a.history[a.history.length - 1];
  const window = a.history.filter((s) => s.followers !== null && now - Date.parse(s.at) <= 30 * DAY);
  const first = window[0];
  const growth = last?.followers != null && first && first !== last && first.followers !== null ? last.followers - first.followers : null;
  const dated = a.posts.map((p) => (p.postedAt ? Date.parse(p.postedAt) : NaN)).filter((t) => Number.isFinite(t));
  const span = dated.length >= 2 ? Math.max(7 * DAY, now - Math.min(...dated)) : 0;
  return {
    followers: last?.followers ?? null,
    growth,
    growthDays: first && last ? Math.round((Date.parse(last.at) - Date.parse(first.at)) / DAY) : 0,
    perWeek: span ? Math.round((dated.length / span) * 7 * DAY * 10) / 10 : null,
    best: a.posts.length ? a.posts.reduce((b, p) => (reach(p) > reach(b) ? p : b)) : null,
  };
}

/** Where a post goes to be remixed: a video to Clone a reel, anything else to Write. */
export function remixUrl(a: Pick<FollowedAccount, "handle">, p: TrackedPost): string {
  if (p.format === "video") return `/clone?${new URLSearchParams({ url: p.url })}`;
  const ctx = [
    `A post by @${a.handle} did well (${p.url}). What it says: "${p.caption}"`,
    "Write my own take on the idea in my voice. Do not copy its wording.",
  ].join("\n");
  return `/generate?${new URLSearchParams({ pillar: "topic", detail: p.caption.split(/[.!?\n]/)[0].slice(0, 80) || `@${a.handle}'s post`, ctx })}`;
}

export async function checkAccount(a: Pick<FollowedAccount, "platform" | "handle">): Promise<TrackResult & { checkedAt: string }> {
  return callFn("track-accounts", { platform: a.platform, handle: a.handle }, "Couldn't check that account right now. Try again in a few minutes.");
}

// Checks run outside React, so one keeps going while the adviser uses another page.
const running = new Set<string>();
const failures = new Map<string, string>();
const listeners = new Set<() => void>();
const keyOf = (a: Pick<FollowedAccount, "platform" | "handle">) => `${a.platform}:${a.handle}`;
const emit = () => listeners.forEach((l) => l());

export const isChecking = (a: Pick<FollowedAccount, "platform" | "handle">) => running.has(keyOf(a));
export const checkFailure = (a: Pick<FollowedAccount, "platform" | "handle">) => failures.get(keyOf(a));
export function onFollowing(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function runCheck(userId: string, a: Pick<FollowedAccount, "platform" | "handle">): Promise<void> {
  const k = keyOf(a);
  if (running.has(k)) return;
  running.add(k);
  failures.delete(k);
  emit();
  try {
    const r = await checkAccount(a);
    // Read the list again: it may have changed while the check ran.
    saveFollowing(userId, loadFollowing(userId).map((x) => (sameAccount(x, a) ? applyCheck(x, r) : x)));
  } catch (e) {
    failures.set(k, (e as Error).message);
  } finally {
    running.delete(k);
    emit();
  }
}
