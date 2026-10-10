// The video editor's server side (/edit). Two jobs, one function:
//   POST ?mode=transcribe, body = 16 kHz mono WAV (the browser extracts it, the
//        video never leaves the device) -> word-timed transcript (Whisper).
//   POST {mode:"vibe", instruction, settings, transcript, duration, frames?}
//        -> {patch, reply}: the change to the edit settings, in plain words.
//        Frames are up to 3 stills from a reference video to match its look.
//   POST {mode:"translate", lang:"zh"|"ms"|"ta", lines:[...]} -> {lines:[...]}: second-language
//        caption lines, one per caption ("video-translate" cap).
//   POST {mode:"clips", sentences:[{s,e,text}], duration, words?:[{w,s,e}], about?} -> {clips:[{start,end,title,hook,reason,score?,onTopic?,skip?}]}:
//        standalone reels cut from one long video, 3-5 under 8 minutes and up to 16 an hour beyond: the
//        LLM proposes about twice that, reading a long recording in passes of about 40 minutes
//        (passes.ts), Jev scores every candidate out of 100 and the best come first (score unset and
//        the LLM's order when Jev has no answer) ("video-clips" cap, one use per pass).
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
//        -> {lines:[{i,p}] | null, popups:[{i,text,key,emoji}] | null}: Jev's yes probability
//        that each line is a key line (null when Jev has no answer or the video is not in
//        English), and pop-up text the LLM writes for the top few, with the emoji Jev picks
//        ("motion-picks" cap).
//   POST {mode:"broll", sentences:[{s,e,text}] on the edited timeline, duration, hookSeconds, taken:[{s,e}], room}
//        -> {picks:[{i,kind:"scene",search} | {i,kind:"idea"|"product",callout}] | null}: the lines Jev
//        says a cutaway visual helps (a few a minute, never the hook, clear of B-roll already there) and
//        what each needs (Jev again: a scene clip, an idea card or the named product); the LLM writes a
//        1-3 word stock search for a scene and the card text for the rest; null when Jev has no answer or
//        the video is not in English (broll.ts, "broll-picks" cap).
//   POST {mode:"montage", theme, seconds?} -> {beats:[{say,search,fallback,text,seconds}], grade}: 6-10 beats for a
//        montage from a theme (LLM) and the one colour grade over all of them (Jev) (montage.ts, "montage-beats" cap).
//   POST {mode:"montage-pick", theme, beats:[{say, candidates:[{desc}]}]} -> {picks:[index | -1 | null]}: the stock
//        clip Jev says shows each beat, -1 when none does, null with no answer ("montage-pick" cap).
//   POST {mode:"hooks", sentences:[{s,e,text}] on the edited timeline, duration, formulas:[{id,name,template,example,trap}] x2-3}
//        -> {hooks:[{formula,text}], pick: index | null}: hook card lines the LLM writes, one per formula, and the
//        one Jev would start with (Write's hook question; null on no answer, a tie or a video not in English)
//        (hooks.ts, "vibe-edit" cap, as the single suggested hook before it).
//   POST {mode:"coldopen", sentences:[{s,e,text}] on the edited timeline, candidates:[i], opening:i, title}
//        -> {pick: {i,p} | null, why?}: the line to play first as a teaser, rated by Jev as the first words heard
//        (Leo's talking-head-reel openers questions); null when none beats the video's own start, or with
//        why "unrated" (Jev gave no answer) or "language" (not English) (coldopen.ts, "cold-open" cap).
//   POST {mode:"captions", transcript, instagram?, title?, rules?} -> {captions: {tiktok, linkedin, facebook}}: the post
//        caption written for each platform in its own length, hashtag limits kept, following the brand kit's
//        rules line when sent (captions.ts, "video-captions" cap).
// Each counts against its daily cap (cs_ai_usage: "video-transcribe", "vibe-edit").
//
// Secrets: OPENAI_API_KEY. Deploy WITH JWT verification:
//   supabase functions deploy video-assist --project-ref hgdbflprrficdoyxmdxe --use-api
// Logic: ./logic.ts (tested). Caps: ../_shared/usageCaps.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { askJev, type JevAnswer, type JevQuestion } from "../_shared/jev.ts";
import { mostlyEnglish } from "../post-score/logic.ts";
import { brollLines, brollQuestions, buildBrollMessages, kindQuestions, parseBrollReply, parseBrollRequest, pickBrollLines, readBroll, readKinds } from "./broll.ts";
import { buildCaptionsMessages, parseCaptionsReply, parseCaptionsRequest } from "./captions.ts";
import { coldQuestions, coldState, parseColdOpenRequest, readColdPick } from "./coldopen.ts";
import { DEFAULT_GRADE, buildMontageMessages, gradeQuestion, parseMontageReply, parseMontageRequest, parsePickRequest, pickQuestions, readGrade, readPicks } from "./montage.ts";
import { buildHooksMessages, hooksPick, hooksQuestions, hooksState, parseHooksReply, parseHooksRequest } from "./hooks.ts";
import { buildPopupMessages, eligibleLines, emojiQuestions, keyQuestions, keyState, parseMotionRequest, parsePopupReply, popupLines, readKeyLines, withEmoji } from "./motion.ts";
import { openaiFetch } from "../_shared/openaiChat.ts";
import {
  CLIP_VIEWER,
  MAX_AUDIO_BYTES,
  applySkips,
  skipQuestions,
  VIBE_MODEL,
  buildClipsMessages,
  batches,
  candidateCount,
  clipWindows,
  interleave,
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
  proposedCount,
  parseVibeReply,
  parseVibeRequest,
  langCode,
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
      // a long recording's later parts are held to the language heard in its first: on its own, a Singlish stretch came back in Malay
      const lang = langCode(new URL(req.url).searchParams.get("lang"));
      if (lang) form.append("language", lang);
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
      return json({ text: data.text ?? "", duration: data.duration ?? 0, language: data.language ?? "", lang: langCode(data.language) ?? "", words: cleanWords(data.words, data.text ?? "") });
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
      const res = await openaiFetch("https://api.openai.com/v1/chat/completions", {
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
      // a long recording is read in passes of about 40 minutes, each one use of the cap
      const windows = clipWindows(c.sentences, c.duration);
      for (let i = 0; i < windows.length; i++) {
        const usage = await consumeUsage(admin, uid, "video-clips");
        if (!usage.allowed) {
          const r = usageRefusal(usage);
          return json(r.body, r.status);
        }
      }
      const limit = candidateCount(c.duration);
      // One more try when no reply clip passes the length and overlap checks: a
      // single run sometimes misses on a perfectly usable video.
      const pass = async (w: (typeof windows)[number]) => {
        let found: ReturnType<typeof parseClipsReply> = null;
        let proposed = 0;
        for (let attempt = 0; attempt < 2 && !found?.length; attempt++) {
          const res = await openaiFetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: VIBE_MODEL, temperature: 0.3, max_tokens: 200 + 120 * limit, response_format: { type: "json_object" }, messages: buildClipsMessages(w.sentences, c.duration, c.about, w) }),
            signal: AbortSignal.timeout(60_000),
          }).catch((e) => (console.error("video-assist clips", e), null));
          if (!res?.ok) {
            if (res) console.error("video-assist clips", res.status, (await res.text()).slice(0, 300));
            return { found: null, proposed, failed: true };
          }
          const content = (await res.json())?.choices?.[0]?.message?.content ?? null;
          found = parseClipsReply(content, c.duration, limit);
          proposed += proposedCount(content);
          if (!found?.length) console.error("video-assist clips: no usable clip", attempt, String(content).slice(0, 500));
        }
        return { found, proposed, failed: false };
      };
      const passes = await Promise.all(windows.map(pass));
      if (passes.every((x) => x.failed)) return json({ error: "Couldn't find clips right now. Try again in a minute." }, 502);
      let clips = interleave(passes.map((x) => x.found ?? []));
      const proposed = passes.reduce((n, x) => n + x.proposed, 0);
      if (!clips.length) return json({ error: "No clips stood out in this video. Try a longer one." }, 422);
      const usable = clips.length;
      // edges on whole sentences and strong words, before Jev reads them; no word timings, no skips
      clips = c.words.length ? clips.map((x) => cleanEdges(x, c.words, c.duration)) : clips.map(({ skip: _, ...x }) => x);
      const english = mostlyEnglish(c.sentences.slice(0, 400).map((x) => x.text).join(" "));
      // Jev in batches side by side: a 2-hour podcast has 60 candidates; null when every batch had no answer
      const ask = async (state: unknown, q: Record<string, JevQuestion>, who: string) => {
        const parts = await Promise.all(batches(q).map((b) => askJev(state, b, { who, timeoutMs: 10_000 })));
        return parts.some(Boolean) ? Object.assign({}, ...parts.filter(Boolean)) as Record<string, JevAnswer> : null;
      };
      // a skipped tangent stays only when Jev reads it as an aside (a decision); without an answer, no skip
      const skips = english && clips.some((x) => x.skip) ? await ask({}, skipQuestions(clips, c.sentences, c.words), "video-assist clip skips") : null;
      clips = applySkips(clips, skips);
      if (!clips.length) return json({ error: "No clips stood out in this video. Try a longer one." }, 422);
      // Jev ranks the candidates from every pass together (Leo's rule: a ranking is a decision); without an answer, the LLM's order
      const answers = english ? await ask({ viewer: CLIP_VIEWER }, clipQuestions(clips, c.sentences, c.words, c.about), "video-assist clips") : null;
      const count = clipCount(c.duration);
      const ranked = rankClips(clips, answers, count, c.about);
      console.log(`video-assist clips: ${proposed} proposed in ${windows.length} ${windows.length === 1 ? "pass" : "passes"}${passes.some((x) => x.failed) ? " (one failed)" : ""}, ${usable} usable, ${clips.length} after cleaning, ${ranked.length} kept (floor ${count.min}, Jev ${answers ? "on" : "off"}, ${Math.round(c.duration)}s)`);
      return json({ clips: ranked });
    }

    if (body?.mode === "cutaways") {
      const c = parseCutawaysRequest(body);
      if (!c.ok) return json({ error: c.error }, 400);
      const usage = await consumeUsage(admin, uid, "video-cutaways");
      if (!usage.allowed) {
        const r = usageRefusal(usage);
        return json(r.body, r.status);
      }
      const res = await openaiFetch("https://api.openai.com/v1/chat/completions", {
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
      const lines = readKeyLines(answers, idx);
      // pop-ups for the strongest few: the LLM writes the words, Jev picks the emoji; without them the picks still stand
      const pick = lines ? popupLines(m.lines, lines, m.duration) : [];
      let popups = null;
      if (pick.length) {
        const res = await openaiFetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: VIBE_MODEL, temperature: 0.4, max_tokens: 500, response_format: { type: "json_object" }, messages: buildPopupMessages(m.lines, pick) }),
          signal: AbortSignal.timeout(45_000),
        }).catch(() => null);
        if (!res?.ok) console.error("video-assist motion popups", res?.status, (await res?.text().catch(() => ""))?.slice(0, 300));
        const written = res?.ok ? parsePopupReply((await res.json())?.choices?.[0]?.message?.content ?? null, pick) : [];
        if (written.length) popups = withEmoji(await askJev({ video: "Pop-up text on a short video by a Singapore financial adviser." }, emojiQuestions(m.lines, written), { who: "video-assist motion emoji" }), written);
      }
      return json({ lines, popups });
    }

    if (body?.mode === "broll") {
      const b = parseBrollRequest(body);
      if (!b.ok) return json({ error: b.error }, 400);
      const usage = await consumeUsage(admin, uid, "broll-picks");
      if (!usage.allowed) {
        const r = usageRefusal(usage);
        return json(r.body, r.status);
      }
      // Jev picks the lines (Leo's rule: a pick is a decision); without an answer nothing is placed
      const { lines } = b.request;
      const idx = brollLines(b.request);
      if (!idx.length) return json({ picks: [] });
      if (!mostlyEnglish(lines.map((x) => x.text).join(" "))) return json({ picks: null });
      const state = keyState(lines);
      const parts = await Promise.all(brollQuestions(lines, idx).map((q) => askJev(state, q, { who: "video-assist broll", timeoutMs: 10_000 })));
      const probs = readBroll(parts.some(Boolean) ? Object.assign({}, ...parts.filter(Boolean)) : null, idx);
      if (!probs) return json({ picks: null });
      const pick = pickBrollLines(lines, probs, b.request.duration, b.request.room);
      if (!pick.length) return json({ picks: [] });
      // Jev says what each line needs (a scene clip only when it says scene); the LLM writes the words only
      const kinds = readKinds(await askJev(state, kindQuestions(lines, pick), { who: "video-assist broll kinds", timeoutMs: 10_000 }), pick);
      const res = await openaiFetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: VIBE_MODEL, temperature: 0.3, max_tokens: 500, response_format: { type: "json_object" }, messages: buildBrollMessages(lines, pick, kinds) }),
        signal: AbortSignal.timeout(45_000),
      }).catch(() => null);
      if (!res?.ok) {
        console.error("video-assist broll", res?.status, (await res?.text().catch(() => ""))?.slice(0, 300));
        return json({ error: "Couldn't find B-roll right now. Try again in a minute." }, 502);
      }
      const picks = parseBrollReply((await res.json())?.choices?.[0]?.message?.content ?? null, pick, kinds);
      console.log(`video-assist broll: ${idx.length} lines asked, ${pick.length} picked (${Object.values(kinds).filter((k) => k === "scene").length} scenes), ${picks.length} written`);
      return json({ picks });
    }

    if (body?.mode === "montage") {
      const m = parseMontageRequest(body);
      if (!m.ok) return json({ error: m.error }, 400);
      const usage = await consumeUsage(admin, uid, "montage-beats");
      if (!usage.allowed) {
        const r = usageRefusal(usage);
        return json(r.body, r.status);
      }
      const res = await openaiFetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: VIBE_MODEL, temperature: 0.7, max_tokens: 900, response_format: { type: "json_object" }, messages: buildMontageMessages(m.theme, m.seconds) }),
        signal: AbortSignal.timeout(45_000),
      }).catch(() => null);
      if (!res?.ok) {
        console.error("video-assist montage", res?.status, (await res?.text().catch(() => ""))?.slice(0, 300));
        return json({ error: "Couldn't plan the montage right now. Try again in a minute." }, 502);
      }
      const beats = parseMontageReply((await res.json())?.choices?.[0]?.message?.content ?? null, m.seconds);
      if (!beats) return json({ error: "The plan came back incomplete. Try again." }, 502);
      // Jev picks the one colour grade (a decision); the editor's default look when it has no answer or the theme is not English
      const grade = mostlyEnglish(m.theme) ? readGrade(await askJev({ theme: m.theme }, gradeQuestion(m.theme), { who: "video-assist montage grade" })) : DEFAULT_GRADE;
      return json({ beats, grade });
    }

    if (body?.mode === "montage-pick") {
      const p = parsePickRequest(body);
      if (!p.ok) return json({ error: p.error }, 400);
      const usage = await consumeUsage(admin, uid, "montage-pick");
      if (!usage.allowed) {
        const r = usageRefusal(usage);
        return json(r.body, r.status);
      }
      // Jev picks the clip for each beat, or says none fits; null per beat when it has no answer (the editor takes the first)
      const q = pickQuestions(p.beats);
      const answers = Object.keys(q).length && mostlyEnglish(p.beats.map((b) => b.say).join(" ")) ? await askJev({ theme: p.theme }, q, { who: "video-assist montage pick", timeoutMs: 10_000 }) : null;
      return json({ picks: readPicks(answers, p.beats) });
    }

    if (body?.mode === "hooks") {
      const h = parseHooksRequest(body);
      if (!h.ok) return json({ error: h.error }, 400);
      const usage = await consumeUsage(admin, uid, "vibe-edit");
      if (!usage.allowed) {
        const r = usageRefusal(usage);
        return json(r.body, r.status);
      }
      const res = await openaiFetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: VIBE_MODEL, temperature: 0.7, max_tokens: 300, response_format: { type: "json_object" }, messages: buildHooksMessages(h.lines, h.formulas) }),
        signal: AbortSignal.timeout(45_000),
      }).catch(() => null);
      if (!res?.ok) {
        console.error("video-assist hooks", res?.status, (await res?.text().catch(() => ""))?.slice(0, 300));
        return json({ error: "Couldn't write hooks right now. Try again in a minute." }, 502);
      }
      const hooks = parseHooksReply((await res.json())?.choices?.[0]?.message?.content ?? null, h.formulas);
      if (!hooks) return json({ error: "The hooks came back incomplete. Try again." }, 502);
      // Jev picks the one to start with (Leo's rule: a pick is a decision); without an answer none is picked
      const texts = hooks.map((x) => x.text);
      const answers = mostlyEnglish(h.lines.map((x) => x.text).join(" ")) ? await askJev(hooksState(texts, h.lines), hooksQuestions(texts), { who: "video-assist hooks" }) : null;
      return json({ hooks, pick: hooksPick(answers, hooks.length) });
    }

    if (body?.mode === "captions") {
      const c = parseCaptionsRequest(body);
      if (!c.ok) return json({ error: c.error }, 400);
      const usage = await consumeUsage(admin, uid, "video-captions");
      if (!usage.allowed) {
        const r = usageRefusal(usage);
        return json(r.body, r.status);
      }
      const res = await openaiFetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: VIBE_MODEL, temperature: 0.7, max_tokens: 1200, response_format: { type: "json_object" }, messages: buildCaptionsMessages(c.transcript, c.instagram, c.title, c.rules) }),
        signal: AbortSignal.timeout(45_000),
      }).catch(() => null);
      if (!res?.ok) {
        console.error("video-assist captions", res?.status, (await res?.text().catch(() => ""))?.slice(0, 300));
        return json({ error: "Couldn't write the captions right now. Try again in a minute." }, 502);
      }
      const captions = parseCaptionsReply((await res.json())?.choices?.[0]?.message?.content ?? null);
      if (!captions) return json({ error: "The captions came back incomplete. Try again." }, 502);
      return json({ captions });
    }

    if (body?.mode === "coldopen") {
      const c = parseColdOpenRequest(body);
      if (!c.ok) return json({ error: c.error }, 400);
      const usage = await consumeUsage(admin, uid, "cold-open");
      if (!usage.allowed) {
        const r = usageRefusal(usage);
        return json(r.body, r.status);
      }
      // Jev rates the lines (Leo's rule: a pick is a decision); without an answer there is no cold open
      if (!mostlyEnglish(c.lines.map((x) => x.text).join(" "))) return json({ pick: null, why: "language" });
      const asked = c.opening === null ? c.candidates : [...c.candidates, c.opening];
      const parts = await Promise.all(coldQuestions(c.lines, asked).map((q) => askJev(coldState(c.title), q, { who: "video-assist coldopen", timeoutMs: 10_000 })));
      const answers = parts.some(Boolean) ? Object.assign({}, ...parts.filter(Boolean)) : null;
      return json(answers ? { pick: readColdPick(answers, c.candidates, c.opening) } : { pick: null, why: "unrated" });
    }

    if (body?.mode === "publish") {
      const p = parsePublishRequest(body);
      if (!p.ok) return json({ error: p.error }, 400);
      const usage = await consumeUsage(admin, uid, "video-publish");
      if (!usage.allowed) {
        const r = usageRefusal(usage);
        return json(r.body, r.status);
      }
      const res = await openaiFetch("https://api.openai.com/v1/chat/completions", {
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
    const res = await openaiFetch("https://api.openai.com/v1/chat/completions", {
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
