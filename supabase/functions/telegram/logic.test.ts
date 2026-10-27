import { describe, expect, it } from "vitest";
import { TelegramError, hashCode, type Bot } from "../_shared/telegram";
import { CODE_MINUTES, parseRequest, runDisconnect, runPresign, runSchedule, runStart, type FnDb, type OwnRow } from "./logic";

const UID = "6d80f027-3395-480c-86a1-8827d3d6cce3";
const OTHER_UID = "7e57c0de-0000-4000-8000-0000000000d2";
const ROW = "00000000-0000-4000-8000-0000000000c1";
const ROW2 = "00000000-0000-4000-8000-0000000000c2";
const KEY = "00000000-0000-4000-8000-00000000000a";
const sg = (wall: string) => Date.parse(`${wall}+08:00`);
const NOW = sg("2026-11-02T10:00:00");
const MB = 1024 * 1024;
const pic = (uid = UID, profile = "me", ext = "jpg") => `${uid}/${profile}/00000000-0000-4000-8000-000000000001.${ext}`;

interface Post { owner_id: string; client_key: string; chat_row: string; send_at: string; text: string; media: string[]; status: string; error?: string }

function fakeDb(rows: (OwnRow & { owner_id: string; profile_id: string })[] = []) {
  const inserted: Record<string, unknown>[] = [];
  const posts: Post[] = [];
  const db: FnDb = {
    async insertConnect(r) {
      inserted.push(r);
      return { id: ROW };
    },
    async ownRow(uid, profileId, id) {
      return rows.find((r) => r.owner_id === uid && r.profile_id === profileId && r.id === id) ?? null;
    },
    async liveElsewhere(chatId, except) {
      return rows.some((r) => r.chat_id === chatId && r.id !== except && r.status === "connected");
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
    async postsFor(uid, key, ids) {
      return posts.filter((p) => p.owner_id === uid && p.client_key === key && ids.includes(p.chat_row)).map((p) => ({ id: `${p.chat_row}:post`, chat_row: p.chat_row, send_at: p.send_at, status: p.status }));
    },
  };
  return { db, inserted, posts, rows };
}

const leoRow = (o: Partial<OwnRow & { owner_id: string; profile_id: string }> = {}) => ({ id: ROW, owner_id: UID, profile_id: "me", chat_id: -1001234567890, status: "connected" as const, ...o });

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
    expect(parseRequest({ action: "start", profileId: "me" })).toEqual({ ok: true, req: { action: "start", profileId: "me" } });
    expect(parseRequest({ action: "status", profileId: "me" })).toMatchObject({ ok: false, status: 400 });
    expect(parseRequest({ action: "start", profileId: "../x" })).toMatchObject({ ok: false, status: 404 });
    expect(parseRequest({ action: "disconnect", profileId: "me", chatRow: "1 or 1=1" })).toMatchObject({ ok: false, status: 404 });
  });

  it("holds files to Telegram's limits: pictures to 5 MB, one MP4 video to 20 MB, ten at most, never mixed", () => {
    const presign = (files: unknown) => parseRequest({ action: "presign", profileId: "me", files });
    expect(presign([{ type: "video/mp4", size: 20 * MB }])).toMatchObject({ ok: true });
    expect(presign([{ type: "video/mp4", size: 20 * MB + 1 }])).toEqual({ ok: false, status: 400, error: "Telegram takes videos up to 20 MB from Content Studio. Post a shorter one, or send it in Telegram." });
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
  it("stores only the code's hash, for 15 minutes, and links to the bot with the code", async () => {
    const { db, inserted } = fakeDb();
    const out = await runStart(db, UID, "me", "cs_test_bot", NOW);
    expect(out.status).toBe(200);
    const { rowId, link, expiresAt } = out.body as { rowId: string; link: string; expiresAt: string };
    const code = /^https:\/\/t\.me\/cs_test_bot\?start=([A-Za-z0-9_-]{32,64})$/.exec(link)![1];
    expect(rowId).toBe(ROW);
    expect(expiresAt).toBe(new Date(NOW + CODE_MINUTES * 60_000).toISOString());
    expect(CODE_MINUTES).toBe(15);
    expect(inserted).toEqual([{ owner_id: UID, profile_id: "me", code_hash: await hashCode(code), code_expires_at: expiresAt }]);
    expect(JSON.stringify(inserted)).not.toContain(code);
  });

  it("makes a new code every time", async () => {
    const { db } = fakeDb();
    const a = (await runStart(db, UID, "me", "cs_test_bot", NOW)).body.link;
    const b = (await runStart(db, UID, "me", "cs_test_bot", NOW)).body.link;
    expect(a).not.toBe(b);
  });
});

describe("disconnect", () => {
  it("makes the bot leave, marks the row disconnected and cancels its waiting posts", async () => {
    const { db, rows, posts } = fakeDb([leoRow()]);
    posts.push({ owner_id: UID, client_key: KEY, chat_row: ROW, send_at: "", text: "x", media: [], status: "scheduled" }, { owner_id: UID, client_key: KEY, chat_row: ROW, send_at: "", text: "y", media: [], status: "posted" });
    const { bot, calls } = stubBot();
    const out = await runDisconnect(db, bot, UID, "me", ROW, NOW);
    expect(out).toEqual({ status: 200, body: { disconnected: true, cancelled: 1 } });
    expect(calls).toEqual([{ method: "leaveChat", params: { chat_id: -1001234567890 } }]);
    expect(rows[0].status).toBe("disconnected");
    expect(posts.map((p) => [p.status, p.error])).toEqual([["cancelled", "Disconnected"], ["posted", undefined]]);
  });

  it("is a 404 for a row that isn't the caller's, in this brand, and nothing happens", async () => {
    for (const [uid, profile] of [[OTHER_UID, "me"], [UID, "pother"]]) {
      const { db, rows } = fakeDb([leoRow()]);
      const { bot, calls } = stubBot();
      expect((await runDisconnect(db, bot, uid, profile, ROW, NOW)).status).toBe(404);
      expect(calls).toEqual([]);
      expect(rows[0].status).toBe("connected");
    }
  });

  it("keeps the bot in a chat another brand still posts to", async () => {
    const { db, rows } = fakeDb([leoRow(), leoRow({ id: ROW2, profile_id: "pother" })]);
    const { bot, calls } = stubBot();
    await runDisconnect(db, bot, UID, "me", ROW, NOW);
    expect(calls).toEqual([]);
    expect(rows.map((r) => r.status)).toEqual(["disconnected", "connected"]);
  });

  it("disconnects when the bot is already out, and changes nothing when Telegram can't be reached", async () => {
    const gone = fakeDb([leoRow()]);
    expect((await runDisconnect(gone.db, stubBot(() => new TelegramError(403, "Forbidden: bot is not a member of the supergroup chat")).bot, UID, "me", ROW, NOW)).status).toBe(200);
    expect(gone.rows[0].status).toBe("disconnected");
    const down = fakeDb([leoRow()]);
    const out = await runDisconnect(down.db, stubBot(() => new TelegramError(0, "Telegram didn't answer.")).bot, UID, "me", ROW, NOW);
    expect(out).toMatchObject({ status: 502 });
    expect(down.rows[0].status).toBe("connected");
  });

  it("cancels a waiting connect without calling Telegram", async () => {
    const { db, rows } = fakeDb([leoRow({ chat_id: null, status: "pending" })]);
    const { bot, calls } = stubBot();
    expect((await runDisconnect(db, bot, UID, "me", ROW, NOW)).status).toBe(200);
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
