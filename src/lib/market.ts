// Your market (Discover > Your market): the adviser's set-up, each check's digest, and what they dismissed or wrote
// from, in one synced key per profile: content-studio-market-${scoped(userId)}. Keywords stay in Mentions' list and
// competitors in Following, so each page keeps one source of truth. The check runs outside React, like Following's,
// so leaving the page doesn't lose it. Design: docs/superpowers/specs/2026-10-15-market-watch-design.md.

import { callFn, EdgeError } from "@/lib/edgeFn";
import { storyWriteUrl } from "@/lib/feeds";
import { loadFollowing, type FollowedAccount } from "@/lib/following";
import { loadWatch } from "@/lib/mentions";
import { scoped } from "@/lib/profiles";
import { dayWords, type GeoRead, type JudgedNews, type JudgedPost, type MarketDigest, type MarketPost, type Position } from "../../supabase/functions/market/logic.ts";

export type { GeoRead, JudgedNews, JudgedPost, MarketDigest, Position };

export interface MarketState {
  name: string;
  site: string;
  audience: string;
  topics: string[];
  questions: string[];
  /** The latest 12 checks, oldest first. */
  checks: MarketDigest[];
  /** Item keys the adviser dismissed: never shown again. */
  dismissed: string[];
  /** Item keys they opened Write from. */
  written: string[];
}
export type Show = "act" | "all";

export const EMPTY_MARKET: MarketState = { name: "", site: "", audience: "", topics: [], questions: [], checks: [], dismissed: [], written: [] };
export const POSITION_LABEL: Record<Position, string> = {
  "not-mentioned": "Not in the answer",
  passing: "Mentioned in passing",
  named: "Named in the answer",
  cited: "Your site is a source",
};

const KEY = "content-studio-market-";
const SHOWN = "cs-market-shown";
const RECHECK_MS = 6 * 3_600_000;
const DAY_MS = 86_400_000;

const str = (v: unknown) => (typeof v === "string" ? v : "");
const strings = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(-max) : []);
type Raw = Record<string, unknown>;
const obj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const strs = (o: Raw, ...keys: string[]) => keys.every((k) => typeof o[k] === "string");
const tagOf = (v: unknown) => (v === "act" ? "act" : "watch") as JudgedNews["tag"];
const POSITIONS: Position[] = ["not-mentioned", "passing", "named", "cited"];

/**
 * A check as synced, rebuilt field by field: a check whose date doesn't read is dropped, and so is any item missing
 * what the page renders, so an older or newer app's digest can never crash the page (it syncs to every device).
 */
function cleanDigest(c: unknown): MarketDigest | null {
  if (!obj(c) || typeof c.checkedAt !== "string" || !Number.isFinite(Date.parse(c.checkedAt))) return null;
  const list = (v: unknown) => (Array.isArray(v) ? v.filter(obj) : []);
  return {
    checkedAt: c.checkedAt,
    news: list(c.news).filter((x) => strs(x, "url", "title", "keyword", "source")).map((x) => ({
      keyword: x.keyword as string, title: x.title as string, url: x.url as string, source: x.source as string, date: str(x.date), snippet: str(x.snippet),
      relevant: typeof x.relevant === "boolean" ? x.relevant : null, tag: tagOf(x.tag), ...(typeof x.sameAs === "string" ? { sameAs: x.sameAs } : {}),
      ...(typeof x.actScore === "number" && Number.isFinite(x.actScore) ? { actScore: x.actScore } : {}),
    })),
    geo: list(c.geo).filter((x) => strs(x, "question") && Array.isArray(x.sources)).map((x) => ({
      question: x.question as string,
      position: POSITIONS.includes(x.position as Position) ? (x.position as Position) : null,
      sources: (x.sources as unknown[]).filter(obj).filter((o) => strs(o, "url", "domain")).map((o) => ({ url: o.url as string, domain: o.domain as string, title: str(o.title) })),
      ...(Array.isArray(x.named) ? { named: x.named.filter((t): t is string => typeof t === "string") } : {}),
      checkUrl: typeof x.checkUrl === "string" ? x.checkUrl : null,
      ...(typeof x.error === "string" ? { error: x.error } : {}),
    })),
    posts: list(c.posts).filter((x) => strs(x, "id", "url", "handle", "caption")).map((x) => ({
      id: x.id as string, url: x.url as string, handle: x.handle as string, caption: x.caption as string, tag: tagOf(x.tag),
    })),
  };
}

export function loadMarket(userId: string): MarketState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY + scoped(userId)) ?? "null");
    if (!v || typeof v !== "object") return { ...EMPTY_MARKET };
    return {
      name: str(v.name),
      site: str(v.site),
      audience: str(v.audience),
      topics: strings(v.topics, 12),
      questions: strings(v.questions, 5),
      checks: (Array.isArray(v.checks) ? v.checks : []).map(cleanDigest).filter((c): c is MarketDigest => c !== null).slice(-12),
      dismissed: strings(v.dismissed, 300),
      written: strings(v.written, 300),
    };
  } catch {
    return { ...EMPTY_MARKET };
  }
}

