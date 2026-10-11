// Use my real numbers (Analytics): the year's post numbers for the open brand's connected accounts, read
// by the `social` function (supabase/functions/social/metrics.ts, which checks every account again).
// A post that went out through Post it for me carries the same Zernio post id as its draft, so its
// numbers go onto that draft (draftHistory setDraftNumbers) and every Analytics card reads them in place
// of typed ones (analytics.ts withReal). Typed numbers are never changed. Anything else Zernio has is
// listed as posted outside the app.

import { callFn } from "@/lib/edgeFn";
import { scoped } from "@/lib/profiles";
import type { DraftEntry } from "@/lib/draftHistory";
import { MAX_DAYS, type AccountRef, type MetricsPost, type Numbers } from "../../supabase/functions/social/metrics.ts";

export type { AccountRef, MetricsPost, Numbers };

// shortcut: reads at most 5 pages (500 posts) a year; page further if an adviser posts more than that
const MAX_PAGES = 5;
const DAY = 86_400_000;

export interface Pulled {
  accounts: AccountRef[];
  posts: MetricsPost[];
}

/** Every post of the last year (Zernio's longest period), newest first. */
export async function pullNumbers(profileId: string, now = Date.now()): Promise<Pulled> {
  const to = new Date(now).toISOString().slice(0, 10);
  const from = new Date(now - (MAX_DAYS - 1) * DAY).toISOString().slice(0, 10);
  let accounts: AccountRef[] = [];
  const posts: MetricsPost[] = [];
  for (let page = 1, pages = 1; page <= Math.min(pages, MAX_PAGES); page++) {
    const r = await callFn<Pulled & { pages: number }>("social", { action: "metrics", profileId, from, to, page }, "Couldn't read your numbers. Try again in a minute.");
    accounts = r.accounts;
    posts.push(...r.posts);
    pages = r.pages;
  }
  return { accounts, posts };
}

const add = (a: Numbers, b: Numbers): Numbers => ({
  impressions: a.impressions + b.impressions,
  reach: a.reach + b.reach,
  views: a.views + b.views,
  likes: a.likes + b.likes,
  comments: a.comments + b.comments,
  shares: a.shares + b.shares,
  saves: a.saves + b.saves,
});

/**
 * Each pulled post goes to the draft that sent its Zernio post (summed when it went to more than one
 * account); every other post was made outside the app.
 */
export function matchPulled(drafts: DraftEntry[], posts: MetricsPost[]): { byDraft: Map<string, Numbers>; outside: MetricsPost[] } {
  const draftOf = new Map(drafts.filter((d) => d.zernio?.postId).map((d) => [d.zernio!.postId!, d.id]));
  const byDraft = new Map<string, Numbers>();
  const outside: MetricsPost[] = [];
  for (const p of posts) {
    const id = p.zernioPostId ? draftOf.get(p.zernioPostId) : undefined;
    if (!id) outside.push(p);
    else byDraft.set(id, byDraft.has(id) ? add(byDraft.get(id)!, p.numbers) : p.numbers);
  }
  return { byDraft, outside };
}

const NAMES: Record<keyof Numbers, [string, string]> = {
  impressions: ["impression", "impressions"],
  views: ["view", "views"],
  reach: ["reach", "reach"],
  likes: ["like", "likes"],
  comments: ["comment", "comments"],
  shares: ["share", "shares"],
  saves: ["save", "saves"],
};

/** "1,500 views, 900 reach, 1 save": the named numbers, zeros left out. */
export const numbersLine = (n: Numbers, keys: (keyof Numbers)[]) =>
  keys
    .filter((k) => n[k] > 0)
    .map((k) => `${n[k].toLocaleString()} ${NAMES[k][n[k] === 1 ? 0 : 1]}`)
    .join(", ");

/** The numbers Analytics' typed columns don't have. */
export const extraLine = (n: Numbers) => numbersLine(n, ["views", "reach", "saves"]);

// Synced per brand: once used, Analytics pulls again on each visit so the numbers stay fresh.
const KEY = "content-studio-realnumbers-";

export function realNumbersOn(userId: string): boolean {
  try {
    return localStorage.getItem(KEY + scoped(userId)) === "1";
  } catch {
    return false;
  }
}

export function rememberRealNumbers(userId: string): void {
  try {
    localStorage.setItem(KEY + scoped(userId), "1");
  } catch {
    // full or private storage: the button is there next time
  }
}
