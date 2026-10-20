// remix-link (docs/north-star/items/remix-any-link.md): reads one pasted link, an uploaded picture or a video's
// frames into a source the Remix sheet can use. Reading is all it does; the breakdown and the writing happen in
// the remix function on its own caps. Nothing is stored here beyond Clone a reel's own cs_reel_sources cache.
//
// - {mode: "link", url}: Instagram and TikTok through Clone a reel's reader (clone-reel/source.ts). A post already
//   in cs_reel_sources is used as it is, free and not counted; otherwise one "remix-link" use, then Apify. YouTube:
//   one "remix-link" use, then DataForSEO captions (about US$0.006). Sites this build doesn't read are refused
//   before any count (logic.ts notYet).
// - {mode: "image" | "frames", sha1}: one "remix-image" use, then OpenAI vision copies the words and says what is
//   visible. The pictures are read once and not kept.
// Any failure after the count gives the use back, on the UTC day it was counted.
//
// Order: JWT, NORTH_STAR_USERS, validate, cache, key check, consumeUsage, read, respond.
// Secrets: NORTH_STAR_USERS, APIFY_API_KEY, DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD, OPENAI_API_KEY.
// Deploy WITH JWT verification: supabase functions deploy remix-link --project-ref hgdbflprrficdoyxmdxe --use-api
// Logic: ./logic.ts (tested).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, refundUsage, usageRefusal, type UsageResult } from "../_shared/usageCaps.ts";
import { openaiChat } from "../_shared/openaiChat.ts";
import { isAllowed } from "../market/logic.ts";
import { BACKGROUND_LIMIT_MS, FETCH_BUDGET_MS, parseReelUrl } from "../clone-reel/logic.ts";
import { fetchSource, findSource, keepRunning, withinBudget } from "../clone-reel/source.ts";
import { captionSentences } from "../youtube-captions/logic.ts";
import {
  LINK_COPY,
  VISION_RESPONSE_FORMAT,
  apifyJobFor,
  buildVisionPrompt,
  notYet,
  parseLinkRequest,
  parseRemixLink,
  siteName,
  toSource,
  uploadSource,
  type LinkedSource,
} from "./logic.ts";

