// "Idea Dump" on the Coach page. A signed-in consultant sends rough notes (one
// idea per line, or a messy paragraph) plus optional context from the app
// (voice sample, positioning, preferred platforms); this returns a developed
// post brief for each idea. Nothing is stored here: the app saves the briefs
// under content-studio-ideadump-<userId>, which syncs across devices.
//
// mode "long": one long piece (a talk transcript, newsletter, webinar notes)
// comes back as its claims, numbers, stories and quotable lines, and 5
// standalone posts, each opening with one of the 5 hook formulas the app sent.
// The app saves the posts the consultant keeps as drafts.
//
// Secrets: OPENAI_API_KEY. Deploy WITH JWT verification.
// Daily caps: "idea-dump" and "repurpose-long" in ../_shared/usageCaps.ts (migration 009).
// Logic: ./logic.ts (tested).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, usageRefusal, type RpcClient } from "../_shared/usageCaps.ts";
import {
  IDEA_BRIEF_SCHEMA,
  LONG_SCHEMA,
  NO_IDEAS_MESSAGE,
  buildIdeaDumpPrompt,
  buildLongPrompt,
  parseIdeaDumpRequest,
  parseLongRequest,
  validateBriefs,
  validateLong,
} from "./logic.ts";
import { openaiFetch } from "../_shared/openaiChat.ts";

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
async function developWithOpenAi(
  system: string,
  user: string,
  apiKey: string,
  out: { name: string; schema: unknown; maxTokens: number } = { name: "idea_briefs", schema: IDEA_BRIEF_SCHEMA, maxTokens: 6000 },
): Promise<string | null> {
  try {
    const res = await openaiFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.7,
        max_tokens: out.maxTokens,
        response_format: {
          type: "json_schema",
          json_schema: { name: out.name, strict: true, schema: out.schema },
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

async function repurposeLong(admin: RpcClient, uid: string, body: unknown): Promise<Response> {
  const parsed = parseLongRequest(body);
  if (!parsed.ok) return json({ error: parsed.error, code: parsed.code }, parsed.status);
  const { request } = parsed;
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.error("OPENAI_API_KEY is not set");
    return json({ error: "This isn't switched on yet.", code: "not_configured" }, 503);
  }
  // Counted before the paid call (fails closed). About 6k tokens in, 4.5k out at most.
  const usage = await consumeUsage(admin, uid, "repurpose-long");
  if (!usage.allowed) {
    const refusal = usageRefusal(usage);
    return json(refusal.body, refusal.status);
  }
  const { system, user } = buildLongPrompt(request);
  const content = await developWithOpenAi(system, user, apiKey, { name: "long_piece_week", schema: LONG_SCHEMA, maxTokens: 4500 });
  const result = content === null ? null : validateLong(content, request.formulas);
  if (!result || result.posts.length === 0) {
    return json({ error: "Couldn't write posts from this piece right now. Try again in a minute.", code: "ai_failed" }, 502);
  }
  console.log("idea-dump long", uid, "chars", request.text.length, "posts", result.posts.length);
  return json({ ...result, truncated: request.truncated, usage: { used: usage.used, limit: usage.limit } });
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
    if (body && typeof body === "object" && (body as { mode?: unknown }).mode === "long") {
      return await repurposeLong(admin, uid, body);
    }
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
