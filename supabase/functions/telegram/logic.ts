// Telegram on /accounts and in the schedule steps (docs/north-star/items/publish-telegram.md, on ns/phase7): start a
// connect, disconnect a chat, upload links for a post's files, and queue a post. Every id from a request is checked
// against the caller's own rows before it is used, and every file path against the caller's own folder. Pure: the
// database, the storage and the bot come in.

import { isProfileId } from "../_shared/zernio.ts";
import {
  MEDIA_EXT,
  MEDIA_MAX,
  PHOTO_MAX_BYTES,
  TEXT_MAX,
  TelegramError,
  VIDEO_MAX_BYTES,
  VIDEO_TOO_BIG,
  hashCode,
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
  | { action: "disconnect"; profileId: string; chatRow: string }
  | { action: "presign"; profileId: string; files: FileAsk[] }
  /** sendAt null: now. */
  | { action: "schedule"; profileId: string; chatRows: string[]; clientKey: string; text: string; media: string[]; sendAt: number | null };

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
  if (b.action !== "start" && b.action !== "disconnect" && b.action !== "presign" && b.action !== "schedule") return bad("Unknown action.");
  if (!isProfileId(b.profileId)) return notFound;
  const profileId = b.profileId;
  // anything else in the body (a brand name, an email) is ignored: the bot's question is built on the server only
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
}

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
  insertConnect(row: { owner_id: string; profile_id: string; code_hash: string; code_expires_at: string; brand_name: string | null; account_email: string | null }): Promise<{ id: string }>;
  /** The caller's row in this brand, or null. */
  ownRow(uid: string, profileId: string, id: string): Promise<OwnRow | null>;
  /** Whether another connected row (any brand, any owner) still posts to the chat. */
  liveElsewhere(chatId: number, exceptRow: string): Promise<boolean>;
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

/**
 * The brand the bot names, from the caller's own synced brand list (src/lib/profiles.ts). A brand id not in it is
 * refused, except the default "me" every account has. A list that can't be read leaves the brand out.
 */
export function brandFor(list: { id: string; name: string }[] | null, profileId: string): { ok: true; name: string | null } | { ok: false } {
  if (!list) return { ok: true, name: null };
  const p = list.find((x) => x && x.id === profileId);
  if (!p) return profileId === "me" ? { ok: true, name: null } : { ok: false };
  const name = typeof p.name === "string" ? p.name.replace(/[\u0000-\u001f\u007f\s]+/g, " ").trim().slice(0, 80) : "";
  return { ok: true, name: name || null };
}

export interface Starter {
  /** The signed-in account's email, from the verified session. */
  email: string | null | undefined;
  /** The caller's stored brands, or null when they can't be read. */
  profiles: () => Promise<{ id: string; name: string }[] | null>;
}

export async function runStart(db: FnDb, uid: string, profileId: string, botUsername: string, now: number, who: Starter): Promise<Reply> {
  const brand = brandFor(await who.profiles(), profileId);
  if (!brand.ok) return NOT_FOUND;
  const code = newCode();
  const expiresAt = iso(now + CODE_MINUTES * 60_000);
  // The bot names these before any picker: the account's full email (a stranger's is plain to see) and the brand.
  const { id } = await db.insertConnect({
    owner_id: uid,
    profile_id: profileId,
    code_hash: await hashCode(code),
    code_expires_at: expiresAt,
    brand_name: brand.name,
    account_email: typeof who.email === "string" && who.email.length <= 320 ? who.email : null,
  });
  // the code goes back once, in the link, and is never stored or logged
  return ok({ rowId: id, link: `https://t.me/${botUsername}?start=${code}`, expiresAt });
}

export async function runDisconnect(db: FnDb, bot: Bot, uid: string, profileId: string, chatRow: string, now: number): Promise<Reply> {
  const row = await db.ownRow(uid, profileId, chatRow);
  if (!row) return NOT_FOUND;
  if (row.chat_id !== null && (row.status === "connected" || row.status === "cant_post") && !(await db.liveElsewhere(row.chat_id, row.id))) {
    try {
      await bot.call("leaveChat", { chat_id: row.chat_id });
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