const FALLBACK_MODEL = "gpt-4.1";
const AI_TIMEOUT_MS = 70_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const fail = (code: string, error: string, status: number) => json({ code, error }, status);
const refused = (usage: Extract<UsageResult, { allowed: false }>) => {
  const r = usageRefusal(usage);
  return json(r.body, r.status);
};
const answer = (source: LinkedSource, usage: { used: number; limit: number } | null) => json({ source, usage });
// the counter's day (UTC), as cs_consume_ai_usage keeps it, so a refund near midnight finds the row
const utcDay = () => new Date().toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("bad_request", "Use POST.", 405);
  const startedAt = Date.now();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let charged: { uid: string; feature: "remix-link" | "remix-image"; day: string } | null = null;
  const refund = async () => {
    if (charged) await refundUsage(admin, charged.uid, charged.feature, charged.day);
    charged = null;
  };
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return fail("unauthorized", "Sign in to read a post.", 401);
    if (!isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)) return fail("not_enabled", LINK_COPY.notAllowed, 403);

    const parsed = parseLinkRequest(await req.json().catch(() => null));
    if (parsed.ok === false) return fail("bad_request", parsed.error, 400);
    const body = parsed.value;

    if (body.mode === "link") {
      const link = parseRemixLink(body.url);
      if (link.ok === false) return fail("bad_url", link.message, 400);
      const off = notYet(link.kind);
      if (off) return fail("not_switched_on", off, 400);

      if (link.kind === "youtube") {
        const login = Deno.env.get("DATAFORSEO_LOGIN");
        const password = Deno.env.get("DATAFORSEO_PASSWORD");
        if (!login || !password) {
          console.error("DATAFORSEO credentials are not set");
          return fail("unavailable", LINK_COPY.keyMissing("YouTube"), 503);
        }
        const usage = await consumeUsage(admin, uid, "remix-link");
        if (!usage.allowed) return refused(usage);
        charged = { uid, feature: "remix-link", day: utcDay() };
        const res = await fetch("https://api.dataforseo.com/v3/serp/youtube/video_subtitles/live/advanced", {
          method: "POST",
          headers: { Authorization: `Basic ${btoa(`${login}:${password}`)}`, "Content-Type": "application/json" },
          body: JSON.stringify([{ video_id: link.id, location_code: 2702, language_code: "en" }]),
          signal: AbortSignal.timeout(45_000),
        });
        if (!res.ok) throw new Error(`subtitles answered ${res.status}`);
        const { title, sentences } = captionSentences(await res.json());
        const source = toSource("youtube", [{ id: link.id, url: link.url, title, sentences }]);
        if (!source) {
          await refund();
          return fail("no_captions", LINK_COPY.noCaptions, 422);
        }
        console.log("remix-link ok youtube", `${Date.now() - startedAt}ms`);
        return answer(source, { used: usage.used, limit: usage.limit });
      }

      // Instagram and TikTok: any cached row is used as it is, free; Apify runs only when none exists.
      const reel = parseReelUrl(link.url);
      if (reel.ok === false) return fail("bad_url", LINK_COPY.notSingle(link.kind), 400);
      const row = await findSource(admin, reel);
      if (row) {
        const source = toSource(link.kind, [row]);
        console.log("remix-link ok cached", link.kind, `${Date.now() - startedAt}ms`);
        return source ? answer(source, null) : fail("empty", LINK_COPY.noWords, 422);
      }
      const token = Deno.env.get("APIFY_API_KEY");
      if (!token) {
        console.error("APIFY_API_KEY is not set");
        return fail("unavailable", LINK_COPY.keyMissing(siteName(link.kind)), 503);
      }
      const usage = await consumeUsage(admin, uid, "remix-link");
      if (!usage.allowed) return refused(usage);
      charged = { uid, feature: "remix-link", day: utcDay() };
      const work = fetchSource({ admin, token, parsed: reel, existing: null, deadline: startedAt + BACKGROUND_LIMIT_MS });
      const outcome = await withinBudget(work, FETCH_BUDGET_MS - (Date.now() - startedAt));
      if (outcome.kind === "timeout") {
        // The run goes on and fills the cache, so trying again is free; the use comes back only if it fails.
        const c = charged;
        charged = null;
        keepRunning(work.catch(async (e) => {
          await refundUsage(admin, c.uid, c.feature, c.day);
          throw e;
        }));
        return fail("timeout", LINK_COPY.slow, 504);
      }
      if (outcome.kind === "failed") {
        await refund();
        return outcome.code === "not_found" ? fail("not_found", LINK_COPY.gone, 404) : fail(outcome.code, LINK_COPY.failed, 502);
      }
      const source = toSource(link.kind, [outcome.value.row]);
      if (!source) {
        await refund();
        return fail("empty", LINK_COPY.noWords, 422);
      }
      console.log("remix-link ok", link.kind, apifyJobFor(link.kind, link.url)?.actor, `${Date.now() - startedAt}ms`);
      return answer(source, { used: usage.used, limit: usage.limit });
    }

    // An uploaded picture, or a video's frames (its transcript comes from video-assist on the device).
    if (!Deno.env.get("OPENAI_API_KEY")) {
      console.error("OPENAI_API_KEY is not set");
      return fail("unavailable", "Reading files isn't switched on yet.", 503);
    }
    const usage = await consumeUsage(admin, uid, "remix-image");
    if (!usage.allowed) return refused(usage);
    charged = { uid, feature: "remix-image", day: utcDay() };
    const { system, parts } = buildVisionPrompt(body);
    const res = await openaiChat(
      {
        model: FALLBACK_MODEL,
        temperature: 0.2,
        max_tokens: 1500,
        response_format: VISION_RESPONSE_FORMAT,
        messages: [
          { role: "system", content: system },
          { role: "user", content: parts },
        ],
      },
      { signal: AbortSignal.timeout(AI_TIMEOUT_MS) },
    );
    if (!res.ok) {
      console.error("openai failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
      await refund();
      return fail("failed", LINK_COPY.failed, 502);
    }
    const data = await res.json().catch(() => null);
    const source = uploadSource(body, data?.choices?.[0]?.message?.content ?? null);
    if (!source) {
      console.error("openai output rejected", String(data?.choices?.[0]?.message?.content ?? "").slice(0, 300));
      await refund();
      return fail("failed", LINK_COPY.failed, 502);
    }
    console.log("remix-link ok", body.mode, `${Date.now() - startedAt}ms`);
    return answer(source, { used: usage.used, limit: usage.limit });
  } catch (e) {
    console.error("remix-link failed", e instanceof Error ? e.message : String(e));
    await refund();
    return fail("failed", LINK_COPY.failed, 502);
  }
});
