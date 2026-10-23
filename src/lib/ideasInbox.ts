// The ideas inbox (/ideas, Leo only; docs/north-star/items/plan-ideas-inbox.md): ideas from every source the brand
// already has in one list, plus a set written for it each day (idea-dump mode "ideas", cap ideas-daily). Pooled
// ideas are read from the device (and the brand's own audit rows) every time and never copied; only the written
// sets and each idea's status are kept, in one synced key per brand, content-studio-ideas-<scoped uid>. The set is
// written by a job outside React, so leaving /ideas keeps it going; it starts on a press, or on the visit once the
// "morning" switch is on (Q6, off by default). A reload mid-call loses that call only: the server gave the use back
// if OpenAI never answered.

import { sgDay } from "@/lib/goals";
import { planContextFor } from "@/lib/angleSuggest";
import { auditedHandles, firstLine, loadAuditFor, loadLatestIdeas, ideaWriteUrl, setIdeaStatus, type AuditPlatform, type IdeaRow, type RatedPost } from "@/lib/accountAudit";
import { loadBoards, titleOf, writeUrlFor, PLATFORM_NAME, type BoardItem } from "@/lib/boards";
import { loadDrafts, engagement, type DraftEntry } from "@/lib/draftHistory";
import { callFn, EdgeError } from "@/lib/edgeFn";
import { briefWriteUrl, isOnBoard, loadBriefs, preferredAudience, type IdeaBrief } from "@/lib/ideaDump";
import { buildNewsWriteUrl, NEWS, type NewsStory } from "@/lib/industryNews";
import { loadLabels, type Label } from "@/lib/labels";
import { links } from "@/lib/links";
import { loadMarket, newsKey, newsWriteUrl, saveMarket, visibleNews, withKey, type MarketState } from "@/lib/market";
import { CHIPS, loadFeed, loadNiche, type FeedItem, type NicheState } from "@/lib/nicheFeed";
import { scoped } from "@/lib/profiles";
import { speakerFor } from "@/lib/remixBrand";
import { sourceKey } from "@/lib/remixSource";
import { loadSaved } from "@/lib/savedItems";
import { loadSocialAccounts } from "@/lib/socialAccounts";
import { buildRemixUrl, getAllTopPosts, type TopPostWithAdvisor } from "@/lib/topPosts";
import { buildTrendRemixUrl, getTrends, trendHooks, trendTalkingPoints, type TrendEntry } from "@/lib/trends";
import type { FunnelStageId } from "@/data/funnelFramework";

const DAY = 86_400_000;
export const KEEP_DAYS = 14;
export const MAX_STATUS = 1000;
export const PER_SOURCE = 10;
/** A daily set or More ideas; More like this and Refine ask for fewer. */
export const SET_COUNT = 6;
export const LIKE_COUNT = 3;
export const STEER_MAX = 200;

export const FAILED_LINE = "Couldn't write today's ideas.";
export const CAPPED_LINE = "Today's limit for new ideas is used. It resets at 8am Singapore time.";
export const NONE_SAFE_LINE = "None of today's ideas were safe to post as written. Try Refine with a narrower topic.";
export const UNSCORED_LINE = "Fit scores are off right now, so today's ideas are in the order they were written.";
export const NO_POSITIONING_LINE = "Say who you serve first, so ideas are about them.";

// ---- The store: content-studio-ideas-<scoped uid> --------------------------------------------------------------

export type IdeaFormat = "text-post" | "carousel" | "short-video";
export type IdeaStatus = "shortlisted" | "discarded" | "written";
export interface StatusRow {
  s: IdeaStatus;
  at: string;
}
export interface GenIdea {
  key: string;
  title: string;
  angle: string;
  why: string;
  format: IdeaFormat;
  stage: FunnelStageId;
  labelId?: string;
  fit: number | null;
  /** The key of the idea it came from (More like this, Refine). */
  like?: string;
  at: string;
}
export interface IdeasState {
  /** The last 14 Singapore days, oldest first. */
  days: { day: string; ideas: GenIdea[] }[];
  /** Idea key -> its status, the 1,000 newest. No row = in the Inbox. */
  status: Record<string, StatusRow>;
  /** Q6: write today's set on the visit, with no press. Off by default. */
  morning: boolean;
  /** The Singapore day the daily set was last asked for, so a failed visit does not ask again that day. */
  asked?: string;
}

