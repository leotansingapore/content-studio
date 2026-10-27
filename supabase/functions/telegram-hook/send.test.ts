// The send tick through send.ts with the Bot API stubbed from fixtures/: the hours, what each post becomes in Telegram,
// and what happens to a post Telegram refuses. The claim itself (one per chat, skip locked) is 026_telegram.test.sql's.
import { describe, expect, it } from "vitest";
import { TelegramError, type Bot } from "../_shared/telegram";
import { MAX_ATTEMPTS, PARTIAL, STALE, STUCK, runTick, type QueuedPost, type SendChat, type TickDeps } from "./send";
import sendOk from "./fixtures/api-send-message.json";
import photoOk from "./fixtures/api-send-photo.json";
import albumOk from "./fixtures/api-send-media-group.json";
import e429 from "./fixtures/api-error-429.json";
import e403 from "./fixtures/api-error-403-kicked.json";
import e400url from "./fixtures/api-error-400-url.json";
import e400migrated from "./fixtures/api-error-400-migrated.json";
import e500 from "./fixtures/api-error-500.json";

const sg = (wall: string) => Date.parse(`${wall}+08:00`);
const NOW = sg("2026-11-02T10:00:00");
const iso = (ms: number) => new Date(ms).toISOString();
const asError = (f: { error_code: number; description: string; parameters?: { retry_after?: number; migrate_to_chat_id?: number } }) =>
  new TelegramError(f.error_code, f.description, f.parameters?.retry_after, f.parameters?.migrate_to_chat_id);

const CHAT: SendChat = { id: "row-1", chat_id: -1001234567890, username: null, topic_id: 326 };
const post = (o: Partial<QueuedPost> = {}): QueuedPost => ({ id: "post-1", chat_row: "row-1", text: "Hello group", media: [], attempts: 1, ...o });
const pics = (n: number) => Array.from({ length: n }, (_, i) => `u/me/0000000${i}-0000-4000-8000-000000000000.jpg`);

type Handler = (params: Record<string, unknown>) => unknown;
function harness(o: { posts?: QueuedPost[]; chats?: SendChat[]; bot?: Record<string, Handler>; now?: number; urls?: () => Promise<string[]> } = {}) {
  const sent: { method: string; params: Record<string, unknown> }[] = [];
  const log: string[] = [];
  const bot: Bot = {
    id: 7000000001,
    async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
      sent.push({ method, params });
      const h = o.bot?.[method] ?? { sendMessage: () => sendOk.result, sendPhoto: () => photoOk.result, sendVideo: () => photoOk.result, sendMediaGroup: () => albumOk.result }[method];
      if (!h) throw new Error(`unexpected ${method}`);
      const out = h(params);
      if (out instanceof TelegramError) throw out;
      return out as T;
    },
  };
  let claimed = 0;
  const d: TickDeps = {
    bot,
    now: o.now ?? NOW,
    failStale: async (before, reason) => (log.push(`stale<${before}:${reason}`), 0),
    claim: async (limit, now) => (log.push(`claim:${limit}@${now}`), claimed++ ? [] : (o.posts ?? [post()])),
    chats: async (ids) => (o.chats ?? [CHAT]).filter((c) => ids.includes(c.id)),
    signedUrls: o.urls ?? (async (paths) => paths.map((p) => `https://hub.supabase.co/storage/v1/object/sign/cs-telegram-media/${p}?token=t`)),
    posted: async (id, ids, link) => void log.push(`posted:${id}:${ids.join(",")}:${link}`),
    retry: async (id, at, reason) => void log.push(`retry:${id}:${at}:${reason}`),
    failed: async (id, reason) => void log.push(`failed:${id}:${reason}`),
    migrate: async (from, to) => void log.push(`migrate:${from}>${to}`),
    cleanup: async (before) => (log.push(`cleanup<${before}`), 0),
  };
  return { d, sent, log };
}

