// The predicted engagement score on a finished draft in Write. POST {text,
// platform} -> {score, down}: Jev (pinned jev-1.13.0) answers five yes/no
// questions about the post, logic.ts weighs them into a score out of 10 and
// lists what pulled it down; the browser shows fixed tips for those. About 820
// Jev input tokens a score (USD 0.00004). Counts against the "post-score"
// daily cap; the browser caches each draft's score so the same text is never
// scored twice. Without Jev (no key, timeout, outage) it says so and Write's
// own craft check still shows.
//
// Secrets: TYPESAFE_API_KEY. Deploy WITH JWT verification:
//   supabase functions deploy post-score --project-ref hgdbflprrficdoyxmdxe --use-api
// Logic: ./logic.ts (tested). Jev: ../_shared/jev.ts. Caps: ../_shared/usageCaps.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { askJev, noulOf } from "../_shared/jev.ts";
import { FACTOR_IDS, SCORE_QUESTIONS, composeScore, mostlyEnglish, parseScoreRequest, scoreState } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const UNAVAILABLE = "The score is unavailable for a moment. Try again shortly.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const parsed = parseScoreRequest(await req.json().catch(() => ({})));
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    if (!mostlyEnglish(parsed.text)) return json({ code: "not_english", error: "The score reads English posts only." }, 422);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to score a post." }, 401);

    if (!Deno.env.get("TYPESAFE_API_KEY")) {
      console.error("TYPESAFE_API_KEY is not set");
      return json({ error: UNAVAILABLE }, 503);
    }
    const usage = await consumeUsage(admin, uid, "post-score");
    if (!usage.allowed) {
      const r = usageRefusal(usage);
      return json(r.body, r.status);
    }

    const answers = await askJev(scoreState(parsed.text, parsed.platform), SCORE_QUESTIONS, { who: "post-score" });
    const result = composeScore(Object.fromEntries(FACTOR_IDS.map((id) => [id, noulOf(answers, id)])));
    if (!result) return json({ error: UNAVAILABLE }, 503);
    return json(result);
  } catch (e) {
    console.error("post-score failed", e);
    return json({ error: UNAVAILABLE }, 500);
  }
});
