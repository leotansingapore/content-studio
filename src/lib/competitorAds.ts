// Their ads (/competitors, Leo only; docs/north-star/items/find-competitor-ads.md): each competitor's Meta ads, read
// by the competitors edge function (mode "ads") and kept per brand in one synced key written whole. Checks run outside
// React, one at a time: opening the view checks whatever is 7+ days old (phase2-build-brief.md decision 8), and
// leaving the page keeps a check going. The job plumbing below is shared with Their posts (competitorPosts.ts).

import { callFn, EdgeError } from "@/lib/edgeFn";
import type { AdLike } from "@/lib/adsSwipe";
import { type Competitor, loadCompetitors, NOT_SWITCHED_ON, updateCompetitor } from "@/lib/competitors";
import { scoped } from "@/lib/profiles";
import type { CompetitorAd } from "../../supabase/functions/competitors/logic.ts";

export type { CompetitorAd };

export interface CompetitorAdsEntry {
  checkedAt: string;
  pageId: string | null;
  pageName: string | null;
  /** 30 at most, running first, then the longest running. */
  ads: CompetitorAd[];
  /** Ad ids from earlier checks, 300 at most. */
  seen: string[];
  /** Ids new on the latest check. */
  fresh: string[];
  /** The country the latest check covered: "ALL" when a Singapore check found no ad in any country. Missing on old checks. */
  country?: "SG" | "ALL";
  /** The check read every ad Meta lists there (fewer came back than it asked for). Missing on old checks: not known. */
  complete?: boolean;
}
/** Keyed by Competitor.id. */
export type CompetitorAdsState = Record<string, CompetitorAdsEntry>;

const KEY = "content-studio-competitor-ads-";
const CHANGED = "content-studio-competitor-ads-changed";
export const competitorAdsKey = (userId: string) => KEY + scoped(userId);
export const WEEK = 7 * 86_400_000;
const DAY = 86_400_000;

export const ADS_FAILED = "Couldn't read Meta's ad library right now. Try again in a few minutes.";

export function loadCompetitorAds(userId: string): CompetitorAdsState {
  try {
    const v = JSON.parse(localStorage.getItem(competitorAdsKey(userId)) ?? "null");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v as Record<string, CompetitorAdsEntry>).filter(([, e]) => e && Array.isArray(e.ads) && typeof e.checkedAt === "string"));
  } catch {
    return {};
  }
}

/**
 * Writes the whole state, minus entries for competitors that are gone or have no Facebook page any more. When
 * storage is full it keeps the newest 20 ads per competitor, then gives up (the screen keeps what it shows).
 */
export function saveCompetitorAds(userId: string, s: CompetitorAdsState): CompetitorAdsState {
  const live = new Set(loadCompetitors(userId).list.filter(canReadAds).map((c) => c.id));
  const kept = Object.fromEntries(Object.entries(s).filter(([id]) => live.has(id)));
  const trimmed = Object.fromEntries(Object.entries(kept).map(([id, e]) => [id, { ...e, ads: e.ads.slice(0, 20) }]));
  let saved = kept;
  for (const t of [kept, trimmed]) {
    try {
      localStorage.setItem(competitorAdsKey(userId), JSON.stringify(t));
      saved = t;
      break;
    } catch {
      // storage full: the smaller try
    }
  }
  globalThis.dispatchEvent?.(new Event(CHANGED));
  return saved;
}

export function onCompetitorAdsChanged(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
}

/** A competitor whose ads can be read: an Ad Library page id or a Facebook page handle. */
export const canReadAds = (c: Pick<Competitor, "fbPageId" | "handles">) => Boolean(c.fbPageId || c.handles.facebook);

export interface AdsAnswer {
  competitorId: string; pageId: string | null; pageName: string | null; ads: CompetitorAd[]; checkedAt: string; country?: "SG" | "ALL"; complete?: boolean;
}

/**
 * A check folded into the entry: the first check marks nothing new, later ones mark ids not seen before that started
 * since the last check (a day's slack for time zones). The read takes the most-shown 30, so an older ad read for the
 * first time is not new.
 */
export function applyAdsCheck(prev: CompetitorAdsEntry | undefined, r: AdsAnswer): CompetitorAdsEntry {
  const since = prev ? new Date((Date.parse(prev.checkedAt) || 0) - DAY).toISOString().slice(0, 10) : "";
  return {
    checkedAt: r.checkedAt,
    pageId: r.pageId,
    pageName: r.pageName,
    ads: r.ads,
    seen: [...new Set([...r.ads.map((a) => a.id), ...(prev?.seen ?? [])])].slice(0, 300),
    fresh: prev ? r.ads.filter((a) => !prev.seen.includes(a.id) && (!a.start || a.start >= since)).map((a) => a.id) : [],
    ...(r.country === "SG" || r.country === "ALL" ? { country: r.country } : {}),
    complete: r.complete === true,
  };
}

