import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeError } from "@/lib/edgeFn";
import type { SearchTopic } from "../../supabase/functions/market/logic.ts";

const callFn = vi.fn();
vi.mock("@/lib/edgeFn", async (orig) => ({ ...(await orig<typeof import("@/lib/edgeFn")>()), callFn: (...a: unknown[]) => callFn(...a) }));

const s = await import("./searchTopics");

class MemStorage {
  s = new Map<string, string>();
  full = Infinity;
  getItem(k: string) { return this.s.get(k) ?? null; }
  setItem(k: string, val: string) {
    if (val.length > this.full) throw new DOMException("full", "QuotaExceededError");
    this.s.set(k, val);
  }
  removeItem(k: string) { this.s.delete(k); }
}
let storage: MemStorage;
const changed = vi.fn();

beforeEach(() => {
  storage = new MemStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage, addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("dispatchEvent", (e: Event) => changed(e.type));
  callFn.mockReset();
  changed.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const topic = (keyword: string, o: Partial<SearchTopic> = {}): SearchTopic => ({
  keyword, slug: keyword.replace(/ /g, "-"), seed: "cpf", volume: 1300, series: Array(12).fill(100), lastMonth: "2026-09", change: 40, trend: "rising", recentVideos: 2, gap: true,
  videos: [{ title: "A video", url: "https://www.youtube.com/watch?v=abc123" }], ...o,
});
const check = (checkedAt: string, topics = [topic("cpf life payout")], filtered = true) => ({ checkedAt, topics, filtered });

describe("the stored searches", () => {
  it("live under content-studio-searches- plus the brand's scoped id, say so when saved, and read bad JSON as empty", () => {
    expect(s.searchesKey("u1")).toBe("content-studio-searches-u1");
    s.saveSearches("u1", { seeds: ["CPF", "cpf", " retirement "], checks: [check("2026-10-20T01:00:00Z")] });
    expect(s.loadSearches("u1")).toEqual({ seeds: ["CPF", "retirement"], checks: [check("2026-10-20T01:00:00Z")] });
    expect(changed).toHaveBeenCalledWith("content-studio-searches-changed");
    storage.setItem("content-studio-searches-u1", "{nope");
    expect(s.loadSearches("u1")).toEqual({ seeds: [], checks: [] });
  });

  it("drops a malformed check and a malformed topic on load, field by field", () => {
    const good = topic("cpf life payout");
    storage.setItem("content-studio-searches-u1", JSON.stringify({
      seeds: "cpf",
      checks: [
        null,
        { checkedAt: "not a date", topics: [good] },
        { checkedAt: "2026-10-13T01:00:00Z" },
        {
          checkedAt: "2026-10-20T01:00:00Z",
          topics: [
            good,
            { ...good, series: [1, 2] },
            { ...good, slug: "../x" },
            { ...good, trend: "up" },
            { ...good, volume: "1300" },
            { ...good, keyword: "medisave", slug: "medisave", videos: [{ title: "x", url: "javascript:alert(1)" }, null], gap: "yes", change: null, lastMonth: "2026-13" },
          ],
        },
      ],
    }));
    expect(s.loadSearches("u1")).toEqual({
      seeds: [],
      checks: [{ checkedAt: "2026-10-20T01:00:00Z", filtered: true, topics: [good, { ...good, keyword: "medisave", slug: "medisave", videos: [], gap: false, change: null, lastMonth: null }] }],
    });
  });

  it("keeps the newest 8 checks, and fewer rather than none when storage is full", () => {
    const checks = Array.from({ length: 10 }, (_, k) => check(`2026-08-${String(k + 10).padStart(2, "0")}T00:00:00Z`));
    expect(s.saveSearches("u1", { seeds: ["cpf"], checks }).checks.map((c) => c.checkedAt.slice(0, 10))).toEqual(checks.slice(-8).map((c) => c.checkedAt.slice(0, 10)));
    storage.full = 1500;
    const kept = s.saveSearches("u1", { seeds: ["cpf"], checks });
    expect(kept.checks.length).toBeLessThan(8);
    expect(s.loadSearches("u1")).toEqual(kept);
    expect(kept.seeds).toEqual(["cpf"]);
  });

  it("prefills the topics from the brand's own, then Your market's, then the Plan positioning's", () => {
    storage.setItem("content-studio-positioning-u1", JSON.stringify({ topics: ["Wills", "estate planning"] }));
    expect(s.defaultSeeds("u1")).toEqual(["Wills", "estate planning"]);
    storage.setItem("content-studio-market-u1", JSON.stringify({ topics: ["CPF", "MediShield"] }));
    expect(s.defaultSeeds("u1")).toEqual(["CPF", "MediShield"]);
    s.saveSeeds("u1", ["hospital bills"]);
    expect(s.defaultSeeds("u1")).toEqual(["hospital bills"]);
  });
});

describe("the week", () => {
  const state = (at: string) => ({ seeds: ["cpf"], checks: [check(at)] });
  it("opens 7 days after the latest check's day, and says so under the list", () => {
    expect(s.nextCheckDay(state("2026-10-20T01:00:00Z"), new Date("2026-10-26T23:59:00Z"))).toBe("2026-10-27");
    expect(s.nextCheckDay(state("2026-10-20T01:00:00Z"), new Date("2026-10-27T00:00:00Z"))).toBeNull();
    expect(s.nextCheckDay({ seeds: [], checks: [] })).toBeNull();
    expect(s.checkedLine(state("2026-10-20T01:00:00Z"), new Date("2026-10-21T00:00:00Z"))).toBe("Checked Tue 20 Oct. Next check from Tue 27 Oct.");
    expect(s.checkedLine(state("2026-10-20T01:00:00Z"), new Date("2026-10-27T00:00:00Z"))).toBe("Checked Tue 20 Oct.");
    expect(s.checkedLine({ seeds: [], checks: [] })).toBe("");
  });
});

describe("the rows", () => {
  const rows = [
    topic("a", { volume: 50, trend: "steady", change: 5, gap: false }),
    topic("b", { volume: 900, trend: "new", change: null, gap: false }),
    topic("c", { volume: 300, trend: "rising", change: 25, gap: true }),
    topic("d", { volume: 120, trend: "falling", change: -30, gap: true }),
  ];
  it("filters to rising (with New) or few videos, most searched first", () => {
    expect(s.showTopics(rows, "all").map((t) => t.keyword)).toEqual(["b", "c", "d", "a"]);
    expect(s.showTopics(rows, "rising").map((t) => t.keyword)).toEqual(["b", "c"]);
    expect(s.showTopics(rows, "gap").map((t) => t.keyword)).toEqual(["c", "d"]);
  });

  it("words the change chips", () => {
    expect(rows.map(s.changeLabel)).toEqual(["Steady", "New", "Up 25% in 3 months", "Down 30% in 3 months"]);
  });

  it("finds the related keywords from the same seed in the same check", () => {
    const c = check("2026-10-20T01:00:00Z", [...rows, topic("e", { seed: "wills" })]);
    expect(s.relatedTopics(c, rows[0]).map((t) => t.keyword)).toEqual(["b", "c", "d"]);
  });
});

describe("Make a post", () => {
  const ctxOf = (url: string) => new URLSearchParams(url.split("?")[1]);

  it("opens Write on a search as a real question, with its numbers and the MAS rules", () => {
    const p = ctxOf(s.searchWriteUrl(topic("cpf life payout", { volume: 1300, change: 40, trend: "rising" })));
    expect(p.get("pillar")).toBe("topic");
    expect(p.get("idea")).toBe("real-question");
    expect(p.get("detail")).toBe("cpf life payout");
    expect(p.get("ctx")).toBe(
      'People in Singapore search "cpf life payout" about 1,300 times a month (up 40% in 3 months). Write a post that answers what they want to know, in general terms. No product names, no promised returns, and no numbers other than the ones given here.',
    );
    expect(ctxOf(s.searchWriteUrl(topic("x", { change: null, trend: "new" }))).get("ctx")).toContain("(new in the last 3 months)");
  });

  it("opens Write on a hashtag as a TikTok, naming the tags it travels with, with the MAS rules", () => {
    const p = ctxOf(s.hashtagWriteUrl({ tag: "moneytok", related: [{ tag: "budgeting", overlap: 0.4 }, { tag: "savingmoney", overlap: 0.22 }] }));
    expect(p.get("platform")).toBe("tiktok");
    expect(p.get("format")).toBe("short-video");
    expect(p.get("detail")).toBe("#moneytok");
    expect(p.get("ctx")).toContain("tagged #moneytok often also carry #budgeting, #savingmoney");
    expect(p.get("ctx")).toContain("No product names, no promised returns, and no numbers other than the ones given here.");
  });
});

describe("the hashtags", () => {
  const day = (d: string, videos: number, medianViews = 1000) => ({ day: d, videos, medianViews });
  const data = {
    updated: "2026-10-20",
    tags: {
      moneytok: { history: [day("2026-10-08", 10), day("2026-10-13", 10), day("2026-10-15", 12), day("2026-10-20", 14, 18000)], related: [{ tag: "budgeting", overlap: 0.4 }], finance: true },
      budgeting: { history: [day("2026-10-20", 20)], related: [], finance: null },
      fyp: { history: [day("2026-10-20", 60)], related: [], finance: false },
      gone: { history: [day("2026-10-15", 9)], related: [], finance: true },
    },
  };

  it("shows the newest read's tags that aren't ruled out as not finance, most videos first", () => {
    const rows = s.hashtagRows(data);
    expect(rows.map((r) => r.tag)).toEqual(["budgeting", "moneytok"]);
    expect(rows[1].latest).toEqual(day("2026-10-20", 14, 18000));
    expect(rows[1].history.map((h) => h.day)).toEqual(["2026-10-08", "2026-10-13", "2026-10-15", "2026-10-20"]);
  });

  it("compares this week's videos with the week before, and words only a 20% move", () => {
    const [budgeting, moneytok] = s.hashtagRows(data);
    expect(moneytok.weekChange).toBe(30);
    expect(s.weekLabel(moneytok)).toBe("Up 30% this week");
    expect(budgeting.weekChange).toBeNull();
    expect(s.weekLabel(budgeting)).toBe("");
    expect(s.weekLabel({ ...moneytok, weekChange: -25 })).toBe("Down 25% this week");
    expect(s.weekLabel({ ...moneytok, weekChange: 10 })).toBe("");
  });

  it("says when the newest read is more than 2 days old, and nothing before the first", () => {
    expect(s.staleLine(data, new Date("2026-10-22T23:59:00Z"))).toBe("");
    expect(s.staleLine(data, new Date("2026-10-23T00:00:01Z"))).toBe("Last read Tue 20 Oct.");
    expect(s.staleLine({ updated: null, tags: {} })).toBe("");
    expect(s.hashtagRows({ updated: null, tags: {} })).toEqual([]);
  });
});

describe("which view /trends shows", () => {
  const leo = { id: "u1", email: "x" };
  it("gives Leo his views, keeps everyone else on the kits, and waits for the sign-in on a Leo link", () => {
    expect(s.trendView("search", leo)).toBe("search");
    expect(s.trendView("hashtags", leo)).toBe("hashtags");
    expect(s.trendView("formats", leo)).toBe("formats");
    expect(s.trendView("formats", null)).toBe("kits");
    expect(s.trendView("formats", undefined)).toBe("loading");
    expect(s.trendView("search", null)).toBe("kits");
    expect(s.trendView("hashtags", null)).toBe("kits");
    expect(s.trendView("search", undefined)).toBe("loading");
    expect(s.trendView(null, undefined)).toBe("kits");
    expect(s.trendView("junk", leo)).toBe("kits");
  });
});

describe("the check job", () => {
  it("sends the brand's topics with its audience and offer, and saves the check", async () => {
    storage.setItem("content-studio-positioning-u1", JSON.stringify({ audienceDetail: "Young families", oneLiner: "Protection planning", topics: [] }));
    s.saveSeeds("u1", ["cpf", "retirement"]);
    callFn.mockResolvedValue(check("2026-10-20T01:00:00Z"));
    await s.runSearchCheck("u1");
    expect(callFn).toHaveBeenCalledWith("market", { action: "searches", profile: "me", seeds: ["cpf", "retirement"], serves: "Young families", sells: "Protection planning" }, s.FAILED);
    expect(s.loadSearches("u1").checks).toEqual([check("2026-10-20T01:00:00Z")]);
    expect(s.searchJob()).toMatchObject({ state: "done", seeds: 2 });
  });

  it("says it isn't switched on for a 403 or 404, and passes the server's words on otherwise", async () => {
    callFn.mockRejectedValue(new EdgeError("This isn't switched on for your account yet.", 403, "not_enabled"));
    await s.runSearchCheck("u1");
    expect(s.searchJob()).toMatchObject({ state: "failed", error: "Searches aren't switched on yet.", code: "not_enabled" });
    callFn.mockRejectedValue(new EdgeError("Your market is not enabled for this account yet.", 404));
    await s.runSearchCheck("u1");
    expect(s.searchJob()).toMatchObject({ error: "Searches aren't switched on yet." });
    callFn.mockRejectedValue(new EdgeError("You've used all 2 for today. It resets at 8am Singapore time.", 429, "daily_limit"));
    await s.runSearchCheck("u1");
    expect(s.searchJob()).toMatchObject({ error: "You've used all 2 for today. It resets at 8am Singapore time.", code: "daily_limit" });
    expect(s.loadSearches("u1").checks).toEqual([]);
  });

  it("runs one check at a time", async () => {
    let finish: (v: unknown) => void = () => {};
    callFn.mockReturnValue(new Promise((r) => (finish = r)));
    const first = s.runSearchCheck("u1");
    await s.runSearchCheck("u1");
    expect(callFn).toHaveBeenCalledTimes(1);
    finish(check("2026-10-20T01:00:00Z"));
    await first;
  });
});
