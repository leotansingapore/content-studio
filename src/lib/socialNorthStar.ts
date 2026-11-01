// The social north star (/social-north-star, Leo's sign-ins only; docs/north-star/items/social-north-star.md): the
// formats that win among the brand's Apps like yours references, as plays, each with a recipe and this month's count of
// the brand's own posts against a target. Leo, 1 Nov 2026: "so in a way, build a social media north-star of posts that
// we wanna model after". The references' posts live in the Apps like yours store (similarAccounts.ts); this key, one
// per brand, holds only Jev's labels, the plays and the brand's own recent posts. The job runs outside React like that
// store's: it reads the brand's own Instagram and TikTok weekly (competitors posts, scope "similar", inside Leo's US$40
// a month), and builds (social-plays) once the references are read, then weekly and as more come in.

import { auditedHandles } from "@/lib/accountAudit";
import { refreshCloudKeys } from "@/lib/cloudSync";
import { WEEK } from "@/lib/competitorAds";
import { callFn, EdgeError } from "@/lib/edgeFn";
import type { FollowPlatform, TrackedPost } from "@/lib/following";
import { scoped } from "@/lib/profiles";
import {
  accountKey, autoFindDue, bestPostIds, loadMedia, loadSimilar, mergePosts, onSimilar, type PostMedia, rememberMedia, runDueSimilar, runFind, similarBusy,
  similarKey, type SimilarState,
} from "@/lib/similarAccounts";
import { loadSocialAccounts } from "@/lib/socialAccounts";
import { byOutlier, type Outlier, scoreAccount } from "../../supabase/functions/_shared/outlier.ts";
import { median } from "../../supabase/functions/_shared/socialAudit.ts";
import { POSTS_KEPT, SIMILAR_REFRESH } from "../../supabase/functions/competitors/logic.ts";
import {
  accountOf, bestExamples, cleanLabel, type Family, FAMILY_IDS, groupPlays, type Hook, PLAY_MIN_ACCOUNTS, PLAYS_POSTS, type PlayPost, type PostLabel, type Recipe,
} from "../../supabase/functions/social-plays/logic.ts";
import type { TrackResult } from "../../supabase/functions/track-accounts/logic.ts";

export interface PlayExample {
  key: string;
  platform: FollowPlatform;
  handle: string;
  name: string;
  /** What the tile and Remix need, caption cut to 150. */
  post: TrackedPost;
  ratio: number;
  cover?: string;
}
export interface Play {
  id: Family;
  /** Accounts and posts among the references that use it, and their median "x their usual". */
  accounts: number;
  posts: number;
  median: number;
  /** How many a week the accounts that use it post (their median), and the month's target from it. */
  perWeek: number;
  target: number;
  /** The hook shape most of its posts open with, and their usual length. */
  hook: Hook | null;
  seconds: number | null;
  slides: number | null;
  examples: PlayExample[];
  recipe: Recipe | null;
}
export interface OwnAccount {
  platform: FollowPlatform;
  handle: string;
  checkedAt: string | null;
  error?: string;
  /** The last 30 days' posts, caption cut to 150. */
  posts: TrackedPost[];
}
export interface SocialNs {
  builtAt: string | null;
  /** The last build tried, done or not: a failed one waits an hour. */
  triedAt: string | null;
  /** Accounts with posts the last build read: more read since rebuilds. */
  basis: number;
  /** Jev's labels by "platform:post id", only for the posts the last build sent. */
  labels: Record<string, PostLabel>;
  plays: Play[];
  own: OwnAccount[];
}
/** A reference post as a build sends it, with what a play's example tile needs. */
export interface RefPost extends PlayPost {
  name: string;
  post: TrackedPost;
}

