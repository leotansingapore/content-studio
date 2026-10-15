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
