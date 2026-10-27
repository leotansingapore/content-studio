import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The handler's gate: Telegram's secret or the cron's before anything is read, written or sent; the token never in
// an answer. What an update or a tick does is logic.test.ts's and send.test.ts's.
const h = vi.hoisted(() => ({
  clients: 0,
  handler: null as null | ((r: Request) => Promise<Response>),
  filters: [] as unknown[][],
}));
vi.mock("https://esm.sh/@supabase/supabase-js@2.117.3", () => ({
  createClient: () => {
    h.clients++;
    // records a query's calls; every read or write finds nothing
    const chain: Record<string, unknown> = {};
    for (const m of ["update", "select", "eq", "gt", "or", "in", "order", "limit"]) chain[m] = (...a: unknown[]) => (h.filters.push([m, ...a]), chain);
    chain.maybeSingle = async () => ({ data: null, error: null });
    return { from: (t: string) => (h.filters.push(["from", t]), chain) };
  },
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
  h.clients = 0;
  h.filters.length = 0;
  telegram.length = 0;
  Object.assign(env, { TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_BOT_USERNAME: "cs_test_bot", TELEGRAM_WEBHOOK_SECRET: "hook-secret-for-tests", TELEGRAM_CRON_SECRET: "cron-secret-for-tests" });
});

const call = (headers: Record<string, string>, body: unknown = { update_id: 1 }) =>
  h.handler!(new Request("http://x/telegram-hook", { method: "POST", headers, body: JSON.stringify(body) }));

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

  it("notes the Telegram user on a code at /start only while nobody else tapped Start with it, and only a waiting, unexpired one", async () => {
    const update = { update_id: 1, message: { message_id: 1, from: { id: 111000111, is_bot: false, first_name: "Leo" }, chat: { id: 111000111, type: "private" }, date: 1, text: "/start Abc_DEF-123456789012345678901234" } };
    expect((await call({ "x-telegram-bot-api-secret-token": "hook-secret-for-tests" }, update)).status).toBe(200);
    expect(h.filters.slice(0, 7)).toEqual([
      ["from", "cs_telegram_chats"],
      ["update", { tg_user_id: 111000111 }],
      ["eq", "code_hash", expect.stringMatching(/^[0-9a-f]{64}$/)],
      ["eq", "status", "pending"],
      ["gt", "code_expires_at", expect.any(String)],
      ["or", "tg_user_id.is.null,tg_user_id.eq.111000111"],
      ["select", expect.stringContaining("confirmed_at")],
    ]);
    // nothing found: the bot says the link expired (the stubbed fetch takes the reply)
    expect(telegram).toEqual(["https://api.telegram.org/bot7000000001:TEST-token-for-fixtures-only/sendMessage"]);
  });
});
