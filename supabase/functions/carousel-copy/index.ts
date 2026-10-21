// "Tighten with AI" on the carousel maker (/carousel). A signed-in consultant
// sends {slides: [{title, body}], platform, recap}; this rewrites the copy tighter and
// MAS-safe with OpenAI and returns the same number of slides in the same order,
// plus, when recap is asked for, a recap slide listing the points (or null).
// Each call counts against the "carousel" daily cap (cs_ai_usage).
//
// Mode "ask" (Rewrite this slide, NORTH_STAR_USERS only; 403 not_enabled for anyone else before any count):
//   {mode: "ask", ask, index?, platform, slides: [{texts}]} -> {slides: [{texts}], reply, usage}, cap "edit-ask".
//   With index only that slide comes back. "Stronger hook" on the cover writes three hooks and Jev picks one
//   (TYPESAFE_API_KEY; the first without an answer). The use goes back only when OpenAI never answered (502);
//   an unusable answer keeps it (422). Logic: runAsk in ./logic.ts. No mode is today's Tighten, unchanged.
//
// Secrets: OPENAI_API_KEY. Deploy WITH JWT verification:
//   supabase functions deploy carousel-copy --project-ref hgdbflprrficdoyxmdxe --use-api
// Logic: ./logic.ts (tested). Caps: ../_shared/usageCaps.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, refundUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { askJev } from "../_shared/jev.ts";
import { isAllowed } from "../market/logic.ts";
import {
  ASK_FAILED,
  buildCarouselPrompt,
  buildOpenAiBody,
  messageContent,
  parseCarouselRequest,
  runAsk,
  validateCarouselCopy,
  validateRecap,
} from "./logic.ts";
import { openaiFetch } from "../_shared/openaiChat.ts";

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
    // its own order (sign-in, gate, check, count), so a request with no mode runs today's Tighten below unchanged
    if ((body as { mode?: unknown } | null)?.mode === "ask") return await ask(req, body);
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
      res = await openaiFetch("https://api.openai.com/v1/chat/completions", {
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
    const content = messageContent(data);
    const slides = validateCarouselCopy(content, parsed.request.slides.length);
    if (!slides) {
      console.error("carousel-copy: unusable model output");
      return json({ error: RETRY_LATER }, 502);
    }
    // the recap slide is extra: a missing one never fails the tightened slides
    const recap = parsed.request.recap ? validateRecap(content) : null;
    return json({ slides, recap, usage: { used: usage.used, limit: usage.limit } });
  } catch (e) {
    console.error("carousel-copy failed", e);
    return json({ error: "Couldn't tighten the slides. Try again in a minute." }, 500);
  }
});

async function ask(req: Request, body: unknown): Promise<Response> {
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to rewrite your slides." }, 401);
    if (!isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)) return json({ code: "not_enabled", error: "This isn't switched on for your account yet." }, 403);
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      console.error("OPENAI_API_KEY is not set");
      return json({ code: "unavailable", error: "Rewriting isn't switched on yet." }, 503);
    }
    const day = new Date().toISOString().slice(0, 10); // the counter's day (UTC), read before it moves
    const out = await runAsk(body, {
      consume: () => consumeUsage(admin, uid, "edit-ask"),
      refund: () => refundUsage(admin, uid, "edit-ask", day),
      openai: async (b) => {
        const res = await openaiFetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(b),
          signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
        }).catch((e) => (console.error("carousel-copy ask: openai request failed", e), null));
        if (!res?.ok) {
          if (res) console.error("carousel-copy ask: openai error", res.status, (await res.text().catch(() => "")).slice(0, 300));
          return null;
        }
        // OpenAI answered: an unreadable body is an unusable answer, not a missing one
        return await res.json().catch(() => ({}));
      },
      jev: (state, questions) => askJev(state, questions, { who: "carousel-copy ask hook" }),
    });
    return json(out.body, out.status);
  } catch (e) {
    console.error("carousel-copy ask failed", e);
    return json({ code: "failed", error: ASK_FAILED }, 500);
  }
}
