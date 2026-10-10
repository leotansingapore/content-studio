// "Voiceover from text" in the video editor (/edit): a script becomes speech
// with ElevenLabs, in one of three voices. POST {text, voice} -> an MP3 (the
// browser keeps it on the device and places it like a recorded voiceover).
// Dubbing: POST {mode:"dub", lines, voice, lang} -> {audio (base64 MP3), spans}
// where spans[i] is when line i is spoken, so the browser can lay each line
// where it was said. Either counts once against the "ai-voice" daily cap.
// Music for me: POST {mode:"mood", text} -> {mood}, Jev's pick from what is said
// (calm without Jev; "music-mood" cap), then POST {mode:"music", mood, seconds}
// -> an instrumental MP3 from Eleven Music ("ai-music" cap).
//
// Secrets: ELEVENLABS_API_KEY. Deploy WITH JWT verification:
//   supabase functions deploy text-voice --project-ref hgdbflprrficdoyxmdxe --use-api
// Logic: ./logic.ts (tested). Caps: ../_shared/usageCaps.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { askJev } from "../_shared/jev.ts";
import {
  DEFAULT_MOOD, MUSIC_URL, dubBody, dubUrl, lineSpans, moodQuestions, moodState, moodText, musicBody,
  parseDubRequest, parseMusicRequest, parseVoiceRequest, readMood, ttsBody, ttsUrl,
} from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const RETRY = "Couldn't make the voiceover right now. Try again in a minute.";
const MUSIC_RETRY = "Couldn't make the music right now. Try again in a minute.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body?.mode;
    const dub = mode === "dub" ? parseDubRequest(body) : null;
    if (dub && !dub.ok) return json({ error: dub.error }, 400);
    const music = mode === "music" ? parseMusicRequest(body) : null;
    if (music && !music.ok) return json({ error: music.error }, 400);
    const parsed = dub || music || mode === "mood" ? null : parseVoiceRequest(body);
    if (parsed && !parsed.ok) return json({ error: parsed.error }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: music || mode === "mood" ? "Sign in to make music." : "Sign in to make a voiceover." }, 401);

    if (mode === "mood") {
      // a decision, so Jev and never a prompt; calm whenever there is no answer to be had
      const text = moodText(body);
      if (!text || !(await consumeUsage(admin, uid, "music-mood")).allowed) return json({ mood: DEFAULT_MOOD });
      return json({ mood: readMood(await askJev(moodState(text), moodQuestions(), { who: "text-voice mood" })) });
    }

    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      console.error("ELEVENLABS_API_KEY is not set");
      return json({ error: music ? "Music for me isn't switched on yet." : "Voiceover from text isn't switched on yet." }, 503);
    }
    const usage = await consumeUsage(admin, uid, music ? "ai-music" : "ai-voice");
    if (!usage.allowed) {
      const r = usageRefusal(usage);
      return json(r.body, r.status);
    }

    if (music?.ok) {
      let res: Response;
      try {
        res = await fetch(MUSIC_URL, {
          method: "POST",
          headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(musicBody(music.mood, music.ms)),
          signal: AbortSignal.timeout(280_000),
        });
      } catch (e) {
        console.error("text-voice music request failed", e);
        return json({ error: MUSIC_RETRY }, 502);
      }
      if (!res.ok) {
        console.error("text-voice music elevenlabs", res.status, (await res.text()).slice(0, 300));
        return json({ error: [401, 402, 403].includes(res.status) ? "Music credits have run out. Tell your studio admin." : MUSIC_RETRY }, 502);
      }
      console.log("text-voice music", music.mood, music.ms, "ms, cost", res.headers.get("character-cost") ?? "?", "song", res.headers.get("song-id") ?? "?");
      return new Response(res.body, { headers: { ...corsHeaders, "Content-Type": "application/octet-stream" } });
    }
    if (dub?.ok) {
      let res: Response;
      try {
        res = await fetch(dubUrl(dub.voice), {
          method: "POST",
          headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(dubBody(dub.lines, dub.lang)),
          signal: AbortSignal.timeout(120_000),
        });
      } catch (e) {
        console.error("text-voice dub request failed", e);
        return json({ error: RETRY }, 502);
      }
      if (!res.ok) {
        console.error("text-voice dub elevenlabs", res.status, (await res.text()).slice(0, 300));
        return json({ error: res.status === 401 || res.status === 402 ? "Voiceover credits have run out. Tell your studio admin." : RETRY }, 502);
      }
      const out = await res.json();
      const ends = out?.alignment?.character_end_times_seconds;
      const duration = Array.isArray(ends) && ends.length ? Number(ends[ends.length - 1]) || 0 : 0;
      if (typeof out?.audio_base64 !== "string" || !out.audio_base64) return json({ error: RETRY }, 502);
      console.log("text-voice dub", dub.lang, dub.voice, dub.lines.length, "lines, cost", res.headers.get("character-cost") ?? "?");
      return json({ audio: out.audio_base64, spans: lineSpans(dub.lines, out.alignment, duration) });
    }
    if (!parsed?.ok) return json({ error: RETRY }, 500);

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
