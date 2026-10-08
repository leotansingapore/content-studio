// Following (Discover > Following): one check of one public Instagram or TikTok
// account through the same Apify scrapers as the account audit, about 15 posts.
// Each check counts once against the "track-accounts" daily cap. The app keeps
// the history (a synced key), so nothing is stored here.
//
// Secrets: APIFY_API_KEY. Deploy WITH JWT verification:
//   supabase functions deploy track-accounts --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { AuditError, scrapeAccount } from "../_shared/auditRunner.ts";
import { parseTrackRequest, POSTS_PER_CHECK, shapeResult } from "./logic.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const r = parseTrackRequest(await req.json().catch(() => ({})));
    if (!r.ok) return json({ error: r.error }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to follow accounts." }, 401);

    const apifyKey = Deno.env.get("APIFY_API_KEY");
    if (!apifyKey) {
      console.error("APIFY_API_KEY is not set");
      return json({ error: "Following isn't switched on yet." }, 503);
    }
    const usage = await consumeUsage(admin, uid, "track-accounts");
    if (!usage.allowed) {
      const refusal = usageRefusal(usage);
      return json(refusal.body, refusal.status);
    }

    // A few extra for pinned posts, which are left out.
    const { profile, posts } = await scrapeAccount(r.platform, r.handle, apifyKey, POSTS_PER_CHECK + 3);
    return json({ ...shapeResult(r.platform, profile, posts), checkedAt: new Date().toISOString() });
  } catch (e) {
    if (e instanceof AuditError) return json({ error: e.message }, 422);
    console.error("track-accounts failed", e instanceof Error ? e.message : String(e));
    return json({ error: "Couldn't check that account right now. Try again in a few minutes." }, 500);
  }
});
