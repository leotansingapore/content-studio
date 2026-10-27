// Telegram on Leo's sign-ins (docs/north-star/items/publish-telegram.md, on ns/phase7): the Telegram card on
// /accounts#telegram, its chats in the Channels block and a Telegram row in the schedule steps. The `telegram`
// function starts and ends connects and queues posts; the bot's webhook (telegram-hook) does the rest. This file reads
// the brand's own rows straight from cs_telegram_chats (026: owner-only SELECT), so the page's 3-second wait for the
// webhook costs no function call and no daily use.

import { callFn } from "@/lib/edgeFn";
import { supabase } from "@/lib/supabase";
import type { Channel } from "@/lib/socialConnect";
import type { MediaFile } from "@/lib/autoPost";
import {
  BUCKET,
  LOGIN_FIELDS,
  MEDIA_EXT,
  MEDIA_MAX,
  PHOTO_MAX_BYTES,
  TEXT_MAX,
  VIDEO_MAX_BYTES,
  VIDEO_TOO_BIG,
  inSendingHours,
} from "../../supabase/functions/_shared/telegram.ts";

export { TEXT_MAX as TELEGRAM_TEXT_MAX };

export interface TelegramRow {
  id: string;
  profile_id: string;
  status: "pending" | "connected" | "cant_post" | "removed" | "disconnected";
  chat_id: number | null;
  chat_type: "group" | "supergroup" | "channel" | null;
  title: string | null;
  username: string | null;
  is_forum: boolean;
  topic_id: number | null;
  topic_name: string | null;
  refusal: "not_admin" | "cant_post" | null;
  code_expires_at: string;
  tg_user_name: string | null;
  confirmed_at: string | null;
  created_at: string;
}

const COLS = "id, profile_id, status, chat_id, chat_type, title, username, is_forum, topic_id, topic_name, refusal, code_expires_at, tg_user_name, confirmed_at, created_at";

// ---- reads and calls ----

/** The brand's connects, newest first (the last 50). */
export async function readTelegramRows(profileId: string): Promise<TelegramRow[]> {
  const { data, error } = await supabase.from("cs_telegram_chats").select(COLS).eq("profile_id", profileId).order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error("Couldn't load your Telegram chats. Try again in a minute.");
  return (data ?? []) as TelegramRow[];
}

export async function readTelegramRow(id: string): Promise<TelegramRow | null> {
  const { data } = await supabase.from("cs_telegram_chats").select(COLS).eq("id", id).maybeSingle();
  return (data as TelegramRow | null) ?? null;
}

/** A new code (the brand's waiting one is cancelled) and the nonce this browser keeps for its confirm. */
export const startTelegram = (profileId: string) =>
  callFn<{ rowId: string; link: string; expiresAt: string; nonce: string }>("telegram", { action: "start", profileId }, "Couldn't start the connection. Try again in a minute.");

// The nonce of the connect this browser started: the confirm works only where it is. Per browser (Telegram opens the
// Confirm link in a new tab), outside the content-studio- sync prefix so it never reaches another device.
const NONCE_KEY = "cs-telegram-nonce";

export function saveNonce(rowId: string, nonce: string): void {
  try {
    localStorage.setItem(NONCE_KEY, JSON.stringify({ rowId, nonce }));
  } catch {
    // storage blocked: the confirm can't work in this browser, and says so
  }
}

export function readNonce(rowId: string): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(NONCE_KEY) ?? "null");
    return v?.rowId === rowId && typeof v.nonce === "string" ? v.nonce : null;
  } catch {
    return null;
  }
}

export function clearNonce(): void {
  try {
    localStorage.removeItem(NONCE_KEY);
  } catch {
    // nothing kept
  }
}

/** "Connect Telegram as Leo (@leo_test)?": who Telegram's verified login says this is. */
export function identityQuestion(who: { firstName: string; username: string | null }): string {
  const name = who.firstName && who.username ? `${who.firstName} (@${who.username})` : who.firstName || `@${who.username}`;
  return `Connect Telegram as ${name}?`;
}

