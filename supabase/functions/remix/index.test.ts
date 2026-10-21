import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import DOGFOOD from "./fixtures/dogfood-makes-21oct.json";

// The live handler's make path, with the database and OpenAI faked: when a remix's use comes back and when it stays.
const UID = "leo-uid";

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

// OpenAI: "down" answers 500, "junk" answers text no format can use, "drops" never answers at all, "queue" answers
// each call with the next of `answers` (JSON) and keeps what it was sent
const openai = { mode: "down" as "down" | "junk" | "drops" | "queue", calls: 0, answers: [] as unknown[], sent: [] as { messages: { role: string; content: string }[] }[] };
// Jev: the state each call was sent, answered with no flags
const jev = { states: [] as Record<string, unknown>[] };

beforeAll(async () => {
  // one fixed instant, so the counter's day can't turn between the handler and these rows
  vi.useFakeTimers({ toFake: ["Date"] });
  const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "k", NORTH_STAR_USERS: UID, OPENAI_API_KEY: "k", TYPESAFE_API_KEY: "k" };
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: URL | string, init?: RequestInit) => {
    if (String(u).includes("typesafe")) {
      jev.states.push(JSON.parse(String(init?.body ?? "{}")).state ?? {});
      return new Response("{}", { status: 500 });
    }
    if (!String(u).includes("openai")) throw new Error(`unexpected fetch ${u}`);
    openai.calls++;
    if (openai.mode === "drops") throw new TypeError("network connection lost");
    if (openai.mode === "down") return new Response("{}", { status: 500 });
    if (openai.mode === "queue") {
      openai.sent.push(JSON.parse(String(init?.body ?? "{}")));
      return Response.json({ model: "gpt-4.1", choices: [{ message: { content: JSON.stringify(openai.answers.shift() ?? {}) } }] });
    }
    return Response.json({ model: "gpt-4.1", choices: [{ message: { content: "Sorry, here is a poem instead." } }] });
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  await import("./index.ts");
}, 30_000);
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
beforeEach(() => {
  db.rows.clear();
  openai.calls = 0;
  openai.sent = [];
  jev.states = [];
});

const make = async () => {
  const r = await db.handler!(new Request("http://x/remix", {
    method: "POST",
    headers: { Authorization: `Bearer ${UID}` },
    body: JSON.stringify({
      mode: "make",
      as: "post",
      source: { key: "top:grace-koh-instagram-C931K", kind: "top-post", format: "video", text: "6 signs your CPF plan is off track. Most people never check their CPF statement." },
      brand: { name: "MoneyBees", audience: "fresh grads" },
    }),
  }));
  return { status: r.status, body: await r.json() };
};
const used = () => db.rows.get(`${UID}|remix-make|${db.today()}`) ?? 0;

describe("a remix's use", () => {
  it("comes back when OpenAI is down, and says nothing was used", async () => {
    openai.mode = "down";
    expect(await make()).toMatchObject({ status: 502, body: { code: "failed", error: "That remix didn't go through. Nothing was used." } });
    expect(used()).toBe(0);
  });

  it("comes back when the call to OpenAI never returns", async () => {
    openai.mode = "drops";
    expect(await make()).toMatchObject({ status: 502, body: { code: "failed" } });
    expect(used()).toBe(0);
  });

  it("stays spent when OpenAI answered twice with nothing usable, since both answers were billed", async () => {
    openai.mode = "junk";
    expect(await make()).toMatchObject({ status: 422, body: { code: "unusable" } });
    expect(openai.calls).toBe(2);
    expect(used()).toBe(1);
  });
});

// The 21 Oct dogfood's makes as sent, answered here by the faked OpenAI
const dogfood = (call: string) => DOGFOOD.find((x) => x.call === call)!;
const send = async (body: unknown) => {
  const r = await db.handler!(new Request("http://x/remix", { method: "POST", headers: { Authorization: `Bearer ${UID}` }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};

describe("a post's checks in code (dogfood 21 Oct)", () => {
  it("sends a post that names ActivityTracker twice back once, and answers with the fixed one", async () => {
    const d = dogfood("017-remix.json");
    const once = { ...d.answer.result, body: d.answer.result.body.replace("ActivityTracker brings", "One app brings") };
    openai.mode = "queue";
    openai.answers = [d.answer.result, once];
    const r = await send(d.request);
    expect(r.status).toBe(200);
    expect(r.body.result.body).toContain("One app brings");
    expect(openai.calls).toBe(2);
    expect(openai.sent[1].messages.at(-1)!.content).toContain("names ActivityTracker 2 times");
  });

  it("refuses a post that still stops mid-sentence after the fixing pass, and keeps the use since both answers were billed", async () => {
    const d = dogfood("014-remix.json");
    openai.mode = "queue";
    openai.answers = [d.answer.result, d.answer.result];
    expect(await send(d.request)).toMatchObject({ status: 422, body: { code: "refused", error: "That remix stopped mid-sentence. Try again." } });
    expect(openai.calls).toBe(2);
    expect(used()).toBe(1);
  });
});
