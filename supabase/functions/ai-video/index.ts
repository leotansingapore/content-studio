// Videos made without filming, on Edit a video, through Higgsfield (Leo's choice, 2026-10-08).
//   POST {mode:"script", topic}      -> {scenes:[{say, picture}]}  OpenAI writes an explainer ("ai-video-script" cap)
//   POST {mode:"presenter", look}    -> {token}  one AI presenter picture, Soul v2 9:16 ("ai-image" cap)
//   POST {mode:"avatar", photo, slices:[{wav, seconds}]} -> {tokens, credits}  Higgsfield Speak per slice
//   POST {mode:"explainer", pictures} -> {tokens, credits}  one Soul v2 picture per scene
//   POST {mode:"template", template, seconds, quality, fields, photos} -> {tokens, credits}  a template clip:
//        OpenAI writes the Seedance prompt by the template's structure (templates.ts), then Seedance 2.5 makes it.
//        Counts against "ai-clip" (2 a day) and "ai-clip-global" (8 a day across everyone).
//   POST {mode:"status", tokens}     -> {jobs:[{state, url?, error?}]}
// A video (avatar or explainer) counts once against the adviser's "ai-video" cap (2 a day) and once
// against "ai-video-global" (20 a day across everyone, kept on the owner's account), so nobody can
// drain the prepaid Higgsfield pool. Tokens are the Higgsfield request ids signed for the adviser who
// started them (ai-image's jobToken), so nobody else can read a job.
//
// Secrets: HF_API_KEY, HF_API_SECRET (shared with ai-image), OPENAI_API_KEY. Deploy WITH JWT verification:
//   supabase functions deploy ai-video --project-ref hgdbflprrficdoyxmdxe --use-api
// Logic: ./logic.ts (tested). Caps: ../_shared/usageCaps.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GLOBAL_COUNTER_USER, consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { HF_BASE, jobToken, openJobToken, tokenSecret } from "../ai-image/logic.ts";
import {
  PICTURE_MODEL, SCRIPT_FORMAT, SCRIPT_SYSTEM, SPEAK_MODEL, avatarCredits, clipCredits, explainerCredits, parseVideoRequest,
  pictureBody, presenterBody, readMedia, seedanceRequest, speakBody, validateScript,
} from "./logic.ts";
import { PROMPT_FORMAT, clipPrompt, templateById, templateDetails, templateSystem } from "./templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const RETRY = "Couldn't start the video right now. Try again in a minute.";
const NO_CREDITS = "AI video credits have run out. Tell your studio admin.";

class HfError extends Error {
  constructor(public status: number) {
    super(`higgsfield ${status}`);
  }
}

