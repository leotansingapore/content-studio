// Telegram on /accounts and in the schedule steps (docs/north-star/items/publish-telegram.md): start a connect, verify
// the Telegram login that comes back from the bot's Confirm button, disconnect a chat, upload links for a post's
// files, queue a post, and add or remove a brand's own bot ("Own bot per brand", 027). Each code and chat belongs to
// one bot (the shared one, or the brand's own), and every Telegram call for it uses that bot's token. Every id from a request is checked
// against the caller's own rows before it is used, and every file path against the caller's own folder. Pure: the
// database, the storage and the bot come in.

import { isProfileId } from "../_shared/zernio.ts";
import {
  MEDIA_EXT,
  MEDIA_MAX,
  PHOTO_MAX_BYTES,
  TEXT_MAX,
  LOGIN_FIELDS,
  TelegramError,
  VIDEO_MAX_BYTES,
  VIDEO_TOO_BIG,
  checkTelegramLogin,
  hashCode,
  pickerMessage,
  intoSendingHours,
  isUuid,
  mediaKindOf,
  type Bot,
} from "../_shared/telegram.ts";

export const CODE_MINUTES = 15;
export const DISCONNECTED = "Disconnected";

export interface FileAsk {
  type: string;
  size: number;
}

export type TelegramRequest =
  | { action: "start"; profileId: string }
  /**
   * Telegram's login_url fields as they came back to /accounts?telegram=<chatRow>, with the nonce this browser kept
   * from start. confirm false: who is this (writes nothing); true: Connect.
   */
  | { action: "verify"; chatRow: string; auth: Record<string, string>; nonce: string | null; confirm: boolean }
  | { action: "disconnect"; profileId: string; chatRow: string }
  | { action: "presign"; profileId: string; files: FileAsk[] }
  /** sendAt null: now. */
  | { action: "schedule"; profileId: string; chatRows: string[]; clientKey: string; text: string; media: string[]; sendAt: number | null }
  /** A BotFather token for the brand's own bot; checked, stored in Vault, never sent back. */
  | { action: "bot-add"; profileId: string; token: string }
  | { action: "bot-remove"; profileId: string };

type Parsed = { ok: true; req: TelegramRequest } | { ok: false; status: number; error: string };
const notFound: Parsed = { ok: false, status: 404, error: "Not found." };
const bad = (error: string): Parsed => ({ ok: false, status: 400, error });

/** All pictures, or one video: what Telegram takes as one post. */
function mixProblem(kinds: ("photo" | "video" | null)[]): string | null {
  if (kinds.length > MEDIA_MAX) return `Pick up to ${MEDIA_MAX} pictures.`;
  if (kinds.includes("video") && kinds.length > 1) return "Telegram takes pictures or one video in a post, not both.";
  return null;
}

export function fileProblem(f: FileAsk): string | null {
  const ext = MEDIA_EXT[f.type];
  if (!ext || !Number.isSafeInteger(f.size) || f.size <= 0) return "Telegram takes JPG, PNG or WebP pictures, or an MP4 video.";
  if (ext === "mp4") return f.size > VIDEO_MAX_BYTES ? VIDEO_TOO_BIG : null;
  return f.size > PHOTO_MAX_BYTES ? "Telegram takes pictures up to 5 MB from Content Studio. Use a smaller one." : null;
}

