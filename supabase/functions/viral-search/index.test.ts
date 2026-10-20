import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler with every provider faked (Apify, DataForSEO, Jev) from the integrator's real answers: which counters
// move and which come back. Nothing here reaches a network.
const db = vi.hoisted(() => ({
  spent: [] as string[],
  refunded: [] as string[],
  /** Features whose counter is used up. */
  full: new Set<string>(),
  admin: {} as Record<string, unknown>,
  handler: null as null | ((r: Request) => Promise<Response>),
}));
db.admin = {
  auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
  rpc: async (_fn: string, a: Record<string, unknown>) => {
    const f = String(a.p_feature);
    db.spent.push(`${a.p_user === LEO ? "" : "global:"}${f}`);
    return { data: db.full.has(f) ? null : 1, error: null };
  },
  from: () => ({
    select: () => ({ match: async () => ({ data: [{ count: 1 }], error: null }) }),
    update: () => ({
      match: (q: { feature: string; user_id: string }) => ({
        select: async () => (db.refunded.push(`${q.user_id === LEO ? "" : "global:"}${q.feature}`), { data: [{ count: 0 }], error: null }),
      }),
    }),
  }),
};
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => db.admin }));

const LEO = "leo-uid";
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const TIKTOK = fixture("tiktok-search.json");
const YOUTUBE = fixture("youtube-organic.json");

type Mode = "ok" | "down" | "slow" | "empty";
let apify: Mode = "ok";
let serp: Mode | "task-failed" = "ok";
let jev: "up" | "down" = "up";
let env: Record<string, string> = {};
const seen: string[] = [];
const sent: { url: string; body: unknown }[] = [];

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: URL | string, init?: RequestInit) => {
    const url = String(u);
    seen.push(url.split("?")[0]);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    sent.push({ url, body });
    const timeout = () => Promise.reject(Object.assign(new Error("signal timed out"), { name: "TimeoutError" }));
    if (url.startsWith("https://api.apify.com/")) {
      if (apify === "down") return new Response("platform-feature-disabled", { status: 402 });
      if (apify === "slow") return timeout();
      return new Response(apify === "empty" ? "[]" : TIKTOK, { headers: { "content-type": "application/json" } });
    }
    if (url.startsWith("https://api.dataforseo.com/")) {
      if (serp === "down") return new Response("no", { status: 500 });
      if (serp === "slow") return timeout();
      if (serp === "task-failed") return Response.json({ status_code: 20000, tasks: [{ status_code: 40200, status_message: "Payment Required." }] });
      if (serp === "empty") return Response.json({ status_code: 20000, tasks: [{ status_code: 20000, result: [{ items: [] }] }] });
      return new Response(YOUTUBE, { headers: { "content-type": "application/json" } });
    }
    if (url.startsWith("https://api.typesafe.ai/")) {
      if (jev === "down") return new Response("busy", { status: 503 });
      // the first result of each call is off-topic, the rest on
      const ids = Object.keys(body.questions);
      return Response.json({ answers: Object.fromEntries(ids.map((id, k) => [id, { type: "noul", noul: k === 0 ? 0.123 : 0.876 }])) });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  seen.length = 0;
  sent.length = 0;
  db.spent.length = 0;
  db.refunded.length = 0;
  db.full.clear();
  apify = "ok";
  serp = "ok";
  jev = "up";
  env = { NORTH_STAR_USERS: `someone-else,${LEO}`, APIFY_API_KEY: "a", DATAFORSEO_LOGIN: "l", DATAFORSEO_PASSWORD: "p", TYPESAFE_API_KEY: "t" };
});

