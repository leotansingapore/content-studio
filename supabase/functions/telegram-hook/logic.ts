// The Content Studio bot's webhook (docs/north-star/items/publish-telegram.md): reads Telegram's updates and ties a
// group or channel to the brand whose one-time code the person started. Pure: the database and the bot come in.
//
// Who may tie: /start <code> notes the first Telegram user who taps it on the code and answers only with a Confirm button
// (Telegram's login_url) back to Content Studio. That page, signed in, sends Telegram's signed login to the
// `telegram` function, which confirms the code only when the session is the account that made it and the login is
// that same Telegram user, and then shows the pickers. So a link someone else
// made and sent fails for you: you are not signed in to their account. Nothing personal is said in Telegram.
//
// The tie rule, for every path (Telegram's chat picker, or the bot made an admin through the plain links): inside an
// unexpired connect, the first chat that the verified Telegram user shares or makes the bot an admin of is tied, and
// only when the bot can post there and that person is an admin of it.

import { secretMatches } from "../social-sweep/logic.ts";
import { APP_ORIGIN } from "../social/logic.ts";
import { PICK_TEXT, TelegramError, hashCode, pickerMessage, type Bot } from "../_shared/telegram.ts";

// ---- the bot's words ----

export const COPY = {
  login: "Tap Confirm and sign in to Postmosis if it asks. Then come back here to pick your group or channel.",
  pick: PICK_TEXT,
  expired: "That link has expired. Go back to Postmosis and tap Connect Telegram again.",
  connected: (name: string) => `Connected to ${name}. Posts you schedule in Postmosis go here between 9am and 9pm.`,
  forum: (name: string) => `${name} has topics. Posts go to General. To use another, open the topic and send /here.`,
  here: (topic: string) => `Posts from Postmosis now go to the topic ${topic}.`,
  notAdmin: (name: string) => `You need to be an admin of ${name} to connect it.`,
  cantPost: (name: string) => `I can't post in ${name}. Make me an admin with Post messages, then tap Pick again.`,
  chatter: `This bot posts for Postmosis. Connect it from ${APP_ORIGIN.replace("https://", "")}/accounts.`,
};

/** Why waiting posts were cancelled, as the app shows it. */
export const REASON = { removed: "Removed in Telegram", cantPost: "Can't post here" };

// ---- the gate ----

/** Which path a request may take: an update (Telegram's secret header) or a send tick (the cron's); null reads nothing. */
export async function gateOf(headers: Headers, env: { hook?: string; cron?: string }): Promise<"update" | "tick" | null> {
  const tg = headers.get("x-telegram-bot-api-secret-token");
  if (env.hook && tg !== null && (await secretMatches(tg, env.hook))) return "update";
  const cron = headers.get("x-telegram-cron-secret");
  if (env.cron && cron !== null && (await secretMatches(cron, env.cron))) return "tick";
  return null;
}

// ---- Telegram's shapes (the fields read here) ----

type ChatType = "private" | "group" | "supergroup" | "channel";
interface TgUser { id: number; is_bot?: boolean; first_name?: string; username?: string }
interface TgChat { id: number; type: ChatType; title?: string; username?: string; is_forum?: boolean }
interface TgMember { status: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked"; can_post_messages?: boolean }
interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  chat_shared?: { request_id: number; chat_id: number; title?: string; username?: string };
  migrate_to_chat_id?: number;
  message_thread_id?: number;
  is_topic_message?: boolean;
  reply_to_message?: { forum_topic_created?: { name?: string } };
}
interface TgUpdate {
  message?: TgMessage;
  my_chat_member?: { chat: TgChat; from: TgUser; new_chat_member: TgMember };
}

export type Event =
  | { kind: "start"; user: number; code: string | null }
  | { kind: "shared"; user: number; chatId: number; title: string | null }
  | { kind: "member"; user: number; chatId: number; chat: TgChat; member: TgMember }
  | { kind: "here"; user: number; chatId: number; topicId: number | null; topicName: string | null }
  | { kind: "migrate"; from: number; to: number }
  | { kind: "chatter"; user: number }
  | { kind: "ignore" };