/**
 * The bot's Confirm button (Telegram's login_url) returns to /accounts?telegram=<row> with Telegram's signed fields.
 * index.html's first script takes exactly these off the address before anything else loads (keep the two lists the
 * same; telegramConnect.test.ts checks) and leaves them in this tab under LOGIN_KEY for the Telegram card.
 */
export const LOGIN_PARAMS = ["telegram", ...LOGIN_FIELDS, "hash"] as const;
const LOGIN_KEY = "cs-telegram-login";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function loginFrom(fields: Record<string, unknown> | null | undefined): { chatRow: string; auth: Record<string, string> } | null {
  const f = fields ?? {};
  const chatRow = typeof f.telegram === "string" ? f.telegram : "";
  if (!UUID.test(chatRow) || typeof f.hash !== "string" || !f.hash) return null;
  const auth = Object.fromEntries([...LOGIN_FIELDS, "hash"].flatMap((k) => (typeof f[k] === "string" ? [[k, f[k] as string]] : [])));
  return { chatRow, auth };
}

/** The login index.html kept for this tab, once: it is gone after this read. */
export function takeTelegramLogin(): { chatRow: string; auth: Record<string, string> } | null {
  let raw: unknown = null;
  try {
    raw = JSON.parse(sessionStorage.getItem(LOGIN_KEY) ?? "null");
    sessionStorage.removeItem(LOGIN_KEY);
  } catch {
    // storage blocked: index.html left it on window instead
  }
  const w = globalThis as { __csTelegramLogin?: unknown };
  raw ??= w.__csTelegramLogin ?? null;
  delete w.__csTelegramLogin;
  return raw && typeof raw === "object" ? loginFrom(raw as Record<string, unknown>) : null;
}

/** Who Telegram's signed login says this is, checked against this account's code and this browser's nonce; writes nothing. */
export const checkTelegram = (chatRow: string, auth: Record<string, string>, nonce: string) =>
  callFn<{ firstName: string; username: string | null }>("telegram", { action: "verify", chatRow, auth, nonce, confirm: false }, "Couldn't check it. Tap Confirm in Telegram again.");

/** Connect: the same checks, then the code is confirmed for that Telegram user, who gets the pickers. */
export const confirmTelegram = (chatRow: string, auth: Record<string, string>, nonce: string) =>
  callFn<{ linked: boolean; picker: boolean }>("telegram", { action: "verify", chatRow, auth, nonce, confirm: true }, "Couldn't confirm it. Tap Confirm in Telegram again.");

export const disconnectTelegram = (profileId: string, chatRow: string) =>
  callFn<{ disconnected: boolean; cancelled: number }>("telegram", { action: "disconnect", profileId, chatRow }, "Couldn't disconnect it. Try again in a minute.");

/** Uploads every file not already in `done` (file -> its path in the bucket) and returns the paths, in order. */
export async function uploadTelegramFiles(profileId: string, files: MediaFile[], done: Map<Blob, string>): Promise<string[]> {
  const todo = files.filter((f) => !done.has(f.file));
  if (todo.length) {
    const { uploads } = await callFn<{ uploads: { path: string; token: string }[] }>(
      "telegram",
      { action: "presign", profileId, files: todo.map((f) => ({ type: f.type, size: f.file.size })) },
      "Couldn't upload for Telegram. Try again in a minute.",
    );
    for (const [i, f] of todo.entries()) {
      const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(uploads[i].path, uploads[i].token, f.file, { contentType: f.type });
      if (error) throw new Error("Couldn't upload for Telegram. Try again in a minute.");
      done.set(f.file, uploads[i].path);
    }
  }
  return files.map((f) => done.get(f.file)!);
}

export const scheduleTelegram = (
  profileId: string,
  req: { chatRows: string[]; clientKey: string; text: string; media: string[] } & ({ now: true } | { sendAt: string }),
) => callFn<{ posts: { id: string; chat_row: string; send_at: string; status: string }[]; held: boolean; sendAt: string }>("telegram", { action: "schedule", profileId, ...req }, "Couldn't schedule it on Telegram. Try again in a minute.");

