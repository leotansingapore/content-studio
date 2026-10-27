import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TelegramError, hashCode, type Bot } from "../_shared/telegram";
import { CODE_MINUTES, parseRequest, runAddBot, runDisconnect, runPresign, runRemoveBot, runReplaceBot, runSchedule, runStart, runVerify, type BotFor, type FnDb, type OwnRow } from "./logic";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const OTHER_UID = "7e57c0de-0000-4000-8000-0000000000d2";
const ROW = "00000000-0000-4000-8000-0000000000c1";
const ROW2 = "00000000-0000-4000-8000-0000000000c2";
const ROW3 = "00000000-0000-4000-8000-0000000000c3";
const KEY = "00000000-0000-4000-8000-00000000000a";
const sg = (wall: string) => Date.parse(`${wall}+08:00`);
const NOW = sg("2026-11-02T10:00:00");
const MB = 1024 * 1024;
const pic = (uid = UID, profile = "me", ext = "jpg") => `${uid}/${profile}/00000000-0000-4000-8000-000000000001.${ext}`;


interface Post { owner_id: string; client_key: string; chat_row: string; send_at: string; text: string; media: string[]; status: string; error?: string }
type Row = OwnRow & {
  owner_id: string;
  profile_id: string;
  tg_user_id?: number | null;
  tg_user_name?: string | null;
  confirmed_at?: string | null;
  code_expires_at?: string;
  login_hash?: string;
  nonce_hash?: string;
  bot_id?: number | null;
};
interface OwnBot { id: string; owner_id: string; profile_id: string; bot_id: number; username: string; display_name: string; token: string; webhook_secret_hash: string; status?: string }

/** The same rules as telegram/index.ts's queries, over rows in memory. */
function fakeDb(rows: Row[] = [], bots: OwnBot[] = []) {
  const inserted: Record<string, unknown>[] = [];
  const posts: Post[] = [];
  const saved: Record<string, unknown>[] = [];
  // every call that would hand the token to the database, refused or not
  const attempts: number[] = [];
  const target = (uid: string, id: string, tgUser: number, nonceHash: string, now: string) =>
    rows.find((x) => x.id === id && x.owner_id === uid && x.status === "pending" && (x.code_expires_at ?? "") > now && x.tg_user_id === tgUser && !x.confirmed_at && x.nonce_hash === nonceHash);
  const db: FnDb = {
    async cancelPending(uid, profileId, now) {
      const mine = rows.filter((r) => r.owner_id === uid && r.profile_id === profileId && r.status === "pending");
      for (const r of mine) Object.assign(r, { status: "disconnected", removed_at: now });
      return mine.length;
    },
    async insertConnect(r) {
      inserted.push(r);
      const id = [ROW, ROW2, ROW3][inserted.length - 1];
      rows.push({ id, chat_id: null, status: "pending", owner_id: r.owner_id, profile_id: r.profile_id, code_expires_at: r.code_expires_at, nonce_hash: r.nonce_hash, tg_user_id: null, bot_id: r.bot_id });
      return { id };
    },
    async brandBot(uid, profileId) {
      const b = bots.find((x) => x.owner_id === uid && x.profile_id === profileId);
      return b ? { id: b.id, bot_id: b.bot_id, username: b.username } : null;
    },
    async botTaken(botId) {
      return bots.some((x) => x.bot_id === botId);
    },
    async saveBot(b) {
      attempts.push(b.botId);
      // 027's cs_telegram_bot_save: unique bot id, one bot per brand; a refusal is a null, never an error
      if (bots.some((x) => x.bot_id === b.botId || (x.owner_id === b.owner && x.profile_id === b.profile))) return null;
      saved.push(b);
      const id = `00000000-0000-4000-8000-0000000000b${bots.length + 1}`;
      bots.push({ id, owner_id: b.owner, profile_id: b.profile, bot_id: b.botId, username: b.username, display_name: b.displayName, token: b.token, webhook_secret_hash: b.webhookSecretHash });
      return id;
    },
    async replaceToken(b) {
      // 027's cs_telegram_bot_replace_token: the brand's own row for that bot, or false
      const row = bots.find((x) => x.owner_id === b.owner && x.profile_id === b.profile && x.bot_id === b.botId);
      if (!row || !b.token.startsWith(`${b.botId}:`)) return false;
      Object.assign(row, { token: b.token, webhook_secret_hash: b.webhookSecretHash, status: "active" });
      return true;
    },
    async deleteBot(id) {
      const i = bots.findIndex((x) => x.id === id);
      if (i < 0) return;
      // 027's triggers, in the same statement: the chats let go and their waiting posts are cancelled
      const b = bots[i];
      const mine = rows.filter((r) => r.owner_id === b.owner_id && r.profile_id === b.profile_id && r.bot_id === b.bot_id);
      for (const p of posts) if (mine.some((r) => r.id === p.chat_row) && p.status === "scheduled") Object.assign(p, { status: "cancelled", error: "Disconnected" });
      for (const r of mine) Object.assign(r, { status: "disconnected", bot_id: null });
      bots.splice(i, 1);
    },
    async codeBot(uid, id) {
      const r = rows.find((x) => x.id === id && x.owner_id === uid);
      return r ? { botId: r.bot_id ?? null } : null;
    },
    async ownRow(uid, profileId, id) {
      return rows.find((r) => r.owner_id === uid && r.profile_id === profileId && r.id === id) ?? null;
    },
    async liveElsewhere(chatId, except, botId) {
      return rows.some((r) => r.chat_id === chatId && r.id !== except && r.status === "connected" && (r.bot_id ?? null) === botId);
    },
    async disconnect(id) {
      rows.find((r) => r.id === id)!.status = "disconnected";
    },
    async cancelPosts(ids, reason) {
      let n = 0;
      for (const p of posts) if (ids.includes(p.chat_row) && p.status === "scheduled") (p.status = "cancelled"), (p.error = reason), n++;
      return n;
    },
    async connectedRows(uid, profileId, ids) {
      return rows.filter((r) => r.owner_id === uid && r.profile_id === profileId && r.status === "connected" && ids.includes(r.id)).map((r) => r.id);
    },
    async insertPosts(list) {
      for (const p of list) if (!posts.some((x) => x.owner_id === p.owner_id && x.client_key === p.client_key && x.chat_row === p.chat_row)) posts.push({ ...p, status: "scheduled" });
    },
    async loginUsed(loginHash) {
      return rows.some((x) => x.login_hash === loginHash);
    },
    async loginTarget(uid, id, tgUser, nonceHash, now) {
      return !!target(uid, id, tgUser, nonceHash, now);
    },
    async liveConfirmedElsewhere(tgUser, except, now) {
      return rows.some((x) => x.id !== except && x.tg_user_id === tgUser && x.status === "pending" && !!x.confirmed_at && (x.code_expires_at ?? "") > now);
    },
    async verifyLogin(uid, id, tgUser, name, loginHash, nonceHash, now) {
      const r = target(uid, id, tgUser, nonceHash, now);
      if (!r) return "not_found";
      // 026's unique login_hash
      if (rows.some((x) => x.login_hash === loginHash)) return "used";
      Object.assign(r, { tg_user_name: name, confirmed_at: now, login_hash: loginHash });
      return "ok";
    },
    async postsFor(uid, key, ids) {
      return posts.filter((p) => p.owner_id === uid && p.client_key === key && ids.includes(p.chat_row)).map((p) => ({ id: `${p.chat_row}:post`, chat_row: p.chat_row, send_at: p.send_at, status: p.status }));
    },
  };
  return { db, inserted, posts, rows, bots, saved, attempts };
}

