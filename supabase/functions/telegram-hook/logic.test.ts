// The hook's updates through logic.ts with Telegram's documented JSON (fixtures/) and no network: the bot is stubbed
// from the fixtures' answers and the database is an in-memory stand-in with the same rules as index.ts's queries.
import { describe, expect, it } from "vitest";
import { TelegramError, hashCode, type Bot } from "../_shared/telegram";
import { COPY, eventOf, gateOf, handleUpdate, type ChatRow, type HookDb, type TiedChat } from "./logic";
import start from "./fixtures/update-start.json";
import startNoCode from "./fixtures/update-start-no-code.json";
import startOther from "./fixtures/update-start-other-user.json";
import sharedGroup from "./fixtures/update-chat-shared-group.json";
import sharedChannel from "./fixtures/update-chat-shared-channel.json";
import sharedOther from "./fixtures/update-chat-shared-other-user.json";
import adminGroup from "./fixtures/update-my-chat-member-admin-group.json";
import adminChannel from "./fixtures/update-my-chat-member-admin-channel.json";
import memberGroup from "./fixtures/update-my-chat-member-member-group.json";
import demotedChannel from "./fixtures/update-my-chat-member-demoted-channel.json";
import kicked from "./fixtures/update-my-chat-member-kicked.json";
import left from "./fixtures/update-my-chat-member-left.json";
import blocked from "./fixtures/update-my-chat-member-blocked-private.json";
import hereTopic from "./fixtures/update-here-topic.json";
import hereGeneral from "./fixtures/update-here-general.json";
import hereOther from "./fixtures/update-here-other-user.json";
import migrate from "./fixtures/update-migrate.json";
import chatter from "./fixtures/update-private-chatter.json";
import groupChatter from "./fixtures/update-group-chatter.json";
import getGroup from "./fixtures/api-get-chat-group.json";
import getChannel from "./fixtures/api-get-chat-channel.json";
import botAdmin from "./fixtures/api-member-bot-admin.json";
import botChannelAdmin from "./fixtures/api-member-bot-channel-admin.json";
import botChannelNoPost from "./fixtures/api-member-bot-channel-no-post.json";
import botMember from "./fixtures/api-member-bot-member.json";
import userCreator from "./fixtures/api-member-user-creator.json";
import userAdmin from "./fixtures/api-member-user-admin.json";
import userMember from "./fixtures/api-member-user-member.json";
import sendOk from "./fixtures/api-send-message.json";
import yes from "./fixtures/update-callback-yes.json";
import no from "./fixtures/update-callback-no.json";
import yesOther from "./fixtures/update-callback-yes-other-user.json";

const CODE = "Abc_DEF-123456789012345678901234";
const NOW = Date.parse("2026-11-02T10:00:00+08:00");
const LEO = 111000111;
const OTHER = 222000222;
const BOT_ID = 7000000001;
const GROUP = -1001234567890;
const CHANNEL = -1009876543210;
const OWNER = "7e57c0de-0000-4000-8000-0000000000d1";
const iso = (ms: number) => new Date(ms).toISOString();

// ---- stand-ins ----

interface Post { id: string; chat_row: string; status: string; error?: string }

