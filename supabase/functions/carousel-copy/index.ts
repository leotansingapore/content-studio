// "Tighten with AI" on the carousel maker (/carousel). A signed-in consultant
// sends {slides: [{title, body}], platform}; this rewrites the copy tighter and
// MAS-safe with OpenAI and returns the same number of slides in the same order.
// Each call counts against the "carousel" daily cap (cs_ai_usage).
//
// Secrets: OPENAI_API_KEY. Deploy WITH JWT verification:
//   supabase functions deploy carousel-copy --project-ref hgdbflprrficdoyxmdxe --use-api
// Logic: ./logic.ts (tested). Caps: ../_shared/usageCaps.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import {
  buildCarouselPrompt,
  buildOpenAiBody,
  messageContent,
  parseCarouselRequest,
  validateCarouselCopy,
} from "./logic.ts";

const OPENAI_TIMEOUT_MS = 45_000;
const RETRY_LATER = "Couldn't tighten the slides right now. Try again in a minute.";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = parseCarouselRequest(body);
    if (!parsed.ok) return json({ error: parsed.error }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to tighten your slides." }, 401);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      console.error("OPENAI_API_KEY is not set");
      return json({ error: "Tighten with AI isn't switched on yet." }, 503);
    }

    // Count the use before paying for the call; refuse once today's cap is spent.
    const usage = await consumeUsage(admin, uid, "carousel");
    if (!usage.allowed) {
      const refusal = usageRefusal(usage);
      return json(refusal.body, refusal.status);
    }

    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(buildOpenAiBody(buildCarouselPrompt(parsed.request))),
        signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
      });
    } catch (e) {
      console.error("carousel-copy openai request failed", e);
      return json({ error: RETRY_LATER }, 502);
    }
    if (!res.ok) {
      console.error("carousel-copy openai error", res.status, (await res.text()).slice(0, 300));
      return json({ error: RETRY_LATER }, 502);
    }

    const data = await res.json().catch(() => null);
    const slides = validateCarouselCopy(messageContent(data), parsed.request.slides.length);
    if (!slides) {
      console.error("carousel-copy: unusable model output");
      return json({ error: RETRY_LATER }, 502);
    }
    return json({ slides, usage: { used: usage.used, limit: usage.limit } });
  } catch (e) {
    console.error("carousel-copy failed", e);
    return json({ error: "Couldn't tighten the slides. Try again in a minute." }, 500);
  }
});
