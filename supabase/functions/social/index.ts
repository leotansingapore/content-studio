// Social accounts (Playbook > Social accounts): status, connect and disconnect an adviser's own
// accounts through Zernio, and their comment keyword -> DM automations (Recruit > Auto-DM,
// automations.ts). Scoping rules, caps and rollout: docs/zernio-connection.md.
//
// Secrets: ZERNIO_API_KEY, SOCIAL_CONNECT_USERS (user ids separated by commas, or *),
// ZERNIO_MAX_ACCOUNTS (team cap, 2 when unset). Off, with no Zernio call, unless the key is set and
// the caller is listed (the bare status probe then answers 200 {enabled:false}, anything else 404).
// Deploy WITH JWT verification:
//   supabase functions deploy social --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { zernioClient, type ProfileRow } from "../_shared/zernio.ts";
import { automationErrorReply, isAutomationWrite, parseAutomationRequest, runAutomation } from "./automations.ts";
import { connect, disconnect, errorReply, isAllowed, offReply, parseRequest, status, teamCapOf, type Caller } from "./logic.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Sign in again." }, 401);

  const body = await req.json().catch(() => ({}));
  const key = Deno.env.get("ZERNIO_API_KEY");
  if (!key || !isAllowed(Deno.env.get("SOCIAL_CONNECT_USERS"), uid)) {
    const off = offReply(body);
    return json(off.body, off.status);
  }

  const auto = parseAutomationRequest(body);
  if (auto && !auto.ok) return json({ error: auto.error }, auto.status);
  const r = auto ? null : parseRequest(body);
  if (r && !r.ok) return json({ error: r.error }, r.status);
  const q = auto?.ok ? auto.req : r?.ok ? r.req : null;
  if (!q) return json({ error: "Unknown action." }, 400);
  if (q.action === "status" && !q.profileId) return json({ enabled: true });
  const profileId = q.profileId!;

  const usage = await consumeUsage(admin, uid, q.action === "connect" ? "social-connect" : isAutomationWrite(q.action) ? "social-automation-write" : "social-read");
  if (!usage.allowed) {
    const refusal = usageRefusal(usage);
    return json(refusal.body, refusal.status);
  }

  try {
    // Every adviser's mapping: the recount holds each owner to the per-adviser cap.
    // shortcut: one read, capped at PostgREST's 1000 rows; page it past 1000 brand profiles.
    const { data: all, error } = await admin.from("cs_social_profiles").select("owner_id, profile_id, zernio_profile_id");
    if (error || !Array.isArray(all)) throw new Error(`cs_social_profiles read: ${error?.message}`);
    const rows = all.filter((x) => x.owner_id === uid);
    const caller: Caller = {
      uid,
      profileId,
      mapped: rows.find((x) => x.profile_id === profileId)?.zernio_profile_id ?? null,
      userProfiles: new Set(rows.map((x) => x.zernio_profile_id)),
      ownerOf: new Map(all.map((x) => [x.zernio_profile_id, x.owner_id])),
      teamCap: teamCapOf(Deno.env.get("ZERNIO_MAX_ACCOUNTS")),
    };
    const row: ProfileRow = {
      get: async () => {
        const { data, error } = await admin.from("cs_social_profiles").select("zernio_profile_id").eq("owner_id", uid).eq("profile_id", profileId).maybeSingle();
        if (error) throw new Error(`cs_social_profiles read: ${error.message}`);
        return data?.zernio_profile_id ?? null;
      },
      insert: async (zernioProfileId) => {
        const { error } = await admin
          .from("cs_social_profiles")
          .upsert({ owner_id: uid, profile_id: profileId, zernio_profile_id: zernioProfileId }, { onConflict: "owner_id,profile_id", ignoreDuplicates: true });
        if (error) throw new Error(`cs_social_profiles insert: ${error.message}`);
      },
    };
    const z = zernioClient(key);
    const reply = auto?.ok
      ? await runAutomation(z, caller.mapped, auto.req)
      : q.action === "connect"
        ? await connect(z, caller, row, q.platform, q.reconnectAccountId)
        : q.action === "disconnect"
          ? await disconnect(z, caller, q.accountId)
          : await status(z, caller);
    return json(reply.body, reply.status);
  } catch (e) {
    const reply = (auto ? automationErrorReply(e) : null) ?? errorReply(e);
    if (reply.status >= 500 || reply.status === 402) {
      console.error("social failed", q.action, e instanceof Error ? `${e.name}: ${e.message} ${(e as { code?: string }).code ?? ""}` : String(e));
    }
    return json(reply.body, reply.status);
  }
});
