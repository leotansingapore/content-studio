import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler with Jev and OpenAI faked: which counter moves and when it comes back. Nothing here reaches a network.
const db = vi.hoisted(() => ({
  spent: [] as string[],
  refunded: [] as string[],
  full: false,
  admin: {} as Record<string, unknown>,
  handler: null as null | ((r: Request) => Promise<Response>),
}));
db.admin = {
  auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
  rpc: async (_fn: string, a: Record<string, unknown>) => (db.spent.push(String(a.p_feature)), { data: db.full ? null : 1, error: null }),
  from: () => ({
    select: () => ({ match: async () => ({ data: [{ count: 1 }], error: null }) }),
    update: () => ({ match: (q: { feature: string }) => ({ select: async () => (db.refunded.push(q.feature), { data: [{ count: 0 }], error: null }) }) }),
  }),
};
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => db.admin }));

const LEO = "leo-uid";
let jev: "up" | "down" = "up";
let openai: "ok" | "down" | "slow" | "junk" = "ok";
let env: Record<string, string> = {};
const seen: string[] = [];
const sent: { url: string; body: Record<string, unknown> }[] = [];

const idea = (k: number) => ({ hook: `I counted [N] follow-ups that slipped, idea ${k}`, format: "carousel", angle: "Why follow-ups slip and what to do", patterns: ["Number reveal hooks"] });

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: URL | string, init?: RequestInit) => {
    const url = String(u);
    seen.push(url);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    sent.push({ url, body });
    if (url.startsWith("https://api.typesafe.ai/")) {
      if (jev === "down") return new Response("busy", { status: 503 });
      // the first three posts open on a number reveal; every post is a list
      const n = Number(String(body.state.caption).match(/post (\d+)/)?.[1]);
      const pick = (choice: string) => ({ type: "choice", choice, probabilities: { [choice]: 0.8 } });
      return Response.json({ answers: { formula: pick(n < 2 || n === 5 ? "number-reveal" : "none"), structure: pick("list"), topic: pick("other") } });
    }
    if (url === "https://api.openai.com/v1/chat/completions") {
      if (openai === "down") return new Response("overloaded", { status: 500 });
      if (openai === "slow") return Promise.reject(Object.assign(new Error("signal timed out"), { name: "TimeoutError" }));
      const content = openai === "junk" ? "{\"ideas\": []}" : JSON.stringify({ ideas: [idea(1), idea(2), idea(3)] });
      return Response.json({ model: "gpt-6-luna", choices: [{ message: { content } }], usage: { prompt_tokens: 900, completion_tokens: 200 } });
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
  db.full = false;
  jev = "up";
  openai = "ok";
  env = { NORTH_STAR_USERS: `someone-else,${LEO}`, OPENAI_API_KEY: "o", TYPESAFE_API_KEY: "t" };
});

const request = (extra: Record<string, unknown> = {}) => ({
  account: { platform: "instagram", handle: "mrbrown" },
  checkedAt: "2026-10-12T02:00:00.000Z",
  posts: Array.from({ length: 12 }, (_, k) => ({ id: `p${k}`, caption: `Caption of post ${k}`, format: "video" })),
  best: ["p0", "p1", "p2"],
  brand: { name: "ActivityTracker", serves: "Self-employed salespeople", sells: "A sales activity tracker", topics: ["Follow-ups"] },
  voice: null,
  ...extra,
});
const call = async (body: unknown, uid = LEO) => {
  const r = await db.handler!(new Request("http://x/remix-patterns", { method: "POST", headers: uid ? { Authorization: `Bearer ${uid}` } : {}, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};

describe("remix-patterns: the gate", () => {
  it("answers 401 without a sign-in and 403 for anyone not listed, before any counter or provider", async () => {
    expect((await call(request(), "")).status).toBe(401);
    expect(await call(request(), "not-listed")).toEqual({ status: 403, body: { code: "not_enabled", error: "This isn't switched on for your account yet." } });
    env.NORTH_STAR_USERS = "";
    expect((await call(request())).status).toBe(403);
    expect(db.spent).toEqual([]);
    expect(seen).toEqual([]);
  });

  it("refuses a bad request, and says it isn't switched on without OpenAI, before counting", async () => {
    expect(await call(request({ posts: [] }))).toEqual({ status: 400, body: { code: "bad_request", error: "Send 1 to 12 posts." } });
    delete env.OPENAI_API_KEY;
    expect(await call(request())).toEqual({ status: 503, body: { code: "not_configured", error: "What worked isn't switched on yet." } });
    expect(db.spent).toEqual([]);
    expect(seen).toEqual([]);
  });
});

describe("remix-patterns: a run", () => {
  it("counts one use, tags every post, counts the patterns and writes 3 ideas", async () => {
    const r = await call(request());
    expect(r.status).toBe(200);
    expect(db.spent).toEqual(["remix-patterns"]);
    expect(db.refunded).toEqual([]);
    expect(seen.filter((u) => u.includes("typesafe"))).toHaveLength(12);
    expect(seen.filter((u) => u.includes("openai"))).toHaveLength(1);
    expect(r.body.tags.p0).toEqual({ formula: "number-reveal", structure: "list", topic: null });
    // number reveal: p0 and p1 of the 3 best, p5 of the other 9; every post is a list and a video, so neither counts
    expect(r.body.patterns).toEqual([{ field: "formula", value: "number-reveal", inBest: 2, inRest: 1, rest: 9 }]);
    expect(r.body.ideas).toHaveLength(3);
    expect(r.body.from).toBe("patterns");
    const prompt = JSON.stringify(sent.find((s) => s.url.includes("openai"))!.body.messages);
    expect(prompt).toContain("Number reveal hooks");
    expect(prompt).not.toContain("Caption of post");
  });

  it("answers the daily limit with the server's words and calls nobody", async () => {
    db.full = true;
    expect(await call(request())).toEqual({ status: 429, body: { code: "daily_limit", error: "You've used all 10 for today. It resets at 8am Singapore time." } });
    expect(seen).toEqual([]);
  });

  it("writes ideas from the best posts when Jev is down, and keeps the use", async () => {
    jev = "down";
    const r = await call(request());
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ tags: {}, patterns: [], from: "best" });
    expect(r.body.ideas).toHaveLength(3);
    expect(db.refunded).toEqual([]);
    expect(JSON.stringify(sent.find((s) => s.url.includes("openai"))!.body.messages)).toContain("share no clear pattern");
  });
});

describe("remix-patterns: refunds", () => {
  it("gives the use back when OpenAI fails or times out", async () => {
    openai = "down";
    expect(await call(request())).toEqual({ status: 502, body: { code: "failed", error: "Couldn't read their posts. Try again." } });
    expect(db.refunded).toEqual(["remix-patterns"]);
    openai = "slow";
    expect((await call(request())).status).toBe(502);
    expect(db.refunded).toEqual(["remix-patterns", "remix-patterns"]);
  });

  it("keeps the use when OpenAI answered with ideas that can't be used", async () => {
    openai = "junk";
    expect(await call(request())).toEqual({ status: 422, body: { code: "unusable", error: "Those ideas came back in a shape that can't be used. Try again." } });
    expect(db.refunded).toEqual([]);
  });
});
