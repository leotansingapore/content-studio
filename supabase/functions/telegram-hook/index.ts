// The Content Studio bot's webhook and the Telegram send tick (docs/north-star/items/publish-telegram.md, on ns/phase7).
// One URL, two callers, each with its own secret header, and anything else is a 401 before anything is read:
//   X-Telegram-Bot-Api-Secret-Token  an update from Telegram (setWebhook's secret_token, with allowed_updates
//                                    ["message", "my_chat_member"]): logic.ts.
//   x-telegram-cron-secret           the send tick from 026's telegram-send cron: send.ts.
// This file wires Supabase and the bot. Logs carry outcomes and counts only, never a person, a chat or the token.
//
// Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_CRON_SECRET (the same value is
// in Vault as cs_telegram_cron_secret). Without the token or username it answers {enabled:false} and does nothing.
// Deploy with --no-verify-jwt: the secret headers are the auth.
//   supabase functions deploy telegram-hook --project-ref hgdbflprrficdoyxmdxe --use-api --no-verify-jwt

// pinned: this runs with the service key
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { BUCKET, botClient, type Bot } from "../_shared/telegram.ts";
import { gateOf, handleUpdate, type ChatRow, type HookDb } from "./logic.ts";
import { runTick, type QueuedPost, type SendChat, type TickDeps } from "./send.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 200);

const CHAT_COLS =
  "id, owner_id, profile_id, code_hash, code_expires_at, tg_user_id, tg_user_name, confirmed_at, chat_id, chat_type, title, username, is_forum, topic_id, topic_name, status, refusal, created_at";

function must<T>(r: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (r.error) throw Object.assign(new Error(`${what}: ${r.error.message}`), { code: r.error.code });
  return r.data;
}

function hookDb(db: SupabaseClient): HookDb {
  const chats = () => db.from("cs_telegram_chats");
  const cancel = async (rowIds: string[], reason: string, now: string) =>
    must(await db.from("cs_telegram_posts").update({ status: "cancelled", error: reason, finished_at: now }).in("chat_row", rowIds).eq("status", "scheduled"), "cancel posts");
  const tieOnce = (row: ChatRow, chat: object, now: string) =>
    chats().update({ ...chat, status: "connected", refusal: null, connected_at: now, topic_id: null, topic_name: null }).eq("id", row.id).eq("status", "pending").select("id");
  return {
    async startCode(hash, user, now) {
      // user is a safe integer (eventOf), so the filter text is only digits
      const r = await chats().update({ tg_user_id: user }).eq("code_hash", hash).eq("status", "pending").gt("code_expires_at", now)
        .or(`tg_user_id.is.null,tg_user_id.eq.${user}`).select(CHAT_COLS).maybeSingle();
      return must(r, "start code") as ChatRow | null;
    },
    async startedFor(user, now) {
      const r = await chats().select(CHAT_COLS).eq("tg_user_id", user).eq("status", "pending").gt("code_expires_at", now)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      return must(r, "started connect") as ChatRow | null;
    },
    async tie(row, chat, now) {
      let r = await tieOnce(row, chat, now);
      if (r.error?.code === "23505") {
        // the brand already has this chat live: the newer connect replaces it and takes its waiting posts
        // shortcut: three statements, not one transaction; a failure between them leaves the old row disconnected
        // with its posts on this pending row. Upgrade to a SQL function if that ever bites.
        const old = must(await chats().update({ status: "disconnected", removed_at: now }).eq("owner_id", row.owner_id).eq("profile_id", row.profile_id)
          .eq("chat_id", chat.chat_id).eq("status", "connected").select("id"), "replace chat") as { id: string }[];
        if (old.length) must(await db.from("cs_telegram_posts").update({ chat_row: row.id }).in("chat_row", old.map((x) => x.id)).eq("status", "scheduled"), "move posts");
        r = await tieOnce(row, chat, now);
      }
      return (must(r, "tie chat") as unknown[]).length > 0;
    },
    async refuse(rowId, title, refusal) {
      must(await chats().update({ title, refusal }).eq("id", rowId).eq("status", "pending"), "refuse");
    },
    async rowsOfChat(chatId, statuses) {
      return must(await chats().select(CHAT_COLS).eq("chat_id", chatId).in("status", statuses), "chat rows") as ChatRow[];
    },
    async markChat(rowIds, status, reason, now) {
      must(await chats().update({ status, removed_at: now }).in("id", rowIds), "mark chat");
      await cancel(rowIds, reason, now);
    },
    async setTopic(rowIds, topicId, topicName) {
      must(await chats().update({ topic_id: topicId, topic_name: topicName }).in("id", rowIds), "set topic");
    },
    async migrate(from, to) {
      must(await chats().update({ chat_id: to, chat_type: "supergroup" }).eq("chat_id", from), "migrate");
    },
  };
}

