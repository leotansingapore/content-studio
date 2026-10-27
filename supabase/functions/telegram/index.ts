// Telegram for the app (docs/north-star/items/publish-telegram.md): start a connect, disconnect a chat, upload links for
// a post's files, queue a post, and add or remove a brand's own bot (027). The bot's own side (the code, the picked
// chat, sending) is telegram-hook. The page reads its rows itself (026, 027: owner-only SELECT), so there is no status
// action here. A brand's own bot token is pasted once (bot-add), checked and stored in Vault; it is never answered,
// logged or put in one of our URLs, and every log line goes through scrubTokens.
// verify takes Telegram's signed login from the bot's Confirm button (login_url, which needs the bot's domain set to
// consultant-content-studio.vercel.app with /setdomain in BotFather) and is not counted against a cap.
//
// Off, with no table or Telegram call, unless TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME are set and the caller is
// on NORTH_STAR_USERS: 404 {enabled:false}. Caps: telegram-connect, telegram-presign, telegram-schedule (usageCaps.ts).
// Deploy WITH JWT verification:
//   supabase functions deploy telegram --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { BUCKET, botClient, scrubTokens } from "../_shared/telegram.ts";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { isAllowed } from "../social/logic.ts";
import { parseRequest, runAddBot, runDisconnect, runPresign, runRemoveBot, runSchedule, runStart, runVerify, type BotFor, type FnDb, type OwnRow, type PostView } from "./logic.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

