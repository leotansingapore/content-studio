// Use my real numbers (Analytics): the year's post numbers for the open brand's connected accounts, read
// by the `social` function (supabase/functions/social/metrics.ts, which checks every account again).
// A post that went out through Post it for me carries the same Zernio post id as its draft, so its
// numbers go onto that draft (draftHistory setDraftNumbers) and every Analytics card reads them in place
// of typed ones (analytics.ts withReal). Typed numbers are never changed. A post put out by hand is
// matched to its draft by its words (matchOutside, then Jev's same-post for the unsure ones) and linked
// through `live`. Anything else Zernio has is listed as posted outside the app.
// The pull is one job outside React (learn-real-numbers): Home, My posts and Analytics ask for it on open
// and it runs at most every 6 hours per brand, one run at a time, and records each pull for Pace.
//   content-studio-realnumbers-<scoped> (synced, per brand): RealNumbersState; a stored "1" still reads as on.

import { callFn, EdgeError } from "@/lib/edgeFn";
import { activeProfileId, scoped } from "@/lib/profiles";
import { draftStatus, loadDrafts, saveDrafts, setDraftNumbers, type DraftEntry } from "@/lib/draftHistory";
import { wordOverlap } from "@/lib/nearDuplicate";
import { toPlainText } from "@/lib/plainText";
import { loadPace, recordPull, savePace } from "@/lib/pace";
import { SAVE_FAILED } from "@/lib/voiceMemory";
import { MAX_DAYS, type AccountRef, type FollowerSeries, type MetricsPost, type Numbers } from "../../supabase/functions/social/metrics.ts";

export type { AccountRef, FollowerSeries, MetricsPost, Numbers };

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

/** Each connected account's daily follower counts, a year back (as far as Zernio has them). */
export const pullFollowers = (profileId: string) =>
  callFn<{ accounts: FollowerSeries[] }>("social", { action: "followers", profileId }, "Couldn't read your followers. Try again in a minute.").then((r) => r.accounts);

const add = (a: Numbers, b: Numbers): Numbers => ({
  impressions: a.impressions + b.impressions,
  reach: a.reach + b.reach,
  views: a.views + b.views,
  likes: a.likes + b.likes,
  comments: a.comments + b.comments,
  shares: a.shares + b.shares,
  saves: a.saves + b.saves,
});

/** A hand-posted draft's live post, as matched or linked (DraftEntry.live). */
export type LiveLink = NonNullable<DraftEntry["live"]>;
type Linked = DraftEntry;

/**
 * Each pulled post goes to the draft that sent its Zernio post (summed when it went to more than one
 * account), else to the draft a hand-posted post was linked to; every other post was made outside the app.
 */
