// Remix (docs/north-star/items/remix-everywhere.md). A signed-in adviser on the north-star list sends one source
// (a post, ad or trend, its words already read on the device), what to keep, how close, the brand block and their
// voice; this writes one format (post, carousel or script) in their brand, checks it against the original (one
// rewrite when it repeats it, then one Jev call for claims and invented facts) and sends it back. The app saves it
// as a draft; nothing is stored here.
//
// Order: JWT, NORTH_STAR_USERS, validate, consumeUsage "remix-make", OpenAI, validate, holdTheLine, respond. Any
// failure after the count gives the use back.
//
// Secrets: OPENAI_API_KEY, TYPESAFE_API_KEY (Jev; works without it), NORTH_STAR_USERS. Deploy WITH JWT verification.
// Logic: ./logic.ts and ./overlap.ts (tested).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, refundUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { openaiChat } from "../_shared/openaiChat.ts";
import { askJev, noulOf } from "../_shared/jev.ts";
import { isAllowed } from "../market/logic.ts";
import {
  MAKE_QUESTIONS,
  MAKE_RESPONSE_FORMATS,
  buildMakePrompt,
  dontReuseFor,
  holdTheLine,
  parseMakeRequest,
  rewriteMessage,
  validateMake,
  type MakeResult,
} from "./logic.ts";

const FALLBACK_MODEL = "gpt-4.1";
const AI_TIMEOUT_MS = 60_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const fail = (code: string, error: string, status: number) => json({ code, error }, status);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("bad_request", "Use POST.", 405);
  const startedAt = Date.now();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let charged: { uid: string; day: string } | null = null;
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return fail("unauthorized", "Sign in to remix.", 401);
    if (!isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)) return fail("not_enabled", "This isn't switched on for your account yet.", 403);

    const parsed = parseMakeRequest(await req.json().catch(() => null));
    if (parsed.ok === false) return fail("bad_request", parsed.error, 400);
    const make = parsed.value;
    if (!Deno.env.get("OPENAI_API_KEY")) {
      console.error("OPENAI_API_KEY is not set");
      return fail("unavailable", "Remix isn't available right now. Try again later.", 503);
    }

    const usage = await consumeUsage(admin, uid, "remix-make");
    if (!usage.allowed) {
      const refusal = usageRefusal(usage);
      return json(refusal.body, refusal.status);
    }
    // the counter's day (UTC), as cs_consume_ai_usage keeps it, so a refund near midnight finds the row
    charged = { uid, day: new Date().toISOString().slice(0, 10) };

    const { system, user } = buildMakePrompt(make);
    const messages: { role: string; content: string }[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    const write = async (msgs: typeof messages): Promise<{ result: MakeResult; raw: string } | null> => {
      const res = await openaiChat(
        { model: FALLBACK_MODEL, temperature: 0.7, max_tokens: 1800, response_format: MAKE_RESPONSE_FORMATS[make.as as "post"], messages: msgs },
        { signal: AbortSignal.timeout(AI_TIMEOUT_MS) },
      );
      if (!res.ok) {
        console.error("openai failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
        return null;
      }
      const content = (await res.json().catch(() => null))?.choices?.[0]?.message?.content ?? null;
      const result = validateMake(make.as, content);
      if (!result) console.error("openai output rejected", String(content ?? "").slice(0, 300));
      return result ? { result, raw: String(content) } : null;
    };

    const first = await write(messages);
    if (!first) {
      await refundUsage(admin, uid, "remix-make", charged.day);
      return fail("failed", "That remix didn't go through. Nothing was used.", 502);
    }

    const source = make.source!;
    const held = await holdTheLine(first.result, source.text, dontReuseFor(make), {
      rewrite: async (lines) =>
        (await write([...messages, { role: "assistant", content: first.raw }, { role: "user", content: rewriteMessage(lines) }]).catch(() => null))?.result ?? null,
      ask: async (state) => {
        const answers = await askJev({ ...(state as object), facts: make.brand.facts }, MAKE_QUESTIONS, { who: "remix make" });
        return answers ? { claim: noulOf(answers, "copied_claim"), invented: noulOf(answers, "invented_self") } : null;
      },
    });
    console.log("remix ok", make.as, make.keep, make.close, `copied ${held.flags.copied.length}`, `${Date.now() - startedAt}ms`);
    return json({ as: make.as, result: held.result, flags: held.flags, usage: { used: usage.used, limit: usage.limit } });
  } catch (e) {
    console.error("remix failed", e);
    if (charged) await refundUsage(admin, charged.uid, "remix-make", charged.day);
    return fail("failed", "That remix didn't go through. Nothing was used.", 502);
  }
});
