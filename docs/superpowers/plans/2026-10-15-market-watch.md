# Your market (market watch) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Discover > Your market page where an adviser sets up their market once and runs one check a week that returns news, ChatGPT-answer positions and competitors' best posts, each tagged Act or Watch, with a Write link.

**Architecture:** One new edge function `market` (actions status, suggest, check) with every rule in a tested `logic.ts`; one client lib `src/lib/market.ts` holding a synced per-profile key and a check job that outlives the page; one page `MarketPage.tsx`. Keywords stay in Mentions' key and competitors in Following's key.

**Tech Stack:** Vite + React + TypeScript, Tailwind + shadcn/ui, Supabase edge functions (Deno), vitest, DataForSEO, Jev (jev-1.13.0), OpenAI through `_shared/openaiChat.ts`.

**Spec:** `docs/superpowers/specs/2026-10-15-market-watch-design.md`

Code blocks carry `file=<path>`: each one is the whole file at that path.

## Global Constraints

- Leo only: `MARKET_USERS` (user ids separated by commas, or `*`); `status` answers 200 `{enabled:false}` when off; other actions 404.
- One check a week: refuse when `cs_ai_usage` has a `market-check` row with count > 0 on any of the 6 UTC days before today; then `consumeUsage(market-check)` with limit 1; `market-check-global` 20 a day on `GLOBAL_COUNTER_USER`; `market-suggest` 5 a day.
- At most 5 questions, 5 keywords (Mentions' rule), 10 posts, 20 sources per answer.
- Jev pinned `jev-1.13.0` through `_shared/jev.ts`; relevant means noul >= 0.5; every Jev failure keeps the item (Watch, unjudged) or falls back to "named".
- No new table, migration, dependency or cron. ASCII only in copy; no em dashes.
- Deep links: `/market?show=act|all` (default act), `/market?view=setup`; both replace history.

## Review Focus

1. An adviser with no website: a blank host must never mark an answer "cited" (`endsWith(".")` and `"".includes` traps). Pinned in Task 1.
2. A blank or 1-2 letter name must never count as "mentioned" (an empty string is in every answer). Pinned in Task 1.
3. Jev down: news items stay visible as Watch with relevant null, GEO falls back to "named", suggestions keep the LLM's first 5. Pinned in Task 1.
4. The week boundary: a check counted 6 days ago blocks, 7 days ago does not; the next day shown is 7 days after the latest one. Pinned in Task 1 (server) and Task 3 (client agrees).
5. Corrupt or foreign data in the synced key (old shape, wrong types) loads as an empty market instead of crashing the page. Pinned in Task 3.

---

### Task 1: Server rules (`market/logic.ts`)

**Files:**
- Create: `supabase/functions/market/logic.ts`
- Test: `supabase/functions/market/logic.test.ts`
- Create: `supabase/functions/market/fixtures/chatgpt-answer.json` (one real DataForSEO llm_scraper answer, trimmed)

**Interfaces:**
- Consumes: `askJev` types and `choiceOf`, `noulOf` from `_shared/jev.ts`; `decode`, `safeFeedUrl` from `feed-ideas/logic.ts`; `cleanKeywords`, `Mention` from `mentions/logic.ts`.
- Produces: types `Position`, `Tag`, `MarketPost`, `CheckInput`, `NewsItem`, `JudgedNews`, `Source`, `GeoRead`, `JudgedPost`, `MarketDigest`, `Ask`; functions `isAllowed`, `cleanQuestions`, `cleanTerms`, `siteHost`, `cleanPosts`, `cleanInput`, `checkProblem`, `earlierWeekDays`, `weekGate`, `utcDay`, `dayWords`, `newsItems`, `uniqueByUrl`, `newsAsk`, `judgeNews`, `sameStoryAsk`, `sameStoryOf`, `foldStories`, `parseAnswer`, `namedIn`, `position`, `geoAsk`, `geoJudged`, `postAsk`, `judgePost`, `SUGGEST_FORMAT`, `suggestMessages`, `parseSuggest`, `keepAsk`, `keepTop`, `htmlText`.

- [ ] **Step 1: Save a real answer as the fixture.** One live read (USD 0.004) of "best financial adviser for young families in Singapore" through `ai_optimization/chat_gpt/llm_scraper/live/advanced`, keeping `tasks[0].result[0]` with `markdown` cut to 1,500 characters and `items` cut to the first 12, wrapped back as `{ "tasks": [{ "status_code": 20000, "result": [ ... ] }] }`.

- [ ] **Step 2: Write the failing tests**

```ts file=supabase/functions/market/logic.test.ts
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/chatgpt-answer.json";
import {
  checkProblem, cleanInput, cleanPosts, cleanQuestions, cleanTerms, dayWords, earlierWeekDays, foldStories, geoJudged, htmlText,
  isAllowed, judgeNews, judgePost, keepTop, namedIn, newsItems, paidPartsFailed, parseAnswer, parseSuggest, position, sameStoryAsk, sameStoryOf,
  siteHost, uniqueByUrl, weekGate, type JudgedNews, type NewsItem, type Source,
} from "./logic";

const src = (url: string): Source => ({ url, domain: new URL(url).hostname, title: "" });
const news = (url: string, title = "Story", keyword = "CPF"): NewsItem => ({ keyword, title, url, source: "straitstimes.com", date: "2026-10-14", snippet: "" });
const judged = (url: string, extra: Partial<JudgedNews> = {}): JudgedNews => ({ ...news(url), relevant: true, tag: "act", ...extra });

describe("who it is switched on for", () => {
  it("allows listed ids or *, and nobody on a blank list", () => {
    expect(isAllowed("a, b", "b")).toBe(true);
    expect(isAllowed("*", "x")).toBe(true);
    expect(isAllowed("a", "b")).toBe(false);
    expect(isAllowed(undefined, "a")).toBe(false);
    expect(isAllowed("a", "")).toBe(false);
  });
});

describe("cleaning what the browser sends", () => {
  it("keeps 5 distinct questions of 8 to 160 characters", () => {
    expect(cleanQuestions(["  How much   insurance do I need? ", "how much insurance do i need?", "short", 7, "a".repeat(200), "q1 is long enough", "q2 is long enough", "q3 is long enough", "q4 is long enough"]))
      .toEqual(["How much insurance do I need?", "a".repeat(160), "q1 is long enough", "q2 is long enough", "q3 is long enough"]);
    expect(cleanQuestions("not a list")).toEqual([]);
  });

  it("keeps up to 8 distinct short terms without quotes", () => {
    expect(cleanTerms(['"CPF LIFE"', "cpf life", "x", "MediShield", ...Array.from({ length: 10 }, (_, k) => `term ${k}`)])).toHaveLength(8);
    expect(cleanTerms(['"CPF LIFE"'])).toEqual(["CPF LIFE"]);
  });

  it("reads a site as its public host only", () => {
    expect(siteHost("https://www.leotan.sg/about")).toBe("leotan.sg");
    expect(siteHost("leotan.sg")).toBe("leotan.sg");
    expect(siteHost("http://localhost:3000")).toBe("");
    expect(siteHost("http://10.0.0.1")).toBe("");
    expect(siteHost("")).toBe("");
    expect(siteHost(42)).toBe("");
  });

  it("drops posts without a public link, id, handle or caption, and stops at 10", () => {
    const ok = { id: "1", url: "https://www.instagram.com/p/abc/", handle: "@rival", caption: "Five CPF myths" };
    expect(cleanPosts([ok, { ...ok, url: "javascript:alert(1)" }, { ...ok, caption: " " }, null])).toEqual([{ ...ok, handle: "rival" }]);
    expect(cleanPosts(Array.from({ length: 12 }, (_, k) => ({ ...ok, id: String(k) })))).toHaveLength(10);
  });

  it("needs who they serve and at least one thing to check", () => {
    expect(checkProblem(cleanInput({ questions: ["How much insurance do I need?"] }))).toMatch(/who you serve/);
    expect(checkProblem(cleanInput({ audience: "young families" }))).toMatch(/question or a news topic/);
    expect(checkProblem(cleanInput({ audience: "young families", keywords: ["CPF"] }))).toBeNull();
  });
});

describe("one check a week", () => {
  const now = new Date("2026-10-15T03:00:00Z");
  it("looks at the 6 UTC days before today", () => {
    expect(earlierWeekDays(now)).toEqual(["2026-10-14", "2026-10-13", "2026-10-12", "2026-10-11", "2026-10-10", "2026-10-09"]);
  });

  it("is closed by a check 6 days ago and opens 7 days after the latest one", () => {
    expect(weekGate([{ day: "2026-10-09", count: 1 }], now)).toEqual({ open: false, nextDay: "2026-10-16" });
    expect(weekGate([{ day: "2026-10-09", count: 1 }, { day: "2026-10-12", count: 1 }], now)).toEqual({ open: false, nextDay: "2026-10-19" });
  });

  it("is open after 7 days, for refunded rows, and for junk rows", () => {
    expect(weekGate([{ day: "2026-10-08", count: 1 }], now)).toEqual({ open: true });
    expect(weekGate([{ day: "2026-10-12", count: 0 }], now)).toEqual({ open: true });
    expect(weekGate([{ day: 5 }, null], now)).toEqual({ open: true });
    expect(weekGate(null, now)).toEqual({ open: true });
  });

  it("says the day in words", () => {
    expect(dayWords("2026-10-22")).toBe("Thu 22 Oct");
  });
});

describe("news", () => {
  it("keeps titled items with public links, one per link", () => {
    const items = newsItems("CPF", [
      { title: "CPF changes", url: "https://www.straitstimes.com/a", source: "www.straitstimes.com", snippet: "", date: "2026-10-14" },
      { title: "", url: "https://x.com/b", source: "x", snippet: "", date: "" },
      { title: "Bad", url: "ftp://x.com/c", source: "x", snippet: "", date: "" },
    ]);
    expect(items).toEqual([{ keyword: "CPF", title: "CPF changes", url: "https://www.straitstimes.com/a", source: "straitstimes.com", date: "2026-10-14", snippet: "" }]);
    expect(uniqueByUrl([news("https://a.sg/1"), news("https://a.sg/1", "Story", "MediShield"), news("https://a.sg/2")]).map((n) => n.keyword)).toEqual(["CPF", "CPF"]);
  });

  it("reads Jev's answers, and keeps the item as Watch when Jev is down", () => {
    expect(judgeNews(news("https://a.sg/1"), { relevant: { type: "noul", noul: 0.74 }, tag: { type: "choice", choice: "act" } })).toMatchObject({ relevant: true, tag: "act" });
    expect(judgeNews(news("https://a.sg/1"), { relevant: { type: "noul", noul: 0.32 }, tag: { type: "choice", choice: "act" } })).toMatchObject({ relevant: false });
    expect(judgeNews(news("https://a.sg/1"), { relevant: { type: "noul", noul: 0.9 }, tag: { type: "choice", choice: "maybe" } })).toMatchObject({ tag: "watch" });
    expect(judgeNews(news("https://a.sg/1"), null)).toMatchObject({ relevant: null, tag: "watch" });
  });

  it("asks about the same story only against earlier relevant reports", () => {
    const earlier = [judged("https://a.sg/1"), judged("https://a.sg/2", { relevant: false }), judged("https://a.sg/3", { sameAs: "https://a.sg/1" })];
    const ask = sameStoryAsk(news("https://a.sg/4"), earlier)!;
    expect(ask.ids).toEqual(["https://a.sg/1"]);
    expect(Object.keys((ask.questions.same as { criteria: object }).criteria)).toEqual(["none", "s0"]);
    expect(sameStoryAsk(news("https://a.sg/4"), [])).toBeNull();
    expect(sameStoryOf({ same: { type: "choice", choice: "s0" } }, ask.ids)).toBe("https://a.sg/1");
    expect(sameStoryOf({ same: { type: "choice", choice: "none" } }, ask.ids)).toBeUndefined();
    expect(sameStoryOf(null, ask.ids)).toBeUndefined();
  });

  it("points every repeat at the first report of its story", () => {
    const folded = foldStories([judged("https://a.sg/1"), judged("https://a.sg/2", { sameAs: "https://a.sg/1" }), judged("https://a.sg/3", { sameAs: "https://a.sg/2" })]);
    expect(folded.map((n) => n.sameAs)).toEqual([undefined, "https://a.sg/1", "https://a.sg/1"]);
  });
});

describe("AI answers", () => {
  it("parses a real ChatGPT search answer", () => {
    const a = parseAnswer(fixture)!;
    expect(a.answer.length).toBeGreaterThan(100);
    expect(a.sources.length).toBeGreaterThan(2);
    expect(a.sources.every((s) => /^https?:\/\//.test(s.url) && s.domain && !s.domain.startsWith("www."))).toBe(true);
    expect(new Set(a.sources.map((s) => s.url)).size).toBe(a.sources.length);
    expect(a.checkUrl).toMatch(/^https:\/\/chatgpt\.com/);
    expect(a.sources.some((s) => s.domain === "localrank.sg")).toBe(true);
    // cited only in the top-level sources, never inside a paragraph
    expect(a.sources.some((s) => s.domain === "moneysense.gov.sg")).toBe(true);
    expect(a.sources.some((s) => s.domain === "wsj.com")).toBe(false);
  });

  it("returns null for an errored or empty task", () => {
    expect(parseAnswer({ tasks: [{ status_code: 40501, result: null }] })).toBeNull();
    expect(parseAnswer(null)).toBeNull();
  });

  it("matches a name of 3 or more letters, case blind", () => {
    expect(namedIn("Try Leo Tan or a robo-adviser.", "leo tan")).toBe(true);
    expect(namedIn("Anything at all.", "")).toBe(false);
    expect(namedIn("Leo is mentioned.", "Le")).toBe(false);
  });

  it("places the adviser: cited, not mentioned, then Jev's call", () => {
    const sources = [src("https://www.moneysmart.sg/x"), src("https://blog.leotan.sg/post")];
    expect(position("Nothing about him.", sources, "leotan.sg", "Leo Tan", null)).toBe("cited");
    expect(position("Nothing about him.", [src("https://moneysmart.sg/x")], "leotan.sg", "Leo Tan", null)).toBe("not-mentioned");
    expect(position("Leo Tan, Jane Lim and others.", [], "leotan.sg", "Leo Tan", "passing")).toBe("passing");
    expect(position("Leo Tan explains CPF well.", [], "", "Leo Tan", null)).toBe("named");
  });

  it("never cites on a blank site and never names on a blank name", () => {
    expect(position("Leo Tan", [src("https://moneysmart.sg/x"), { url: "mailto:a@b.co", domain: "", title: "" }], "", "Leo Tan", "named")).toBe("named");
    expect(position("Everything", [src("https://moneysmart.sg/x")], "", "", "named")).toBe("not-mentioned");
  });

  it("reads Jev's passing or named, else nothing", () => {
    expect(geoJudged({ how: { type: "choice", choice: "passing" } })).toBe("passing");
    expect(geoJudged({ how: { type: "choice", choice: "cited" } })).toBeNull();
    expect(geoJudged(null)).toBeNull();
  });
});

describe("when a check is given back", () => {
  const input = (keywords: string[], questions: string[]) => cleanInput({ audience: "families", keywords, questions });
  const failed = { question: "q", position: null, sources: [], checkUrl: null, error: "x" };
  const read = { question: "q", position: "named" as const, sources: [], checkUrl: null };
  it("refunds only when every paid part that was asked for failed", () => {
    expect(paidPartsFailed(input(["CPF"], ["Is CPF enough for me?"]), true, [failed])).toBe(true);
    expect(paidPartsFailed(input([], ["Is CPF enough for me?"]), false, [failed])).toBe(true);
    expect(paidPartsFailed(input(["CPF"], []), true, [])).toBe(true);
    expect(paidPartsFailed(input(["CPF"], ["Is CPF enough for me?"]), false, [failed])).toBe(false);
    expect(paidPartsFailed(input(["CPF"], ["Is CPF enough for me?"]), true, [read])).toBe(false);
    expect(paidPartsFailed(input([], []), false, [])).toBe(false);
  });
});

describe("competitor posts", () => {
  it("tags Act or Watch, Watch when Jev is down", () => {
    const p = { id: "1", url: "https://www.instagram.com/p/a/", handle: "rival", caption: "CPF myths" };
    expect(judgePost(p, { tag: { type: "choice", choice: "act" } }).tag).toBe("act");
    expect(judgePost(p, null).tag).toBe("watch");
  });
});

describe("set-up suggestions", () => {
  it("parses the LLM's JSON and survives junk", () => {
    expect(parseSuggest('{"keywords":["CPF LIFE","x"],"questions":["How much do I need to retire in Singapore?"]}')).toEqual({ keywords: ["CPF LIFE"], questions: ["How much do I need to retire in Singapore?"] });
    expect(parseSuggest("not json")).toEqual({ keywords: [], questions: [] });
  });

  it("keeps Jev's best 5 at or above 0.5, or the LLM's first 5 when Jev is down", () => {
    const v = ["a", "b", "c", "d", "e", "f", "g"];
    expect(keepTop(v, [0.2, 0.9, 0.6, 0.5, null, 0.7, 0.8])).toEqual(["b", "g", "f", "c", "d"]);
    expect(keepTop(v, v.map(() => null))).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("turns a home page into plain text", () => {
    expect(htmlText("<html><head><style>p{}</style><script>x()</script></head><body><h1>Leo &amp; Co</h1><p>Plans   for <b>families</b></p></body></html>"))
      .toBe("Leo & Co Plans for families");
  });
});
```

- [ ] **Step 3: Run to see it fail.** `npx vitest run supabase/functions/market/logic.test.ts` fails: cannot find `./logic`.

- [ ] **Step 4: Write the rules**

```ts file=supabase/functions/market/logic.ts
// The market edge function's rules (Discover > Your market). Everything that cleans, gates or decides lives here
// so vitest can run it; index.ts only wires Supabase, DataForSEO, OpenAI and Jev. Ported from the market-loop
// skill (~/.claude/skills/market-loop, 2026-10-15), which condenses MIA (mia.ambr.io).

import { choiceOf, noulOf, type JevAnswer, type JevQuestion } from "../_shared/jev.ts";
import { decode, safeFeedUrl } from "../feed-ideas/logic.ts";
import { cleanKeywords, type Mention } from "../mentions/logic.ts";

export const MAX_QUESTIONS = 5;
export const MAX_POSTS = 10;
export const MAX_CANDIDATES = 8;
export const MAX_SOURCES = 20;
/** A Jev yes at or above this counts; on the AT market-loop run (2026-10-15) the lower yeses were junk. */
export const RELEVANT_AT = 0.5;
export const SAME_STORY_CANDIDATES = 10;
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
}
export interface Source { url: string; domain: string; title: string }
export interface GeoRead { question: string; position: Position | null; sources: Source[]; checkUrl: string | null; error?: string }
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

/** The site's host without www, or "" when there is none or it is not a public web address. */
export function siteHost(raw: unknown): string {
  const t = text(raw, 300);
  if (!t) return "";
  const u = safeFeedUrl(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  return u ? u.hostname.toLowerCase().replace(/^www\./, "") : "";
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
    site: siteHost(b.site),
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

/** "Thu 22 Oct". */
export const dayWords = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function newsItems(keyword: string, items: Mention[]): NewsItem[] {
  return items
    .filter((m) => safeFeedUrl(m.url))
    .map((m) => ({ keyword, title: text(m.title, 200), url: m.url, source: text(m.source, 80).replace(/^www\./, ""), date: text(m.date, 40), snippet: text(m.snippet, 300) }))
    .filter((n) => n.title);
}

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
    state: { serves: i.audience, topics: i.topics.join(", "), country: COUNTRY, story: `${n.title} (${n.source})`, summary: n.snippet },
    questions: {
      relevant: { type: "noul", instructions: "Does the news `story` matter to the people a financial adviser serves (`serves`, in `country`), or touch the adviser's `topics`?" },
      tag: { type: "choice", instructions: "Should the adviser post about `story` this week for the people they serve?", criteria: TAG_CRITERIA },
    },
  };
}

export function judgeNews(n: NewsItem, answers: Record<string, JevAnswer> | null): JudgedNews {
  // Jev down (null answers): noulOf and choiceOf give null, so the item stays visible as unjudged Watch.
  const p = noulOf(answers, "relevant");
  return { ...n, relevant: p === null ? null : p >= RELEVANT_AT, tag: choiceOf(answers, "tag", TAGS) ?? "watch" };
}

/** Jev picks which earlier relevant report (at most 10) tells the same story, or none. */
export function sameStoryAsk(n: NewsItem, earlier: JudgedNews[]): (Ask & { ids: string[] }) | null {
  const cands = earlier.filter((e) => e.relevant && !e.sameAs).slice(-SAME_STORY_CANDIDATES);
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
export function parseAnswer(body: unknown): { answer: string; sources: Source[]; checkUrl: string | null } | null {
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
  return { answer: typeof r.markdown === "string" ? r.markdown : "", sources: [...seen.values()], checkUrl: typeof r.check_url === "string" ? r.check_url : null };
}

/** A name of 3 or more letters inside the answer, case blind. A blank name is never "in" anything. */
export function namedIn(answer: string, name: string): boolean {
  const n = name.trim().toLowerCase();
  return n.length >= 3 && answer.toLowerCase().includes(n);
}

/** MIA GEO's four positions. Cited: a page on the adviser's own site is a source. */
export function position(answer: string, sources: Source[], host: string, name: string, judged: "passing" | "named" | null): Position {
  if (host && sources.some((s) => { const h = hostOf(s.url); return h === host || h.endsWith(`.${host}`); })) return "cited";
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

export function suggestMessages(s: { name: string; audience: string; topics: string[]; siteText: string }) {
  const user = [
    `Adviser: ${s.name || "not given"}`,
    `Who they serve: ${s.audience}`,
    s.topics.length ? `Topics they post about: ${s.topics.join(", ")}` : "",
    s.siteText ? `Their website says: ${s.siteText}` : "",
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

export function htmlText(html: string, max = 3000): string {
  const bare = html.replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ");
  return decode(bare).replace(/\s+/g, " ").trim().slice(0, max);
}
```

- [ ] **Step 5: Run to see it pass.** `npx vitest run supabase/functions/market/logic.test.ts`: all pass. Then prove the Review Focus lines bite: delete `host &&` in `position`, and `n.length >= 3 &&` in `namedIn`; each makes a test fail; restore.

- [ ] **Step 6: Commit.** `git add supabase/functions/market && git commit -m "feat: add the market function's rules for Your market"`

### Task 2: The edge function (`market/index.ts`) and caps

**Files:**
- Create: `supabase/functions/market/index.ts`
- Modify: `supabase/functions/_shared/usageCaps.ts` (three caps after `"track-accounts": 10,`)

**Interfaces:**
- Consumes: everything Task 1 produces; `askJev`, `noulOf`; `openaiChat`, `OPENAI_MODEL`; `consumeUsage`, `refundUsage`, `usageRefusal`, `GLOBAL_COUNTER_USER`; `parseNews`, `searchTerm` from `mentions/logic.ts`; `safeFeedUrl`.
- Produces: POST `market` with `{action:"status"}` -> `{enabled}`; `{action:"suggest", name, site, audience, topics}` -> `{keywords, questions}`; `{action:"check", name, site, audience, topics, questions, keywords, posts}` -> `MarketDigest`; refusals `{error, code?}` with 400, 401, 404 (not enabled), 429 (`weekly_limit` with `nextDay`, or `daily_limit`), 502, 503.

- [ ] **Step 1: Add the caps**

```ts
  // Your market (market): one check a week per adviser (the function also refuses when one was counted in the 6 days
  // before), up to 5 ChatGPT answers at about USD 0.004 each plus the news; across everyone 20 a day on GLOBAL_COUNTER_USER.
  "market-check": 1,
  "market-check-global": 20,
  // Set-up suggestions on Your market (market suggest): the LLM writes candidates, Jev keeps the ones that fit.
  "market-suggest": 5,
```

- [ ] **Step 2: Write the function**

```ts file=supabase/functions/market/index.ts
// Your market (Discover > Your market): one check a week of an adviser's market. ChatGPT search's answer to up to
// 5 client questions (DataForSEO llm_scraper, about USD 0.004 each), the news on their Mentions keywords (the same
// request as mentions) and their Following accounts' best posts, each judged by Jev against who they serve.
// Leo only while MARKET_USERS lists him. Rules in logic.ts (tested); design in
// docs/superpowers/specs/2026-10-15-market-watch-design.md.
//
// Secrets: MARKET_USERS (user ids separated by commas, or *), DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD,
// OPENAI_API_KEY, TYPESAFE_API_KEY. Deploy WITH JWT verification:
//   supabase functions deploy market --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { askJev, noulOf } from "../_shared/jev.ts";
import { OPENAI_MODEL, openaiChat } from "../_shared/openaiChat.ts";
import { consumeUsage, GLOBAL_COUNTER_USER, refundUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { safeFeedUrl } from "../feed-ideas/logic.ts";
import { parseNews, searchTerm } from "../mentions/logic.ts";
import {
  type Ask, type CheckInput, type GeoRead, type JudgedNews, type MarketDigest, MAX_SOURCES, checkProblem, cleanInput, dayWords,
  earlierWeekDays, foldStories, geoAsk, geoJudged, htmlText, isAllowed, judgeNews, judgePost, keepAsk, keepTop, newsAsk, newsItems,
  paidPartsFailed, parseAnswer, parseSuggest, position, postAsk, sameStoryAsk, sameStoryOf, SUGGEST_FORMAT, suggestMessages, uniqueByUrl, utcDay,
  weekGate,
} from "./logic.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
const SINGAPORE = 2702;
// deno-lint-ignore no-explicit-any
type Admin = any; // as clone-reel: ReturnType<typeof createClient> resolves to a schema the usage helpers reject

const jev = (a: Ask, who: string) => askJev(a.state, a.questions, { who });

async function dfs(path: string, task: Record<string, unknown>, auth: string, timeoutMs: number): Promise<unknown> {
  const res = await fetch(`https://api.dataforseo.com/v3/${path}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify([task]),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`DataForSEO answered ${res.status}`);
  return await res.json();
}