export const EMPTY_IDEAS: IdeasState = { days: [], status: {}, morning: false };
const KEY = "content-studio-ideas-";
export const IDEAS_CHANGED = "content-studio-ideas-changed";
export const ideasKey = (userId: string) => KEY + scoped(userId);

const FORMATS: IdeaFormat[] = ["text-post", "carousel", "short-video"];
const STAGES: FunnelStageId[] = ["attraction", "trust", "conversion"];
const STATUSES: IdeaStatus[] = ["shortlisted", "discarded", "written"];
const str = (v: unknown, max = 400) => (typeof v === "string" ? v.slice(0, max) : "");

function readGen(v: unknown): GenIdea | null {
  const r = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  if (!r || !str(r.key) || !str(r.title)) return null;
  return {
    key: str(r.key, 200),
    title: str(r.title, 200),
    angle: str(r.angle),
    why: str(r.why),
    format: FORMATS.includes(r.format as IdeaFormat) ? (r.format as IdeaFormat) : "text-post",
    stage: STAGES.includes(r.stage as FunnelStageId) ? (r.stage as FunnelStageId) : "trust",
    ...(str(r.labelId) ? { labelId: str(r.labelId, 80) } : {}),
    fit: typeof r.fit === "number" ? r.fit : null,
    ...(str(r.like) ? { like: str(r.like, 400) } : {}),
    at: str(r.at, 40),
  };
}

function readAt(key: string): IdeasState {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!v || typeof v !== "object") return { ...EMPTY_IDEAS };
    const days = (Array.isArray(v.days) ? v.days : [])
      .map((d: { day?: unknown; ideas?: unknown }) => ({ day: str(d?.day, 10), ideas: (Array.isArray(d?.ideas) ? d.ideas : []).map(readGen).filter(Boolean) as GenIdea[] }))
      .filter((d: { day: string }) => /^\d{4}-\d{2}-\d{2}$/.test(d.day));
    const status: Record<string, StatusRow> = {};
    if (v.status && typeof v.status === "object") {
      for (const [k, row] of Object.entries(v.status as Record<string, { s?: unknown; at?: unknown }>)) {
        if (STATUSES.includes(row?.s as IdeaStatus)) status[k] = { s: row.s as IdeaStatus, at: str(row.at, 40) };
      }
    }
    return { days, status, morning: v.morning === true, ...(str(v.asked, 10) ? { asked: str(v.asked, 10) } : {}) };
  } catch {
    return { ...EMPTY_IDEAS };
  }
}

/** The 14 newest days (oldest first) and the 1,000 newest statuses. */
export function trimIdeas(s: IdeasState): IdeasState {
  const days = [...s.days].sort((a, b) => (a.day < b.day ? -1 : 1)).slice(-KEEP_DAYS);
  const status = Object.fromEntries(Object.entries(s.status).sort((a, b) => (a[1].at < b[1].at ? -1 : 1)).slice(-MAX_STATUS));
  return { ...s, days, status };
}

/** False when storage refused it; the change then lives until the page reloads. */
function writeAt(key: string, s: IdeasState): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(trimIdeas(s)));
    return true;
  } catch {
    return false;
  } finally {
    window.dispatchEvent(new Event(IDEAS_CHANGED));
  }
}

export const loadIdeas = (userId: string): IdeasState => readAt(ideasKey(userId));
export const saveIdeas = (userId: string, s: IdeasState): boolean => writeAt(ideasKey(userId), s);
export function onIdeasChanged(cb: () => void): () => void {
  window.addEventListener(IDEAS_CHANGED, cb);
  return () => window.removeEventListener(IDEAS_CHANGED, cb);
}

