import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler's gate (a sign-in, then the bot set up and the caller on NORTH_STAR_USERS, before any table, cap or
// Telegram call) and the queries that carry the security rules: start's, verify's and the own bot's. What each
// action decides is logic.test.ts's. Telegram and the database are stand-ins; nothing leaves the test.
const LEO = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const ROW = "00000000-0000-4000-8000-0000000000c1";
const OWN = "7000000002:" + "A".repeat(35);
const h = vi.hoisted(() => ({
  handler: null as null | ((r: Request) => Promise<Response>),
  reads: [] as string[],
  inserted: [] as unknown[],
  filters: [] as unknown[][],
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
  rpc: null as null | ((fn: string, args: Record<string, unknown>) => { data: unknown; error: unknown }),
  ownBot: null as null | Record<string, unknown>,
}));
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({
  createClient: () => ({
    auth: {
      getUser: async (jwt: string) => ({ data: { user: jwt === "leo" ? { id: "6d80f027-3395-480c-86a1-8827d3d6cce3", email: "leo@example.com" } : jwt === "other" ? { id: "7e57c0de-0000-4000-8000-0000000000d2" } : null } }),
    },
    from: (t: string) => {
      h.reads.push(t);
      const mine: unknown[][] = [];
      const note = (f: unknown[]) => (h.filters.push(f), mine.push(f));
      // a query's calls, as they would reach PostgREST. A read finds the code itself (by its id), the brand's own bot
      // when the test gives one, never a used login or another live connect; an update or delete changes one row.
      const chain: Record<string, unknown> = {};
      for (const m of ["eq", "gt", "or", "in", "neq", "is", "not", "limit"]) chain[m] = (...a: unknown[]) => (note([m, ...a]), chain);
      const writing = () => mine.some((f) => f[0] === "update" || f[0] === "delete");
      const answer = () =>
        t === "cs_telegram_bots"
          ? (writing() ? [] : h.ownBot ? [h.ownBot] : [])
          : writing() || mine.some((f) => f[0] === "eq" && f[1] === "id" && f[2] === "00000000-0000-4000-8000-0000000000c1")
            ? [{ id: "00000000-0000-4000-8000-0000000000c1", bot_id: null }]
            : [];
      chain.select = (cols: string) => (note([writing() ? "select" : "read", cols]), chain);
      chain.then = (ok: (v: unknown) => unknown) => ok({ data: answer(), error: null });
      chain.maybeSingle = async () => ({ data: answer()[0] ?? null, error: null });
      chain.update = (v: unknown) => (note(["update", v]), chain);
      chain.delete = () => (note(["delete"]), chain);
      chain.insert = (row: unknown) => (h.inserted.push(row), { select: () => ({ single: async () => ({ data: { id: "00000000-0000-4000-8000-0000000000c1" }, error: null }) }) });
      return chain;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      h.reads.push(fn);
      h.rpcs.push({ fn, args });
      return h.rpc?.(fn, args) ?? { data: fn === "cs_telegram_bot_save" ? "00000000-0000-4000-8000-0000000000b1" : fn === "cs_telegram_bot_token" ? OWN : 1, error: null };
    },
  }),
}));

const TOKEN = "7000000001:TEST-token-for-fixtures-only";
const env: Record<string, string | undefined> = {};
const telegram: { url: string; body: Record<string, unknown> }[] = [];
const logged: string[] = [];
let tgAnswer: (method: string, body: Record<string, unknown>) => unknown = () => ({});

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (h.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    telegram.push({ url: String(u), body });
    return new Response(JSON.stringify(tgAnswer(String(u).split("/").pop()!, body)));
  });
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  h.reads.length = 0;
  h.inserted.length = 0;
  h.filters.length = 0;
  h.rpcs.length = 0;
  h.rpc = null;
  h.ownBot = null;
  telegram.length = 0;
  logged.length = 0;
  tgAnswer = () => ({});
  for (const k of ["log", "warn", "error"] as const) vi.spyOn(console, k).mockImplementation((...a: unknown[]) => void logged.push(a.map(String).join(" ")));
  Object.assign(env, { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_BOT_USERNAME: "cs_test_bot", NORTH_STAR_USERS: LEO, SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "k" });
});
afterEach(() => vi.restoreAllMocks());

