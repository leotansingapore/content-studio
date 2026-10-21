import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler with Jev and the daily counter faked: who gets an action, and what spends a use.
const db = vi.hoisted(() => {
  const spent: string[] = [];
  let left = true;
  const admin = {
    auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
    // the counter answers the uses so far, or null once the day's limit is reached
    rpc: async (_fn: string, a: Record<string, unknown>) => (spent.push(String(a.p_feature)), { data: left ? 1 : null, error: null }),
  };
  return { admin, spent, capReached: (v: boolean) => (left = !v), handler: null as null | ((r: Request) => Promise<Response>) };
});
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({ createClient: () => db.admin }));

const asked: unknown[] = [];
const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
const choice = (c: string) => ({ type: "choice", choice: c, probabilities: { [c]: 0.9 } });

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => (k === "TYPESAFE_API_KEY" ? "test-key" : "x") } });
  vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
    asked.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ answers: { act: choice("move"), post: choice("p1"), day: choice(tomorrow), time: choice("09:00") } }));
  });
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  db.spent.length = 0;
  db.capReached(false);
  asked.length = 0;
});

const call = async (body: unknown, uid = "u1") => {
  const r = await db.handler!(new Request("http://x/assistant-act", { method: "POST", headers: uid ? { Authorization: `Bearer ${uid}` } : {}, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const posts = [{ title: "Hospital plans in plain words", status: "draft", when: "", platform: "instagram" }];

describe("the assistant's actions", () => {
  it("moves a saved post to the day and time the message names, for one daily use", async () => {
    const r = await call({ message: "Put my hospital plans post out tomorrow at 9am", today, posts });
    expect(r).toEqual({ status: 200, body: { pick: { act: "move", post: 0, day: tomorrow, time: "09:00" } } });
    expect(db.spent).toEqual(["assistant-act"]);
    expect(asked).toHaveLength(1);
  });

  it("spends no use and asks nothing when signed out, when there's nothing to read, or when the message isn't in English", async () => {
    expect((await call({ message: "Move it to Friday", today, posts }, "")).status).toBe(401);
    expect((await call({ message: "   ", today, posts })).status).toBe(400);
    expect(await call({ message: "\u628a\u6211\u7684\u5e16\u5b50\u6539\u5230\u660e\u5929\u65e9\u4e0a\u4e5d\u70b9\u53d1\u5e03", today, posts })).toEqual({ status: 200, body: { pick: null } });
    expect(db.spent).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("sends Jev today's questions for an account not on the list (pinned)", async () => {
    const r = await call({ message: "Put my hospital plans post out tomorrow at 9am", today: "2026-10-11", posts });
    expect(r.status).toBe(200);
    await expect(JSON.stringify(asked[0], null, 2)).toMatchFileSnapshot("./fixtures/jev-request-everyone.json");
  });

  it("stops at the daily limit without asking Jev", async () => {
    db.capReached(true);
    const r = await call({ message: "Put my hospital plans post out tomorrow at 9am", today, posts });
    expect(r.status).toBe(429);
    expect(asked).toEqual([]);
  });
});