describe("the hours", () => {
  it("holds at 08:59 and at 21:00 Singapore time without claiming anything, and sends at 09:00", async () => {
    for (const at of [sg("2026-11-02T08:59:00"), sg("2026-11-02T21:00:00")]) {
      const { d, sent, log } = harness({ now: at });
      expect(await runTick(d)).toMatchObject({ held: true });
      expect(sent).toEqual([]);
      expect(log).toEqual([]);
    }
    const { d, sent } = harness({ now: sg("2026-11-02T09:00:00") });
    expect(await runTick(d)).toMatchObject({ sent: 1 });
    expect(sent).toHaveLength(1);
  });

  it("asks for at most 20 posts, fails sends stuck for 10 minutes, and clears files of posts finished 7 days ago", async () => {
    const { d, log } = harness({ posts: [] });
    await runTick(d);
    expect(log).toEqual([`stale<${iso(NOW - 10 * 60_000)}:${STALE}`, `claim:20@${iso(NOW)}`, `cleanup<${iso(NOW - 7 * 86_400_000)}`]);
  });
});

describe("what a post becomes in Telegram", () => {
  it("sends text alone as one message into the topic, as plain text, and links to it", async () => {
    const { d, sent, log } = harness();
    await runTick(d);
    expect(sent).toEqual([{ method: "sendMessage", params: { chat_id: -1001234567890, message_thread_id: 326, text: "Hello group" } }]);
    expect(log).toContain("posted:post-1:4001:https://t.me/c/1234567890/326/4001");
  });

  it("sends one picture with the text as its caption, and a chat with no topic gets no thread id", async () => {
    const { d, sent } = harness({ posts: [post({ media: pics(1) })], chats: [{ ...CHAT, topic_id: null }] });
    await runTick(d);
    expect(sent).toEqual([{ method: "sendPhoto", params: { chat_id: -1001234567890, photo: expect.stringContaining("/cs-telegram-media/u/me/"), caption: "Hello group" } }]);
  });

  it("sends 2 to 10 pictures as one album with the caption on the first", async () => {
    for (const n of [2, 10]) {
      const { d, sent } = harness({ posts: [post({ media: pics(n) })] });
      await runTick(d);
      expect(sent).toHaveLength(1);
      expect(sent[0].method).toBe("sendMediaGroup");
      const media = sent[0].params.media as Record<string, unknown>[];
      expect(media).toHaveLength(n);
      expect(media[0]).toMatchObject({ type: "photo", caption: "Hello group" });
      expect(media.slice(1).every((m) => m.type === "photo" && !("caption" in m))).toBe(true);
    }
  });

  it("sends a text over 1,024 characters with pictures as the album, then the text", async () => {
    const long = "x".repeat(1025);
    const { d, sent, log } = harness({ posts: [post({ text: long, media: pics(3) })] });
    await runTick(d);
    expect(sent.map((s) => s.method)).toEqual(["sendMediaGroup", "sendMessage"]);
    expect((sent[0].params.media as Record<string, unknown>[]).some((m) => "caption" in m)).toBe(false);
    expect(sent[1].params).toEqual({ chat_id: -1001234567890, message_thread_id: 326, text: long });
    expect(log).toContain("posted:post-1:4003,4004,4005,4001:https://t.me/c/1234567890/326/4003");
  });

  it("sends one video as a video", async () => {
    const { d, sent } = harness({ posts: [post({ media: ["u/me/00000000-0000-4000-8000-000000000000.mp4"] })] });
    await runTick(d);
    expect(sent[0]).toMatchObject({ method: "sendVideo", params: { video: expect.stringContaining(".mp4"), caption: "Hello group" } });
  });

  it("never asks Telegram to parse markup or for a paid broadcast", async () => {
    const { d, sent } = harness({ posts: [post({ text: "<b>5 * 3</b> _x_", media: pics(2) })] });
    await runTick(d);
    for (const s of sent) expect(JSON.stringify(s.params)).not.toMatch(/parse_mode|allow_paid_broadcast/);
  });

  it("sends each claimed post once, one after another", async () => {
    const chats = [CHAT, { ...CHAT, id: "row-2", chat_id: -1009876543210, username: "cs_test_channel", topic_id: null }];
    const { d, sent, log } = harness({ posts: [post(), post({ id: "post-2", chat_row: "row-2", text: "Hello channel" })], chats });
    expect(await runTick(d)).toMatchObject({ sent: 2, retried: 0, failed: 0 });
    expect(sent.map((s) => s.params.chat_id)).toEqual([-1001234567890, -1009876543210]);
    expect(log).toContain("posted:post-2:4001:https://t.me/cs_test_channel/4001");
  });
});

