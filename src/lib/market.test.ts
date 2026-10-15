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

describe("a digest synced from an older or newer app", () => {
  it("drops a check with an unreadable date and items that would break the page, keeping the rest", () => {
    const good = n("https://a.sg/1");
    localStorage.setItem("content-studio-market-u1", JSON.stringify({
      checks: [
        { checkedAt: "soon", news: [], geo: [], posts: [] },
        {
          checkedAt: "2026-10-15T00:00:00Z",
          news: [null, { ...good, title: { x: 1 } }, { ...good, url: 5 }, good],
          geo: [{}, { question: "Is CPF enough?", position: "named", sources: "nope" }, g("Is CPF enough for me?", "not-mentioned")],
          posts: [{ id: "1" }, p("2")],
        },
      ],
    }));
    const s = m.loadMarket("u1");
    expect(s.checks).toHaveLength(1);
    expect(s.checks[0].news.map((x) => x.url)).toEqual(["https://a.sg/1"]);
    expect(s.checks[0].geo.map((x) => x.question)).toEqual(["Is CPF enough for me?"]);
    expect(s.checks[0].posts.map((x) => x.id)).toEqual(["2"]);
    expect(() => [m.nextCheckDay(s), m.actCount(s.checks[0], s), m.pickingUp(s.checks)]).not.toThrow();
  });
});

describe("what the page says about the week", () => {
  const job = (code = "weekly_limit") => ({ state: "failed" as const, startedAt: 0, error: "You've had this week's check. The next one opens Thu 22 Oct at 8am.", code });
  const at = new Date("2026-10-16T03:00:00Z");
  it("explains a refused check when no result reached this page", () => {
    expect(m.weekNote(m.EMPTY_MARKET, job(), at)).toBe("You've had this week's check. The next one opens Thu 22 Oct at 8am. Its result is on another profile, or was lost when a page closed mid-check.");
  });
  it("repeats the server's words when this page has the week's result", () => {
    const s = { ...m.EMPTY_MARKET, checks: [digest("2026-10-15T01:00:00Z")] };
    expect(m.weekNote(s, job(), at)).toBe("You've had this week's check. The next one opens Thu 22 Oct at 8am.");
  });
  it("says when the next check opens, or nothing", () => {
    const s = { ...m.EMPTY_MARKET, checks: [digest("2026-10-15T01:00:00Z")] };
    expect(m.weekNote(s, null, at)).toBe("Next check opens Thu 22 Oct at 8am.");
    expect(m.weekNote(m.EMPTY_MARKET, null, at)).toBe("");
    expect(m.weekNote(m.EMPTY_MARKET, job("daily_limit"), at)).toBe("");
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

describe("this pass's fields survive sync", () => {
  it("keeps who the answer recommends, what it says and Jev's act score", () => {
    m.saveMarket("u1", { ...m.EMPTY_MARKET, checks: [digest("2026-10-15T00:00:00Z", [n("https://a.sg/1", { actScore: 0.8 })], [{ ...g("Is CPF enough for me?", "not-mentioned"), named: ["Providend", 5 as unknown as string], gist: "Most people need more than CPF." }, { ...g("Second question here?", "named"), gist: 7 as unknown as string }])] });
    const c = m.loadMarket("u1").checks[0];
    expect(c.news[0].actScore).toBe(0.8);
    expect(c.geo[0].named).toEqual(["Providend"]);
    expect(c.geo[0].gist).toBe("Most people need more than CPF.");
    expect("gist" in c.geo[1]).toBe(false);
  });
});

describe("the Monday reminder offer", () => {
  it("shows only when reminders are off and this browser can show them", () => {
    expect(m.reminderOffer(false, "ok")).toBe(true);
    expect(m.reminderOffer(true, "ok")).toBe(false);
    expect(m.reminderOffer(false, "ios-install")).toBe(false);
    expect(m.reminderOffer(false, "unsupported")).toBe(false);
  });
});

describe("news by topic", () => {
  it("groups stories under each topic in the order they came, with picking-up topics first", () => {
    const items = [n("https://a.sg/1", { keyword: "HDB" }), n("https://a.sg/2", { keyword: "CPF" }), n("https://a.sg/3", { keyword: "HDB" })];
    expect(m.newsByTopic(items, []).map((t) => [t.keyword, t.items.length])).toEqual([["HDB", 2], ["CPF", 1]]);
    expect(m.newsByTopic(items, ["CPF"]).map((t) => t.keyword)).toEqual(["CPF", "HDB"]);
  });
});

describe("dismissing a client question", () => {
  it("hides it and stops asking it next week; undo puts both back in place", () => {
    const q = g("Is CPF enough for me?", "not-mentioned");
    const s = { ...m.EMPTY_MARKET, questions: ["First question here?", "Is CPF enough for me?", "Last question here?"] };
    const off = m.dismissQuestion(s, q, true);
    expect(off.questions).toEqual(["First question here?", "Last question here?"]);
    expect(off.dismissed).toContain(m.geoKey(q));
    const back = m.dismissQuestion(off, q, false, 1);
    expect(back.questions).toEqual(s.questions);
    expect(back.dismissed).not.toContain(m.geoKey(q));
  });
});

describe("sources", () => {
  it("lists each site once, in the answer's order", () => {
    const x: GeoRead = { question: "How much CPF can I use?", position: "not-mentioned", checkUrl: null, sources: ["https://cpf.gov.sg/a", "https://cpf.gov.sg/b", "https://hdb.gov.sg/c"].map((url) => ({ url, domain: new URL(url).hostname, title: "" })) };
    expect(m.siteList(x.sources).map((s) => s.domain)).toEqual(["cpf.gov.sg", "hdb.gov.sg"]);
    expect(new URL(`https://x${m.geoWriteUrl(x)}`).searchParams.get("ctx")).toContain("draw on: cpf.gov.sg, hdb.gov.sg.");
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