/** fn over items, at most `limit` at a time, results in order. */
async function pool<T, R>(items: T[], limit: number, fn: (t: T, k: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const k = next++;
      out[k] = await fn(items[k], k);
    }
  }));
  return out;
}

/**
 * The site's home page as plain text: public http(s) hosts only (safeFeedUrl, as feed-ideas), 3 redirects each
 * re-checked, 512 KB read at most. Like feed-ideas, a public name that resolves to a private address is not caught.
 */
async function siteText(host: string): Promise<string> {
  let url = safeFeedUrl(`https://${host}`);
  for (let hop = 0; url && hop < 4; hop++) {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "ContentStudio-Market/1.0", Accept: "text/html" } });
    if (res.status >= 300 && res.status < 400) {
      url = safeFeedUrl(new URL(res.headers.get("location") ?? "", url).href);
      continue;
    }
    if (!res.ok || !res.body) return "";
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
      if (size > 512_000) {
        await reader.cancel();
        break;
      }
    }
    const all = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      all.set(c, at);
      at += c.byteLength;
    }
    return htmlText(new TextDecoder().decode(all));
  }
  return "";
}

async function suggest(admin: Admin, uid: string, body: unknown): Promise<Response> {
  const input = cleanInput(body);
  if (!input.audience) return json({ error: "Say who you serve first." }, 400);
  if (!Deno.env.get("OPENAI_API_KEY")) return json({ error: "Suggestions aren't switched on yet." }, 503);
  const usage = await consumeUsage(admin, uid, "market-suggest");
  if (!usage.allowed) {
    const r = usageRefusal(usage);
    return json(r.body, r.status);
  }
  const site = input.site ? await siteText(input.site).catch(() => "") : "";
  const res = await openaiChat(
    { model: OPENAI_MODEL, max_tokens: 900, response_format: SUGGEST_FORMAT, messages: suggestMessages({ ...input, siteText: site }) },
    { signal: AbortSignal.timeout(45_000) },
  );
  if (!res.ok) {
    console.error("market suggest: openai", res.status, (await res.text().catch(() => "")).slice(0, 200));
    return json({ error: "Couldn't suggest anything right now. Add your own below." }, 502);
  }
  const cand = parseSuggest((await res.json())?.choices?.[0]?.message?.content);
  const score = (kind: "keyword" | "question") => async (v: string) => noulOf(await jev(keepAsk(kind, input.audience, v), "market keep"), "keep");
  const [kw, qs] = await Promise.all([Promise.all(cand.keywords.map(score("keyword"))), Promise.all(cand.questions.map(score("question")))]);
  return json({ keywords: keepTop(cand.keywords, kw), questions: keepTop(cand.questions, qs) });
}

