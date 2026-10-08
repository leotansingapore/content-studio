// Drafts for the Engage page (/recruit/engage). The consultant pastes text in
// and copies drafts out; this function never posts, comments or messages
// (docs/social-api-app-review.md). Jev (pinned jev-1.13.0) sorts, OpenAI (the
// audit's key) writes. POST {mode, ...}:
//   mode "replies" {post?, comments:[{name?, text}]} -> {items:[{i, name, text,
//     kind, reply, dm?}]}: the comments under their own post, sorted into
//     potential client, adds something, peer, support or noise, clients first,
//     a reply for each but noise and a first DM for each client. About 320 Jev
//     input tokens a comment and one OpenAI call (about 2 US cents for 30
//     comments). Cap "engage-replies".
// A comment mostly in another script is "unsorted" and still drafted; without
// Jev (no key, timeout, outage) every comment is unsorted, in paste order.
//
// Secrets: OPENAI_API_KEY, TYPESAFE_API_KEY. Deploy WITH JWT verification:
//   supabase functions deploy engage-assist --project-ref hgdbflprrficdoyxmdxe --use-api
// Logic: ./logic.ts (tested). Jev: ../_shared/jev.ts. Caps: ../_shared/usageCaps.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { askJev } from "../_shared/jev.ts";
import { openAiJson } from "../_shared/auditRunner.ts";
import { buildRepliesPrompt, commentQuestions, commentState, parseEngageRequest, readCommentKinds, readReplies } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const parsed = parseEngageRequest(await req.json().catch(() => ({})));
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const r = parsed.request;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to draft replies." }, 401);
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return json({ error: "Drafting isn't switched on yet." }, 503);

    const usage = await consumeUsage(admin, uid, "engage-replies");
    if (!usage.allowed) {
      const refusal = usageRefusal(usage);
      return json(refusal.body, refusal.status);
    }

    const questions = commentQuestions(r.comments);
    const answers = Object.keys(questions).length ? await askJev(commentState(r.post), questions, { who: "engage-assist replies" }) : null;
    const kinds = readCommentKinds(answers, r.comments);
    let content: string | null = null;
    if (kinds.some((k) => k !== "noise")) {
      const { system, user } = buildRepliesPrompt(r.post, r.comments, kinds);
      content = await openAiJson(system, user, key, { temperature: 0.6, maxTokens: 3000 });
      if (content === null) return json({ error: "Couldn't write the replies right now. Try again in a minute." }, 502);
    }
    return json({ items: readReplies(content, r.comments, kinds), usage: { used: usage.used, limit: usage.limit } });
  } catch (e) {
    console.error("engage-assist failed", e);
    return json({ error: "Something went wrong. Try again." }, 500);
  }
});