const IGNORE: Event = { kind: "ignore" };
// Telegram's deep-link parameter: A-Z, a-z, 0-9, _ and -, up to 64 characters
const CODE_RE = /^[A-Za-z0-9_-]{1,64}$/;
const clean = (s: string, max: number) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);

// ids reach query filters: only whole numbers Telegram could send (52 bits) get through
const isId = (v: unknown): v is number => Number.isSafeInteger(v);

export function eventOf(u: unknown, botUsername: string): Event {
  if (!u || typeof u !== "object") return IGNORE;
  const up = u as TgUpdate;
  const m = up.my_chat_member;
  if (m?.chat && m.from && m.new_chat_member) {
    if (!isId(m.chat.id) || !isId(m.from.id)) return IGNORE;
    // a private chat's my_chat_member is the person blocking or unblocking the bot
    return m.chat.type === "private" ? IGNORE : { kind: "member", user: m.from.id, chatId: m.chat.id, chat: m.chat, member: m.new_chat_member };
  }
  const msg = up.message;
  if (!msg?.chat || !msg.from || msg.from.is_bot || !isId(msg.chat.id) || !isId(msg.from.id)) return IGNORE;
  if (isId(msg.migrate_to_chat_id)) return { kind: "migrate", from: msg.chat.id, to: msg.migrate_to_chat_id };
  const text = typeof msg.text === "string" ? msg.text.trim() : "";
  const command = (name: string): string | null => {
    const c = new RegExp(`^/${name}(?:@([A-Za-z0-9_]+))?(?:\\s+([\\s\\S]*))?$`).exec(text);
    if (!c || (c[1] && c[1].toLowerCase() !== botUsername.toLowerCase())) return null;
    return (c[2] ?? "").trim();
  };
  if (msg.chat.type === "private") {
    if (msg.chat_shared) return !isId(msg.chat_shared.chat_id) ? IGNORE : { kind: "shared", user: msg.from.id, chatId: msg.chat_shared.chat_id, title: msg.chat_shared.title ?? null };
    const code = command("start");
    if (code !== null) return { kind: "start", user: msg.from.id, code: CODE_RE.test(code) ? code : null };
    return { kind: "chatter", user: msg.from.id };
  }
  if ((msg.chat.type === "group" || msg.chat.type === "supergroup") && command("here") !== null) {
    const inTopic = msg.is_topic_message === true && isId(msg.message_thread_id) && msg.message_thread_id > 0;
    const name = msg.reply_to_message?.forum_topic_created?.name;
    return {
      kind: "here",
      user: msg.from.id,
      chatId: msg.chat.id,
      topicId: inTopic ? msg.message_thread_id! : null,
      topicName: inTopic && name ? clean(name, 128) : null,
    };
  }
  return IGNORE;
}

// ---- the database, as index.ts provides it ----

export interface ChatRow {
  id: string;
  owner_id: string;
  profile_id: string;
  code_hash: string;
  code_expires_at: string;
  tg_user_id: number | null;
  chat_id: number | null;
  chat_type: "group" | "supergroup" | "channel" | null;
  title: string | null;
  username: string | null;
  is_forum: boolean;
  topic_id: number | null;
  topic_name: string | null;
  status: "pending" | "connected" | "cant_post" | "removed" | "disconnected";
  refusal: "not_admin" | "cant_post" | null;
  created_at: string;
  /** The Telegram user Telegram's signed login proved, as the app shows "Added by"; set by `telegram` verify. */
  tg_user_name: string | null;
  /** When that login was verified for the account that made the code; nothing is tied before it. */
  confirmed_at: string | null;
}

export type TiedChat = Pick<ChatRow, "title" | "username" | "is_forum"> & { chat_id: number; chat_type: "group" | "supergroup" | "channel" };

