import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  TelegramError,
  botClient,
  checkTelegramLogin,
  scrubTokens,
  hashCode,
  inSendingHours,
  intoSendingHours,
  mediaKindOf,
  messageLink,
} from "./telegram";

const TOKEN = "7000000001:TEST-token-for-fixtures-only";
const sg = (wall: string) => Date.parse(`${wall}+08:00`);

describe("the bot client", () => {
  it("posts JSON to the method's URL and answers the result", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const bot = botClient(TOKEN, async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }));
    });
    expect(bot.id).toBe(7000000001);
    expect(await bot.call("sendMessage", { chat_id: -100, text: "Hi" })).toEqual({ message_id: 7 });
    expect(calls).toEqual([{ url: `https://api.telegram.org/bot${TOKEN}/sendMessage`, body: { chat_id: -100, text: "Hi" } }]);
  });

  it("turns Telegram's refusal into a TelegramError with its code, wait and new chat id", async () => {
    const answer = { ok: false, error_code: 429, description: "Too Many Requests: retry after 35", parameters: { retry_after: 35, migrate_to_chat_id: -1005 } };
    const bot = botClient(TOKEN, async () => new Response(JSON.stringify(answer), { status: 429 }));
    const e = await bot.call("sendMessage", {}).catch((x) => x);
    expect(e).toBeInstanceOf(TelegramError);
    expect(e).toMatchObject({ status: 429, description: "Too Many Requests: retry after 35", retryAfter: 35, migrateTo: -1005 });
  });

  it("never carries the token in an error, whatever Telegram or the network says", async () => {
    const echo = botClient(TOKEN, async () => new Response(JSON.stringify({ ok: false, error_code: 401, description: `Unauthorized ${TOKEN}` }), { status: 401 }));
    const down = botClient(TOKEN, async (url) => {
      throw new TypeError(`fetch failed for ${url}`);
    });
    const garbled = botClient(TOKEN, async () => new Response("<html>bad gateway</html>", { status: 502 }));
    for (const bot of [echo, down, garbled]) {
      const e = await bot.call("getMe", {}).catch((x) => x);
      expect(e).toBeInstanceOf(TelegramError);
      expect(`${e.message} ${e.description} ${e.stack}`).not.toContain(TOKEN);
      expect(`${e.message} ${e.description}`).not.toContain("TEST-token");
    }
    expect((await down.call("getMe", {}).catch((x) => x)).status).toBe(0);
  });

  it("refuses a paid broadcast before anything is sent", async () => {
    let sent = 0;
    const bot = botClient(TOKEN, async () => (sent++, new Response("{}")));
    await expect(bot.call("sendMessage", { chat_id: 1, text: "x", allow_paid_broadcast: true })).rejects.toThrow(/paid/);
    expect(sent).toBe(0);
  });
});

describe("sending hours, 09:00 to 21:00 Singapore time", () => {
  it("holds 08:59 and 21:00, sends 09:00 and 20:59", () => {
    expect(inSendingHours(sg("2026-11-02T08:59:59"))).toBe(false);
    expect(inSendingHours(sg("2026-11-02T09:00:00"))).toBe(true);
    expect(inSendingHours(sg("2026-11-02T20:59:59"))).toBe(true);
    expect(inSendingHours(sg("2026-11-02T21:00:00"))).toBe(false);
  });

  it("moves a time outside the hours to the next 09:00, and keeps one inside", () => {
    expect(intoSendingHours(sg("2026-11-02T14:30:00"))).toBe(sg("2026-11-02T14:30:00"));
    expect(intoSendingHours(sg("2026-11-02T06:10:00"))).toBe(sg("2026-11-02T09:00:00"));
    expect(intoSendingHours(sg("2026-11-02T22:00:00"))).toBe(sg("2026-11-03T09:00:00"));
    expect(intoSendingHours(sg("2026-11-02T00:00:00"))).toBe(sg("2026-11-02T09:00:00"));
    // across a month end
    expect(intoSendingHours(sg("2026-11-30T23:59:00"))).toBe(sg("2026-12-01T09:00:00"));
  });
});

