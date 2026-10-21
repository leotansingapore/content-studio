import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler's gate and money path for "Reads well as a thread" (Leo only), and that the other checks stay open.
const LEO = "13b28b1d-2ecb-40be-b3a9-aefc90366f9b";
const OTHER = "6d80f027-3395-480c-86a1-8827d3d6cce3";

const db = vi.hoisted(() => {
  // cs_ai_usage in memory, keyed user|feature|day: the consume RPC, one row read and the conditional update
  const rows = new Map<string, number>();
  const today = () => new Date().toISOString().slice(0, 10);
  const key = (q: Record<string, unknown>) => `${q.user_id}|${q.feature}|${q.day}`;
  const admin = {
    auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
    rpc: async (_fn: string, a: Record<string, unknown>) => {
      const k = `${a.p_user}|${a.p_feature}|${today()}`;
      const n = rows.get(k) ?? 0;
      if (n >= Number(a.p_limit)) return { data: null, error: null };
      rows.set(k, n + 1);
      return { data: n + 1, error: null };
    },
    from: () => ({
      select: () => ({ match: async (q: Record<string, unknown>) => ({ data: rows.has(key(q)) ? [{ count: rows.get(key(q)) }] : [], error: null }) }),
      update: (v: { count: number }) => ({
        match: (q: Record<string, unknown>) => ({
          select: async () => {
            const hit = rows.get(key(q)) === q.count;
            if (hit) rows.set(key(q), v.count);
            return { data: hit ? [v] : [], error: null };
          },
        }),
      }),
    }),
  };
  return { admin, rows, today, handler: null as null | ((r: Request) => Promise<Response>) };
});
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => db.admin }));

const calls: string[] = [];
let jev: () => Response = () => new Response("down", { status: 503 });

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "k", TYPESAFE_API_KEY: "k", NORTH_STAR_USERS: LEO };
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: string) => {
    calls.push(String(u));
    return jev();
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  await import("./index.ts");
}, 30_000);
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
beforeEach(() => {
  db.rows.clear();
  calls.length = 0;
  jev = () => new Response("down", { status: 503 });
});

const post = "Three things to check on your hospital plan before you renew. First the ward class. Then the co-pay. Then the rider.";
const ask = (uid: string, body: Record<string, unknown>) =>
  db.handler!(new Request("http://x/writing-judge", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify(body) }));
const used = (uid: string) => db.rows.get(`${uid}|writing-judge|${db.today()}`) ?? 0;

describe("Reads well as a thread", () => {
  it("refuses anyone not on the list before counting anything or asking Jev", async () => {
    const res = await ask(OTHER, { mode: "thread", post });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
  it("answers Jev's yes for one writing-judge use", async () => {
    jev = () => Response.json({ answers: { thread: { type: "noul", noul: 0.81 } } });
    const res = await ask(LEO, { mode: "thread", post });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ yes: 0.81 });
    expect(used(LEO)).toBe(1);
    expect(calls).toHaveLength(1);
  });
  it("answers yes null when Jev answers without a number, and keeps the use", async () => {
    jev = () => Response.json({ answers: {} });
    const res = await ask(LEO, { mode: "thread", post });
    expect(await res.json()).toEqual({ yes: null });
    expect(used(LEO)).toBe(1);
  });
  it("gives the use back when Jev never answered", async () => {
    const res = await ask(LEO, { mode: "thread", post });
    expect(res.status).toBe(503);
    expect(used(LEO)).toBe(0);
  });
});

describe("the Recommended carousel design", () => {
  const slides = [{ title: "3 things to check on your hospital plan", body: "" }, { title: "Ward class", body: "Pick the ward you would actually stay in." }, { title: "Found this useful?", body: "Save it." }];

  it("refuses anyone not on the list before counting anything or asking Jev", async () => {
    const res = await ask(OTHER, { mode: "design", slides });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "not_enabled", error: "This isn't switched on for your account yet." });
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
  it("answers Jev's pick for one writing-judge use", async () => {
    jev = () => Response.json({ answers: { design: { type: "choice", choice: "checklist", probabilities: { checklist: 0.71, numbered: 0.2 } } } });
    const res = await ask(LEO, { mode: "design", slides });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pick: "checklist", p: 0.71 });
    expect(used(LEO)).toBe(1);
    expect(calls).toHaveLength(1);
  });
  it("answers no pick when Jev is unsure, and keeps the use", async () => {
    jev = () => Response.json({ answers: { design: { type: "choice", choice: "clean", probabilities: { clean: 0.3, quote: 0.28 } } } });
    expect(await (await ask(LEO, { mode: "design", slides })).json()).toEqual({ pick: null, p: 0.3 });
    expect(used(LEO)).toBe(1);
  });
  it("gives the use back when Jev never answered", async () => {
    const res = await ask(LEO, { mode: "design", slides });
    expect(res.status).toBe(503);
    expect(used(LEO)).toBe(0);
  });
  it("refuses a bad request before counting anything", async () => {
    const res = await ask(LEO, { mode: "design", slides: [slides[0]] });
    expect(res.status).toBe(400);
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
});

describe("the checks everyone has", () => {
  it("stay open to an account not on the list", async () => {
    jev = () => Response.json({ answers: { sequence: { type: "noul", noul: 0.2 } } });
    const res = await ask(OTHER, { mode: "carousel", idea: "Insurance is not an investment" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ textPostBetter: true });
    expect(used(OTHER)).toBe(1);
  });
});