async function readAnswer(question: string, input: CheckInput, auth: string): Promise<GeoRead> {
  try {
    const parsed = parseAnswer(await dfs("ai_optimization/chat_gpt/llm_scraper/live/advanced", { keyword: question, location_code: SINGAPORE, language_code: "en", force_web_search: true }, auth, 100_000));
    if (!parsed) return { question, position: null, sources: [], checkUrl: null, error: "No answer came back for this one." };
    let pos = position(parsed.answer, parsed.sources, input.site, input.name, null);
    if (pos === "named") pos = position(parsed.answer, parsed.sources, input.site, input.name, geoJudged(await jev(geoAsk(input.name, parsed.answer), "market geo")));
    return { question, position: pos, sources: parsed.sources.slice(0, MAX_SOURCES), checkUrl: parsed.checkUrl };
  } catch (e) {
    console.error("market geo failed", msg(e));
    return { question, position: null, sources: [], checkUrl: null, error: "Couldn't read the AI answer for this one." };
  }
}

/** The news for every keyword, judged, with repeats pointed at their first report. null when every lookup failed. */
async function readNews(input: CheckInput, auth: string): Promise<JudgedNews[] | null> {
  const found = await Promise.all(input.keywords.map(async (k) => {
    try {
      return newsItems(k, parseNews(await dfs("serp/google/news/live/advanced", { keyword: searchTerm(k), location_code: SINGAPORE, language_code: "en", depth: 10 }, auth, 25_000)));
    } catch (e) {
      console.error("market news failed", msg(e));
      return null;
    }
  }));
  if (input.keywords.length && found.every((f) => f === null)) return null;
  const items = uniqueByUrl(found.flatMap((f) => f ?? []));
  const judged = await pool(items, 10, async (n) => judgeNews(n, await jev(newsAsk(input, n), "market news")));
  const linked = await pool(judged, 10, async (n, k) => {
    const a = n.relevant ? sameStoryAsk(n, judged.slice(0, k)) : null;
    const sameAs = a ? sameStoryOf(await jev(a, "market same story"), a.ids) : undefined;
    return sameAs ? { ...n, sameAs } : n;
  });
  return foldStories(linked);
}