export function parseRequest(body: unknown): Parsed {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (b.action === "verify") {
    if (!isUuid(b.chatRow)) return notFound;
    const raw = (b.auth && typeof b.auth === "object" ? b.auth : {}) as Record<string, unknown>;
    // Telegram's own fields only, as strings; anything else never reaches the check
    const auth = Object.fromEntries(
      [...LOGIN_FIELDS, "hash"].filter((k) => typeof raw[k] === "string" && (raw[k] as string).length <= 512).map((k) => [k, raw[k] as string]),
    );
    const nonce = typeof b.nonce === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(b.nonce) ? b.nonce : null;
    return { ok: true, req: { action: "verify", chatRow: b.chatRow, auth, nonce, confirm: b.confirm === true } };
  }
  if (b.action !== "start" && b.action !== "disconnect" && b.action !== "presign" && b.action !== "schedule" && b.action !== "bot-add" && b.action !== "bot-remove") {
    return bad("Unknown action.");
  }
  if (!isProfileId(b.profileId)) return notFound;
  const profileId = b.profileId;
  // the token's shape is checked in runAddBot, so a refusal there says the same thing for any wrong paste
  if (b.action === "bot-add") return { ok: true, req: { action: "bot-add", profileId, token: typeof b.token === "string" ? b.token : "" } };
  if (b.action === "bot-remove") return { ok: true, req: { action: "bot-remove", profileId } };
  if (b.action === "start") return { ok: true, req: { action: "start", profileId } };
  if (b.action === "disconnect") return isUuid(b.chatRow) ? { ok: true, req: { action: "disconnect", profileId, chatRow: b.chatRow } } : notFound;
  if (b.action === "presign") {
    if (!Array.isArray(b.files) || !b.files.length) return bad("Pick a picture or a video.");
    const files = b.files.map((f) => ({ type: String((f as FileAsk)?.type ?? ""), size: Number((f as FileAsk)?.size) }));
    const problem = mixProblem(files.map((f) => (MEDIA_EXT[f.type] === "mp4" ? "video" : "photo"))) ?? files.map(fileProblem).find(Boolean);
    return problem ? bad(problem) : { ok: true, req: { action: "presign", profileId, files } };
  }
  if (!Array.isArray(b.chatRows) || !b.chatRows.length || b.chatRows.length > 10) return bad("Pick a Telegram chat.");
  if (!b.chatRows.every(isUuid)) return notFound;
  if (!isUuid(b.clientKey)) return bad("Something went wrong. Try again.");
  const text = typeof b.text === "string" ? b.text : "";
  if (text.length > TEXT_MAX) return bad(`Telegram takes up to ${TEXT_MAX.toLocaleString("en-US")} characters.`);
  const media = Array.isArray(b.media) ? b.media.filter((m): m is string => typeof m === "string") : [];
  if (Array.isArray(b.media) && media.length !== b.media.length) return notFound;
  if (!text.trim() && !media.length) return bad("Write something or add a picture.");
  const mix = mixProblem(media.map(mediaKindOf));
  if (mix) return bad(mix);
  let sendAt: number | null = null;
  if (b.now !== true) {
    sendAt = typeof b.sendAt === "string" ? Date.parse(b.sendAt) : NaN;
    if (!Number.isFinite(sendAt)) return bad("Pick a day and time.");
  }
  return { ok: true, req: { action: "schedule", profileId, chatRows: [...new Set(b.chatRows as string[])], clientKey: b.clientKey, text, media, sendAt } };
}

// ---- the database, as index.ts provides it ----

export interface OwnRow {
  id: string;
  chat_id: number | null;
  status: "pending" | "connected" | "cant_post" | "removed" | "disconnected";
  /** The bot it was tied through; null is the shared bot. */
  bot_id?: number | null;
}

/** A bot as index.ts resolves it: the shared one for null, a brand's own by its Telegram id (null once it is gone). */
export type BotFor = (botId: number | null) => Promise<{ bot: Bot; token: string; username: string } | null>;

export interface PostInsert {
  owner_id: string;
  profile_id: string;
  chat_row: string;
  client_key: string;
  text: string;
  media: string[];
  send_at: string;
}

export interface PostView {
  id: string;
  chat_row: string;
  send_at: string;
  status: string;
}

