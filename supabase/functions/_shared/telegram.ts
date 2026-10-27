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
export const VIDEO_TOO_BIG = "Telegram takes videos up to 20 MB from Content Studio. Post a shorter one, or send it in Telegram.";

export function mediaKindOf(path: string): "photo" | "video" | null {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext === "mp4" ? "video" : ext === "jpg" || ext === "png" || ext === "webp" ? "photo" : null;
}

export async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
