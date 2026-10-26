// Remix (docs/north-star/items/remix-everywhere.md). A signed-in adviser on the north-star list sends one source
// (a post, ad or trend, its words already read on the device; the TOPIC_AS formats may send a typed topic instead), what to
// keep, how close, the brand block and their voice; this writes one format (post, carousel, script, a speaking
// script, explainer scenes, slideshow slides, a wall of text, or phase 3's note list, three hooks, an ad image's
// words or three memes) in their brand, checks it against the original (one rewrite when it repeats it, then one
// Jev call for claims and invented facts) and sends it back. The app saves it as a draft; nothing is stored here.
// Phase 3's Jev decisions ride the same one use: an image with no layout gets Jev's layout pick before writing
// (AD_LAYOUT_AT, else Headline ad); a meme's options get funny and unsafe in one call after (unsafe ones dropped,
// all three dropped is 422 with the use kept); an image's words, the best meme and a topic's post, carousel or script
// get the shared MAS question (_shared/mas.ts) for a person's brand, one Jev call on the words, as flags.mas.
// Phase 7: any make but hooks may name a hook `formula` (remix-variations); as "edit" writes a script to a reel's edit
// (remix-format-clone), its [[k]] markers checked in code with one fixing pass in the use, the copy floor over its lines
// and on-screen text, and the MAS question for a person's brand though it has a source.
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
import { MAS_QUESTION, masWarn } from "../_shared/mas.ts";
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
  adLayoutQuestion,
  buildMakePrompt,
  dontReuseFor,
  floorOf,
  holdTheLine,
  jevFacts,
  masText,
  memeQuestions,
  memeState,
  memeVerdict,
  parseMakeRequest,
  pickAdLayout,
  refusalOf,
  responseFormat,
  rewriteMessage,
  makeProblem,
  validateMake,
  withSpoken,
  type MadeResult,
  type MakeOpts,
  type MemeLayout,
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
  const answers = await askJev(fitState(req), fitQuestions(req.video, req.speaker), { who: "remix fit" });
  const result = fitVerdict({
    serves: noulOf(answers, "serves"),
    retell: noulOf(answers, "retell"),
    masSafe: req.speaker === "person" ? noulOf(answers, "masSafe") : null,
    textHeavy: req.video ? noulOf(answers, "textHeavy") : null,
  });
  if (result.verdict === "unknown") await refundUsage(admin, uid, "remix-fit", day);
  console.log("remix fit", result.verdict, result.reasons.join(",") || "-", req.video ? "video" : "text", req.speaker);
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
    // a reel's or TikTok's spoken words, when the breakdown or a pasted-link read cached them: a free row read, never a new read;
    // an edit sends the words the device heard, with the on-screen text after them
    const reel = make.source && make.as !== "edit" && readsVideo(make.source) ? parseReelUrl(make.source.url) : null;
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

    // an image with no layout: Jev picks it from what the ad's picture shows, else its words; Headline ad otherwise
    const opts: MakeOpts = { ...make, layoutBy: "default" };
    if (make.as === "image" && !make.layout) {
      const over = make.shows || make.source?.text;
      const pick = over ? pickAdLayout(await askJev({ ad: over }, adLayoutQuestion(make.brand.speaker), { who: "remix image layout" }), make.brand.speaker) : null;
      make.layout = opts.layout = pick ?? "headline";
      if (pick) opts.layoutBy = "jev";
    }

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
    const write = async (msgs: typeof messages): Promise<{ result: MadeResult; raw: string } | null> => {
      const res = await openaiChat(
        { model: FALLBACK_MODEL, temperature: 0.7, max_tokens: 1800, response_format: responseFormat(make), messages: msgs },
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
      const result = validateMake(make.as, content, opts);
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
    // an edit's misses are counts and markers, never the writer's words: logged so the first try's misses can be read (live-p7a D16)
    const missed = (p: { kind: string; fix: string } | null, pass: string) => p?.kind === "edit" && console.log(`remix check edit ${pass}`, p.fix.split("\n").slice(1, -1).join(" ").slice(0, 600));
    if (problem) {
      missed(problem, "first");
      const fixed = await write([...messages, { role: "assistant", content: first.raw }, { role: "user", content: problem.fix }]);
      const still = fixed ? makeProblem(fixed.result, make) : null;
      if (!fixed || still) {
        missed(still, "fix");
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
        const second = (await write([...messages, { role: "assistant", content: kept.raw }, { role: "user", content: rewriteMessage(lines, make.as) }]).catch(() => null))?.result ?? null;
        // a rewrite that breaks the format's checks is dropped, so the first answer stays
        return second && makeProblem(second, make) ? null : second;
      },
      ask: async (state) => {
        const answers = await askJev({ ...(state as object), facts: jevFacts(make.brand) }, makeQuestions(make.brand.speaker), { who: "remix make" });
        return answers ? { claim: noulOf(answers, "copied_claim"), invented: noulOf(answers, "invented_self") } : null;
      },
    }, floorOf(make));
    let { result, flags } = held;
    if (result.as === "meme") {
      const { best, dropped } = memeVerdict(await askJev(memeState(make.brand), memeQuestions(make.layout as MemeLayout, result.options), { who: "remix meme" }), result.options.length);
      console.log("remix meme", `best ${best}`, `dropped ${dropped.join(",") || "-"}`);
      // the model answered, so the use stays (decision 3)
      if (dropped.length === result.options.length) return fail("refused", "None of these were safe to post. Try another topic.", 422);
      result = { ...result, best, dropped };
    }
    // a topic's post, carousel or script too (the agent's makes), and an edit's script; a source's keep today's answer, with no mas
    if (result.as === "image" || result.as === "meme" || result.as === "edit" || (!make.source && (result.as === "post" || result.as === "carousel" || result.as === "script"))) {
      // the shared MAS question warns and never blocks; a business isn't a licensed adviser, so it isn't asked
      const text = make.brand.speaker === "person" ? masText(result) : null;
      const answers = text ? await askJev({ post: text }, { mas: { type: "noul", instructions: MAS_QUESTION } }, { who: `remix ${result.as} mas` }) : null;
      flags = { ...flags, mas: masWarn(noulOf(answers, "mas")) };
    }
    console.log("remix ok", make.as, make.keep, make.close, `copied ${flags.copied.length}`, `rewrote ${rewrote}`, `tokens ${tokens.join(" | ")}`, `${Date.now() - startedAt}ms`);
    return json({ as: make.as, result, flags, usage: { used: usage.used, limit: usage.limit } });
  } catch (e) {
    console.error("remix failed", e);
    // 500, not 502: the app reads 502 as "nothing was used", which is only true before the model answered
    if (answered) return fail("failed", "That remix didn't go through. Try again.", 500);
    if (charged) await refundUsage(admin, charged.uid, "remix-make", charged.day);
    return fail("failed", "That remix didn't go through. Nothing was used.", 502);
  }
});