function fakeDb(rows: ChatRow[], posts: Post[] = []) {
  const live = (r: ChatRow, now: string) => r.status === "pending" && r.code_expires_at > now;
  const db: HookDb = {
    async claimCode(hash, user, name, now) {
      const r = rows.find((x) => x.code_hash === hash && live(x, now) && (x.tg_user_id === null || x.tg_user_id === user));
      if (!r) return null;
      Object.assign(r, { tg_user_id: user, tg_user_name: name });
      return { ...r };
    },
    async confirm(id, user, now) {
      const r = rows.find((x) => x.id === id && x.tg_user_id === user && live(x, now));
      if (!r) return null;
      r.confirmed_at = now;
      return { ...r };
    },
    async cancelCode(id, user, now) {
      const r = rows.find((x) => x.id === id && x.tg_user_id === user && x.status === "pending");
      if (r) r.status = "disconnected";
      return !!r;
    },
    async startedFor(user, now) {
      return rows.filter((x) => x.tg_user_id === user && live(x, now)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
    },
    async tie(row, chat: TiedChat, now) {
      const r = rows.find((x) => x.id === row.id);
      if (!r || r.status !== "pending") return false;
      for (const old of rows.filter((x) => x.status === "connected" && x.owner_id === r.owner_id && x.profile_id === r.profile_id && x.chat_id === chat.chat_id)) {
        old.status = "disconnected";
        for (const p of posts) if (p.chat_row === old.id && p.status === "scheduled") p.chat_row = r.id;
      }
      Object.assign(r, chat, { status: "connected", refusal: null, connected_at: now });
      return true;
    },
    async refuse(id, title, refusal) {
      Object.assign(rows.find((x) => x.id === id)!, { title, refusal });
    },
    async rowsOfChat(chatId, statuses) {
      return rows.filter((x) => x.chat_id === chatId && statuses.includes(x.status));
    },
    async markChat(ids, status, reason) {
      for (const r of rows) if (ids.includes(r.id)) r.status = status;
      for (const p of posts) if (ids.includes(p.chat_row) && p.status === "scheduled") Object.assign(p, { status: "cancelled", error: reason });
    },
    async setTopic(ids, topicId, topicName) {
      for (const r of rows) if (ids.includes(r.id)) Object.assign(r, { topic_id: topicId, topic_name: topicName });
    },
    async migrate(from, to) {
      for (const r of rows) if (r.chat_id === from) Object.assign(r, { chat_id: to, chat_type: "supergroup" });
    },
  };
  return { db, rows, posts };
}

const row = async (o: Partial<ChatRow> = {}): Promise<ChatRow> => ({
  id: "00000000-0000-4000-8000-0000000000c1",
  owner_id: OWNER,
  profile_id: "me",
  code_hash: await hashCode(CODE),
  code_expires_at: iso(NOW + 10 * 60_000),
  tg_user_id: null,
  chat_id: null,
  chat_type: null,
  title: null,
  username: null,
  is_forum: false,
  topic_id: null,
  topic_name: null,
  status: "pending",
  refusal: null,
  created_at: iso(NOW - 5 * 60_000),
  brand_name: "MoneyBees",
  account_email: "leo@example.com",
  tg_user_name: null,
  confirmed_at: null,
  ...o,
});
/** Leo tapped Start and Yes a minute ago: the picker is up. */
const confirmed = (o: Partial<ChatRow> = {}) => row({ tg_user_id: LEO, tg_user_name: "@leo_test", confirmed_at: iso(NOW - 60_000), ...o });

type Answer = { ok: boolean; result: unknown } | TelegramError;
const NOT_THERE = new TelegramError(400, "Bad Request: member not found");

function stubBot(members: Record<string, Answer> = {}, chats: Record<number, Answer> = { [GROUP]: getGroup, [CHANNEL]: getChannel }, sendFails = false) {
  const sent: { method: string; params: Record<string, unknown> }[] = [];
  const answer = (a: Answer | undefined, fallback: TelegramError) => {
    const x = a ?? fallback;
    if (x instanceof TelegramError) throw x;
    return x.result;
  };
  const bot: Bot = {
    id: BOT_ID,
    async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
      sent.push({ method, params });
      if (method === "getChat") return answer(chats[params.chat_id as number], new TelegramError(400, "Bad Request: chat not found")) as T;
      if (method === "getChatMember") return answer(members[`${params.chat_id}:${params.user_id}`], NOT_THERE) as T;
      if (method === "answerCallbackQuery" || method === "editMessageReplyMarkup") return true as T;
      if (method === "sendMessage") {
        if (sendFails) throw new TelegramError(403, "Forbidden: bot was blocked by the user");
        return sendOk.result as T;
      }
      throw new Error(`unexpected ${method}`);
    },
  };
  const replies = () => sent.filter((s) => s.method === "sendMessage").map((s) => s.params);
  return { bot, sent, replies };
}

/** The usual good case: Leo created the group and the bot is an admin there; Leo admins the channel, where the bot can post. */
const GOOD = {
  [`${GROUP}:${LEO}`]: userCreator,
  [`${GROUP}:${BOT_ID}`]: botAdmin,
  [`${CHANNEL}:${LEO}`]: userAdmin,
  [`${CHANNEL}:${BOT_ID}`]: botChannelAdmin,
};

