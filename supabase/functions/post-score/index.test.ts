import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler's money path and gate, with the esm.sh client mocked and Jev stubbed (nothing reaches TypeSafe).
const LEO = "13b28b1d-2ecb-40be-b3a9-aefc90366f9b";
const OTHER = "6d80f027-3395-480c-86a1-8827d3d6cce3";

const db = vi.hoisted(() => {
  // cs_ai_usage in memory, keyed user|feature|day: the consume RPC only (post-score never refunds)
  const rows = new Map<string, number>();
  const today = () => new Date().toISOString().slice(0, 10);
  const admin = {
    auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
    rpc: async (_fn: string, a: Record<string, unknown>) => {
      const k = `${a.p_user}|${a.p_feature}|${today()}`;
      const n = rows.get(k) ?? 0;
      if (n >= Number(a.p_limit)) return { data: null, error: null };
      rows.set(k, n + 1);
      return { data: n + 1, error: null };
    },
  };
  return { admin, rows, today, handler: null as null | ((r: Request) => Promise<Response>) };
});
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => db.admin }));

const calls: string[] = [];
const sent: unknown[] = [];
let jev: (body: { questions: Record<string, unknown> }) => Response = () => new Response("down", { status: 503 });

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "k", TYPESAFE_API_KEY: "k", NORTH_STAR_USERS: LEO };
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
    calls.push(String(u));
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    sent.push(body);
    return jev(body);
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
  sent.length = 0;
  jev = () => new Response("down", { status: 503 });
});

const ask = (uid: string, body: Record<string, unknown>) =>
  db.handler!(new Request("http://x/post-score", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify(body) }));
const used = (uid: string) => db.rows.get(`${uid}|post-score|${db.today()}`) ?? 0;
const yesTo = (p: Record<string, number>) => () =>
  Response.json({ answers: Object.fromEntries(Object.entries(p).map(([id, noul]) => [id, { type: "noul", noul }])) });

const draft = "I paid $0 for my first hospital stay. My friend paid $11,400.\n\nSame ward. Same week. One rider.\n\nComment RIDER and I'll send you the checklist.";

// Today's score, pinned before `format` joined (edit-score): the Jev request it sends and the answer it gives back,
// for a request with no format. Never update this file with vitest -u.
describe("today's score, pinned", () => {
  const cases: [string, string, Record<string, unknown>][] = [
    ["scored", OTHER, { text: draft, platform: "linkedin" }],
    ["scored, unknown platform", LEO, { text: draft, platform: "myspace" }],
    ["too short", OTHER, { text: "Too short." }],
    ["not english", OTHER, { text: "保险其实不贵。真正贵的是发现自己没有保障。今天就检查你的保单。真正贵的是发现自己没有保障。" }],
    ["jev down", OTHER, { text: draft, platform: "instagram" }],
  ];
  it("sends Jev the same questions and answers the same way", async () => {
    const seen: Record<string, unknown> = {};
    for (const [name, uid, body] of cases) {
      db.rows.clear();
      sent.length = 0;
      jev = name === "jev down" ? () => new Response("down", { status: 503 }) : yesTo({ hook: 0.9, oneIdea: 0.62, specific: 0.95, cta: 0.3, readable: 0.8 });
      const res = await ask(uid, body);
      seen[name] = { status: res.status, answer: await res.json(), used: used(uid), jev: sent.slice() };
    }
    await expect(JSON.stringify(seen, null, 2)).toMatchFileSnapshot("./fixtures/today.json");
  });

  it("asks nothing and counts nothing without a sign-in", async () => {
    const res = await db.handler!(new Request("http://x/post-score", { method: "POST", body: JSON.stringify({ text: draft }) }));
    expect(res.status).toBe(401);
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
});
