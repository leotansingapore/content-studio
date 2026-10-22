// "Idea Dump" on the Coach page. A signed-in consultant sends rough notes (one
// idea per line, or a messy paragraph) plus optional context from the app
// (voice sample, positioning, preferred platforms); this returns a developed
// post brief for each idea. Nothing is stored here: the app saves the briefs
// under content-studio-ideadump-<userId>, which syncs across devices.
//
// mode "long": one long piece (a talk transcript, newsletter, webinar notes)
// comes back as its claims, numbers, stories and quotable lines, and 5
// standalone posts, each opening with one of the 5 hook formulas the app sent.
// The app saves the posts the consultant keeps as drafts. For a caller on NORTH_STAR_USERS (phase 5,
// plan-interview) the optional `source` ("interview", "voice", "text") and `speaker` pick the prompt's first line;
// everyone else's are ignored, so today's prompt is unchanged.
//
// mode "angles" (phase 5, Leo only while NORTH_STAR_USERS lists the caller, 403 not_enabled before anything is
// counted): up to 5 angles for a campaign's audience. The LLM writes 8, Jev keeps the ones that fit and are safe.
// Cap "campaign-angles"; the use goes back only when OpenAI never answered (502), and a reply that keeps no angle
// keeps it (422 no_angles).
//
// mode "campaign" (phase 5, Leo only, the same gate): up to 7 of a campaign's posts in one call, each in its
// format's shape, or one post written again with `swap`. Cap "campaign-swap" for a swap, else "campaign-draft"; the
// use goes back only when OpenAI never answered (502), and a reply where no post survives keeps it (422 unusable).
// A person's posts each get Jev's MAS question in one call (`mas`, a warning that never blocks); a business's get null.
//
// Secrets: OPENAI_API_KEY; TYPESAFE_API_KEY for Jev (the plan modes work without it). Deploy WITH JWT verification.
// Daily caps: "idea-dump" and "repurpose-long" in ../_shared/usageCaps.ts (migration 009), and the phase 5 caps.
// Logic: ./logic.ts (tested).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, refundUsage, usageRefusal, type RpcClient, type UsageClient } from "../_shared/usageCaps.ts";
import { askJev, noulOf, JEV_TIMEOUT_MS } from "../_shared/jev.ts";
import { pool } from "../_shared/pool.ts";
import { isAllowed } from "../market/logic.ts";
import {
  ANGLES_SCHEMA,
  CAMPAIGN_SCHEMA,
  IDEA_BRIEF_SCHEMA,
  LONG_SCHEMA,
  NO_IDEAS_MESSAGE,
  buildIdeaDumpPrompt,
  angleAsk,
  buildAnglesPrompt,
  buildCampaignPrompt,
  campaignCap,
  buildLongPrompt,
  keepAngles,
  masAsk,
  parseAnglesRequest,
  parseCampaignRequest,
  parseIdeaDumpRequest,
  parseLongRequest,
  validateAngles,
  validateBriefs,
  validateCampaign,
  validateLong,
  withMas,
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

/** What one OpenAI call gave: its text, or whether it answered at all (non-2xx, timeout or no connection is not answering). */
type OpenAiReply = { ok: true; text: string } | { ok: false; answered: boolean };

/** One structured-output call. A use goes back only when `answered` is false (phase 4 decision 3). */
async function developWithOpenAi(
  system: string,
  user: string,
  apiKey: string,
  out: { name: string; schema: unknown; maxTokens: number } = { name: "idea_briefs", schema: IDEA_BRIEF_SCHEMA, maxTokens: 6000 },
): Promise<OpenAiReply> {
  let res: Response;
  try {
    res = await openaiFetch("https://api.openai.com/v1/chat/completions", {
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
  } catch (e) {
    console.error("openai error", e);
    return { ok: false, answered: false };
  }
  if (!res.ok) {
    console.error("openai failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
    return { ok: false, answered: false };
  }
  // OpenAI answered (and billed): from here a failure keeps the use
  const data = await res.json().catch(() => null);
  const choice = data?.choices?.[0];
  if (choice?.message?.refusal) {
    console.error("openai refused", String(choice.message.refusal).slice(0, 200));
    return { ok: false, answered: true };
  }
  if (choice?.finish_reason === "length") console.error("openai output hit max_tokens");
  return typeof choice?.message?.content === "string" ? { ok: true, text: choice.message.content } : { ok: false, answered: true };
}

/** Today's modes read any failure as null and never give the use back (pinned). */
const textOf = (r: OpenAiReply) => (r.ok ? r.text : null);

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
  // source and speaker (plan-interview) are read for a listed caller only; everyone else gets today's prompt
  const listed = isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid);
  const { system, user } = buildLongPrompt(listed ? request : { ...request, source: "text", speaker: "person" });
  const content = textOf(await developWithOpenAi(system, user, apiKey, { name: "long_piece_week", schema: LONG_SCHEMA, maxTokens: 4500 }));
  const result = content === null ? null : validateLong(content, request.formulas);
  if (!result || result.posts.length === 0) {
    return json({ error: "Couldn't write posts from this piece right now. Try again in a minute.", code: "ai_failed" }, 502);
  }
  console.log("idea-dump long", uid, "chars", request.text.length, "posts", result.posts.length);
  return json({ ...result, truncated: request.truncated, usage: { used: usage.used, limit: usage.limit } });
}

/** Today's counter day (UTC), read before the counter moves so a refund lands on the same row. */
const usageDay = () => new Date().toISOString().slice(0, 10);

async function suggestAngles(admin: UsageClient, uid: string, body: unknown): Promise<Response> {
  const parsed = parseAnglesRequest(body);
  if (!parsed.ok) return json({ code: "bad_request", error: parsed.error }, 400);
  const { request } = parsed;
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ code: "not_configured", error: "This isn't switched on yet." }, 503);
  const day = usageDay();
  const usage = await consumeUsage(admin, uid, "campaign-angles");
  if (!usage.allowed) {
    const refusal = usageRefusal(usage);
    return json(refusal.body, refusal.status);
  }
  const { system, user } = buildAnglesPrompt(request);
  const reply = await developWithOpenAi(system, user, apiKey, { name: "campaign_angles", schema: ANGLES_SCHEMA, maxTokens: 1500 });
  if (!reply.ok && !reply.answered) {
    await refundUsage(admin, uid, "campaign-angles", day);
    return json({ code: "failed", error: "Couldn't suggest angles right now. Try again in a minute." }, 502);
  }
  const candidates = (reply.ok && validateAngles(reply.text, request.avoid)) || [];
  const answers = await pool(candidates, 6, (a) => {
    const ask = angleAsk(request, a);
    return askJev(ask.state, ask.questions, { who: "idea-dump angles", timeoutMs: JEV_TIMEOUT_MS });
  });
  const kept = keepAngles(candidates, answers);
  // decision 12: every candidate's scores from the first runs set ANGLE_FITS and ANGLE_UNSAFE
  console.log("idea-dump angles", uid, "kept", kept.angles.length, "scored", kept.scored, JSON.stringify(candidates.map((a, k) => [a.title, noulOf(answers[k], "fits"), noulOf(answers[k], "unsafe")])));
  if (!kept.angles.length) return json({ code: "no_angles", error: "Couldn't find angles that fit this time. Try again, or write your own." }, 422);
  return json(kept);
}