export interface HookDb {
  /**
   * Notes the Telegram user on the pending, unexpired connect with this code's hash, unless another Telegram user
   * tapped Start with it first; null otherwise. (A blocked owner presses Connect Telegram again: `telegram` start
   * cancels the brand's waiting code and makes a fresh one.)
   */
  startCode(codeHash: string, tgUser: number, now: string): Promise<ChatRow | null>;
  /** The newest unexpired confirmed connect of this Telegram user (confirmed filtered before the newest is taken), or null. */
  startedFor(tgUser: number, now: string): Promise<ChatRow | null>;
  /**
   * Ties a pending row to the chat; false when it is no longer pending (another update tied it first). An older live
   * row of the same brand and chat is replaced: it turns disconnected and its waiting posts move to this row.
   */
  tie(row: ChatRow, chat: TiedChat, now: string): Promise<boolean>;
  refuse(rowId: string, title: string, refusal: "not_admin" | "cant_post"): Promise<void>;
  rowsOfChat(chatId: number, statuses: ChatRow["status"][]): Promise<ChatRow[]>;
  /** Sets the rows' status and cancels their waiting posts with the reason. */
  markChat(rowIds: string[], status: "removed" | "cant_post", reason: string, now: string): Promise<void>;
  setTopic(rowIds: string[], topicId: number | null, topicName: string | null): Promise<void>;
  migrate(from: number, to: number): Promise<void>;
}

export interface HookDeps {
  db: HookDb;
  bot: Bot;
  botUsername: string;
  now: number;
}

// ---- handling ----

/** Who may connect a chat: its creator, or an admin; in a channel, an admin who can post there. */
const canConnect = (m: TgMember | null, type: ChatType) =>
  m?.status === "creator" || (m?.status === "administrator" && (type !== "channel" || m.can_post_messages === true));
/** The bot posts only as an admin, and in a channel only with Post messages. */
export const botCanPost = (m: TgMember | null, type: ChatType) => m?.status === "administrator" && (type !== "channel" || m.can_post_messages === true);

/** Reads one update and acts on it. Answers a short outcome for the log, which never names a person or a chat. */
export async function handleUpdate(update: unknown, d: HookDeps): Promise<string> {
  const e = eventOf(update, d.botUsername);
  const now = new Date(d.now).toISOString();
  // A reply that can't go (the person blocked the bot) changes nothing else.
  const say = (chatId: number, text: string, extra: Record<string, unknown> = {}) =>
    d.bot.call("sendMessage", { chat_id: chatId, text, ...extra }).then(
      () => undefined,
      (err) => console.warn("telegram-hook reply failed", err instanceof TelegramError ? err.status : "error"),
    );

  switch (e.kind) {
    case "start": {
      if (!e.code) {
        await say(e.user, COPY.chatter);
        return "start:bare";
      }
      const r = await d.db.startCode(await hashCode(e.code), e.user, now);
      if (!r) {
        await say(e.user, COPY.expired);
        return "start:refused";
      }
      if (r.confirmed_at) {
        // already verified as this Telegram user (a second tap on the link): the pickers again
        const m = pickerMessage(d.botUsername);
        await say(e.user, m.text, { reply_markup: m.reply_markup });
        return "start:pick";
      }
      // Telegram opens this with its signed login added; /accounts sends it to `telegram` verify, signed in
      await say(e.user, COPY.login, { reply_markup: { inline_keyboard: [[{ text: "Confirm", login_url: { url: `${APP_ORIGIN}/accounts?telegram=${r.id}` } }]] } });
      return "start:login";
    }
    case "shared": {
      const r = confirmedOnly(await d.db.startedFor(e.user, now));
      if (r) return tie(d, r, e.user, e.chatId, e.title, now, say);
      // the same pick arriving after my_chat_member already tied it is not an expired link
      const tied = (await d.db.rowsOfChat(e.chatId, ["connected"])).some((x) => x.tg_user_id === e.user);
      if (!tied) await say(e.user, COPY.expired);
      return "shared:none";
    }
    case "member": {
      const { status } = e.member;
      if (status === "left" || status === "kicked") {
        await markGone(d, e.chatId, "removed", now);
        return "member:removed";
      }
      const r = confirmedOnly(await d.db.startedFor(e.user, now));
      if (botCanPost(e.member, e.chat.type)) return r ? tie(d, r, e.user, e.chatId, e.chat.title ?? null, now, say) : "member:ok";
      await markGone(d, e.chatId, "cant_post", now);
      if (r) await refuse(d, r, e.user, clean(e.chat.title ?? "that chat", 255), "cant_post", say);
      return "member:cant_post";
    }
    case "here": {
      const mine = (await d.db.rowsOfChat(e.chatId, ["connected"])).filter((x) => x.tg_user_id === e.user);
      if (!mine.length) return "here:ignored";
      await d.db.setTopic(mine.map((x) => x.id), e.topicId, e.topicName);
      // in the private chat, so the group sees only the person's /here
      await say(e.user, COPY.here(e.topicName ?? (e.topicId ? `#${e.topicId}` : "General")));
      return "here:set";
    }
    case "migrate":
      await d.db.migrate(e.from, e.to);
      return "migrate";
    case "chatter":
      await say(e.user, COPY.chatter);
      return "chatter";
    default:
      return "ignore";
  }
}