export function saveMarket(userId: string, s: MarketState): MarketState {
  const next = { ...s, checks: s.checks.slice(-12), dismissed: s.dismissed.slice(-300), written: s.written.slice(-300) };
  try {
    localStorage.setItem(KEY + scoped(userId), JSON.stringify(next));
  } catch {
    // full storage: the change still shows until the page reloads
  }
  return next;
}

export const newsKey = (x: JudgedNews) => `n:${x.url}`;
export const geoKey = (x: GeoRead) => `q:${x.question.toLowerCase()}`;
export const postKey = (x: JudgedPost) => `p:${x.id}`;
export const withKey = (list: string[], key: string, on: boolean) => (on ? [...new Set([...list, key])] : list.filter((k) => k !== key));

const counted = (d: MarketDigest, keyword: string) => d.news.filter((x) => x.keyword === keyword && x.relevant && !x.sameAs).length;

/** Keywords with at least 3 relevant stories in the latest check and at least twice their average over earlier checks. */
export function pickingUp(checks: MarketDigest[]): string[] {
  const latest = checks[checks.length - 1];
  const earlier = checks.slice(0, -1);
  if (!latest || !earlier.length) return [];
  return [...new Set(latest.news.map((x) => x.keyword))].filter((k) => {
    const now = counted(latest, k);
    const avg = earlier.reduce((s, c) => s + counted(c, k), 0) / Math.max(earlier.length, 1);
    return now >= 3 && now >= 2 * Math.max(avg, 1);
  });
}

const engagement = (x: FollowedAccount["posts"][number]) => x.likes + x.comments;

/** Posts that drew at least 1.5 times their account's average likes + comments, from accounts with 4 or more posts; best first. */
export function outperformers(accounts: FollowedAccount[], max = 10): MarketPost[] {
  return accounts
    .flatMap((a) => {
      if (a.posts.length < 4) return [];
      const avg = a.posts.reduce((s, x) => s + engagement(x), 0) / a.posts.length;
      if (avg <= 0) return [];
      return a.posts
        .filter((x) => engagement(x) >= 1.5 * avg && x.caption.trim())
        .map((x) => ({ ratio: engagement(x) / avg, post: { id: `${a.platform}:${x.id}`, url: x.url, handle: a.handle, caption: x.caption.slice(0, 400) } }));
    })
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, max)
    .map((r) => r.post);
}

export const visibleNews = (d: MarketDigest, s: MarketState, show: Show) =>
  d.news.filter((x) => x.relevant !== false && !x.sameAs && !s.dismissed.includes(newsKey(x)) && (show === "all" || x.tag === "act"));
export const alsoReported = (d: MarketDigest, x: JudgedNews) => d.news.filter((o) => o.sameAs === x.url);

/** Stories under their topic, in the order they came; topics picking up go first. */
export function newsByTopic(items: JudgedNews[], rising: string[]): { keyword: string; items: JudgedNews[] }[] {
  const groups = new Map<string, JudgedNews[]>();
  for (const x of items) groups.set(x.keyword, [...(groups.get(x.keyword) ?? []), x]);
  const all = [...groups].map(([keyword, list]) => ({ keyword, items: list }));
  return [...all.filter((t) => rising.includes(t.keyword)), ...all.filter((t) => !rising.includes(t.keyword))];
}

/**
 * Dismissing a client question hides this week's answer and stops asking it (each read is paid every week);
 * undo puts the question back where it was.
 */
export function dismissQuestion(s: MarketState, x: GeoRead, on: boolean, at = s.questions.length): MarketState {
  const key = geoKey(x);
  const rest = s.questions.filter((q) => q.toLowerCase() !== x.question.toLowerCase());
  const questions = on ? rest : [...rest.slice(0, at), x.question, ...rest.slice(at)].slice(0, 5);
  return { ...s, questions, dismissed: withKey(s.dismissed, key, on) };
}
export const visibleGeo = (d: MarketDigest, s: MarketState, show: Show) =>
  d.geo.filter((x) => !s.dismissed.includes(geoKey(x)) && (show === "all" || x.position === "not-mentioned" || x.position === "passing"));
export const visiblePosts = (d: MarketDigest, s: MarketState, show: Show) =>
  d.posts.filter((x) => !s.dismissed.includes(postKey(x)) && (show === "all" || x.tag === "act"));
export const actCount = (d: MarketDigest, s: MarketState) => visibleNews(d, s, "act").length + visibleGeo(d, s, "act").length + visiblePosts(d, s, "act").length;

export const newsWriteUrl = (x: JudgedNews) => storyWriteUrl({ title: x.title, link: x.url, date: x.date, summary: x.snippet, source: x.source });