describe("message links", () => {
  it("gives t.me/<username>/<id> for a public chat and t.me/c/<id>/<topic>/<msg> for a private one", () => {
    expect(messageLink({ chat_id: -1009876543210, username: "cs_test_channel", topic_id: null }, 42)).toBe("https://t.me/cs_test_channel/42");
    expect(messageLink({ chat_id: -1001234567890, username: null, topic_id: 326 }, 4001)).toBe("https://t.me/c/1234567890/326/4001");
    expect(messageLink({ chat_id: -1001234567890, username: null, topic_id: null }, 4001)).toBe("https://t.me/c/1234567890/4001");
  });
  it("gives no link for a basic group, which has none", () => {
    expect(messageLink({ chat_id: -4001234567, username: null, topic_id: null }, 9)).toBeNull();
  });
});

describe("the small pieces", () => {
  it("hashes a code to sha256 hex", async () => {
    expect(await hashCode("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("reads a stored file's kind from its ending", () => {
    expect(mediaKindOf("u/me/x.jpg")).toBe("photo");
    expect(mediaKindOf("u/me/x.webp")).toBe("photo");
    expect(mediaKindOf("u/me/x.mp4")).toBe("video");
    expect(mediaKindOf("u/me/x.mov")).toBeNull();
  });
});

describe("Telegram's login check (login_url)", () => {
  const NOW = Date.parse("2026-11-02T10:00:00+08:00");
  // signed here with Node's own crypto, as Telegram documents it: HMAC-SHA256 of the sorted fields, keyed by SHA256(token)
  const sign = (fields: Record<string, string>, token = TOKEN) => {
    const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
    return { ...fields, hash: createHmac("sha256", createHash("sha256").update(token).digest()).update(check).digest("hex") };
  };
  const fields = { id: "111000111", first_name: "Leo", username: "leo_test", auth_date: String(Math.floor(NOW / 1000) - 60) };

  it("accepts Telegram's signed fields and answers the Telegram user", async () => {
    expect(await checkTelegramLogin(sign(fields), TOKEN, NOW)).toEqual({ ok: true, id: 111000111, name: "@leo_test", firstName: "Leo", username: "leo_test" });
    const { username: _u, ...noUsername } = fields;
    expect(await checkTelegramLogin(sign({ ...noUsername, last_name: "Tan", photo_url: "https://t.me/i/userpic/320/x.jpg" }), TOKEN, NOW)).toEqual({ ok: true, id: 111000111, name: "Leo", firstName: "Leo", username: null });
  });

  it("refuses a bad hash, a changed field, another bot's signature, or no hash", async () => {
    const good = sign(fields);
    for (const auth of [{ ...good, hash: "0".repeat(64) }, { ...good, id: "222000222" }, sign(fields, "7000000002:another-bot"), { ...fields }, { ...good, hash: "not-hex" }]) {
      expect(await checkTelegramLogin(auth, TOKEN, NOW)).toEqual({ ok: false, error: "Telegram couldn't confirm this. Tap Confirm in Telegram again." });
    }
  });

  it("refuses a sign-in more than 5 minutes old, or from the future", async () => {
    const stale = sign({ ...fields, auth_date: String(Math.floor(NOW / 1000) - 301) });
    const ahead = sign({ ...fields, auth_date: String(Math.floor(NOW / 1000) + 120) });
    for (const auth of [stale, ahead]) expect(await checkTelegramLogin(auth, TOKEN, NOW)).toEqual({ ok: false, error: "That confirmation is too old. Tap Confirm in Telegram again." });
    expect((await checkTelegramLogin(sign({ ...fields, auth_date: String(Math.floor(NOW / 1000) - 299) }), TOKEN, NOW)).ok).toBe(true);
  });
});

describe("scrubTokens", () => {
  it("blanks anything shaped like a bot token, wherever it sits in a log line", () => {
    const own = "7000000002:" + "A".repeat(35);
    expect(scrubTokens(`save failed: Key (p_token)=(${own}) bad; again ${TOKEN.replace("TEST-token-for-fixtures-only", "B".repeat(35))}`)).toBe("save failed: Key (p_token)=([token]) bad; again [token]");
    expect(scrubTokens("chat -1001234567890 and bot 7000000002")).toBe("chat -1001234567890 and bot 7000000002");
  });
});
