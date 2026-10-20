import { describe, expect, it } from "vitest";
import fixture from "./fixtures/chatgpt-answer.json";
import related from "./fixtures/related-keywords.json";
import relatedEmpty from "./fixtures/related-keywords-empty.json";
import youtube from "./fixtures/youtube-organic.json";
import {
  checkProblem, cleanInput, cleanPosts, cleanQuestions, cleanTerms, dayWords, earlierWeekDays, foldStories, geoJudged, suggestMessages,
  accountGate, answerGist, overAccountWeek, citesSite, isAllowed, judgeNews, newsAsk, newsTask, shownNews, judgePost, keepTop, namedIn, newsFailed, newsItems, paidPartsFailed, parseAnswer, parseSuggest, pickNews, position,
  sameStoryAsk, sameStoryOf, shortlistAct, siteScope, takeSlots, uniqueByUrl, weekGate, type JudgedNews, type NewsItem, type Source,
  candidates, changeOf, cleanSearches, isGap, keptByJev, recentVideos, relatedKeywords, relatedTask, searchAsk, searchesProblem, searchWeekRefusal, seriesOf,
  lastMonthOf, toTopic, topicSlug, trendOf, videosTask, type RelatedKeyword,
} from "./logic";
import type { UsageClient } from "../_shared/usageCaps";

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

  it("reads a site as its public host plus any path, lower case", () => {
    expect(siteScope("https://www.leotan.sg/")).toBe("leotan.sg");
    expect(siteScope("leotan.sg")).toBe("leotan.sg");
    expect(siteScope("https://www.LinkedIn.com/in/LeoTan/")).toBe("linkedin.com/in/leotan");
    expect(siteScope("http://localhost:3000")).toBe("");
    expect(siteScope("http://10.0.0.1")).toBe("");
    expect(siteScope("")).toBe("");
    expect(siteScope(42)).toBe("");
  });

  it("counts a source as the adviser's own only inside their host and path", () => {
    expect(citesSite("https://blog.leotan.sg/x", "leotan.sg")).toBe(true);
    expect(citesSite("https://notleotan.sg/x", "leotan.sg")).toBe(false);
    expect(citesSite("https://www.linkedin.com/in/leotan/details", "linkedin.com/in/leotan")).toBe(true);
    expect(citesSite("https://www.linkedin.com/in/janelim", "linkedin.com/in/leotan")).toBe(false);
    expect(citesSite("https://linkedin.com/in/leotanner", "linkedin.com/in/leotan")).toBe(false);
    expect(citesSite("https://www.aia.com.sg/en/agents/someone-else", "aia.com.sg/en/agents/leo-tan")).toBe(false);
    expect(citesSite("not a url", "leotan.sg")).toBe(false);
    expect(citesSite("https://leotan.sg/", "")).toBe(false);
  });

  it("drops posts without a public link, id, handle or caption, and stops at 10", () => {
    const ok = { id: "1", url: "https://www.instagram.com/p/abc/", handle: "@rival", caption: "Five CPF myths" };
    expect(cleanPosts([ok, { ...ok, url: "javascript:alert(1)" }, { ...ok, caption: " " }, null])).toEqual([{ ...ok, handle: "rival" }]);
    expect(cleanPosts(Array.from({ length: 12 }, (_, k) => ({ ...ok, id: String(k) })))).toHaveLength(10);
  });

  it("takes the brand profile the check is for, the default one when it is missing or malformed", () => {
    expect(cleanInput({ profile: "mb7" }).profile).toBe("mb7");
    expect(cleanInput({}).profile).toBe("me");
    expect(cleanInput({ profile: "../x" }).profile).toBe("me");
    expect(cleanInput({ profile: "A".repeat(41) }).profile).toBe("me");
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

  it("lets an account run 3 checks in any 7 days, counting today", () => {
    expect(accountGate([{ day: "2026-10-15", count: 1 }, { day: "2026-10-10", count: 1 }], now)).toEqual({ open: true });
    expect(accountGate([{ day: "2026-10-15", count: 1 }, { day: "2026-10-12", count: 1 }, { day: "2026-10-10", count: 1 }], now)).toEqual({ open: false, nextDay: "2026-10-17" });
    expect(accountGate([{ day: "2026-10-08", count: 3 }], now)).toEqual({ open: true });
    expect(accountGate(null, now)).toEqual({ open: true });
  });

  it("re-reads after taking the slot: over 3 in 7 days means simultaneous requests got past the first read", () => {
    const rows = (n: number) => Array.from({ length: n }, (_, k) => ({ day: ["2026-10-15", "2026-10-14", "2026-10-12", "2026-10-11"][k], count: 1 }));
    expect(overAccountWeek(rows(3), now)).toBe(false);
    expect(overAccountWeek(rows(4), now)).toBe(true);
    expect(overAccountWeek([{ day: "2026-10-15", count: 5 }], now)).toBe(true);
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
    ], NOW);
    expect(items).toEqual([{ keyword: "CPF", title: "CPF changes", url: "https://www.straitstimes.com/a", source: "straitstimes.com", date: "2026-10-14", snippet: "" }]);
    expect(uniqueByUrl([news("https://a.sg/1"), news("https://a.sg/1", "Story", "MediShield"), news("https://a.sg/2")]).map((n) => n.keyword)).toEqual(["CPF", "CPF"]);
  });

  it("counts only news and explainers as news: listings, adverts and social posts are dropped", () => {
    const ans = (relevant: number, news?: number) => ({ relevant: { type: "noul" as const, noul: relevant }, tag: { type: "choice" as const, choice: "act" }, ...(news === undefined ? {} : { news: { type: "noul" as const, noul: news } }) });
    expect(judgeNews(news("https://99.co/listing"), ans(0.9, 0.2)).relevant).toBe(false);
    expect(judgeNews(news("https://a.sg/edge"), ans(0.9, 0.59)).relevant).toBe(false);
    expect(judgeNews(news("https://a.sg/story"), ans(0.9, 0.6)).relevant).toBe(true);
    expect(judgeNews(news("https://a.sg/no-news-answer"), ans(0.9)).relevant).toBe(true);
    expect(judgeNews(news("https://a.sg/off-topic"), ans(0.2, 0.9)).relevant).toBe(false);
  });

  it("asks Jev whether it is news, and whether it is about Singapore, in the same call", () => {
    expect(Object.keys(newsAsk(cleanInput({ audience: "families" }), news("https://a.sg/1")).questions)).toEqual(["relevant", "news", "sg", "tag"]);
  });

  it("drops stories about another country only", () => {
    const ans = (sg?: number) => ({ relevant: { type: "noul" as const, noul: 0.9 }, news: { type: "noul" as const, noul: 0.9 }, tag: { type: "choice" as const, choice: "act" }, ...(sg === undefined ? {} : { sg: { type: "noul" as const, noul: sg } }) });
    expect(judgeNews(news("https://bbc.co.uk/uk-first-buyers"), ans(0.02)).relevant).toBe(false);
    expect(judgeNews(news("https://fmt.com.my/edge"), ans(0.59)).relevant).toBe(false);
    expect(judgeNews(news("https://straitstimes.com/hdb"), ans(0.6)).relevant).toBe(true);
    expect(judgeNews(news("https://a.sg/no-sg-answer"), ans()).relevant).toBe(true);
  });

  it("reads Jev's answers, and keeps the item as Watch when Jev is down", () => {
    expect(judgeNews(news("https://a.sg/1"), { relevant: { type: "noul", noul: 0.74 }, tag: { type: "choice", choice: "act" } })).toMatchObject({ relevant: true, tag: "act" });
    expect(judgeNews(news("https://a.sg/1"), { relevant: { type: "noul", noul: 0.32 }, tag: { type: "choice", choice: "act" } })).toMatchObject({ relevant: false });
    expect(judgeNews(news("https://a.sg/1"), { relevant: { type: "noul", noul: 0.9 }, tag: { type: "choice", choice: "maybe" } })).toMatchObject({ tag: "watch" });
    expect(judgeNews(news("https://a.sg/1"), null)).toMatchObject({ relevant: null, tag: "watch" });
  });

  it("keeps Act to the 5 stories Jev rates most worth posting, the rest Watch", () => {
    const scored = Array.from({ length: 8 }, (_, k) => judged(`https://a.sg/${k}`, { actScore: [0.9, 0.4, 0.95, 0.7, 0.8, 0.6, 0.85, null][k] ?? undefined }));
    scored.push(judged("https://a.sg/irrelevant", { relevant: false, actScore: 0.99 }), judged("https://a.sg/repeat", { sameAs: "https://a.sg/0", actScore: 0.99 }));
    const out = shortlistAct(scored, 5);
    expect(out.filter((n) => n.tag === "act").map((n) => n.url)).toEqual(["https://a.sg/0", "https://a.sg/2", "https://a.sg/3", "https://a.sg/4", "https://a.sg/6"]);
    expect(out.find((n) => n.url === "https://a.sg/7")?.tag).toBe("watch");
    expect(shortlistAct([judged("https://a.sg/x", { actScore: 0.3 })], 5)[0].tag).toBe("watch");
  });

  it("reads Jev's act probability with the tag", () => {
    expect(judgeNews(news("https://a.sg/1"), { relevant: { type: "noul", noul: 0.9 }, tag: { type: "choice", choice: "act", probabilities: { act: 0.82, watch: 0.18 } } }).actScore).toBe(0.82);
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

  it("lets a late repeat see the very first report, however many came between", () => {
    const earlier = Array.from({ length: 30 }, (_, k) => judged(`https://a.sg/e${k}`));
    const ask = sameStoryAsk(news("https://a.sg/late"), earlier)!;
    expect(ask.ids[0]).toBe("https://a.sg/e0");
    expect(ask.ids).toHaveLength(30);
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

  it("lists who the answer recommends, never the adviser", () => {
    const a = parseAnswer(fixture)!;
    expect(a.named.slice(0, 2)).toEqual(["Providend", "Alpha Wealth Financial Advisers"]);
    expect(parseAnswer({ tasks: [{ result: [{ markdown: "x", brand_entities: [{ title: "Leo Tan Advisory" }, { title: "Endowus" }, { title: 5 }] }] }] }, "Leo Tan")!.named).toEqual(["Endowus"]);
  });

  it("gives the gist of what the answer tells people: its opening, plain, at most 240 characters", () => {
    const g = answerGist(parseAnswer(fixture)!.answer);
    expect(g.startsWith("For a young family in Singapore")).toBe(true);
    // a second sentence that would not fit whole is left out, rather than cut mid-sentence
    expect(g.endsWith("not just sell you insurance or investment products.")).toBe(true);
    expect(g.length).toBeLessThanOrEqual(240);
    expect(g).not.toMatch(/[#*]|\]\(/);
    expect(answerGist("# Best CRM\n\nFor agents, I'd shortlist **Zoho CRM** and [HubSpot](https://hubspot.com)\\. It depends on team size. More here.")).toBe("For agents, I'd shortlist Zoho CRM and HubSpot. It depends on team size.");
    expect(answerGist("")).toBe("");
  });

  it("returns null for an errored or empty task", () => {
    expect(parseAnswer({ tasks: [{ status_code: 40501, result: null }] })).toBeNull();
    expect(parseAnswer(null)).toBeNull();
  });

  it("matches a whole name of 3 or more letters, case blind", () => {
    expect(namedIn("Try Leo Tan or a robo-adviser.", "leo tan")).toBe(true);
    expect(namedIn("Leo Tan's clients say", "Leo Tan")).toBe(true);
    expect(namedIn("Speak to Ian, an adviser.", "Ian")).toBe(true);
    expect(namedIn("Try A+B Advisory.", "A+B Advisory")).toBe(true);
    expect(namedIn("Plan your annual review.", "Ann")).toBe(false);
    expect(namedIn("A guardian plan.", "Ian")).toBe(false);
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

const NOW = new Date("2026-10-15T03:00:00Z");

describe("the news request", () => {
  it("asks Google News for the past month, ranked by relevance", () => {
    // measured 2026-10-15 on 6 topics: newest-first gave 2 results from known SG news sites and 29 social, listing or
    // forum pages; relevance gave 16 and 16, with 56 of 59 still from the last 30 days
    expect(newsTask("CPF housing grants")).toEqual({ keyword: '"CPF housing grants"', location_code: 2702, language_code: "en", depth: 10, search_param: "&tbs=qdr:m" });
  });
});

describe("fresh news only", () => {
  it("drops stories older than 30 days and keeps undated ones", () => {
    const m = (date: string, k: string) => ({ title: `T${k}`, url: `https://a.sg/${k}`, source: "a.sg", snippet: "", date });
    const kept = newsItems("HDB", [m("2026-10-14T00:00:00.000Z", "new"), m("2026-09-16T00:00:00.000Z", "edge"), m("2026-09-14T00:00:00.000Z", "old"), m("2021-01-14T00:00:00.000Z", "2021"), m("", "undated")], NOW);
    expect(kept.map((n) => n.title)).toEqual(["Tnew", "Tedge", "Tundated"]);
  });
});

describe("what a check returns", () => {
  it("leaves out the stories Jev rejected, keeping repeats and unjudged ones the page can show", () => {
    const list = [judged("https://a.sg/1"), judged("https://a.sg/2", { relevant: false }), judged("https://a.sg/3", { sameAs: "https://a.sg/1" }), judged("https://a.sg/4", { relevant: null })];
    expect(shownNews(list).map((n) => n.url)).toEqual(["https://a.sg/1", "https://a.sg/3", "https://a.sg/4"]);
  });
});

describe("news lookups", () => {
  it("treats a DataForSEO task error as failed, and no results as empty", () => {
    expect(newsFailed({ status_code: 20000, tasks: [{ status_code: 20000, result: [] }] })).toBe(false);
    expect(newsFailed({ status_code: 20000, tasks: [{ status_code: 40102, result: null }] })).toBe(false);
    expect(newsFailed({ status_code: 20000, tasks: [{ status_code: 50000, result: null }] })).toBe(true);
    expect(newsFailed({ status_code: 40100, tasks: [] })).toBe(true);
    expect(newsFailed(null)).toBe(true);
  });

  it("keeps 10 stories a keyword and 40 in all", () => {
    const m = (k: number) => ({ title: `T${k}`, url: `https://a.sg/${k}`, source: "a.sg", snippet: "", date: "" });
    expect(newsItems("CPF", Array.from({ length: 14 }, (_, k) => m(k)), NOW)).toHaveLength(10);
    const lists = Array.from({ length: 5 }, (_, j) => Array.from({ length: 10 }, (_, k) => news(`https://a.sg/${j}-${k}`)));
    expect(pickNews(lists)).toHaveLength(40);
    expect(pickNews([[news("https://a.sg/1")], [news("https://a.sg/1")]])).toHaveLength(1);
  });
});

describe("taking this week's slot", () => {
  /** cs_consume_ai_usage and the cs_ai_usage row reads and updates, in memory, for one day. */
  function usage(seed: Record<string, number> = {}) {
    const rows = new Map(Object.entries(seed));
    const key = (u: unknown, f: unknown) => `${u}|${f}`;
    const client = {
      rpc: async (_fn: string, a: Record<string, unknown>) => {
        const k = key(a.p_user, a.p_feature);
        const c = rows.get(k) ?? 0;
        if (c >= (a.p_limit as number)) return { data: null, error: null };
        rows.set(k, c + 1);
        return { data: c + 1, error: null };
      },
      from: () => ({
        select: () => ({ match: async (q: Record<string, unknown>) => ({ data: rows.has(key(q.user_id, q.feature)) ? [{ count: rows.get(key(q.user_id, q.feature)) }] : [], error: null }) }),
        update: (v: { count: number }) => ({
          match: (q: Record<string, unknown>) => ({
            select: async () => {
              const k = key(q.user_id, q.feature);
              if (rows.get(k) !== q.count) return { data: [], error: null };
              rows.set(k, v.count);
              return { data: [{ count: v.count }], error: null };
            },
          }),
        }),
      }),
    };
    return { rows, client: client as unknown as UsageClient };
  }
  const OWNER = "13b28b1d-2ecb-40be-b3a9-aefc90366f9b";

  it("takes the profile's slot, the account's and the studio's", async () => {
    const u = usage();
    expect(await takeSlots(u.client, "u1", "mb", "2026-10-15")).toEqual({ ok: true });
    expect(u.rows.get("u1|market-check:mb")).toBe(1);
    expect(u.rows.get("u1|market-check")).toBe(1);
    expect(u.rows.get(`${OWNER}|market-check-global`)).toBe(1);
  });

  it("refuses a profile's second check the same day without touching the account's or the studio's", async () => {
    const u = usage({ "u1|market-check:me": 1, "u1|market-check": 1, [`${OWNER}|market-check-global`]: 1 });
    const r = await takeSlots(u.client, "u1", "me", "2026-10-15");
    expect(r).toMatchObject({ ok: false, status: 429, body: { code: "weekly_limit", nextDay: "2026-10-22" } });
    expect(u.rows.get("u1|market-check")).toBe(1);
    expect(u.rows.get(`${OWNER}|market-check-global`)).toBe(1);
  });

  it("refuses a fourth profile the same day and gives its slot back", async () => {
    const u = usage({ "u1|market-check": 3 });
    const r = await takeSlots(u.client, "u1", "x4", "2026-10-15");
    expect(r).toMatchObject({ ok: false, status: 429, body: { code: "account_limit" } });
    expect(u.rows.get("u1|market-check:x4")).toBe(0);
  });

  it("gives the profile's and the account's slots back when the studio's are used up", async () => {
    const u = usage({ [`${OWNER}|market-check-global`]: 20 });
    const r = await takeSlots(u.client, "u1", "me", "2026-10-15");
    expect(r).toMatchObject({ ok: false, status: 429, body: { code: "daily_limit" } });
    expect(u.rows.get("u1|market-check:me")).toBe(0);
    expect(u.rows.get("u1|market-check")).toBe(0);
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

  it("names the website as a hint and never quotes its pages", () => {
    const user = suggestMessages({ name: "Leo", audience: "young families", topics: [], site: "leotan.sg" })[1].content;
    expect(user).toContain("Their website: leotan.sg");
    expect(suggestMessages({ name: "Leo", audience: "young families", topics: [], site: "" })[1].content).not.toContain("website");
  });
});

describe("searches on Trends: the request", () => {
  it("keeps at most 5 seeds, trimmed and deduplicated, and asks for one", () => {
    const i = cleanSearches({ seeds: ["  CPF   life ", "cpf life", "x", 7, "retirement", "hospital bills", "medishield", "wills", "estate"], serves: " young families ", sells: "advice" });
    expect(i.seeds).toEqual(["CPF life", "retirement", "hospital bills", "medishield", "wills"]);
    expect(i).toMatchObject({ profile: "me", serves: "young families", sells: "advice" });
    expect(cleanSearches({ profile: "pmg2k1x9ab", seeds: "cpf" })).toMatchObject({ profile: "pmg2k1x9ab", seeds: [] });
    expect(cleanSearches({ profile: "../x" }).profile).toBe("me");
    expect(searchesProblem(cleanSearches({ seeds: [] }))).toBe("Add at least one topic you post about.");
    expect(searchesProblem(cleanSearches({ seeds: ["cpf"] }))).toBeNull();
  });

  it("asks Labs for 30 related keywords in Singapore and YouTube for one block of 20", () => {
    expect(relatedTask("cpf")).toEqual({ keyword: "cpf", location_code: 2702, language_code: "en", depth: 1, limit: 30 });
    expect(videosTask("cpf")).toEqual({ keyword: "cpf", location_code: 2702, language_code: "en", block_depth: 20 });
  });

  it("refuses a second check in a week in the page's words", () => {
    expect(searchWeekRefusal("2026-10-27")).toEqual({ status: 429, body: { code: "weekly_limit", nextDay: "2026-10-27", error: "Checked this week. Next check from Tue 27 Oct." } });
  });
});

describe("searches on Trends: shaping DataForSEO's answers", () => {
  const life = relatedKeywords(related, "life insurance");

  it("reads every keyword of the real Labs answer with its volume and 12 months, oldest first", () => {
    expect(life).toHaveLength(9);
    expect(life[0]).toEqual({
      keyword: "life insurance",
      seed: "life insurance",
      volume: 22200,
      series: [18100, 14800, 40500, 60500, 60500, 49500, 1900, 880, 1600, 1000, 590, 720],
      lastMonth: "2026-09",
    });
    expect(life.map((k) => k.keyword)).toContain("life insurance singapore for foreigners");
  });

  it("reads the real empty answer as no keywords", () => {
    expect(relatedKeywords(relatedEmpty, "sales follow up")).toEqual([]);
    expect(relatedKeywords(null, "x")).toEqual([]);
  });

  it("pads a short history at the old end and reads a missing month as 0", () => {
    expect(seriesOf([{ year: 2026, month: 9, search_volume: 30 }, { year: 2026, month: 8, search_volume: null }])).toEqual([...Array(10).fill(0), 0, 30]);
    expect(seriesOf("junk")).toEqual(Array(12).fill(0));
    expect(lastMonthOf([{ year: 2025, month: 12 }, { year: 2026, month: 1 }, { year: 2026, month: 13 }])).toBe("2026-01");
    expect(lastMonthOf([])).toBeNull();
  });

  it("drops keywords under 10 searches, keeps one per slug (the bigger) and sorts biggest first", () => {
    const k = (keyword: string, volume: number, seed = "s"): RelatedKeyword => ({ keyword, seed, volume, series: [], lastMonth: null });
    expect(candidates([[k("CPF life", 50, "a"), k("tiny", 9)], [k("cpf-life", 80, "b"), k("medisave", 10)]]).map((x) => [x.keyword, x.seed])).toEqual([
      ["cpf-life", "b"],
      ["medisave", "s"],
    ]);
    expect(topicSlug("CPF LIFE payout 2026?")).toBe("cpf-life-payout-2026");
  });
});

describe("searches on Trends: the figures", () => {
  const months = (before: number, recent: number) => [0, 0, 0, 0, 0, 0, before, 0, 0, recent, 0, 0];

  it("compares the last 3 months with the 3 before, and calls a zero base New", () => {
    expect(changeOf(months(100, 140))).toBe(40);
    expect(changeOf(months(0, 50))).toBeNull();
    expect(trendOf(changeOf(months(0, 50)))).toBe("new");
    expect(changeOf(seriesOf(related.tasks[0].result[0].items[0].keyword_data.keyword_info.monthly_searches))).toBe(-47);
  });

  it("draws the rising and falling lines at 20%", () => {
    expect(trendOf(20)).toBe("rising");
    expect(trendOf(19)).toBe("steady");
    expect(trendOf(-19)).toBe("steady");
    expect(trendOf(-20)).toBe("falling");
  });

  it("calls it a gap at 100 searches and fewer than 3 recent videos, never without a YouTube read", () => {
    expect(isGap(100, 2)).toBe(true);
    expect(isGap(99, 2)).toBe(false);
    expect(isGap(100, 3)).toBe(false);
    expect(isGap(5000, null)).toBe(false);
  });

  it("counts YouTube's results from the last 90 days and keeps the 3 newest, clean links", () => {
    const at = (ago: number) => new Date(Date.parse("2026-10-20T00:00:00Z") - ago * 86_400_000).toISOString().replace("T", " ").replace(/\.\d+Z$/, " +00:00");
    const serp = (agos: number[]) => ({
      tasks: [{ status_code: 20000, result: [{ items: [
        { type: "youtube_channel", title: "A channel", timestamp: at(1) },
        ...agos.map((d, n) => ({ type: "youtube_video", title: `Video ${n}`, video_id: `vid00${n}`, url: `https://www.youtube.com/watch?v=vid00${n}&pp=x`, timestamp: at(d) })),
      ] }] }],
    });
    const now = new Date("2026-10-20T00:00:00Z");
    expect(recentVideos(serp([10, 89, 91, 400]), now)).toEqual({
      recent: 2,
      videos: [
        { title: "Video 0", url: "https://www.youtube.com/watch?v=vid000" },
        { title: "Video 1", url: "https://www.youtube.com/watch?v=vid001" },
        { title: "Video 2", url: "https://www.youtube.com/watch?v=vid002" },
      ],
    });
    expect(recentVideos(serp([1, 2, 3]), now)?.recent).toBe(3);
    expect(recentVideos({ tasks: [{ result: null }] }, now)).toBeNull();
  });

  it("reads the real YouTube answer: none of its top 20 from the 90 days before 20 Oct, one from 1 May's", () => {
    expect(recentVideos(youtube, new Date("2026-10-21T00:00:00Z"))?.recent).toBe(0);
    const may = recentVideos(youtube, new Date("2026-05-01T00:00:00Z"))!;
    expect(may.recent).toBe(1);
    expect(may.videos[0].url).toBe("https://www.youtube.com/watch?v=w5AplqAvoXo");
  });

  it("makes a topic with its slug, change, trend and gap", () => {
    const k: RelatedKeyword = { keyword: "CPF life payout", seed: "cpf", volume: 1300, series: months(100, 140), lastMonth: "2026-09" };
    expect(toTopic(k, { recent: 1, videos: [] })).toEqual({
      keyword: "CPF life payout", slug: "cpf-life-payout", seed: "cpf", volume: 1300, series: months(100, 140), lastMonth: "2026-09", change: 40, trend: "rising", recentVideos: 1, gap: true, videos: [],
    });
    expect(toTopic(k, null)).toMatchObject({ recentVideos: null, gap: false, videos: [] });
  });
});

describe("searches on Trends: Jev", () => {
  const noul = (keep: number | undefined, safe: number | undefined) => ({
    ...(keep === undefined ? {} : { keep: { type: "noul" as const, noul: keep } }),
    ...(safe === undefined ? {} : { safe: { type: "noul" as const, noul: safe } }),
  });

  it("keeps a keyword only when both fit and safe are 0.6 or more", () => {
    expect(keptByJev(noul(0.6, 0.6))).toBe(true);
    expect(keptByJev(noul(0.59, 0.9))).toBe(false);
    expect(keptByJev(noul(0.9, 0.59))).toBe(false);
  });

  it("keeps every keyword (already 10 searches or more) when Jev is down", () => {
    expect(keptByJev(null)).toBe(true);
    expect(keptByJev(noul(undefined, 0.9))).toBe(true);
  });

  it("names the brand's own audience and offer, never a financial adviser", () => {
    const a = searchAsk(cleanSearches({ seeds: ["cold calling"], serves: "Self-employed salespeople", sells: "A daily activity tracker" }), "cold calling tips");
    expect(a.state).toEqual({ serves: "Self-employed salespeople", sells: "A daily activity tracker", country: "Singapore", keyword: "cold calling tips" });
    expect(Object.keys(a.questions)).toEqual(["keep", "safe"]);
    expect(JSON.stringify(a)).not.toMatch(/adviser|advisor/i);
  });
});