/** True only while this Singapore day has neither a set nor an ask for one. */
export const needsDailySet = (s: IdeasState, now: Date): boolean => {
  const today = sgDay(now);
  return !s.days.some((d) => d.day === today) && s.asked !== today;
};
export const hasTodaysSet = (s: IdeasState, now: Date): boolean => s.days.some((d) => d.day === sgDay(now) && d.ideas.length > 0);

/** Today's written ideas still in the Inbox (Home's tile, phase 6's Next up). */
export function newIdeasCount(userId: string, today: string): number {
  const s = loadIdeas(userId);
  return (s.days.find((d) => d.day === today)?.ideas ?? []).filter((i) => !s.status[i.key]).length;
}

export const setMorning = (userId: string, on: boolean) => saveIdeas(userId, { ...loadIdeas(userId), morning: on });

// ---- Statuses and undo ----------------------------------------------------------------------------------------

export type StatusChange = Record<string, StatusRow | null>;
let lastChange: { key: string; prev: StatusChange } | null = null;

/** Sets (or with null clears) each key's status; returns what they were, for Undo. Z undoes the newest one. */
export function setStatus(userId: string, keys: string[], s: IdeaStatus | null, now = new Date(), undoable = true): StatusChange {
  const key = ideasKey(userId);
  const state = readAt(key);
  const prev: StatusChange = {};
  const status = { ...state.status };
  for (const k of keys) {
    prev[k] = status[k] ?? null;
    if (s) status[k] = { s, at: now.toISOString() };
    else delete status[k];
  }
  writeAt(key, { ...state, status });
  if (undoable) lastChange = { key, prev };
  return prev;
}

export function restoreStatus(userId: string, prev: StatusChange): void {
  const key = ideasKey(userId);
  const state = readAt(key);
  const status = { ...state.status };
  for (const [k, row] of Object.entries(prev)) {
    if (row) status[k] = row;
    else delete status[k];
  }
  writeAt(key, { ...state, status });
  if (lastChange?.prev === prev) lastChange = null;
}

/** Z: undoes the last shortlist, discard or put back on this brand (one step). False when there is none. */
export function undoLast(userId: string): boolean {
  if (!lastChange || lastChange.key !== ideasKey(userId)) return false;
  restoreStatus(userId, lastChange.prev);
  return true;
}

// ---- The pool -----------------------------------------------------------------------------------------------

export type IdeaSource = "today" | "dump" | "posts" | "market" | "foryou" | "trends" | "news" | "saved";
export const SOURCES: IdeaSource[] = ["today", "dump", "posts", "market", "foryou", "trends", "news", "saved"];
export const SOURCE_CHIP: Record<IdeaSource, string> = {
  today: "TODAY'S", dump: "IDEA DUMP", posts: "YOUR POSTS", market: "MARKET", foryou: "FOR YOU", trends: "TREND", news: "NEWS", saved: "SAVED",
};
export const SOURCE_NAME: Record<IdeaSource, string> = {
  today: "Today's", dump: "Idea Dump", posts: "Your posts", market: "Market", foryou: "For you", trends: "Trends", news: "News", saved: "Saved",
};

export interface InboxIdea {
  key: string;
  source: IdeaSource;
  title: string;
  angle: string;
  why: string;
  /** Write with this idea filled in. */
  writeUrl: string;
  /** "Idea Dump, Mon 20 Oct" */
  from: string;
  fromUrl?: string;
  format?: string;
  stage?: FunnelStageId;
  labelId?: string;
  hooks?: string[];
  /** Jev's fit, written ideas only. */
  fit?: number | null;
  like?: string;
  at: string;
  /** What Write also marks at the source: an audit idea's row, a market pick's key. */
  auditIdea?: string;
  marketKey?: string;
}

