// linkedin-strategy (/linkedin): the interview's answers into a three-month LinkedIn strategy. POST { answers, name,
// profession } -> { strategy, usage }. One OpenAI call writes it (./logic.ts STRATEGY_FORMAT); nothing is stored here,
// the app keeps it on the device (content-studio-linkedin-, synced).
//
// On for every sign-in (Leo, 30 Oct). Cap "linkedin-strategy" (5 a day, one use a run). The use comes back only when
// OpenAI never answered (non-2xx, a timeout); an answer that can't be used (422) keeps it.
//
// Secrets (set already): OPENAI_API_KEY. Deploy WITH JWT verification:
//   supabase functions deploy linkedin-strategy --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { openaiChat } from "../_shared/openaiChat.ts";
import { consumeUsage, refundUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { buildPrompt, parseRequest, parseStrategy, strategyBody } from "./logic.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
const fail = (status: number, code: string, error: string) => json({ code, error }, status);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
// deno-lint-ignore no-explicit-any
type Admin = any; // as remix-patterns: ReturnType<typeof createClient> resolves to a schema the usage helpers reject

const FAILED = "Couldn't write your strategy. Try again in a minute.";
const AI_TIMEOUT_MS = 90_000;

async function run(admin: Admin, uid: string, body: unknown): Promise<Response> {
  const r = parseRequest(body);
  if (typeof r === "string") return fail(400, "bad_request", r);
  if (!Deno.env.get("OPENAI_API_KEY")) return fail(503, "not_configured", "Strategies aren't switched on yet.");

  // the counter's day (UTC), read before the count, so a refund near midnight finds the row
  const day = new Date().toISOString().slice(0, 10);
  const usage = await consumeUsage(admin, uid, "linkedin-strategy");
  if (!usage.allowed) {
    const refusal = usageRefusal(usage);
    return json(refusal.body, refusal.status);
  }
  let answered = false;
  try {
    const res = await openaiChat(strategyBody(buildPrompt(r)), { signal: AbortSignal.timeout(AI_TIMEOUT_MS) });
    if (!res.ok) {
      console.error("linkedin-strategy: openai", res.status, (await res.text().catch(() => "")).slice(0, 300));
      await refundUsage(admin, uid, "linkedin-strategy", day);
      return fail(502, "failed", FAILED);
    }
    answered = true;
    const data = await res.json().catch(() => null);
    const strategy = parseStrategy(data?.choices?.[0]?.message?.content ?? null);
    console.log("linkedin-strategy", strategy ? "ok" : "unusable", `tokens ${data?.usage?.prompt_tokens ?? "?"} in ${data?.usage?.completion_tokens ?? "?"} out`);
    if (!strategy) return fail(422, "unusable", "That strategy came back in a shape that can't be used. Try again.");
    return json({ strategy, usage: { used: usage.used, limit: usage.limit } });
  } catch (e) {
    console.error("linkedin-strategy: run", msg(e));
    // the model never answered (a timeout, a dropped connection): the use goes back
    if (!answered) await refundUsage(admin, uid, "linkedin-strategy", day);
    return fail(answered ? 500 : 502, "failed", FAILED);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in again." }, 401);
    return await run(admin, uid, await req.json().catch(() => ({})));
  } catch (e) {
    console.error("linkedin-strategy failed", msg(e));
    return fail(500, "failed", "Something went wrong. Try again in a minute.");
  }
});
