// The send tick (pg_cron every minute through 026's telegram-send, only when a post is due): sends up to 5 due posts between
// 09:00 and 21:00 Singapore time, one attempt per post per tick, and marks each posted, back in the queue with a
// backoff, or failed with a plain reason. Pure: the queue, the files and the bot come in.

import { CAPTION_MAX, TelegramError, inSendingHours, mediaKindOf, messageLink, type Bot } from "../_shared/telegram.ts";
import { REASON } from "./logic.ts";

export interface QueuedPost {
  id: string;
  chat_row: string;
  text: string;
  media: string[];
  /** Tries so far, this one included (the claim counts it). */
  attempts: number;
}

export interface SendChat {
  id: string;
  chat_id: number;
  username: string | null;
  topic_id: number | null;
}

export interface TickDeps {
  bot: Bot;
  now: number;
  /** Fails every post still sending since before `before` with the reason; answers how many. */
  failStale(before: string, reason: string, now: string): Promise<number>;
  /** 026's cs_telegram_claim_due: due posts, one per connected chat, marked sending. */
  claim(limit: number, now: string): Promise<QueuedPost[]>;
  chats(rowIds: string[]): Promise<SendChat[]>;
  /** 1-hour signed URLs for the post's files, in order. */
  signedUrls(paths: string[]): Promise<string[]>;
  posted(id: string, messageIds: number[], link: string | null, now: string): Promise<void>;
  /** Back to scheduled at `sendAt`, with the reason shown meanwhile. */
  retry(id: string, sendAt: string, reason: string): Promise<void>;
  failed(id: string, reason: string, now: string): Promise<void>;
  migrate(from: number, to: number): Promise<void>;
  /** Posts finished (posted, failed or cancelled) before `before` that still list files, a page of them. */
  finishedFiles(before: string): Promise<{ id: string; media: string[] }[]>;
  /** Which of these paths a waiting or sending post still uses. */
  liveFiles(paths: string[]): Promise<string[]>;
  removeFiles(paths: string[]): Promise<void>;
  /** Empties those posts' file lists. */
  clearFiles(postIds: string[]): Promise<void>;
}

export const MAX_ATTEMPTS = 5;
/** About 5 posts a tick: an album with its text is a few slow calls, and a tick must end well inside the function's time and the 10-minute stale check. */
export const PER_TICK = 5;
export const STALE = "Check the group before you retry.";
export const STUCK = "Telegram didn't answer. Check the group before you retry.";
export const PARTIAL = "Part of it went out. Check the group before you retry.";
export const NOT_RECORDED = "Sent, but not recorded. Check the group.";
const BUSY_RETRY = "Telegram is busy. Trying again shortly.";
const BUSY_FAIL = "Telegram is busy. Try again later.";

const MINUTE = 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

class SendFailure extends Error {
  constructor(public reason: unknown, public sent: number[]) {
    super("send failed");
  }
}

/** One post into its chat: text alone, one picture or video with the caption, or an album; a text too long for a caption follows as its own message. */
export async function sendPost(bot: Bot, p: Pick<QueuedPost, "text" | "media">, chat: SendChat, urls: string[]): Promise<number[]> {
  const where = { chat_id: chat.chat_id, ...(chat.topic_id ? { message_thread_id: chat.topic_id } : {}) };
  // no parse_mode: a person's own < or * can never fail a post with "Can't parse entities"
  const text = p.text.trim() ? p.text : "";
  const caption = text && text.length <= CAPTION_MAX ? text : "";
  const sent: number[] = [];
  try {
    if (!urls.length) {
      sent.push((await bot.call<{ message_id: number }>("sendMessage", { ...where, text })).message_id);
      return sent;
    }
    if (urls.length === 1) {
      const video = mediaKindOf(p.media[0]) === "video";
      const m = await bot.call<{ message_id: number }>(video ? "sendVideo" : "sendPhoto", {
        ...where,
        [video ? "video" : "photo"]: urls[0],
        ...(caption ? { caption } : {}),
        ...(video ? { supports_streaming: true } : {}),
      });
      sent.push(m.message_id);
    } else {
      const album = urls.map((media, i) => ({ type: mediaKindOf(p.media[i]) === "video" ? "video" : "photo", media, ...(i === 0 && caption ? { caption } : {}) }));
      sent.push(...(await bot.call<{ message_id: number }[]>("sendMediaGroup", { ...where, media: album })).map((m) => m.message_id));
    }
    if (text && !caption) sent.push((await bot.call<{ message_id: number }>("sendMessage", { ...where, text })).message_id);
    return sent;
  } catch (e) {
    throw new SendFailure(e, sent);
  }
}

