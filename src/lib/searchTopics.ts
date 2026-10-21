// What people search for, and the finance hashtags on TikTok: Leo's two views on /trends
// (docs/north-star/items/find-search-topics.md). Searches keep the brand's topics and its last 8 checks in one synced
// key per brand, content-studio-searches-<scoped uid>; a check runs on the market function ("searches") in a job
// outside React, like runMarketCheck, so leaving the page keeps it going. Hashtags read src/data/hashtagStats.json,
// which the morning trend scout writes, and call nothing.

import hashtagData from "@/data/hashtagStats.json";
import { brandFacts } from "@/lib/competitors";
import { callFn, EdgeError } from "@/lib/edgeFn";
import { links } from "@/lib/links";
import { loadMarket } from "@/lib/market";
import { loadPositioning } from "@/lib/positioning";
import { activeProfileId, scoped } from "@/lib/profiles";
import { dayWords, MAX_SEEDS, type SearchTopic, type SearchTrend, type SearchVideo } from "../../supabase/functions/market/logic.ts";

export type { SearchTopic };
export { MAX_SEEDS };

export interface SearchCheck {
  checkedAt: string;
  topics: SearchTopic[];
  /** false when Jev answered for no keyword, so nothing was filtered for fit. */
  filtered: boolean;
}
export interface SearchesState {
  seeds: string[];
  /** The newest 8, oldest first. */
  checks: SearchCheck[];
}
export type Show = "all" | "rising" | "gap";

export const MAX_CHECKS = 8;
const KEY = "content-studio-searches-";
const CHANGED = "content-studio-searches-changed";
const DAY = 86_400_000;
export const searchesKey = (userId: string) => KEY + scoped(userId);

export const FAILED = "Couldn't read searches just now. Nothing was used up. Try again.";
export const NOT_ON = "Searches aren't switched on yet.";

type Raw = Record<string, unknown>;
const obj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const TRENDS: SearchTrend[] = ["rising", "falling", "steady", "new"];

function cleanTopic(raw: unknown): SearchTopic | null {
  if (!obj(raw)) return null;
  const { keyword, slug, seed } = raw;
  const volume = num(raw.volume);
  const series = Array.isArray(raw.series) && raw.series.length === 12 && raw.series.every((v) => num(v) !== null) ? (raw.series as number[]) : null;
  const trend = TRENDS.find((t) => t === raw.trend);
  if (typeof keyword !== "string" || !keyword.trim() || typeof slug !== "string" || !/^[\p{L}\p{N}-]{1,80}$/u.test(slug)) return null;
  if (typeof seed !== "string" || volume === null || !series || !trend) return null;
  const videos: SearchVideo[] = (Array.isArray(raw.videos) ? raw.videos : [])
    .filter(obj)
    .filter((v) => typeof v.title === "string" && typeof v.url === "string" && v.url.startsWith("https://www.youtube.com/"))
    .slice(0, 3)
    .map((v) => ({ title: (v.title as string).slice(0, 140), url: v.url as string }));
  return {
    keyword: keyword.slice(0, 80),
    slug,
    seed: seed.slice(0, 60),
    volume,
    series,
    lastMonth: typeof raw.lastMonth === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw.lastMonth) ? raw.lastMonth : null,
    change: num(raw.change),
    trend,
    recentVideos: num(raw.recentVideos),
    gap: raw.gap === true,
    videos,
  };
}

/** A check as synced, rebuilt field by field (cleanDigest's rule): a bad date drops it, and a bad topic drops that topic. */
export function cleanCheck(raw: unknown): SearchCheck | null {
  if (!obj(raw) || typeof raw.checkedAt !== "string" || !Number.isFinite(Date.parse(raw.checkedAt)) || !Array.isArray(raw.topics)) return null;
  return {
    checkedAt: raw.checkedAt,
    topics: raw.topics.map(cleanTopic).filter((t): t is SearchTopic => t !== null).slice(0, 30),
    filtered: raw.filtered !== false,
  };
}