const KEY = "content-studio-social-ns-";
const CHANGED = "content-studio-social-ns-changed";
export const socialNsKey = (userId: string) => KEY + scoped(userId);
const HOUR = 3_600_000;
const DAY = 86_400_000;
/** The month a play's progress counts: the brand's own posts of the last 30 days. */
export const OWN_DAYS = 30;
export const EXAMPLES = 3;
const CAPTION = 150;
export const BUILD_FAILED = "Couldn't build the plays right now. Try again in a few minutes.";
const OWN_FAILED = "Couldn't read your account right now. Try again in a few minutes.";
const EMPTY = (): SocialNs => ({ builtAt: null, triedAt: null, basis: 0, labels: {}, plays: [], own: [] });
const date = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null);

export function loadSocialNs(userId: string): SocialNs {
  try {
    const v = JSON.parse(localStorage.getItem(socialNsKey(userId)) ?? "null");
    if (!v || typeof v !== "object") return EMPTY();
    const labels = v.labels && typeof v.labels === "object" ? v.labels : {};
    return {
      builtAt: date(v.builtAt),
      triedAt: date(v.triedAt),
      basis: typeof v.basis === "number" ? v.basis : 0,
      labels: Object.fromEntries(Object.entries(labels).flatMap(([k, l]) => (cleanLabel(l) ? [[k, cleanLabel(l)!]] : []))),
      plays: (Array.isArray(v.plays) ? v.plays : []).filter((p: Play) => p && FAMILY_IDS.includes(p.id) && Array.isArray(p.examples)),
      own: (Array.isArray(v.own) ? v.own : []).filter((o: OwnAccount) => o && typeof o.handle === "string" && Array.isArray(o.posts)),
    };
  } catch {
    return EMPTY();
  }
}

export function saveSocialNs(userId: string, s: SocialNs): void {
  try {
    localStorage.setItem(socialNsKey(userId), JSON.stringify(s));
  } catch {
    // storage full: the plays build again next visit
  }
  globalThis.dispatchEvent?.(new Event(CHANGED));
}

export function onSocialNsChanged(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
}

// ---- What a build sends ----------------------------------------------------------------------------------------------

const trim = ({ cover: _c, seconds: _s, slides: _n, ...p }: TrackedPost): TrackedPost => ({ ...p, caption: p.caption.slice(0, CAPTION) });

function playPost(platform: FollowPlatform, handle: string, kind: PlayPost["kind"], p: TrackedPost, m: PostMedia | undefined, label: PostLabel | undefined, ratio: number): PlayPost {
  return {
    key: `${platform}:${p.id}`, platform, handle, kind, format: p.format, caption: p.caption, ratio,
    ...(m?.cover ? { cover: m.cover } : {}), ...(m?.seconds ? { seconds: m.seconds } : {}), ...(m?.slides ? { slides: m.slides } : {}), ...(label ? { label } : {}),
  };
}

/**
 * The references a build labels: each account's best posts (bestPostIds, the ones whose covers this device keeps),
 * then the best of those across accounts by outlier score, PLAYS_POSTS at most.
 */
export function topRefs(s: SimilarState, media: Record<string, Record<string, PostMedia>>, labels: Record<string, PostLabel>, now = Date.now()): RefPost[] {
  const out: { ref: RefPost; o: Outlier }[] = [];
  for (const e of s.accounts) {
    const key = accountKey(e);
    const a = s.posts[key];
    if (!a) continue;
    const scores = scoreAccount(a.posts, now);
    for (const id of bestPostIds(a.posts, now)) {
      const p = a.posts.find((x) => x.id === id)!;
      const pp = playPost(e.platform, e.handle, e.kind, p, media[key]?.[id], labels[`${e.platform}:${id}`], scores[id].ratio ?? 0);
      out.push({ ref: { ...pp, name: e.name, post: trim(p) }, o: scores[id] });
    }
  }
  return out.sort((x, y) => byOutlier(x.o, y.o)).slice(0, PLAYS_POSTS).map((x) => x.ref);
}

const inMonth = (p: TrackedPost, now: number) => p.postedAt !== null && now - Date.parse(p.postedAt) < OWN_DAYS * DAY;