async function writeCampaign(admin: UsageClient, uid: string, body: unknown): Promise<Response> {
  const parsed = parseCampaignRequest(body);
  if (!parsed.ok) return json({ code: "bad_request", error: parsed.error }, 400);
  const { request } = parsed;
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ code: "not_configured", error: "This isn't switched on yet." }, 503);
  const cap = campaignCap(request) satisfies "campaign-swap" | "campaign-draft";
  const day = usageDay();
  const usage = await consumeUsage(admin, uid, cap);
  if (!usage.allowed) {
    const refusal = usageRefusal(usage);
    return json(refusal.body, refusal.status);
  }
  const { system, user } = buildCampaignPrompt(request);
  const reply = await developWithOpenAi(system, user, apiKey, { name: "campaign_posts", schema: CAMPAIGN_SCHEMA, maxTokens: 6000 });
  if (!reply.ok && !reply.answered) {
    await refundUsage(admin, uid, cap, day);
    return json({ code: "failed", error: request.swap ? "Couldn't write new words right now. Try again in a minute." : "Couldn't write these posts right now. Try again in a minute." }, 502);
  }
  const written = (reply.ok && validateCampaign(reply.text, request)) || [];
  if (!written.length) {
    console.log("idea-dump campaign", uid, cap, "asked", request.posts.length, "written 0");
    return json({ code: "unusable", error: "The words that came back couldn't be used. Try again." }, 422);
  }
  const speaker = request.context.speaker;
  const mas = speaker === "person" ? masAsk(written) : null;
  const answers = mas ? await askJev(mas.state, mas.questions, { who: "idea-dump campaign mas" }) : null;
  const posts = withMas(written, answers, speaker);
  // decision 12: Jev's MAS yes per post number (never the words) for setting MAS_WARN
  console.log("idea-dump campaign", uid, cap, "asked", request.posts.length, "written", posts.length, "mas", JSON.stringify(posts.map((p) => [p.n, noulOf(answers, `mas_${p.n}`)])));
  return json({ posts });
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
    const mode = body && typeof body === "object" ? (body as { mode?: unknown }).mode : undefined;
    if (mode === "long") return await repurposeLong(admin, uid, body);
    if (mode === "angles" || mode === "campaign") {
      if (!isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)) return json({ code: "not_enabled", error: "This isn't switched on for your account yet." }, 403);
      return mode === "angles" ? await suggestAngles(admin, uid, body) : await writeCampaign(admin, uid, body);
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
    const content = textOf(await developWithOpenAi(system, user, apiKey));
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