/** Where a competitor's stored ads come from: the check's own country, else (an old check) the row's setting. */
export const adsCountryOf = (c: Pick<Competitor, "adsCountry">, e: CompetitorAdsEntry | undefined) => e?.country ?? c.adsCountry;

/** Due: never checked, last checked 7+ days ago, or its Facebook page changed since. */
export function adsDue(c: Pick<Competitor, "fbPageId">, e: CompetitorAdsEntry | undefined, now = Date.now()): boolean {
  if (!e) return true;
  const at = Date.parse(e.checkedAt);
  return !(now - at < WEEK) || (c.fbPageId !== null && c.fbPageId !== e.pageId);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "21 days running", "3 months running" (60 days and over), "2 years running" (365 and over), "Ran 12 days". */
export function runLabel(ad: Pick<CompetitorAd, "start" | "end" | "active">, now = Date.now()): string | null {
  if (!ad.start) return null;
  const start = Date.parse(ad.start);
  const end = ad.active || !ad.end ? now : Date.parse(ad.end) + DAY;
  const days = Math.max(1, Math.floor((end - start) / DAY));
  if (!ad.active) return `Ran ${plural(days, "day")}`;
  if (days >= 365) return `${plural(Math.floor(days / 365), "year")} running`;
  if (days >= 60) return `${plural(Math.floor(days / 30), "month")} running`;
  return `${plural(days, "day")} running`;
}

const PLATFORM_NAMES: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", messenger: "Messenger", threads: "Threads", whatsapp: "WhatsApp", audience_network: "Audience Network" };
export const platformNames = (ids: string[]) => ids.map((p) => PLATFORM_NAMES[p] ?? p).join(", ");

export const libraryUrl = (id: string) => `https://www.facebook.com/ads/library/?id=${id}`;

/** A competitor ad in the shape remixes take (fromAd, buildAdWriteUrl). */
export function toAdLike(ad: CompetitorAd, advertiser: string): AdLike {
  return {
    adId: ad.id, advertiser, format: ad.format, headline: ad.headline, body: ad.body, cta: ad.cta, link: ad.link, start: ad.start,
    platforms: ad.platforms, image: ad.image ?? "", libraryUrl: libraryUrl(ad.id), industry: null, hookFamily: ad.hookFamily ?? null,
  };
}

// ---- Checks, outside React (shared with Their posts) ---------------------------------------------------------------

/** Refusals that stop a round of due checks: not switched on, a spent cap, or the counter unreadable. */
const STOP = [403, 429, 503];

/** One feed's checks: one per target at a time, failures kept for the screen, and the weekly round. */
export function checkJobs(kind: "ads" | "posts") {
  const running = new Set<string>();
  const failures = new Map<string, EdgeError>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  let stopped: EdgeError | null = null;
  let round = false;
  let again = false;

  // Device hint: when the weekly round last tried each target, so a failed or empty read isn't paid for again on
  // every visit ("never twice in 7 days", decision 8). Check now ignores it.
  const triedKey = (userId: string) => `cs-competitor-tried-${kind}-${scoped(userId)}`;
  const loadTried = (userId: string): Record<string, string> => {
    try {
      const v = JSON.parse(localStorage.getItem(triedKey(userId)) ?? "{}");
      return v && typeof v === "object" ? v : {};
    } catch {
      return {};
    }
  };
  const setTried = (userId: string, target: string, at: string | null) => {
    const now = Date.now();
    const next = Object.fromEntries(Object.entries(loadTried(userId)).filter(([k, t]) => k !== target && now - Date.parse(t) < WEEK));
    if (at) next[target] = at;
    try {
      localStorage.setItem(triedKey(userId), JSON.stringify(next));
    } catch {
      // a device hint only
    }
  };

  return {
    isRunning: (k: string) => running.has(k),
    anyRunning: () => running.size > 0,
    failure: (k: string) => failures.get(k),
    /** The refusal that ended the last round (403, a spent cap), until a check goes through. */
    stopped: () => stopped,
    on(fn: () => void): () => void {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    /** One check of target `k`; false when the server refused in a way that should stop a round. */
    async run(k: string, check: () => Promise<void>, fallback: string): Promise<boolean> {
      if (running.has(k)) return true;
      running.add(k);
      failures.delete(k);
      emit();
      try {
        await check();
        stopped = null;
        return true;
      } catch (e) {
        const err = e instanceof EdgeError ? e : new EdgeError(fallback, 0);
        if (err.status === 403) err.message = NOT_SWITCHED_ON;
        failures.set(k, err);
        if (STOP.includes(err.status)) stopped = err;
        return !STOP.includes(err.status);
      } finally {
        running.delete(k);
        emit();
      }
    },
    /**
     * Checks each due target one at a time and stops at a refusal. `manual` (Check now under All) skips the 7-day
     * tried guard. A call while a round runs makes it read the list again when it ends, so a competitor added
     * meanwhile is checked too.
     */
    async round(userId: string, due: () => { target: string; go: () => Promise<boolean> }[], manual = false): Promise<void> {
      if (round) {
        again = true;
        return;
      }
      round = true;
      try {
        do {
          again = false;
          const tried = manual ? {} : loadTried(userId);
          for (const t of due()) {
            if (tried[t.target] && Date.now() - Date.parse(tried[t.target]) < WEEK) continue;
            setTried(userId, t.target, new Date().toISOString());
            if (!(await t.go())) {
              setTried(userId, t.target, null); // nothing was spent: try again next visit
              return;
            }
          }
          manual = false;
        } while (again);
      } finally {
        round = false;
        again = false;
      }
    },
  };
}

const jobs = checkJobs("ads");
export const isCheckingAds = (id: string) => jobs.isRunning(id);
export const checkingAnyAds = () => jobs.anyRunning();
export const adsCheckFailure = (id: string) => jobs.failure(id);
export const adsStopped = () => jobs.stopped();
export const onCompetitorAds = (fn: () => void) => jobs.on(fn);

/** One competitor's ads now (Check now, Look anywhere, or the weekly round); its page id is written back onto it. */
export function runAdsCheck(userId: string, c: Competitor): Promise<boolean> {
  return jobs.run(c.id, async () => {
    const r = await callFn<AdsAnswer>("competitors", {
      mode: "ads", competitorId: c.id, name: c.name, fbPageId: c.fbPageId, facebook: c.handles.facebook ?? null, country: c.adsCountry,
    }, ADS_FAILED);
    // read again: the list may have changed while the check ran
    const state = loadCompetitorAds(userId);
    saveCompetitorAds(userId, { ...state, [c.id]: applyAdsCheck(state[c.id], r) });
    if (r.pageId && r.pageId !== c.fbPageId) updateCompetitor(userId, c.id, { fbPageId: r.pageId });
  }, ADS_FAILED);
}

/** The competitors a round would check now. */
export function dueAds(userId: string, now = Date.now()): Competitor[] {
  const state = loadCompetitorAds(userId);
  return loadCompetitors(userId).list.filter((c) => canReadAds(c) && adsDue(c, state[c.id], now));
}

/** Opening Their ads: every due competitor, one at a time (manual: Check now under All). */
export function runDueAds(userId: string, manual = false): Promise<void> {
  return jobs.round(userId, () => dueAds(userId).map((c) => ({
    // the target names the page and country, so a new page or "Look anywhere" is never held back by an old try
    target: `${c.id}:${c.fbPageId ?? c.handles.facebook}:${c.adsCountry}`,
    go: () => runAdsCheck(userId, loadCompetitors(userId).list.find((x) => x.id === c.id) ?? c),
  })), manual);
}

// ---- What the view counts --------------------------------------------------------------------------------------

export interface AdsTally { id: string; name: string; n: number; running: number }

/** Per competitor with stored ads, most ads first: the pills and the sub line. */
export function adsTally(list: Competitor[], state: CompetitorAdsState): AdsTally[] {
  return list
    .map((c) => ({ id: c.id, name: c.name, ads: (canReadAds(c) && state[c.id]?.ads) || [] }))
    .filter((t) => t.ads.length > 0)
    .map((t) => ({ id: t.id, name: t.name, n: t.ads.length, running: t.ads.filter((a) => a.active).length }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

/** "What A and B are running", "What A, B and 2 more are running"; "" with nobody. */
export function runningLine(names: string[]): string {
  if (!names.length) return "";
  if (names.length === 1) return `What ${names[0]} is running`;
  if (names.length === 2) return `What ${names[0]} and ${names[1]} are running`;
  return `What ${names[0]}, ${names[1]} and ${names.length - 2} more are running`;
}
