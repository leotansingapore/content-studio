// Engage this week (Discover > Following): 10 people to comment on or reply to,
// 5 bigger accounts and 3 peers from the Creators list (sized by their usual
// reel views against yours), and 2 likely clients from the people who commented
// on your own posts (engage-picks edge function, judged by Jev). The list turns
// over each week; what you tick off is a synced key, kept per week.

import advisorsData from "@/data/advisors.json";
import { getTopPostsForAdvisor } from "@/lib/topPosts";
import type { AdvisorEntry } from "@/components/AdvisorProfiles";
import { callFn } from "@/lib/edgeFn";
import { scoped } from "@/lib/profiles";
import type { Pick as ClientPick } from "../../supabase/functions/engage-picks/logic.ts";

export type { ClientPick };

export interface EngagePerson {
  key: string;
  name: string;
  handle: string;
  url: string;
  /** Usual reel views, or likes where a creator posts no reels. */
  usual: number;
  unit: "views" | "likes";
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

/** Every Instagram creator with posts on file, with their usual reach, biggest first. */
export function sizedCreators(advisors: AdvisorEntry[] = advisorsData as AdvisorEntry[], postsOf = getTopPostsForAdvisor): EngagePerson[] {
  const out: EngagePerson[] = [];
  for (const a of advisors) {
    if (a.platform !== "instagram") continue;
    const posts = postsOf(a);
    if (posts.length < 3) continue;
    const views = posts.map((p) => p.views).filter((v): v is number => typeof v === "number" && v > 0);
    const [usual, unit] = views.length >= 3 ? [median(views), "views" as const] : [median(posts.map((p) => p.likes || 0)), "likes" as const];
    if (!usual) continue;
    out.push({ key: a.id, name: a.name, handle: a.handle.replace(/^@?/, "@"), url: a.platform_url, usual: Math.round(usual), unit });
  }
  return out.sort((x, y) => y.usual - x.usual);
}

/** The ISO week, e.g. 2026-W41: the list turns over every Monday. */
export function isoWeek(now = new Date()): string {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d.getTime() - start.getTime()) / 86_400_000 + 1) / 7)).padStart(2, "0")}`;
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** n in a row from a starting point set by the week, so each week shows the next few. */
export function rotate<T>(list: T[], n: number, seed: string): T[] {
  if (list.length <= n) return list;
  const start = hash(seed) % list.length;
  return Array.from({ length: n }, (_, i) => list[(start + i) % list.length]);
}

/**
 * Bigger: usually at least twice your views. Peers: within half to twice yours.
 * With no audit to size you by, the top half is bigger and the rest are peers.
 */
export function engageList(creators: EngagePerson[], usualViews: number | null, week: string): { bigger: EngagePerson[]; peers: EngagePerson[] } {
  const views = creators.filter((c) => c.unit === "views");
  let bigger: EngagePerson[];
  let peers: EngagePerson[];
  if (usualViews && usualViews > 0) {
    bigger = views.filter((c) => c.usual >= usualViews * 2);
    peers = views.filter((c) => c.usual >= usualViews / 2 && c.usual < usualViews * 2);
    // too few your size: the nearest in size
    if (peers.length < 3) {
      peers = views
        .filter((c) => !bigger.includes(c) || bigger.length > 5)
        .sort((a, b) => Math.abs(Math.log(a.usual / usualViews)) - Math.abs(Math.log(b.usual / usualViews)))
        .slice(0, 3);
    }
    if (bigger.length < 5) bigger = views.filter((c) => !peers.includes(c)).slice(0, 5);
  } else {
    const half = Math.ceil(views.length / 2);
    bigger = views.slice(0, half);
    peers = views.slice(half);
  }
  return { bigger: rotate(bigger, 5, `${week}:b`), peers: rotate(peers, 3, `${week}:p`) };
}

export interface EngageState {
  week: string;
  done: string[];
  clients?: ClientPick[];
  usualViews?: number | null;
  audited?: boolean;
  /** The audit keeps commenters (from its first refresh after 2026-10-08). */
  kept?: boolean;
}

const KEY = "content-studio-engage-";

export function loadEngage(userId: string, week: string): EngageState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY + scoped(userId)) ?? "null");
    if (s && s.week === week && Array.isArray(s.done)) return s;
  } catch { /* fall through to a fresh week */ }
  return { week, done: [] };
}

export function saveEngage(userId: string, s: EngageState): EngageState {
  try {
    localStorage.setItem(KEY + scoped(userId), JSON.stringify(s));
  } catch { /* full storage: still shows until reload */ }
  return s;
}

export function fetchClients(): Promise<{ clients: ClientPick[]; usualViews: number | null; audited: boolean; kept: boolean }> {
  return callFn("engage-picks", {}, "Couldn't load this week's list right now. Try again in a minute.");
}