function must<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${scrubTokens(r.error.message)}`);
  return r.data;
}

function fnDb(db: SupabaseClient): FnDb {
  const chats = () => db.from("cs_telegram_chats");
  const posts = () => db.from("cs_telegram_posts");
  const bots = () => db.from("cs_telegram_bots");
  return {
    async brandBot(uid, profileId) {
      return must(await bots().select("id, bot_id, username").eq("owner_id", uid).eq("profile_id", profileId).maybeSingle(), "brand bot") as
        | { id: string; bot_id: number; username: string }
        | null;
    },
    async botTaken(botId) {
      return (must(await bots().select("id").eq("bot_id", botId).limit(1), "bot taken") as unknown[]).length > 0;
    },
    async saveBot(b) {
      const r = await db.rpc("cs_telegram_bot_save", {
        p_owner: b.owner,
        p_profile: b.profile,
        p_bot_id: b.botId,
        p_username: b.username,
        p_display_name: b.displayName,
        p_token: b.token,
        p_webhook_secret_hash: b.webhookSecretHash,
      });
      // the database's words could carry the token: only its code is kept
      if (r.error) throw new Error(`save bot: ${(r.error as { code?: string }).code ?? "error"}`);
      return (r.data as string | null) ?? null;
    },
    async deleteBot(id) {
      must(await bots().delete().eq("id", id), "delete bot");
    },
    async codeBot(uid, rowId) {
      const r = must(await chats().select("bot_id").eq("id", rowId).eq("owner_id", uid).maybeSingle(), "code bot") as { bot_id: number | null } | null;
      return r ? { botId: r.bot_id ?? null } : null;
    },
    async cancelPending(uid, profileId, now) {
      return (must(await chats().update({ status: "disconnected", removed_at: now }).eq("owner_id", uid).eq("profile_id", profileId).eq("status", "pending").select("id"), "cancel waiting") as unknown[]).length;
    },
    async loginUsed(loginHash) {
      return (must(await chats().select("id").eq("login_hash", loginHash).limit(1), "login used") as unknown[]).length > 0;
    },
    async loginTarget(uid, rowId, tgUser, nonceHash, now) {
      const r = await chats().select("id").eq("id", rowId).eq("owner_id", uid).eq("status", "pending").gt("code_expires_at", now)
        .eq("tg_user_id", tgUser).is("confirmed_at", null).eq("nonce_hash", nonceHash).limit(1);
      return (must(r, "login target") as unknown[]).length > 0;
    },
    async insertConnect(row) {
      return must(await chats().insert(row).select("id").single(), "start") as { id: string };
    },
    async liveConfirmedElsewhere(tgUser, except, now) {
      const r = await chats().select("id").eq("tg_user_id", tgUser).eq("status", "pending").not("confirmed_at", "is", null).gt("code_expires_at", now).neq("id", except).limit(1);
      return (must(r, "live connects") as unknown[]).length > 0;
    },
    async verifyLogin(uid, rowId, tgUser, name, loginHash, nonceHash, now) {
      const r = await chats().update({ tg_user_name: name || null, confirmed_at: now, login_hash: loginHash }).eq("id", rowId).eq("owner_id", uid).eq("status", "pending")
        .gt("code_expires_at", now).eq("tg_user_id", tgUser).is("confirmed_at", null).eq("nonce_hash", nonceHash).select("id");
      // 026's unique login_hash: this signed login confirmed a code before
      if (r.error?.code === "23505") return "used";
      return (must(r, "verify") as unknown[]).length > 0 ? "ok" : "not_found";
    },
    async ownRow(uid, profileId, id) {
      return must(await chats().select("id, chat_id, status, bot_id").eq("owner_id", uid).eq("profile_id", profileId).eq("id", id).maybeSingle(), "own row") as OwnRow | null;
    },
    async liveElsewhere(chatId, except, botId) {
      const q = chats().select("id").eq("chat_id", chatId).eq("status", "connected").neq("id", except);
      return (must(await (botId === null ? q.is("bot_id", null) : q.eq("bot_id", botId)).limit(1), "chat users") as unknown[]).length > 0;
    },
    async disconnect(id, now) {
      must(await chats().update({ status: "disconnected", removed_at: now }).eq("id", id), "disconnect");
    },
    async cancelPosts(rowIds, reason, now) {
      return (must(await posts().update({ status: "cancelled", error: reason, finished_at: now }).in("chat_row", rowIds).eq("status", "scheduled").select("id"), "cancel") as unknown[]).length;
    },
    async connectedRows(uid, profileId, ids) {
      const rows = must(await chats().select("id").eq("owner_id", uid).eq("profile_id", profileId).eq("status", "connected").in("id", ids), "chats") as { id: string }[];
      return rows.map((r) => r.id);
    },
    async insertPosts(list) {
      must(await posts().upsert(list, { onConflict: "owner_id,client_key,chat_row", ignoreDuplicates: true }), "queue");
    },
    async postsFor(uid, clientKey, rowIds) {
      return must(await posts().select("id, chat_row, send_at, status").eq("owner_id", uid).eq("client_key", clientKey).in("chat_row", rowIds), "posts") as PostView[];
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Sign in again." }, 401);

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const username = Deno.env.get("TELEGRAM_BOT_USERNAME");
  if (!token || !username || !isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)) return json({ enabled: false, error: "Not enabled." }, 404);

  const r = parseRequest(await req.json().catch(() => ({})));
  if (!r.ok) return json({ error: r.error }, r.status);
  const q = r.req;

  // disconnect, verify and bot-remove are not counted: they only ever act on the caller's own rows
  const feature = q.action === "start" || q.action === "bot-add" ? "telegram-connect" : q.action === "presign" ? "telegram-presign" : q.action === "schedule" ? "telegram-schedule" : null;
  if (feature) {
    const usage = await consumeUsage(admin, uid, feature);
    if (!usage.allowed) {
      const refusal = usageRefusal(usage);
      return json(refusal.body, refusal.status);
    }
  }

  try {
    const db = fnDb(admin);
    const now = Date.now();
    // an own bot's token, read from Vault for this request only
    const tokenOf = async (botId: number) => {
      const r = await admin.rpc("cs_telegram_bot_token", { p_bot_id: botId });
      if (r.error) throw new Error(`bot token: ${(r.error as { code?: string }).code ?? "error"}`);
      return (r.data as string | null) ?? null;
    };
    const bots: BotFor = async (botId) => {
      if (botId === null) return { bot: botClient(token), token, username };
      const own = must(await admin.from("cs_telegram_bots").select("username").eq("bot_id", botId).maybeSingle(), "bot") as { username: string } | null;
      const ownToken = own ? await tokenOf(botId) : null;
      return own && ownToken ? { bot: botClient(ownToken), token: ownToken, username: own.username } : null;
    };
    const reply =
      q.action === "start" ? await runStart(db, uid, q.profileId, username, now)
      : q.action === "verify" ? await runVerify(db, bots, uid, q.chatRow, q.auth, q.nonce, q.confirm, now)
      : q.action === "disconnect" ? await runDisconnect(db, bots, uid, q.profileId, q.chatRow, now)
      : q.action === "bot-add"
        ? await runAddBot(db, botClient, uid, q.profileId, q.token, `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram-hook`, Number(token.split(":")[0]))
      : q.action === "bot-remove" ? await runRemoveBot(db, botClient, tokenOf, uid, q.profileId)
      : q.action === "presign"
        ? await runPresign(async (path) => {
            const signed = must(await admin.storage.from(BUCKET).createSignedUploadUrl(path), "upload link") as { path: string; token: string };
            return { path: signed.path, token: signed.token };
          }, uid, q.profileId, q.files)
      : await runSchedule(db, uid, q, now);
    return json(reply.body, reply.status);
  } catch (e) {
    console.error("telegram failed", q.action, scrubTokens(e instanceof Error ? `${e.name}: ${e.message}` : "error").slice(0, 200));
    return json({ error: "Something went wrong. Try again in a minute." }, 500);
  }
});