// ---- what the card says ----

export const WAITING_HELP = "In Telegram, tap Start, then Confirm, then pick your group or channel.";
export const FORUM_LINE = "Posts go to General. To post in a topic, open it in Telegram and send /here.";
export const HELD_LINE = "Telegram posts go out between 9am and 9pm. This one goes at 9am.";

const nameOf = (r: Pick<TelegramRow, "title" | "username">) => r.title || (r.username ? `@${r.username}` : "Your Telegram chat");

export type ConnectState =
  | { kind: "waiting"; refused?: string; linked?: string }
  | { kind: "expired"; text: string }
  | { kind: "connected"; text: string; forum?: string }
  | { kind: "gone" };

/** The line for the connect the page is waiting on. */
export function connectState(r: TelegramRow, now: number): ConnectState {
  if (r.status === "pending") {
    if (Date.parse(r.code_expires_at) <= now) return { kind: "expired", text: "That link expired." };
    const name = r.title || "That chat";
    if (r.refusal === "cant_post") return { kind: "waiting", refused: `${name} isn't connected: the bot needs to be an admin that can post there.` };
    if (r.refusal === "not_admin") return { kind: "waiting", refused: `${name} isn't connected: only an admin of it can connect it.` };
    if (r.confirmed_at) return { kind: "waiting", linked: `Linked to ${r.tg_user_name || "your Telegram"}. Pick your group or channel in Telegram.` };
    return { kind: "waiting" };
  }
  if (r.status === "connected") return { kind: "connected", text: `Connected to ${nameOf(r)}.`, ...(r.is_forum && !r.topic_id ? { forum: FORUM_LINE } : {}) };
  return { kind: "gone" };
}

/** The chats the brand posts to (or did, until the bot was taken out): one row per chat, newest first. */
export function chatRows(rows: TelegramRow[]): TelegramRow[] {
  const seen = new Set<number>();
  return rows.filter((r) => {
    if (r.chat_id === null || !["connected", "cant_post", "removed"].includes(r.status) || seen.has(r.chat_id)) return false;
    seen.add(r.chat_id);
    return true;
  });
}

export function rowDetail(r: TelegramRow) {
  return {
    name: nameOf(r),
    kind: r.chat_type === "channel" ? "Channel" : "Group",
    topic: r.topic_id ? `topic: ${r.topic_name || `#${r.topic_id}`}` : null,
    state: r.status === "connected" ? "Working" : r.status === "cant_post" ? "Can't post here" : "Removed in Telegram",
    tone: r.status === "connected" ? ("ok" as const) : ("bad" as const),
    // who tapped Start and Yes in Telegram, so a chat tied by someone else is plain to see
    by: r.tg_user_name ? `Added by ${r.tg_user_name}` : null,
  };
}

// ---- Channels: the brand's chats as last read here (the sidebar's Channels block) ----
// Per device and sign-in, outside the sync prefix, like socialConnect's cache; written whenever the rows are read.

export type TelegramChannel = Channel & { label: string; topic?: string };
export interface BrandTelegram {
  at: number;
  channels: TelegramChannel[];
}
const CHANNELS_KEY = "cs-telegram-channels-";
export const TELEGRAM_CHANNELS_CHANGED = "cs-telegram-channels-changed";

export const telegramChannels = (rows: TelegramRow[]): TelegramChannel[] =>
  chatRows(rows).map((r) => ({
    platform: "telegram",
    username: r.username ?? "",
    label: nameOf(r),
    ...(r.topic_id ? { topic: r.topic_name || `#${r.topic_id}` } : {}),
    health: r.status === "connected" ? "healthy" : "error",
  }));

