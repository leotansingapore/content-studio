// Storyboard for any reel idea in Write. A signed-in consultant sends the
// spoken script of a short-video draft; this asks OpenAI to split it into a
// shot list (say, on screen, show, seconds), the same rows Clone a reel shows.
//
// - The script is the consultant's own; nothing is fetched or stored here.
// - Each request counts once against the daily cap (usageCaps "storyboard").
//
// Secrets: OPENAI_API_KEY. Deploy WITH JWT verification.
// Logic: ./logic.ts (tested).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import {
  STORYBOARD_RESPONSE_FORMAT,
  buildStoryboardPrompt,
  parseStoryboardRequest,
  validateStoryboard,
} from "./logic.ts";

const OPENAI_MODEL = "gpt-4.1";
const AI_TIMEOUT_MS = 60_000;

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

const fail = (code: string, error: string, status: number) => json({ code, error }, status);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("bad_request", "Use POST.", 405);
  const startedAt = Date.now();
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return fail("unauthorized", "Sign in to make a storyboard.", 401);

    const parsed = parseStoryboardRequest(await req.json().catch(() => null));
    if (parsed.ok === false) return fail("bad_request", parsed.error, 400);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      console.error("OPENAI_API_KEY is not set");
      return fail("not_configured", "Storyboards aren't switched on yet.", 503);
    }

    const charged = await consumeUsage(admin, uid, "storyboard");
    if (!charged.allowed) {
      const refusal = usageRefusal(charged);
      return json(refusal.body, refusal.status);
    }

    const { system, user } = buildStoryboardPrompt(parsed.value);
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          temperature: 0.5,
          max_tokens: 1800,
          response_format: STORYBOARD_RESPONSE_FORMAT,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });
    } catch (e) {
      console.error("openai request failed", e);
      return (e as Error)?.name === "TimeoutError"
        ? fail("timeout", "The storyboard took too long. Try again.", 504)
        : fail("ai_failed", "The storyboard didn't come back. Try again.", 502);
    }
    if (!res.ok) {
      console.error("openai failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return fail("ai_failed", "The storyboard didn't come back. Try again.", 502);
    }
    const data = await res.json().catch(() => null);
    const message = data?.choices?.[0]?.message;
    if (message?.refusal) console.error("openai refused", String(message.refusal).slice(0, 200));
    const beats = validateStoryboard(message?.content ?? null);
    if (!beats) {
      console.error("openai output rejected", String(message?.content ?? "").slice(0, 300));
      return fail("ai_failed", "The storyboard didn't come back right. Try again.", 502);
    }
    console.log("storyboard ok", beats.length, `${Date.now() - startedAt}ms`);
    return json({ beats, usage: { used: charged.used, limit: charged.limit } });
  } catch (e) {
    console.error("storyboard failed", e);
    return fail("server_error", "Something went wrong. Try again in a minute.", 500);
  }
});
