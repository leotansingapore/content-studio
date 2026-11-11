import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler with OpenAI faked: which counter moves and when the use comes back. Nothing here reaches a network.
const db = vi.hoisted(() => ({
  spent: [] as string[],
  refunded: [] as string[],
  refundDays: [] as string[],
  counts: new Map<string, number>(),
  full: false,
  admin: {} as Record<string, unknown>,
  handler: null as null | ((r: Request) => Promise<Response>),
}));
db.admin = {
  auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
  // the counter as cs_consume_ai_usage keeps it: one more a call, null once past the limit it is sent
  rpc: async (_fn: string, a: Record<string, unknown>) => {
    db.spent.push(String(a.p_feature));
    const k = `${a.p_user}|${a.p_feature}`;
    const n = (db.counts.get(k) ?? 0) + 1;
    if (db.full || n > Number(a.p_limit)) return { data: null, error: null };
    db.counts.set(k, n);
    return { data: n, error: null };
  },
  from: () => ({
    select: () => ({ match: async (q: { day: string }) => (db.refundDays.push(q.day), { data: [{ count: 1 }], error: null }) }),
    update: () => ({ match: (q: { feature: string }) => ({ select: async () => (db.refunded.push(q.feature), { data: [{ count: 0 }], error: null }) }) }),
  }),
};
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => db.admin }));

let openai: "ok" | "down" | "slow" | "junk" | "past-midnight" = "ok";
const sent: Record<string, unknown>[] = [];
let env: Record<string, string> = {};
const GOOD = { hooks: ["POV: you plan the week and Monday eats it", "deleting my old to-do app after this", "my inbox like I'm defusing a bomb", "been planning on paper for 10 years and NOW this", "the secret to a calm Monday is so easy"].map((text) => ({ text, format: "pov" })) };

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: URL | string, init?: RequestInit) => {
    if (String(u) !== "https://api.openai.com/v1/chat/completions") throw new Error(`unexpected fetch ${u}`);
    sent.push(JSON.parse(String(init?.body)));
    if (openai === "down") return new Response("overloaded", { status: 500 });
    // the answer fails a few seconds after midnight UTC, a day later than the use was counted
    if (openai === "past-midnight") return vi.setSystemTime(Date.now() + 5_000), new Response("overloaded", { status: 500 });
    if (openai === "slow") return Promise.reject(Object.assign(new Error("signal timed out"), { name: "TimeoutError" }));
    const content = JSON.stringify(openai === "junk" ? { hooks: [] } : GOOD);
    return Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 900, completion_tokens: 300 } });
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  db.spent.length = 0;
  db.refunded.length = 0;
  db.refundDays.length = 0;
  db.counts.clear();
  sent.length = 0;
  db.full = false;
  openai = "ok";
  env = { OPENAI_API_KEY: "o" };
});

afterEach(() => void vi.useRealTimers());

const BODY = { topic: "planning a busy week", n: 5, profession: "Productivity app" };
const call = async (body: unknown, uid = "anyone") => {
  const r = await db.handler!(new Request("http://x/hook-writer", { method: "POST", headers: uid ? { Authorization: `Bearer ${uid}` } : {}, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};

describe("hook-writer", () => {
  it("writes a batch for any sign-in, on one use of its own cap", async () => {
    const r = await call(BODY);
    expect(r.status).toBe(200);
    expect(r.body.hooks).toHaveLength(5);
    expect([db.spent, db.refunded]).toEqual([["hook-writer"], []]);
  });

  it("refuses signed out, and a batch with no topic, before any count", async () => {
    expect((await call(BODY, "")).status).toBe(401);
    expect(await call({ n: 5 })).toEqual({ status: 400, body: { code: "bad_request", error: "Say what the hooks are about." } });
    expect(db.spent).toEqual([]);
  });

  it("gives the use back when OpenAI never answers, and keeps it for an answer that can't be used", async () => {
    for (const mode of ["down", "slow"] as const) {
      openai = mode;
      expect((await call(BODY)).status).toBe(502);
    }
    expect(db.refunded).toEqual(["hook-writer", "hook-writer"]);
    db.refunded.length = 0;
    openai = "junk";
    expect((await call(BODY)).status).toBe(422);
    expect(db.refunded).toEqual([]);
  });


  it("answers the daily limit without calling OpenAI", async () => {
    db.full = true;
    expect((await call(BODY)).status).toBe(429);
  });

  it("refuses a 21st hook batch today, after 20 that each reached OpenAI", async () => {
    for (let i = 0; i < 20; i++) expect((await call(BODY)).status, `batch ${i + 1}`).toBe(200);
    const r = await call(BODY);
    expect(r).toEqual({ status: 429, body: { code: "daily_limit", error: "You've used all 20 for today. It resets at 8am Singapore time." } });
    expect(sent).toHaveLength(20);
    // someone else's day is their own
    expect((await call(BODY, "someone-else")).status).toBe(200);
  });

  it("says hook writing isn't switched on, before counting a use, when there is no OpenAI key", async () => {
    env = {};
    expect(await call(BODY)).toEqual({ status: 503, body: { code: "not_configured", error: "Hook writing isn't switched on yet." } });
    expect([db.spent, sent]).toEqual([[], []]);
  });

  it("gives the use back on the day it was counted, when OpenAI fails just after midnight UTC", async () => {
    const start = new Date();
    start.setUTCHours(23, 59, 58, 0);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
    openai = "past-midnight";
    expect((await call(BODY)).status).toBe(502);
    expect(new Date().toISOString().slice(0, 10)).not.toBe(start.toISOString().slice(0, 10));
    expect(db.refundDays).toEqual([start.toISOString().slice(0, 10)]);
  });

  it("sends the model at most 300 characters of topic, 400 of about and 1500 of facts, and caps the answer's length", async () => {
    const long = (word: string) => Array.from({ length: 800 }, () => word).join(" ");
    expect((await call({ ...BODY, topic: long("topic"), about: long("about"), facts: long("facts") })).status).toBe(200);
    const user = String((sent[0].messages as { role: string; content: string }[])[1].content);
    const quoted = (label: string) => user.split(`${label}\n"""\n`)[1].split('\n"""')[0];
    expect([quoted("Topic:").length, quoted("About them:").length, quoted("Facts a hook may state:").length]).toEqual([300, 400, 1500]);
    // gpt-4.1's 2500 out, plus the reasoning headroom openaiChat adds for the current model
    expect(sent[0].max_completion_tokens).toBe(2500 + 4000);
  });
});