export interface FnDb {
  /** Cancels the brand's waiting connects (status disconnected); answers how many. */
  cancelPending(uid: string, profileId: string, now: string): Promise<number>;
  insertConnect(row: { owner_id: string; profile_id: string; code_hash: string; code_expires_at: string; nonce_hash: string; bot_id: number | null }): Promise<{ id: string }>;
  /** The brand's own bot, or null when it posts through the shared one. */
  brandBot(uid: string, profileId: string): Promise<{ id: string; bot_id: number; username: string } | null>;
  /** Whether any account has this bot set up. */
  botTaken(botId: number): Promise<boolean>;
  /** 027's cs_telegram_bot_save: the token into Vault and the row with it; null when refused (it never raises). */
  saveBot(b: { owner: string; profile: string; botId: number; username: string; displayName: string; token: string; webhookSecretHash: string }): Promise<string | null>;
  /**
   * Deletes the bot's row. 027's triggers, in the same statement, disconnect the chats tied through it, cancel their
   * waiting posts and delete its Vault secret.
   */
  deleteBot(id: string): Promise<void>;
  /** The bot the caller's own code was issued for (null: shared), or null when the caller has no such row. */
  codeBot(uid: string, rowId: string): Promise<{ botId: number | null } | null>;
  /** Whether this signed login confirmed a code before. */
  loginUsed(loginHash: string): Promise<boolean>;
  /** Whether the caller's own waiting, unexpired, unconfirmed code has this Telegram user and this browser's nonce. */
  loginTarget(uid: string, rowId: string, tgUser: number, nonceHash: string, now: string): Promise<boolean>;
  /** Whether this Telegram user already holds another confirmed, waiting, unexpired connect. */
  liveConfirmedElsewhere(tgUser: number, exceptRow: string, now: string): Promise<boolean>;
  /**
   * Confirms the caller's own waiting, unexpired, unconfirmed code whose Telegram user (noted at /start) is this one
   * and whose nonce is this browser's, keeping the login's hash: "used" when that login confirmed a code before,
   * "not_found" when no such code.
   */
  verifyLogin(uid: string, rowId: string, tgUser: number, name: string, loginHash: string, nonceHash: string, now: string): Promise<"ok" | "used" | "not_found">;
  /** The caller's row in this brand, or null. */
  ownRow(uid: string, profileId: string, id: string): Promise<OwnRow | null>;
  /** Whether another connected row (any brand, any owner) still posts to the chat through the same bot. */
  liveElsewhere(chatId: number, exceptRow: string, botId: number | null): Promise<boolean>;
  disconnect(id: string, now: string): Promise<void>;
  /** Cancels the rows' waiting posts with the reason; answers how many. */
  cancelPosts(rowIds: string[], reason: string, now: string): Promise<number>;
  /** Which of these ids are the caller's connected rows in this brand. */
  connectedRows(uid: string, profileId: string, ids: string[]): Promise<string[]>;
  /** Inserts, skipping any (owner, client key, chat row) already queued. */
  insertPosts(posts: PostInsert[]): Promise<void>;
  postsFor(uid: string, clientKey: string, rowIds: string[]): Promise<PostView[]>;
}

export type Reply = { status: number; body: Record<string, unknown> };
const ok = (body: Record<string, unknown>): Reply => ({ status: 200, body });
const NOT_FOUND: Reply = { status: 404, body: { error: "Not found." } };
const iso = (ms: number) => new Date(ms).toISOString();

/** 24 random bytes as base64url: 32 of Telegram's start-parameter characters. */
function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function runStart(db: FnDb, uid: string, profileId: string, sharedUsername: string, now: number): Promise<Reply> {
  // a fresh code replaces the brand's waiting one, so a code someone else tapped Start with first just dies
  await db.cancelPending(uid, profileId, iso(now));
  // the brand's own bot when it has one: the code is issued for that bot, and only that bot's /start takes it
  const own = await db.brandBot(uid, profileId);
  const botUsername = own?.username ?? sharedUsername;
  const code = newCode();
  // kept by the browser that pressed Connect Telegram: the confirm works only there
  const nonce = newCode();
  const expiresAt = iso(now + CODE_MINUTES * 60_000);
  const { id } = await db.insertConnect({
    owner_id: uid,
    profile_id: profileId,
    code_hash: await hashCode(code),
    code_expires_at: expiresAt,
    nonce_hash: await hashCode(nonce),
    bot_id: own?.bot_id ?? null,
  });
  // the code and the nonce go back once and are never stored or logged
  return ok({ rowId: id, link: `https://t.me/${botUsername}?start=${code}`, expiresAt, nonce });
}

/**
 * The bot's Confirm button (login_url) brought Telegram's signed login back to /accounts, where the person is signed
 * in. The login must check out against the bot token, be under 5 minutes old, be used for the first time, and be the
 * Telegram user who tapped Start with this code; the code must be the caller's own and the nonce this browser's. A
 * link someone else made, or one opened in another browser, fails here. The first call (confirm false) only answers
 * who Telegram says this is, for "Connect Telegram as <name> (@username)?"; Connect (confirm true) confirms the code
 * and that Telegram user gets the pickers.
 */
