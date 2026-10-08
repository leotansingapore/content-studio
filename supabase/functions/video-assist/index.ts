// The video editor's server side (/edit). Two jobs, one function:
//   POST ?mode=transcribe, body = 16 kHz mono WAV (the browser extracts it, the
//        video never leaves the device) -> word-timed transcript (Whisper).
//   POST {mode:"vibe", instruction, settings, transcript, duration, frames?}
//        -> {patch, reply}: the change to the edit settings, in plain words.
//        Frames are up to 3 stills from a reference video to match its look.
// Each counts against its daily cap (cs_ai_usage: "video-transcribe", "vibe-edit").
//
// Secrets: OPENAI_API_KEY. Deploy WITH JWT verification:
//   supabase functions deploy video-assist --project-ref hgdbflprrficdoyxmdxe --use-api
// Logic: ./logic.ts (tested). Caps: ../_shared/usageCaps.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { MAX_AUDIO_BYTES, VIBE_MODEL, buildVibeMessages, cleanWords, parseVibeReply, parseVibeRequest } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to edit videos." }, 401);
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "The video editor isn't switched on yet." }, 503);

    const mode = new URL(req.url).searchParams.get("mode");
    if (mode === "transcribe") {
      const lenHeader = req.headers.get("content-length");
      if (!lenHeader) return json({ error: "Send the sound file with its length." }, 411);
      const len = Number(lenHeader);
      if (len > MAX_AUDIO_BYTES) return json({ error: "That video is too long to caption. Keep it under about 12 minutes." }, 413);
      const audio = new Uint8Array(await req.arrayBuffer());
      if (audio.byteLength < 1000) return json({ error: "No sound found in that video." }, 400);
      if (audio.byteLength > MAX_AUDIO_BYTES) return json({ error: "That video is too long to caption. Keep it under about 12 minutes." }, 413);
      const usage = await consumeUsage(admin, uid, "video-transcribe");
      if (!usage.allowed) {
        const r = usageRefusal(usage);
        return json(r.body, r.status);
      }
      const form = new FormData();
      form.append("file", new Blob([audio], { type: "audio/wav" }), "audio.wav");
      form.append("model", "whisper-1");
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "word");
      form.append("timestamp_granularities[]", "segment");
      // Whisper tidies away fillers unless the prompt shows them (OpenAI's documented trick); the editor needs them to cut them.
      form.append("prompt", "Umm, so, uh, I mean, like, you know, hmm... Okay, uh, here's the thing.");
      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        console.error("video-assist whisper", res.status, (await res.text()).slice(0, 300));
        return json({ error: "Couldn't caption that right now. Try again in a minute." }, 502);
      }
      const data = await res.json();
      return json({ text: data.text ?? "", duration: data.duration ?? 0, language: data.language ?? "", words: cleanWords(data.words, data.text ?? "") });
    }

    const parsed = parseVibeRequest(await req.json().catch(() => ({})));
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const usage = await consumeUsage(admin, uid, "vibe-edit");
    if (!usage.allowed) {
      const r = usageRefusal(usage);
      return json(r.body, r.status);
    }
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VIBE_MODEL,
        temperature: 0.2,
        max_tokens: 600,
        response_format: { type: "json_object" },
        messages: buildVibeMessages(parsed.request),
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      console.error("video-assist vibe", res.status, (await res.text()).slice(0, 300));
      return json({ error: "Couldn't make that change right now. Try again in a minute." }, 502);
    }
    const out = parseVibeReply((await res.json())?.choices?.[0]?.message?.content ?? null);
    if (!out) return json({ error: "Couldn't make that change. Try saying it another way." }, 502);
    return json(out);
  } catch (e) {
    console.error("video-assist", e);
    return json({ error: "Something went wrong. Try again." }, 500);
  }
});