export interface AuditIdeas {
  platform: AuditPlatform;
  handle: string;
  ideas: IdeaRow[];
  posts: RatedPost[];
}

export interface PoolStores {
  briefs: IdeaBrief[];
  drafts: DraftEntry[];
  audience: string | null;
  audits: AuditIdeas[];
  market: MarketState;
  feed: FeedItem[];
  niche: Pick<NicheState, "picks" | "hidden">;
  trends: TrendEntry[];
  news: NewsStory[];
  boards: BoardItem[];
  /** Saved swipe-file posts (savedItems), resolved. */
  savedTop: TopPostWithAdvisor[];
}

/**
 * A source link the page may render: http or https (any case) as an outside link, a same-app path ("/x", never
 * "//x", "/\x" or a tab or newline inside, which browsers read as another site) as an app link; javascript:, data:
 * and the rest give null.
 */
export function safeLink(url: string | null | undefined): { external: boolean; href: string } | null {
  const u = (url ?? "").trim();
  if (/^\/(?![/\\])[^\s\x00-\x1f]*$/.test(u)) return { external: false, href: u };
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? { external: true, href: parsed.href } : null;
  } catch {
    return null;
  }
}

/** "Mon 20 Oct" in Singapore, or "" for no date. */
export function dayLabel(at: string | number): string {
  const t = typeof at === "number" ? at : Date.parse(at);
  if (!t) return "";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Singapore" }).format(new Date(t)).replace(",", "");
}
const fromLine = (name: string, at: string | number) => [name, dayLabel(at)].filter(Boolean).join(", ");
const iso = (t: string | number) => {
  const ms = typeof t === "number" ? t : Date.parse(t);
  return ms ? new Date(ms).toISOString() : "";
};
const newest = <T>(list: T[], at: (x: T) => string) => [...list].sort((a, b) => (at(a) < at(b) ? 1 : -1)).slice(0, PER_SOURCE);
const AUDIT_FORMAT: Record<IdeaRow["format"], IdeaFormat> = { video: "short-video", carousel: "carousel", image: "text-post" };