const run = (update: unknown, db: HookDb, bot: Bot, now = NOW) => handleUpdate(update, { db, bot, botUsername: "cs_test_bot", now });

// ---- the gate ----

describe("the hook's gate", () => {
  const env = { hook: "hook-secret-for-tests", cron: "cron-secret-for-tests" };
  const h = (o: Record<string, string>) => new Headers(o);

  it("takes an update only with Telegram's secret header, and a tick only with the cron secret", async () => {
    expect(await gateOf(h({ "x-telegram-bot-api-secret-token": env.hook }), env)).toBe("update");
    expect(await gateOf(h({ "x-telegram-cron-secret": env.cron }), env)).toBe("tick");
  });

  it("refuses a wrong, missing or swapped secret, and everything while a secret is unset", async () => {
    for (const headers of [{}, { "x-telegram-bot-api-secret-token": "wrong" }, { "x-telegram-bot-api-secret-token": env.cron }, { "x-telegram-cron-secret": env.hook }, { "x-telegram-cron-secret": "" }, { "x-telegram-bot-api-secret-token": env.hook.slice(0, -1) }]) {
      expect(await gateOf(h(headers), env), JSON.stringify(headers)).toBeNull();
    }
    expect(await gateOf(h({ "x-telegram-bot-api-secret-token": "" }), { hook: "", cron: env.cron })).toBeNull();
    expect(await gateOf(h({ "x-telegram-bot-api-secret-token": "x" }), { cron: env.cron })).toBeNull();
    expect(await gateOf(h({ "x-telegram-cron-secret": "" }), { hook: env.hook })).toBeNull();
  });
});

// ---- reading updates ----

describe("every update shape", () => {
  it.each([
    ["/start <code>", start, { kind: "start", user: LEO, code: CODE, name: "@leo_test" }],
    ["/start alone", startNoCode, { kind: "start", user: LEO, code: null }],
    ["chat_shared", sharedGroup, { kind: "shared", user: LEO, chatId: GROUP, title: "Test group" }],
    ["my_chat_member", adminGroup, { kind: "member", user: LEO, chatId: GROUP }],
    ["/here@bot in a topic", hereTopic, { kind: "here", user: LEO, chatId: GROUP, topicId: 326, topicName: "Feature updates" }],
    ["/here in General", hereGeneral, { kind: "here", user: LEO, chatId: GROUP, topicId: null, topicName: null }],
    ["migrate_to_chat_id", migrate, { kind: "migrate", from: -4001234567, to: -1005550001111 }],
    ["a private message", chatter, { kind: "chatter", user: OTHER }],
    ["a group message", groupChatter, { kind: "ignore" }],
    ["the bot blocked in a private chat", blocked, { kind: "ignore" }],
    ["Yes", yes, { kind: "answer", user: LEO, yes: true, rowId: "00000000-0000-4000-8000-0000000000c1", queryId: "4382bfdwdsb323b2d9", chatId: LEO, messageId: 20 }],
    ["No", no, { kind: "answer", user: LEO, yes: false, rowId: "00000000-0000-4000-8000-0000000000c1" }],
    ["a button answer with other data", { callback_query: { ...yes.callback_query, data: "yes:not-a-row" } }, { kind: "ignore" }],
    ["junk", { update_id: 1, edited_message: {} }, { kind: "ignore" }],
    ["not an object", "hello", { kind: "ignore" }],
  ])("reads %s", (_name, update, want) => {
    expect(eventOf(update, "cs_test_bot")).toMatchObject(want);
  });

  it("ignores ids that aren't whole numbers, which would otherwise reach a query filter", () => {
    const shared = structuredClone(sharedGroup) as { message: { chat_shared: { chat_id: unknown } } };
    shared.message.chat_shared.chat_id = "1,tg_user_id.not.is.null";
    expect(eventOf(shared, "cs_test_bot")).toEqual({ kind: "ignore" });
    const member = structuredClone(adminGroup) as { my_chat_member: { from: { id: unknown } } };
    member.my_chat_member.from.id = 1.5;
    expect(eventOf(member, "cs_test_bot")).toEqual({ kind: "ignore" });
    const startX = structuredClone(start) as { message: { from: { id: unknown } } };
    startX.message.from.id = "111000111";
    expect(eventOf(startX, "cs_test_bot")).toEqual({ kind: "ignore" });
  });

  it("ignores a /here or /start meant for another bot, and a code with characters Telegram never sends", () => {
    const other = structuredClone(hereTopic);
    other.message.text = "/here@another_bot";
    expect(eventOf(other, "cs_test_bot")).toEqual({ kind: "ignore" });
    const bad = structuredClone(start);
    bad.message.text = "/start abc<script>";
    expect(eventOf(bad, "cs_test_bot")).toMatchObject({ kind: "start", code: null });
  });
});

