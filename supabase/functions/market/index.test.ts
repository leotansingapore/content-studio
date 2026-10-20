import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The market handler's "searches" action with DataForSEO and Jev faked from the integrator's real answers: the gate,
// the brand's week, which counters move and which come back. Nothing here reaches a network.
const db = vi.hoisted(() => ({
  /** `${user}|${feature}|${day}` -> count, as cs_ai_usage keeps it. */
  rows: new Map<string, number>(),
  /** Features whose daily counter is used up. */
  full: new Set<string>(),
  admin: {} as Record<string, unknown>,
  handler: null as null | ((r: Request) => Promise<Response>),
}));
const OWNER = "13b28b1d-2ecb-40be-b3a9-aefc90366f9b";
const LEO = "leo-uid";
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const count = (user: string, feature: string, day = today()) => db.rows.get(`${user}|${feature}|${day}`) ?? 0;

db.admin = {
  auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
  rpc: async (_fn: string, a: { p_user: string; p_feature: string; p_limit: number }) => {
    const k = `${a.p_user}|${a.p_feature}|${today()}`;
    const n = db.rows.get(k) ?? 0;
    if (db.full.has(a.p_feature) || n >= a.p_limit) return { data: null, error: null };
    db.rows.set(k, n + 1);
    return { data: n + 1, error: null };
  },
  from: () => {
    const q: Record<string, unknown> = {};
    const read = () => ({
      data: [...db.rows]
        .map(([k, c]) => {
          const [user_id, feature, day] = k.split("|");
          return { user_id, feature, day, count: c };
        })
        .filter((r) => r.user_id === q.user_id && r.feature === q.feature && (q.days as string[]).includes(r.day)),
      error: null,
    });
    const chain = {
      eq: (col: string, v: unknown) => ((q[col] = v), chain),
      in: async (_col: string, days: string[]) => ((q.days = days), read()),
      match: async (m: { user_id: string; feature: string; day: string }) => ({ data: [{ count: db.rows.get(`${m.user_id}|${m.feature}|${m.day}`) ?? 0 }], error: null }),
    };
    return {
      select: () => chain,
      update: (v: { count: number }) => ({
        match: (m: { user_id: string; feature: string; day: string }) => ({
          select: async () => (db.rows.set(`${m.user_id}|${m.feature}|${m.day}`, v.count), { data: [{ count: v.count }], error: null }),
        }),
      }),
    };
  },
};
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => db.admin }));

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const RELATED = fixture("related-keywords.json");
const EMPTY = fixture("related-keywords-empty.json");
const YOUTUBE = fixture("youtube-organic.json");

let labs: "ok" | "down" = "ok";
/** Seeds whose Labs read fails on its own. */
const labsDownFor = new Set<string>();
let youtube: "ok" | "down" = "ok";
let jev: "up" | "down" = "up";
let env: Record<string, string> = {};
const sent: { url: string; body: unknown }[] = [];

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: URL | string, init?: RequestInit) => {
    const url = String(u);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    sent.push({ url, body });
    if (url.includes("/dataforseo_labs/google/related_keywords/live")) {
      const seed = body[0].keyword as string;
      if (labs === "down" || labsDownFor.has(seed)) return new Response("no", { status: 500 });
      return new Response(seed === "sales follow up" ? EMPTY : RELATED, { headers: { "content-type": "application/json" } });
    }
    if (url.includes("/serp/youtube/organic/live/advanced")) {
      if (youtube === "down") return Response.json({ status_code: 20000, tasks: [{ status_code: 40200, status_message: "Payment Required." }] });
      return new Response(YOUTUBE, { headers: { "content-type": "application/json" } });
    }
    // Your market's paid reads (the news, ChatGPT's answers) are down whenever a check reaches them
    if (url.includes("/serp/google/news/live/advanced") || url.includes("/ai_optimization/chat_gpt/llm_scraper/")) return new Response("no", { status: 500 });
    if (url.startsWith("https://api.typesafe.ai/")) {
      if (jev === "down") return new Response("busy", { status: 503 });
      // anything naming one insurer fails the fit question; the rest pass both
      const off = /aia/.test(body.state.keyword);
      return Response.json({ answers: { keep: { type: "noul", noul: off ? 0.2 : 0.9 }, safe: { type: "noul", noul: 0.8 } } });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  sent.length = 0;
  db.rows.clear();
  db.full.clear();
  labsDownFor.clear();
  labs = "ok";
  youtube = "ok";
  jev = "up";
  env = {
    NORTH_STAR_USERS: `someone-else,${LEO}`,
    MARKET_USERS: LEO,
    DATAFORSEO_LOGIN: "l",
    DATAFORSEO_PASSWORD: "p",
    TYPESAFE_API_KEY: "t",
  };
});