const call = (jwt: string | null, body: unknown = { action: "start", profileId: "me" }) =>
  h.handler!(new Request("http://x/telegram", { method: "POST", headers: jwt ? { Authorization: `Bearer ${jwt}` } : {}, body: JSON.stringify(body) }));

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
function signedLogin() {
  const fields: Record<string, string> = { id: "111000111", first_name: "Leo", username: "leo_test", auth_date: String(Math.floor(Date.now() / 1000) - 5) };
  const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  return { ...fields, hash: createHmac("sha256", createHash("sha256").update(TOKEN).digest()).update(check).digest("hex") };
}
const NONCE = "browser-nonce-for-tests-only-0123456789";
/** The code's own lookup: which bot it was issued for, on the caller's own row. */
const CODE_BOT = [["read", "bot_id"], ["eq", "id", ROW], ["eq", "owner_id", LEO]];

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

  it("starts a connect: one use of the day's cap, the brand's waiting connect cancelled, its own bot looked up, then the new row with nothing from the body but the brand id", async () => {
    const res = await call("leo", { action: "start", profileId: "pmoneybees", brandName: "Not My Brand", email: "someone@else.com" });
    expect(res.status).toBe(200);
    const { nonce } = (await res.json()) as { nonce: string };
    expect(h.reads).toEqual(["cs_consume_ai_usage", "cs_telegram_chats", "cs_telegram_bots", "cs_telegram_chats"]);
    expect(h.filters).toEqual([
      ["update", { status: "disconnected", removed_at: expect.any(String) }],
      ["eq", "owner_id", LEO],
      ["eq", "profile_id", "pmoneybees"],
      ["eq", "status", "pending"],
      ["select", "id"],
      ["read", "id, bot_id, username"],
      ["eq", "owner_id", LEO],
      ["eq", "profile_id", "pmoneybees"],
    ]);
    expect(h.inserted).toEqual([{ owner_id: LEO, profile_id: "pmoneybees", code_hash: expect.stringMatching(/^[0-9a-f]{64}$/), code_expires_at: expect.any(String), nonce_hash: sha(nonce), bot_id: null }]);
    expect(telegram).toEqual([]);
  });

  it("checks a Telegram login against this account's own waiting code, this browser's nonce and the Telegram user who tapped Start, writing nothing", async () => {
    const auth = signedLogin();
    const res = await call("leo", { action: "verify", chatRow: ROW, auth, nonce: NONCE, confirm: false });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ firstName: "Leo", username: "leo_test" });
    expect(h.filters).toEqual([
      ...CODE_BOT,
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
      ...CODE_BOT,
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
    // the pickers go to that Telegram user, from the shared bot this code was issued for
    expect(telegram.map((t) => t.url)).toEqual([`https://api.telegram.org/bot${TOKEN}/sendMessage`]);
  });

  it("refuses a bad Telegram login, or one without this browser's nonce, before anything is written or the bot is called", async () => {
    const bad = await call("leo", { action: "verify", chatRow: ROW, auth: { id: "1", auth_date: "1", hash: "0".repeat(64) }, nonce: NONCE, confirm: true });
    expect(bad.status).toBe(400);
    const noNonce = await call("leo", { action: "verify", chatRow: ROW, auth: signedLogin(), confirm: true });
    expect(noNonce.status).toBe(404);
    expect(h.filters.some((f) => f[0] === "update" || f[0] === "delete")).toBe(false);
    expect(telegram).toEqual([]);
  });
});

