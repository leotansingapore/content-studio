// The predicted engagement score on a finished draft in Write, and the LinkedIn post check ({text, check: "linkedin"}
// -> {verdict, passed, missed, fix}, eleven Jev questions, same cap). POST {text,
// platform} -> {score, down}: Jev (pinned jev-1.13.0) answers five yes/no
// questions about the post, logic.ts weighs them into a score out of 10 and
// lists what pulled it down; the browser shows fixed tips for those. About 820
// Jev input tokens a score (USD 0.00004). Counts against the "post-score"
// daily cap; the browser caches each draft's score so the same text is never
// scored twice. Without Jev (no key, timeout, outage) it says so and Write's
// own craft check still shows.
//
// {format: "carousel" | "short-video"} (edit-score, Leo only) asks the same five
// questions worded for a carousel's slides or a video's script; missing is
// "text-post", today's request word for word. Another format from an account
// off NORTH_STAR_USERS gets 403 not_enabled before anything is counted.
//
// Secrets: TYPESAFE_API_KEY. Deploy WITH JWT verification:
//   supabase functions deploy post-score --project-ref hgdbflprrficdoyxmdxe --use-api
// Logic: ./logic.ts (tested). Jev: ../_shared/jev.ts. Caps: ../_shared/usageCaps.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { askJev, noulOf } from "../_shared/jev.ts";
import { isAllowed } from "../market/logic.ts";
import {
  FACTOR_IDS,
  LINKEDIN_CHECK_IDS,
  LINKEDIN_QUESTIONS,
  composeLinkedInCheck,
  composeScore,
  linkedInState,
  mostlyEnglish,
  parseLinkedInCheck,
  parseScoreRequest,
  scoreQuestions,
  scoreState,
} from "./logic.ts";

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
    const body = await req.json().catch(() => ({}));
    // {check: "linkedin"}: the LinkedIn post check (logic.ts), for everyone, on post-score's daily cap
    const linkedin = parseLinkedInCheck(body);
    if (linkedin && !linkedin.ok) return json({ error: linkedin.error }, 400);
    const parsed = linkedin ? { ok: true as const, text: linkedin.text, platform: "linkedin" as const, format: "text-post" as const } : parseScoreRequest(body);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    if (!mostlyEnglish(parsed.text)) return json({ code: "not_english", error: linkedin ? "The check reads English posts only." : "The score reads English posts only." }, 422);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to score a post." }, 401);
    if (parsed.format !== "text-post" && !isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)) {
      return json({ code: "not_enabled", error: "This isn't switched on for your account yet." }, 403);
    }

    if (!Deno.env.get("TYPESAFE_API_KEY")) {
      console.error("TYPESAFE_API_KEY is not set");
      return json({ error: UNAVAILABLE }, 503);
    }
    const usage = await consumeUsage(admin, uid, "post-score");
    if (!usage.allowed) {
      const r = usageRefusal(usage);
      return json(r.body, r.status);
    }

    if (linkedin) {
      const checked = await askJev(linkedInState(parsed.text), LINKEDIN_QUESTIONS, { who: "post-score-linkedin" });
      const verdict = composeLinkedInCheck(Object.fromEntries(LINKEDIN_CHECK_IDS.map((id) => [id, noulOf(checked, id)])));
      return verdict ? json(verdict) : json({ error: UNAVAILABLE }, 503);
    }
    const answers = await askJev(scoreState(parsed.text, parsed.platform, parsed.format), scoreQuestions(parsed.format), { who: "post-score" });
    const result = composeScore(Object.fromEntries(FACTOR_IDS.map((id) => [id, noulOf(answers, id)])));
    if (!result) return json({ error: UNAVAILABLE }, 503);
    return json(result);
  } catch (e) {
    console.error("post-score failed", e);
    return json({ error: UNAVAILABLE }, 500);
  }
});
