import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DAILY_LIMITS, GLOBAL_COUNTER_USER } from "../_shared/usageCaps";

// The handler's money path for a music track: the adviser's cap, the studio's, and the uses given back when nothing is made.
const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";

const db = vi.hoisted(() => {
  // cs_ai_usage in memory, keyed user|feature|day: the consume RPC, one row read and the conditional update
  const rows = new Map<string, number>();
  const down = new Set<string>(); // features whose counter can't be read
  const today = () => new Date().toISOString().slice(0, 10);
  const key = (q: Record<string, unknown>) => `${q.user_id}|${q.feature}|${q.day}`;
  const admin = {
    auth: { getUser: async (jwt: string) => ({ data: { user: jwt ? { id: jwt } : null } }) },
    rpc: async (_fn: string, a: Record<string, unknown>) => {
      if (down.has(String(a.p_feature))) return { data: null, error: { message: "down" } };
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
  return { admin, rows, down, today, handler: null as null | ((r: Request) => Promise<Response>) };
});
vi.mock("https://esm.sh/@supabase/supabase-js@2", () => ({ createClient: () => db.admin }));

// Eleven Music answers with `eleven` (a status, or "throw" for a timeout); every call is kept
const eleven: { calls: number; next: number | "throw" } = { calls: 0, next: 200 };

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const env: Record<string, string> = { SUPABASE_URL: "http://db", SUPABASE_SERVICE_ROLE_KEY: "service-role-key", ELEVENLABS_API_KEY: "k" };
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (db.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async () => {
    eleven.calls++;
    if (eleven.next === "throw") throw new Error("The operation timed out.");
    return new Response(eleven.next === 200 ? "mp3" : '{"detail":"busy"}', { status: eleven.next });
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  await import("./index.ts");
}, 30_000);
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  db.rows.clear();
  db.down.clear();
  eleven.calls = 0;
  eleven.next = 200;
});

const track = (uid = UID) =>
  db.handler!(new Request("http://x/text-voice", { method: "POST", headers: { Authorization: `Bearer ${uid}` }, body: JSON.stringify({ mode: "music", mood: "calm", seconds: 30 }) }));
const mine = (uid = UID) => db.rows.get(`${uid}|ai-music|${db.today()}`) ?? 0;
const studio = () => db.rows.get(`${GLOBAL_COUNTER_USER}|ai-music-global|${db.today()}`) ?? 0;

describe("a music track's uses", () => {
  it("are taken once each when the track is made", async () => {
    expect((await track()).status).toBe(200);
    expect([mine(), studio()]).toEqual([1, 1]);
  });

  it("both come back when Eleven Music fails or times out", async () => {
    eleven.next = 500;
    expect((await track()).status).toBe(502);
    expect([mine(), studio()]).toEqual([0, 0]);
    eleven.next = "throw";
    expect((await track()).status).toBe(502);
    expect([mine(), studio()]).toEqual([0, 0]);
  });

  it("the adviser's comes back when the studio's counter is unavailable, and Eleven Music is never called", async () => {
    db.down.add("ai-music-global");
    expect((await track()).status).toBe(503);
    expect(mine()).toBe(0);
    expect(eleven.calls).toBe(0);
  });

  it("the adviser's comes back when the studio's tracks are used up", async () => {
    db.rows.set(`${GLOBAL_COUNTER_USER}|ai-music-global|${db.today()}`, DAILY_LIMITS["ai-music-global"]);
    expect((await track()).status).toBe(429);
    expect(mine()).toBe(0);
    expect(eleven.calls).toBe(0);
  });
});
