import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clipPasses } from "./passes";

// The handler's money path for Find clips: a long recording takes one use of "video-clips" per pass.
const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";

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

beforeAll(async () => {
  // one fixed instant, so the counter's day can't turn between the handler and these rows
  vi.useFakeTimers({ toFake: ["Date"] });
  const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "k", OPENAI_API_KEY: "k", GEMINI_API_KEY: "k" };
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: string) => {
    calls.push(String(u));
    return new Response("{}", { status: 500 });
  });
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
});

// an hour-long recording, captioned every 5 minutes
const HOUR = 3600;
const sentences = Array.from({ length: 12 }, (_, i) => ({ s: i * 300, e: i * 300 + 20, text: `Point number ${i + 1} about CPF top-ups.` }));
const findClips = () =>
  db.handler!(new Request("http://x/video-assist", { method: "POST", headers: { Authorization: `Bearer ${UID}` }, body: JSON.stringify({ mode: "clips", duration: HOUR, sentences }) }));

describe("Find clips on a long recording", () => {
  it("gives back the passes it counted when the cap runs out partway, and reads nothing", async () => {
    expect(clipPasses(HOUR)).toBe(2);
    db.rows.set(`${UID}|video-clips|${db.today()}`, 19);
    const res = await findClips();
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "daily_limit" });
    expect(db.rows.get(`${UID}|video-clips|${db.today()}`)).toBe(19);
    expect(calls).toEqual([]);
  });
});

describe("Watch it like a viewer", () => {
  const watch = (q: string, headers: Record<string, string>) =>
    db.handler!(new Request(`http://x/video-assist?mode=watch${q}`, { method: "POST", headers: { Authorization: `Bearer ${UID}`, ...headers }, body: new Uint8Array(2000) }));

  it("refuses an export it can't watch before counting one of the day's watches or sending it to Gemini", async () => {
    const mp4 = { "content-type": "video/mp4", "content-length": "2000" };
    const refused = [
      await watch("&seconds=91", mp4),
      await watch("&seconds=40", { ...mp4, "content-length": "120000001" }),
      await watch("&seconds=40", { ...mp4, "content-type": "image/gif" }),
      await watch("", mp4),
    ];
    expect(refused.map((r) => r.status)).toEqual([400, 413, 400, 400]);
    expect(await refused[0].json()).toEqual({ error: "Watch it takes videos up to 90 seconds." });
    expect(db.rows.size).toBe(0);
    expect(calls).toEqual([]);
  });
});