// ---- connecting ----

describe("/start with the one-time code", () => {
  it("ties the Telegram user to the code and asks whether the named brand and account are theirs, with no picker yet", async () => {
    const { db, rows } = fakeDb([await row()]);
    const { bot, replies } = stubBot(GOOD);
    await run(start, db, bot);
    expect(rows[0]).toMatchObject({ tg_user_id: LEO, tg_user_name: "@leo_test", confirmed_at: null });
    const [reply] = replies();
    expect(reply).toEqual({
      chat_id: LEO,
      text: "This connects Telegram to MoneyBees in the Content Studio account leo@example.com. Is this your Content Studio account?",
      reply_markup: { inline_keyboard: [[{ text: "Yes", callback_data: `yes:${rows[0].id}` }, { text: "No", callback_data: `no:${rows[0].id}` }]] },
    });
    expect(JSON.stringify(reply)).not.toContain("request_chat");
  });

  it("names the account alone when the brand has no name", async () => {
    const { db } = fakeDb([await row({ brand_name: null })]);
    const { bot, replies } = stubBot(GOOD);
    await run(start, db, bot);
    expect(replies()[0].text).toBe(COPY.confirm(null, "leo@example.com"));
    expect(COPY.confirm(null, "leo@example.com")).toBe("This connects Telegram to the Content Studio account leo@example.com. Is this your Content Studio account?");
  });

  it("refuses the same code from another Telegram user", async () => {
    const { db, rows } = fakeDb([await row({ tg_user_id: LEO })]);
    const { bot, replies } = stubBot(GOOD);
    await run(startOther, db, bot);
    expect(rows[0].tg_user_id).toBe(LEO);
    expect(replies()).toEqual([expect.objectContaining({ chat_id: OTHER, text: COPY.expired })]);
  });

  it("refuses an expired code, and one already connected", async () => {
    for (const r of [await row({ code_expires_at: iso(NOW - 1) }), await row({ status: "connected", chat_id: GROUP, tg_user_id: LEO })]) {
      const { db, rows } = fakeDb([r]);
      const { bot, replies } = stubBot(GOOD);
      await run(start, db, bot);
      expect(rows[0].status === "pending" ? rows[0].tg_user_id : "kept").toBe(r.status === "pending" ? null : "kept");
      expect(replies().map((x) => x.text)).toEqual([COPY.expired]);
    }
  });

  it("answers a bare /start with what the bot is for", async () => {
    const { db } = fakeDb([await row()]);
    const { bot, replies } = stubBot(GOOD);
    await run(startNoCode, db, bot);
    expect(replies().map((x) => x.text)).toEqual([COPY.chatter]);
  });
});

