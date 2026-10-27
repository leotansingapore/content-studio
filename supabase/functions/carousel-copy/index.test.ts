import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The live handler with the database and OpenAI faked: what Tighten with AI and Rewrite this slide count.
const LEO = "leo-uid";
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

// OpenAI: "down" answers 500, "drops" never answers, "ok" answers one rewritten slide
const openai = { mode: "ok" as "ok" | "down" | "drops", calls: 0 };

beforeAll(async () => {
  // one fixed instant, so the counter's day can't turn between the handler and these rows
  vi.useFakeTimers({ toFake: ["Date"] });
  const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "k", NORTH_STAR_USERS: LEO, OPENAI_API_KEY: "k" };
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: URL | string) => {
    if (!String(u).includes("openai")) throw new Error(`unexpected fetch ${u}`);
    openai.calls++;
    if (openai.mode === "drops") throw new TypeError("network connection lost");
    if (openai.mode === "down") return new Response("{}", { status: 500 });
    const content = JSON.stringify({ slides: [{ texts: ["It isn't", "Short now."] }], reply: "Cut it to one line." });
    return Response.json({ model: "gpt-6-luna", choices: [{ message: { content } }] });
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
  openai.mode = "ok";
  openai.calls = 0;
});

const send = async (body: unknown, uid = LEO) => {
  const r = await db.handler!(new Request("http://x/carousel-copy", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const rewrite = (uid = LEO) =>
  send({ mode: "ask", ask: "Make it shorter.", index: 1, platform: "instagram", slides: [{ texts: ["Cover"] }, { texts: ["It is not", "Long and slow."] }] }, uid);
const tighten = () => send({ slides: [{ title: "Cover", body: "" }, { title: "Point", body: "More words here." }] });
const used = (feature: string, uid = LEO) => db.rows.get(`${uid}|${feature}|${db.today()}`) ?? 0;

describe("Rewrite this slide", () => {
  it("counts one edit-ask use on a good answer, and nothing on Tighten's cap", async () => {
    expect(await rewrite()).toMatchObject({ status: 200, body: { slides: [{ texts: ["It isn't", "Short now."] }], usage: { used: 1, limit: 60 } } });
    expect([used("edit-ask"), used("carousel")]).toEqual([1, 0]);
  });

  it("gives the use back when OpenAI is down", async () => {
    openai.mode = "down";
    expect(await rewrite()).toMatchObject({ status: 502, body: { code: "failed" } });
    expect(used("edit-ask")).toBe(0);
  });

  it("gives the use back when the call to OpenAI never returns", async () => {
    openai.mode = "drops";
    expect(await rewrite()).toMatchObject({ status: 502, body: { code: "failed" } });
    expect(used("edit-ask")).toBe(0);
  });

  it("is refused before any count or OpenAI call for an account not switched on", async () => {
    expect(await rewrite(OTHER)).toMatchObject({ status: 403, body: { code: "not_enabled" } });
    expect(used("edit-ask", OTHER)).toBe(0);
    expect(openai.calls).toBe(0);
  });
});

describe("Tighten with AI", () => {
  it("is refused over the day's 30 without calling OpenAI", async () => {
    db.rows.set(`${LEO}|carousel|${db.today()}`, 30);
    expect(await tighten()).toMatchObject({ status: 429, body: { code: "daily_limit" } });
    expect(openai.calls).toBe(0);
  });
});
