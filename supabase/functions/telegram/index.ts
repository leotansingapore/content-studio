// Telegram for the app (docs/north-star/items/publish-telegram.md, on ns/phase7): start a connect, disconnect a chat,
// upload links for a post's files and queue a post. The bot's own side (the code, the picked chat, sending) is
// telegram-hook. The page reads its rows itself (026: owner-only SELECT), so there is no status action here.
//
// Off, with no table or Telegram call, unless TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME are set and the caller is
// on NORTH_STAR_USERS: 404 {enabled:false}. Caps: telegram-connect, telegram-presign, telegram-schedule (usageCaps.ts).
// Deploy WITH JWT verification:
//   supabase functions deploy telegram --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { BUCKET, botClient } from "../_shared/telegram.ts";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { isAllowed } from "../social/logic.ts";
import { parseRequest, runDisconnect, runPresign, runSchedule, runStart, type FnDb, type OwnRow, type PostView } from "./logic.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

function must<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

function fnDb(db: SupabaseClient): FnDb {
  const chats = () => db.from("cs_telegram_chats");
  const posts = () => db.from("cs_telegram_posts");
  return {
    async insertConnect(row) {
      return must(await chats().insert(row).select("id").single(), "start") as { id: string };
    },
    async ownRow(uid, profileId, id) {
      return must(await chats().select("id, chat_id, status").eq("owner_id", uid).eq("profile_id", profileId).eq("id", id).maybeSingle(), "own row") as OwnRow | null;
    },
    async liveElsewhere(chatId, except) {
      return (must(await chats().select("id").eq("chat_id", chatId).eq("status", "connected").neq("id", except).limit(1), "chat users") as unknown[]).length > 0;
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

  // disconnect is not counted: it only ever acts on the caller's own row
  const feature = q.action === "start" ? "telegram-connect" : q.action === "presign" ? "telegram-presign" : q.action === "schedule" ? "telegram-schedule" : null;
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
    const reply =
      q.action === "start" ? await runStart(db, uid, q.profileId, username, now, { brandName: q.brandName, email: userData.user?.email })
      : q.action === "disconnect" ? await runDisconnect(db, botClient(token), uid, q.profileId, q.chatRow, now)
      : q.action === "presign"
        ? await runPresign(async (path) => {
            const signed = must(await admin.storage.from(BUCKET).createSignedUploadUrl(path), "upload link") as { path: string; token: string };
            return { path: signed.path, token: signed.token };
          }, uid, q.profileId, q.files)
      : await runSchedule(db, uid, q, now);
    return json(reply.body, reply.status);
  } catch (e) {
    console.error("telegram failed", q.action, e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : "error");
    return json({ error: "Something went wrong. Try again in a minute." }, 500);
  }
});