async function check(admin: Admin, uid: string, body: unknown): Promise<Response> {
  const input = cleanInput(body);
  const problem = checkProblem(input);
  if (problem) return json({ error: problem }, 400);
  const login = Deno.env.get("DATAFORSEO_LOGIN");
  const password = Deno.env.get("DATAFORSEO_PASSWORD");
  if (!login || !password) return json({ error: "Your market isn't switched on yet." }, 503);

  const now = new Date();
  const today = utcDay(now.getTime());
  const weekly = (nextDay: string) => json({ code: "weekly_limit", nextDay, error: `You've had this week's check. The next one opens ${dayWords(nextDay)} at 8am.` }, 429);
  const { data: rows, error } = await admin.from("cs_ai_usage").select("day,count").eq("user_id", uid).eq("feature", "market-check").in("day", earlierWeekDays(now));
  // Fail closed: these checks cost money, so an unreadable counter blocks them.
  if (error) return json({ code: "usage_unavailable", error: "This is unavailable for a moment. Try again shortly." }, 503);
  const gate = weekGate(rows, now);
  if (!gate.open) return weekly(gate.nextDay);
  const everyone = await consumeUsage(admin, GLOBAL_COUNTER_USER, "market-check-global");
  if (!everyone.allowed) {
    const r = usageRefusal(everyone);
    return json(r.body, r.status);
  }
  const usage = await consumeUsage(admin, uid, "market-check");
  if (!usage.allowed) {
    if (usage.reason === "limit") return weekly(utcDay(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000));
    const r = usageRefusal(usage);
    return json(r.body, r.status);
  }

  const auth = `Basic ${btoa(`${login}:${password}`)}`;
  const [geo, news, posts] = await Promise.all([
    Promise.all(input.questions.map((q) => readAnswer(q, input, auth))),
    readNews(input, auth),
    pool(input.posts, 10, async (p) => judgePost(p, await jev(postAsk(input, p), "market post"))),
  ]);
  if (paidPartsFailed(input, news === null, geo)) {
    await refundUsage(admin, uid, "market-check", today);
    await refundUsage(admin, GLOBAL_COUNTER_USER, "market-check-global", today);
    return json({ error: "Couldn't reach the news or the AI answers. This check wasn't counted; try again in a few minutes." }, 502);
  }
  const digest: MarketDigest = { checkedAt: now.toISOString(), news: news ?? [], geo, posts };
  return json(digest);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to check your market." }, 401);
    const enabled = isAllowed(Deno.env.get("MARKET_USERS"), uid);
    // off is a plain 200 for the status probe, so the browser logs no failed request
    if (body?.action === "status") return json({ enabled });
    if (!enabled) return json({ error: "Your market is not enabled for this account yet." }, 404);
    if (body?.action === "suggest") return await suggest(admin, uid, body);
    if (body?.action === "check") return await check(admin, uid, body);
    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error("market failed", msg(e));
    return json({ error: "Couldn't check your market right now. Try again in a minute." }, 500);
  }
});
```

- [ ] **Step 3: Type-check it with Deno** without touching node_modules: `deno check --no-lock --node-modules-dir=none supabase/functions/market/index.ts` (memory: `--node-modules-dir=auto` rewrote node_modules in a Vite repo).

- [ ] **Step 4: Run the caps tests.** `npx vitest run supabase/functions/_shared/usageCaps.test.ts src/lib/aiUsage.test.ts`: pass.

- [ ] **Step 5: Commit.** `git add supabase/functions/market/index.ts supabase/functions/_shared/usageCaps.ts && git commit -m "feat: add the market function (status, suggest, weekly check)"`

### Task 3: Client state and the check job (`src/lib/market.ts`)

**Files:**
- Create: `src/lib/market.ts`
- Test: `src/lib/market.test.ts`

**Interfaces:**
- Consumes: Task 1 types; `callFn`, `EdgeError` (`@/lib/edgeFn`); `storyWriteUrl` (`@/lib/feeds`); `loadFollowing`, `FollowedAccount` (`@/lib/following`); `loadWatch` (`@/lib/mentions`); `scoped` (`@/lib/profiles`).
- Produces: `MarketState`, `EMPTY_MARKET`, `Show`, `MarketJob`; `loadMarket(uid)`, `saveMarket(uid, s)`, `newsKey`, `geoKey`, `postKey`, `withKey(list, key, on)`, `pickingUp(checks)`, `outperformers(accounts, max?)`, `visibleNews`, `alsoReported`, `visibleGeo`, `visiblePosts`, `actCount`, `newsWriteUrl`, `geoWriteUrl`, `postWriteUrl`, `nextCheckDay(s, now?)`, `marketShown()`, `checkMarketEnabled()`, `marketJob()`, `onMarketJob(fn)`, `runMarketCheck(uid)`, `suggestSetup(input)`, `POSITION_LABEL`.

- [ ] **Step 1: Write the failing tests**

```ts file=src/lib/market.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FollowedAccount } from "@/lib/following";
import type { GeoRead, JudgedNews, JudgedPost, MarketDigest } from "../../supabase/functions/market/logic.ts";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));

