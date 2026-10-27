// The Telegram webhooks and the send tick (docs/north-star/items/publish-telegram.md). Three callers, each with its own
// secret, and anything else is a 401:
//   X-Telegram-Bot-Api-Secret-Token  an update for the shared Content Studio bot (setWebhook's secret_token, with
//                                    allowed_updates ["message", "my_chat_member"]): logic.ts. Nothing is read first.
//   ?bot=<id> + that header           an update for a brand's own bot (027): the header's sha256 must match that bot's
//                                    stored hash (timing-safe); only that bot's row is read before it does. Every
//                                    query is then scoped to the bot the update came through.
//   x-telegram-cron-secret           the send tick from 026's telegram-send cron: send.ts, each post through the bot
//                                    its chat was tied through.
// This file wires Supabase and the bots. Logs carry outcomes and counts only, never a person, a chat or a token.
//
// Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_CRON_SECRET (the same value is
// in Vault as cs_telegram_cron_secret). Without the token or username it answers {enabled:false} and does nothing.
// Deploy with --no-verify-jwt: the secret headers are the auth.
//   supabase functions deploy telegram-hook --project-ref hgdbflprrficdoyxmdxe --use-api --no-verify-jwt

// pinned: this runs with the service key
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { BUCKET, botClient, scrubTokens, type Bot } from "../_shared/telegram.ts";
import { gateOf, handleUpdate, ownBotSecretOk, type ChatRow, type HookDb } from "./logic.ts";
import { runTick, type QueuedPost, type SendChat, type TickDeps } from "./send.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const errText = (e: unknown) => scrubTokens(e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 200);

const CHAT_COLS =
  "id, owner_id, profile_id, code_hash, code_expires_at, tg_user_id, tg_user_name, confirmed_at, chat_id, chat_type, title, username, is_forum, topic_id, topic_name, status, refusal, created_at";

function must<T>(r: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (r.error) throw Object.assign(new Error(`${what}: ${r.error.message}`), { code: r.error.code });
  return r.data;
}

/** An own bot's token from Vault (027), or null when the bot is gone or revoked. */
async function ownToken(db: SupabaseClient, botId: number): Promise<string | null> {
  const r = await db.rpc("cs_telegram_bot_token", { p_bot_id: botId });
  if (r.error) throw new Error(`bot token: ${(r.error as { code?: string }).code ?? "error"}`);
  return (r.data as string | null) ?? null;
}

