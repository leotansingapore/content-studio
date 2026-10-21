// Remix (docs/north-star/items/remix-everywhere.md). A signed-in adviser on the north-star list sends one source
// (a post, ad or trend, its words already read on the device; a slideshow or wall may send a typed topic instead), what to
// keep, how close, the brand block and their voice; this writes one format (post, carousel, script, a speaking
// script, explainer scenes, slideshow slides or a wall of text) in their brand, checks it against the original (one
// rewrite when it repeats it, then one Jev call for claims and invented facts) and sends it back. The app saves it
// as a draft; nothing is stored here.
//
// Order: JWT, NORTH_STAR_USERS, validate, the cached transcript of a reel or TikTok (cs_reel_sources, never a new read),
// consumeUsage "remix-make", OpenAI, validate, holdTheLine, respond. A call
// the model never answered (OpenAI down, a timeout) gives the use back; an answer that was refused, unusable or failed
// the checks was billed and keeps it, so refusals can't be repeated past the daily cap (security review, 20 Oct).
//
// Two more modes after the same JWT and NORTH_STAR_USERS checks:
//   teardown: a post broken down into its hook, beats and what not to reuse (./teardown.ts, cap remix-teardown);
//     with tags: true, a saved post broken down with its tags (cap post-tags, so saving never eats the remix allowance).
//   fit: Jev only, is this source a good fit for the brand (cap remix-fit); always 200, "unknown" when it can't tell.
//   creator-fit: Jev only, which hand-picked creators fit the brand (./creatorFit.ts, cap creator-fit); { fit: null }
//   when it can't tell.
//
// Secrets: OPENAI_API_KEY, TYPESAFE_API_KEY (Jev; works without it), NORTH_STAR_USERS, APIFY_API_KEY (teardown's
// reel read). Deploy WITH JWT verification.
// Logic: ./logic.ts, ./overlap.ts, ./teardown.ts and ./creatorFit.ts (tested).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, refundUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { openaiChat } from "../_shared/openaiChat.ts";
import { askJev, noulOf } from "../_shared/jev.ts";
import { isAllowed } from "../market/logic.ts";
import { mostlyEnglish } from "../post-score/logic.ts";
import { FETCH_BUDGET_MS, parseReelUrl } from "../clone-reel/logic.ts";
import { findSource, readPost } from "../clone-reel/source.ts";
import { handleTeardown, readsVideo } from "./teardown.ts";
import { handleCreatorFit } from "./creatorFit.ts";
import {
  UNKNOWN_FIT,
  fitQuestions,
  fitState,
  fitVerdict,
  parseFitRequest,
  makeQuestions,
  MAKE_RESPONSE_FORMATS,
  buildMakePrompt,
  dontReuseFor,
  holdTheLine,
  parseMakeRequest,
  refusalOf,
  rewriteMessage,
  makeProblem,
  validateMake,
  withSpoken,
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
const today = () => new Date().toISOString().slice(0, 10); // the counter's day (UTC), as cs_consume_ai_usage keeps it

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Jev only. No key, a source that isn't mostly English, the cap or a Jev outage all answer unknown, with no use kept. */
async function fit(admin: Admin, uid: string, body: unknown): Promise<Response> {
  const req = parseFitRequest(body);
  if (!req) return fail("bad_request", "There's nothing in this post to check.", 400);
  if (!Deno.env.get("TYPESAFE_API_KEY") || !mostlyEnglish(req.source.text)) return json(UNKNOWN_FIT);
  const usage = await consumeUsage(admin, uid, "remix-fit");
  if (!usage.allowed) return json(UNKNOWN_FIT);
  const day = today();
  const answers = await askJev(fitState(req), fitQuestions(req.video), { who: "remix fit" });
  const result = fitVerdict({
    serves: noulOf(answers, "serves"),
    retell: noulOf(answers, "retell"),
    masSafe: noulOf(answers, "masSafe"),
    textHeavy: req.video ? noulOf(answers, "textHeavy") : null,
  });
  if (result.verdict === "unknown") await refundUsage(admin, uid, "remix-fit", day);
  console.log("remix fit", result.verdict, result.reasons.join(",") || "-", req.video ? "video" : "text");
  return json(result);
}

/** teardown.ts holds the flow; this gives it the reader, the counter, OpenAI and Jev. A save's breakdown (tags: true) has its own cap. */
async function teardown(admin: Admin, uid: string, body: unknown): Promise<Response> {
  const tags = (body as { tags?: unknown } | null)?.tags === true;
  const reply = await handleTeardown(body, {
    consume: () => (tags ? consumeUsage(admin, uid, "post-tags") : consumeUsage(admin, uid, "remix-teardown")),
    refund: (day) => (tags ? refundUsage(admin, uid, "post-tags", day) : refundUsage(admin, uid, "remix-teardown", day)),
    readSource: (url) =>
      readPost(admin, url, Deno.env.get("APIFY_API_KEY"), FETCH_BUDGET_MS).then(
        (r) => r && { transcript: r.row.transcript ?? undefined, durationSec: r.row.duration_sec ?? undefined, caption: r.row.caption },
      ),
    openai: async (b, ms) => {
      const res = await openaiChat(b as Record<string, unknown>, { signal: AbortSignal.timeout(ms) });
      if (!res.ok) {
        console.error("teardown openai failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
        return null;
      }
      return res.json();
    },
    ask: (state, q) => askJev(state, q, { who: "remix teardown" }),
  });
  return json(reply.body, reply.status);
}

/** creatorFit.ts holds the flow; this gives it the counter and Jev. */
async function creatorFit(admin: Admin, uid: string, body: unknown): Promise<Response> {
  const reply = await handleCreatorFit(body, {
    hasJev: Boolean(Deno.env.get("TYPESAFE_API_KEY")),
    consume: () => consumeUsage(admin, uid, "creator-fit"),
    refund: (day) => refundUsage(admin, uid, "creator-fit", day),
    ask: (state, q) => askJev(state, q, { who: "remix creator-fit" }),
  });
  return json(reply.body, reply.status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("bad_request", "Use POST.", 405);
  const startedAt = Date.now();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let charged: { uid: string; day: string } | null = null;
  // true once OpenAI has answered (and billed): from then on a failure keeps the use
  let answered = false;
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return fail("unauthorized", "Sign in to remix.", 401);
    if (!isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)) return fail("not_enabled", "This isn't switched on for your account yet.", 403);

    const body = await req.json().catch(() => null);
    const mode = (body as { mode?: unknown } | null)?.mode;
    if (mode === "fit") return await fit(admin, uid, body);
    if (mode === "teardown") return await teardown(admin, uid, body);
    if (mode === "creator-fit") return await creatorFit(admin, uid, body);

    const parsed = parseMakeRequest(body);
    if (parsed.ok === false) return fail("bad_request", parsed.error, 400);
    const make = parsed.value;
    // a reel's or TikTok's spoken words, when the breakdown or a pasted-link read cached them: a free row read, never a new read
    const reel = make.source && readsVideo(make.source) ? parseReelUrl(make.source.url) : null;
    if (make.source && reel?.ok) make.source = withSpoken(make.source, (await findSource(admin, reel).catch(() => null))?.transcript);
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
    charged = { uid, day: today() };

    const { system, user } = buildMakePrompt(make);
    const messages: { role: string; content: string }[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    // tokens per OpenAI call, logged so remix-make's price can be set from real runs (usageCaps.ts / prices.ts)
    const tokens: string[] = [];
    let rewrote = false;
    let rejected = false;
    // the slideshow's or wall's own "this can't be made safe" answer: a 422, never a retry
    const said: { refusal: string | null } = { refusal: null };
    const write = async (msgs: typeof messages): Promise<{ result: MakeResult; raw: string } | null> => {
      const res = await openaiChat(
        { model: FALLBACK_MODEL, temperature: 0.7, max_tokens: 1800, response_format: MAKE_RESPONSE_FORMATS[make.as as keyof typeof MAKE_RESPONSE_FORMATS], messages: msgs },
        { signal: AbortSignal.timeout(AI_TIMEOUT_MS) },
      );
      if (!res.ok) {
        console.error("openai failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
        return null;
      }
      answered = true;
      const data = await res.json().catch(() => null);
      tokens.push(`${data?.model ?? "?"} ${data?.usage?.prompt_tokens ?? "?"} in ${data?.usage?.completion_tokens ?? "?"} out`);
      const content = data?.choices?.[0]?.message?.content ?? null;
      said.refusal = refusalOf(make.as, content);
      if (said.refusal !== null) {
        rejected = false;
        console.log("remix refused", make.as, said.refusal.slice(0, 200));
        return null;
      }
      const result = validateMake(make.as, content);
      rejected = !result;
      if (!result) console.error("openai output rejected", String(content ?? "").slice(0, 300));
      return result ? { result, raw: String(content) } : null;
    };

    let first = await write(messages);
    // an answer the format can't use (a 90-word speaking script, an explainer picture of "chart") gets one more try
    if (!first && rejected) first = await write(messages);
    if (!first && said.refusal !== null) {
      const what = !make.source ? "That topic" : make.as === "slideshow" ? "That slideshow" : "That post";
      return fail("refused", `${what} can't be turned into something safe to post. ${make.source ? "Pick another one." : "Try another one."}`, 422);
    }
    if (!first) {
      if (answered) return fail("unusable", "That remix came back in a shape that can't be used. Try again.", 422);
      await refundUsage(admin, uid, "remix-make", charged.day);
      return fail("failed", "That remix didn't go through. Nothing was used.", 502);
    }
    // the format's checks in code (the slideshow's hook number and brand slide, the wall's emoji, voice and name, a post's
    // or carousel's one brand mention, any format's mid-sentence ending): one fixing pass, then a refusal that keeps the use
    const problem = makeProblem(first.result, make);
    if (problem) {
      const fixed = await write([...messages, { role: "assistant", content: first.raw }, { role: "user", content: problem.fix }]);
      if (!fixed || makeProblem(fixed.result, make)) {
        console.log("remix check refused", make.as, problem.kind);
        return fail("refused", problem.error, 422);
      }
      first = fixed;
    }

    const sourceText = make.source?.text ?? "";
    const kept = first;
    const held = await holdTheLine(kept.result, sourceText, dontReuseFor(make), {
      rewrite: async (lines) => {
        rewrote = true;
        const second = (await write([...messages, { role: "assistant", content: kept.raw }, { role: "user", content: rewriteMessage(lines) }]).catch(() => null))?.result ?? null;
        // a rewrite that breaks the format's checks is dropped, so the first answer stays
        return second && makeProblem(second, make) ? null : second;
      },
      ask: async (state) => {
        const answers = await askJev({ ...(state as object), facts: make.brand.facts }, makeQuestions(make.brand.speaker), { who: "remix make" });
        return answers ? { claim: noulOf(answers, "copied_claim"), invented: noulOf(answers, "invented_self") } : null;
      },
    });
    console.log("remix ok", make.as, make.keep, make.close, `copied ${held.flags.copied.length}`, `rewrote ${rewrote}`, `tokens ${tokens.join(" | ")}`, `${Date.now() - startedAt}ms`);
    return json({ as: make.as, result: held.result, flags: held.flags, usage: { used: usage.used, limit: usage.limit } });
  } catch (e) {
    console.error("remix failed", e);
    // 500, not 502: the app reads 502 as "nothing was used", which is only true before the model answered
    if (answered) return fail("failed", "That remix didn't go through. Try again.", 500);
    if (charged) await refundUsage(admin, charged.uid, "remix-make", charged.day);
    return fail("failed", "That remix didn't go through. Nothing was used.", 502);
  }
});
