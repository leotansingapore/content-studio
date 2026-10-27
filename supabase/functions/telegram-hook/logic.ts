// The Content Studio bot's webhook (docs/north-star/items/publish-telegram.md): reads Telegram's updates and ties a
// group or channel to the brand whose one-time code the person started. Pure: the database and the bot come in.
//
// The tie rule, for every path (Telegram's chat picker, or the bot made an admin through the plain links): inside a
// started, unexpired connect that the same Telegram user confirmed with Yes, the first chat that user shares or
// makes the bot an admin of is tied, and only when the bot can post there and the person is an admin of it.
// The Yes answers "This connects Telegram to <brand> in the Content Studio account <full email>. Is this your
// Content Studio account?", so a link someone else made and sent shows a stranger's email, not yours.

import { secretMatches } from "../social-sweep/logic.ts";
import { TelegramError, hashCode, type Bot } from "../_shared/telegram.ts";

// ---- the bot's words ----

export const COPY = {
  confirm: (brand: string | null, account: string | null) =>
    `This connects Telegram to ${brand ? `${brand} in ` : ""}the Content Studio account ${account ?? "with no email on file"}. Is this your Content Studio account?`,
  cancelled: "Cancelled. Nothing was connected, and that link no longer works.",
  pick: "Pick the group or channel Content Studio should post to.",
  notInList: (group: string, channel: string) => `Not in the list? Add me by link: ${group} or ${channel}`,
  expired: "That link has expired. Go back to Content Studio and tap Connect Telegram again.",
  connected: (name: string) => `Connected to ${name}. Posts you schedule in Content Studio go here between 9am and 9pm.`,
  forum: (name: string) => `${name} has topics. Posts go to General. To use another, open the topic and send /here.`,
  here: (topic: string) => `Posts from Content Studio now go to the topic ${topic}.`,
  notAdmin: (name: string) => `You need to be an admin of ${name} to connect it.`,
  cantPost: (name: string) => `I can't post in ${name}. Make me an admin with Post messages, then tap Pick again.`,
  chatter: "This bot posts for Content Studio. Connect it from consultant-content-studio.vercel.app/accounts.",
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
  callback_query?: { id: string; from: TgUser; message?: { message_id: number; chat: TgChat }; data?: string };
}

export type Event =
  | { kind: "start"; user: number; code: string | null; name: string }
  | { kind: "answer"; user: number; yes: boolean; rowId: string; queryId: string; chatId: number; messageId: number }
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
  const q = up.callback_query;
  if (q) {
    const a = /^(yes|no):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(typeof q.data === "string" ? q.data : "");
    if (!a || typeof q.id !== "string" || !isId(q.from?.id) || q.message?.chat?.type !== "private" || !isId(q.message.chat.id) || !isId(q.message.message_id)) return IGNORE;
    return { kind: "answer", user: q.from.id, yes: a[1] === "yes", rowId: a[2], queryId: q.id.slice(0, 64), chatId: q.message.chat.id, messageId: q.message.message_id };
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
    const name = clean(msg.from.username ? `@${msg.from.username}` : (msg.from.first_name ?? ""), 64);
    if (code !== null) return { kind: "start", user: msg.from.id, code: CODE_RE.test(code) ? code : null, name };
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
  /** The brand and the account's full email the bot names before Yes (set by `telegram` start, from the session). */
  brand_name: string | null;
  account_email: string | null;
  /** Who tapped Start, as the app shows "Added by". */
  tg_user_name: string | null;
  /** When that Telegram user answered Yes; nothing is tied before it. */
  confirmed_at: string | null;
}

export type TiedChat = Pick<ChatRow, "title" | "username" | "is_forum"> & { chat_id: number; chat_type: "group" | "supergroup" | "channel" };

