// "Voiceover from text" in the video editor (/edit): a script becomes speech
// with ElevenLabs, in one of the premade voices. POST {text, voice, emotion?, pace?}
// -> an MP3 (the browser keeps it on the device and places it like a recorded
// voiceover); no emotion or pace sounds as before (warm, normal).
// Dubbing: POST {mode:"dub", lines, voice, lang, emotion?, pace?} -> {audio (base64 MP3), spans}
// where spans[i] is when line i is spoken, so the browser can lay each line
// where it was said. Either counts once against the "ai-voice" daily cap.
// A launch film's voice: POST {mode:"lines", lines, voice, emotion?, pace?} -> {audio, spans}, English lines read in one call;
// and a voiceover with word times: POST {text, voice, timestamps: true, ...} -> {audio, words: [{w, s, e}]}. Both NORTH_STAR_USERS
// only, one "ai-voice" use each: "lines" answers 403 not_enabled to anyone else before any count, and anyone else's
// `timestamps` is ignored (today's MP3). The use goes back only when ElevenLabs never answered.
// Music for me: POST {mode:"mood", text} -> {mood}, Jev's pick from what is said
// (calm without Jev; "music-mood" cap), then POST {mode:"music", mood, seconds}
// -> an instrumental MP3 from Eleven Music ("ai-music" cap per adviser, "ai-music-global" for everyone;
// both given back when no track comes back, the adviser's when the studio's can't be taken).
//
// Secrets: ELEVENLABS_API_KEY. Deploy WITH JWT verification:
//   supabase functions deploy text-voice --project-ref hgdbflprrficdoyxmdxe --use-api
// Logic: ./logic.ts (tested). Caps: ../_shared/usageCaps.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, refundUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { askJev } from "../_shared/jev.ts";
import { isAllowed } from "../market/logic.ts";
import {
  DEFAULT_MOOD, MUSIC_URL, dubBody, dubUrl, giveMusicBack, lineSpans, moodQuestions, moodState, moodText, musicBody, musicFailure, musicRefusal,
  parseDubRequest, parseLinesRequest, parseMusicRequest, parseVoiceRequest, readMood, ttsBody, ttsUrl, wordTimes,
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
    const parsed = dub || music || mode === "mood" || mode === "lines" ? null : parseVoiceRequest(body);
    if (parsed && !parsed.ok) return json({ error: parsed.error }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: music || mode === "mood" ? "Sign in to make music." : "Sign in to make a voiceover." }, 401);
    const listed = isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid);
    if (mode === "lines" && !listed) return json({ code: "not_enabled", error: "This isn't switched on for your account yet." }, 403);
    const lines = mode === "lines" ? parseLinesRequest(body) : null;
    if (lines && !lines.ok) return json({ code: "bad_request", error: lines.error }, 400);

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
    if (music?.ok) {
      // the counter's day (UTC), read before a track that takes minutes can carry it past 8am Singapore
      const day = new Date().toISOString().slice(0, 10);
      const refused = await musicRefusal(admin, uid);
      if (refused) return json(refused.body, refused.status);
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
        await giveMusicBack(admin, uid, true, day);
        return json({ error: MUSIC_RETRY }, 502);
      }
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        console.error("text-voice music elevenlabs", res.status, detail);
        await giveMusicBack(admin, uid, true, day);
        return json({ error: musicFailure(res.status, detail) }, 502);
      }
      console.log("text-voice music", music.mood, music.ms, "ms, cost", res.headers.get("character-cost") ?? "?", "song", res.headers.get("song-id") ?? "?");
      return new Response(res.body, { headers: { ...corsHeaders, "Content-Type": "application/octet-stream" } });
    }

    const day = new Date().toISOString().slice(0, 10); // the counter's day (UTC), read before it moves
    const usage = await consumeUsage(admin, uid, "ai-voice");
    if (!usage.allowed) {
      const r = usageRefusal(usage);
      return json(r.body, r.status);
    }
    // a film's lines, or a listed caller's voiceover with word times: the with-timestamps call, its times back with the audio
    const timed = lines?.ok ? { text: lines.lines.join("\n"), how: lines } : parsed?.ok && body?.timestamps === true && listed ? { text: parsed.text, how: parsed } : null;
    if (timed) {
      let res: Response | null = null;
      try {
        res = await fetch(dubUrl(timed.how.voice), {
          method: "POST",
          headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(ttsBody(timed.text, timed.how)),
          signal: AbortSignal.timeout(120_000),
        });
      } catch (e) {
        console.error("text-voice timed request failed", e);
      }
      if (!res?.ok) {
        if (res) console.error("text-voice timed elevenlabs", res.status, (await res.text()).slice(0, 300));
        // ElevenLabs never answered: the use goes back
        await refundUsage(admin, uid, "ai-voice", day);
        return json({ code: "failed", error: res?.status === 401 || res?.status === 402 ? "Voiceover credits have run out. Tell your studio admin." : RETRY }, 502);
      }
      const out = await res.json().catch(() => null);
      if (typeof out?.audio_base64 !== "string" || !out.audio_base64) return json({ code: "unusable", error: RETRY }, 422);
      const ends = out.alignment?.character_end_times_seconds;
      const duration = Array.isArray(ends) && ends.length ? Number(ends[ends.length - 1]) || 0 : 0;
      console.log("text-voice", lines ? "lines" : "timestamps", timed.how.voice, timed.text.length, "chars, cost", res.headers.get("character-cost") ?? "?");
      return json(lines?.ok ? { audio: out.audio_base64, spans: lineSpans(lines.lines, out.alignment, duration) } : { audio: out.audio_base64, words: wordTimes(timed.text, out.alignment, duration) });
    }
    if (dub?.ok) {
      let res: Response;
      try {
        res = await fetch(dubUrl(dub.voice), {
          method: "POST",
          headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(dubBody(dub.lines, dub.lang, dub)),
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
      console.log("text-voice dub", dub.lang, dub.voice, dub.emotion, dub.pace, dub.lines.length, "lines, cost", res.headers.get("character-cost") ?? "?");
      return json({ audio: out.audio_base64, spans: lineSpans(dub.lines, out.alignment, duration) });
    }
    if (!parsed?.ok) return json({ error: RETRY }, 500);

    let res: Response;
    try {
      res = await fetch(ttsUrl(parsed.voice), {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify(ttsBody(parsed.text, parsed)),
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
    console.log("text-voice", parsed.voice, parsed.emotion, parsed.pace, parsed.text.length, "chars, cost", res.headers.get("character-cost") ?? "?");
    // octet-stream, so supabase-js and plain fetch both hand it back as a Blob
    return new Response(res.body, { headers: { ...corsHeaders, "Content-Type": "application/octet-stream" } });
  } catch (e) {
    console.error("text-voice failed", e);
    return json({ error: RETRY }, 500);
  }
});