const SHARED = "7000000001:TEST-token-for-fixtures-only";
/** The shared bot, and any own bots, as index.ts resolves them; each own bot here has its own stub. */
function botsOf(shared: Bot, own: Record<number, { bot: Bot; token: string; username: string }> = {}): BotFor {
  return async (botId) => (botId === null ? { bot: shared, token: SHARED, username: "cs_test_bot" } : (own[botId] ?? null));
}

const leoRow = (o: Partial<Row> = {}): Row => ({ id: ROW, owner_id: UID, profile_id: "me", chat_id: -1001234567890, status: "connected" as const, ...o });

function stubBot(leave: () => unknown = () => true) {
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const bot: Bot = {
    id: 7000000001,
    async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
      calls.push({ method, params });
      const out = leave();
      if (out instanceof TelegramError) throw out;
      return out as T;
    },
  };
  return { bot, calls };
}

describe("reading a request", () => {
  it("takes the four actions and turns away anything else", () => {
    expect(parseRequest({ action: "start", profileId: "me", brandName: "x", email: "y" })).toEqual({ ok: true, req: { action: "start", profileId: "me" } });
    expect(parseRequest({ action: "verify", chatRow: ROW, nonce: "browser_nonce-123456", confirm: true, auth: { id: "1", hash: "h", auth_date: "2", extra: "x" } })).toEqual({
      ok: true,
      req: { action: "verify", chatRow: ROW, nonce: "browser_nonce-123456", confirm: true, auth: { id: "1", hash: "h", auth_date: "2" } },
    });
    expect(parseRequest({ action: "verify", chatRow: ROW, nonce: "bad nonce!", auth: {} })).toMatchObject({ ok: true, req: { nonce: null, confirm: false } });
    expect(parseRequest({ action: "verify", chatRow: "nope", auth: {} })).toMatchObject({ ok: false, status: 404 });
    expect(parseRequest({ action: "status", profileId: "me" })).toMatchObject({ ok: false, status: 400 });
    expect(parseRequest({ action: "start", profileId: "../x" })).toMatchObject({ ok: false, status: 404 });
    expect(parseRequest({ action: "disconnect", profileId: "me", chatRow: "1 or 1=1" })).toMatchObject({ ok: false, status: 404 });
  });

  it("holds files to Telegram's limits: pictures to 5 MB, one MP4 video to 20 MB, ten at most, never mixed", () => {
    const presign = (files: unknown) => parseRequest({ action: "presign", profileId: "me", files });
    expect(presign([{ type: "video/mp4", size: 20 * MB }])).toMatchObject({ ok: true });
    expect(presign([{ type: "video/mp4", size: 20 * MB + 1 }])).toEqual({ ok: false, status: 400, error: "Telegram takes videos up to 20 MB from Postmosis. Post a shorter one, or send it in Telegram." });
    expect(presign([{ type: "image/png", size: 5 * MB }, { type: "image/webp", size: 1 }])).toMatchObject({ ok: true });
    expect(presign([{ type: "image/jpeg", size: 5 * MB + 1 }])).toMatchObject({ ok: false, status: 400, error: expect.stringContaining("5 MB") });
    expect(presign([{ type: "video/quicktime", size: 1 }])).toMatchObject({ ok: false, status: 400 });
    expect(presign(Array.from({ length: 11 }, () => ({ type: "image/jpeg", size: 1 })))).toMatchObject({ ok: false, status: 400 });
    expect(presign([{ type: "image/jpeg", size: 1 }, { type: "video/mp4", size: 1 }])).toMatchObject({ ok: false, status: 400 });
    expect(presign([])).toMatchObject({ ok: false, status: 400 });
  });

  it("holds a post to 4,096 characters with text or a file, and a real time or now", () => {
    const schedule = (o: Record<string, unknown>) => parseRequest({ action: "schedule", profileId: "me", chatRows: [ROW], clientKey: KEY, text: "Hi", media: [], now: true, ...o });
    expect(schedule({})).toMatchObject({ ok: true, req: { sendAt: null } });
    expect(schedule({ now: undefined, sendAt: "2026-11-02T22:00:00+08:00" })).toMatchObject({ ok: true, req: { sendAt: sg("2026-11-02T22:00:00") } });
    expect(schedule({ text: "x".repeat(4097) })).toMatchObject({ ok: false, status: 400 });
    expect(schedule({ text: "  ", media: [] })).toMatchObject({ ok: false, status: 400 });
    expect(schedule({ now: undefined, sendAt: "soon" })).toMatchObject({ ok: false, status: 400 });
    expect(schedule({ clientKey: "abc" })).toMatchObject({ ok: false, status: 400 });
    expect(schedule({ chatRows: [] })).toMatchObject({ ok: false, status: 400 });
    expect(schedule({ chatRows: ["nope"] })).toMatchObject({ ok: false, status: 404 });
    expect(schedule({ media: [pic(), pic(UID, "me", "mp4")] })).toMatchObject({ ok: false, status: 400 });
  });
});

