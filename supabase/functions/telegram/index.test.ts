import { createHash, createHmac } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler's gate (a sign-in, then the bot set up and the caller on NORTH_STAR_USERS, before any table, cap or
// Telegram call) and the queries that carry the security rules: start's and verify's filters. What each action
// decides is logic.test.ts's.
const LEO = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const ROW = "00000000-0000-4000-8000-0000000000c1";
const h = vi.hoisted(() => ({ handler: null as null | ((r: Request) => Promise<Response>), reads: [] as string[], inserted: [] as unknown[], filters: [] as unknown[][] }));
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({
  createClient: () => ({
    auth: {
      getUser: async (jwt: string) => ({ data: { user: jwt === "leo" ? { id: "6d80f027-3395-480c-86a1-8827d3d6cce3", email: "leo@example.com" } : jwt === "other" ? { id: "7e57c0de-0000-4000-8000-0000000000d2" } : null } }),
    },
    from: (t: string) => {
      h.reads.push(t);
      const mine: unknown[][] = [];
      const note = (f: unknown[]) => (h.filters.push(f), mine.push(f));
      // a query's calls, as they would reach PostgREST. A read finds the code itself (by its id), never a used login or
      // another live connect; an update changes one row.
      const chain: Record<string, unknown> = {};
      for (const m of ["eq", "gt", "or", "in", "neq", "is", "not", "limit"]) chain[m] = (...a: unknown[]) => (note([m, ...a]), chain);
      const updating = () => mine.some((f) => f[0] === "update");
      const answer = () => (updating() || mine.some((f) => f[0] === "eq" && f[1] === "id" && f[2] === "00000000-0000-4000-8000-0000000000c1") ? [{ id: "00000000-0000-4000-8000-0000000000c1" }] : []);
      chain.select = (cols: string) => (note([updating() ? "select" : "read", cols]), chain);
      chain.then = (ok: (v: unknown) => unknown) => ok({ data: answer(), error: null });
      chain.update = (v: unknown) => (note(["update", v]), chain);
      chain.insert = (row: unknown) => (h.inserted.push(row), { select: () => ({ single: async () => ({ data: { id: "00000000-0000-4000-8000-0000000000c1" }, error: null }) }) });
      return chain;
    },
    rpc: async (fn: string) => (h.reads.push(fn), { data: 1, error: null }),
  }),
}));

const TOKEN = "7000000001:TEST-token-for-fixtures-only";
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
  h.filters.length = 0;
  telegram.length = 0;
  Object.assign(env, { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_BOT_USERNAME: "cs_test_bot", NORTH_STAR_USERS: LEO, SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "k" });
});

const call = (jwt: string | null, body: unknown = { action: "start", profileId: "me" }) =>
  h.handler!(new Request("http://x/telegram", { method: "POST", headers: jwt ? { Authorization: `Bearer ${jwt}` } : {}, body: JSON.stringify(body) }));

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
function signedLogin() {
  const fields: Record<string, string> = { id: "111000111", first_name: "Leo", username: "leo_test", auth_date: String(Math.floor(Date.now() / 1000) - 5) };
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  return { ...fields, hash: createHmac("sha256", createHash("sha256").update(TOKEN).digest()).update(check).digest("hex") };
}
const NONCE = "browser-nonce-for-tests-only-0123456789";

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
      const was = env[unset];
      env[unset] = undefined;
      const res = await call("leo");
      expect(res.status, unset).toBe(404);
      expect(await res.json()).toMatchObject({ enabled: false });
      env[unset] = was;
    }
    expect(h.reads).toEqual([]);
    expect(telegram).toEqual([]);
  });

  it("starts a connect: one use of the day's cap, the brand's waiting connect cancelled, then the new row with nothing from the body but the brand id", async () => {
    const res = await call("leo", { action: "start", profileId: "pmoneybees", brandName: "Not My Brand", email: "someone@else.com" });
    expect(res.status).toBe(200);
    const { nonce } = (await res.json()) as { nonce: string };
    expect(h.reads).toEqual(["cs_consume_ai_usage", "cs_telegram_chats", "cs_telegram_chats"]);
    expect(h.filters).toEqual([
      ["update", { status: "disconnected", removed_at: expect.any(String) }],
      ["eq", "owner_id", LEO],
      ["eq", "profile_id", "pmoneybees"],
      ["eq", "status", "pending"],
      ["select", "id"],
    ]);
    expect(h.inserted).toEqual([{ owner_id: LEO, profile_id: "pmoneybees", code_hash: expect.stringMatching(/^[0-9a-f]{64}$/), code_expires_at: expect.any(String), nonce_hash: sha(nonce) }]);
    expect(telegram).toEqual([]);
  });

  it("checks a Telegram login against this account's own waiting code, this browser's nonce and the Telegram user who tapped Start, writing nothing", async () => {
    const auth = signedLogin();
    const res = await call("leo", { action: "verify", chatRow: ROW, auth, nonce: NONCE, confirm: false });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ firstName: "Leo", username: "leo_test" });
    expect(h.filters).toEqual([
      // a login is used once
      ["read", "id"],
      ["eq", "login_hash", auth.hash],
      ["limit", 1],
      ["read", "id"],
      ["eq", "id", ROW],
      ["eq", "owner_id", LEO],
      ["eq", "status", "pending"],
      ["gt", "code_expires_at", expect.any(String)],
      ["eq", "tg_user_id", 111000111],
      ["is", "confirmed_at", null],
      ["eq", "nonce_hash", sha(NONCE)],
      ["limit", 1],
    ]);
    expect(telegram).toEqual([]);
  });

  it("on Connect, confirms only that same code, once, for a Telegram user with no other confirmed connect", async () => {
    const auth = signedLogin();
    const res = await call("leo", { action: "verify", chatRow: ROW, auth, nonce: NONCE, confirm: true });
    expect(res.status).toBe(200);
    const update = h.filters.findIndex((f) => f[0] === "update");
    expect(h.filters.slice(0, update)).toEqual([
      ["read", "id"],
      ["eq", "tg_user_id", 111000111],
      ["eq", "status", "pending"],
      ["not", "confirmed_at", "is", null],
      ["gt", "code_expires_at", expect.any(String)],
      ["neq", "id", ROW],
      ["limit", 1],
    ]);
    expect(h.filters.slice(update)).toEqual([
      ["update", { tg_user_name: "@leo_test", confirmed_at: expect.any(String), login_hash: auth.hash }],
      ["eq", "id", ROW],
      ["eq", "owner_id", LEO],
      ["eq", "status", "pending"],
      ["gt", "code_expires_at", expect.any(String)],
      ["eq", "tg_user_id", 111000111],
      ["is", "confirmed_at", null],
      ["eq", "nonce_hash", sha(NONCE)],
      ["select", "id"],
    ]);
    // the pickers go to that Telegram user
    expect(telegram).toEqual([`https://api.telegram.org/bot${TOKEN}/sendMessage`]);
  });

  it("refuses a bad Telegram login, or one without this browser's nonce, before any table is touched or the bot is called", async () => {
    const bad = await call("leo", { action: "verify", chatRow: ROW, auth: { id: "1", auth_date: "1", hash: "0".repeat(64) }, nonce: NONCE, confirm: true });
    expect(bad.status).toBe(400);
    const noNonce = await call("leo", { action: "verify", chatRow: ROW, auth: signedLogin(), confirm: true });
    expect(noNonce.status).toBe(404);
    expect(h.reads).toEqual([]);
    expect(telegram).toEqual([]);
  });
});
