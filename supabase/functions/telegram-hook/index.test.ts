import { createHash } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler's gate: Telegram's secret (the shared bot's, or an own bot's by the id in the URL) or the cron's, before
// anything is read, written or sent; the token never in an answer or a log. The queries that carry the rules are
// checked by their filters. What an update or a tick does is logic.test.ts's and send.test.ts's.
const OWN = "7000000002:" + "A".repeat(35);
const h = vi.hoisted(() => ({
  clients: 0,
  handler: null as null | ((r: Request) => Promise<Response>),
  filters: [] as unknown[][],
  botRow: null as null | Record<string, unknown>,
  ownToken: null as null | string,
}));
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({
  createClient: () => {
    h.clients++;
    // records a query's calls; a read of cs_telegram_bots finds the test's own bot, every other read or write nothing
    let table = "";
    const chain: Record<string, unknown> = {};
    for (const m of ["update", "select", "eq", "gt", "or", "in", "order", "limit", "is", "not"]) chain[m] = (...a: unknown[]) => (h.filters.push([m, ...a]), chain);
    chain.maybeSingle = async () => ({ data: table === "cs_telegram_bots" ? h.botRow : null, error: null });
    return {
      from: (t: string) => ((table = t), h.filters.push(["from", t]), chain),
      rpc: async (fn: string, args: Record<string, unknown>) => (h.filters.push(["rpc", fn, args]), { data: fn === "cs_telegram_bot_token" ? h.ownToken : null, error: null }),
    };
  },
}));

const TOKEN = "7000000001:TEST-token-for-fixtures-only";
const env: Record<string, string | undefined> = {};
const telegram: string[] = [];
const logged: string[] = [];

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: (r: Request) => Promise<Response>) => (h.handler = fn), env: { get: (k: string) => env[k] } });
  vi.stubGlobal("fetch", async (u: string) => (telegram.push(String(u)), new Response("{}")));
  await import("./index.ts");
}, 30_000);

beforeEach(() => {
  h.clients = 0;
  h.filters.length = 0;
  h.botRow = null;
  h.ownToken = null;
  telegram.length = 0;
  logged.length = 0;
  for (const k of ["log", "warn", "error"] as const) vi.spyOn(console, k).mockImplementation((...a: unknown[]) => void logged.push(a.map(String).join(" ")));
  Object.assign(env, { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_BOT_USERNAME: "cs_test_bot", TELEGRAM_WEBHOOK_SECRET: "hook-secret-for-tests", TELEGRAM_CRON_SECRET: "cron-secret-for-tests" });
});
afterEach(() => vi.restoreAllMocks());

