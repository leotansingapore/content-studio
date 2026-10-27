import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler's gate: a sign-in, then the bot set up and the caller on NORTH_STAR_USERS, before any table, cap or
// Telegram call. What each action does is logic.test.ts's.
const LEO = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const OTHER = "7e57c0de-0000-4000-8000-0000000000d2";
const h = vi.hoisted(() => ({ handler: null as null | ((r: Request) => Promise<Response>), reads: [] as string[], inserted: [] as unknown[] }));
// Leo's synced brand list, as cloudSync stores it in cs_user_data
const BRANDS = JSON.stringify([{ id: "me", name: "Leo Tan", createdAt: "" }, { id: "pmoneybees", name: "MoneyBees", createdAt: "" }]);
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({
  createClient: () => ({
    auth: {
      getUser: async (jwt: string) => ({ data: { user: jwt === "leo" ? { id: "6d80f027-3395-480c-86a1-8827d3d6cce3", email: "leo@example.com" } : jwt === "other" ? { id: "7e57c0de-0000-4000-8000-0000000000d2" } : null } }),
    },
    from: (t: string) => {
      h.reads.push(t);
      const where = { eq: () => where, maybeSingle: async () => ({ data: { data: BRANDS }, error: null }) };
      return {
        select: () => where,
        insert: (row: unknown) => (h.inserted.push(row), { select: () => ({ single: async () => ({ data: { id: "00000000-0000-4000-8000-0000000000c1" }, error: null }) }) }),
      };
    },
    rpc: async (fn: string) => (h.reads.push(fn), { data: 1, error: null }),
  }),
}));

const env: Record<string, string | undefined> = {};
const telegram: string[] = [];

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (h.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: string) => (telegram.push(String(u)), new Response("{}")));
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  h.reads.length = 0;
  h.inserted.length = 0;
  telegram.length = 0;
  Object.assign(env, { TELEGRAM_BOT_TOKEN: "7000000001:TEST-token-for-fixtures-only", TELEGRAM_BOT_USERNAME: "cs_test_bot", NORTH_STAR_USERS: LEO, SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "k" });
});

const call = (jwt: string | null, body: unknown = { action: "start", profileId: "me" }) =>
  h.handler!(new Request("http://x/telegram", { method: "POST", headers: jwt ? { Authorization: `Bearer ${jwt}` } : {}, body: JSON.stringify(body) }));

describe("the telegram function's gate", () => {
  it("asks for a sign-in first", async () => {
    expect((await call(null)).status).toBe(401);
    expect(h.reads).toEqual([]);
  });

  it("answers 404 {enabled:false} to anyone not on NORTH_STAR_USERS, and to everyone while the bot isn't set up", async () => {
    const other = await call("other");
    expect(other.status).toBe(404);
    expect(await other.json()).toMatchObject({ enabled: false });
    for (const unset of ["TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME", "NORTH_STAR_USERS"]) {
      env[unset] = undefined;
      const res = await call("leo");
      expect(res.status, unset).toBe(404);
      expect(await res.json()).toMatchObject({ enabled: false });
      env[unset] = unset === "NORTH_STAR_USERS" ? LEO : unset === "TELEGRAM_BOT_USERNAME" ? "cs_test_bot" : "7000000001:TEST-token-for-fixtures-only";
    }
    expect(h.reads).toEqual([]);
    expect(telegram).toEqual([]);
  });

  it("lets Leo start a connect: one use of the day's cap, his brands, then the row", async () => {
    const res = await call("leo", { action: "start", profileId: "pmoneybees" });
    expect(res.status).toBe(200);
    expect(h.reads).toEqual(["cs_consume_ai_usage", "cs_user_data", "cs_telegram_chats"]);
    expect(telegram).toEqual([]);
  });

  it("puts the session's full email and the stored brand name in the row, whatever the body says", async () => {
    await call("leo", { action: "start", profileId: "pmoneybees", brandName: "Not My Brand", email: "someone@else.com", account_email: "x@y.z" });
    expect(h.inserted).toEqual([expect.objectContaining({ brand_name: "MoneyBees", account_email: "leo@example.com" })]);
  });

  it("refuses a brand id that isn't one of the caller's", async () => {
    const res = await call("leo", { action: "start", profileId: "pother" });
    expect(res.status).toBe(404);
    expect(h.inserted).toEqual([]);
  });
});
