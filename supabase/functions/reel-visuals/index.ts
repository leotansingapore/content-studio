// The visual half of "Clone a reel" (/clone). After a clone, the app samples
// frames from the Instagram reel at each scene change and measures its pacing;
// this sends them to OpenAI to read the original's look and plan a shot for
// each beat of the consultant's version.
//
// - The frames are images the signed-in user's browser made; nothing is
//   fetched here and nothing is stored.
// - Each request counts once against the daily cap (usageCaps "reel-visuals").
// - {mode: "style", frames, pacing}: "Copy a reel's style" in the video editor.
//   OpenAI writes how the captions and framing look and reads the overlays,
//   Jev picks the editor's look from that (style.ts), same cap.
// - {mode: "edit", frames (2 to 24, one per shot), pacing, shots, sentences, beats, cta}: Same edit's read
//   (edit.ts), NORTH_STAR_USERS only (403 not_enabled after sign-in, before the body or any count). One
//   "edit-read" use, not "reel-visuals": OpenAI describes each shot, Jev picks shot kinds, overlay jobs,
//   beats, roles and the look in one call. The use comes back only when OpenAI never answered (502 failed);
//   a read that comes back unusable keeps it (422 unusable).
//
// Secrets: OPENAI_API_KEY, NORTH_STAR_USERS, TYPESAFE_API_KEY. Deploy WITH JWT verification.
// Logic: ./logic.ts (tested).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, refundUsage, usageRefusal, type UsageFeature } from "../_shared/usageCaps.ts";
import { askJev } from "../_shared/jev.ts";
import { buildVisualsPrompt, parseVisualsRequest, validateVisuals, visualsFormat, type VisualsRequest } from "./logic.ts";
import { STYLE_RESPONSE_FORMAT, buildStylePrompt, parseStyleRequest, readLook, styleQuestions, styleState, validateStyle } from "./style.ts";
import { openaiFetch } from "../_shared/openaiChat.ts";
import { isAllowed } from "../market/logic.ts";
import { EDIT_RESPONSE_FORMAT, buildEditPrompt, editQuestions, parseEditRequest, readEdit, validateEdit, type EditRequest } from "./edit.ts";

const OPENAI_MODEL = "gpt-4.1";
const AI_TIMEOUT_MS = 70_000;

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

const fail = (code: string, error: string, status: number) => json({ code, error }, status);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("bad_request", "Use POST.", 405);
  const startedAt = Date.now();
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return fail("unauthorized", "Sign in to read the video.", 401);

    const body = await req.json().catch(() => null);
    const editMode = body?.mode === "edit";
    if (editMode && !isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)) return fail("not_enabled", "This isn't switched on for your account yet.", 403);
    const styleMode = body?.mode === "style";
    const parsed = editMode ? parseEditRequest(body) : styleMode ? parseStyleRequest(body) : parseVisualsRequest(body);
    if (parsed.ok === false) return fail("bad_request", parsed.error, 400);

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      console.error("OPENAI_API_KEY is not set");
      return fail("not_configured", "Reading the video isn't switched on yet.", 503);
    }

    const day = new Date().toISOString().slice(0, 10); // the counter's day (UTC), read before the count for a refund
    // shortcut: the cast type-checks this branch before contracts adds "edit-read" to DAILY_LIMITS; drop it after the wave 1 merge.
    const cap = (editMode ? "edit-read" : "reel-visuals") as UsageFeature;
    const charged = await consumeUsage(admin, uid, cap);
    if (!charged.allowed) {
      const refusal = usageRefusal(charged);
      return json(refusal.body, refusal.status);
    }

    const { system, parts } = editMode ? buildEditPrompt(parsed.value as EditRequest) : styleMode ? buildStylePrompt(parsed.value) : buildVisualsPrompt(parsed.value as Parameters<typeof buildVisualsPrompt>[0]);
    /** The edit read's use comes back when OpenAI never answered; the older modes keep today's answer. */
    const neverAnswered = async (fallback: Response) => {
      if (!editMode) return fallback;
      await refundUsage(admin, uid, cap, day);
      return fail("failed", "Reading the edit didn't come back. Try again.", 502);
    };
    let res: Response;
    try {
      res = await openaiFetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          temperature: 0.4,
          max_tokens: editMode ? 3000 : styleMode ? 900 : 1500,
          response_format: editMode ? EDIT_RESPONSE_FORMAT : styleMode ? STYLE_RESPONSE_FORMAT : visualsFormat((parsed.value as VisualsRequest).profession),
          messages: [
            { role: "system", content: system },
            { role: "user", content: parts },
          ],
        }),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });
    } catch (e) {
      console.error("openai request failed", e);
      return neverAnswered((e as Error)?.name === "TimeoutError"
        ? fail("timeout", "Reading the video took too long. Try again.", 504)
        : fail("ai_failed", "The video breakdown didn't come back. Try again.", 502));
    }
    if (!res.ok) {
      console.error("openai failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return neverAnswered(fail("ai_failed", "The video breakdown didn't come back. Try again.", 502));
    }
    const data = await res.json().catch(() => null);
    const message = data?.choices?.[0]?.message;
    if (message?.refusal) console.error("openai refused", String(message.refusal).slice(0, 200));
    if (editMode) {
      const r = parsed.value as EditRequest;
      const read = validateEdit(message?.content ?? null, r.frames.map((f) => f.t));
      if (!read) {
        console.error("openai edit output rejected", String(message?.content ?? "").slice(0, 300));
        return fail("unusable", "The reel's edit didn't come back right. Try again.", 422);
      }
      // the look's questions read `captions` and `layout`, as style mode's do; every other question carries its own
      const answers = await askJev({ captions: read.captions, layout: read.layout }, editQuestions(r, read), { who: "reel-visuals edit", timeoutMs: 15_000 });
      console.log("reel-visuals edit ok", r.frames.length, answers ? "jev" : "no jev", `${Date.now() - startedAt}ms`);
      return json({ read, look: readLook(answers), picks: readEdit(answers, r, read), usage: { used: charged.used, limit: charged.limit } });
    }
    if (styleMode) {
      const style = validateStyle(message?.content ?? null, parsed.value.pacing.durationSec);
      if (!style) {
        console.error("openai style output rejected", String(message?.content ?? "").slice(0, 300));
        return fail("ai_failed", "The reel's look didn't come back right. Try again.", 502);
      }
      // Jev picks the look from the description (Leo's rule: a pick is a decision); null keeps the person's own
      const look = readLook(await askJev(styleState(style), styleQuestions(), { who: "reel-visuals style", timeoutMs: 10_000 }));
      console.log("reel-visuals style ok", parsed.value.frames.length, `${Date.now() - startedAt}ms`);
      return json({ style, look, usage: { used: charged.used, limit: charged.limit } });
    }
    const beats = (parsed.value as Parameters<typeof buildVisualsPrompt>[0]).beats;
    const visuals = validateVisuals(message?.content ?? null, beats.length, parsed.value.pacing.durationSec);
    if (!visuals) {
      console.error("openai output rejected", String(message?.content ?? "").slice(0, 300));
      return fail("ai_failed", "The video breakdown didn't come back right. Try again.", 502);
    }
    console.log("reel-visuals ok", parsed.value.frames.length, `${Date.now() - startedAt}ms`);
    return json({ visuals, usage: { used: charged.used, limit: charged.limit } });
  } catch (e) {
    console.error("reel-visuals failed", e);
    return fail("server_error", "Something went wrong. Try again in a minute.", 500);
  }
});
