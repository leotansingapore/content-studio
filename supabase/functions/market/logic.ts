// The market edge function's rules (Discover > Your market). Everything that cleans, gates or decides lives here
// so vitest can run it; index.ts only wires Supabase, DataForSEO, OpenAI and Jev. Ported from the market-loop
// skill (~/.claude/skills/market-loop, 2026-10-15), which condenses MIA (mia.ambr.io).

import { choiceOf, noulOf, type JevAnswer, type JevQuestion } from "../_shared/jev.ts";
import { safeFeedUrl } from "../feed-ideas/logic.ts";
import { cleanKeywords, searchTerm, type Mention } from "../mentions/logic.ts";
import { consumeUsage, GLOBAL_COUNTER_USER, refundUsage, usageRefusal, type UsageClient } from "../_shared/usageCaps.ts";

export const MAX_QUESTIONS = 5;
export const MAX_POSTS = 10;
export const MAX_CANDIDATES = 8;
export const MAX_SOURCES = 20;
/** A Jev yes at or above this counts; on the AT market-loop run (2026-10-15) the lower yeses were junk. */
export const RELEVANT_AT = 0.5;
/** Stories judged per check: 10 a keyword, 40 in all, so the Jev pools finish well inside the function's time limit. */
export const NEWS_PER_KEYWORD = 10;
export const MAX_NEWS = 40;
/** Older stories are background, not news: the first real run tagged 2021 to early-2025 articles as Act. */
export const NEWS_MAX_AGE_DAYS = 30;
/**
 * Jev's "is it a news report or an explainer?" at or above this counts as news. Set 2026-10-15 on 80 hand-labelled real
 * results of the past-month request: 0.6 keeps 30 of 32 news and explainers and lets 4 of 48 listings, adverts, job ads
 * and social posts through (0.5 let 7 through; 0.7 also dropped a third real story).
 */
export const NEWS_AT = 0.6;
/**
 * Jev's "about Singapore, or directly affects people here?" at or above this counts. Set 2026-10-15 on 110 hand-labelled
 * real results: 0.6 keeps 74 of 75 Singapore stories and lets 0 of 35 foreign ones through (0.5 let a Malaysian post in).
 */
export const SG_AT = 0.6;
/** Act is a to-do, not a reading list: the first real run tagged 18 stories Act. */
export const ACT_SHORTLIST = 5;
const DAY_MS = 86_400_000;
const COUNTRY = "Singapore";

export type Position = "not-mentioned" | "passing" | "named" | "cited";
export const TAGS = ["act", "watch"] as const;
export type Tag = (typeof TAGS)[number];

export interface MarketPost { id: string; url: string; handle: string; caption: string }
export interface CheckInput { name: string; site: string; audience: string; topics: string[]; questions: string[]; keywords: string[]; posts: MarketPost[] }
export interface NewsItem { keyword: string; title: string; url: string; source: string; date: string; snippet: string }
export interface JudgedNews extends NewsItem {
  /** null: Jev could not judge it, so it stays visible as Watch. */
  relevant: boolean | null;
  tag: Tag;
  /** The link of the first report of the same story. */
  sameAs?: string;
  /** Jev's probability that it is worth posting about this week; ranks the Act shortlist. */
  actScore?: number;
}
export interface Source { url: string; domain: string; title: string }
export interface GeoRead {
  question: string;
  position: Position | null;
  sources: Source[];
  /** Advisers, firms and brands the answer recommends (its brand entities), the adviser left out. */
  named?: string[];
  checkUrl: string | null;
  error?: string;
}
export interface JudgedPost extends MarketPost { tag: Tag }
export interface MarketDigest { checkedAt: string; news: JudgedNews[]; geo: GeoRead[]; posts: JudgedPost[] }
export interface Ask { state: Record<string, unknown>; questions: Record<string, JevQuestion> }

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** MARKET_USERS: user ids separated by commas, or *. Same shape as social's SOCIAL_CONNECT_USERS. */
export function isAllowed(list: string | undefined, uid: string): boolean {
  const entries = (list ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return !!uid && (entries.includes("*") || entries.includes(uid));
}

function distinct(raw: unknown, max: number, clean: (v: unknown) => string, min: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const t = clean(v);
    if (t.length >= min && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length === max) break;
  }
  return out;
}

