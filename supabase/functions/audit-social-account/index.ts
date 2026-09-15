// "Your account audit" on the Analytics page. A signed-in consultant sends
// {platform, handle}; this returns their saved audit and, when it is stale
// (at most once every 20 hours), starts a refresh in the background. The app
// then polls its cs_social_audits row until the refresh finishes.
//
// Secrets: APIFY_API_KEY, OPENAI_API_KEY. Deploy WITH JWT verification.
// Logic: ../_shared/socialAudit.ts (tested) and ../_shared/auditRunner.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { freshnessOf, normalizeHandle, refreshDecision, type AuditPlatform } from "../_shared/socialAudit.ts";
import { claimAudit, runAudit } from "../_shared/auditRunner.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

/** Refreshes one consultant can start per day, across their accounts. */
const MAX_RUNS_PER_DAY = 6;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// deno-lint-ignore no-explicit-any
async function findRow(admin: any, uid: string, platform: AuditPlatform, handle: string) {
  const { data, error } = await admin
    .from("cs_social_audits")
    .select("*")
    .eq("user_id", uid)
    .eq("platform", platform)
    .eq("handle", handle)
    .maybeSingle();
  if (error) throw error;
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const platform = body?.platform as AuditPlatform;
    if (platform !== "instagram" && platform !== "tiktok") {
      return json({ error: "Choose Instagram or TikTok." }, 400);
    }
    const handle = normalizeHandle(platform, String(body?.handle ?? ""));
    if (!handle) {
      return json(
        { error: `That doesn't look like ${platform === "instagram" ? "an Instagram" : "a TikTok"} handle.` },
        400,
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to audit your account." }, 401);

    // One audited account per platform: a new handle replaces the old one.
    const cleared = await admin
      .from("cs_social_audits")
      .delete()
      .eq("user_id", uid)
      .eq("platform", platform)
      .neq("handle", handle);
    if (cleared.error) throw cleared.error;

    let row = await findRow(admin, uid, platform, handle);
    if (!row) {
      const inserted = await admin
        .from("cs_social_audits")
        .insert({ user_id: uid, platform, handle })
        .select("*")
        .single();
      // A second tab may have inserted it first; the unique key keeps one row.
      row = inserted.data ?? (await findRow(admin, uid, platform, handle));
      if (!row) throw inserted.error ?? new Error("audit row missing after insert");
    }

    const viewed = await admin
      .from("cs_social_audits")
      .update({ last_viewed_at: new Date().toISOString() })
      .eq("id", row.id);
    if (viewed.error) console.error("last_viewed_at update failed", row.id, viewed.error);

    if (refreshDecision(freshnessOf(row), Date.now()).action !== "refresh") {
      return json({ audit: row });
    }

    const apifyKey = Deno.env.get("APIFY_API_KEY");
    if (!apifyKey) {
      console.error("APIFY_API_KEY is not set");
      return json({ audit: row, notice: "Account audits aren't switched on yet." });
    }

    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const { count, error: countError } = await admin
      .from("cs_social_audit_runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .gte("at", dayAgo);
    if (countError) throw countError;
    if ((count ?? 0) >= MAX_RUNS_PER_DAY) {
      return json({
        audit: row,
        notice: "You've used today's updates. Your audit refreshes again tomorrow.",
      });
    }

    const claimed = await claimAudit(admin, row.id);
    if (!claimed) return json({ audit: row });
    const logged = await admin
      .from("cs_social_audit_runs")
      .insert({ user_id: uid, audit_id: row.id, source: "open" });
    if (logged.error) console.error("run log insert failed", logged.error);

    const work = runAudit({
      admin,
      audit: claimed,
      apifyKey,
      openaiKey: Deno.env.get("OPENAI_API_KEY"),
    });
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
    else await work;
    return json({ audit: claimed });
  } catch (e) {
    console.error("audit-social-account failed", e);
    return json({ error: "The audit couldn't start. Try again in a minute." }, 500);
  }
});
