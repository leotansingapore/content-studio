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
const sent: unknown[] = [];
let jev: (body: { questions: Record<string, { type: string; criteria?: unknown }> }) => Response = () => new Response("down", { status: 503 });

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

// Every check as it is today, pinned before the conflict mode joined (phase 4 memory-core): the Jev request each
// one sends and the answer it gives back. Never update this file with vitest -u.
describe("today's checks, pinned", () => {
  // a fixed answer for any question: yes 0.7, the first option at 0.8, the middle level
  const answerAll = (body: { questions: Record<string, { type: string; criteria?: unknown }> }) =>
    Response.json({
      answers: Object.fromEntries(
        Object.entries(body.questions).map(([id, q]) => {
          if (q.type === "noul") return [id, { type: "noul", noul: 0.7 }];
          if (q.type === "choice") {
            const first = Object.keys(q.criteria as Record<string, unknown>)[0];
            return [id, { type: "choice", choice: first, probabilities: { [first]: 0.8 } }];
          }
          return [id, { type: "score", score: 2 }];
        }),
      ),
    });
  const draft = "I sat with a client last Tuesday who had three hospital plans and no idea which one paid first. We spent an hour on it. Here is what we found.";
  const cases: [string, string, Record<string, unknown>][] = [
    ["human", OTHER, { mode: "human", text: draft, samples: ["My own post about CPF top-ups and why I do mine in January every year, with the numbers."] }],
    ["hooks", OTHER, { mode: "hooks", hooks: ["Your hospital plan has a gap", "Three plans, one claim"], audience: "young parents", topic: "hospital plans", platform: "instagram" }],
    ["idea", OTHER, { mode: "idea", topic: "hospital plans", notes: "a client with three plans", kind: "story" }],
    ["carousel", OTHER, { mode: "carousel", idea: "Insurance is not an investment" }],
    ["facts", OTHER, { mode: "facts", text: "CPF LIFE starts at 65. I think everyone should plan early." }],
    ["profile", OTHER, { mode: "profile", platform: "instagram", name: "Leo Tan", bio: "Adviser in Singapore. DM me.", pinned: ["My story"], top: ["Three CPF myths"], link: null }],
    ["thread", LEO, { mode: "thread", post }],
    ["design", LEO, { mode: "design", slides: [{ title: "3 things to check on your hospital plan", body: "" }, { title: "Ward class", body: "Pick the ward you would actually stay in." }] }],
    ["not english", OTHER, { mode: "human", text: "\u6211\u7684\u5ba2\u6237\u4e0a\u5468\u4e8c\u6765\u627e\u6211\uff0c\u4ed6\u6709\u4e09\u4efd\u4f4f\u9662\u4fdd\u9669\uff0c\u4e0d\u77e5\u9053\u54ea\u4e00\u4efd\u5148\u8d54\u3002\u6211\u4eec\u82b1\u4e86\u4e00\u4e2a\u5c0f\u65f6\u3002\u6211\u7684\u5ba2\u6237\u4e0a\u5468\u4e8c\u6765\u627e\u6211\uff0c\u4ed6\u6709\u4e09\u4efd\u4f4f\u9662\u4fdd\u9669\uff0c\u4e0d\u77e5\u9053\u54ea\u4e00\u4efd\u5148\u8d54\u3002\u6211\u4eec\u82b1\u4e86\u4e00\u4e2a\u5c0f\u65f6\u3002" }],
    ["unknown mode", OTHER, { mode: "translate", text: draft }],
    ["too short", OTHER, { mode: "human", text: "Too short." }],
  ];
  it("sends Jev the same questions and answers the same way", async () => {
    const seen: Record<string, unknown> = {};
    for (const [name, uid, body] of cases) {
      db.rows.clear();
      sent.length = 0;
      jev = answerAll;
      const res = await ask(uid, body);
      seen[name] = { status: res.status, answer: await res.json(), jev: sent.slice() };
    }
    await expect(JSON.stringify(seen, null, 2)).toMatchFileSnapshot("./fixtures/today.json");
  });
});