function tickDeps(db: SupabaseClient, bot: Bot): TickDeps {
  const posts = () => db.from("cs_telegram_posts");
  return {
    bot,
    now: Date.now(),
    async failStale(before, reason, now) {
      const r = await posts().update({ status: "failed", error: reason, finished_at: now }).eq("status", "sending").lt("sending_at", before).select("id");
      return (must(r, "stale") as unknown[]).length;
    },
    async claim(limit) {
      return must(await db.rpc("cs_telegram_claim_due", { p_limit: limit }), "claim") as QueuedPost[];
    },
    async chats(rowIds) {
      return must(await db.from("cs_telegram_chats").select("id, chat_id, username, topic_id").in("id", rowIds).eq("status", "connected"), "chats") as SendChat[];
    },
    async signedUrls(paths) {
      const list = must(await db.storage.from(BUCKET).createSignedUrls(paths, 3600), "sign files") as { signedUrl?: string | null }[];
      const urls = list.map((x) => x.signedUrl ?? "");
      if (urls.length !== paths.length || urls.some((u) => !/^https:\/\//.test(u))) throw new Error("A file is missing.");
      return urls;
    },
    async posted(id, messageIds, link, now) {
      must(await posts().update({ status: "posted", message_ids: messageIds, link, error: null, sent_at: now, finished_at: now }).eq("id", id).eq("status", "sending"), "posted");
    },
    async retry(id, sendAt, reason) {
      must(await posts().update({ status: "scheduled", send_at: sendAt, error: reason, sending_at: null }).eq("id", id).eq("status", "sending"), "retry");
    },
    async failed(id, reason, now) {
      must(await posts().update({ status: "failed", error: reason, finished_at: now }).eq("id", id).eq("status", "sending"), "failed");
    },
    async migrate(from, to) {
      must(await db.from("cs_telegram_chats").update({ chat_id: to, chat_type: "supergroup" }).eq("chat_id", from), "migrate");
    },
    async cleanup(before) {
      const done = must(await posts().select("id, media").in("status", ["posted", "failed", "cancelled"]).lt("finished_at", before).neq("media", "{}").limit(50), "old files") as { id: string; media: string[] }[];
      if (!done.length) return 0;
      must(await db.storage.from(BUCKET).remove(done.flatMap((p) => p.media)), "remove files");
      must(await posts().update({ media: [] }).in("id", done.map((p) => p.id)), "clear files");
      return done.length;
    },
  };
}

Deno.serve(async (req) => {
  const path = await gateOf(req.headers, { hook: Deno.env.get("TELEGRAM_WEBHOOK_SECRET"), cron: Deno.env.get("TELEGRAM_CRON_SECRET") });
  if (!path) return json({ error: "unauthorized" }, 401);
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const username = Deno.env.get("TELEGRAM_BOT_USERNAME");
  if (!token || !username) return json({ enabled: false });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const bot = botClient(token);

  if (path === "update") {
    const update = await req.json().catch(() => null);
    try {
      console.log("telegram-hook", await handleUpdate(update, { db: hookDb(db), bot, botUsername: username, now: Date.now() }));
    } catch (e) {
      console.error("telegram-hook failed", errText(e));
    }
    // always 200: Telegram resends an update it got an error for, and one that keeps failing would block the rest
    return json({ ok: true });
  }

  // the tick answers at once, as notify and social-sweep do, and sends after answering
  const work = runTick(tickDeps(db, bot)).then(
    (r) => console.log("telegram-send", JSON.stringify(r)),
    (e) => console.error("telegram-send failed", errText(e)),
  );
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
  else await work;
  return json({ started: true }, 202);
});
