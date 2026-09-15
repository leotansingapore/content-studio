// "Idea Dump" on the Coach page. A signed-in consultant sends rough notes (one
// idea per line, or a messy paragraph) plus optional context from the app
// (voice sample, positioning, preferred platforms); this returns a developed
// post brief for each idea. Nothing is stored here: the app saves the briefs
// under content-studio-ideadump-<userId>, which syncs across devices.
//
// Secrets: OPENAI_API_KEY. Deploy WITH JWT verification.
// Daily cap: "idea-dump" in ../_shared/usageCaps.ts (needs migration 009).
// Logic: ./logic.ts (tested).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import {
  IDEA_BRIEF_SCHEMA,
  NO_IDEAS_MESSAGE,
  buildIdeaDumpPrompt,
  parseIdeaDumpRequest,
  validateBriefs,
} from "./logic.ts";

const OPENAI_MODEL = "gpt-4.1";
const OPENAI_TIMEOUT_MS = 90_000;

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

/** One structured-output call. Returns the JSON text, or null on any failure. */
async function developWithOpenAi(system: string, user: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.7,
        max_tokens: 6000,
        response_format: {
          type: "json_schema",
          json_schema: { name: "idea_briefs", strict: true, schema: IDEA_BRIEF_SCHEMA },
        },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("openai failed", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const data = await res.json();
    const choice = data?.choices?.[0];
    if (choice?.message?.refusal) {
      console.error("openai refused", String(choice.message.refusal).slice(0, 200));
      return null;
    }
    if (choice?.finish_reason === "length") console.error("openai output hit max_tokens");
    return typeof choice?.message?.content === "string" ? choice.message.content : null;
  } catch (e) {
    console.error("openai error", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to develop your ideas." }, 401);

    const body = await req.json().catch(() => null);
    const parsed = parseIdeaDumpRequest(body);
    if (!parsed.ok) return json({ error: parsed.error, code: parsed.code }, parsed.status);
    const { request } = parsed;

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      console.error("OPENAI_API_KEY is not set");
      return json({ error: "Idea Dump isn't switched on yet.", code: "not_configured" }, 503);
    }

    // Counted before the paid call, once per request (fails closed).
    const usage = await consumeUsage(admin, uid, "idea-dump");
    if (!usage.allowed) {
      const refusal = usageRefusal(usage);
      return json(refusal.body, refusal.status);
    }

    const { system, user } = buildIdeaDumpPrompt(request);
    const content = await developWithOpenAi(system, user, apiKey);
    const result =
      content === null ? null : validateBriefs(content, { notes: request.ideas, platforms: request.context.platforms });
    if (!result) {
      return json({ error: "Couldn't develop your ideas right now. Try again in a minute.", code: "ai_failed" }, 502);
    }
    if (result.briefs.length === 0) {
      // The model judged every note too thin (or unsafe) to develop.
      return json({ error: NO_IDEAS_MESSAGE, code: "no_ideas", skipped: result.skipped }, 422);
    }
    console.log("idea-dump", uid, "ideas", request.ideas.length, "briefs", result.briefs.length, "skipped", result.skipped.length);
    return json({
      briefs: result.briefs,
      skipped: result.skipped,
      usage: { used: usage.used, limit: usage.limit },
    });
  } catch (e) {
    console.error("idea-dump failed", e);
    return json({ error: "Couldn't develop your ideas. Try again in a minute." }, 500);
  }
});
