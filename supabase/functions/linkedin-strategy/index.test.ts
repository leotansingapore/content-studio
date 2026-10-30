import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler with OpenAI faked: which counter moves and when the use comes back. Nothing here reaches a network.
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

let openai: "ok" | "down" | "slow" | "junk" = "ok";
let env: Record<string, string> = {};
const bucket = (name: string) => ({ name, reader: "New managers", why: "Twelve years", angles: ["The meeting I cancel in week one"], proof: "", format: "text" });
const GOOD = {
  icp: "New managers.", outcome: "Calls.", split: { top: 40, middle: 40, bottom: 20 }, splitWhy: "Default.",
  top: [bucket("A"), bucket("B"), bucket("C")], middle: [bucket("D"), bucket("E"), bucket("F")], bottom: [bucket("G"), bucket("H"), bucket("I")],
  principles: ["Short."], cadence: "Three a week.", measures: ["Replies"], avoid: ["Politics"], questions: [],
};

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: URL | string) => {
    if (String(u) !== "https://api.openai.com/v1/chat/completions") throw new Error(`unexpected fetch ${u}`);
    if (openai === "down") return new Response("overloaded", { status: 500 });
    if (openai === "slow") return Promise.reject(Object.assign(new Error("signal timed out"), { name: "TimeoutError" }));
    const content = JSON.stringify(openai === "junk" ? { ...GOOD, bottom: [] } : GOOD);
    return Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 900, completion_tokens: 900 } });
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  db.spent.length = 0;
  db.refunded.length = 0;
  db.full = false;
  openai = "ok";
  env = { OPENAI_API_KEY: "o" };
});

const ANSWERS = { offer: "One-to-one coaching for new managers", buyer: "First-time managers at tech firms" };
const call = async (body: unknown, uid = "anyone") => {
  const r = await db.handler!(new Request("http://x/linkedin-strategy", { method: "POST", headers: uid ? { Authorization: `Bearer ${uid}` } : {}, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};

describe("linkedin-strategy", () => {
  it("writes a strategy for any sign-in, on one use of its own cap", async () => {
    const r = await call({ answers: ANSWERS, profession: "Coach" });
    expect(r.status).toBe(200);
    expect(r.body.strategy.split).toEqual({ top: 40, middle: 40, bottom: 20 });
    expect([db.spent, db.refunded]).toEqual([["linkedin-strategy"], []]);
  });

  it("refuses signed out, and an interview without its first two answers, before any count", async () => {
    expect((await call({ answers: ANSWERS }, "")).status).toBe(401);
    expect(await call({ answers: { offer: "Coaching" } })).toEqual({ status: 400, body: { code: "bad_request", error: "Answer the first two questions first." } });
    expect(db.spent).toEqual([]);
  });

  it("gives the use back when OpenAI never answers, and keeps it for an answer that can't be used", async () => {
    for (const mode of ["down", "slow"] as const) {
      openai = mode;
      expect((await call({ answers: ANSWERS })).status).toBe(502);
    }
    expect(db.refunded).toEqual(["linkedin-strategy", "linkedin-strategy"]);
    db.refunded.length = 0;
    openai = "junk";
    expect((await call({ answers: ANSWERS })).status).toBe(422);
    expect(db.refunded).toEqual([]);
  });

  it("answers the daily limit without calling OpenAI", async () => {
    db.full = true;
    expect((await call({ answers: ANSWERS })).status).toBe(429);
  });
});