/** Every pooled source as ideas, at most 10 newest each, leaving out what its own page already counts as done. */
export function poolIdeas(s: PoolStores, now: Date): InboxIdea[] {
  const out: InboxIdea[] = [];
  const today = sgDay(now);

  for (const b of newest(s.briefs.filter((b) => !isOnBoard(b, s.drafts)), (b) => b.createdAt)) {
    out.push({
      key: `dump:${b.id}`, source: "dump", title: b.idea, angle: b.angle, why: b.stageReason, writeUrl: briefWriteUrl(b, s.audience),
      from: fromLine("Idea Dump", b.createdAt), fromUrl: links.coach({ section: "idea-dump" }), format: b.format, stage: b.funnelStage, hooks: b.hooks, at: b.createdAt,
    });
  }

  const audit = s.audits.flatMap((a) => a.ideas.filter((i) => i.status === "new").map((i) => ({ a, i })));
  for (const { a, i } of newest(audit, (x) => x.i.created_at)) {
    const basedOn = i.based_on_post_id ? a.posts.find((p) => p.id === i.based_on_post_id) : undefined;
    out.push({
      key: `audit:${i.id}`, source: "posts", title: i.hook, angle: i.idea, why: i.why ?? "", writeUrl: ideaWriteUrl(i, a.platform, a.handle, basedOn),
      from: fromLine(`Your @${a.handle} audit`, i.created_at), fromUrl: links.analytics(), format: AUDIT_FORMAT[i.format], hooks: [i.hook], at: i.created_at, auditIdea: i.id,
    });
  }

  const check = s.market.checks[s.market.checks.length - 1];
  if (check) {
    const act = visibleNews(check, s.market, "act").filter((x) => !s.market.written.includes(newsKey(x)));
    for (const x of newest(act, (x) => iso(x.date) || check.checkedAt)) {
      out.push({
        key: `market:${newsKey(x)}`, source: "market", title: x.title, angle: x.snippet, why: `Your market check marked this Act (${x.keyword}).`, writeUrl: newsWriteUrl(x),
        from: fromLine(`Your market, ${x.source}`, iso(x.date) || check.checkedAt), fromUrl: x.url, at: iso(x.date) || check.checkedAt, marketKey: newsKey(x),
      });
    }
  }

  if (s.niche.picks.day === today) {
    const byId = new Map(s.feed.map((i) => [i.id, i]));
    for (const id of s.niche.picks.ids.slice(0, PER_SOURCE)) {
      const i = byId.get(id);
      if (!i || s.niche.hidden.includes(id)) continue;
      out.push({
        key: `foryou:${i.id}`, source: "foryou", title: firstLine(i.text, 120) || i.who, angle: [i.who, i.meta, i.numbers].filter(Boolean).join(", "),
        why: `One of today's 5 picks for your brand, from ${CHIPS[i.from]}.`, writeUrl: i.remixUrl, from: fromLine("For you", i.at || now.getTime()),
        fromUrl: i.url ?? undefined, at: iso(i.at) || now.toISOString(),
      });
    }
  }

  const fresh = s.trends.filter((t) => (Date.parse(today) - Date.parse(t.date_found.slice(0, 10))) / DAY < 7);
  for (const t of newest(fresh, (t) => t.date_found)) {
    out.push({
      key: `trend:${t.id}`, source: "trends", title: t.title, angle: t.trend_source || trendTalkingPoints(t)[0] || "", why: t.why_it_works, writeUrl: buildTrendRemixUrl(t),
      from: fromLine(`Trends, ${t.source_label}`, t.date_found), fromUrl: t.source_url || undefined, format: t.format, hooks: trendHooks(t), at: t.date_found,
    });
  }

  // find-news-questions' picks are not built yet: the 5 newest industry stories
  for (const n of [...s.news].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1)).slice(0, 5)) {
    out.push({
      key: `news:${n.id}`, source: "news", title: n.title, angle: n.talkingPoint, why: n.gist, writeUrl: buildNewsWriteUrl(n),
      from: fromLine(n.source, n.publishedAt), fromUrl: n.url, at: n.publishedAt,
    });
  }

  const saved: InboxIdea[] = [];
  for (const i of s.boards) {
    const hook = i.tags?.opening?.trim();
    if (!hook) continue;
    const what = titleOf(i);
    saved.push({
      key: `saved:${i.key}`, source: "saved", title: hook, angle: what === hook ? i.caption : what, why: i.note.split("\n")[0] || `You saved this from ${i.author || PLATFORM_NAME[i.platform]}.`,
      writeUrl: writeUrlFor(i), from: fromLine(`Saved from ${i.author || PLATFORM_NAME[i.platform]}`, i.savedAt), fromUrl: i.url, at: i.savedAt,
    });
  }
  for (const p of s.savedTop) {
    const key = `saved:${sourceKey.top(p.advisorId, p.shortCode)}`;
    if (!p.idea || saved.some((x) => x.key === key)) continue;
    saved.push({
      key, source: "saved", title: p.idea.hook, angle: p.idea.adapt, why: p.idea.why, writeUrl: buildRemixUrl(p, { name: p.advisorName, handle: p.handle }),
      from: fromLine(`Saved from ${p.advisorName}`, p.timestamp ?? ""), fromUrl: p.url, hooks: [p.idea.hook], at: iso(p.timestamp ?? "") || "",
    });
  }
  out.push(...newest(saved, (x) => x.at));
  // scraped and synced data can carry any link: only one safeLink accepts reaches the page
  return out.map(({ fromUrl, ...i }) => (safeLink(fromUrl) ? { ...i, fromUrl: safeLink(fromUrl).href } : i));
}

