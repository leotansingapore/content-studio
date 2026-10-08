// Engage this week (Discover > Following): the 2 likely clients, from people
// who commented on the adviser's own posts (kept by the account audit), with
// Jev judging which comments sound like a possible client; plus the adviser's
// usual views, which the app uses to sort creators into bigger and peers.
// Counts once against the "engage-picks" daily cap; one Jev call, no AI writing.
//
// Secrets: TYPESAFE_API_KEY (optional: without it the newest commenters show).
// Deploy WITH JWT verification:
//   supabase functions deploy engage-picks --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { askJev } from "../_shared/jev.ts";
import { candidatesFrom, jevAsk, pickClients, type AuditLike } from "./logic.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to see who to engage with." }, 401);

    // only the caller's own audits
    const { data: rows, error } = await admin
      .from("cs_social_audits")
      .select("platform, handle, posts, stats")
      .eq("user_id", uid)
      .eq("status", "ready")
      .order("last_viewed_at", { ascending: false })
      .limit(4);
    if (error) throw error;
    const audits = (rows ?? []) as (AuditLike & { stats?: { medianViews?: number | null; medianInteractions?: number } | null })[];
    const usual = audits.map((a) => a.stats?.medianViews).find((v) => typeof v === "number") ?? null;
    if (!audits.length) return json({ clients: [], usualViews: null, audited: false, kept: false });
    // audits read before commenters were kept have none until their next refresh
    const kept = audits.some((a) => (a.posts ?? []).some((p) => Array.isArray(p.commenters)));

    const cands = candidatesFrom(audits);
    if (!cands.length) return json({ clients: [], usualViews: usual, audited: true, kept });
    const usage = await consumeUsage(admin, uid, "engage-picks");
    if (!usage.allowed) {
      const r = usageRefusal(usage);
      return json(r.body, r.status);
    }
    const { state, questions } = jevAsk(cands);
    const answers = Object.keys(questions).length ? await askJev(state, questions, { who: "engage-picks" }) : null;
    return json({ clients: pickClients(cands, answers), usualViews: usual, audited: true, kept, judged: !!answers });
  } catch (e) {
    console.error("engage-picks failed", e instanceof Error ? e.message : String(e));
    return json({ error: "Couldn't load this week's list right now. Try again in a minute." }, 500);
  }
});
