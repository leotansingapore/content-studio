// The Content Studio Telegram bot (telegram, telegram-hook; docs/north-star/items/publish-telegram.md). The token comes
// from the function secret TELEGRAM_BOT_TOKEN and only ever sits in the request URL: no error, log line or reply
// carries it. No Deno or npm imports, so vitest can test it; the browser imports the hours and limits from here too.

export class TelegramError extends Error {
  constructor(
    public status: number,
    public description: string,
    public retryAfter?: number,
    public migrateTo?: number,
  ) {
    super(`Telegram ${status}: ${description}`);
    this.name = "TelegramError";
  }
}

export interface Bot {
  /** The bot's own user id, the number before the token's colon. */
  id: number;
  call<T = unknown>(method: string, params: Record<string, unknown>): Promise<T>;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function botClient(token: string, fetchFn: FetchLike = fetch): Bot {
  const scrub = (s: string) => s.split(token).join("[token]").replace(/\s+/g, " ").slice(0, 200);
  return {
    id: Number(token.split(":")[0]),
    async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
      // paid broadcasts spend Telegram Stars; nothing here ever asks for one
      if ("allow_paid_broadcast" in params) throw new TelegramError(400, "A paid broadcast is never sent from here.");
      let res: Response;
      try {
        res = await fetchFn(`https://api.telegram.org/bot${token}/${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        // the network error's own text can hold the URL, and so the token
        throw new TelegramError(0, "Telegram didn't answer.");
      }
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; result?: T; error_code?: number; description?: string; parameters?: { retry_after?: number; migrate_to_chat_id?: number } }
        | null;
      if (body?.ok === true) return body.result as T;
      throw new TelegramError(
        typeof body?.error_code === "number" ? body.error_code : res.status,
        scrub(String(body?.description ?? `No answer (${res.status})`)),
        body?.parameters?.retry_after,
        body?.parameters?.migrate_to_chat_id,
      );
    },
  };
}

// ---- sending hours: 09:00 to 21:00 Singapore time (UTC+8, no daylight saving) ----

const SG_MS = 8 * 3_600_000;
const DAY_MS = 86_400_000;

export const inSendingHours = (at: number): boolean => {
  const h = new Date(at + SG_MS).getUTCHours();
  return h >= 9 && h < 21;
};

/** When a post asked for `at` goes: then, inside the hours; otherwise the next 09:00 Singapore time. */
export function intoSendingHours(at: number): number {
  if (inSendingHours(at)) return at;
  const wall = at + SG_MS;
  const midnight = wall - (((wall % DAY_MS) + DAY_MS) % DAY_MS);
  const next9 = midnight + 9 * 3_600_000 + (new Date(wall).getUTCHours() >= 21 ? DAY_MS : 0);
  return next9 - SG_MS;
}

// ---- links, files and codes ----

/** The sent message's link: t.me/<username>/... for a public chat, t.me/c/<id>/... for a private one, none for a basic group. */
export function messageLink(chat: { chat_id: number; username?: string | null; topic_id?: number | null }, messageId: number): string | null {
  const topic = chat.topic_id ? `${chat.topic_id}/` : "";
  if (chat.username) return `https://t.me/${chat.username}/${topic}${messageId}`;
  const id = String(chat.chat_id);
  return id.startsWith("-100") ? `https://t.me/c/${id.slice(4)}/${topic}${messageId}` : null;
}

export const TEXT_MAX = 4096;
export const CAPTION_MAX = 1024;
export const MEDIA_MAX = 10;
/** Telegram's limits for a file it fetches by URL. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 20 * 1024 * 1024;
export const MEDIA_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4" };
export const BUCKET = "cs-telegram-media";
export const VIDEO_TOO_BIG = "Telegram takes videos up to 20 MB from Postmosis. Post a shorter one, or send it in Telegram.";

export function mediaKindOf(path: string): "photo" | "video" | null {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext === "mp4" ? "video" : ext === "jpg" || ext === "png" || ext === "webp" ? "photo" : null;
}

export async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);

// ---- Telegram's login check (a login_url button; https://core.telegram.org/widgets/login#checking-authorization) ----

/** The fields Telegram adds to a login_url, besides hash. */
export const LOGIN_FIELDS = ["id", "first_name", "last_name", "username", "photo_url", "auth_date"] as const;
const LOGIN_MAX_AGE_S = 300;
const BAD_LOGIN = "Telegram couldn't confirm this. Tap Confirm in Telegram again.";
const OLD_LOGIN = "That confirmation is too old. Tap Confirm in Telegram again.";

/**
 * Checks the fields a login_url came back with: HMAC-SHA256 of the sorted "key=value" lines, keyed by SHA256 of the
 * bot token, must equal hash, and auth_date must be under 5 minutes old. Answers the Telegram user it proves.
 */
export async function checkTelegramLogin(
  auth: Record<string, unknown>,
  token: string,
  now: number,
): Promise<{ ok: true; id: number; name: string; firstName: string; username: string | null } | { ok: false; error: string }> {
  const hash = typeof auth.hash === "string" ? auth.hash : "";
  if (!/^[0-9a-f]{64}$/.test(hash)) return { ok: false, error: BAD_LOGIN };
  const fields = LOGIN_FIELDS.filter((k) => typeof auth[k] === "string").map((k) => [k, auth[k] as string] as const);
  const check = fields.map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", enc.encode(token)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(check)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= want.charCodeAt(i) ^ hash.charCodeAt(i);
  if (diff !== 0) return { ok: false, error: BAD_LOGIN };
  const at = Number(auth.auth_date);
  const age = now / 1000 - at;
  if (!Number.isSafeInteger(at) || age > LOGIN_MAX_AGE_S || age < -60) return { ok: false, error: OLD_LOGIN };
  const id = Number(auth.id);
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: BAD_LOGIN };
  const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");
  const firstName = clean(auth.first_name, 64);
  const username = /^[A-Za-z0-9_]{1,64}$/.test(clean(auth.username, 64)) ? clean(auth.username, 64) : null;
  return { ok: true, id, name: username ? `@${username}` : firstName, firstName, username };
}

// ---- the pickers: Telegram's own chat pickers (KeyboardButtonRequestChat), shown once the login is verified ----

export const PICK_TEXT = "Pick the group or channel Postmosis should post to.";

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

/** The bot asked in as an admin, in a channel with Post messages; the plain links cover a chat the picker doesn't list. */
export function pickerMessage(botUsername: string) {
  const channelRights = { ...ADMIN_RIGHTS, can_post_messages: true };
  const ask = (request_id: number, chat_is_channel: boolean, rights: object) => ({
    request_id,
    chat_is_channel,
    user_administrator_rights: rights,
    bot_administrator_rights: rights,
    request_title: true,
    request_username: true,
  });
  const link = (kind: string, rights: string) => `https://t.me/${botUsername}?${kind}&admin=${rights}`;
  return {
    text: `${PICK_TEXT}\n\nNot in the list? Add me by link: ${link("startgroup", "manage_chat")} or ${link("startchannel", "post_messages")}`,
    reply_markup: {
      keyboard: [[{ text: "Pick a group", request_chat: ask(1, false, ADMIN_RIGHTS) }, { text: "Pick a channel", request_chat: ask(2, true, channelRights) }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  };
}