/** One source per site, in the answer's order: an answer often cites several pages of one site. */
export const siteList = (sources: GeoRead["sources"]) => [...new Map(sources.map((s) => [s.domain, s])).values()];

export function geoWriteUrl(x: GeoRead): string {
  const ctx = [
    `People I serve ask AI assistants: "${x.question}"`,
    x.sources.length ? `The answers today draw on: ${siteList(x.sources).slice(0, 5).map((s) => s.domain).join(", ")}.` : "",
    "Write a post that answers this question in my own words, with one clear takeaway.",
  ].filter(Boolean).join("\n");
  return `/generate?${new URLSearchParams({ idea: "real-question", ctx }).toString()}`;
}

export const postWriteUrl = (x: JudgedPost) =>
  `/generate?${new URLSearchParams({ ctx: `Remix this angle from @${x.handle} (adapt to my niche and voice, never copy): "${x.caption.slice(0, 220)}"` }).toString()}`;

/** The UTC day the next check opens (7 days after the latest one's), or null when one can run now. The server decides. */
export function nextCheckDay(s: MarketState, now = new Date()): string | null {
  const last = s.checks[s.checks.length - 1]?.checkedAt;
  if (!last) return null;
  const opens = Date.parse(`${last.slice(0, 10)}T00:00:00Z`) + 7 * DAY_MS;
  return now.getTime() >= opens ? null : new Date(opens).toISOString().slice(0, 10);
}

/**
 * The line beside the check button. A weekly refusal with no result on this page in the last 7 days means the check
 * ran on another profile (the cap is per account) or its page closed mid-check; say so instead of looking broken.
 */
export function weekNote(s: MarketState, job: MarketJob | null, now = new Date()): string {
  if (job?.state === "failed" && job.code === "weekly_limit") {
    const recent = s.checks.some((c) => now.getTime() - Date.parse(c.checkedAt) < 7 * DAY_MS);
    return recent ? job.error ?? "" : `${job.error} Its result is on another profile, or was lost when a page closed mid-check.`;
  }
  const next = nextCheckDay(s, now);
  return next ? `Next check opens ${dayWords(next)} at 8am.` : "";
}

function readShown(): { on: boolean; at: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(SHOWN) ?? "null");
    return v && typeof v.on === "boolean" && typeof v.at === "number" ? v : null;
  } catch {
    return null;
  }
}

/** Whether the nav shows Your market on this device. */
export const marketShown = (): boolean => readShown()?.on === true;

/** On sign-out, so the next person on this browser asks the server afresh. */
export function forgetMarketShown(): void {
  try {
    localStorage.removeItem(SHOWN);
  } catch {
    // storage blocked: nothing was kept
  }
}

/** Asks the server whether this sign-in has Your market (no paid call), at most every 6 hours. */
export async function checkMarketEnabled(): Promise<boolean> {
  const known = readShown();
  if (known && Date.now() - known.at < RECHECK_MS) return known.on;
  try {
    const on = (await callFn<{ enabled?: unknown }>("market", { action: "status" }))?.enabled === true;
    try {
      localStorage.setItem(SHOWN, JSON.stringify({ on, at: Date.now() }));
    } catch {
      // storage blocked: ask again next time
    }
    return on;
  } catch (e) {
    if (e instanceof EdgeError && e.status === 404) return false;
    return known?.on === true;
  }
}

export interface MarketJob {
  state: "running" | "done" | "failed";
  startedAt: number;
  error?: string;
  code?: string;
}

let job: MarketJob | null = null;
const listeners = new Set<(j: MarketJob | null) => void>();
const emit = () => listeners.forEach((fn) => fn(job));

export const marketJob = () => job;
export function onMarketJob(fn: (j: MarketJob | null) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function runMarketCheck(userId: string): Promise<void> {
  if (job?.state === "running") return;
  const startedAt = Date.now();
  job = { state: "running", startedAt };
  emit();
  try {
    const s = loadMarket(userId);
    const digest = await callFn<MarketDigest>(
      "market",
      { action: "check", name: s.name, site: s.site, audience: s.audience, topics: s.topics, questions: s.questions, keywords: loadWatch(userId), posts: outperformers(loadFollowing(userId)) },
      "Couldn't check your market. Try again in a minute.",
    );
    const latest = loadMarket(userId); // read again: the set-up may have changed while it ran
    saveMarket(userId, { ...latest, checks: [...latest.checks, digest] });
    job = { state: "done", startedAt };
  } catch (e) {
    job = { state: "failed", startedAt, error: (e as Error).message, code: e instanceof EdgeError ? e.code : "" };
  }
  emit();
}

export const suggestSetup = (input: { name: string; site: string; audience: string; topics: string[] }) =>
  callFn<{ keywords: string[]; questions: string[] }>("market", { action: "suggest", ...input }, "Couldn't suggest anything right now. Add your own below.");