describe("start", () => {
  it("stores only the code's hash, for 15 minutes, with the hash of a nonce for this browser, and links to the bot with the code", async () => {
    const { db, inserted } = fakeDb();
    const out = await runStart(db, UID, "me", "cs_test_bot", NOW);
    expect(out.status).toBe(200);
    const { rowId, link, expiresAt, nonce } = out.body as { rowId: string; link: string; expiresAt: string; nonce: string };
    const code = /^https:\/\/t\.me\/cs_test_bot\?start=([A-Za-z0-9_-]{32,64})$/.exec(link)![1];
    expect(rowId).toBe(ROW);
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{32,64}$/);
    expect(nonce).not.toBe(code);
    expect(expiresAt).toBe(new Date(NOW + CODE_MINUTES * 60_000).toISOString());
    expect(CODE_MINUTES).toBe(15);
    expect(inserted).toEqual([{ owner_id: UID, profile_id: "me", code_hash: await hashCode(code), code_expires_at: expiresAt, nonce_hash: await hashCode(nonce), bot_id: null }]);
    expect(JSON.stringify(inserted)).not.toContain(code);
    expect(JSON.stringify(inserted)).not.toContain(nonce);
  });

  it("makes a new code every time, and the new one cancels the brand's waiting one", async () => {
    const elsewhere = leoRow({ id: "00000000-0000-4000-8000-0000000000e1", profile_id: "pother", status: "pending", chat_id: null });
    const live = leoRow({ id: "00000000-0000-4000-8000-0000000000e2" });
    const { db, rows } = fakeDb([elsewhere, live]);
    const a = await runStart(db, UID, "me", "cs_test_bot", NOW);
    const b = await runStart(db, UID, "me", "cs_test_bot", NOW);
    expect(a.body.link).not.toBe(b.body.link);
    const byId = (id: unknown) => rows.find((r) => r.id === id)!;
    expect(byId(a.body.rowId).status).toBe("disconnected");
    expect(byId(b.body.rowId).status).toBe("pending");
    // another brand's waiting connect and a live chat are not touched
    expect([byId(elsewhere.id).status, byId(live.id).status]).toEqual(["pending", "connected"]);
  });
});