describe("the brand's own bot", () => {
  const me = { id: 7000000002, is_bot: true, first_name: "MoneyBees", username: "mb_test_bot" };
  const tgOk = (method: string) =>
    method === "getMe" ? { ok: true, result: me } : method === "getWebhookInfo" ? { ok: true, result: { url: "", pending_update_count: 0 } } : { ok: true, result: true };

  it("checks the pasted token, stores it through the Vault save, and sets that bot's webhook with its own secret on the hook URL carrying its id", async () => {
    tgAnswer = tgOk;
    const res = await call("leo", { action: "bot-add", profileId: "pmoneybees", token: OWN });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ botUsername: "mb_test_bot", botName: "MoneyBees" });
    expect(text).not.toContain(OWN.split(":")[1]);
    expect(telegram.map((t) => t.url.replace(OWN, "<own>"))).toEqual([
      "https://api.telegram.org/bot<own>/getMe",
      "https://api.telegram.org/bot<own>/getWebhookInfo",
      "https://api.telegram.org/bot<own>/setWebhook",
    ]);
    const hook = telegram[2].body;
    expect(hook).toEqual({ url: "http://x/functions/v1/telegram-hook?bot=7000000002", secret_token: expect.stringMatching(/^[A-Za-z0-9_-]{32,64}$/), allowed_updates: ["message", "my_chat_member"], drop_pending_updates: false });
    const save = h.rpcs.find((r) => r.fn === "cs_telegram_bot_save")!;
    expect(save.args).toEqual({ p_owner: LEO, p_profile: "pmoneybees", p_bot_id: 7000000002, p_username: "mb_test_bot", p_display_name: "MoneyBees", p_token: OWN, p_webhook_secret_hash: sha(hook.secret_token as string) });
    expect(h.reads.slice(0, 1)).toEqual(["cs_consume_ai_usage"]);
  });

  it("replaces the token of the brand's own bot: the same bot by getMe, its webhook again, then the Vault secret in place", async () => {
    const NEW = "7000000002:" + "N".repeat(35);
    h.ownBot = { id: "00000000-0000-4000-8000-0000000000b1", bot_id: 7000000002, username: "mb_test_bot" };
    h.rpc = (fn) => ({ data: fn === "cs_telegram_bot_replace_token" ? true : 1, error: null });
    tgAnswer = tgOk;
    const res = await call("leo", { action: "bot-replace", profileId: "pmoneybees", token: NEW });
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("N".repeat(35));
    expect(telegram.map((t) => t.url.replace(NEW, "<new>"))).toEqual(["https://api.telegram.org/bot<new>/getMe", "https://api.telegram.org/bot<new>/setWebhook"]);
    const replace = h.rpcs.find((r) => r.fn === "cs_telegram_bot_replace_token")!;
    expect(replace.args).toEqual({ p_owner: LEO, p_profile: "pmoneybees", p_bot_id: 7000000002, p_token: NEW, p_webhook_secret_hash: sha(telegram[1].body.secret_token as string) });
  });

  it("refuses a bad token before Telegram or the database hears of it", async () => {
    const res = await call("leo", { action: "bot-add", profileId: "pmoneybees", token: "nope" });
    expect(res.status).toBe(400);
    expect(telegram).toEqual([]);
    expect(h.rpcs.map((r) => r.fn)).toEqual(["cs_consume_ai_usage"]);
  });

  it("switches back: the bot's webhook goes, then its row (the database lets go of its chats and its Vault secret)", async () => {
    h.ownBot = { id: "00000000-0000-4000-8000-0000000000b1", bot_id: 7000000002, username: "mb_test_bot" };
    tgAnswer = tgOk;
    const res = await call("leo", { action: "bot-remove", profileId: "pmoneybees" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: true });
    expect(telegram.map((t) => t.url.replace(OWN, "<own>"))).toEqual(["https://api.telegram.org/bot<own>/deleteWebhook"]);
    expect(h.rpcs.map((r) => [r.fn, r.args])).toEqual([["cs_telegram_bot_token", { p_bot_id: 7000000002 }]]);
    const del = h.filters.findIndex((f) => f[0] === "delete");
    expect(h.filters.slice(del)).toEqual([["delete"], ["eq", "id", "00000000-0000-4000-8000-0000000000b1"]]);
  });

  it("never puts a token in a response or a log line, even when the database or Telegram fails", async () => {
    tgAnswer = (method) =>
      method === "getMe" ? { ok: true, result: me } : method === "getWebhookInfo" ? { ok: true, result: { url: "" } } : { ok: false, error_code: 400, description: `Bad Request: token ${OWN} rejected` };
    h.rpc = (fn) => (fn === "cs_telegram_bot_save" ? { data: null, error: { message: `failed for p_token=${OWN}`, code: "XX000" } } : { data: 1, error: null });
    const failed = await call("leo", { action: "bot-add", profileId: "pmoneybees", token: OWN });
    h.rpc = null;
    const webhook = await call("leo", { action: "bot-add", profileId: "pmoneybees", token: OWN });
    const secret = OWN.split(":")[1];
    for (const res of [failed, webhook]) expect(await res.text()).not.toContain(secret);
    expect([failed.status, webhook.status]).toEqual([500, 502]);
    expect(logged.length).toBeGreaterThan(0);
    for (const line of logged) expect(line).not.toContain(secret);
    for (const line of logged) expect(line).not.toContain(TOKEN.split(":")[1]);
  });
});
