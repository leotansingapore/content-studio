// hook-writer (/hooks, My hooks): POST { topic, n, format, name, profession, about, facts, kept, rejected } ->
// { hooks, usage }. One OpenAI call writes 5 to 30 hooks (./logic.ts HOOKS_FORMAT); nothing is stored here, the app
// keeps the batch and the turned-down hooks on the device (content-studio-hookwriter-, synced) and the kept ones as
// snippets of kind "hook".
//
// On for every sign-in. Cap "hook-writer" (20 a day, one use a batch). The use comes back only when OpenAI never
// answered (non-2xx, a timeout); an answer that can't be used (422) keeps it.
//
// Secrets (set already): OPENAI_API_KEY. Deploy WITH JWT verification:
//   supabase functions deploy hook-writer --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { openaiChat } from "../_shared/openaiChat.ts";
import { consumeUsage, refundUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { buildPrompt, hooksBody, parseHooks, parseRequest } from "./logic.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
const fail = (status: number, code: string, error: string) => json({ code, error }, status);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
// deno-lint-ignore no-explicit-any
type Admin = any; // as linkedin-strategy: ReturnType<typeof createClient> resolves to a schema the usage helpers reject

const FAILED = "Couldn't write hooks just now. Try again in a minute.";
const AI_TIMEOUT_MS = 60_000;

async function run(admin: Admin, uid: string, body: unknown): Promise<Response> {
  const r = parseRequest(body);
  if (typeof r === "string") return fail(400, "bad_request", r);
  if (!Deno.env.get("OPENAI_API_KEY")) return fail(503, "not_configured", "Hook writing isn't switched on yet.");

  // the counter's day (UTC), read before the count, so a refund near midnight finds the row
  const day = new Date().toISOString().slice(0, 10);
  const usage = await consumeUsage(admin, uid, "hook-writer");
  if (!usage.allowed) {
    const refusal = usageRefusal(usage);
    return json(refusal.body, refusal.status);
  }
  let answered = false;
  try {
    const res = await openaiChat(hooksBody(buildPrompt(r)), { signal: AbortSignal.timeout(AI_TIMEOUT_MS) });
    if (!res.ok) {
      console.error("hook-writer: openai", res.status, (await res.text().catch(() => "")).slice(0, 300));
      await refundUsage(admin, uid, "hook-writer", day);
      return fail(502, "failed", FAILED);
    }
    answered = true;
    const data = await res.json().catch(() => null);
    const hooks = parseHooks(data?.choices?.[0]?.message?.content ?? null, r);
    console.log("hook-writer", hooks ? `${hooks.length} of ${r.n}` : "unusable", `tokens ${data?.usage?.prompt_tokens ?? "?"} in ${data?.usage?.completion_tokens ?? "?"} out`);
    if (!hooks) return fail(422, "unusable", "Those hooks came back in a shape that can't be used. Try again.");
    return json({ hooks, usage: { used: usage.used, limit: usage.limit } });
  } catch (e) {
    console.error("hook-writer: run", msg(e));
    // the model never answered (a timeout, a dropped connection): the use goes back
    if (!answered) await refundUsage(admin, uid, "hook-writer", day);
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
    console.error("hook-writer failed", msg(e));
    return fail(500, "failed", "Something went wrong. Try again in a minute.");
  }
});
