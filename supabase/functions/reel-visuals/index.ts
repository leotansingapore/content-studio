// The visual half of "Clone a reel" (/clone). After a clone, the app samples
// frames from the Instagram reel at each scene change and measures its pacing;
// this sends them to OpenAI to read the original's look and plan a shot for
// each beat of the consultant's version.
//
// - The frames are images the signed-in user's browser made; nothing is
//   fetched here and nothing is stored.
// - Each request counts once against the daily cap (usageCaps "reel-visuals").
// - {mode: "style", frames, pacing}: "Copy a reel's style" in the video editor.
//   OpenAI writes how the captions and framing look and reads the overlays,
//   Jev picks the editor's look from that (style.ts), same cap.
//
// Secrets: OPENAI_API_KEY. Deploy WITH JWT verification.
// Logic: ./logic.ts (tested).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { askJev } from "../_shared/jev.ts";
import { VISUALS_RESPONSE_FORMAT, buildVisualsPrompt, parseVisualsRequest, validateVisuals } from "./logic.ts";
import { STYLE_RESPONSE_FORMAT, buildStylePrompt, parseStyleRequest, readLook, styleQuestions, styleState, validateStyle } from "./style.ts";

const OPENAI_MODEL = "gpt-4.1";
const AI_TIMEOUT_MS = 70_000;

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
    if (!uid) return fail("unauthorized", "Sign in to read the video.", 401);

    const body = await req.json().catch(() => null);
    const styleMode = body?.mode === "style";
    const parsed = styleMode ? parseStyleRequest(body) : parseVisualsRequest(body);
    if (parsed.ok === false) return fail("bad_request", parsed.error, 400);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      console.error("OPENAI_API_KEY is not set");
      return fail("not_configured", "Reading the video isn't switched on yet.", 503);
    }

    const charged = await consumeUsage(admin, uid, "reel-visuals");
    if (!charged.allowed) {
      const refusal = usageRefusal(charged);
      return json(refusal.body, refusal.status);
    }

    const { system, parts } = styleMode ? buildStylePrompt(parsed.value) : buildVisualsPrompt(parsed.value as Parameters<typeof buildVisualsPrompt>[0]);
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          temperature: 0.4,
          max_tokens: styleMode ? 900 : 1500,
          response_format: styleMode ? STYLE_RESPONSE_FORMAT : VISUALS_RESPONSE_FORMAT,
          messages: [
            { role: "system", content: system },
            { role: "user", content: parts },
          ],
        }),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });
    } catch (e) {
      console.error("openai request failed", e);
      return (e as Error)?.name === "TimeoutError"
        ? fail("timeout", "Reading the video took too long. Try again.", 504)
        : fail("ai_failed", "The video breakdown didn't come back. Try again.", 502);
    }
    if (!res.ok) {
      console.error("openai failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return fail("ai_failed", "The video breakdown didn't come back. Try again.", 502);
    }
    const data = await res.json().catch(() => null);
    const message = data?.choices?.[0]?.message;
    if (message?.refusal) console.error("openai refused", String(message.refusal).slice(0, 200));
    if (styleMode) {
      const style = validateStyle(message?.content ?? null, parsed.value.pacing.durationSec);
      if (!style) {
        console.error("openai style output rejected", String(message?.content ?? "").slice(0, 300));
        return fail("ai_failed", "The reel's look didn't come back right. Try again.", 502);
      }
      // Jev picks the look from the description (Leo's rule: a pick is a decision); null keeps the person's own
      const look = readLook(await askJev(styleState(style), styleQuestions(), { who: "reel-visuals style", timeoutMs: 10_000 }));
      console.log("reel-visuals style ok", parsed.value.frames.length, `${Date.now() - startedAt}ms`);
      return json({ style, look, usage: { used: charged.used, limit: charged.limit } });
    }
    const beats = (parsed.value as Parameters<typeof buildVisualsPrompt>[0]).beats;
    const visuals = validateVisuals(message?.content ?? null, beats.length, parsed.value.pacing.durationSec);
    if (!visuals) {
      console.error("openai output rejected", String(message?.content ?? "").slice(0, 300));
      return fail("ai_failed", "The video breakdown didn't come back right. Try again.", 502);
    }
    console.log("reel-visuals ok", parsed.value.frames.length, `${Date.now() - startedAt}ms`);
    return json({ visuals, usage: { used: charged.used, limit: charged.limit } });
  } catch (e) {
    console.error("reel-visuals failed", e);
    return fail("server_error", "Something went wrong. Try again in a minute.", 500);
  }
});