export async function runVerify(
  db: FnDb,
  bots: BotFor,
  uid: string,
  chatRow: string,
  auth: Record<string, string>,
  nonce: string | null,
  confirm: boolean,
  now: number,
): Promise<Reply> {
  const notThis: Reply = { status: 404, body: { error: "This doesn't match a Connect Telegram started in this browser, or it expired. Tap Connect Telegram again." } };
  if (!nonce) return notThis;
  // Telegram signs the login with the token of the bot whose Confirm was tapped: the bot the code was issued for
  const code = await db.codeBot(uid, chatRow);
  const via = code ? await bots(code.botId) : null;
  if (!via) return notThis;
  const { bot, username: botUsername } = via;
  const login = await checkTelegramLogin(auth, via.token, now);
  if (!login.ok) return { status: 400, body: { error: login.error } };
  const nonceHash = await hashCode(nonce);
  const used: Reply = { status: 409, body: { error: "That confirmation was already used. Tap Confirm in Telegram again." } };
  if (!confirm) {
    if (await db.loginUsed(auth.hash)) return used;
    if (!(await db.loginTarget(uid, chatRow, login.id, nonceHash, iso(now)))) return notThis;
    return ok({ firstName: login.firstName, username: login.username });
  }
  if (await db.liveConfirmedElsewhere(login.id, chatRow, iso(now))) {
    return { status: 409, body: { error: "This Telegram account is already connecting a chat. Finish that one, or wait 15 minutes." } };
  }
  const done = await db.verifyLogin(uid, chatRow, login.id, login.name, auth.hash, nonceHash, iso(now));
  if (done === "used") return used;
  if (done === "not_found") return notThis;
  const m = pickerMessage(botUsername);
  const picker = await bot.call("sendMessage", { chat_id: login.id, text: m.text, reply_markup: m.reply_markup }).then(() => true, () => false);
  return ok({ linked: true, picker });
}

export async function runDisconnect(db: FnDb, bots: BotFor, uid: string, profileId: string, chatRow: string, now: number): Promise<Reply> {
  const row = await db.ownRow(uid, profileId, chatRow);
  if (!row) return NOT_FOUND;
  const botId = row.bot_id ?? null;
  // the bot the chat was tied through leaves it (a removed own bot is gone already)
  const via = row.chat_id !== null && (row.status === "connected" || row.status === "cant_post") && !(await db.liveElsewhere(row.chat_id, row.id, botId)) ? await bots(botId) : null;
  if (via && row.chat_id !== null) {
    try {
      await via.bot.call("leaveChat", { chat_id: row.chat_id });
    } catch (e) {
      // the bot already out of the chat is the end we want; no answer from Telegram changes nothing
      if (!(e instanceof TelegramError) || e.status === 0 || e.status === 429 || e.status >= 500) {
        return { status: 502, body: { error: "Couldn't reach Telegram. Try again in a minute." } };
      }
    }
  }
  await db.disconnect(row.id, iso(now));
  const cancelled = await db.cancelPosts([row.id], DISCONNECTED, iso(now));
  return ok({ disconnected: true, cancelled });
}

export async function runPresign(sign: (path: string) => Promise<{ path: string; token: string }>, uid: string, profileId: string, files: FileAsk[]): Promise<Reply> {
  const uploads = [];
  for (const f of files) uploads.push(await sign(`${uid}/${profileId}/${crypto.randomUUID()}.${MEDIA_EXT[f.type]}`));
  return ok({ uploads });
}

export async function runSchedule(db: FnDb, uid: string, req: Extract<TelegramRequest, { action: "schedule" }>, now: number): Promise<Reply> {
  const mine = await db.connectedRows(uid, req.profileId, req.chatRows);
  if (mine.length !== req.chatRows.length) return NOT_FOUND;
  const folder = new RegExp(`^${uid}/${req.profileId}/[0-9a-f-]{36}\\.(jpg|png|webp|mp4)$`);
  if (!req.media.every((m) => folder.test(m))) return NOT_FOUND;
  const asked = req.sendAt === null ? now : Math.max(req.sendAt, now);
  const at = intoSendingHours(asked);
  await db.insertPosts(req.chatRows.map((chat_row) => ({ owner_id: uid, profile_id: req.profileId, chat_row, client_key: req.clientKey, text: req.text, media: req.media, send_at: iso(at) })));
  const posts = await db.postsFor(uid, req.clientKey, req.chatRows);
  return ok({ posts, held: at !== asked, sendAt: posts[0]?.send_at ?? iso(at) });
}

// ---- a brand's own bot ----

/** A BotFather token: "<bot id>:<secret>". */
const TOKEN_RE = /^([0-9]{5,15}):[A-Za-z0-9_-]{30,64}$/;
const NOT_A_TOKEN: Reply = { status: 400, body: { error: "That isn't a bot token. Copy the whole token BotFather sent." } };
const UNKNOWN_TOKEN: Reply = { status: 400, body: { error: "Telegram doesn't know that token. Copy it again from BotFather." } };