const call = (headers: Record<string, string>, body: unknown = { update_id: 1 }, path = "/telegram-hook") =>
  h.handler!(new Request(`http://x${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
const start = { update_id: 1, message: { message_id: 1, from: { id: 111000111, is_bot: false, first_name: "Leo" }, chat: { id: 111000111, type: "private" }, date: 1, text: "/start Abc_DEF-123456789012345678901234" } };

describe("the Telegram hook's gate", () => {
  it("answers 401 to a request without either secret, or with a wrong one, and reads nothing", async () => {
    for (const headers of [{}, { "x-telegram-bot-api-secret-token": "wrong" }, { "x-telegram-cron-secret": "hook-secret-for-tests" }, { authorization: `Bearer ${TOKEN}` }]) {
      const res = await call(headers);
      expect(res.status, JSON.stringify(headers)).toBe(401);
      expect(await res.text()).not.toContain(TOKEN);
    }
    expect(h.clients).toBe(0);
    expect(telegram).toEqual([]);
  });

  it("answers 401 to everything while the secrets aren't set", async () => {
    env.TELEGRAM_WEBHOOK_SECRET = undefined;
    env.TELEGRAM_CRON_SECRET = "";
    for (const headers of [{ "x-telegram-bot-api-secret-token": "" }, { "x-telegram-cron-secret": "" }]) expect((await call(headers)).status).toBe(401);
    expect(h.clients).toBe(0);
  });

  it("does nothing without the bot token, even with the right secret", async () => {
    env.TELEGRAM_BOT_TOKEN = undefined;
    const res = await call({ "x-telegram-bot-api-secret-token": "hook-secret-for-tests" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false });
    expect(h.clients).toBe(0);
    expect(telegram).toEqual([]);
  });

  it("notes the Telegram user on a waiting, unexpired code of the shared bot at /start only while nobody else tapped Start with it", async () => {
    expect((await call({ "x-telegram-bot-api-secret-token": "hook-secret-for-tests" }, start)).status).toBe(200);
    expect(h.filters).toEqual([
      ["from", "cs_telegram_chats"],
      ["update", { tg_user_id: 111000111 }],
      // a code issued for the shared bot only; an own bot's codes are its own
      ["is", "bot_id", null],
      ["eq", "code_hash", expect.stringMatching(/^[0-9a-f]{64}$/)],
      ["eq", "status", "pending"],
      ["gt", "code_expires_at", expect.any(String)],
      // the first Telegram user to tap Start keeps the code; a later one gets nothing
      ["or", "tg_user_id.is.null,tg_user_id.eq.111000111"],
      ["select", expect.stringContaining("confirmed_at")],
    ]);
    // nothing found: the bot says the link expired (the stubbed fetch takes the reply)
    expect(telegram).toEqual(["https://api.telegram.org/bot7000000001:TEST-token-for-fixtures-only/sendMessage"]);
  });

  it("finds a Telegram user's confirmed connect before ordering, so a newer unconfirmed one can't hide it", async () => {
    const update = { update_id: 2, my_chat_member: { chat: { id: -1001234567890, title: "Test group", type: "supergroup" }, from: { id: 111000111, is_bot: false, first_name: "Leo" }, date: 1, old_chat_member: { user: { id: 7000000001, is_bot: true, first_name: "CS" }, status: "left" }, new_chat_member: { user: { id: 7000000001, is_bot: true, first_name: "CS" }, status: "administrator", can_manage_chat: true } } };
    expect((await call({ "x-telegram-bot-api-secret-token": "hook-secret-for-tests" }, update)).status).toBe(200);
    expect(h.filters).toEqual([
      ["from", "cs_telegram_chats"],
      ["select", expect.stringContaining("confirmed_at")],
      ["is", "bot_id", null],
      ["eq", "tg_user_id", 111000111],
      ["eq", "status", "pending"],
      ["gt", "code_expires_at", expect.any(String)],
      ["not", "confirmed_at", "is", null],
      ["order", "created_at", { ascending: false }],
      ["limit", 1],
    ]);
  });
});

describe("a brand's own bot", () => {
  const SECRET = "own-bot-webhook-secret-0123456789abcd";
  const own = () => {
    h.botRow = { bot_id: 7000000002, username: "mb_test_bot", webhook_secret_hash: createHash("sha256").update(SECRET).digest("hex") };
    h.ownToken = OWN;
  };

  it("takes an update for an own bot only with that bot's secret, and answers it as that bot, within that bot's codes", async () => {
    own();
    const res = await call({ "x-telegram-bot-api-secret-token": SECRET }, start, "/telegram-hook?bot=7000000002");
    expect(res.status).toBe(200);
    expect(h.filters.slice(0, 5)).toEqual([
      ["from", "cs_telegram_bots"],
      ["select", "bot_id, username, webhook_secret_hash"],
      ["eq", "bot_id", 7000000002],
      ["eq", "status", "active"],
      ["rpc", "cs_telegram_bot_token", { p_bot_id: 7000000002 }],
    ]);
    expect(h.filters).toContainEqual(["eq", "bot_id", 7000000002]);
    expect(h.filters.filter((f) => f[0] === "is" && f[1] === "bot_id")).toEqual([]);
    expect(telegram.map((u) => u.replace(OWN, "<own>"))).toEqual(["https://api.telegram.org/bot<own>/sendMessage"]);
  });

  it("refuses a wrong or missing secret, the shared bot's secret, an unknown bot and a bot id that isn't a number, before any chat is read", async () => {
    own();
    for (const [headers, path] of [
      [{ "x-telegram-bot-api-secret-token": "wrong" }, "/telegram-hook?bot=7000000002"],
      [{}, "/telegram-hook?bot=7000000002"],
      [{ "x-telegram-bot-api-secret-token": "hook-secret-for-tests" }, "/telegram-hook?bot=7000000002"],
      [{ "x-telegram-bot-api-secret-token": SECRET }, "/telegram-hook?bot=12abc"],
    ] as const) {
      const res = await call(headers, start, path);
      expect(res.status, `${JSON.stringify(headers)} ${path}`).toBe(401);
    }
    h.botRow = null;
    expect((await call({ "x-telegram-bot-api-secret-token": SECRET }, start, "/telegram-hook?bot=7000000009")).status).toBe(401);
    expect(h.filters.some((f) => f[0] === "from" && f[1] === "cs_telegram_chats")).toBe(false);
    expect(h.filters.some((f) => f[0] === "rpc")).toBe(false);
    expect(telegram).toEqual([]);
  });

  it("does nothing for an own bot whose token is gone, and never puts a token in an answer or a log line", async () => {
    own();
    h.ownToken = null;
    const res = await call({ "x-telegram-bot-api-secret-token": SECRET }, start, "/telegram-hook?bot=7000000002");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false });
    expect(telegram).toEqual([]);
    own();
    const answered = await call({ "x-telegram-bot-api-secret-token": SECRET }, start, "/telegram-hook?bot=7000000002");
    expect(await answered.text()).not.toContain(OWN.split(":")[1]);
    for (const line of logged) expect(line).not.toContain(OWN.split(":")[1]);
  });
});