export function matchPulled(drafts: DraftEntry[], posts: MetricsPost[]): { byDraft: Map<string, Numbers>; outside: MetricsPost[] } {
  const draftOf = new Map(drafts.filter((d) => d.zernio?.postId).map((d) => [d.zernio!.postId!, d.id]));
  const liveOf = new Map((drafts as Linked[]).filter((d) => d.live?.postId).map((d) => [d.live!.postId, d.id]));
  const byDraft = new Map<string, Numbers>();
  const outside: MetricsPost[] = [];
  for (const p of posts) {
    const id = (p.zernioPostId && draftOf.get(p.zernioPostId)) || liveOf.get(p.id);
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

// ---- matching hand-posted drafts ----

// shortcut: proposed starting cuts (decision 10), read on Leo's first pulls before anyone else gets them
const SURE_OVERLAP = 0.7;
const ASK_OVERLAP = 0.3;
const WINDOW_DAYS = 3;
/** Jev's same-post takes 1 to 10 pairs a call. */
const MAX_PAIRS = 10;
/** The pull keeps a post's first 300 characters (writing-judge's same-post reads no more of `live`). */
const LIVE_CHARS = 300;

export interface Link {
  draftId: string;
  post: MetricsPost;
}
/** One draft and one outside post for Jev's same-post question; `draft` and `live` are what it reads. */
export interface Pair extends Link {
  key: string;
  draft: string;
  live: string;
}

const SG = 8 * 3_600_000;
/** The Singapore day number of a post time; a day or a local time with no zone is taken as written. */
const dayNo = (s: string) => Math.floor((/(Z|[+-]\d\d:?\d\d)$/.test(s) ? Date.parse(s) + SG : Date.parse(`${s.slice(0, 10)}T00:00:00Z`)) / DAY);

/**
 * Which draft each outside post came from. Candidates are posted drafts on the same platform with no Zernio post and
 * no live link, posted (else scheduled) within 3 days. Each is compared by word overlap on the draft cut to the live
 * text's length, since the pull keeps only a post's first 300 characters. Exactly one at 0.7 or more is sure; else
 * every candidate at 0.3 or more goes to Jev with that same span on both sides (a 600-character draft against the
 * live post's 300 read a lightly edited copy as another post: live-p7a D14). Posts already linked, and posts in
 * `notMine`, are skipped.
 */
export function matchOutside(drafts: DraftEntry[], posts: MetricsPost[], notMine: string[] = []): { sure: Link[]; ask: Pair[] } {
  const linked = new Set((drafts as Linked[]).flatMap((d) => (d.live ? [d.live.postId] : [])));
  const taken = new Set<string>();
  const sure: Link[] = [];
  const ask: Pair[] = [];
  for (const post of posts) {
    if (!post.publishedAt || !post.text || linked.has(post.id) || notMine.includes(post.id)) continue;
    const day = dayNo(post.publishedAt);
    const live = post.text.slice(0, LIVE_CHARS);
    const scored = (drafts as Linked[])
      .filter((d) => {
        const when = d.postedAt ?? d.scheduledFor;
        return draftStatus(d) === "posted" && d.platform === post.platform && !d.zernio?.postId && !d.live && !taken.has(d.id) && !!when && Math.abs(dayNo(when) - day) <= WINDOW_DAYS;
      })
      .map((d) => {
        const text = toPlainText(d.draft).slice(0, live.length);
        return { d, text, overlap: wordOverlap(text, live) };
      })
      .filter((c) => c.overlap >= ASK_OVERLAP);
    const high = scored.filter((c) => c.overlap >= SURE_OVERLAP);
    if (high.length === 1) {
      sure.push({ draftId: high[0].d.id, post });
      taken.add(high[0].d.id);
    } else for (const c of scored) ask.push({ key: `k${ask.length.toString(36)}`, draftId: c.d.id, post, draft: c.text, live });
  }
  return { sure, ask };
}

/**
 * Jev's same-post answer for up to 10 pairs, whole posts only. A post links only when exactly one of its drafts is
 * linked, and a draft takes one post. Capped, refused, unconfigured or down: nothing links and the posts stay outside.
 */
async function askJev(ask: Pair[]): Promise<Pair[]> {
  const batch: Pair[] = [];
  for (const id of new Set(ask.map((p) => p.post.id))) {
    const group = ask.filter((p) => p.post.id === id);
    if (batch.length + group.length <= MAX_PAIRS) batch.push(...group);
  }
  if (!batch.length) return [];
  try {
    const r = await callFn<{ links?: unknown }>("writing-judge", {
      mode: "same-post",
      pairs: batch.map((p) => ({ key: p.key, draft: p.draft, live: p.live, platform: p.post.platform })),
    });
    const yes = new Set(Array.isArray(r?.links) ? r.links : []);
    const hits = batch.filter((p) => yes.has(p.key));
    const used = new Set<string>();
    return hits.filter((p) => hits.filter((q) => q.post.id === p.post.id).length === 1 && !used.has(p.draftId) && !!used.add(p.draftId));
  } catch {
    return [];
  }
}

// ---- the synced state ----

export interface RealNumbersState {
  on: boolean;
  /** The last pull that landed. */
  at: string | null;
  /** Outside posts you said aren't yours, or unlinked: the matcher never links them. Newest first, 300 kept. */
  notMine: string[];
  /** No analytics on the Zernio plan: no pull before this. */
  pausedUntil?: string;
}

export const REALNUMBERS_CHANGED = "content-studio-realnumbers-changed";
const KEY = "content-studio-realnumbers-";
const MAX_NOT_MINE = 300;
const STALE_MS = 6 * 3_600_000;

export function loadRealNumbers(userId: string): RealNumbersState {
  const off: RealNumbersState = { on: false, at: null, notMine: [] };
  try {
    const raw = window.localStorage.getItem(KEY + scoped(userId));
    if (raw === "1") return { ...off, on: true };
    const s = JSON.parse(raw ?? "null") as Partial<RealNumbersState> | null;
    if (!s || typeof s !== "object") return off;
    return {
      on: s.on === true,
      at: typeof s.at === "string" ? s.at : null,
      notMine: Array.isArray(s.notMine) ? s.notMine.filter((x): x is string => typeof x === "string").slice(0, MAX_NOT_MINE) : [],
      ...(typeof s.pausedUntil === "string" ? { pausedUntil: s.pausedUntil } : {}),
    };
  } catch {
    return off;
  }
}

/** Null when saved, else the line. */
function saveRealNumbers(userId: string, s: RealNumbersState): string | null {
  try {
    window.localStorage.setItem(KEY + scoped(userId), JSON.stringify(s));
  } catch {
    return SAVE_FAILED;
  }
  window.dispatchEvent(new Event(REALNUMBERS_CHANGED));
  return null;
}

export const realNumbersOn = (userId: string): boolean => loadRealNumbers(userId).on;

export function rememberRealNumbers(userId: string): void {
  saveRealNumbers(userId, { ...loadRealNumbers(userId), on: true });
}

/** Over 6 hours since the last pull, or forced; never while paused. */
export function shouldRefresh(s: RealNumbersState, now: number, force = false): boolean {
  if (s.pausedUntil && Date.parse(s.pausedUntil) > now) return false;
  return force || !s.at || now - Date.parse(s.at) >= STALE_MS;
}

/** "None of these": the matcher never links this post. */
export function markNotMine(userId: string, postId: string): void {
  const s = loadRealNumbers(userId);
  saveRealNumbers(userId, { ...s, notMine: [postId, ...s.notMine.filter((x) => x !== postId)].slice(0, MAX_NOT_MINE) });
}

// ---- linking ----

function withoutLive(d: Linked): Linked {
  const { live: _live, ...rest } = d;
  return rest;
}

/** Links an outside post to a draft with its numbers, and off any other draft that had it. */
export function linkPost(userId: string, draftId: string, post: MetricsPost, by: LiveLink["by"], at = new Date().toISOString()): void {
  const live: LiveLink = { postId: post.id, platform: post.platform, url: post.url, by, numbers: { ...post.numbers, at } };
  saveDrafts(userId, (loadDrafts(userId) as Linked[]).map((d) => (d.id === draftId ? { ...d, live } : d.live?.postId === post.id ? withoutLive(d) : d)));
}

/** Clears a draft's live link; its post goes on notMine, so the matcher doesn't link it again. */
export function unlinkPost(userId: string, draftId: string): void {
  const drafts = loadDrafts(userId) as Linked[];
  const postId = drafts.find((d) => d.id === draftId)?.live?.postId;
  if (!postId) return;
  saveDrafts(userId, drafts.map((d) => (d.id === draftId ? withoutLive(d) : d)));
  markNotMine(userId, postId);
}

// ---- the job ----

export interface NumbersJob {
  running: boolean;
  /** The last run's refusal or failure, in the server's words (daily_limit, no_analytics...). The last numbers stay. */
  error: { message: string; code: string; status: number } | null;
  /** The last pull found no connected account for this brand. */
  none: boolean;
  /** The last pull's posts made outside the app and not linked (kept in memory only). */
  outside: MetricsPost[];
  followers: FollowerSeries[];
  /** What the last run linked by itself, for My posts' toast with Undo. */
  linked: { draftId: string; by: "auto" | "jev" }[];
  /** When the last run landed. */
  at: string | null;
}

const blank = (): NumbersJob => ({ running: false, error: null, none: false, outside: [], followers: [], linked: [], at: null });
const jobs = new Map<string, NumbersJob>();
const inFlight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

/** The open brand's job. */
export const numbersJob = (userId: string): NumbersJob => jobs.get(scoped(userId)) ?? blank();

export function onNumbers(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** On a page open: pulls when the last pull is over 6 hours old and nothing is paused or running. */
export function refreshIfStale(userId: string, now: () => number = Date.now): void {
  if (shouldRefresh(loadRealNumbers(userId), now())) void run(userId, now);
}

/** "Update", and other sign-ins' every Analytics visit: pulls now unless paused; resolves when the run lands. */
export function refreshNumbers(userId: string, now: () => number = Date.now): Promise<void> {
  return shouldRefresh(loadRealNumbers(userId), now(), true) ? run(userId, now) : Promise.resolve();
}

function run(userId: string, now: () => number): Promise<void> {
  const scope = scoped(userId);
  const going = inFlight.get(scope);
  if (going) return going;
  const p = pullAndMatch(userId, scope, now).finally(() => inFlight.delete(scope));
  inFlight.set(scope, p);
  return p;
}

async function pullAndMatch(userId: string, scope: string, now: () => number): Promise<void> {
  const set = (j: Partial<NumbersJob>) => {
    jobs.set(scope, { ...(jobs.get(scope) ?? blank()), ...j });
    listeners.forEach((l) => l());
  };
  // another brand opened while a call was out: drop the result rather than write it into that brand
  const moved = () => scoped(userId) !== scope;
  set({ running: true, error: null });
  try {
    const profileId = activeProfileId(userId);
    const { accounts, posts } = await pullNumbers(profileId, now());
    // the post numbers still show when the follower counts can't be read
    const followers = accounts.length ? await pullFollowers(profileId).catch(() => [] as FollowerSeries[]) : [];
    if (moved()) return set({ running: false });
    const at = new Date(now()).toISOString();
    if (!accounts.length) {
      saveRealNumbers(userId, { ...loadRealNumbers(userId), at });
      return set({ running: false, none: true, outside: [], followers: [], linked: [], at });
    }
    const { byDraft, outside } = matchPulled(loadDrafts(userId), posts);
    setDraftNumbers(userId, byDraft, at);
    const { sure, ask } = matchOutside(loadDrafts(userId), outside, loadRealNumbers(userId).notMine);
    for (const l of sure) linkPost(userId, l.draftId, l.post, "auto", at);
    savePace(userId, recordPull(loadPace(userId), posts, at));
    const { pausedUntil: _paused, ...state } = loadRealNumbers(userId);
    saveRealNumbers(userId, { ...state, on: true, at });
    const linked: NumbersJob["linked"] = sure.map((l) => ({ draftId: l.draftId, by: "auto" }));
    const gone = new Set(sure.map((l) => l.post.id));
    const asked = await askJev(ask);
    if (!moved()) {
      // the person may have linked one by hand while Jev was out
      const free = (d?: Linked) => !!d && !d.live;
      for (const p of asked) {
        if (!free((loadDrafts(userId) as Linked[]).find((d) => d.id === p.draftId))) continue;
        linkPost(userId, p.draftId, p.post, "jev", at);
        linked.push({ draftId: p.draftId, by: "jev" });
        gone.add(p.post.id);
      }
    }
    set({ running: false, none: false, outside: outside.filter((p) => !gone.has(p.id)), followers, linked, at });
  } catch (e) {
    const error = e instanceof EdgeError ? { message: e.message, code: e.code, status: e.status } : { message: "Couldn't read your numbers. Try again in a minute.", code: "", status: 0 };
    if (error.status === 402 && !moved()) saveRealNumbers(userId, { ...loadRealNumbers(userId), pausedUntil: new Date(now() + DAY).toISOString() });
    set({ running: false, error });
  }
}