/** The pooled sources this device holds (the audits load apart, from their table). */
export function loadPoolStores(userId: string, audits: AuditIdeas[] = []): PoolStores {
  const saved = new Set(loadSaved(userId).topPosts);
  // the trends and news feeds are Singapore personal finance: a business brand gets neither
  const finance = speakerFor(userId) === "person";
  return {
    briefs: loadBriefs(userId),
    drafts: loadDrafts(userId),
    audience: preferredAudience(userId),
    audits,
    market: loadMarket(userId),
    feed: loadFeed(userId),
    niche: loadNiche(userId),
    trends: finance ? getTrends() : [],
    news: finance ? NEWS : [],
    boards: loadBoards(userId).items,
    savedTop: saved.size ? getAllTopPosts().filter((p) => saved.has(`${p.advisorId}-${p.shortCode}`)) : [],
  };
}

/**
 * The brand's own audit ideas: its Instagram and TikTok handles' saved audits, read straight from the table. Never
 * openAudit, which can start a paid refresh. A read that fails throws, and the page leaves those ideas out.
 */
export async function loadAuditIdeas(userId: string): Promise<AuditIdeas[]> {
  const out: AuditIdeas[] = [];
  for (const { platform, handle } of auditedHandles(loadSocialAccounts(userId))) {
    const row = await loadAuditFor(platform, handle);
    if (row) out.push({ platform, handle, ideas: await loadLatestIdeas(row.id), posts: row.posts ?? [] });
  }
  return out;
}

const FORMAT_WORD: Record<string, string> = { "text-post": "Text post", carousel: "Carousel", "short-video": "Short video" };
export const formatWord = (f: string) => FORMAT_WORD[f] ?? f.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Write, filled with a written idea: its title as the topic, the angle and why as context, its label once saved. */
export const genWriteUrl = (g: GenIdea): string =>
  links.generate({ pillar: "topic", detail: g.title, format: g.format, funnel: g.stage, ctx: `${g.angle}\nWhy it fits: ${g.why}`, label: g.labelId });

/** Every written idea, newest day first. */
export function genIdeas(s: IdeasState): InboxIdea[] {
  return [...s.days].reverse().flatMap((d) =>
    d.ideas.map((g) => ({
      key: g.key, source: "today" as const, title: g.title, angle: g.angle, why: g.why, writeUrl: genWriteUrl(g), from: fromLine("Today's ideas", g.at || d.day),
      format: g.format, stage: g.stage, labelId: g.labelId, fit: g.fit, like: g.like, at: g.at,
    })),
  );
}

// ---- Tabs, filters and order -----------------------------------------------------------------------------------

export type IdeasTab = "inbox" | "shortlist" | "discarded";
export const TABS: IdeasTab[] = ["inbox", "shortlist", "discarded"];
const TAB_STATUS: Record<IdeasTab, IdeaStatus | null> = { inbox: null, shortlist: "shortlisted", discarded: "discarded" };
export const inTab = (key: string, status: IdeasState["status"], tab: IdeasTab) => (status[key]?.s ?? null) === TAB_STATUS[tab];

/**
 * One tab's list: written ideas first, newest day first and best fit first within a day, each More like this idea
 * right under the one it came from; then pooled ideas, newest first.
 */
export function arrange(all: InboxIdea[], status: IdeasState["status"], f: { tab: IdeasTab; source?: IdeaSource | "all"; label?: string }): InboxIdea[] {
  const shown = all.filter((i) => inTab(i.key, status, f.tab) && (!f.source || f.source === "all" || i.source === f.source) && (!f.label || i.labelId === f.label));
  const gen = shown.filter((i) => i.source === "today");
  const day = (i: InboxIdea) => i.key.split(":")[1] ?? "";
  const roots = gen.filter((i) => !i.like || !gen.some((p) => p.key === i.like));
  roots.sort((a, b) => (day(a) !== day(b) ? (day(a) < day(b) ? 1 : -1) : (b.fit ?? -1) - (a.fit ?? -1)));
  const ordered: InboxIdea[] = [];
  const place = (i: InboxIdea) => {
    ordered.push(i);
    for (const c of gen.filter((c) => c.like === i.key)) place(c);
  };
  roots.forEach(place);
  const pooled = shown.filter((i) => i.source !== "today").sort((a, b) => (a.at < b.at ? 1 : -1));
  return [...ordered, ...pooled];
}

