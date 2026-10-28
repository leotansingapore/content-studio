// "Clone a reel" (/clone). A signed-in consultant sends {url, voice, formulas},
// plus their optional {angle} and saved {positioning}, both used as material only;
// this reads the public Instagram reel or TikTok video through Apify (caption,
// transcript, numbers), then asks OpenAI to break down why it worked, offer 3
// concepts built on it and write the consultant's own version of the first.
// With {concept} as well it writes the version of that concept from the cached
// post (usageCaps "reel-concepts"); a post never cloned is refused, not scraped.
// With {style: true} it only reads the post (no OpenAI) and returns it with
// Instagram's video link, for "Copy a reel's style" in the video editor; the
// scrape counts as "reel-style", a cached post costs nothing.
//
// - Public post data is cached in cs_reel_sources (supabase/hub/010), so the
//   same post pasted again skips the scrape. Numbers are re-read after 24 hours;
//   transcripts are kept. Nothing about the consultant is stored here.
// - Every request that reaches a paid call counts once against the daily cap
//   (usageCaps "reel-clone"). A cache hit still counts: the AI call costs money.
// - The answer comes back within about 90 seconds. A scrape that is still
//   running then keeps going in the background and fills the cache, and a retry
//   re-attaches to that run (cs_reel_fetches) instead of starting another.
// - Only links that parseReelUrl accepts are sent to Apify, rebuilt from their
//   validated parts. This function never fetches a pasted URL itself; the one
//   relay ({video}) takes only Instagram video-CDN links (isIgVideoUrl), no redirects.
//
// Secrets: APIFY_API_KEY, OPENAI_API_KEY. Deploy WITH JWT verification.
// Logic: ./logic.ts (tested). The Apify reader: ./source.ts (shared with remix and remix-link).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, usageRefusal, type UsageResult } from "../_shared/usageCaps.ts";
import {
  BACKGROUND_LIMIT_MS,
  CLONE_ERRORS,
  CLONE_RESPONSE_FORMAT,
  CONCEPT_RESPONSE_FORMAT,
  FETCH_BUDGET_MS,
  aiTimeoutMs,
  buildClonePrompt,
  buildConceptPrompt,
  cleanConcept,
  parseReelUrl,
  readDecision,
  sanitizeAngle,
  sanitizeFormulas,
  sanitizePositioning,
  sanitizeVoice,
  toCloneSource,
  validateCloneOutput,
  validateConceptOutput,
  type CloneErrorCode,
  type CloneResponse,
  type ConceptResponse,
  isIgVideoUrl,
  MAX_RELAY_BYTES,
} from "./logic.ts";
import { openaiFetch } from "../_shared/openaiChat.ts";
import { isAllowed } from "../market/logic.ts";
import { CloneFailure, fetchSource, findSource, keepRunning, withinBudget } from "./source.ts";
import { professionOf } from "../_shared/profession.ts";

const OPENAI_MODEL = "gpt-4.1";

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

function failure(code: CloneErrorCode): Response {
  return json({ code, error: CLONE_ERRORS[code].message }, CLONE_ERRORS[code].status);
}