const call = async (body: unknown, uid = LEO) => {
  const r = await db.handler!(new Request("http://x/market", { method: "POST", headers: uid ? { Authorization: `Bearer ${uid}` } : {}, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const ask = { action: "searches", profile: "me", seeds: ["life insurance"], serves: "Young families", sells: "Protection planning" };
const spent = () => [count(LEO, "search-topics:me"), count(LEO, "search-topics"), count(OWNER, "search-topics-global")];
const providers = () => sent.filter((s) => !s.url.startsWith("https://api.typesafe.ai/"));

describe("market searches: the gate", () => {
  it("answers 401 without a sign-in and 403 for anyone not on NORTH_STAR_USERS, even on MARKET_USERS, before any counter", async () => {
    expect((await call(ask, "")).status).toBe(401);
    env.MARKET_USERS = "*";
    expect(await call(ask, "not-listed")).toEqual({ status: 403, body: { code: "not_enabled", error: "This isn't switched on for your account yet." } });
    env.NORTH_STAR_USERS = "";
    expect((await call(ask)).status).toBe(403);
    expect(db.rows.size).toBe(0);
    expect(sent).toEqual([]);
  });

  it("is reached before Your market's own gate, which still answers its actions as before", async () => {
    env.MARKET_USERS = "";
    expect((await call(ask, "someone-else")).status).toBe(200);
    expect(await call({ action: "check" }, "someone-else")).toEqual({ status: 404, body: { error: "Your market is not enabled for this account yet." } });
    expect(await call({ action: "status" }, "someone-else")).toEqual({ status: 200, body: { enabled: false } });
  });

  it("refuses a request with no topics and says it isn't on without DataForSEO, before counting", async () => {
    expect(await call({ ...ask, seeds: [" "] })).toEqual({ status: 400, body: { code: "bad_request", error: "Add at least one topic you post about." } });
    delete env.DATAFORSEO_PASSWORD;
    expect(await call(ask)).toEqual({ status: 503, body: { code: "not_configured", error: "Searches aren't switched on yet." } });
    expect(db.rows.size).toBe(0);
    expect(sent).toEqual([]);
  });
});

describe("market searches: a check", () => {
  it("counts the brand's week, the person and everyone, and answers topics with the YouTube supply of the top 10", async () => {
    const r = await call({ ...ask, seeds: ["life insurance", "Life Insurance", "sales follow up"] });
    expect(r.status).toBe(200);
    expect(spent()).toEqual([1, 1, 1]);
    const labsAsks = providers().filter((s) => s.url.includes("related_keywords"));
    expect(labsAsks.map((s) => s.body)).toEqual([
      [{ keyword: "life insurance", location_code: 2702, language_code: "en", depth: 1, limit: 30 }],
      [{ keyword: "sales follow up", location_code: 2702, language_code: "en", depth: 1, limit: 30 }],
    ]);
    // 9 keywords, all at 10 searches or more; Jev turns down the AIA one
    expect(sent.filter((s) => s.url.startsWith("https://api.typesafe.ai/"))).toHaveLength(9);
    const topics = r.body.topics as { keyword: string; volume: number; recentVideos: number | null; gap: boolean; series: number[]; trend: string }[];
    expect(topics.map((t) => t.keyword)).not.toContain("life insurance aia");
    expect(topics).toHaveLength(8);
    expect(topics.map((t) => t.volume)).toEqual([...topics.map((t) => t.volume)].sort((a, b) => b - a));
    expect(topics.every((t) => t.series.length === 12 && t.recentVideos === 0)).toBe(true);
    expect(topics.filter((t) => t.gap).map((t) => t.keyword)).toEqual(["life insurance", "life insurance singapore", "singlife life insurance", "whole life insurance singapore", "best life insurance singapore"]);
    expect(r.body.filtered).toBe(true);
    expect(Date.parse(r.body.checkedAt)).toBeGreaterThan(0);
    const yt = providers().filter((s) => s.url.includes("youtube"));
    expect(yt).toHaveLength(8);
    expect(yt[0].body).toEqual([{ keyword: "life insurance", location_code: 2702, language_code: "en", block_depth: 20 }]);
  });

  it("reads YouTube for the 10 biggest only", async () => {
    const many = JSON.parse(RELATED);
    const item = many.tasks[0].result[0].items[1];
    many.tasks[0].result[0].items = Array.from({ length: 14 }, (_, n) => ({ ...item, keyword_data: { ...item.keyword_data, keyword: `cpf topic ${n}` } }));
    const stub = globalThis.fetch;
    vi.stubGlobal("fetch", async (u: URL | string, init?: RequestInit) =>
      String(u).includes("related_keywords") ? (sent.push({ url: String(u), body: null }), Response.json(many)) : stub(u, init));
    try {
      const r = await call(ask);
      expect(r.body.topics).toHaveLength(14);
      expect(providers().filter((s) => s.url.includes("youtube"))).toHaveLength(10);
      expect(r.body.topics.slice(10).every((t: { recentVideos: number | null; gap: boolean }) => t.recentVideos === null && !t.gap)).toBe(true);
    } finally {
      vi.stubGlobal("fetch", stub);
    }
  });

  it("asks Jev about the 60 biggest keywords at most and keeps 30", async () => {
    const many = JSON.parse(RELATED);
    const item = many.tasks[0].result[0].items[1];
    many.tasks[0].result[0].items = Array.from({ length: 70 }, (_, n) => ({
      ...item,
      keyword_data: { ...item.keyword_data, keyword: `cpf topic ${n}`, keyword_info: { ...item.keyword_data.keyword_info, search_volume: 1000 - n } },
    }));
    const stub = globalThis.fetch;
    vi.stubGlobal("fetch", async (u: URL | string, init?: RequestInit) =>
      String(u).includes("related_keywords") ? (sent.push({ url: String(u), body: null }), Response.json(many)) : stub(u, init));
    try {
      const r = await call(ask);
      expect(sent.filter((s) => s.url.startsWith("https://api.typesafe.ai/"))).toHaveLength(60);
      expect(r.body.topics.map((t: { keyword: string }) => t.keyword)).toEqual(Array.from({ length: 30 }, (_, n) => `cpf topic ${n}`));
    } finally {
      vi.stubGlobal("fetch", stub);
    }
  });

  it("keeps every keyword and says it wasn't filtered when Jev is down", async () => {
    jev = "down";
    const r = await call(ask);
    expect(r.body.filtered).toBe(false);
    expect(r.body.topics).toHaveLength(9);
  });

  it("keeps the uses when Labs answers with nothing for a niche seed", async () => {
    expect(await call({ ...ask, seeds: ["sales follow up"] })).toMatchObject({ status: 200, body: { topics: [], filtered: false } });
    expect(spent()).toEqual([1, 1, 1]);
  });

  it("keeps the uses when one seed or YouTube fails but a seed came back", async () => {
    labsDownFor.add("cpf");
    youtube = "down";
    const r = await call({ ...ask, seeds: ["cpf", "life insurance"] });
    expect(r.status).toBe(200);
    expect(r.body.topics.every((t: { recentVideos: number | null; gap: boolean }) => t.recentVideos === null && !t.gap)).toBe(true);
    expect(spent()).toEqual([1, 1, 1]);
  });
});

describe("market searches: the week, the caps and refunds", () => {
  it("refuses a brand checked earlier this week before taking anything, with the day it opens", async () => {
    db.rows.set(`${LEO}|search-topics:me|${daysAgo(3)}`, 1);
    const r = await call(ask);
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ code: "weekly_limit", nextDay: daysAgo(-4) });
    expect(r.body.error).toMatch(/^Checked this week\. Next check from \w{3} \d{1,2} \w{3}\.$/);
    expect(spent()).toEqual([0, 0, 0]);
    expect(sent).toEqual([]);
  });

  it("refuses a second check the same day without touching the person's or everyone's counters", async () => {
    expect((await call(ask)).status).toBe(200);
    sent.length = 0;
    const r = await call(ask);
    expect(r).toMatchObject({ status: 429, body: { code: "weekly_limit", nextDay: daysAgo(-7) } });
    expect(spent()).toEqual([1, 1, 1]);
    expect(sent).toEqual([]);
    // another brand has its own week
    expect((await call({ ...ask, profile: "pmg2k1x9ab" })).status).toBe(200);
  });

  it("answers the daily cap with the standard line and gives the brand's week back", async () => {
    db.full.add("search-topics");
    expect(await call(ask)).toEqual({ status: 429, body: { code: "daily_limit", error: "You've used all 2 for today. It resets at 8am Singapore time." } });
    expect(spent()).toEqual([0, 0, 0]);
    expect(sent).toEqual([]);
  });

  it("gives the brand's week and the person's use back when everyone's checks are spent", async () => {
    db.full.add("search-topics-global");
    expect(await call(ask)).toEqual({ status: 429, body: { code: "global_limit", error: "Search checks are paused for today. Try again after 8am Singapore time." } });
    expect(spent()).toEqual([0, 0, 0]);
    expect(sent).toEqual([]);
  });

  it("gives all three back when DataForSEO answered no seed", async () => {
    labs = "down";
    expect(await call({ ...ask, seeds: ["cpf", "life insurance"] })).toEqual({ status: 502, body: { code: "failed", error: "Couldn't read searches just now. Nothing was used up. Try again." } });
    expect(spent()).toEqual([0, 0, 0]);
    expect(sent.some((s) => s.url.includes("youtube") || s.url.startsWith("https://api.typesafe.ai/"))).toBe(false);
    // and the week is open again
    labs = "ok";
    expect((await call(ask)).status).toBe(200);
  });
});

describe("Your market: a check", () => {
  const check = { action: "check", profile: "me", audience: "Young families in Singapore", questions: ["How much life insurance do I need?"], keywords: ["cpf"] };
  const checks = () => [count(LEO, "market-check:me"), count(LEO, "market-check"), count(OWNER, "market-check-global")];

  it("gives the profile's week, the account's and everyone's check back when neither the news nor the AI answers came back", async () => {
    const r = await call(check);
    expect(r).toEqual({ status: 502, body: { error: "Couldn't reach the news or the AI answers. This check wasn't counted; try again in a few minutes." } });
    expect(sent.some((s) => s.url.includes("/serp/google/news/"))).toBe(true);
    expect(sent.some((s) => s.url.includes("/llm_scraper/"))).toBe(true);
    expect(checks()).toEqual([0, 0, 0]);
    // and the week is still open: a retry reaches the providers again instead of a weekly refusal
    sent.length = 0;
    expect((await call(check)).status).toBe(502);
    expect(providers().length).toBeGreaterThan(0);
  });

  it("refuses a profile checked earlier this week before taking anything or paying for a read, with the day it opens", async () => {
    db.rows.set(`${LEO}|market-check:me|${daysAgo(3)}`, 1);
    const r = await call(check);
    expect(r.status).toBe(429);
    expect(r.body).toMatchObject({ code: "weekly_limit", nextDay: daysAgo(-4) });
    expect(r.body.error).toMatch(/^This profile has had its check this week\. The next one opens \w{3} \d{1,2} \w{3} at 8am\.$/);
    expect(checks()).toEqual([0, 0, 0]);
    expect(sent).toEqual([]);
  });
});