// ---- Keys ------------------------------------------------------------------------------------------------------

export type KeyAct = { act: "move"; to: number } | { act: "shortlist" | "discard" | "write" | "more" | "undo" };
const KEY_ACTS: Record<string, "shortlist" | "discard" | "write" | "more" | "undo"> = { s: "shortlist", d: "discard", w: "write", m: "more", z: "undo" };

/** What a key does on the list (index -1 = nothing open); nothing from a text field or with a modifier held. */
export function keyAction(key: string, o: { inField: boolean; mod: boolean }, index: number, count: number): KeyAct | null {
  if (o.inField || o.mod) return null;
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (k === "j" || k === "ArrowDown") return count ? { act: "move", to: Math.min(count - 1, index + 1) } : null;
  if (k === "k" || k === "ArrowUp") return count ? { act: "move", to: Math.max(0, index - 1) } : null;
  const act = KEY_ACTS[k];
  if (!act) return null;
  return act === "undo" || index >= 0 ? { act } : null;
}

// ---- Write -----------------------------------------------------------------------------------------------------

/** Write this post: the idea leaves the Inbox, and its source page marks it too where that page records a write. */
export function markWritten(userId: string, idea: Pick<InboxIdea, "key" | "auditIdea" | "marketKey">, now = new Date()): void {
  setStatus(userId, [idea.key], "written", now, false);
  // the audit page's own "used"; a failure only leaves it new there
  if (idea.auditIdea) void setIdeaStatus(idea.auditIdea, "used").catch(() => undefined);
  if (idea.marketKey) {
    const m = loadMarket(userId);
    saveMarket(userId, { ...m, written: withKey(m.written, idea.marketKey, true) });
  }
}

// ---- Writing a set (idea-dump mode "ideas"), outside React -----------------------------------------------------

export interface IdeasAsk {
  /** More like this and Refine: the idea the new ones stay close to. */
  like?: Pick<InboxIdea, "key" | "title" | "angle">;
  steer?: string;
  /** The visit's run with the morning switch on: the pill shows the price. */
  auto?: boolean;
}
export interface IdeasRun extends IdeasAsk {
  scope: string;
}
export interface IdeasFail extends IdeasAsk {
  scope: string;
  line: string;
  retry: boolean;
}