const m = await import("./market");

class MemStorage {
  private s = new Map<string, string>();
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, v: string) { this.s.set(k, v); }
  removeItem(k: string) { this.s.delete(k); }
}

beforeEach(() => {
  const storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  // Mentions reads window.localStorage, which node lacks
  vi.stubGlobal("window", { localStorage: storage });
  callFn.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const n = (url: string, extra: Partial<JudgedNews> = {}): JudgedNews => ({ keyword: "CPF", title: `T ${url}`, url, source: "st.com", date: "2026-10-14", snippet: "S", relevant: true, tag: "act", ...extra });
const g = (question: string, position: GeoRead["position"]): GeoRead => ({ question, position, sources: [{ url: "https://moneysmart.sg/a", domain: "moneysmart.sg", title: "" }], checkUrl: null });
const p = (id: string, tag: "act" | "watch" = "act"): JudgedPost => ({ id, url: `https://instagram.com/p/${id}/`, handle: "rival", caption: "CPF myths", tag });
const digest = (checkedAt: string, news: JudgedNews[] = [], geo: GeoRead[] = [], posts: JudgedPost[] = []): MarketDigest => ({ checkedAt, news, geo, posts });

describe("the synced key", () => {
  it("round-trips and trims history", () => {
    const s = { ...m.EMPTY_MARKET, name: "Leo", audience: "young families", checks: Array.from({ length: 14 }, (_, k) => digest(`2026-10-${String(k + 1).padStart(2, "0")}T00:00:00Z`)) };
    m.saveMarket("u1", s);
    const back = m.loadMarket("u1");
    expect(back.name).toBe("Leo");
    expect(back.checks).toHaveLength(12);
    expect(back.checks[0].checkedAt).toBe("2026-10-03T00:00:00Z");
  });

  it("loads junk or an old shape as an empty market", () => {
    localStorage.setItem("content-studio-market-u1", "{not json");
    expect(m.loadMarket("u1")).toEqual(m.EMPTY_MARKET);
    localStorage.setItem("content-studio-market-u1", JSON.stringify({ name: 5, questions: "x", checks: [null, { nope: 1 }], dismissed: [1, "n:a"] }));
    expect(m.loadMarket("u1")).toEqual({ ...m.EMPTY_MARKET, dismissed: ["n:a"] });
  });
});

describe("what the digest shows", () => {
  const s = { ...m.EMPTY_MARKET, dismissed: ["n:https://a.sg/3"] };
  const d = digest("2026-10-15T00:00:00Z",
    [n("https://a.sg/1"), n("https://a.sg/2", { tag: "watch" }), n("https://a.sg/3"), n("https://a.sg/4", { relevant: false }), n("https://a.sg/5", { sameAs: "https://a.sg/1" }), n("https://a.sg/6", { relevant: null, tag: "watch" })],
    [g("Who is the best adviser?", "not-mentioned"), g("Is CPF enough?", "named")],
    [p("1"), p("2", "watch")]);

  it("hides irrelevant, dismissed and repeat stories; Act shows only act", () => {
    expect(m.visibleNews(d, s, "act").map((x) => x.url)).toEqual(["https://a.sg/1"]);
    expect(m.visibleNews(d, s, "all").map((x) => x.url)).toEqual(["https://a.sg/1", "https://a.sg/2", "https://a.sg/6"]);
    expect(m.alsoReported(d, d.news[0]).map((x) => x.url)).toEqual(["https://a.sg/5"]);
  });

  it("counts an AI answer as Act when the adviser is missing or only in passing", () => {
    expect(m.visibleGeo(d, s, "act").map((x) => x.question)).toEqual(["Who is the best adviser?"]);
    expect(m.visibleGeo(d, s, "all")).toHaveLength(2);
    expect(m.visiblePosts(d, s, "act").map((x) => x.id)).toEqual(["1"]);
    expect(m.actCount(d, s)).toBe(3);
  });

  it("toggles keys without duplicates", () => {
    expect(m.withKey(["a"], "a", true)).toEqual(["a"]);
    expect(m.withKey(["a", "b"], "a", false)).toEqual(["b"]);
  });
});

describe("a topic picking up", () => {
  const rel = (k: number, keyword = "CPF") => n(`https://a.sg/${keyword}${k}`, { keyword });
  it("needs an earlier check, 3 stories, and twice the earlier average", () => {
    const first = digest("2026-10-01T00:00:00Z", [rel(1)]);
    const now = digest("2026-10-08T00:00:00Z", [rel(2), rel(3), rel(4), rel(5, "MediShield"), rel(6, "MediShield")]);
    expect(m.pickingUp([now])).toEqual([]);
    expect(m.pickingUp([first, now])).toEqual(["CPF"]);
    const busy = digest("2026-10-01T00:00:00Z", [rel(7), rel(8), rel(9)]);
    expect(m.pickingUp([busy, now])).toEqual([]);
  });

  it("ignores repeats and irrelevant stories when counting", () => {
    const first = digest("2026-10-01T00:00:00Z", []);
    const now = digest("2026-10-08T00:00:00Z", [rel(1), rel(2), n("https://a.sg/x", { sameAs: "https://a.sg/CPF1" }), n("https://a.sg/y", { relevant: false })]);
    expect(m.pickingUp([first, now])).toEqual([]);
  });
});

describe("competitors doing well", () => {
  const post = (id: string, likes: number, comments = 0) => ({ id, url: `https://instagram.com/p/${id}/`, format: "image", caption: `post ${id}`, postedAt: null, views: null, likes, comments }) as FollowedAccount["posts"][number];
  const acct = (handle: string, posts: FollowedAccount["posts"]): FollowedAccount => ({ platform: "instagram", handle, addedAt: "", history: [], posts, seen: [], fresh: [] });

  it("keeps posts at 1.5 times their account's average, best first, from accounts with 4 or more posts", () => {
    const a = acct("rival", [post("1", 10), post("2", 10), post("3", 10), post("4", 50)]);
    const small = acct("tiny", [post("9", 10), post("10", 10), post("11", 100)]);
    const b = acct("other", [post("5", 1), post("6", 1), post("7", 1), post("8", 20, 5)]);
    expect(m.outperformers([a, small, b]).map((x) => x.id)).toEqual(["instagram:8", "instagram:4"]);
    expect(m.outperformers([acct("zero", [post("1", 0), post("2", 0), post("3", 0), post("4", 0)])])).toEqual([]);
  });
});

describe("links into Write", () => {
  it("builds a news, a question and a remix link", () => {
    expect(m.newsWriteUrl(n("https://a.sg/1"))).toContain("idea=news-hook");
    const q = new URL(`https://x${m.geoWriteUrl(g("Is CPF enough?", "not-mentioned"))}`).searchParams;
    expect(q.get("idea")).toBe("real-question");
    expect(q.get("ctx")).toContain('"Is CPF enough?"');
    expect(q.get("ctx")).toContain("moneysmart.sg");
    expect(new URL(`https://x${m.postWriteUrl(p("1"))}`).searchParams.get("ctx")).toContain("@rival");
  });
});

describe("the week", () => {
  it("opens 7 UTC days after the latest check, like the server", () => {
    const s = { ...m.EMPTY_MARKET, checks: [digest("2026-10-09T10:00:00Z")] };
    expect(m.nextCheckDay(s, new Date("2026-10-15T23:59:00Z"))).toBe("2026-10-16");
    expect(m.nextCheckDay(s, new Date("2026-10-16T00:00:00Z"))).toBeNull();
    expect(m.nextCheckDay(m.EMPTY_MARKET)).toBeNull();
  });
});

describe("the check job", () => {
  it("sends the set-up, keywords and best competitor posts, then saves the digest", async () => {
    m.saveMarket("u1", { ...m.EMPTY_MARKET, name: "Leo", audience: "young families", questions: ["Is CPF enough for me?"] });
    localStorage.setItem("content-studio-mentions-u1", JSON.stringify(["CPF"]));
    callFn.mockResolvedValue(digest("2026-10-15T00:00:00Z", [n("https://a.sg/1")]));
    const seen: (string | undefined)[] = [];
    const off = m.onMarketJob((j) => seen.push(j?.state));
    await m.runMarketCheck("u1");
    off();
    expect(callFn).toHaveBeenCalledWith("market", expect.objectContaining({ action: "check", name: "Leo", audience: "young families", questions: ["Is CPF enough for me?"], keywords: ["CPF"], posts: [] }), expect.any(String));
    expect(seen).toEqual(["running", "done"]);
    expect(m.loadMarket("u1").checks).toHaveLength(1);
  });

  it("keeps the refusal's words and code", async () => {
    const { EdgeError } = await import("@/lib/edgeFn");
    callFn.mockRejectedValue(new EdgeError("You've had this week's check.", 429, "weekly_limit"));
    await m.runMarketCheck("u2");
    expect(m.marketJob()).toMatchObject({ state: "failed", error: "You've had this week's check.", code: "weekly_limit" });
  });
});

describe("whether the nav shows it", () => {
  it("asks the server, then trusts the answer for 6 hours", async () => {
    expect(m.marketShown()).toBe(false);
    callFn.mockResolvedValue({ enabled: true });
    expect(await m.checkMarketEnabled()).toBe(true);
    expect(m.marketShown()).toBe(true);
    await m.checkMarketEnabled();
    expect(callFn).toHaveBeenCalledTimes(1);
    vi.useFakeTimers({ now: Date.now() + 6 * 3600_000 + 1 });
    callFn.mockResolvedValue({ enabled: false });
    expect(await m.checkMarketEnabled()).toBe(false);
    expect(m.marketShown()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see it fail.** `npx vitest run src/lib/market.test.ts` fails: cannot find `./market`.

- [ ] **Step 3: Write the lib**

```ts file=src/lib/market.ts
// Your market (Discover > Your market): the adviser's set-up, each check's digest, and what they dismissed or wrote
// from, in one synced key per profile: content-studio-market-${scoped(userId)}. Keywords stay in Mentions' list and
// competitors in Following, so each page keeps one source of truth. The check runs outside React, like Following's,
// so leaving the page doesn't lose it. Design: docs/superpowers/specs/2026-10-15-market-watch-design.md.

import { callFn, EdgeError } from "@/lib/edgeFn";
import { storyWriteUrl } from "@/lib/feeds";
import { loadFollowing, type FollowedAccount } from "@/lib/following";
import { loadWatch } from "@/lib/mentions";
import { scoped } from "@/lib/profiles";
import type { GeoRead, JudgedNews, JudgedPost, MarketDigest, MarketPost, Position } from "../../supabase/functions/market/logic.ts";

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
const isDigest = (c: unknown): c is MarketDigest =>
  !!c && typeof c === "object" && typeof (c as MarketDigest).checkedAt === "string" && Array.isArray((c as MarketDigest).news) && Array.isArray((c as MarketDigest).geo) && Array.isArray((c as MarketDigest).posts);

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
      checks: (Array.isArray(v.checks) ? v.checks : []).filter(isDigest).slice(-12),
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
export const visibleGeo = (d: MarketDigest, s: MarketState, show: Show) =>
  d.geo.filter((x) => !s.dismissed.includes(geoKey(x)) && (show === "all" || x.position === "not-mentioned" || x.position === "passing"));
export const visiblePosts = (d: MarketDigest, s: MarketState, show: Show) =>
  d.posts.filter((x) => !s.dismissed.includes(postKey(x)) && (show === "all" || x.tag === "act"));
export const actCount = (d: MarketDigest, s: MarketState) => visibleNews(d, s, "act").length + visibleGeo(d, s, "act").length + visiblePosts(d, s, "act").length;

export const newsWriteUrl = (x: JudgedNews) => storyWriteUrl({ title: x.title, link: x.url, date: x.date, summary: x.snippet, source: x.source });

export function geoWriteUrl(x: GeoRead): string {
  const ctx = [
    `People I serve ask AI assistants: "${x.question}"`,
    x.sources.length ? `The answers today draw on: ${x.sources.slice(0, 5).map((s) => s.domain).join(", ")}.` : "",
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
```

- [ ] **Step 4: Run to see it pass.** `npx vitest run src/lib/market.test.ts`: pass. Prove Review Focus 5 bites: make `loadMarket` return `v` unchecked; the junk test fails; restore.

- [ ] **Step 5: Commit.** `git add src/lib/market.ts src/lib/market.test.ts && git commit -m "feat: add Your market's synced state and check job"`

### Task 4: The page, nav, route and deep links

**Files:**
- Create: `src/pages/MarketPage.tsx`
- Modify: `src/App.tsx` (lazy import beside FollowingPage; `<Route path="/market" ...>` beside `/following`)
- Modify: `src/lib/nav.ts` (Discover: `{ to: "/market", label: "Your market", icon: Radar, show: marketShown }` after Following)
- Modify: `src/pages/StudioLayout.tsx` (refresh `checkMarketEnabled()` beside `checkSocialConnect()`)
- Modify: `src/lib/jumpTo.ts` (KEYWORDS `"/market": "market news competitors chatgpt ai answers geo"`)
- Modify: `docs/deep-links.md` (Discover rows for `show` and `view`)

**Interfaces:**
- Consumes: Task 3's exports; `loadBrand` (`@/lib/carousel`); `loadPositioning` (`@/lib/positioning`); `loadWatch`, `saveWatch`, `MAX_WATCH` (`@/lib/mentions`); `useUrlState` (`@/lib/urlState`); `FilterChip`, `InfoTip`, `Button`, `Input`, `Label`, `Textarea`; `useToast`, `ToastAction`.
- Produces: route `/market`.

- [ ] **Step 1: Write the page**

```tsx file=src/pages/MarketPage.tsx
// Your market (Discover > Your market): set up once, check once a week, write from what moved. Leo only while the
// market function's MARKET_USERS lists him; the nav hides it for everyone else.
// Design: docs/superpowers/specs/2026-10-15-market-watch-design.md.

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Loader2, PenLine, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { loadBrand } from "@/lib/carousel";
import {
  EMPTY_MARKET, POSITION_LABEL, actCount, alsoReported, geoKey, geoWriteUrl, loadMarket, marketJob, newsKey, newsWriteUrl, nextCheckDay,
  onMarketJob, pickingUp, postKey, postWriteUrl, runMarketCheck, saveMarket, suggestSetup, visibleGeo, visibleNews, visiblePosts, withKey,
  type MarketState, type Show,
} from "@/lib/market";
import { MAX_WATCH, loadWatch, saveWatch } from "@/lib/mentions";
import { loadPositioning } from "@/lib/positioning";
import { supabase } from "@/lib/supabase";
import { useUrlState } from "@/lib/urlState";
import { dayWords } from "../../supabase/functions/market/logic.ts";

const ago = (iso: string) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

export default function MarketPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [state, setState] = useState<MarketState>(EMPTY_MARKET);
  const [view, setView] = useUrlState<"digest" | "setup">("view", "digest", { allowed: ["digest", "setup"] });

  useEffect(() => {
    document.title = "Your market - Content Studio";
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUid(id);
      if (id) setState(loadMarket(id));
    });
  }, []);

  if (!uid) return null;
  const ready = !!state.audience && (state.questions.length > 0 || loadWatch(uid).length > 0);
  return view === "setup" || !ready
    ? <SetupForm uid={uid} state={state} onSaved={(s, check) => { setState(s); setView("digest"); if (check) void runMarketCheck(uid); }} />
    : <Digest uid={uid} state={state} setState={setState} />;
}

function SetupForm({ uid, state, onSaved }: { uid: string; state: MarketState; onSaved: (s: MarketState, check: boolean) => void }) {
  const { toast } = useToast();
  const positioning = loadPositioning(uid);
  const [name, setName] = useState(state.name || loadBrand(uid)?.name || "");
  const [site, setSite] = useState(state.site);
  const [audience, setAudience] = useState(state.audience || positioning?.audienceDetail || positioning?.oneLiner || "");
  const [keywords, setKeywords] = useState<string[]>(loadWatch(uid));
  const [questions, setQuestions] = useState<string[]>(state.questions);
  const [kwDraft, setKwDraft] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const topics = state.topics.length ? state.topics : positioning?.topics ?? [];

  const suggest = async () => {
    if (!audience.trim()) return toast({ title: "Say who you serve first", variant: "destructive" });
    setSuggesting(true);
    try {
      const s = await suggestSetup({ name, site, audience, topics });
      setKeywords((k) => [...new Set([...k, ...s.keywords])].slice(0, MAX_WATCH));
      setQuestions((q) => [...new Set([...q, ...s.questions])].slice(0, 5));
      if (!s.keywords.length && !s.questions.length) toast({ title: "Nothing to suggest yet", description: "Add your own below." });
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setSuggesting(false);
    }
  };
  const add = (list: string[], set: (l: string[]) => void, draft: string, clear: () => void, max: number) => {
    const t = draft.replace(/\s+/g, " ").trim();
    if (t.length < 2 || list.length >= max || list.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    set([...list, t]);
    clear();
  };
  const save = () => {
    const kw = saveWatch(uid, keywords);
    const next = saveMarket(uid, { ...loadMarket(uid), name: name.trim(), site: site.trim(), audience: audience.trim(), topics, questions });
    onSaved(next, next.checks.length === 0 && (kw.length > 0 || questions.length > 0));
  };
  const canSave = audience.trim().length > 0 && (keywords.length > 0 || questions.length > 0);
  const firstTime = state.checks.length === 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold">Set up your market</h1>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="market-name">Your name or business</Label>
            <Input id="market-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Leo Tan" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="market-site">Website (optional)</Label>
            <Input id="market-site" value={site} maxLength={300} onChange={(e) => setSite(e.target.value)} placeholder="yoursite.sg" inputMode="url" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="market-audience">Who you serve</Label>
          <Textarea id="market-audience" value={audience} maxLength={300} rows={2} onChange={(e) => setAudience(e.target.value)} placeholder="Young families in Singapore buying their first home" />
        </div>
        <Button type="button" variant="outline" onClick={suggest} disabled={suggesting} className="gap-1.5">
          {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {suggesting ? "Suggesting..." : "Suggest topics and questions"}
        </Button>
      </div>

      <ListField
        title={`News topics to watch (${keywords.length}/${MAX_WATCH})`}
        tip="Shared with Mentions, so both pages watch the same topics."
        items={keywords}
        onRemove={(k) => setKeywords(keywords.filter((x) => x !== k))}
        draft={kwDraft}
        setDraft={setKwDraft}
        placeholder="CPF LIFE"
        onAdd={() => add(keywords, setKeywords, kwDraft, () => setKwDraft(""), MAX_WATCH)}
        full={keywords.length >= MAX_WATCH}
      />
      <ListField
        title={`Questions your clients ask AI (${questions.length}/5)`}
        tip="Each check reads ChatGPT's answer and where you stand in it."
        items={questions}
        onRemove={(q) => setQuestions(questions.filter((x) => x !== q))}
        draft={qDraft}
        setDraft={setQDraft}
        placeholder="How much insurance does a young family need in Singapore?"
        onAdd={() => add(questions, setQuestions, qDraft, () => setQDraft(""), 5)}
        full={questions.length >= 5}
      />
      <p className="text-sm text-muted-foreground">
        Competitors come from <Link to="/following" className="underline underline-offset-2">Following</Link>.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={!canSave}>{firstTime ? "Save and check my market" : "Save"}</Button>
        {!canSave && <span className="text-sm text-muted-foreground">Add who you serve and at least one topic or question.</span>}
      </div>
    </div>
  );
}

function ListField(props: {
  title: string; tip: string; items: string[]; onRemove: (v: string) => void; draft: string; setDraft: (v: string) => void;
  placeholder: string; onAdd: () => void; full: boolean;
}) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-1.5 text-base font-medium">{props.title}<InfoTip>{props.tip}</InfoTip></h2>
      <ul className="space-y-1.5">
        {props.items.map((v) => (
          <li key={v} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <span className="min-w-0 break-words">{v}</span>
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`Remove ${v}`} onClick={() => props.onRemove(v)}>
              <X className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      {!props.full && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); props.onAdd(); }}>
          <Input value={props.draft} onChange={(e) => props.setDraft(e.target.value)} placeholder={props.placeholder} maxLength={160} aria-label={props.title} />
          <Button type="submit" variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="Add"><Plus className="h-4 w-4" /></Button>
        </form>
      )}
    </section>
  );
}

function Digest({ uid, state, setState }: { uid: string; state: MarketState; setState: (s: MarketState) => void }) {
  const { toast } = useToast();
  const [show, setShow] = useUrlState<Show>("show", "act", { allowed: ["act", "all"] });
  const [, tick] = useState(0);
  const job = marketJob();
  const running = job?.state === "running";
  const latest = state.checks[state.checks.length - 1];
  const nextDay = nextCheckDay(state);
  const rising = pickingUp(state.checks);

  useEffect(() => onMarketJob((j) => {
    setState(loadMarket(uid));
    tick((n) => n + 1);
    if (j?.state === "failed") toast({ title: "Check didn't run", description: j.error, variant: "destructive" });
  }), [uid, setState, toast]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const update = (next: MarketState) => setState(saveMarket(uid, next));
  const dismiss = (key: string) => {
    const before = loadMarket(uid);
    update({ ...before, dismissed: withKey(before.dismissed, key, true) });
    toast({ title: "Hidden for good", action: <ToastAction altText="Undo" onClick={() => update({ ...loadMarket(uid), dismissed: withKey(loadMarket(uid).dismissed, key, false) })}>Undo</ToastAction> });
  };
  const wrote = (key: string) => update({ ...loadMarket(uid), written: withKey(loadMarket(uid).written, key, true) });
  const blockedWords = job?.state === "failed" && job.code === "weekly_limit" ? job.error : nextDay ? `Next check opens ${dayWords(nextDay)} at 8am.` : "";

  const news = latest ? visibleNews(latest, state, show) : [];
  const geo = latest ? visibleGeo(latest, state, show) : [];
  const posts = latest ? visiblePosts(latest, state, show) : [];
  const acts = latest ? actCount(latest, state) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-1.5 text-2xl font-semibold">
          Your market<InfoTip>One check a week: news, AI answers and competitors' best posts.</InfoTip>
        </h1>
        <Link to="/market?view=setup" className="text-sm underline underline-offset-2">Edit set-up</Link>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void runMarketCheck(uid)} disabled={running || !!nextDay} className="gap-1.5">
          {running && <Loader2 className="h-4 w-4 animate-spin" />}
          {running ? `Checking... ${Math.round((Date.now() - job!.startedAt) / 1000)}s` : "Check my market"}
        </Button>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          {running ? "Reading the news and asking ChatGPT. About a minute; you can leave this page." : blockedWords}
        </span>
      </div>

      {!latest && !running && <p className="text-muted-foreground">No check yet.</p>}

      {latest && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm text-muted-foreground">Checked {ago(latest.checkedAt)}.</span>
            <FilterChip active={show === "act"} onClick={() => setShow("act")} count={acts}>Act</FilterChip>
            <FilterChip active={show === "all"} onClick={() => setShow("all")}>All</FilterChip>
          </div>

          {!news.length && !geo.length && !posts.length && (
            <p className="text-muted-foreground">
              Nothing to act on from this check. {show === "act" && <button type="button" className="underline underline-offset-2" onClick={() => setShow("all")}>See all</button>}
            </p>
          )}

          {news.length > 0 && (
            <Section title="News on your topics">
              {news.map((x) => {
                const also = alsoReported(latest, x);
                return (
                  <Card key={x.url} tag={x.relevant === null ? "Not judged" : x.tag === "act" ? "Act" : "Watch"} act={x.tag === "act"}
                    written={state.written.includes(newsKey(x))} writeUrl={newsWriteUrl(x)} writeLabel="Write a post from this"
                    onWrite={() => wrote(newsKey(x))} onDismiss={() => dismiss(newsKey(x))}>
                    <a href={x.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">{x.title}</a>
                    <p className="text-sm text-muted-foreground">
                      {x.source}{x.date ? `, ${x.date.slice(0, 10)}` : ""}, {x.keyword}{rising.includes(x.keyword) ? " (picking up)" : ""}
                      {also.length > 0 && <>, also in {also.map((o) => o.source).join(", ")}</>}
                    </p>
                  </Card>
                );
              })}
            </Section>
          )}

          {geo.length > 0 && (
            <Section title="Your clients' questions in ChatGPT">
              {geo.map((x) => (
                <Card key={x.question} tag={x.position ? POSITION_LABEL[x.position] : "No answer"} act={x.position === "not-mentioned" || x.position === "passing"}
                  written={state.written.includes(geoKey(x))} writeUrl={x.error ? undefined : geoWriteUrl(x)} writeLabel="Write a post that answers this"
                  onWrite={() => wrote(geoKey(x))} onDismiss={() => dismiss(geoKey(x))}>
                  <p className="font-medium">"{x.question}"</p>
                  {x.error ? <p className="text-sm text-muted-foreground">{x.error}</p> : x.sources.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Sources it used:{" "}
                      {x.sources.slice(0, 5).map((s, k) => (
                        <span key={s.url}>{k > 0 && ", "}<a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{s.domain}</a></span>
                      ))}
                    </p>
                  )}
                </Card>
              ))}
            </Section>
          )}

          {posts.length > 0 && (
            <Section title="Competitors doing well">
              {posts.map((x) => (
                <Card key={x.id} tag={x.tag === "act" ? "Act" : "Watch"} act={x.tag === "act"} written={state.written.includes(postKey(x))}
                  writeUrl={postWriteUrl(x)} writeLabel="Write your take" onWrite={() => wrote(postKey(x))} onDismiss={() => dismiss(postKey(x))}>
                  <a href={x.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">@{x.handle}<ExternalLink className="h-3.5 w-3.5" /></a>
                  <p className="line-clamp-3 text-sm text-muted-foreground">{x.caption}</p>
                </Card>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="space-y-3">{children}</ul>
    </section>
  );
}

function Card(props: {
  tag: string; act: boolean; written: boolean; writeUrl?: string; writeLabel: string; onWrite: () => void; onDismiss: () => void; children: ReactNode;
}) {
  return (
    <li className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1 break-words">{props.children}</div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${props.act ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>{props.tag}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {props.writeUrl && (
          <Button asChild size="sm" className="gap-1.5">
            <Link to={props.writeUrl} onClick={props.onWrite}><PenLine className="h-3.5 w-3.5" />{props.written ? "Write another" : props.writeLabel}</Link>
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={props.onDismiss}>Dismiss</Button>
        {props.written && <span className="text-xs text-muted-foreground">Written</span>}
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Wire the route, nav, layout refresh, Jump to and deep links.** In `src/App.tsx` add `const MarketPage = lazy(() => import("@/pages/MarketPage"));` after the FollowingPage import and `<Route path="/market" element={<MarketPage />} />` after the `/following` route. In `src/lib/nav.ts` import `Radar` from lucide-react and `marketShown` from `@/lib/market`, and add the Discover entry. In `src/pages/StudioLayout.tsx` add `const [, setMarketOn] = useState(marketShown);` beside `setSocialOn` and `if (active && data.user) void checkMarketEnabled().then((on) => active && setMarketOn(on));` beside the social check. Add the Jump to keywords. In `docs/deep-links.md` under the Discover table add:

```md
| /market | show | act, all | act | replace | /market?show=all |
| /market | view | digest, setup (the set-up form over a finished set-up) | digest; setup when nothing is set up | replace | /market?view=setup |
```

- [ ] **Step 3: Run the whole suite and the build.** `npx vitest run > vitest.log 2>&1; echo $?` then `npm run build`. Expected: 0 failures (compare per test with main, memory: baseline per test), build green, `navRoutes.test.ts` green.

- [ ] **Step 4: Check the page.** Local `npm run dev`, Playwright at 390 and 1440 with `/auth/v1/user` and `functions/v1/market` routed to fixtures (no real sign-in): set-up form, a digest with every section, the weekly-limit state, the running state. No horizontal overflow, no console errors, buttons at least 36px.

- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat: add the Your market page under Discover"`

### Task 5: Ship and prove it live

- [ ] **Step 1:** `supabase secrets set MARKET_USERS=<Leo's id>,<demo id> --project-ref hgdbflprrficdoyxmdxe` (the demo id only for the proof), then `supabase functions deploy market --project-ref hgdbflprrficdoyxmdxe --use-api`.
- [ ] **Step 2:** Live proof with the demo account (session from the service role's magic link, no password typed): `status` is enabled, `suggest` returns keywords and questions, `check` returns a digest with real news, three ChatGPT reads and positions; a second `check` answers 429 `weekly_limit`. Then set `MARKET_USERS=<Leo's id>` only and confirm the demo's `status` is `{enabled:false}`.
- [ ] **Step 3:** Fresh-context review of the whole branch (security: input caps, SSRF guard, fail-closed caps, allow-list), fix findings, rebase on origin/main, run the suite again, push to main (the push is the Vercel deploy). Check the deployed bundle has `/market` and the live page renders for a signed-out visitor without errors.