/** The brand's own posts of the last 30 days, as a build sends them. */
export function ownPosts(ns: SocialNs, media: Record<string, Record<string, PostMedia>>, now = Date.now()): PlayPost[] {
  return ns.own.flatMap((o) =>
    o.posts.filter((p) => inMonth(p, now)).map((p) => playPost(o.platform, o.handle, null, p, media[accountKey(o)]?.[p.id], ns.labels[`${o.platform}:${p.id}`], 0)));
}

/** Accounts on the list whose posts have been read. */
export const readCount = (s: SimilarState) => s.accounts.filter((e) => s.posts[accountKey(e)]?.checkedAt).length;

/** The weeks each account's stored posts span (1 at least), for how often it posts. */
export function weeksOf(s: SimilarState): Record<string, number> {
  return Object.fromEntries(Object.entries(s.posts).map(([k, a]) => {
    const t = a.posts.map((p) => (p.postedAt ? Date.parse(p.postedAt) : NaN)).filter((x) => !Number.isNaN(x));
    return [k, t.length ? Math.max(1, (Math.max(...t) - Math.min(...t)) / WEEK) : 1];
  }));
}

/** A month's target from a weekly pace: four weeks of it, one at least. */
export const targetOf = (perWeek: number) => Math.max(1, Math.round(perWeek * 4));
const tenth = (n: number) => Math.round(n * 10) / 10;
const middle = (xs: (number | undefined)[]) => {
  const m = median(xs.filter((x): x is number => typeof x === "number"));
  return m === null ? null : Math.round(m);
};

/**
 * The plays from the labelled references (groupPlays, as the server grouped them for the recipes), with the server's
 * recipes, or the last build's for the same play when this one wrote none.
 * shortcut: perWeek counts only each account's best posts (the labelled ones), so it is a floor on how often they post a
 * format; label every post of the top accounts if the targets read too low.
 */
export function buildPlays(refs: RefPost[], labels: Record<string, PostLabel>, recipes: Partial<Record<Family, Recipe>>, weeks: Record<string, number>, prev: Play[] = []): Play[] {
  return groupPlays(refs, labels).map((g) => {
    const perWeek = tenth(median(g.accounts.map((a) => g.posts.filter((p) => accountOf(p) === a).length / (weeks[a] ?? 1))) ?? 0);
    const hooks = new Map<Hook, number>();
    for (const p of g.posts) {
      const h = (labels[p.key] ?? p.label)?.hook;
      if (h) hooks.set(h, (hooks.get(h) ?? 0) + 1);
    }
    return {
      id: g.id, accounts: g.accounts.length, posts: g.posts.length, median: tenth(g.median), perWeek, target: targetOf(perWeek),
      hook: [...hooks].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      seconds: middle(g.posts.map((p) => p.seconds)), slides: middle(g.posts.map((p) => p.slides)),
      examples: (bestExamples(g.posts, EXAMPLES) as RefPost[]).map((p) => ({
        key: p.key, platform: p.platform, handle: p.handle, name: p.name, post: p.post, ratio: tenth(p.ratio), ...(p.cover ? { cover: p.cover } : {}),
      })),
      recipe: recipes[g.id] ?? prev.find((p) => p.id === g.id)?.recipe ?? null,
    };
  });
}

/**
 * An example's cover: the one saved with the plan, else this device's latest read of that post. Plans built before
 * covers were kept (1 Nov) saved none, and the reads that bring them come after the build.
 */
export function exampleCover(e: PlayExample, media: Record<string, Record<string, PostMedia>>): string | undefined {
  return e.cover ?? media[`${e.platform}:${e.handle}`]?.[e.post.id]?.cover;
}

// ---- Progress --------------------------------------------------------------------------------------------------------

/** The brand's own posts of the last 30 days in each family, as Jev labelled them. */
export function ownCounts(ns: SocialNs, now = Date.now()): Partial<Record<Family, number>> {
  const out: Partial<Record<Family, number>> = {};
  for (const o of ns.own) {
    for (const p of o.posts) {
      const f = inMonth(p, now) ? ns.labels[`${o.platform}:${p.id}`]?.family : undefined;
      if (f) out[f] = (out[f] ?? 0) + 1;
    }
  }
  return out;
}