describe("verify: Telegram's signed login, for the account and browser that made the code", () => {
  const TOKEN = "7000000001:TEST-token-for-fixtures-only";
  const NONCE = "browser-nonce-for-tests-only-0123456789";
  const sign = (fields: Record<string, string>, token = TOKEN) => {
    const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
    return { ...fields, hash: createHmac("sha256", createHash("sha256").update(token).digest()).update(check).digest("hex") };
  };
  const login = (o: Record<string, string> = {}) => sign({ id: "111000111", first_name: "Leo", username: "leo_test", auth_date: String(Math.floor(NOW / 1000) - 30), ...o });
  // Leo's Telegram tapped Start with the code (the webhook put that Telegram user on the row), in the browser holding NONCE
  const pending = async (o: Partial<Row> = {}): Promise<Row> => ({ id: ROW, owner_id: UID, profile_id: "me", chat_id: null, status: "pending", tg_user_id: 111000111, code_expires_at: new Date(NOW + 10 * 60_000).toISOString(), nonce_hash: await hashCode(NONCE), ...o });
  const check = (db: FnDb, bot: Bot, uid: string, auth: Record<string, string>, nonce: string | null = NONCE, row = ROW) => runVerify(db, botsOf(bot), uid, row, auth, nonce, false, NOW);
  const connect = (db: FnDb, bot: Bot, uid: string, auth: Record<string, string>, nonce: string | null = NONCE, row = ROW) => runVerify(db, botsOf(bot), uid, row, auth, nonce, true, NOW);

  it("first shows who Telegram says this is, and confirms nothing until Connect", async () => {
    const { db, rows } = fakeDb([await pending()]);
    const { bot, calls } = stubBot(() => ({ message_id: 9 }));
    expect(await check(db, bot, UID, login())).toEqual({ status: 200, body: { firstName: "Leo", username: "leo_test" } });
    expect(rows[0].confirmed_at).toBeUndefined();
    expect(calls).toEqual([]);
    // Connect: now it is confirmed, and that Telegram user gets the pickers
    expect(await connect(db, bot, UID, login())).toEqual({ status: 200, body: { linked: true, picker: true } });
    expect(rows[0]).toMatchObject({ tg_user_id: 111000111, tg_user_name: "@leo_test", confirmed_at: new Date(NOW).toISOString(), login_hash: login().hash });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "sendMessage", params: { chat_id: 111000111, text: expect.stringContaining("Pick the group or channel") } });
    expect(JSON.stringify(calls[0].params)).toContain("request_chat");
  });

  it("works only with this browser's nonce: missing, wrong, or from another connect, it fails and nothing changes", async () => {
    for (const nonce of [null, "", "another-browser-nonce-0123456789abcdef"]) {
      const { db, rows } = fakeDb([await pending()]);
      const { bot, calls } = stubBot();
      for (const run of [check, connect]) expect((await run(db, bot, UID, login(), nonce)).status, String(nonce)).toBe(404);
      expect(rows[0].confirmed_at).toBeUndefined();
      expect(calls).toEqual([]);
    }
  });

  it("refuses a signed-in session of a different account: someone else's code stays untouched", async () => {
    const { db, rows } = fakeDb([await pending()]);
    const { bot, calls } = stubBot();
    for (const run of [check, connect]) expect((await run(db, bot, OTHER_UID, login())).status).toBe(404);
    expect(rows[0].confirmed_at).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("refuses a login from a different Telegram user than the one who tapped Start with the code, or a code nobody started", async () => {
    for (const r of [await pending({ tg_user_id: 222000222 }), await pending({ tg_user_id: null })]) {
      const { db, rows } = fakeDb([r]);
      const { bot, calls } = stubBot();
      for (const run of [check, connect]) expect((await run(db, bot, UID, login())).status).toBe(404);
      expect(rows[0].confirmed_at).toBeUndefined();
      expect(calls).toEqual([]);
    }
  });

  it("takes each signed login once: never again on the same code or another", async () => {
    const { db, rows } = fakeDb([await pending(), await pending({ id: ROW2 })]);
    const auth = login();
    expect((await connect(db, stubBot(() => ({ message_id: 1 })).bot, UID, auth)).status).toBe(200);
    expect((await connect(db, stubBot().bot, UID, auth)).status).toBe(404);
    // the first code is used up (connected), and the same login is tried on the second
    rows[0].status = "connected";
    rows[0].chat_id = -100;
    const used = { status: 409, body: { error: "That confirmation was already used. Tap Confirm in Telegram again." } };
    expect(await check(db, stubBot().bot, UID, auth, NONCE, ROW2)).toEqual(used);
    expect(await connect(db, stubBot().bot, UID, auth, NONCE, ROW2)).toEqual(used);
    expect(rows[1].confirmed_at).toBeUndefined();
  });

  it("lets a Telegram user hold one confirmed connect at a time", async () => {
    const { db, rows } = fakeDb([await pending({ confirmed_at: new Date(NOW - 60_000).toISOString(), login_hash: "f".repeat(64) }), await pending({ id: ROW2 })]);
    const out = await connect(db, stubBot().bot, UID, login(), NONCE, ROW2);
    expect(out).toEqual({ status: 409, body: { error: "This Telegram account is already connecting a chat. Finish that one, or wait 15 minutes." } });
    expect(rows[1].confirmed_at).toBeUndefined();
    // once the first one is done, the second can go ahead
    rows[0].status = "connected";
    rows[0].chat_id = -100;
    expect((await connect(db, stubBot(() => ({ message_id: 1 })).bot, UID, login(), NONCE, ROW2)).status).toBe(200);
  });

  it("refuses a bad hash or a login over 5 minutes old before the code is touched", async () => {
    for (const auth of [{ ...login(), hash: "0".repeat(64) }, { ...login(), id: "222000222" }, login({ auth_date: String(Math.floor(NOW / 1000) - 301) }), sign({ id: "111000111", auth_date: String(Math.floor(NOW / 1000)) }, "7000000002:another-bot")]) {
      const { db, rows } = fakeDb([await pending()]);
      const { bot, calls } = stubBot();
      for (const run of [check, connect]) expect((await run(db, bot, UID, auth)).status).toBe(400);
      expect(rows[0].confirmed_at).toBeUndefined();
      expect(calls).toEqual([]);
    }
  });

  it("refuses an expired code, and one no longer waiting", async () => {
    for (const r of [await pending({ code_expires_at: new Date(NOW).toISOString() }), await pending({ status: "connected", chat_id: -100 })]) {
      const { db, rows } = fakeDb([r]);
      expect((await connect(db, stubBot().bot, UID, login())).status).toBe(404);
      expect(rows[0].confirmed_at).toBeUndefined();
    }
  });

  it("is still linked when the pickers can't be sent; the link in Telegram offers them again", async () => {
    const { db } = fakeDb([await pending()]);
    expect(await connect(db, stubBot(() => new TelegramError(403, "Forbidden: bot was blocked by the user")).bot, UID, login())).toEqual({ status: 200, body: { linked: true, picker: false } });
  });
});

