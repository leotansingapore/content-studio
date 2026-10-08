// The video editor's server side (/edit). Two jobs, one function:
//   POST ?mode=transcribe, body = 16 kHz mono WAV (the browser extracts it, the
//        video never leaves the device) -> word-timed transcript (Whisper).
//   POST {mode:"vibe", instruction, settings, transcript, duration, frames?}
//        -> {patch, reply}: the change to the edit settings, in plain words.
//        Frames are up to 3 stills from a reference video to match its look.
//   POST {mode:"translate", lang:"zh"|"ms"|"ta", lines:[...]} -> {lines:[...]}: second-language
//        caption lines, one per caption ("video-translate" cap).
//   POST {mode:"clips", sentences:[{s,e,text}], duration, words?:[{w,s,e}], about?} -> {clips:[{start,end,title,hook,reason,score?,onTopic?,skip?}]}:
//        standalone reels cut from one long video, 3-5 under 8 minutes and more beyond: the LLM
//        proposes about twice that, Jev scores each out of 100 and the best come first (score
//        unset and the LLM's order when Jev has no answer) ("video-clips" cap, one use per call).
//        With word timings, each clip's edges are cleaned first (cleanEdges). With `about` (what the
//        person typed), the LLM lists those parts first and Jev says which clips are about it. A clip
//        may skip one tangent in its middle when Jev reads it as an aside (skip:{start,end}).
//   POST {mode:"cutaways", sentences:[{s,e,text}] on the edited timeline, duration}
//        -> {sections:[{at,until,callout,show}]}: a text callout and what to cut away
//        to, per section of a filmed talking head ("video-cutaways" cap).
//   POST {mode:"publish", sentences:[{s,e,text}] on the edited timeline, duration}
//        -> {titles:[3], cover, at}: post titles and the cover text, written by the LLM,
//        and the cover moment, picked by Jev (null when Jev has no answer or the
//        video is not in English) ("video-publish" cap).
//   POST {mode:"motion", sentences:[{s,e,text}] on the edited timeline, duration, hookSeconds}
//        -> {lines:[{i,p}] | null}: Jev's yes probability that each line is a key line
//        (null when Jev has no answer or the video is not in English) ("motion-picks" cap).
// Each counts against its daily cap (cs_ai_usage: "video-transcribe", "vibe-edit").
//
// Secrets: OPENAI_API_KEY. Deploy WITH JWT verification:
//   supabase functions deploy video-assist --project-ref hgdbflprrficdoyxmdxe --use-api
// Logic: ./logic.ts (tested). Caps: ../_shared/usageCaps.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { askJev } from "../_shared/jev.ts";
import { mostlyEnglish } from "../post-score/logic.ts";
import { eligibleLines, keyQuestions, keyState, parseMotionRequest, readKeyLines } from "./motion.ts";
import {
  CLIP_VIEWER,
  MAX_AUDIO_BYTES,
  applySkips,
  skipQuestions,
  VIBE_MODEL,
  buildClipsMessages,
  candidateCount,
  cleanEdges,
  clipCount,
  clipQuestions,
  rankClips,
  buildCutawaysMessages,
  buildPublishMessages,
  coverAt,
  coverQuestion,
  coverState,
  parsePublishReply,
  parsePublishRequest,
  parseCutawaysReply,
  parseCutawaysRequest,
  buildTranslateMessages,
  parseTranslateReply,
  parseTranslateRequest,
  buildVibeMessages,
  cleanWords,
  parseClipsReply,
  parseClipsRequest,
  parseVibeReply,
  parseVibeRequest,
} from "./logic.ts";

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

    const body = await req.json().catch(() => ({}));
    if (body?.mode === "translate") {
      const t = parseTranslateRequest(body);
      if (!t.ok) return json({ error: t.error }, 400);
      const usage = await consumeUsage(admin, uid, "video-translate");
      if (!usage.allowed) {
        const r = usageRefusal(usage);
        return json(r.body, r.status);
      }
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: VIBE_MODEL, temperature: 0.2, max_tokens: 4000, response_format: { type: "json_object" }, messages: buildTranslateMessages(t.lang, t.lines) }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        console.error("video-assist translate", res.status, (await res.text()).slice(0, 300));
        return json({ error: "Couldn't translate right now. Try again in a minute." }, 502);
      }
      const lines = parseTranslateReply((await res.json())?.choices?.[0]?.message?.content ?? null, t.lines.length);
      if (!lines) return json({ error: "The translation came back incomplete. Try again." }, 502);
      return json({ lines });
    }
    if (body?.mode === "clips") {
      const c = parseClipsRequest(body);
      if (!c.ok) return json({ error: c.error }, 400);
      const usage = await consumeUsage(admin, uid, "video-clips");
      if (!usage.allowed) {
        const r = usageRefusal(usage);
        return json(r.body, r.status);
      }
      // One more try when no reply clip passes the length and overlap checks: a
      // single run sometimes misses on a perfectly usable video.
      const limit = candidateCount(c.duration);
      let clips: ReturnType<typeof parseClipsReply> = null;
      for (let attempt = 0; attempt < 2 && !clips?.length; attempt++) {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: VIBE_MODEL, temperature: 0.3, max_tokens: 200 + 120 * limit, response_format: { type: "json_object" }, messages: buildClipsMessages(c.sentences, c.duration, c.about) }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) {
          console.error("video-assist clips", res.status, (await res.text()).slice(0, 300));
          return json({ error: "Couldn't find clips right now. Try again in a minute." }, 502);
        }
        const content = (await res.json())?.choices?.[0]?.message?.content ?? null;
        clips = parseClipsReply(content, c.duration, limit);
        if (!clips?.length) console.error("video-assist clips: no usable clip", attempt, String(content).slice(0, 500));
      }
      if (!clips?.length) return json({ error: "No clips stood out in this video. Try a longer one." }, 422);
      // edges on whole sentences and strong words, before Jev reads them; no word timings, no skips
      clips = c.words.length ? clips.map((x) => cleanEdges(x, c.words, c.duration)) : clips.map(({ skip: _, ...x }) => x);
      const english = mostlyEnglish(c.sentences.map((x) => x.text).join(" "));
      // a skipped tangent stays only when Jev reads it as an aside (a decision); without an answer, no skip
      const skips = english && clips.some((x) => x.skip) ? await askJev({}, skipQuestions(clips, c.sentences, c.words), { who: "video-assist clip skips", timeoutMs: 10_000 }) : null;
      clips = applySkips(clips, skips);
      if (!clips.length) return json({ error: "No clips stood out in this video. Try a longer one." }, 422);
      // Jev ranks the candidates (Leo's rule: a ranking is a decision); without an answer, the LLM's order
      const answers = english
        ? await askJev({ viewer: CLIP_VIEWER }, clipQuestions(clips, c.sentences, c.words, c.about), { who: "video-assist clips", timeoutMs: 10_000 })
        : null;
      return json({ clips: rankClips(clips, answers, clipCount(c.duration), c.about) });
    }

    if (body?.mode === "cutaways") {
      const c = parseCutawaysRequest(body);
      if (!c.ok) return json({ error: c.error }, 400);
      const usage = await consumeUsage(admin, uid, "video-cutaways");
      if (!usage.allowed) {
        const r = usageRefusal(usage);
        return json(r.body, r.status);
      }
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: VIBE_MODEL, temperature: 0.4, max_tokens: 900, response_format: { type: "json_object" }, messages: buildCutawaysMessages(c.sentences, c.duration) }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        console.error("video-assist cutaways", res.status, (await res.text()).slice(0, 300));
        return json({ error: "Couldn't read the video for callouts right now. Try again in a minute." }, 502);
      }
      const sections = parseCutawaysReply((await res.json())?.choices?.[0]?.message?.content ?? null, c.duration);
      if (!sections?.length) return json({ error: "No callouts stood out in this video. Try again." }, 422);
      return json({ sections });
    }

    if (body?.mode === "motion") {
      const m = parseMotionRequest(body);
      if (!m.ok) return json({ error: m.error }, 400);
      const usage = await consumeUsage(admin, uid, "motion-picks");
      if (!usage.allowed) {
        const r = usageRefusal(usage);
        return json(r.body, r.status);
      }
      // Jev picks the key lines (Leo's rule: a pick is a decision); the editor lays them out
      const idx = eligibleLines(m.lines, m.hookSeconds);
      if (!idx.length || !mostlyEnglish(m.lines.map((x) => x.text).join(" "))) return json({ lines: null });
      const state = keyState(m.lines);
      const parts = await Promise.all(keyQuestions(m.lines, idx).map((q) => askJev(state, q, { who: "video-assist motion", timeoutMs: 10_000 })));
      const answers = parts.some(Boolean) ? Object.assign({}, ...parts.filter(Boolean)) : null;
      return json({ lines: readKeyLines(answers, idx) });
    }

    if (body?.mode === "publish") {
      const p = parsePublishRequest(body);
      if (!p.ok) return json({ error: p.error }, 400);
      const usage = await consumeUsage(admin, uid, "video-publish");
      if (!usage.allowed) {
        const r = usageRefusal(usage);
        return json(r.body, r.status);
      }
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: VIBE_MODEL, temperature: 0.6, max_tokens: 300, response_format: { type: "json_object" }, messages: buildPublishMessages(p.sentences, p.duration) }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) {
        console.error("video-assist publish", res.status, (await res.text()).slice(0, 300));
        return json({ error: "Couldn't write titles right now. Try again in a minute." }, 502);
      }
      const idea = parsePublishReply((await res.json())?.choices?.[0]?.message?.content ?? null);
      if (!idea) return json({ error: "The titles came back incomplete. Try again." }, 502);
      // Jev picks the moment (Leo's rule: a pick is a decision); without an answer the person scrubs to one
      const answers = mostlyEnglish(p.sentences.map((x) => x.text).join(" "))
        ? await askJev(coverState(p.sentences, idea.cover), { cover_at: coverQuestion(p.sentences) }, { who: "video-assist publish" })
        : null;
      return json({ ...idea, at: coverAt(answers, p.sentences) });
    }

    const parsed = parseVibeRequest(body);
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
