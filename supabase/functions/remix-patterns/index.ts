// remix-patterns (/following?account=<platform>:<handle>&view=patterns, docs/north-star/items/remix-patterns.md part A):
// what one followed account's best posts share, and 3 ideas for the brand from it. POST { account, checkedAt, posts
// (<=12, best first), best (the app's top 3 at 1.5x or more, from scoreAccount), brand, voice } -> { tags, patterns,
// ideas, from }. Jev tags each post's hook formula, structure and topic; strongestPatterns counts what the best posts
// share; one OpenAI call writes the ideas. Nothing is stored here: the app keeps the result per account.
//
// Leo only while NORTH_STAR_USERS lists the caller. Cap "remix-patterns" (one use a run). The use comes back only when
// OpenAI never answered (non-2xx, timeout); Jev being down still writes ideas from the best posts and keeps it, as
// does an answer that can't be used (422).
//
// Secrets (all set already): NORTH_STAR_USERS, OPENAI_API_KEY, TYPESAFE_API_KEY (works without it). Deploy WITH JWT
// verification:
//   supabase functions deploy remix-patterns --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { askJev } from "../_shared/jev.ts";
import { openaiChat } from "../_shared/openaiChat.ts";
import { pool } from "../_shared/pool.ts";
import { consumeUsage, refundUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { isAllowed } from "../market/logic.ts";
import { allowedPatterns, ideasBody, ideasPrompt, parseIdeas, parseRequest, QUESTIONS, strongestPatterns, tagsFrom, tagState } from "./logic.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
const fail = (status: number, code: string, error: string) => json({ code, error }, status);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
// deno-lint-ignore no-explicit-any
type Admin = any; // as market: ReturnType<typeof createClient> resolves to a schema the usage helpers reject

const FAILED = "Couldn't read their posts. Try again.";
const AI_TIMEOUT_MS = 60_000;

async function run(admin: Admin, uid: string, body: unknown): Promise<Response> {
  const r = parseRequest(body);
  if (typeof r === "string") return fail(400, "bad_request", r);
  if (!Deno.env.get("OPENAI_API_KEY")) return fail(503, "not_configured", "What worked isn't switched on yet.");

  // the counter's day (UTC), read before the count, so a refund near midnight finds the row
  const day = new Date().toISOString().slice(0, 10);
  const usage = await consumeUsage(admin, uid, "remix-patterns");
  if (!usage.allowed) {
    const refusal = usageRefusal(usage);
    return json(refusal.body, refusal.status);
  }
  let answered = false;
  try {
    // Without Jev (no key, a timeout) tags stay {} and the ideas come from the best posts.
    const answers = await pool(r.posts, 6, (p) => askJev(tagState(p), QUESTIONS, { who: "remix-patterns tags" }));
    const tags = tagsFrom(r.posts, answers);
    const patterns = Object.keys(tags).length ? strongestPatterns(r.posts, tags, r.best) : [];

    const res = await openaiChat(ideasBody(ideasPrompt(r, patterns, tags)), { signal: AbortSignal.timeout(AI_TIMEOUT_MS) });
    if (!res.ok) {
      console.error("remix-patterns: openai", res.status, (await res.text().catch(() => "")).slice(0, 300));
      await refundUsage(admin, uid, "remix-patterns", day);
      return fail(502, "failed", FAILED);
    }
    answered = true;
    const data = await res.json().catch(() => null);
    const ideas = parseIdeas(data?.choices?.[0]?.message?.content ?? null, allowedPatterns(patterns, r.posts, tags));
    console.log("remix-patterns", `@${r.account.handle}`, `tagged ${Object.keys(tags).length}/${r.posts.length}`, `patterns ${patterns.length}`, `ideas ${ideas?.length ?? 0}`, `tokens ${data?.usage?.prompt_tokens ?? "?"} in ${data?.usage?.completion_tokens ?? "?"} out`);
    if (!ideas) return fail(422, "unusable", "Those ideas came back in a shape that can't be used. Try again.");
    return json({ tags, patterns, ideas, from: patterns.some((p) => p.field !== "topic") ? "patterns" : "best" });
  } catch (e) {
    console.error("remix-patterns: run", msg(e));
    // the model never answered (a timeout, a dropped connection): the use goes back
    if (!answered) await refundUsage(admin, uid, "remix-patterns", day);
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
    if (!isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)) return fail(403, "not_enabled", "This isn't switched on for your account yet.");
    return await run(admin, uid, await req.json().catch(() => ({})));
  } catch (e) {
    console.error("remix-patterns failed", msg(e));
    return fail(500, "failed", "Something went wrong. Try again in a minute.");
  }
});