async function write<T>(
  prompt: { system: string; user: string },
  ask: { format: unknown; maxTokens: number; validate: (raw: unknown) => T | null },
  apiKey: string,
  timeoutMs: number,
): Promise<T> {
  let res: Response;
  try {
    res = await openaiFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.7,
        max_tokens: ask.maxTokens,
        response_format: ask.format,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    console.error("openai request failed", e);
    throw new CloneFailure((e as Error)?.name === "TimeoutError" ? "timeout" : "ai_failed");
  }
  if (!res.ok) {
    console.error("openai failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
    throw new CloneFailure("ai_failed");
  }
  const data = await res.json().catch(() => null);
  const message = data?.choices?.[0]?.message;
  if (message?.refusal) console.error("openai refused", String(message.refusal).slice(0, 200));
  const output = ask.validate(message?.content ?? null);
  if (!output) {
    console.error("openai output rejected", String(message?.content ?? "").slice(0, 300));
    throw new CloneFailure("ai_failed");
  }
  return output;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ code: "bad_request", error: "Use POST." }, 405);
  const startedAt = Date.now();
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return failure("unauthorized");

    const body = await req.json().catch(() => ({}));
    // {video}: relay a reel's video when Instagram's CDN refuses the browser (some of its hosts send no CORS
    // header). Only Instagram's own video hosts, https, no redirects, at most MAX_RELAY_BYTES, capped per day.
    if (body?.video !== undefined) {
      if (!isIgVideoUrl(body.video)) return json({ code: "bad_url", error: "That isn't an Instagram video link." }, 400);
      const usage = await consumeUsage(admin, uid, "reel-video");
      if (!usage.allowed) {
        const r = usageRefusal(usage);
        return json(r.body, r.status);
      }
      const res = await fetch(body.video, { redirect: "manual", signal: AbortSignal.timeout(60_000) }).catch(() => null);
      if (!res?.ok || !res.body) {
        await res?.body?.cancel();
        return json({ code: "fetch_failed", error: "Instagram didn't send the video. Read the reel again." }, 502);
      }
      // video only: the same hosts serve pictures and other files
      const type = res.headers.get("content-type") ?? "";
      if (!type.startsWith("video/") && type !== "application/octet-stream") {
        await res.body.cancel();
        return json({ code: "not_video", error: "That link isn't a video." }, 415);
      }
      const size = Number(res.headers.get("content-length") ?? 0);
      if (size > MAX_RELAY_BYTES) {
        await res.body.cancel();
        return json({ code: "too_big", error: "This video is too large to read." }, 413);
      }
      let seen = 0;
      const capped = res.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, out) {
          seen += chunk.byteLength;
          if (seen > MAX_RELAY_BYTES) out.error(new Error("too big"));
          else out.enqueue(chunk);
        },
      }));
      // octet-stream, so supabase-js and plain fetch both hand it back as a Blob
      return new Response(capped, { headers: { ...corsHeaders, "Content-Type": "application/octet-stream", "Cache-Control": "no-store", ...(size ? { "Content-Length": String(size) } : {}) } });
    }
    const parsed = parseReelUrl(body?.url);
    if (parsed.ok === false) return json({ code: "bad_url", error: parsed.message }, 400);

    const styleOnly = body?.style === true && body?.concept === undefined;
    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
    if (!openaiKey && !styleOnly) {
      console.error("OPENAI_API_KEY is not set");
      return failure("not_configured");
    }
    // standing notes (brand-voice-memory) only for NORTH_STAR_USERS: anyone else's prompt is today's
    const voice = sanitizeVoice(body?.voice, isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid));
    const formulas = sanitizeFormulas(body?.formulas);
    // profession: the brand's "What do you do?"; none, or an adviser's, keeps today's prompt
    const profession = professionOf(body?.profession);
    const brief = { angle: sanitizeAngle(body?.angle), positioning: sanitizePositioning(body?.positioning), profession };
    const concept = body?.concept === undefined ? null : cleanConcept(body.concept);
    if (body?.concept !== undefined && !concept) {
      return json({ code: "bad_request", error: "Pick one of the concepts first." }, 400);
    }

    let row = await findSource(admin, parsed);
    let videoUrl: string | null = null;
    // A concept is written from the post already cloned; it never scrapes.
    const decision = readDecision(row, startedAt, Boolean(concept));
    if (decision === "refuse") return failure("not_cloned");

    // Counted once per request, just before its first paid call.
    let usage: UsageResult | null = null;
    const charge = async () => (usage ??= await consumeUsage(admin, uid, styleOnly ? "reel-style" : concept ? "reel-concepts" : "reel-clone"));

    if (decision !== "use") {
      const apifyKey = Deno.env.get("APIFY_API_KEY");
      if (!apifyKey) {
        console.error("APIFY_API_KEY is not set");
        if (!row) return failure("not_configured");
      } else {
        const charged = await charge();
        if (!charged.allowed) {
          const refusal = usageRefusal(charged);
          return json(refusal.body, refusal.status);
        }
        const work = fetchSource({
          admin,
          token: apifyKey,
          parsed,
          existing: row,
          deadline: startedAt + BACKGROUND_LIMIT_MS,
        });
        const outcome = await withinBudget(work, FETCH_BUDGET_MS - (Date.now() - startedAt));
        if (outcome.kind === "done") {
          ({ row, videoUrl } = outcome.value);
        } else {
          if (outcome.kind === "timeout") keepRunning(work);
          const code = outcome.kind === "timeout" ? "timeout" : outcome.code;
          // Stale numbers beat no answer: fall back to the cached post when the refresh fails.
          if (!row) return failure(code);
          console.warn("refresh failed, using cached post", parsed.lookupKey, code);
        }
      }
    }

    if (styleOnly) {
      console.log("clone-reel style ok", parsed.platform, decision, `${Date.now() - startedAt}ms`);
      return json({ source: { ...toCloneSource(row!), videoUrl } });
    }

    const charged = await charge();
    if (!charged.allowed) {
      const refusal = usageRefusal(charged);
      return json(refusal.body, refusal.status);
    }
    const aiMs = aiTimeoutMs(Date.now() - startedAt);
    if (aiMs === 0) return failure("timeout");

    const source = toCloneSource(row!);
    if (concept) {
      const myVersion = await write(
        buildConceptPrompt(source, voice, concept, formulas, profession),
        { format: CONCEPT_RESPONSE_FORMAT, maxTokens: 1800, validate: validateConceptOutput },
        openaiKey,
        aiMs,
      );
      console.log("clone-reel concept ok", parsed.platform, decision, `${Date.now() - startedAt}ms`);
      const response: ConceptResponse = { myVersion, usage: { used: charged.used, limit: charged.limit } };
      return json(response);
    }
    const output = await write(
      buildClonePrompt(source, voice, formulas, brief),
      { format: CLONE_RESPONSE_FORMAT, maxTokens: 2600, validate: validateCloneOutput },
      openaiKey,
      aiMs,
    );
    console.log("clone-reel ok", parsed.platform, decision, `${Date.now() - startedAt}ms`);
    const response: CloneResponse = {
      source: { ...source, videoUrl },
      ...output,
      cached: decision === "use",
      usage: { used: charged.used, limit: charged.limit },
    };
    return json(response);
  } catch (e) {
    if (e instanceof CloneFailure) return failure(e.code);
    console.error("clone-reel failed", e);
    return failure("server_error");
  }
});