describe("Yes or No: is this your Content Studio account?", () => {
  it("on Yes from the person who started, confirms and only then offers Telegram's own group and channel pickers", async () => {
    const { db, rows } = fakeDb([await row({ tg_user_id: LEO })]);
    const { bot, replies, sent } = stubBot(GOOD);
    await run(yes, db, bot);
    expect(rows[0].confirmed_at).toBe(iso(NOW));
    expect(sent.slice(0, 2)).toEqual([
      { method: "answerCallbackQuery", params: { callback_query_id: "4382bfdwdsb323b2d9" } },
      { method: "editMessageReplyMarkup", params: { chat_id: LEO, message_id: 20, reply_markup: { inline_keyboard: [] } } },
    ]);
    const [reply] = replies();
    expect(reply.chat_id).toBe(LEO);
    expect(reply.text).toContain(COPY.pick);
    expect(reply.text).toContain("https://t.me/cs_test_bot?startgroup&admin=manage_chat");
    expect(reply.text).toContain("https://t.me/cs_test_bot?startchannel&admin=post_messages");
    expect(reply.parse_mode).toBeUndefined();
    const [[group, channel]] = (reply.reply_markup as { keyboard: { text: string; request_chat: Record<string, unknown> }[][] }).keyboard;
    expect(group).toMatchObject({ text: "Pick a group", request_chat: { request_id: 1, chat_is_channel: false, request_title: true, bot_administrator_rights: { can_manage_chat: true } } });
    expect(channel).toMatchObject({ text: "Pick a channel", request_chat: { request_id: 2, chat_is_channel: true, bot_administrator_rights: { can_post_messages: true } } });
  });

  it("on No, cancels the code: no picker, and nothing can be tied with it afterwards", async () => {
    const { db, rows } = fakeDb([await row({ tg_user_id: LEO })]);
    const { bot, replies } = stubBot(GOOD);
    await run(no, db, bot);
    expect(rows[0]).toMatchObject({ status: "disconnected", confirmed_at: null });
    expect(replies().map((x) => x.text)).toEqual([COPY.cancelled]);
    await run(yes, db, bot);
    await run(adminGroup, db, bot);
    await run(sharedGroup, db, bot);
    expect(rows[0]).toMatchObject({ status: "disconnected", confirmed_at: null, chat_id: null });
    expect(replies().map((x) => x.text)).toEqual([COPY.cancelled, COPY.expired, COPY.expired]);
  });

  it("ignores a Yes for someone else's code: a different Telegram user can't confirm it", async () => {
    const { db, rows } = fakeDb([await row({ tg_user_id: LEO })]);
    const { bot, replies } = stubBot(GOOD);
    await run(yesOther, db, bot);
    expect(rows[0].confirmed_at).toBeNull();
    expect(replies()).toEqual([expect.objectContaining({ chat_id: OTHER, text: COPY.expired })]);
  });

  it("ties nothing from the bot being made an admin, or a shared chat, before Yes", async () => {
    for (const update of [adminGroup, adminChannel, sharedGroup, sharedChannel]) {
      const { db, rows } = fakeDb([await row({ tg_user_id: LEO })]);
      await run(update, db, stubBot(GOOD).bot);
      expect(rows[0]).toMatchObject({ status: "pending", chat_id: null });
    }
  });

  it("ties nothing for a different Telegram user than the one who said Yes, even an admin of the chat", async () => {
    const theirs = structuredClone(adminGroup);
    theirs.my_chat_member.from = { id: OTHER, is_bot: false, first_name: "Someone", language_code: "en" } as typeof theirs.my_chat_member.from;
    const { db, rows } = fakeDb([await confirmed()]);
    const { bot } = stubBot({ ...GOOD, [`${GROUP}:${OTHER}`]: userCreator });
    await run(theirs, db, bot);
    await run(sharedOther, db, bot);
    expect(rows[0]).toMatchObject({ status: "pending", chat_id: null });
  });

  it("ties nothing once the code's 15 minutes are up, even after Yes", async () => {
    const { db, rows } = fakeDb([await confirmed({ code_expires_at: iso(NOW - 1) })]);
    await run(adminGroup, db, stubBot(GOOD).bot);
    expect(rows[0]).toMatchObject({ status: "pending", chat_id: null });
  });
});