/** Telegram's refusal in plain words. */
export function plainReason(e: TelegramError): string {
  const d = e.description;
  if (e.status === 403 || /not enough rights|need administrator rights|have no rights|CHAT_WRITE_FORBIDDEN/i.test(d)) return REASON.cantPost;
  if (/chat not found/i.test(d)) return "Telegram couldn't find the chat.";
  if (/thread not found|topic/i.test(d)) return "That topic is gone. Send /here in another topic, or in General.";
  if (/too long/i.test(d)) return "The text is too long for Telegram.";
  if (/HTTP URL|wrong file|web page content|too big|file/i.test(d)) return "Telegram couldn't take the picture or video. Pictures go up to 5 MB, videos up to 20 MB.";
  return `Telegram said: ${d.replace(/^(Bad Request|Forbidden): /, "")}`.slice(0, 300);
}

type Outcome = { retryAt: number; reason: string; migrateTo?: number } | { fail: string };

/** What a failed try becomes: never sent again once part of it went out, or when Telegram may have it already. */
export function outcomeOf(e: unknown, sent: number[], attempts: number, now: number): Outcome {
  if (sent.length) return { fail: PARTIAL };
  const backoff = Math.min(60, 2 ** attempts) * MINUTE;
  if (!(e instanceof TelegramError)) return attempts < MAX_ATTEMPTS ? { retryAt: now + backoff, reason: "Couldn't read the files. Trying again shortly." } : { fail: "Couldn't read the files. Schedule it again." };
  if (e.migrateTo) return { retryAt: now, reason: "The group moved. Sending again.", migrateTo: e.migrateTo };
  if (e.status === 429 || e.status >= 500) {
    return attempts < MAX_ATTEMPTS ? { retryAt: now + Math.max(backoff, (e.retryAfter ?? 0) * 1000), reason: BUSY_RETRY } : { fail: BUSY_FAIL };
  }
  // no answer: the post may have gone out
  if (e.status === 0) return { fail: STUCK };
  return { fail: plainReason(e) };
}

export interface TickReport {
  held?: true;
  stale: number;
  sent: number;
  retried: number;
  failed: number;
  cleaned: number;
}

export async function runTick(d: TickDeps): Promise<TickReport> {
  const r: TickReport = { stale: 0, sent: 0, retried: 0, failed: 0, cleaned: 0 };
  if (!inSendingHours(d.now)) return { ...r, held: true };
  const now = iso(d.now);
  r.stale = await d.failStale(iso(d.now - 10 * MINUTE), STALE, now);
  const posts = await d.claim(PER_TICK, now);
  const chats = new Map((posts.length ? await d.chats([...new Set(posts.map((p) => p.chat_row))]) : []).map((c) => [c.id, c]));
  for (const p of posts) {
    const chat = chats.get(p.chat_row);
    if (!chat) {
      await d.failed(p.id, REASON.cantPost, now);
      r.failed++;
      continue;
    }
    // only the file links and the send itself may lead to another try
    let ids: number[];
    try {
      const urls = p.media.length ? await d.signedUrls(p.media) : [];
      ids = await sendPost(d.bot, p, chat, urls);
    } catch (e) {
      const o = e instanceof SendFailure ? outcomeOf(e.reason, e.sent, p.attempts, d.now) : outcomeOf(e, [], p.attempts, d.now);
      try {
        if ("fail" in o) {
          await d.failed(p.id, o.fail, now);
          r.failed++;
        } else {
          if (o.migrateTo) await d.migrate(chat.chat_id, o.migrateTo);
          await d.retry(p.id, iso(o.retryAt), o.reason);
          r.retried++;
        }
      } catch {
        // not written: the post stays sending and the stale check fails it, never sent again by itself
      }
      continue;
    }
    // Telegram has it now: whatever happens to the writes below, it is never sent again
    try {
      await d.posted(p.id, ids, messageLink(chat, ids[0]), now);
      r.sent++;
    } catch {
      r.failed++;
      await d.failed(p.id, NOT_RECORDED, now).catch(() => undefined);
    }
  }
  // files go 7 days after their post is done, except any a waiting or sending post shares
  const done = await d.finishedFiles(iso(d.now - 7 * 86_400_000));
  if (done.length) {
    const paths = [...new Set(done.flatMap((p) => p.media))];
    const keep = new Set(await d.liveFiles(paths));
    const gone = paths.filter((x) => !keep.has(x));
    if (gone.length) await d.removeFiles(gone);
    await d.clearFiles(done.map((p) => p.id));
  }
  r.cleaned = done.length;
  return r;
}
