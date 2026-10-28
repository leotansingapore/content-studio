// Social accounts (Playbook > Social accounts): status, connect and disconnect an adviser's own
// accounts through Zernio, their comment keyword -> DM automations (Recruit > Auto-DM,
// automations.ts), Post it for me (posts.ts) and their real post numbers (Analytics, metrics.ts).
// Scoping rules, caps and rollout: docs/zernio-connection.md.
//
// Auto-DM (automations.ts) also needs the caller on NORTH_STAR_USERS (Leo), whatever SOCIAL_CONNECT_USERS says.
//
// Secrets: ZERNIO_API_KEY, SOCIAL_CONNECT_USERS (user ids separated by commas, or *),
// ZERNIO_MAX_ACCOUNTS (team cap, 2 when unset), ZERNIO_MAX_PER_USER (the cap for NORTH_STAR_USERS; every other
// owner holds CUSTOMER_ACCOUNT_CAP, 3). Off, with no Zernio call, unless the key is set and
// the caller is listed (the bare status probe then answers 200 {enabled:false}, anything else 404).
// Removing a brand is the exception: it disconnects for any owner, and with no key it is refused
// while the brand has a Zernio profile.
// Deploy WITH JWT verification:
//   supabase functions deploy social --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { zernioClient, type ProfileRow } from "../_shared/zernio.ts";
import { automationErrorReply, isAutomationWrite, parseAutomationRequest, runAutomation } from "./automations.ts";
import { connect, disconnect, errorReply, isAllowed, offReply, ownerCapOf, parseRequest, removalOf, status, teamCapOf, type Caller } from "./logic.ts";
import { metricsErrorReply, parseMetricsRequest, runMetrics } from "./metrics.ts";
import { northStarOnly, parsePostRequest, postErrorReply, runPost } from "./posts.ts";

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
  const removing = removalOf(body);
  if (!key && removing) {
    // Zernio can't be reached: a brand with a Zernio profile is refused (the app keeps it), one that never connected can go
    const { data, error } = await admin.from("cs_social_profiles").select("zernio_profile_id").eq("owner_id", uid).eq("profile_id", removing).maybeSingle();
    if (error) return json({ error: "Something went wrong. Try again." }, 500);
    return data ? json({ code: "unavailable", error: "Social accounts aren't available right now." }, 503) : json({ disconnected: 0 });
  }
  // a brand being removed takes its accounts with it even for an adviser since taken off the list
  if (!key || (!removing && !isAllowed(Deno.env.get("SOCIAL_CONNECT_USERS"), uid))) {
    const off = offReply(body);
    return json(off.body, off.status);
  }

  const posting = parsePostRequest(body, Date.now(), isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid));
  if (posting && !posting.ok) return json({ error: posting.error }, posting.status);
  const auto = posting ? null : parseAutomationRequest(body);
  // Auto-DM (every automated DM and comment reply) is Leo's: posting switched on for a customer never opens it
  if (auto && !isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)) return json({ code: "not_enabled", error: "This isn't switched on for your account yet." }, 403);
  if (auto && !auto.ok) return json({ error: auto.error }, auto.status);
  const metrics = posting || auto ? null : parseMetricsRequest(body);
  if (metrics && !metrics.ok) return json({ error: metrics.error }, metrics.status);
  const r = posting || auto || metrics ? null : parseRequest(body);
  if (r && !r.ok) return json({ error: r.error }, r.status);
  const q = posting?.ok ? posting.req : auto?.ok ? auto.req : metrics?.ok ? metrics.req : r?.ok ? r.req : null;
  if (!q) return json({ error: "Unknown action." }, 400);
  if (q.action === "status" && !q.profileId) return json({ enabled: true });
  const profileId = q.profileId!;

  // a thread or a PDF document is Leo's: refused before a use is counted (runPost checks again before Zernio hears of it)
  if (posting?.ok && northStarOnly(posting.req) && !isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)) {
    return json({ code: "not_enabled", error: "This isn't switched on for your account yet." }, 403);
  }

  // the daily cap this action counts against
  const feature = q.action === "presign" ? "social-presign" : q.action === "schedule" || q.action === "retry" || q.action === "move" ? "social-schedule"
    : q.action === "connect" ? "social-connect" : isAutomationWrite(q.action) ? "social-automation-write" : "social-read";
  const usage = await consumeUsage(admin, uid, feature);
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
    // a customer holds 3 accounts, Leo (NORTH_STAR_USERS) ZERNIO_MAX_PER_USER; the team cap holds everyone
    const capOf = ownerCapOf(Deno.env.get("NORTH_STAR_USERS"), Deno.env.get("ZERNIO_MAX_PER_USER"));
    const caller: Caller = {
      uid,
      profileId,
      mapped: rows.find((x) => x.profile_id === profileId)?.zernio_profile_id ?? null,
      userProfiles: new Set(rows.map((x) => x.zernio_profile_id)),
      ownerOf: new Map(all.map((x) => [x.zernio_profile_id, x.owner_id])),
      teamCap: teamCapOf(Deno.env.get("ZERNIO_MAX_ACCOUNTS")),
      userCap: capOf(uid),
      capOf,
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
    const reply = posting?.ok
      ? await runPost(z, caller.mapped, uid, posting.req)
      : auto?.ok
      ? await runAutomation(z, caller.mapped, auto.req)
      : metrics?.ok
      ? await runMetrics(z, caller.mapped, metrics.req)
      : q.action === "connect"
        ? await connect(z, caller, row, q.platform, q.reconnectAccountId)
        : q.action === "disconnect"
          ? await disconnect(z, caller, q.accountId)
          : await status(z, caller);
    return json(reply.body, reply.status);
  } catch (e) {
    const reply = (posting ? postErrorReply(e) : auto ? automationErrorReply(e) : metrics ? metricsErrorReply(e) : null) ?? errorReply(e);
    if (reply.status >= 500 || reply.status === 402) {
      console.error("social failed", q.action, e instanceof Error ? `${e.name}: ${e.message} ${(e as { code?: string }).code ?? ""}` : String(e));
    }
    return json(reply.body, reply.status);
  }
});