describe("disconnect", () => {
  it("makes the bot leave, marks the row disconnected and cancels its waiting posts", async () => {
    const { db, rows, posts } = fakeDb([leoRow()]);
    posts.push({ owner_id: UID, client_key: KEY, chat_row: ROW, send_at: "", text: "x", media: [], status: "scheduled" }, { owner_id: UID, client_key: KEY, chat_row: ROW, send_at: "", text: "y", media: [], status: "posted" });
    const { bot, calls } = stubBot();
    const out = await runDisconnect(db, botsOf(bot), UID, "me", ROW, NOW);
    expect(out).toEqual({ status: 200, body: { disconnected: true, cancelled: 1 } });
    expect(calls).toEqual([{ method: "leaveChat", params: { chat_id: -1001234567890 } }]);
    expect(rows[0].status).toBe("disconnected");
    expect(posts.map((p) => [p.status, p.error])).toEqual([["cancelled", "Disconnected"], ["posted", undefined]]);
  });

  it("is a 404 for a row that isn't the caller's, in this brand, and nothing happens", async () => {
    for (const [uid, profile] of [[OTHER_UID, "me"], [UID, "pother"]]) {
      const { db, rows } = fakeDb([leoRow()]);
      const { bot, calls } = stubBot();
      expect((await runDisconnect(db, botsOf(bot), uid, profile, ROW, NOW)).status).toBe(404);
      expect(calls).toEqual([]);
      expect(rows[0].status).toBe("connected");
    }
  });

  it("keeps the bot in a chat another brand still posts to", async () => {
    const { db, rows } = fakeDb([leoRow(), leoRow({ id: ROW2, profile_id: "pother" })]);
    const { bot, calls } = stubBot();
    await runDisconnect(db, botsOf(bot), UID, "me", ROW, NOW);
    expect(calls).toEqual([]);
    expect(rows.map((r) => r.status)).toEqual(["disconnected", "connected"]);
  });

  it("disconnects when the bot is already out, and changes nothing when Telegram can't be reached", async () => {
    const gone = fakeDb([leoRow()]);
    expect((await runDisconnect(gone.db, botsOf(stubBot(() => new TelegramError(403, "Forbidden: bot is not a member of the supergroup chat")).bot), UID, "me", ROW, NOW)).status).toBe(200);
    expect(gone.rows[0].status).toBe("disconnected");
    const down = fakeDb([leoRow()]);
    const out = await runDisconnect(down.db, botsOf(stubBot(() => new TelegramError(0, "Telegram didn't answer.")).bot), UID, "me", ROW, NOW);
    expect(out).toMatchObject({ status: 502 });
    expect(down.rows[0].status).toBe("connected");
  });

  it("cancels a waiting connect without calling Telegram", async () => {
    const { db, rows } = fakeDb([leoRow({ chat_id: null, status: "pending" })]);
    const { bot, calls } = stubBot();
    expect((await runDisconnect(db, botsOf(bot), UID, "me", ROW, NOW)).status).toBe(200);
    expect(calls).toEqual([]);
    expect(rows[0].status).toBe("disconnected");
  });
});

describe("presign", () => {
  it("makes one upload link per file under the caller's own brand folder", async () => {
    const asked: string[] = [];
    const out = await runPresign(async (path) => (asked.push(path), { path, token: "t" }), UID, "me", [{ type: "image/jpeg", size: 1 }, { type: "image/png", size: 1 }]);
    expect(asked).toEqual([expect.stringMatching(new RegExp(`^${UID}/me/[0-9a-f-]{36}\\.jpg$`)), expect.stringMatching(new RegExp(`^${UID}/me/[0-9a-f-]{36}\\.png$`))]);
    expect(out).toEqual({ status: 200, body: { uploads: asked.map((path) => ({ path, token: "t" })) } });
  });
});

describe("schedule", () => {
  const req = (o: Record<string, unknown> = {}) => {
    const r = parseRequest({ action: "schedule", profileId: "me", chatRows: [ROW], clientKey: KEY, text: "Hello", media: [], now: true, ...o });
    if (!r.ok || r.req.action !== "schedule") throw new Error("bad test request");
    return r.req;
  };

  it("queues one post per chat, and the same client key twice makes one post", async () => {
    const { db, posts } = fakeDb([leoRow(), leoRow({ id: ROW2, chat_id: -1009876543210 })]);
    const first = await runSchedule(db, UID, req({ chatRows: [ROW, ROW2] }), NOW);
    const again = await runSchedule(db, UID, req({ chatRows: [ROW, ROW2] }), NOW);
    expect(posts).toHaveLength(2);
    expect(first).toEqual(again);
    expect(first.body).toMatchObject({ held: false, sendAt: new Date(NOW).toISOString() });
  });

  it("moves a time outside 9am to 9pm to the next 9am", async () => {
    const { db, posts } = fakeDb([leoRow()]);
    const out = await runSchedule(db, UID, req({ now: undefined, sendAt: "2026-11-02T22:00:00+08:00" }), NOW);
    expect(out.body).toMatchObject({ held: true, sendAt: new Date(sg("2026-11-03T09:00:00")).toISOString() });
    expect(posts[0].send_at).toBe(new Date(sg("2026-11-03T09:00:00")).toISOString());
    const late = fakeDb([leoRow()]);
    expect((await runSchedule(late.db, UID, req(), sg("2026-11-02T23:30:00"))).body).toMatchObject({ held: true, sendAt: new Date(sg("2026-11-03T09:00:00")).toISOString() });
  });

  it("is a 404 for a chat that isn't the caller's connected chat in this brand, or a file outside their folder", async () => {
    for (const rows of [[leoRow({ owner_id: OTHER_UID })], [leoRow({ status: "removed" })], [leoRow({ profile_id: "pother" })]]) {
      const { db, posts } = fakeDb(rows);
      expect((await runSchedule(db, UID, req(), NOW)).status).toBe(404);
      expect(posts).toEqual([]);
    }
    for (const path of [pic(OTHER_UID), pic(UID, "pother"), `${UID}/me/../x.jpg`, `${UID}/me/00000000-0000-4000-8000-000000000001.gif`]) {
      const { db, posts } = fakeDb([leoRow()]);
      expect((await runSchedule(db, UID, req({ media: [path] }), NOW)).status, path).toBe(404);
      expect(posts).toEqual([]);
    }
  });
});