describe("tying the picked chat", () => {
  it("ties a forum group Leo created, where the bot is an admin, and says posts go to General", async () => {
    const { db, rows } = fakeDb([await confirmed()]);
    const { bot, replies } = stubBot(GOOD);
    await run(sharedGroup, db, bot);
    expect(rows[0]).toMatchObject({ status: "connected", chat_id: GROUP, chat_type: "supergroup", title: "Test group", is_forum: true, refusal: null });
    const [reply] = replies();
    expect(reply.text).toBe(`${COPY.connected("Test group")}\n\n${COPY.forum("Test group")}`);
    expect(reply.reply_markup).toEqual({ remove_keyboard: true });
  });

  it("ties a channel where the bot can post", async () => {
    const { db, rows } = fakeDb([await confirmed()]);
    const { bot, replies } = stubBot(GOOD);
    await run(sharedChannel, db, bot);
    expect(rows[0]).toMatchObject({ status: "connected", chat_id: CHANNEL, chat_type: "channel", username: "cs_test_channel", is_forum: false });
    expect(replies().map((x) => x.text)).toEqual([COPY.connected("Test channel")]);
  });

  it("ties a chat the bot was made an admin of through the plain links, as the same rule", async () => {
    for (const [update, chatId] of [[adminGroup, GROUP], [adminChannel, CHANNEL]] as const) {
      const { db, rows } = fakeDb([await confirmed()]);
      const { bot } = stubBot(GOOD);
      await run(update, db, bot);
      expect(rows[0]).toMatchObject({ status: "connected", chat_id: chatId });
    }
  });

  it("ties once when Telegram sends both the shared chat and the bot's new membership", async () => {
    const { db, rows } = fakeDb([await confirmed()]);
    const { bot, replies } = stubBot(GOOD);
    await run(adminGroup, db, bot);
    await run(sharedGroup, db, bot);
    expect(rows[0].status).toBe("connected");
    expect(replies()).toHaveLength(1);
  });

  it("ties nothing for another Telegram user, who has no started connect", async () => {
    const { db, rows } = fakeDb([await confirmed()]);
    const { bot, replies } = stubBot({ ...GOOD, [`${GROUP}:${OTHER}`]: userCreator });
    await run(sharedOther, db, bot);
    expect(rows[0]).toMatchObject({ status: "pending", chat_id: null });
    expect(replies()).toEqual([expect.objectContaining({ chat_id: OTHER, text: COPY.expired })]);
  });

  it("ties nothing once the 15 minutes are up", async () => {
    const { db, rows } = fakeDb([await confirmed({ code_expires_at: iso(NOW - 1) })]);
    const { bot } = stubBot(GOOD);
    await run(sharedGroup, db, bot);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].chat_id).toBeNull();
  });

  it("refuses a person who is not an admin of the chat", async () => {
    const { db, rows } = fakeDb([await confirmed()]);
    const { bot, replies } = stubBot({ ...GOOD, [`${GROUP}:${LEO}`]: userMember });
    await run(sharedGroup, db, bot);
    expect(rows[0]).toMatchObject({ status: "pending", chat_id: null, refusal: "not_admin", title: "Test group" });
    expect(replies().map((x) => x.text)).toEqual([COPY.notAdmin("Test group")]);
  });

  it("refuses a chat where the bot can't post: no posting right in a channel, a plain member, or not in it at all", async () => {
    for (const [update, members] of [
      [sharedChannel, { ...GOOD, [`${CHANNEL}:${BOT_ID}`]: botChannelNoPost }],
      [sharedGroup, { ...GOOD, [`${GROUP}:${BOT_ID}`]: botMember }],
      [sharedGroup, { [`${GROUP}:${LEO}`]: userCreator }],
      [memberGroup, { ...GOOD, [`${GROUP}:${BOT_ID}`]: botMember }],
    ] as const) {
      const { db, rows } = fakeDb([await confirmed()]);
      const { bot, replies } = stubBot(members);
      await run(update, db, bot);
      expect(rows[0]).toMatchObject({ status: "pending", chat_id: null, refusal: "cant_post" });
      expect(replies()[0].text).toMatch(/^I can't post in Test (group|channel)\. Make me an admin with Post messages, then tap Pick again\.$/);
    }
  });

  it("replaces an older live row for the same brand and chat, and moves its waiting posts", async () => {
    const old = await row({ id: "00000000-0000-4000-8000-0000000000c0", code_hash: "0".repeat(64), status: "connected", chat_id: GROUP, tg_user_id: LEO });
    const { db, rows, posts } = fakeDb([old, await confirmed()], [{ id: "p1", chat_row: old.id, status: "scheduled" }, { id: "p2", chat_row: old.id, status: "posted" }]);
    const { bot } = stubBot(GOOD);
    await run(sharedGroup, db, bot);
    expect(rows.map((r) => r.status)).toEqual(["disconnected", "connected"]);
    expect(posts).toEqual([{ id: "p1", chat_row: rows[1].id, status: "scheduled" }, { id: "p2", chat_row: old.id, status: "posted" }]);
  });

  it("keeps going when the person has blocked the bot and a reply can't be sent", async () => {
    const { db, rows } = fakeDb([await confirmed()]);
    const { bot } = stubBot(GOOD, undefined, true);
    await expect(run(sharedGroup, db, bot)).resolves.toBeTypeOf("string");
    expect(rows[0].status).toBe("connected");
  });
});