describe("when Telegram refuses", () => {
  it("tries a busy post again later, after Telegram's wait or the backoff, whichever is longer", async () => {
    const { d, log } = harness({ bot: { sendMessage: () => asError(e429) } });
    expect(await runTick(d)).toMatchObject({ retried: 1 });
    expect(log).toContain(`retry:post-1:${iso(NOW + 2 * 60_000)}:Telegram is busy. Trying again shortly.`);
    const slow = harness({ bot: { sendMessage: () => asError(e500) }, posts: [post({ attempts: 3 })] });
    await runTick(slow.d);
    expect(slow.log).toContain(`retry:post-1:${iso(NOW + 8 * 60_000)}:Telegram is busy. Trying again shortly.`);
  });

  it(`gives up after ${MAX_ATTEMPTS} tries`, async () => {
    const { d, log } = harness({ bot: { sendMessage: () => asError(e429) }, posts: [post({ attempts: MAX_ATTEMPTS })] });
    expect(await runTick(d)).toMatchObject({ failed: 1, retried: 0 });
    expect(log).toContain("failed:post-1:Telegram is busy. Try again later.");
  });

  it("fails with a plain reason when the bot can't post, a file can't be fetched, or Telegram doesn't answer", async () => {
    for (const [answer, reason] of [
      [asError(e403), "Can't post here"],
      [asError(e400url), "Telegram couldn't take the picture or video. Pictures go up to 5 MB, videos up to 20 MB."],
      [new TelegramError(0, "Telegram didn't answer."), STUCK],
    ] as const) {
      const { d, log } = harness({ bot: { sendMessage: () => answer } });
      await runTick(d);
      expect(log).toContain(`failed:post-1:${reason}`);
    }
  });

  it("never sends the rest again when part of a post went out", async () => {
    const { d, log, sent } = harness({ posts: [post({ text: "y".repeat(1100), media: pics(2) })], bot: { sendMessage: () => asError(e429) } });
    expect(await runTick(d)).toMatchObject({ failed: 1, retried: 0 });
    expect(sent.map((s) => s.method)).toEqual(["sendMediaGroup", "sendMessage"]);
    expect(log).toContain(`failed:post-1:${PARTIAL}`);
  });

  it("moves a group that became a supergroup and sends to it on the next tick", async () => {
    const { d, log } = harness({ bot: { sendMessage: () => asError(e400migrated) } });
    await runTick(d);
    expect(log).toContain("migrate:-1001234567890>-1005550001111");
    expect(log.some((l) => l.startsWith(`retry:post-1:${iso(NOW)}:`))).toBe(true);
  });

  it("tries again later when the files can't be read yet, before Telegram hears of the post", async () => {
    const { d, log, sent } = harness({ posts: [post({ media: pics(1) })], urls: async () => Promise.reject(new Error("storage down")) });
    expect(await runTick(d)).toMatchObject({ retried: 1 });
    expect(sent).toEqual([]);
    expect(log.some((l) => l.startsWith("retry:post-1:"))).toBe(true);
  });

  it("fails a post whose chat is gone without calling Telegram", async () => {
    const { d, log, sent } = harness({ chats: [] });
    await runTick(d);
    expect(sent).toEqual([]);
    expect(log).toContain("failed:post-1:Can't post here");
  });
});