export interface HookDb {
  /** Ties the Telegram user (and their name) to a pending, unexpired code's row not already started by someone else; null otherwise. */
  claimCode(codeHash: string, tgUser: number, name: string, now: string): Promise<ChatRow | null>;
  /** Marks Yes on the row when it is pending, unexpired and started by this same Telegram user; null otherwise. */
  confirm(rowId: string, tgUser: number, now: string): Promise<ChatRow | null>;
  /** No: the pending row started by this Telegram user turns disconnected, so its code is dead. */
  cancelCode(rowId: string, tgUser: number, now: string): Promise<boolean>;
  /** The user's newest started connect still inside its 15 minutes, confirmed or not, or null. */
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

const isAdmin = (m: TgMember | null) => m?.status === "creator" || m?.status === "administrator";
/** The bot posts only as an admin, and in a channel only with Post messages. */
export const botCanPost = (m: TgMember | null, type: ChatType) => m?.status === "administrator" && (type !== "channel" || m.can_post_messages === true);

const ADMIN_RIGHTS = {
  is_anonymous: false,
  can_manage_chat: true,
  can_delete_messages: false,
  can_manage_video_chats: false,
  can_restrict_members: false,
  can_promote_members: false,
  can_change_info: false,
  can_invite_users: false,
  can_post_stories: false,
  can_edit_stories: false,
  can_delete_stories: false,
};

/** Telegram's own chat pickers (KeyboardButtonRequestChat): the bot asked in as an admin, in a channel with Post messages. */
export function pickerKeyboard() {
  const group = ADMIN_RIGHTS;
  const channel = { ...ADMIN_RIGHTS, can_post_messages: true };
  const ask = (request_id: number, chat_is_channel: boolean, rights: typeof channel | typeof group) => ({
    request_id,
    chat_is_channel,
    user_administrator_rights: rights,
    bot_administrator_rights: rights,
    request_title: true,
    request_username: true,
  });
  return {
    keyboard: [[{ text: "Pick a group", request_chat: ask(1, false, group) }, { text: "Pick a channel", request_chat: ask(2, true, channel) }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

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
      const r = await d.db.claimCode(await hashCode(e.code), e.user, e.name, now);
      if (!r) {
        await say(e.user, COPY.expired);
        return "start:refused";
      }
      await say(e.user, COPY.confirm(r.brand_name, r.account_email), {
        reply_markup: { inline_keyboard: [[{ text: "Yes", callback_data: `yes:${r.id}` }, { text: "No", callback_data: `no:${r.id}` }]] },
      });
      return "start:asked";
    }
    case "answer": {
      // stop the button's spinner, and take Yes and No away so neither is pressed twice
      await d.bot.call("answerCallbackQuery", { callback_query_id: e.queryId }).catch(() => undefined);
      await d.bot.call("editMessageReplyMarkup", { chat_id: e.chatId, message_id: e.messageId, reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
      if (!e.yes) {
        await say(e.user, (await d.db.cancelCode(e.rowId, e.user, now)) ? COPY.cancelled : COPY.expired);
        return "answer:no";
      }
      if (!(await d.db.confirm(e.rowId, e.user, now))) {
        await say(e.user, COPY.expired);
        return "answer:refused";
      }
      const link = (kind: string, rights: string) => `https://t.me/${d.botUsername}?${kind}&admin=${rights}`;
      await say(e.user, `${COPY.pick}\n\n${COPY.notInList(link("startgroup", "manage_chat"), link("startchannel", "post_messages"))}`, { reply_markup: pickerKeyboard() });
      return "answer:yes";
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

/** A started connect counts only once its Telegram user said Yes to the brand and account it names. */
const confirmedOnly = (r: ChatRow | null) => (r?.confirmed_at ? r : null);

async function tie(d: HookDeps, r: ChatRow, user: number, chatId: number, sharedTitle: string | null, now: string, say: Say): Promise<string> {
  const chat = await d.bot.call<TgChat>("getChat", { chat_id: chatId }).catch(() => null);
  const title = clean(chat?.title ?? sharedTitle ?? "that chat", 255);
  // the bot first: without it in the chat as an admin, Telegram won't reliably say who else is one
  const bot = chat && chat.type !== "private" ? await d.bot.call<TgMember>("getChatMember", { chat_id: chatId, user_id: d.bot.id }).catch(() => null) : null;
  if (!chat || chat.type === "private" || !botCanPost(bot, chat.type)) return refuse(d, r, user, title, "cant_post", say);
  const them = await d.bot.call<TgMember>("getChatMember", { chat_id: chatId, user_id: user }).catch(() => null);
  if (!isAdmin(them)) return refuse(d, r, user, title, "not_admin", say);
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