const cleanSeeds = (v: unknown) => {
  const out: string[] = [];
  for (const s of Array.isArray(v) ? v : []) {
    const t = typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    if (t.length >= 2 && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.slice(0, MAX_SEEDS);
};

export function loadSearches(userId: string): SearchesState {
  try {
    const v = JSON.parse(localStorage.getItem(searchesKey(userId)) ?? "null");
    if (!obj(v)) return { seeds: [], checks: [] };
    return {
      seeds: cleanSeeds(v.seeds),
      checks: (Array.isArray(v.checks) ? v.checks : []).map(cleanCheck).filter((c): c is SearchCheck => c !== null).slice(-MAX_CHECKS),
    };
  } catch {
    return { seeds: [], checks: [] };
  }
}

/** Writes the topics and the newest 8 checks; when storage is full, keeps fewer checks rather than none of it. */
export function saveSearches(userId: string, s: SearchesState): SearchesState {
  const seeds = cleanSeeds(s.seeds);
  let saved: SearchesState = { seeds, checks: s.checks.slice(-MAX_CHECKS) };
  for (const n of [MAX_CHECKS, 3, 1, 0]) {
    try {
      saved = { seeds, checks: n ? s.checks.slice(-n) : [] };
      localStorage.setItem(searchesKey(userId), JSON.stringify(saved));
      break;
    } catch {
      // storage full: the next, shorter list
    }
  }
  globalThis.dispatchEvent?.(new Event(CHANGED));
  return saved;
}

/** Calls `cb` whenever the topics or a check are saved on this device (the page, or a check finishing outside React). */
export function onSearchesChanged(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
}

export const saveSeeds = (userId: string, seeds: string[]) => saveSearches(userId, { ...loadSearches(userId), seeds });

/** The brand's topics: its own list, else Your market's topics, else the Plan positioning's. */
export function defaultSeeds(userId: string): string[] {
  const own = loadSearches(userId).seeds;
  if (own.length) return own;
  const market = loadMarket(userId).topics;
  return cleanSeeds(market.length ? market : loadPositioning(userId)?.topics ?? []);
}

export const latestCheck = (s: SearchesState): SearchCheck | null => s.checks[s.checks.length - 1] ?? null;

/** The UTC day the next check opens (7 days after the latest one's), or null when one can run now. The server decides. */
export function nextCheckDay(s: SearchesState, now = new Date()): string | null {
  const last = latestCheck(s)?.checkedAt;
  if (!last) return null;
  const opens = Date.parse(`${last.slice(0, 10)}T00:00:00Z`) + 7 * DAY;
  return now.getTime() >= opens ? null : new Date(opens).toISOString().slice(0, 10);
}

/** Under the list: "Checked Mon 20 Oct. Next check from Mon 27 Oct.", just "Checked ..." once that day has come; "" before any. */
export function checkedLine(s: SearchesState, now = new Date()): string {
  const day = latestCheck(s)?.checkedAt.slice(0, 10);
  if (!day) return "";
  const next = nextCheckDay(s, now);
  return `Checked ${dayWords(day)}.${next ? ` Next check from ${dayWords(next)}.` : ""}`;
}

/** The rows a filter shows, most searched first. Rising takes New too: searches from nothing is the steepest rise. */
export function showTopics(topics: SearchTopic[], show: Show): SearchTopic[] {
  return topics
    .filter((t) => show === "all" || (show === "gap" ? t.gap : t.trend === "rising" || t.trend === "new"))
    .sort((a, b) => b.volume - a.volume);
}

export const changeLabel = (t: Pick<SearchTopic, "change" | "trend">): string =>
  t.change === null ? "New"
  : t.trend === "rising" ? `Up ${t.change}% in 3 months`
  : t.trend === "falling" ? `Down ${Math.abs(t.change)}% in 3 months`
  : "Steady";

const count = (n: number) => n.toLocaleString("en-SG");
const MAS_RULES = "No product names, no promised returns, and no numbers other than the ones given here.";

/** Write, briefed with the search and its numbers (idea=real-question). */
export function searchWriteUrl(t: SearchTopic): string {
  const how = t.change === null ? "new in the last 3 months" : changeLabel(t).toLowerCase();
  return links.generate({
    pillar: "topic",
    detail: t.keyword,
    idea: "real-question",
    ctx: `People in Singapore search "${t.keyword}" about ${count(t.volume)} times a month (${how}). Write a post that answers what they want to know, in general terms. ${MAS_RULES}`,
  });
}

/** Related topics: the other keywords found from the same seed in the same check. */
export const relatedTopics = (check: SearchCheck, t: SearchTopic, max = 8) =>
  check.topics.filter((o) => o.seed === t.seed && o.slug !== t.slug).slice(0, max);

// ---- Hashtags ------------------------------------------------------------------------------------------------------

export interface HashtagDay { day: string; videos: number; medianViews: number }
export interface HashtagStats {
  updated: string | null;
  tags: Record<string, { history: HashtagDay[]; related: { tag: string; overlap: number }[]; finance: boolean | null }>;
}
export interface HashtagRow {
  tag: string;
  /** Oldest first. */
  history: HashtagDay[];
  latest: HashtagDay;
  related: { tag: string; overlap: number }[];
  /** Videos over the last 7 days against the 7 before, in percent; null without a week before. */
  weekChange: number | null;
}

const BUNDLED = hashtagData as unknown as HashtagStats;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The newest day in the file, or null before the scout has written one. */
export function newestDay(data: HashtagStats = BUNDLED): string | null {
  const days = Object.values(data?.tags ?? {}).flatMap((t) => (Array.isArray(t?.history) ? t.history.map((h) => h?.day) : [])).filter((d) => typeof d === "string" && DAY_RE.test(d));
  return days.length ? days.sort()[days.length - 1] : null;
}

/** "Last read Thu 16 Oct." when the newest day is more than 2 days old, so a stopped scout shows; else "". */
export function staleLine(data: HashtagStats = BUNDLED, now = new Date()): string {
  const day = newestDay(data);
  if (!day) return "";
  // in whole UTC days, the scout's dates: read on the 20th is 2 days old all through the 22nd
  return Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`) > 2 * DAY ? `Last read ${dayWords(day)}.` : "";
}

function weekChange(history: HashtagDay[], newest: string): number | null {
  const age = (d: string) => (Date.parse(`${newest}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / DAY;
  const sum = (from: number, to: number) => history.filter((h) => age(h.day) >= from && age(h.day) < to).reduce((s, h) => s + h.videos, 0);
  const before = sum(7, 14);
  return before === 0 ? null : Math.round(((sum(0, 7) - before) / before) * 100);
}

/** Tags in the newest read that the scout didn't rule out as not finance, most videos first. */
export function hashtagRows(data: HashtagStats = BUNDLED): HashtagRow[] {
  const newest = newestDay(data);
  if (!newest) return [];
  return Object.entries(data.tags ?? {})
    .filter(([, t]) => t?.finance !== false && Array.isArray(t?.history))
    .map(([tag, t]) => {
      const history = t.history.filter((h) => DAY_RE.test(h?.day) && num(h.videos) !== null && num(h.medianViews) !== null).sort((a, b) => a.day.localeCompare(b.day));
      return { tag, history, latest: history[history.length - 1], related: (t.related ?? []).filter((r) => typeof r?.tag === "string" && num(r.overlap) !== null), weekChange: weekChange(history, newest) };
    })
    .filter((r) => r.latest?.day === newest)
    .sort((a, b) => b.latest.videos - a.latest.videos || b.latest.medianViews - a.latest.medianViews || a.tag.localeCompare(b.tag));
}

export const weekLabel = (r: HashtagRow): string =>
  r.weekChange === null || Math.abs(r.weekChange) < 20 ? "" : r.weekChange > 0 ? `Up ${r.weekChange}% this week` : `Down ${Math.abs(r.weekChange)}% this week`;

/** Write, briefed for a TikTok on the tag and the tags it travels with. */
export function hashtagWriteUrl(r: Pick<HashtagRow, "tag" | "related">): string {
  const often = r.related.slice(0, 3).map((x) => `#${x.tag}`);
  return links.generate({
    pillar: "topic",
    detail: `#${r.tag}`,
    platform: "tiktok",
    format: "short-video",
    ctx: `Finance videos on TikTok tagged #${r.tag}${often.length ? ` often also carry ${often.join(", ")}` : ""}. Write a short video for the people I serve on what they look for under #${r.tag}, in general terms. ${MAS_RULES}`,
  });
}

// ---- Which view /trends shows ---------------------------------------------------------------------------------------

export type TrendView = "kits" | "search" | "hashtags" | "formats";
const LEO_VIEWS: readonly string[] = ["search", "hashtags", "formats"];

/**
 * ?view= as the page shows it: Leo's views for Leo only, everyone else keeps the kits, and "loading" while the sign-in
 * is still being read, so a link to a Leo view never flashes the kits first.
 */
export function trendView(param: string | null, leo: object | null | undefined): TrendView | "loading" {
  if (!param || !LEO_VIEWS.includes(param)) return "kits";
  if (leo === undefined) return "loading";
  return leo ? (param as TrendView) : "kits";
}

// ---- The check, outside React ---------------------------------------------------------------------------------------

export interface SearchJob {
  state: "running" | "done" | "failed";
  startedAt: number;
  /** How many topics it reads. */
  seeds: number;
  error?: string;
  code?: string;
}

let job: SearchJob | null = null;
const listeners = new Set<(j: SearchJob | null) => void>();
const emit = () => listeners.forEach((fn) => fn(job));

export const searchJob = () => job;
export function onSearchJob(fn: (j: SearchJob | null) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** One paid check of the brand's saved topics (one use, one a week per brand). */
export async function runSearchCheck(userId: string): Promise<void> {
  if (job?.state === "running") return;
  const startedAt = Date.now();
  const seeds = loadSearches(userId).seeds;
  job = { state: "running", startedAt, seeds: seeds.length };
  emit();
  try {
    const { serves, sells } = brandFacts(userId);
    const r = await callFn<unknown>("market", { action: "searches", profile: activeProfileId(userId), seeds, serves, sells }, FAILED);
    const check = cleanCheck(r);
    if (!check) throw new EdgeError(FAILED, 502, "failed");
    const latest = loadSearches(userId); // read again: the topics may have changed while it ran
    saveSearches(userId, { ...latest, checks: [...latest.checks, check] });
    job = { state: "done", startedAt, seeds: seeds.length };
  } catch (e) {
    const err = e instanceof EdgeError ? e : null;
    const off = err?.status === 403 || err?.status === 404;
    job = { state: "failed", startedAt, seeds: seeds.length, error: off ? NOT_ON : err?.message || FAILED, code: off ? "not_enabled" : err?.code ?? "" };
  }
  emit();
}