/** The month over every play: each play counts up to its target, so a surplus in one never hides a gap in another. */
export function progressOf(plays: Play[], counts: Partial<Record<Family, number>>): { done: number; target: number } {
  return plays.reduce((t, p) => ({ done: t.done + Math.min(counts[p.id] ?? 0, p.target), target: t.target + p.target }), { done: 0, target: 0 });
}

/** What to make next: the best play still short of its target. */
export const nextUp = (plays: Play[], counts: Partial<Record<Family, number>>) => plays.find((p) => (counts[p.id] ?? 0) < p.target) ?? null;

// ---- When to build ---------------------------------------------------------------------------------------------------

/**
 * A build is due once 2 or more references are read and nothing is reading or finding: the first time, a week on, when
 * more references were read since, when the brand's own posts wait for labels, or when a play has no recipe. A build
 * tried in the last hour, done or not, waits.
 */
export function buildDue(ns: SocialNs, o: { read: number; ownUnlabelled: number; busy: boolean }, now = Date.now()): boolean {
  if (o.busy || o.read < PLAY_MIN_ACCOUNTS) return false;
  if (ns.triedAt && now - Date.parse(ns.triedAt) < HOUR) return false;
  if (!ns.builtAt || !(now - Date.parse(ns.builtAt) < WEEK)) return true;
  return o.read > ns.basis || o.ownUnlabelled > 0 || ns.plays.some((p) => !p.recipe);
}

/** The brand's first Apps like yours find starts here too, by the same rule as on /swipe, when uses are left. */
export const findFirst = (s: SimilarState, canFind: boolean) => canFind && autoFindDue(s);

// ---- The job, outside React -------------------------------------------------------------------------------------------

type PlaysAnswer = { labels?: Record<string, unknown>; recipes?: Partial<Record<Family, Recipe>>; note?: string };
let starting = false;
let building = false;
let readingOwn = false;
let note: { text: string; error: boolean } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const watching = new Set<string>();

/** The synced lists are being pulled before anything starts: the page says so rather than show an empty plan. */
export const isStarting = () => starting;
export const isBuilding = () => building;
export const isReadingOwn = () => readingOwn;
/** The last build's or own read's line: the server's note, or why it failed. */
export const lastNote = () => note;
export function onSocialNs(fn: () => void): () => void {
  listeners.add(fn);
  const off = onSimilar(fn);
  return () => {
    listeners.delete(fn);
    off();
  };
}

function putOwn(userId: string, o: OwnAccount): void {
  const live = new Set(auditedHandles(loadSocialAccounts(userId)).map(accountKey));
  const ns = loadSocialNs(userId);
  saveSocialNs(userId, { ...ns, own: [o, ...ns.own.filter((x) => accountKey(x) !== accountKey(o) && live.has(accountKey(x)))] });
}

/** The brand's own Instagram and TikTok, each read once a week: 30 posts the first time, the newest 10 after, 30 days kept. */
export async function readOwn(userId: string): Promise<void> {
  if (readingOwn) return;
  readingOwn = true;
  emit();
  try {
    for (const h of auditedHandles(loadSocialAccounts(userId))) {
      const now = Date.now();
      const prev = loadSocialNs(userId).own.find((o) => accountKey(o) === accountKey(h));
      if (prev?.checkedAt && now - Date.parse(prev.checkedAt) < WEEK) continue;
      try {
        const r = await callFn<TrackResult & { checkedAt: string }>(
          "competitors", { mode: "posts", platform: h.platform, handle: h.handle, scope: "similar", limit: prev?.checkedAt ? SIMILAR_REFRESH : POSTS_KEPT }, OWN_FAILED,
        );
        const posts = mergePosts(prev?.posts ?? [], r.posts).filter((p) => inMonth(p, now));
        rememberMedia(userId, accountKey(h), r.posts, posts.map((p) => p.id));
        putOwn(userId, { ...h, checkedAt: r.checkedAt, posts: posts.map(trim) });
      } catch (e) {
        const err = e instanceof EdgeError ? e : new EdgeError(OWN_FAILED, 0);
        // a private or missing account was billed and won't change by tomorrow: it waits a week like a read
        if (err.status === 422) putOwn(userId, { ...h, checkedAt: new Date(now).toISOString(), error: err.message, posts: prev?.posts ?? [] });
        note = { text: err.message, error: true };
        if ([403, 429, 503].includes(err.status)) break;
      }
    }
  } finally {
    readingOwn = false;
    emit();
  }
}