type Say = (chatId: number, text: string, extra?: Record<string, unknown>) => Promise<void>;

/** A connect counts only once Telegram's signed login was verified for the account that made the code. */
const confirmedOnly = (r: ChatRow | null) => (r?.confirmed_at ? r : null);

async function tie(d: HookDeps, r: ChatRow, user: number, chatId: number, sharedTitle: string | null, now: string, say: Say): Promise<string> {
  const chat = await d.bot.call<TgChat>("getChat", { chat_id: chatId }).catch(() => null);
  const title = clean(chat?.title ?? sharedTitle ?? "that chat", 255);
  // the bot first: without it in the chat as an admin, Telegram won't reliably say who else is one
  const bot = chat && chat.type !== "private" ? await d.bot.call<TgMember>("getChatMember", { chat_id: chatId, user_id: d.bot.id }).catch(() => null) : null;
  if (!chat || chat.type === "private" || !botCanPost(bot, chat.type)) return refuse(d, r, user, title, "cant_post", say);
  const them = await d.bot.call<TgMember>("getChatMember", { chat_id: chatId, user_id: user }).catch(() => null);
  if (!canConnect(them, chat.type)) return refuse(d, r, user, title, "not_admin", say);
  const tied: TiedChat = { chat_id: chat.id, chat_type: chat.type, title, username: chat.username ?? null, is_forum: chat.is_forum === true };
  if (!(await d.db.tie(r, tied, now))) return "tie:already";
  await say(user, tied.is_forum ? `${COPY.connected(title)}\n\n${COPY.forum(title)}` : COPY.connected(title), { reply_markup: { remove_keyboard: true } });
  return "tie:connected";
}

async function refuse(d: HookDeps, r: ChatRow, user: number, title: string, why: "not_admin" | "cant_post", say: Say): Promise<string> {
  await d.db.refuse(r.id, title, why);
  // the picker stays up, so they can fix it and pick again inside the 15 minutes
  await say(user, why === "not_admin" ? COPY.notAdmin(title) : COPY.cantPost(title));
  return `tie:${why}`;
}

async function markGone(d: HookDeps, chatId: number, status: "removed" | "cant_post", now: string): Promise<void> {
  const rows = await d.db.rowsOfChat(chatId, status === "removed" ? ["connected", "cant_post"] : ["connected"]);
  if (rows.length) await d.db.markChat(rows.map((x) => x.id), status, status === "removed" ? REASON.removed : REASON.cantPost, now);
}