export const cleanQuestions = (raw: unknown, max = MAX_QUESTIONS) => distinct(raw, max, (v) => text(v, 160), 8);
export const cleanTerms = (raw: unknown, max = MAX_CANDIDATES) => distinct(raw, max, (v) => text(v, 40).replace(/["']/g, ""), 2);

/**
 * The adviser's own corner of the web: the host without www, plus the path when there is one ("linkedin.com/in/leotan"),
 * lower case. A profile on a shared site keeps its path, so another person's page there never counts as theirs.
 * "" when there is none or it is not a public web address.
 */
export function siteScope(raw: unknown): string {
  const t = text(raw, 300);
  if (!t) return "";
  const u = safeFeedUrl(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  if (!u) return "";
  return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
}

/** A source inside the scope: the same host or a subdomain of it, and under its path when it has one. */
export function citesSite(url: string, scope: string): boolean {
  if (!scope) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const slash = scope.indexOf("/");
  const host = slash < 0 ? scope : scope.slice(0, slash);
  const path = slash < 0 ? "" : scope.slice(slash);
  const h = u.hostname.toLowerCase().replace(/^www\./, "");
  if (h !== host && !h.endsWith(`.${host}`)) return false;
  const p = u.pathname.toLowerCase().replace(/\/+$/, "");
  return !path || p === path || p.startsWith(`${path}/`);
}

export function cleanPosts(raw: unknown): MarketPost[] {
  if (!Array.isArray(raw)) return [];
  const out: MarketPost[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const url = safeFeedUrl(o.url);
    const post = { id: text(o.id, 80), url: url?.href ?? "", handle: text(o.handle, 60).replace(/^@/, ""), caption: text(o.caption, 400) };
    if (url && post.id && post.handle && post.caption) out.push(post);
    if (out.length === MAX_POSTS) break;
  }
  return out;
}

export function cleanInput(raw: unknown): CheckInput {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    name: text(b.name, 80),
    site: siteScope(b.site),
    audience: text(b.audience, 300),
    topics: distinct(b.topics, 12, (v) => text(v, 60), 2),
    questions: cleanQuestions(b.questions),
    keywords: cleanKeywords(b.keywords),
    posts: cleanPosts(b.posts),
  };
}

/** What stops a check before anything is paid for, in the adviser's words; null when it can run. */
export function checkProblem(i: CheckInput): string | null {
  if (!i.audience) return "Say who you serve first, so the check knows what matters to them.";
  if (!i.questions.length && !i.keywords.length && !i.posts.length) return "Add a client question or a news topic to watch first.";
  return null;
}

/** True when every paid lookup that was asked for (the news, the AI answers) failed: the check is then given back. */
export function paidPartsFailed(i: CheckInput, newsFailed: boolean, geo: GeoRead[]): boolean {
  if (!i.keywords.length && !i.questions.length) return false;
  return (!i.keywords.length || newsFailed) && (!i.questions.length || geo.every((g) => !!g.error));
}

export const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * This week's slot: the adviser's own cap first, so someone who has already checked can't use up the studio's;
 * the studio's 20 a day next, giving the adviser's slot back when those are gone so they don't lose the week.
 */
export async function takeSlots(admin: UsageClient, uid: string, today: string): Promise<{ ok: true } | { ok: false; status: number; body: Record<string, unknown> }> {
  const mine = await consumeUsage(admin, uid, "market-check");
  if (mine.allowed === false) {
    if (mine.reason === "limit") return { ok: false, ...weeklyRefusal(utcDay(Date.parse(`${today}T00:00:00Z`) + 7 * DAY_MS)) };
    return { ok: false, ...usageRefusal(mine) };
  }
  const everyone = await consumeUsage(admin, GLOBAL_COUNTER_USER, "market-check-global");
  if (everyone.allowed === true) return { ok: true };
  await refundUsage(admin, uid, "market-check", today);
  return everyone.reason === "limit"
    ? { ok: false, status: 429, body: { code: "daily_limit", error: "Today's market checks for the whole studio are used up. Try again after 8am Singapore time." } }
    : { ok: false, ...usageRefusal(everyone) };
}

export const weeklyRefusal = (nextDay: string) => ({
  status: 429,
  body: { code: "weekly_limit", nextDay, error: `You've had this week's check. The next one opens ${dayWords(nextDay)} at 8am.` },
});

/** The 6 UTC days before today. cs_ai_usage counts on UTC dates, which start at 8am in Singapore. */
export function earlierWeekDays(now: Date): string[] {
  return Array.from({ length: 6 }, (_, k) => utcDay(now.getTime() - (k + 1) * DAY_MS));
}

/** Closed when a check was counted on any of those days; it opens 7 days after the latest one. */
export function weekGate(rows: unknown, now: Date): { open: true } | { open: false; nextDay: string } {
  const days = new Set(earlierWeekDays(now));
  const used = (Array.isArray(rows) ? rows : [])
    .filter((r): r is { day: string; count: number } => typeof r?.day === "string" && typeof r?.count === "number")
    .filter((r) => days.has(r.day) && r.count > 0)
    .map((r) => r.day)
    .sort();
  if (!used.length) return { open: true };
  return { open: false, nextDay: utcDay(Date.parse(`${used[used.length - 1]}T00:00:00Z`) + 7 * DAY_MS) };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Thu 22 Oct", built by hand: Supabase's edge runtime formats en-GB as "Thu, 22 Oct" while browsers don't. */
export function dayWords(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function newsItems(keyword: string, items: Mention[], now: Date): NewsItem[] {
  const oldest = now.getTime() - NEWS_MAX_AGE_DAYS * DAY_MS;
  return items
    .filter((m) => safeFeedUrl(m.url))
    // an undated story stays: Google News usually dates them, and dropping it would hide a real one
    .filter((m) => { const t = Date.parse(m.date); return Number.isNaN(t) || t >= oldest; })
    .map((m) => ({ keyword, title: text(m.title, 200), url: m.url, source: text(m.source, 80).replace(/^www\./, ""), date: text(m.date, 40), snippet: text(m.snippet, 300) }))
    .filter((n) => n.title)
    .slice(0, NEWS_PER_KEYWORD);
}

/** DataForSEO reports most task errors as HTTP 200 with a non-20000 code; 40102 (no results) is an empty answer, not a failure. */
export function newsFailed(body: unknown): boolean {
  // a request-level error (bad login, no credit) comes with no task, which reads as failed here too
  const code = (body as { tasks?: { status_code?: number }[] } | null)?.tasks?.[0]?.status_code;
  return code !== 20000 && code !== 40102;
}

/**
 * The Google News request for one topic: the past month, ranked by relevance. Measured 2026-10-15: plain search gave
 * 0 to 1 stories from the last 30 days out of 10 (evergreen guides rank first). Newest-first fixed freshness but, on 6
 * topics, returned 2 results from known SG news sites against 29 social, listing and forum pages; relevance returned
 * 16 and 16, with 56 of 59 still from the last 30 days (the date cut in newsItems drops the rest).
 */
export const newsTask = (keyword: string) => ({ keyword: searchTerm(keyword), location_code: 2702, language_code: "en", depth: 10, search_param: "&tbs=qdr:m" });

/** What a check sends back: the page never shows a story Jev rejected, so it is not stored and synced (about 45 KB a check). */
export const shownNews = (items: JudgedNews[]) => items.filter((n) => n.relevant !== false);

/** Every keyword's stories, one per link, at most 40. */
export const pickNews = (lists: NewsItem[][]) => uniqueByUrl(lists.flat()).slice(0, MAX_NEWS);

/** One item per link across keywords; the first keyword that found it keeps it. */
export function uniqueByUrl(items: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return items.filter((n) => {
    if (seen.has(n.url)) return false;
    seen.add(n.url);
    return true;
  });
}

const TAG_CRITERIA = {
  act: "Yes: it is timely and concrete, and gives the people they serve something to understand or do",
  watch: "Not now: background, thin, or nothing for those people to do",
};

export function newsAsk(i: CheckInput, n: NewsItem): Ask {
  return {
    state: { serves: i.audience, topics: i.topics.join(", "), country: COUNTRY, story: n.title, source: n.source, summary: n.snippet },
    questions: {
      relevant: { type: "noul", instructions: "Does the news `story` matter to the people a financial adviser serves (`serves`, in `country`), or touch the adviser's `topics`?" },
      news: {
        type: "noul",
        instructions: "Is `story` from `source` a news report or an explainer article (about a change, event, rule, price trend, scheme, or how something works)? No when it is a property or product listing, a sale, launch or rental page, a price table, a service advert, a contest, a job ad, a profile page, a forum thread, a video, or a social media post.",
      },
      sg: {
        type: "noul",
        instructions: "Is `story` from `source` about Singapore, or does it directly affect people living in Singapore (its rules, prices, schemes, banks, insurers or markets)? No when it is about another country only.",
      },
      tag: { type: "choice", instructions: "Should the adviser post about `story` this week for the people they serve?", criteria: TAG_CRITERIA },
    },
  };
}

export function judgeNews(n: NewsItem, answers: Record<string, JevAnswer> | null): JudgedNews {
  // Jev down (null answers): noulOf and choiceOf give null, so the item stays visible as unjudged Watch.
  const p = noulOf(answers, "relevant");
  const tag = choiceOf(answers, "tag", TAGS) ?? "watch";
  const prob = answers?.tag?.probabilities?.act;
  // without probabilities an "act" pick still qualifies, at the threshold
  const actScore = typeof prob === "number" && Number.isFinite(prob) ? prob : tag === "act" ? RELEVANT_AT : undefined;
  // without a news answer, relevance decides alone (as before this check existed)
  const isNews = noulOf(answers, "news");
  const local = noulOf(answers, "sg");
  const relevant = p === null ? null : p >= RELEVANT_AT && (isNews === null || isNews >= NEWS_AT) && (local === null || local >= SG_AT);
  return { ...n, relevant, tag, ...(actScore === undefined ? {} : { actScore }) };
}

/** Act for the `max` first reports Jev rates most worth posting about (at least 0.5), Watch for everything else. */
export function shortlistAct(items: JudgedNews[], max = ACT_SHORTLIST): JudgedNews[] {
  const top = new Set(
    items
      .filter((n) => n.relevant === true && !n.sameAs && (n.actScore ?? 0) >= RELEVANT_AT)
      .sort((a, b) => (b.actScore ?? 0) - (a.actScore ?? 0))
      .slice(0, max)
      .map((n) => n.url),
  );
  return items.map((n) => ({ ...n, tag: top.has(n.url) ? "act" : "watch" }));
}

/** Jev picks which earlier relevant report tells the same story, or none. Every earlier one is offered (at most 39), so a repeat found under a later topic still sees the first report. */
export function sameStoryAsk(n: NewsItem, earlier: JudgedNews[]): (Ask & { ids: string[] }) | null {
  const cands = earlier.filter((e) => e.relevant && !e.sameAs).slice(0, MAX_NEWS);
  if (!cands.length) return null;
  const criteria: Record<string, string> = { none: "None of them: a different story" };
  cands.forEach((c, k) => {
    criteria[`s${k}`] = c.title;
  });
  return {
    state: { story: n.title },
    questions: { same: { type: "choice", instructions: "Which earlier report tells the same news or event as `story`?", criteria } },
    ids: cands.map((c) => c.url),
  };
}

export function sameStoryOf(answers: Record<string, JevAnswer> | null, ids: string[]): string | undefined {
  const pick = choiceOf(answers, "same", ["none", ...ids.map((_, k) => `s${k}`)]);
  return pick && pick !== "none" ? ids[Number(pick.slice(1))] : undefined;
}

/** Points every repeat at the first report of its story (a -> b -> c becomes a -> c). */
export function foldStories(items: JudgedNews[]): JudgedNews[] {
  const byUrl = new Map(items.map((n) => [n.url, n]));
  const root = (n: JudgedNews, hops = 0): string => {
    const up = n.sameAs ? byUrl.get(n.sameAs) : undefined;
    return up && up !== n && hops < 50 ? root(up, hops + 1) : n.url;
  };
  return items.map((n) => (n.sameAs ? { ...n, sameAs: root(n) } : n));
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** The answer text and every linked source in a DataForSEO llm_scraper reply; null when the task has no result. */
export function parseAnswer(body: unknown, name = ""): { answer: string; sources: Source[]; named: string[]; checkUrl: string | null } | null {
  const res = (body as { tasks?: { result?: unknown[] | null }[] } | null)?.tasks?.[0]?.result?.[0];
  if (!res || typeof res !== "object") return null;
  const r = res as Record<string, unknown>;
  const seen = new Map<string, Source>();
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>;
    const isImage = typeof o.type === "string" && o.type.includes("image");
    if (!isImage && typeof o.url === "string" && /^https?:\/\//.test(o.url) && !seen.has(o.url)) {
      const domain = (typeof o.domain === "string" && o.domain ? o.domain : hostOf(o.url)).toLowerCase().replace(/^www\./, "");
      if (domain) seen.set(o.url, { url: o.url, domain, title: text(o.title, 140) });
    }
    Object.values(o).forEach(walk);
  };
  // The answer's citations: the top-level sources plus those inside its paragraphs. search_results are search hits
  // the answer may never cite (12 of 16 on the first real read were US WSJ pages), so they are skipped.
  walk(r.sources);
  walk(r.items);
  const named = [...new Set((Array.isArray(r.brand_entities) ? r.brand_entities : [])
    .map((e) => text((e as { title?: unknown } | null)?.title, 80))
    .filter((t) => t && !namedIn(t, name)))].slice(0, 8);
  return { answer: typeof r.markdown === "string" ? r.markdown : "", sources: [...seen.values()], named, checkUrl: typeof r.check_url === "string" ? r.check_url : null };
}

/** A whole name of 3 or more letters in the answer, case blind: "Ian" is not in "guardian". A blank name is never "in" anything. */
export function namedIn(answer: string, name: string): boolean {
  const n = name.trim();
  if (n.length < 3) return false;
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(answer);
}

/** MIA GEO's four positions. Cited: a page on the adviser's own site is a source. */
export function position(answer: string, sources: Source[], scope: string, name: string, judged: "passing" | "named" | null): Position {
  if (sources.some((s) => citesSite(s.url, scope))) return "cited";
  if (!namedIn(answer, name)) return "not-mentioned";
  return judged ?? "named";
}

export function geoAsk(name: string, answer: string): Ask {
  return {
    state: { name, answer: answer.slice(0, 6000) },
    questions: {
      how: {
        type: "choice",
        instructions: "How does the AI `answer` treat `name`?",
        criteria: { passing: "Named in a list or aside with nothing said about them", named: "Carried in the body of the answer: described, recommended or reasoned about" },
      },
    },
  };
}

export const geoJudged = (answers: Record<string, JevAnswer> | null) => choiceOf(answers, "how", ["passing", "named"] as const);

export function postAsk(i: CheckInput, p: MarketPost): Ask {
  return {
    state: { serves: i.audience, topics: i.topics.join(", "), competitor: `@${p.handle}`, post: p.caption },
    questions: {
      tag: {
        type: "choice",
        instructions: "This post by `competitor` did better than their usual posts. Should the adviser make their own post on its angle this week for the people they serve?",
        criteria: TAG_CRITERIA,
      },
    },
  };
}

export const judgePost = (p: MarketPost, answers: Record<string, JevAnswer> | null): JudgedPost => ({ ...p, tag: choiceOf(answers, "tag", TAGS) ?? "watch" });

export const SUGGEST_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "market_setup",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["keywords", "questions"],
      properties: { keywords: { type: "array", items: { type: "string" } }, questions: { type: "array", items: { type: "string" } } },
    },
  },
};

/** The website goes in by name only: its pages are never fetched, so there is no request to an address the adviser typed. */
export function suggestMessages(s: { name: string; audience: string; topics: string[]; site: string }) {
  const user = [
    `Adviser: ${s.name || "not given"}`,
    `Who they serve: ${s.audience}`,
    s.topics.length ? `Topics they post about: ${s.topics.join(", ")}` : "",
    s.site ? `Their website: ${s.site}` : "",
    "",
    "keywords: 8 short news search terms (1 to 3 words) for Singapore news these people would care about this month: a scheme, a rule, a product type or a life event.",
    "questions: 8 questions these people would type into ChatGPT when they want help with their money or are looking for an adviser, in their own words, each under 15 words.",
  ];
  return [
    { role: "system", content: "You help a financial adviser in Singapore watch their market. Answer in JSON only." },
    { role: "user", content: user.filter((l, k) => l || k === 4).join("\n") },
  ];
}

export function parseSuggest(content: unknown): { keywords: string[]; questions: string[] } {
  try {
    const o = JSON.parse(String(content));
    return { keywords: cleanTerms(o?.keywords), questions: cleanQuestions(o?.questions, MAX_CANDIDATES) };
  } catch {
    return { keywords: [], questions: [] };
  }
}

export function keepAsk(kind: "keyword" | "question", audience: string, value: string): Ask {
  const instructions = kind === "keyword"
    ? "Would the people `serves` in `country` care about Singapore news on `keyword`?"
    : "Would one of the people `serves` in `country` ask an AI assistant `question`?";
  return { state: { serves: audience, country: COUNTRY, [kind]: value }, questions: { keep: { type: "noul", instructions } } };
}

/** Jev's best `max` at or above 0.5; the LLM's own first `max` when Jev answered none. */
export function keepTop(values: string[], scores: (number | null)[], max = 5): string[] {
  if (scores.every((s) => s === null)) return values.slice(0, max);
  return values
    .map((v, k) => ({ v, s: scores[k] ?? 0 }))
    .filter((x) => x.s >= RELEVANT_AT)
    .sort((a, b) => b.s - a.s)
    .slice(0, max)
    .map((x) => x.v);
}