describe("own bot per brand", () => {
  const OWN = "7000000002:" + "A".repeat(35);
  const HOOK = "https://hub.supabase.co/functions/v1/telegram-hook";
  const me = { id: 7000000002, is_bot: true, first_name: "MoneyBees", username: "mb_test_bot", can_join_groups: true };
  /** A stub client per token: getMe and setWebhook answer as given; every call is noted with its token. */
  function clients(o: { getMe?: unknown; setWebhook?: unknown; deleteWebhook?: unknown; getWebhookInfo?: unknown } = {}) {
    const calls: { token: string; method: string; params: Record<string, unknown> }[] = [];
    const client = (token: string): Bot => ({
      id: Number(token.split(":")[0]),
      async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
        calls.push({ token, method, params });
        const out = (o as Record<string, unknown>)[method] ?? (method === "getMe" ? me : method === "getWebhookInfo" ? { url: "", pending_update_count: 0 } : true);
        if (out instanceof TelegramError) throw out;
        return out as T;
      },
    });
    return { client, calls };
  }
  const add = (db: FnDb, client: (t: string) => Bot, token = OWN, uid = UID) => runAddBot(db, client, uid, "me", token, HOOK, 7000000001);

  it("refuses something that isn't a bot token without calling Telegram or keeping anything", async () => {
    for (const token of ["not a token", "123:short", `${OWN} `, "7000000002:" + "A".repeat(10), ""]) {
      const { db, bots, saved } = fakeDb();
      const { client, calls } = clients();
      const out = await add(db, client, token);
      expect(out, token).toEqual({ status: 400, body: { error: "That isn't a bot token. Copy the whole token BotFather sent." } });
      expect(calls).toEqual([]);
      expect([bots, saved]).toEqual([[], []]);
    }
  });

  it("refuses a token Telegram doesn't know, one that isn't a bot's, and the shared bot's own, keeping nothing", async () => {
    for (const [o, token, error] of [
      [{ getMe: new TelegramError(401, "Unauthorized") }, OWN, "Telegram doesn't know that token. Copy it again from BotFather."],
      [{ getMe: { ...me, is_bot: false } }, OWN, "Telegram doesn't know that token. Copy it again from BotFather."],
      [{ getMe: { ...me, id: 7000000009 } }, OWN, "Telegram doesn't know that token. Copy it again from BotFather."],
      [{ getMe: { ...me, id: 7000000001 } }, "7000000001:" + "Z".repeat(35), "That is Postmosis's shared bot. Make a new bot in BotFather for this brand."],
    ] as const) {
      const { db, bots } = fakeDb();
      const { client, calls } = clients(o);
      expect(await add(db, client, token)).toEqual({ status: 400, body: { error } });
      expect(calls.map((c) => c.method).filter((m) => m !== "getMe")).toEqual([]);
      expect(bots).toEqual([]);
    }
  });

  it("refuses a bot already set up in Content Studio, by any account, and a brand that already has its own", async () => {
    const taken: OwnBot = { id: "b0", owner_id: OTHER_UID, profile_id: "me", bot_id: 7000000002, username: "mb_test_bot", display_name: "", token: "x", webhook_secret_hash: "0".repeat(64) };
    const one = fakeDb([], [taken]);
    expect(await add(one.db, clients().client)).toEqual({ status: 409, body: { error: "That bot is already set up in Postmosis." } });
    expect(one.bots).toHaveLength(1);
    // refused here, before the token ever reaches the database
    expect(one.attempts).toEqual([]);
    const mine: OwnBot = { ...taken, owner_id: UID, bot_id: 7000000003, username: "fin_test_bot" };
    const two = fakeDb([], [mine]);
    expect(await add(two.db, clients().client)).toEqual({ status: 409, body: { error: "This brand already posts as @fin_test_bot. Switch back to the shared bot first." } });
    expect(two.bots).toHaveLength(1);
    expect(two.attempts).toEqual([]);
  });

  it("stores the token through the Vault save, sets that bot's webhook with its own secret, and answers with the bot's name only", async () => {
    const { db, bots, saved } = fakeDb();
    const { client, calls } = clients();
    const out = await add(db, client);
    expect(out).toEqual({ status: 200, body: { botUsername: "mb_test_bot", botName: "MoneyBees" } });
    expect(JSON.stringify(out)).not.toContain(OWN.split(":")[1]);
    expect(saved).toEqual([{ owner: UID, profile: "me", botId: 7000000002, username: "mb_test_bot", displayName: "MoneyBees", token: OWN, webhookSecretHash: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
    const hook = calls.find((c) => c.method === "setWebhook")!;
    expect(hook.token).toBe(OWN);
    expect(calls.map((c) => c.method)).toEqual(["getMe", "getWebhookInfo", "setWebhook"]);
    // what the bot already queued is kept: nothing a person sent it is thrown away
    expect(hook.params).toEqual({ url: `${HOOK}?bot=7000000002`, secret_token: expect.stringMatching(/^[A-Za-z0-9_-]{32,64}$/), allowed_updates: ["message", "my_chat_member"], drop_pending_updates: false });
    // the stored hash is that secret's: the hook can check it, and the secret itself is kept nowhere
    expect(bots[0].webhook_secret_hash).toBe(await hashCode(hook.params.secret_token as string));
    expect(JSON.stringify(bots)).not.toContain(hook.params.secret_token as string);
  });

  it("refuses a bot whose webhook already goes to another app, before anything is stored", async () => {
    const { db, bots, attempts } = fakeDb();
    const { client, calls } = clients({ getWebhookInfo: { url: "https://other.example/hook", pending_update_count: 3 } });
    expect(await add(db, client)).toEqual({
      status: 409,
      body: { error: "That bot already sends its updates to another app. Make a new bot in BotFather for Postmosis, or remove that app's webhook first." },
    });
    expect(calls.map((c) => c.method)).toEqual(["getMe", "getWebhookInfo"]);
    expect([bots, attempts]).toEqual([[], []]);
  });

  it("takes a bot with no webhook, or one already pointing at this hook for this bot", async () => {
    for (const url of ["", `${HOOK}?bot=7000000002`]) {
      const { db, bots } = fakeDb();
      expect((await add(db, clients({ getWebhookInfo: { url, pending_update_count: 0 } }).client)).status, url).toBe(200);
      expect(bots).toHaveLength(1);
    }
  });

  it("changes nothing when Telegram can't say where the bot's updates go", async () => {
    const { db, bots, attempts } = fakeDb();
    const out = await add(db, clients({ getWebhookInfo: new TelegramError(0, "Telegram didn't answer.") }).client);
    expect(out).toEqual({ status: 502, body: { error: "Couldn't reach Telegram. Try again in a minute." } });
    expect([bots, attempts]).toEqual([[], []]);
  });

  it("keeps nothing when Telegram won't take the webhook", async () => {
    const { db, bots } = fakeDb();
    const out = await add(db, clients({ setWebhook: new TelegramError(400, "Bad Request: bad webhook: HTTPS url must be provided for webhook") }).client);
    expect(out).toEqual({ status: 502, body: { error: "Telegram didn't take the bot's webhook. Try again in a minute." } });
    expect(bots).toEqual([]);
  });

  it("connects through the brand's own bot: its @name in the link, its id on the code", async () => {
    const mine: OwnBot = { id: "b1", owner_id: UID, profile_id: "me", bot_id: 7000000002, username: "mb_test_bot", display_name: "MoneyBees", token: OWN, webhook_secret_hash: "0".repeat(64) };
    const { db, inserted } = fakeDb([], [mine]);
    const out = await runStart(db, UID, "me", "cs_test_bot", NOW);
    expect(out.body.link).toMatch(/^https:\/\/t\.me\/mb_test_bot\?start=/);
    expect(inserted[0]).toMatchObject({ bot_id: 7000000002 });
    const shared = fakeDb();
    await runStart(shared.db, UID, "me", "cs_test_bot", NOW);
    expect(shared.inserted[0]).toMatchObject({ bot_id: null });
  });

  it("checks a login against the token of the bot the code was issued for, and that bot sends the pickers", async () => {
    const NONCE = "browser-nonce-for-tests-only-0123456789";
    const sign = (token: string) => {
      const fields: Record<string, string> = { id: "111000111", first_name: "Leo", auth_date: String(Math.floor(NOW / 1000) - 30) };
      const check = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
      return { ...fields, hash: createHmac("sha256", createHash("sha256").update(token).digest()).update(check).digest("hex") };
    };
    const row: Row = { id: ROW, owner_id: UID, profile_id: "me", chat_id: null, status: "pending", tg_user_id: 111000111, code_expires_at: new Date(NOW + 600_000).toISOString(), nonce_hash: await hashCode(NONCE), bot_id: 7000000002 };
    const own = stubBot(() => ({ message_id: 1 }));
    const shared = stubBot(() => ({ message_id: 1 }));
    const bots = botsOf(shared.bot, { 7000000002: { bot: own.bot, token: OWN, username: "mb_test_bot" } });
    // a login signed for the shared bot doesn't confirm an own-bot code
    expect((await runVerify(fakeDb([{ ...row }]).db, bots, UID, ROW, sign(SHARED), NONCE, true, NOW)).status).toBe(400);
    const { db, rows } = fakeDb([{ ...row }]);
    expect((await runVerify(db, bots, UID, ROW, sign(OWN), NONCE, true, NOW)).status).toBe(200);
    expect(rows[0].confirmed_at).toBe(new Date(NOW).toISOString());
    expect(own.calls.map((c) => c.method)).toEqual(["sendMessage"]);
    expect(String(own.calls[0].params.text)).toContain("https://t.me/mb_test_bot?startgroup");
    expect(shared.calls).toEqual([]);
    // the code's bot is gone (switched back): nothing confirms
    expect((await runVerify(fakeDb([{ ...row }]).db, botsOf(shared.bot), UID, ROW, sign(OWN), NONCE, true, NOW)).status).toBe(404);
  });

  it("makes the own bot leave a chat on Disconnect, not the shared bot", async () => {
    const own = stubBot();
    const shared = stubBot();
    const { db } = fakeDb([leoRow({ bot_id: 7000000002 })]);
    expect((await runDisconnect(db, botsOf(shared.bot, { 7000000002: { bot: own.bot, token: OWN, username: "mb_test_bot" } }), UID, "me", ROW, NOW)).status).toBe(200);
    expect(own.calls.map((c) => c.method)).toEqual(["leaveChat"]);
    expect(shared.calls).toEqual([]);
  });

  it("switching back deletes the bot's webhook, disconnects the chats tied through it, cancels their waiting posts, and deletes the bot", async () => {
    const mine: OwnBot = { id: "b1", owner_id: UID, profile_id: "me", bot_id: 7000000002, username: "mb_test_bot", display_name: "MoneyBees", token: OWN, webhook_secret_hash: "0".repeat(64) };
    const ownChat = leoRow({ bot_id: 7000000002 });
    const sharedChat = leoRow({ id: ROW2, chat_id: -1009876543210, bot_id: null });
    const { db, rows, posts, bots } = fakeDb([ownChat, sharedChat], [mine]);
    posts.push({ owner_id: UID, client_key: KEY, chat_row: ROW, send_at: "", text: "x", media: [], status: "scheduled" }, { owner_id: UID, client_key: KEY, chat_row: ROW2, send_at: "", text: "y", media: [], status: "scheduled" });
    const { client, calls } = clients();
    const out = await runRemoveBot(db, client, async (botId) => (botId === 7000000002 ? OWN : null), UID, "me");
    expect(out).toEqual({ status: 200, body: { removed: true } });
    expect(calls).toEqual([{ token: OWN, method: "deleteWebhook", params: { drop_pending_updates: true } }]);
    expect(rows.map((r) => r.status)).toEqual(["disconnected", "connected"]);
    expect(posts.map((p) => p.status)).toEqual(["cancelled", "scheduled"]);
    expect(bots).toEqual([]);
  });

  it("switches back even when the bot's token no longer works, and is a 404 for a brand on the shared bot", async () => {
    const mine: OwnBot = { id: "b1", owner_id: UID, profile_id: "me", bot_id: 7000000002, username: "mb_test_bot", display_name: "", token: OWN, webhook_secret_hash: "0".repeat(64) };
    const revoked = fakeDb([], [{ ...mine }]);
    expect((await runRemoveBot(revoked.db, clients({ deleteWebhook: new TelegramError(401, "Unauthorized") }).client, async () => OWN, UID, "me")).status).toBe(200);
    expect(revoked.bots).toEqual([]);
    const down = fakeDb([], [{ ...mine }]);
    expect((await runRemoveBot(down.db, clients({ deleteWebhook: new TelegramError(0, "Telegram didn't answer.") }).client, async () => OWN, UID, "me")).status).toBe(502);
    expect(down.bots).toHaveLength(1);
    expect((await runRemoveBot(fakeDb().db, clients().client, async () => null, UID, "me")).status).toBe(404);
  });

  it("says the bot is taken when the database refuses the save (another add won a race), keeping nothing", async () => {
    const { db, bots } = fakeDb();
    const racing: FnDb = { ...db, botTaken: async () => false, brandBot: async () => null, saveBot: async () => null };
    const { client, calls } = clients();
    expect(await add(racing, client)).toEqual({ status: 409, body: { error: "That bot is already set up in Postmosis." } });
    expect(calls.map((c) => c.method)).toEqual(["getMe", "getWebhookInfo"]);
    expect(bots).toEqual([]);
  });

  it("replaces a revoked token for the same bot: a new webhook secret, the Vault secret updated in place, every chat kept", async () => {
    const NEW = "7000000002:" + "N".repeat(35);
    const mine: OwnBot = { id: "b1", owner_id: UID, profile_id: "me", bot_id: 7000000002, username: "mb_test_bot", display_name: "MoneyBees", token: OWN, webhook_secret_hash: "0".repeat(64), status: "revoked" };
    const { db, bots, rows } = fakeDb([leoRow({ bot_id: 7000000002 })], [mine]);
    const { client, calls } = clients();
    const out = await runReplaceBot(db, client, UID, "me", NEW, HOOK);
    expect(out).toEqual({ status: 200, body: { botUsername: "mb_test_bot", botName: "MoneyBees" } });
    expect(calls.map((c) => [c.token === NEW ? "new" : "old", c.method])).toEqual([["new", "getMe"], ["new", "setWebhook"]]);
    const hook = calls[1].params;
    expect(hook).toEqual({ url: `${HOOK}?bot=7000000002`, secret_token: expect.stringMatching(/^[A-Za-z0-9_-]{32,64}$/), allowed_updates: ["message", "my_chat_member"], drop_pending_updates: false });
    expect(bots[0]).toMatchObject({ token: NEW, status: "active", webhook_secret_hash: await hashCode(hook.secret_token as string) });
    expect(rows[0]).toMatchObject({ status: "connected", bot_id: 7000000002 });
    expect(JSON.stringify(out)).not.toContain("N".repeat(35));
  });

  it("refuses a token for another bot, a bad token, and a brand on the shared bot, changing nothing", async () => {
    const mine: OwnBot = { id: "b1", owner_id: UID, profile_id: "me", bot_id: 7000000002, username: "mb_test_bot", display_name: "", token: OWN, webhook_secret_hash: "0".repeat(64), status: "revoked" };
    const other = { id: 7000000009, is_bot: true, first_name: "Other", username: "other_bot" };
    for (const [token, o, want] of [
      ["7000000009:" + "N".repeat(35), { getMe: other }, { status: 400, body: { error: "That token is for another bot. Paste the token for @mb_test_bot." } }],
      ["not a token", {}, { status: 400, body: { error: "That isn't a bot token. Copy the whole token BotFather sent." } }],
      ["7000000002:" + "N".repeat(35), { getMe: new TelegramError(401, "Unauthorized") }, { status: 400, body: { error: "Telegram doesn't know that token. Copy it again from BotFather." } }],
      ["7000000002:" + "N".repeat(35), { setWebhook: new TelegramError(0, "Telegram didn't answer.") }, { status: 502, body: { error: "Telegram didn't take the bot's webhook. Try again in a minute." } }],
    ] as const) {
      const { db, bots } = fakeDb([], [{ ...mine }]);
      expect(await runReplaceBot(db, clients(o).client, UID, "me", token, HOOK), token).toEqual(want);
      expect(bots[0]).toMatchObject({ token: OWN, status: "revoked" });
    }
    expect((await runReplaceBot(fakeDb().db, clients().client, UID, "me", "7000000002:" + "N".repeat(35), HOOK)).status).toBe(404);
  });

  it("reads bot-add and bot-remove, and never keeps a token in a parse error", () => {
    expect(parseRequest({ action: "bot-replace", profileId: "me", token: OWN })).toEqual({ ok: true, req: { action: "bot-replace", profileId: "me", token: OWN } });
    expect(parseRequest({ action: "bot-add", profileId: "me", token: OWN })).toEqual({ ok: true, req: { action: "bot-add", profileId: "me", token: OWN } });
    expect(parseRequest({ action: "bot-remove", profileId: "me" })).toEqual({ ok: true, req: { action: "bot-remove", profileId: "me" } });
    expect(parseRequest({ action: "bot-add", profileId: "../x", token: OWN })).toMatchObject({ ok: false, status: 404 });
    expect(JSON.stringify(parseRequest({ action: "bot-add", profileId: "../x", token: OWN }))).not.toContain(OWN);
  });
});