/**
 * "Use your brand's own bot": checks the pasted token with getMe, refuses the shared bot and a bot already set up in
 * Content Studio (any account), and a bot whose webhook goes to another app (getWebhookInfo). Another app reading the
 * bot by polling (getUpdates) can't be seen from here without cutting that app's own poll, so the setup steps say a
 * bot another app reads stops working there. Then stores the token in Vault with the row, and sets that bot's webhook
 * to the hook URL carrying its id, with a secret_token of its own (only the secret's hash is kept), keeping what the
 * bot already queued. Answers the bot's @name and name; the token never comes back, and a webhook Telegram won't take
 * leaves nothing behind.
 */
export async function runAddBot(
  db: FnDb,
  client: (token: string) => Bot,
  uid: string,
  profileId: string,
  token: string,
  hookUrl: string,
  sharedBotId: number,
): Promise<Reply> {
  const m = TOKEN_RE.exec(token);
  if (!m) return NOT_A_TOKEN;
  const bot = client(token);
  const me = await bot.call<{ id?: unknown; is_bot?: unknown; username?: unknown; first_name?: unknown }>("getMe", {}).catch(() => null);
  if (!me || me.is_bot !== true || me.id !== Number(m[1]) || typeof me.username !== "string" || !/^[A-Za-z0-9_]{5,64}$/.test(me.username)) return UNKNOWN_TOKEN;
  const botId = me.id as number;
  if (botId === sharedBotId) return { status: 400, body: { error: "That is Content Studio's shared bot. Make a new bot in BotFather for this brand." } };
  if (await db.botTaken(botId)) return { status: 409, body: { error: "That bot is already set up in Content Studio." } };
  const has = await db.brandBot(uid, profileId);
  if (has) return { status: 409, body: { error: `This brand already posts as @${has.username}. Switch back to the shared bot first.` } };
  const ours = `${hookUrl}?bot=${botId}`;
  const info = await bot.call<{ url?: unknown }>("getWebhookInfo", {}).catch(() => null);
  if (!info) return { status: 502, body: { error: "Couldn't reach Telegram. Try again in a minute." } };
  if (typeof info.url === "string" && info.url !== "" && info.url !== ours) {
    return { status: 409, body: { error: "That bot already sends its updates to another app. Make a new bot in BotFather for Content Studio, or remove that app's webhook first." } };
  }
  const secret = newCode();
  const displayName = typeof me.first_name === "string" ? me.first_name.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 128) : "";
  const id = await db.saveBot({ owner: uid, profile: profileId, botId, username: me.username, displayName, token, webhookSecretHash: await hashCode(secret) });
  // checked above; a null here is another add winning a race for the bot or the brand
  if (!id) return { status: 409, body: { error: "That bot is already set up in Content Studio." } };
  try {
    await bot.call("setWebhook", { url: ours, secret_token: secret, allowed_updates: ["message", "my_chat_member"], drop_pending_updates: false });
  } catch {
    await db.deleteBot(id);
    return { status: 502, body: { error: "Telegram didn't take the bot's webhook. Try again in a minute." } };
  }
  return ok({ botUsername: me.username, botName: displayName });
}

/**
 * "Switch back to the shared bot": deletes the bot's webhook, then the row; 027's triggers disconnect the chats tied
 * through it, cancel their waiting posts and delete its Vault secret in that same statement. A token Telegram no
 * longer takes doesn't stop it; no answer from Telegram changes nothing.
 */
export async function runRemoveBot(
  db: FnDb,
  client: (token: string) => Bot,
  tokenOf: (botId: number) => Promise<string | null>,
  uid: string,
  profileId: string,
): Promise<Reply> {
  const own = await db.brandBot(uid, profileId);
  if (!own) return NOT_FOUND;
  const token = await tokenOf(own.bot_id);
  if (token) {
    try {
      await client(token).call("deleteWebhook", { drop_pending_updates: true });
    } catch (e) {
      if (!(e instanceof TelegramError) || e.status === 0 || e.status === 429 || e.status >= 500) {
        return { status: 502, body: { error: "Couldn't reach Telegram. Try again in a minute." } };
      }
    }
  }
  await db.deleteBot(own.id);
  return ok({ removed: true });
}