// ---- after connecting ----

describe("the bot removed, demoted, moved or pointed at a topic", () => {
  const connected = (o: Partial<ChatRow> = {}) => row({ status: "connected", tg_user_id: LEO, chat_id: GROUP, chat_type: "supergroup", title: "Test group", is_forum: true, ...o });

  it("marks a chat the bot was kicked from as removed and cancels its waiting posts with that reason", async () => {
    const other = await connected({ id: "00000000-0000-4000-8000-0000000000c9", code_hash: "9".repeat(64), chat_id: CHANNEL });
    const { db, rows, posts } = fakeDb([await connected(), other], [
      { id: "p1", chat_row: "00000000-0000-4000-8000-0000000000c1", status: "scheduled" },
      { id: "p2", chat_row: "00000000-0000-4000-8000-0000000000c1", status: "posted" },
      { id: "p3", chat_row: other.id, status: "scheduled" },
    ]);
    const { bot, replies } = stubBot(GOOD);
    await run(kicked, db, bot);
    expect(rows.map((r) => r.status)).toEqual(["removed", "connected"]);
    expect(posts.map((p) => [p.id, p.status, p.error])).toEqual([["p1", "cancelled", "Removed in Telegram"], ["p2", "posted", undefined], ["p3", "scheduled", undefined]]);
    expect(replies()).toEqual([]);
  });

  it("marks a channel the bot left as removed", async () => {
    const { db, rows } = fakeDb([await connected({ chat_id: CHANNEL, chat_type: "channel" })]);
    await run(left, db, stubBot(GOOD).bot);
    expect(rows[0].status).toBe("removed");
  });

  it("marks a channel where the bot lost its posting right as can't post, and cancels its posts", async () => {
    const { db, rows, posts } = fakeDb([await connected({ chat_id: CHANNEL, chat_type: "channel" })], [{ id: "p1", chat_row: "00000000-0000-4000-8000-0000000000c1", status: "scheduled" }]);
    await run(demotedChannel, db, stubBot(GOOD).bot);
    expect(rows[0].status).toBe("cant_post");
    expect(posts[0]).toMatchObject({ status: "cancelled", error: "Can't post here" });
  });

  it("points posts at a topic only for /here from the person who connected, and answers in private", async () => {
    const { db, rows } = fakeDb([await connected()]);
    const { bot, replies, sent } = stubBot(GOOD);
    await run(hereOther, db, bot);
    expect(rows[0].topic_id).toBeNull();
    expect(sent).toEqual([]);
    await run(hereTopic, db, bot);
    expect(rows[0]).toMatchObject({ topic_id: 326, topic_name: "Feature updates" });
    expect(replies()).toEqual([expect.objectContaining({ chat_id: LEO, text: COPY.here("Feature updates") })]);
    await run(hereGeneral, db, bot);
    expect(rows[0]).toMatchObject({ topic_id: null, topic_name: null });
  });

  it("moves a group that became a supergroup onto its new id", async () => {
    const { db, rows } = fakeDb([await connected({ chat_id: -4001234567, chat_type: "group", is_forum: false })]);
    await run(migrate, db, stubBot(GOOD).bot);
    expect(rows[0]).toMatchObject({ chat_id: -1005550001111, chat_type: "supergroup" });
  });

  it("answers anyone else who writes to the bot, and stays quiet in groups", async () => {
    const { db } = fakeDb([]);
    const { bot, replies } = stubBot(GOOD);
    await run(chatter, db, bot);
    await run(groupChatter, db, bot);
    await run(blocked, db, bot);
    expect(replies()).toEqual([{ chat_id: OTHER, text: COPY.chatter }]);
  });
});