const wire = ({ name: _n, post: _p, ...p }: PlayPost & Partial<Pick<RefPost, "name" | "post">>): PlayPost => p;

/** One build: label what is new, group, and keep the labels and plays; a refusal or failure leaves the last plays. */
export async function runBuild(userId: string): Promise<void> {
  if (building) return;
  building = true;
  note = null;
  emit();
  try {
    const now = Date.now();
    const sim = loadSimilar(userId);
    const media = loadMedia(userId);
    const ns = loadSocialNs(userId);
    const refs = topRefs(sim, media, ns.labels, now);
    const own = ownPosts(ns, media, now);
    saveSocialNs(userId, { ...ns, triedAt: new Date(now).toISOString() });
    const r = await callFn<PlaysAnswer>("social-plays", { posts: refs.map(wire), own: own.map(wire) }, BUILD_FAILED);
    const keep = new Set([...refs, ...own].map((p) => p.key));
    const fresh = loadSocialNs(userId);
    const sent = Object.fromEntries([...refs, ...own].flatMap((p) => (p.label ? [[p.key, p.label]] : [])));
    const got = Object.fromEntries(Object.entries(r.labels ?? {}).flatMap(([k, l]) => (keep.has(k) && cleanLabel(l) ? [[k, cleanLabel(l)!]] : [])));
    const labels: Record<string, PostLabel> = { ...sent, ...got };
    saveSocialNs(userId, {
      ...fresh, labels, plays: buildPlays(refs, labels, r.recipes ?? {}, weeksOf(sim), fresh.plays), builtAt: new Date().toISOString(), basis: readCount(sim),
    });
    note = r.note ? { text: r.note, error: false } : null;
  } catch (e) {
    note = { text: (e instanceof EdgeError ? e : new EdgeError(BUILD_FAILED, 0)).message, error: true };
  } finally {
    building = false;
    emit();
  }
}

/** A build, when one is due (buildDue); the job calls it whenever the Apps like yours jobs move. */
export function maybeBuild(userId: string): Promise<void> | undefined {
  const ns = loadSocialNs(userId);
  const ownUnlabelled = ownPosts(ns, {}).filter((p) => !p.label).length;
  const busy = building || readingOwn || similarBusy();
  return buildDue(ns, { read: readCount(loadSimilar(userId)), ownUnlabelled, busy }) ? runBuild(userId) : undefined;
}

/**
 * Opening the page: the brand's synced lists first, then its first Apps like yours find when due and allowed, else
 * the weekly reads of its references; then its own accounts, then a build when one is due. From then on a build is
 * checked each time those jobs move, so it lands when the reads end whether the page is open or not.
 */
export async function startSocialNs(userId: string, canFind: boolean): Promise<void> {
  starting = true;
  emit();
  try {
    await refreshCloudKeys([similarKey(userId), socialNsKey(userId)]);
    if (!watching.has(userId)) {
      watching.add(userId);
      onSimilar(() => void maybeBuild(userId));
    }
    // both mark themselves busy before their first await, so the page goes from starting straight to their line
    if (findFirst(loadSimilar(userId), canFind)) void runFind(userId);
    else void runDueSimilar(userId);
  } finally {
    starting = false;
    emit();
  }
  await readOwn(userId);
  await maybeBuild(userId);
}