let run: IdeasRun | null = null;
let fail: IdeasFail | null = null;
let version = 0;
const listeners = new Set<() => void>();
const notify = () => {
  version++;
  listeners.forEach((l) => l());
};
/** For useSyncExternalStore. */
export const ideasVersion = () => version;
export function onIdeasJob(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export const ideasRun = (userId: string): IdeasRun | null => (run?.scope === scoped(userId) ? run : null);
export const ideasFail = (userId: string): IdeasFail | null => (fail?.scope === scoped(userId) ? fail : null);
export const clearFail = () => {
  fail = null;
  notify();
};

function failureOf(e: unknown): { line: string; retry: boolean } {
  const err = e instanceof EdgeError ? e : null;
  if (err?.status === 429) return { line: CAPPED_LINE, retry: false };
  if (err?.code === "none_safe") return { line: NONE_SAFE_LINE, retry: false };
  // the gate and a bad request say why in the server's own words
  if (err && (err.code === "not_enabled" || err.code === "bad_request")) return { line: err.message, retry: false };
  return { line: FAILED_LINE, retry: true };
}

/** What the call sends besides the context: hooks to avoid, the best hooks, and today's material as seeds. */
export function askBody(userId: string, s: IdeasState, pool: InboxIdea[], labels: Label[], o: IdeasAsk, now: Date) {
  const drafts = loadDrafts(userId);
  const today = s.days.find((d) => d.day === sgDay(now))?.ideas ?? [];
  const posted = [...today.map((g) => g.title), ...drafts.map((d) => d.hook?.trim()).filter(Boolean)].slice(0, 15);
  const best = drafts.filter((d) => engagement(d.metrics) > 0 && d.hook?.trim()).sort((a, b) => engagement(b.metrics) - engagement(a.metrics)).map((d) => d.hook.trim()).slice(0, 5);
  const seeds = (["news", "market", "trends", "foryou"] as IdeaSource[])
    .flatMap((src) => pool.filter((i) => i.source === src).map((i) => ({ key: i.key, kind: SOURCE_NAME[src], title: i.title })))
    .slice(0, 10);
  return {
    mode: "ideas",
    count: o.like ? LIKE_COUNT : SET_COUNT,
    context: { ...planContextFor(userId), labels: labels.map((l) => l.name) },
    posted,
    best,
    seeds,
    ...(o.like ? { like: { title: o.like.title, angle: o.like.angle } } : {}),
    ...(o.steer?.trim() ? { steer: o.steer.trim().slice(0, STEER_MAX) } : {}),
  };
}

interface WrittenIdea {
  title: string;
  angle: string;
  why: string;
  format: IdeaFormat;
  stage: FunnelStageId;
  label?: string;
  fit: number | null;
}

/**
 * Asks for a set (6, or 3 close to `like`), and adds what comes back to today's ideas on the brand it started on,
 * whether or not /ideas is still open. One call at a time.
 */
export async function getIdeas(userId: string, o: IdeasAsk = {}, now = new Date()): Promise<void> {
  if (run) return;
  const scope = scoped(userId);
  const key = ideasKey(userId);
  const labels = loadLabels(userId);
  const state = readAt(key);
  const body = askBody(userId, state, poolIdeas(loadPoolStores(userId), now), labels, o, now);
  if (!body.context.positioning) {
    fail = { scope, ...o, line: NO_POSITIONING_LINE, retry: false };
    return notify();
  }
  const day = sgDay(now);
  if (!o.like && state.asked !== day) writeAt(key, { ...state, asked: day });
  run = { scope, ...o };
  fail = null;
  notify();
  try {
    const r = await callFn<{ ideas?: WrittenIdea[]; scored?: boolean }>("idea-dump", body, FAILED_LINE);
    const s = readAt(key);
    const set = s.days.find((d) => d.day === day)?.ideas ?? [];
    const next = set.reduce((n, g) => Math.max(n, Number(g.key.split(":")[2]) || 0), 0) + 1;
    const fresh: GenIdea[] = (Array.isArray(r?.ideas) ? r.ideas : []).map((i, n) => ({
      key: `gen:${day}:${next + n}`,
      title: i.title,
      angle: i.angle,
      why: i.why,
      format: FORMATS.includes(i.format) ? i.format : "text-post",
      stage: STAGES.includes(i.stage) ? i.stage : "trust",
      // the server answers with the label's name, as it was sent
      ...(labels.find((l) => l.name === i.label) ? { labelId: labels.find((l) => l.name === i.label).id } : {}),
      fit: typeof i.fit === "number" ? i.fit : null,
      ...(o.like ? { like: o.like.key } : {}),
      at: now.toISOString(),
    }));
    writeAt(key, { ...s, days: [...s.days.filter((d) => d.day !== day), { day, ideas: [...set, ...fresh] }] });
    run = null;
  } catch (e) {
    run = null;
    fail = { scope, ...o, ...failureOf(e) };
  }
  notify();
}

/** The visit's run: today's set, with no press, only while the morning switch is on and today has none. */
export function startMorning(userId: string, now = new Date()): void {
  const s = loadIdeas(userId);
  if (s.morning && needsDailySet(s, now)) void getIdeas(userId, { auto: true }, now);
}