const call = async (body: unknown, uid = LEO) => {
  const r = await db.handler!(new Request("http://x/viral-search", { method: "POST", headers: uid ? { Authorization: `Bearer ${uid}` } : {}, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const brand = { sells: "A daily activity tracker", serves: "Self-employed salespeople" };

describe("viral-search: the gate", () => {
  it("answers 401 without a sign-in and 403 for anyone not listed, before any counter or provider", async () => {
    expect((await call({ q: "cpf" }, "")).status).toBe(401);
    expect(await call({ q: "cpf" }, "not-listed")).toEqual({ status: 403, body: { code: "not_enabled", error: "This isn't switched on for your account yet." } });
    env.NORTH_STAR_USERS = "";
    expect((await call({ q: "cpf" })).status).toBe(403);
    expect(db.spent).toEqual([]);
    expect(seen).toEqual([]);
  });

  it("refuses a bad request, and says it isn't switched on without a key, before counting", async () => {
    expect(await call({ q: "a" })).toEqual({ status: 400, body: { code: "bad_request", error: "Search for 2 to 60 characters." } });
    expect((await call({ q: "cpf", platforms: ["instagram"] })).body.code).toBe("bad_request");
    delete env.APIFY_API_KEY;
    expect(await call({ q: "cpf" })).toEqual({ status: 503, body: { code: "not_configured", error: "Search isn't switched on yet." } });
    // YouTube alone needs no Apify key
    expect((await call({ q: "cpf", platforms: ["youtube"] })).status).toBe(200);
    delete env.DATAFORSEO_PASSWORD;
    expect((await call({ q: "cpf", platforms: ["youtube"] })).status).toBe(503);
    expect(db.spent).toEqual(["viral-search", "global:viral-search-global"]);
  });
});

describe("viral-search: caps", () => {
  it("counts the person, then everyone, and keeps both on a search that found things", async () => {
    const r = await call({ q: "sales follow up tips", brand });
    expect(r.status).toBe(200);
    expect(db.spent).toEqual(["viral-search", "global:viral-search-global"]);
    expect(db.refunded).toEqual([]);
    expect(r.body.failed).toEqual({});
    expect(r.body.results).toHaveLength(25);
    expect(r.body.results.slice(0, 5).every((f: { platform: string }) => f.platform === "tiktok")).toBe(true);
  });

  it("answers the person's daily limit with the server's words and calls nobody", async () => {
    db.full.add("viral-search");
    expect(await call({ q: "cpf" })).toEqual({ status: 429, body: { code: "daily_limit", error: "You've used all 10 for today. It resets at 8am Singapore time." } });
    expect(db.spent).toEqual(["viral-search"]);
    expect(seen).toEqual([]);
  });

  it("gives the person's use back when everyone's searches are spent", async () => {
    db.full.add("viral-search-global");
    expect(await call({ q: "cpf" })).toEqual({ status: 429, body: { code: "global_limit", error: "Search is busy today. Try again after 8am Singapore time." } });
    expect(db.spent).toEqual(["viral-search", "global:viral-search-global"]);
    expect(db.refunded).toEqual(["viral-search"]);
    expect(seen).toEqual([]);
  });
});

describe("viral-search: providers and refunds", () => {
  it("sends TikTok the contract's input and YouTube one Singapore block, nothing paid on top", async () => {
    await call({ q: "cpf" });
    const tt = sent.find((s) => s.url.startsWith("https://api.apify.com/"))!;
    expect(tt.url).toBe("https://api.apify.com/v2/acts/clockworks~tiktok-scraper/run-sync-get-dataset-items?timeout=60&clean=true");
    expect(tt.body).toEqual({ searchQueries: ["cpf"], resultsPerPage: 20, searchSection: "/video" });
    const yt = sent.find((s) => s.url.startsWith("https://api.dataforseo.com/"))!;
    expect(yt.url).toBe("https://api.dataforseo.com/v3/serp/youtube/organic/live/advanced");
    expect(yt.body).toEqual([{ keyword: "cpf", location_code: 2702, language_code: "en", depth: 20 }]);
  });

  it("keeps both uses when one platform fails, and says which and why", async () => {
    apify = "slow";
    const r = await call({ q: "cpf" });
    expect(r.status).toBe(200);
    expect(r.body.failed).toEqual({ tiktok: "took too long" });
    expect(r.body.results).toHaveLength(20);
    expect(db.refunded).toEqual([]);
    apify = "ok";
    serp = "task-failed";
    expect((await call({ q: "cpf" })).body.failed).toEqual({ youtube: "couldn't be searched" });
    expect(db.refunded).toEqual([]);
  });

  it("gives both uses back only when every platform failed on the provider", async () => {
    apify = "down";
    serp = "down";
    expect(await call({ q: "cpf" })).toEqual({ status: 502, body: { code: "failed", error: "Couldn't search right now. Try again in a few minutes." } });
    expect(db.refunded).toEqual(["viral-search", "global:viral-search-global"]);
    db.refunded.length = 0;
    apify = "ok";
    expect((await call({ q: "cpf", platforms: ["youtube"] })).status).toBe(502);
    expect(db.refunded).toEqual(["viral-search", "global:viral-search-global"]);
    expect(seen.filter((u) => u.includes("apify")).length).toBe(1);
  });

  it("keeps the uses when the providers answered with nothing", async () => {
    apify = "empty";
    serp = "empty";
    expect(await call({ q: "zzzz qqqq" })).toEqual({ status: 200, body: { results: [], failed: {} } });
    expect(db.refunded).toEqual([]);
    expect(seen.some((u) => u.includes("typesafe"))).toBe(false);
  });
});

describe("viral-search: Jev", () => {
  it("scores every result in calls of 10, naming the brand", async () => {
    const r = await call({ q: "sales follow up tips", brand });
    const asks = sent.filter((s) => s.url.startsWith("https://api.typesafe.ai/"));
    expect(asks.map((a) => Object.keys((a.body as { questions: object }).questions).length)).toEqual([10, 10, 5]);
    expect(JSON.stringify(asks[0].body)).toContain("a business that sells A daily activity tracker to Self-employed salespeople");
    const rel = r.body.results.map((f: { relevance: number }) => f.relevance);
    expect(rel.filter((p: number) => p === 0.12)).toHaveLength(3);
    expect(rel.filter((p: number) => p === 0.88)).toHaveLength(22);
  });

  it("shows every result when Jev is down, and keeps the uses", async () => {
    jev = "down";
    const r = await call({ q: "cpf" });
    expect(r.status).toBe(200);
    expect(r.body.results.every((f: { relevance: unknown }) => f.relevance === null)).toBe(true);
    expect(db.refunded).toEqual([]);
  });
});