/** One gpt-4.1 JSON answer, or null (logged) when it doesn't come back. */
async function writeJson(key: string, system: string, user: string, format: unknown, maxTokens: number): Promise<string | null> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1",
      temperature: 0.7,
      max_tokens: maxTokens,
      response_format: format,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(60_000),
  }).catch((e) => (console.error("ai-video openai request failed", e), null));
  if (res && !res.ok) console.error("ai-video openai", res.status, (await res.text().catch(() => "")).slice(0, 300));
  const data = res?.ok ? await res.json().catch(() => null) : null;
  return data?.choices?.[0]?.message?.content ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const parsed = parseVideoRequest(await req.json().catch(() => ({})));
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const r = parsed.request;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to make videos." }, 401);

    if (r.mode === "script") {
      const openai = Deno.env.get("OPENAI_API_KEY");
      if (!openai) return json({ error: "Explainers aren't switched on yet." }, 503);
      const usage = await consumeUsage(admin, uid, "ai-video-script");
      if (!usage.allowed) {
        const refusal = usageRefusal(usage);
        return json(refusal.body, refusal.status);
      }
      const content = await writeJson(openai, SCRIPT_SYSTEM, `Topic: ${r.topic}`, SCRIPT_FORMAT, 1200);
      const scenes = validateScript(content);
      if (!scenes) {
        if (content) console.error("ai-video script rejected", content.slice(0, 300));
        return json({ error: "The explainer didn't come back right. Try again." }, 502);
      }
      return json({ scenes, usage: { used: usage.used, limit: usage.limit } });
    }

    const key = Deno.env.get("HF_API_KEY");
    const secret = Deno.env.get("HF_API_SECRET");
    if (!key || !secret) {
      console.error("HF_API_KEY / HF_API_SECRET are not set");
      return json({ error: "AI videos aren't switched on yet." }, 503);
    }
    const auth = { Authorization: `Key ${key}:${secret}` };
    const signing = await tokenSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (r.mode === "status") {
      const jobs = await Promise.all(r.tokens.map(async (token) => {
        const id = await openJobToken(signing, uid, token);
        if (!id) return { state: "failed", error: "That video job isn't known." };
        try {
          const res = await fetch(`${HF_BASE}/requests/${id}/status`, { headers: auth, signal: AbortSignal.timeout(15_000) });
          if (res.status === 404) return { state: "failed", error: "That video job isn't known." };
          return res.ok ? readMedia(await res.json().catch(() => null)) : { state: "working" };
        } catch {
          return { state: "working" }; // a blip: the browser asks again
        }
      }));
      return json({ jobs });
    }

    const submit = async (model: string, body: Record<string, unknown>): Promise<string> => {
      const res = await fetch(`${HF_BASE}/${model}`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        console.error("ai-video submit", model, res.status, (await res.text()).slice(0, 300));
        throw new HfError(res.status);
      }
      const out = await res.json().catch(() => null);
      const id = out?.request_id ?? out?.id; // the v1 Speak route answers with id
      if (typeof id !== "string") throw new HfError(502);
      return id;
    };
    /** A file put on Higgsfield's storage, for a request to read by its public link. */
    const upload = async (b64: string, type: string): Promise<string> => {
      const res = await fetch(`${HF_BASE}/files/generate-upload-url`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ content_type: type }),
        signal: AbortSignal.timeout(15_000),
      });
      const u = res.ok ? await res.json().catch(() => null) : null;
      if (!u?.upload_url || !u?.public_url) throw new HfError(res.status === 403 ? 403 : 502);
      const put = await fetch(u.upload_url, {
        method: "PUT",
        // the signature covers upload_headers (Content-Type plus x-amz-tagging)
        headers: u.upload_headers ?? { "Content-Type": type },
        body: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
        signal: AbortSignal.timeout(30_000),
      });
      if (!put.ok) throw new HfError(502);
      return u.public_url as string;
    };
    const failed = (e: unknown) => json({ error: e instanceof HfError && e.status === 403 ? NO_CREDITS : RETRY }, 502);

    if (r.mode === "presenter") {
      const usage = await consumeUsage(admin, uid, "ai-image");
      if (!usage.allowed) {
        const refusal = usageRefusal(usage);
        return json(refusal.body, refusal.status);
      }
      try {
        return json({ token: await jobToken(signing, uid, await submit(PICTURE_MODEL, presenterBody(r.look))) });
      } catch (e) {
        return failed(e);
      }
    }

    if (r.mode === "template") {
      const t = templateById(r.template)!; // parseVideoRequest only lets known templates through
      const openai = Deno.env.get("OPENAI_API_KEY");
      if (!openai) return json({ error: "AI clips aren't switched on yet." }, 503);
      // the adviser's own cap first, so someone at their limit can't use up everyone's
      const mine = await consumeUsage(admin, uid, "ai-clip");
      if (!mine.allowed) {
        const refusal = usageRefusal(mine);
        return json(refusal.body, refusal.status);
      }
      const everyone = await consumeUsage(admin, GLOBAL_COUNTER_USER, "ai-clip-global");
      if (!everyone.allowed) {
        return json({ code: "daily_limit", error: "Today's AI clips for the whole studio are used up. Try again after 8am Singapore time." }, 429);
      }
      const roles = r.photos.map((p) => p.role);
      const written = await writeJson(openai, templateSystem(t, r.seconds, roles), templateDetails(t, r.fields), PROMPT_FORMAT, 1500);
      const prompt = clipPrompt(written, roles);
      if (!prompt) {
        if (written) console.error("ai-video template prompt rejected", written.slice(0, 300));
        return json({ error: "The clip's shots didn't come back right. Try again." }, 502);
      }
      try {
        const images = await Promise.all(r.photos.map((p) => upload(p.jpeg, "image/jpeg")));
        const { model, body } = seedanceRequest(prompt, r.seconds, r.quality, images);
        const id = await submit(model, body);
        const credits = clipCredits(r.seconds, r.quality);
        console.log("ai-video template", t.id, model, r.seconds, r.quality, credits, "credits");
        return json({ tokens: [await jobToken(signing, uid, id)], credits, usage: { used: mine.used, limit: mine.limit } });
      } catch (e) {
        return failed(e);
      }
    }

    // A video: the adviser's own cap first, so someone at their limit can't use up everyone's.
    const mine = await consumeUsage(admin, uid, "ai-video");
    if (!mine.allowed) {
      const refusal = usageRefusal(mine);
      return json(refusal.body, refusal.status);
    }
    const everyone = await consumeUsage(admin, GLOBAL_COUNTER_USER, "ai-video-global");
    if (!everyone.allowed) {
      return json({ code: "daily_limit", error: "Today's AI videos for the whole studio are used up. Try again after 8am Singapore time." }, 429);
    }

    const ids: string[] = [];
    try {
      if (r.mode === "avatar") {
        const image = "url" in r.photo ? r.photo.url : await upload(r.photo.jpeg, "image/jpeg");
        const audio = await Promise.all(r.slices.map((s) => upload(s.wav, "audio/wav")));
        const seed = Math.floor(Math.random() * 1_000_000);
        for (let i = 0; i < r.slices.length; i++) ids.push(await submit(SPEAK_MODEL, speakBody(image, audio[i], r.slices[i].seconds, seed)));
      } else {
        for (const p of r.pictures) ids.push(await submit(PICTURE_MODEL, pictureBody(p)));
      }
    } catch (e) {
      // a half-started video is no use: cancel what is still queued (refunded) before saying so
      await Promise.all(ids.map((id) => fetch(`${HF_BASE}/requests/${id}/cancel`, { method: "POST", headers: auth }).catch(() => null)));
      return failed(e);
    }
    const credits = r.mode === "avatar" ? avatarCredits(r.slices.map((s) => s.seconds)) : explainerCredits(r.pictures.length);
    console.log("ai-video", r.mode, ids.length, "jobs,", credits, "credits");
    return json({
      tokens: await Promise.all(ids.map((id) => jobToken(signing, uid, id))),
      credits,
      usage: { used: mine.used, limit: mine.limit },
    });
  } catch (e) {
    console.error("ai-video failed", e);
    return json({ error: RETRY }, 500);
  }
});
