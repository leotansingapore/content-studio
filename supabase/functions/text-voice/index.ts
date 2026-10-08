// "Voiceover from text" in the video editor (/edit): a script becomes speech
// with ElevenLabs, in one of three voices. POST {text, voice} -> an MP3 (the
// browser keeps it on the device and places it like a recorded voiceover).
// Each call counts against the "ai-voice" daily cap (cs_ai_usage).
//
// Secrets: ELEVENLABS_API_KEY. Deploy WITH JWT verification:
//   supabase functions deploy text-voice --project-ref hgdbflprrficdoyxmdxe --use-api
// Logic: ./logic.ts (tested). Caps: ../_shared/usageCaps.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { parseVoiceRequest, ttsBody, ttsUrl } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const RETRY = "Couldn't make the voiceover right now. Try again in a minute.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const parsed = parseVoiceRequest(await req.json().catch(() => ({})));
    if (!parsed.ok) return json({ error: parsed.error }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to make a voiceover." }, 401);

    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      console.error("ELEVENLABS_API_KEY is not set");
      return json({ error: "Voiceover from text isn't switched on yet." }, 503);
    }
    const usage = await consumeUsage(admin, uid, "ai-voice");
    if (!usage.allowed) {
      const r = usageRefusal(usage);
      return json(r.body, r.status);
    }

    let res: Response;
    try {
      res = await fetch(ttsUrl(parsed.voice), {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify(ttsBody(parsed.text)),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (e) {
      console.error("text-voice request failed", e);
      return json({ error: RETRY }, 502);
    }
    if (!res.ok) {
      console.error("text-voice elevenlabs", res.status, (await res.text()).slice(0, 300));
      return json({ error: res.status === 401 || res.status === 402 ? "Voiceover credits have run out. Tell your studio admin." : RETRY }, 502);
    }
    console.log("text-voice", parsed.voice, parsed.text.length, "chars, cost", res.headers.get("character-cost") ?? "?");
    // octet-stream, so supabase-js and plain fetch both hand it back as a Blob
    return new Response(res.body, { headers: { ...corsHeaders, "Content-Type": "application/octet-stream" } });
  } catch (e) {
    console.error("text-voice failed", e);
    return json({ error: RETRY }, 500);
  }
});