/** The database as one bot's updates see it: botId null is the shared bot, a number a brand's own bot. */
function hookDb(db: SupabaseClient, botId: number | null): HookDb {
  const chats = () => db.from("cs_telegram_chats");
  // a code, a connect and a chat belong to the bot they were issued for and tied through
  const byBot = <Q,>(q: Q): Q => {
    const f = q as unknown as { is(c: string, v: null): Q; eq(c: string, v: number): Q };
    return botId === null ? f.is("bot_id", null) : f.eq("bot_id", botId);
  };
  const cancel = async (rowIds: string[], reason: string, now: string) =>
    must(await db.from("cs_telegram_posts").update({ status: "cancelled", error: reason, finished_at: now }).in("chat_row", rowIds).eq("status", "scheduled"), "cancel posts");
  const tieOnce = (row: ChatRow, chat: object, now: string) =>
    chats().update({ ...chat, status: "connected", refusal: null, connected_at: now, topic_id: null, topic_name: null }).eq("id", row.id).eq("status", "pending").select("id");
  return {
    async startCode(hash, user, now) {
      // the first Telegram user to tap Start keeps the code (user is a safe integer from eventOf, so the filter is
      // only digits); an owner blocked by someone else's Start presses Connect Telegram again for a fresh code
      const r = await byBot(chats().update({ tg_user_id: user })).eq("code_hash", hash).eq("status", "pending").gt("code_expires_at", now)
        .or(`tg_user_id.is.null,tg_user_id.eq.${user}`).select(CHAT_COLS).maybeSingle();
      return must(r, "start code") as ChatRow | null;
    },
    async startedFor(user, now) {
      // confirmed first, then the newest: a newer unconfirmed Start must not hide the confirmed connect
      const r = await byBot(chats().select(CHAT_COLS)).eq("tg_user_id", user).eq("status", "pending").gt("code_expires_at", now)
        .not("confirmed_at", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
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
      // a bot taken out of a chat, or /here, concerns only the rows tied through that bot
      return must(await byBot(chats().select(CHAT_COLS)).eq("chat_id", chatId).in("status", statuses), "chat rows") as ChatRow[];
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

function tickDeps(db: SupabaseClient, shared: Bot): TickDeps {
  const posts = () => db.from("cs_telegram_posts");
  return {
    async botFor(botId) {
      if (botId === null) return shared;
      const token = await ownToken(db, botId);
      return token ? botClient(token) : null;
    },
    async revokeBot(botId) {
      must(await db.from("cs_telegram_bots").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("bot_id", botId), "revoke bot");
    },
    now: Date.now(),
    async failStale(before, reason, now) {
      const r = await posts().update({ status: "failed", error: reason, finished_at: now }).eq("status", "sending").lt("sending_at", before).select("id");
      return (must(r, "stale") as unknown[]).length;
    },
    async claim(limit) {
      return must(await db.rpc("cs_telegram_claim_due", { p_limit: limit }), "claim") as QueuedPost[];
    },
    async chats(rowIds) {
      return must(await db.from("cs_telegram_chats").select("id, chat_id, username, topic_id, bot_id").in("id", rowIds).eq("status", "connected"), "chats") as SendChat[];
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
    async finishedFiles(before) {
      return must(await posts().select("id, media").in("status", ["posted", "failed", "cancelled"]).lt("finished_at", before).neq("media", "{}").limit(50), "old files") as { id: string; media: string[] }[];
    },
    async liveFiles(paths) {
      const live = must(await posts().select("media").in("status", ["scheduled", "sending"]).overlaps("media", paths), "live files") as { media: string[] }[];
      return live.flatMap((p) => p.media);
    },
    async removeFiles(paths) {
      must(await db.storage.from(BUCKET).remove(paths), "remove files");
    },
    async clearFiles(ids) {
      must(await posts().update({ media: [] }).in("id", ids), "clear files");
    },
  };
}

/** An update for a brand's own bot: its row's secret hash checked before anything else is read, then that bot answers. */
async function ownBotUpdate(req: Request, param: string): Promise<Response> {
  const header = req.headers.get("x-telegram-bot-api-secret-token");
  if (!/^[0-9]{5,15}$/.test(param) || !header) return json({ error: "unauthorized" }, 401);
  const botId = Number(param);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const row = must(await db.from("cs_telegram_bots").select("bot_id, username, webhook_secret_hash").eq("bot_id", botId).eq("status", "active").maybeSingle(), "own bot") as
    | { bot_id: number; username: string; webhook_secret_hash: string }
    | null;
  if (!row || !(await ownBotSecretOk(header, row.webhook_secret_hash))) return json({ error: "unauthorized" }, 401);
  const token = await ownToken(db, botId);
  if (!token) return json({ enabled: false });
  const update = await req.json().catch(() => null);
  try {
    console.log("telegram-hook own", await handleUpdate(update, { db: hookDb(db, botId), bot: botClient(token), botUsername: row.username, now: Date.now() }));
  } catch (e) {
    console.error("telegram-hook own failed", errText(e));
  }
  return json({ ok: true });
}

Deno.serve(async (req) => {
  const own = new URL(req.url).searchParams.get("bot");
  if (own !== null) {
    try {
      return await ownBotUpdate(req, own);
    } catch (e) {
      console.error("telegram-hook own failed", errText(e));
      return json({ ok: false }, 500);
    }
  }
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
      console.log("telegram-hook", await handleUpdate(update, { db: hookDb(db, null), bot, botUsername: username, now: Date.now() }));
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