function readAll(userId: string): Record<string, unknown> {
  try {
    const v = JSON.parse(localStorage.getItem(CHANNELS_KEY + userId) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function saveTelegramChannels(userId: string, profileId: string, rows: TelegramRow[]): void {
  try {
    localStorage.setItem(CHANNELS_KEY + userId, JSON.stringify({ ...readAll(userId), [profileId]: { at: Date.now(), channels: telegramChannels(rows) } }));
  } catch {
    return; // storage full or blocked: the block keeps what it showed
  }
  globalThis.window?.dispatchEvent?.(new Event(TELEGRAM_CHANNELS_CHANGED));
}

export function loadTelegramChannels(userId: string | null | undefined, profileId: string): BrandTelegram | null {
  if (!userId) return null;
  const v = readAll(userId)[profileId] as BrandTelegram | undefined;
  return v && typeof v.at === "number" && Array.isArray(v.channels) ? v : null;
}

// ---- the schedule steps ----

/** What stops these files going to Telegram, or null: up to 10 pictures to 5 MB, or one MP4 video to 20 MB. */
export function telegramMediaProblem(files: { name: string; type: string; size: number }[]): string | null {
  if (files.length > MEDIA_MAX) return `Telegram takes up to ${MEDIA_MAX} pictures in a post.`;
  for (const f of files) {
    const ext = MEDIA_EXT[f.type];
    if (!ext) return `${f.name} can't go to Telegram from here: it takes JPG, PNG or WebP pictures, or an MP4 video.`;
    if (ext === "mp4" && f.size > VIDEO_MAX_BYTES) return VIDEO_TOO_BIG;
    if (ext !== "mp4" && f.size > PHOTO_MAX_BYTES) return `${f.name} is over 5 MB, the most Telegram takes from Content Studio.`;
  }
  if (files.length > 1 && files.some((f) => MEDIA_EXT[f.type] === "mp4")) return "Telegram takes pictures or one video in a post, not both.";
  return null;
}

/** Whether a post asked for `at` (null: now) waits for 9am, Telegram's sending hours being 9am to 9pm Singapore time. */
export const willHold = (at: string | null, now = Date.now()) => !inSendingHours(at ? Date.parse(at) : now);

// ---- a brand's own bot ("Own bot per brand", 027) ----
// The token is pasted once, sent to `telegram` (bot-add) and kept in Vault; this page only ever reads the bot's @name.

export interface OwnBot {
  id: string;
  bot_id: number;
  username: string;
  display_name: string;
  status: "active" | "revoked";
}

export const OWN_BOT_STEPS = [
  "In Telegram, open @BotFather and send /newbot. Pick a name and a username for your brand's bot. Use a new bot: one another app already reads stops working there.",
  "Send /setdomain to @BotFather, pick your bot, and send consultant-content-studio.vercel.app",
  "Copy the token BotFather sends and paste it here.",
];

/** "<bot id>:<secret>", as BotFather sends it; the server checks it again with Telegram. */
export const looksLikeBotToken = (s: string) => /^[0-9]{5,15}:[A-Za-z0-9_-]{30,64}$/.test(s.trim());

export const postingAs = (b: Pick<OwnBot, "username">) => `Posting as @${b.username}`;

/** The brand's own bot, or null while it posts through the shared bot (026/027: owner-only, non-secret columns). */
export async function readOwnBot(profileId: string): Promise<OwnBot | null> {
  const { data, error } = await supabase.from("cs_telegram_bots").select("id, bot_id, username, display_name, status").eq("profile_id", profileId).maybeSingle();
  if (error) throw new Error("Couldn't load your brand's bot. Try again in a minute.");
  return (data as OwnBot | null) ?? null;
}

export const addOwnBot = (profileId: string, token: string) =>
  callFn<{ botUsername: string; botName: string }>("telegram", { action: "bot-add", profileId, token: token.trim() }, "Couldn't check your bot. Try again in a minute.");

export const removeOwnBot = (profileId: string) =>
  callFn<{ removed: boolean }>("telegram", { action: "bot-remove", profileId }, "Couldn't switch back. Try again in a minute.");
