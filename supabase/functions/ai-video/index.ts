// Videos made without filming, on Edit a video, through Higgsfield (Leo's choice, 2026-10-08).
//   POST {mode:"script", topic}      -> {scenes:[{say, picture}]}  OpenAI writes an explainer ("ai-video-script" cap)
//   POST {mode:"presenter", look, setting?} -> {token}  one AI presenter picture, Soul v2 9:16 ("ai-image" cap),
//        in a fixed setting (logic.ts SETTINGS; today's office when none)
//   POST {mode:"avatar", photo, slices:[{wav, seconds}]} -> {tokens, credits}  Higgsfield Speak per slice
//   POST {mode:"explainer", pictures} -> {tokens, credits}  one Soul v2 picture per scene
//   POST {mode:"template", template, seconds, quality, fields, photos} -> {tokens, credits}  a template clip:
//        OpenAI writes the Seedance prompt by the template's structure (templates.ts), then Seedance 2.5 makes it
//        (a person's photo as the first frame, a product's as a reference; logic.ts seedanceRequest). A fixed template
//        (crumple-hook) skips the writer: its structure is the prompt (templates.ts fixedPrompt).
//        Counts against "ai-clip" (2 a day) and "ai-clip-global" (8 a day across everyone).
//   POST {mode:"status", tokens, refund?} -> {jobs:[{state, url?, error?}]}
//        a request Higgsfield failed is logged with its own answer, links cut ("ai-video status failed <id> <answer>")
//   POST {mode:"talk-script", talk, topic, offer?, source?} -> {say, headline?, mas}  a presenter format's script
//        (formats-presenter: news, stage or spokesperson), OpenAI writes it and Jev asks the MAS question
//        ("ai-video-script" cap; the use comes back only when OpenAI never answered)
//   POST {mode:"set", talk} -> {token}  one Soul v2 picture of an empty news studio or stage, 9:16, nobody in it,
//        for the editor to paint behind an adviser's own photo ("ai-image" cap)
// The narrated video (formats-faceless-video, formats-animated), NORTH_STAR_USERS only:
//   POST {mode:"script", topic, source?, seconds?} -> {scenes:[{say, picture, search}], look: {id, p} | null, mas}
//        for a listed account, always this shape: 30 or 60 s, from a topic, a pasted script (its words kept) or a read
//        page, a stock search per scene, Jev's look pick and its MAS answer in one call ("ai-video-script" cap; the use
//        comes back only when OpenAI never answered). Anyone else's script is today's, and source or seconds is 403.
//   notes? on script and talk-script (brand-voice-memory): the adviser's facts and standing notes for videos, at most
//        600 characters, printed after the topic for a listed account; anyone else's are ignored, never refused.
//   POST {mode:"explainer", pictures, look?} up to 10 pictures, or 1 or 2 beside stock clips; look ignored for anyone else
//   POST {mode:"move", tokens, look?} -> {tokens: (token | null)[], credits}  DoP lite moves each finished picture
//        5 s in the look's motion (ai-image/broll.ts); no new use, once per video (claimOnce on its first picture),
//        polled by status without a refund ticket, so a failed move keeps the use and its scene stays a still
//   POST {mode:"read", url} -> {title, site, text}  a public page's article, at most 300 KB read and 6,000 characters
//        kept (_shared/safeFetch.ts), passed when Jev finds a clear point ("page-read" cap; the use comes back only
//        when the page never answered)
// A video (avatar or explainer) counts once against the adviser's "ai-video" cap (2 a day) and once
// against "ai-video-global" (20 a day across everyone, kept on the owner's account), so nobody can
// drain the prepaid Higgsfield pool. Tokens are the Higgsfield request ids signed for the adviser who
// started them (ai-image's jobToken), so nobody else can read a job.
// A video or clip that Higgsfield refused, failed or blocked gives both uses back: at once when the submit
// fails, or on the status check that first sees the failure, by the signed refund ticket handed back at the
// start (logic.ts refundFailed: once per video, only on the day the uses were taken). That status check also cancels the
// video's other parts at Higgsfield, which only a queued part allows; when a part was already being made or made, the
// failed part's error says its credits may already be spent (D2, phase 5 dogfood, 23 Oct).
// A saved face (people-my-face), NORTH_STAR_USERS only:
//   POST {mode:"consent-code", kind:"face"} -> {code, ticket}  4 digits to read aloud, signed for this uid and UTC day; free
//   POST {mode:"consent", kind:"face", wav, code, ticket, photo} -> {heard, photoHash, token, at}  Whisper hears the 16 kHz
//        recording (never prompted with the code) and the photo's sha256 is signed for this uid ("likeness-check" cap; the
//        use comes back only when Whisper never answered; a code not heard is 422 not_heard and keeps it). Neither the
//        sound nor the photo is stored here; the recording's video never leaves the device.
// Saved presenters (people-presenters), NORTH_STAR_USERS only:
//   POST {mode:"presenters", prefs:{gender?, age?, background?, dress?}, extra?} -> {tokens, looks}  three different invented
//        Singaporeans (logic.ts presenterLooks) as three Soul v2 pictures, polled by status. Jev reads `extra` before
//        anything is counted (a real person or a minor is 422 and takes nothing; no answer goes ahead). Three
//        "ai-presenter" uses and one "ai-presenter-global"; all of them come back only when Higgsfield's submit fails.
// Same edit's versions (remix-format-clone), NORTH_STAR_USERS only:
//   POST {mode:"avatar", photo, slices, version:{plan, of?}} a Speak run made from an edit plan ("ep-" id, and the
//        "ev-" version it changes): counted on "edit-version" (6 a day) and "ai-video-global" instead of "ai-video",
//        given back the same ways. Anyone else's version is ignored, never refused, so their run counts as today.
// Phase 3's hidden and Leo-only templates, any presenter setting but office, talk-script and set answer 403
// not_enabled for anyone not on NORTH_STAR_USERS, after JWT and before any count (logic.ts northStarOnly; the two
// new modes before their body is checked too); every other request is as before.
//
// Secrets: HF_API_KEY, HF_API_SECRET (shared with ai-image), OPENAI_API_KEY, NORTH_STAR_USERS, TYPESAFE_API_KEY (Jev; none means no MAS answer). Deploy WITH JWT verification:
//   supabase functions deploy ai-video --project-ref hgdbflprrficdoyxmdxe --use-api
// Logic: ./logic.ts (tested). Caps: ../_shared/usageCaps.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GLOBAL_COUNTER_USER, claimOnce, consumeUsage, refundUsage, usageRefusal, type UsageFeature } from "../_shared/usageCaps.ts";
import { HF_BASE, jobToken, openJobToken, tokenSecret } from "../ai-image/logic.ts";
import { MOTION_MODEL, motionBody } from "../ai-image/broll.ts";
import { fetchCapped } from "../_shared/safeFetch.ts";
import { isAllowed } from "../market/logic.ts";
import { askJev, noulOf } from "../_shared/jev.ts";
import { consentSecret, heardCode, newCode, openSigned, signFor } from "../_shared/consent.ts";
import { MAS_QUESTION, masWarn } from "../_shared/mas.ts";
import {
  CHECK_FAILED, CODE_GONE, consentTicket, faceToken, notHeard, sha256Hex, LOOK_REFUSED, lookQuestions, presenterLooks, readLookCheck,
  NARRATED_FORMAT, NORTH_STAR_MODES, NO_POINT, failureLine, partsSpent, PAGE_BYTES, PICTURE_MODEL, POINT_QUESTION, READ_FAILED, REFUNDS, SCRIPT_FORMAT, SPEAK_MODEL,
  TALK_FORMAT, avatarCredits, clipCredits, explainerCredits, lookPick, lookQuestion, motionPrompt, moveClaimKey, moveCredits, narratedSystem, narratedUser,
  northStarOnly, parseVideoRequest, pictureBody, pointPasses, presenterBody, readArticle, readMedia, refundFailed, refundTicket, scriptPrompt, seedanceRequest, setBody,
  speakBody, talkSystem, talkUser, validateScript, validateTalk, type MediaState, type Refundable,
} from "./logic.ts";
import { PROMPT_FORMAT, clipPrompt, fixedPrompt, templateById, templateDetails, templateSystem } from "./templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const RETRY = "Couldn't start the video right now. Try again in a minute.";
const NO_CREDITS = "AI video credits have run out. Tell your studio admin.";

/** Same edit's `version` field: the plan and the version it changes, or null when it is malformed. */
function versionOf(v: unknown): { plan: string; of?: string } | null {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const id = (x: unknown, prefix: string) => typeof x === "string" && new RegExp(`^${prefix}-[0-9a-z]{1,16}$`).test(x);
  if (!id(o.plan, "ep") || (o.of != null && !id(o.of, "ev"))) return null;
  return { plan: o.plan as string, ...(o.of != null ? { of: o.of as string } : {}) };
}

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

/** What Whisper heard in the consent recording, or null when it never answered (non-2xx, timeout, no connection). */
async function hear(key: string, wavB64: string): Promise<string | null> {
  const form = new FormData();
  form.append("file", new Blob([Uint8Array.from(atob(wavB64), (c) => c.charCodeAt(0))], { type: "audio/wav" }), "consent.wav");
  form.append("model", "whisper-1");
  form.append("language", "en");
  form.append("response_format", "json");
  // no prompt: a prompt holding the code could come back as heard when nobody said it
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  }).catch((e) => (console.error("ai-video whisper request failed", e), null));
  if (!res) return null;
  if (!res.ok) {
    console.error("ai-video whisper", res.status, (await res.text().catch(() => "")).slice(0, 300));
    return null;
  }
  const data = await res.json().catch(() => null);
  return typeof data?.text === "string" ? data.text.slice(0, 500) : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const parsed = parseVideoRequest(body);
    // phase 3's own modes keep the new order: sign-in, the gate, then their body
    const newMode = NORTH_STAR_MODES.includes(body?.mode);
    if (!parsed.ok && !newMode) return json({ error: parsed.error }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to make videos." }, 401);
    const listed = isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid);
    if ((newMode || (parsed.ok && northStarOnly(parsed.request))) && !listed) {
      return json({ code: "not_enabled", error: "This isn't switched on for your account yet." }, 403);
    }
    if (!parsed.ok) return json({ code: "bad_request", error: parsed.error }, 400);
    const r = parsed.request;
    // a Speak run from an edit plan, read for a listed account only: anyone else's field changes nothing
    const version = r.mode === "avatar" && listed && body?.version != null ? versionOf(body.version) : undefined;
    if (version === null) return json({ code: "bad_request", error: "That version of the edit isn't known." }, 400);

    if (r.mode === "talk-script") {
      const openai = Deno.env.get("OPENAI_API_KEY");
      if (!openai) return json({ error: "Scripts aren't switched on yet." }, 503);
      const day = new Date().toISOString().slice(0, 10);
      const usage = await consumeUsage(admin, uid, "ai-video-script");
      if (!usage.allowed) {
        const refusal = usageRefusal(usage);
        return json(refusal.body, refusal.status);
      }
      // one retry on a script that runs short or long; a reply that never comes gives the use back
      let out: ReturnType<typeof validateTalk> = null;
      for (let i = 0; i < 2 && !out; i++) {
        const content = await writeJson(openai, talkSystem(r.talk, r.offer?.name), talkUser(r), TALK_FORMAT, 600);
        if (content === null) {
          await refundUsage(admin, uid, "ai-video-script", day);
          return json({ code: "failed", error: "Couldn't write the script. Try again in a minute." }, 502);
        }
        out = validateTalk(content, r.talk);
        if (!out) console.error("ai-video talk-script rejected", content.slice(0, 300));
      }
      if (!out) return json({ code: "unusable", error: "The script didn't come back right. Try again." }, 422);
      const answers = await askJev({ post: out.say }, { mas: { type: "noul", instructions: MAS_QUESTION } }, { who: "ai-video talk-script mas" });
      return json({ ...out, mas: masWarn(noulOf(answers, "mas")), usage: { used: usage.used, limit: usage.limit } });
    }

    if (r.mode === "read") {
      const day = new Date().toISOString().slice(0, 10);
      const usage = await consumeUsage(admin, uid, "page-read");
      if (!usage.allowed) {
        const refusal = usageRefusal(usage);
        return json(refusal.body, refusal.status);
      }
      let page: Awaited<ReturnType<typeof fetchCapped>>;
      try {
        page = await fetchCapped(new URL(r.url), PAGE_BYTES, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", AbortSignal.timeout(20_000));
      } catch (e) {
        // a private address, a refused or failed answer, a timeout: the page never answered, so the use comes back
        console.error("ai-video read", r.url, String(e).slice(0, 200));
        await refundUsage(admin, uid, "page-read", day);
        return json({ code: "failed", error: READ_FAILED }, 502);
      }
      const article = readArticle(new TextDecoder().decode(page.bytes), page.url, page.type);
      if (!article) return json({ code: "unreadable", error: READ_FAILED }, 422);
      const answers = await askJev({ title: article.title, page: article.text.slice(0, 3000) }, { point: { type: "noul", instructions: POINT_QUESTION } }, { who: "ai-video read point" });
      if (!pointPasses(noulOf(answers, "point"))) return json({ code: "no_point", error: NO_POINT }, 422);
      return json({ ...article, usage: { used: usage.used, limit: usage.limit } });
    }

    if (r.mode === "script" && listed) {
      const openai = Deno.env.get("OPENAI_API_KEY");
      if (!openai) return json({ error: "Explainers aren't switched on yet." }, 503);
      const day = new Date().toISOString().slice(0, 10);
      const usage = await consumeUsage(admin, uid, "ai-video-script");
      if (!usage.allowed) {
        const refusal = usageRefusal(usage);
        return json(refusal.body, refusal.status);
      }
      const seconds = r.seconds ?? 30;
      const keep = r.source?.kind === "script" ? r.source.text : undefined;
      // one retry on scenes that run long or change a pasted script's words; a reply that never comes gives the use back
      let scenes: ReturnType<typeof validateScript> = null;
      for (let i = 0; i < 2 && !scenes; i++) {
        const content = await writeJson(openai, narratedSystem(r), narratedUser(r), NARRATED_FORMAT, seconds === 60 ? 2400 : 1500);
        if (content === null) {
          await refundUsage(admin, uid, "ai-video-script", day);
          return json({ code: "failed", error: "Couldn't write the script. Try again in a minute." }, 502);
        }
        scenes = validateScript(content, { seconds, keep });
        if (!scenes) console.error("ai-video narrated script rejected", content.slice(0, 300));
      }
      if (!scenes) return json({ code: "unusable", error: keep ? "Couldn't split your script without changing it. Try again." : "The explainer didn't come back right. Try again." }, 422);
      const script = scenes.map((s) => s.say).join(" ");
      const answers = await askJev(
        { topic: r.topic || (r.source?.kind === "link" ? r.source.title : ""), script },
        { look: lookQuestion(seconds), mas: { type: "noul", instructions: MAS_QUESTION } },
        { who: "ai-video narrated script" },
      );
      return json({ scenes, look: lookPick(answers), mas: masWarn(noulOf(answers, "mas")), usage: { used: usage.used, limit: usage.limit } });
    }

    if (r.mode === "script") {
      const openai = Deno.env.get("OPENAI_API_KEY");
      if (!openai) return json({ error: "Explainers aren't switched on yet." }, 503);
      const usage = await consumeUsage(admin, uid, "ai-video-script");
      if (!usage.allowed) {
        const refusal = usageRefusal(usage);
        return json(refusal.body, refusal.status);
      }
      const { system, user } = scriptPrompt(r);
      const content = await writeJson(openai, system, user, SCRIPT_FORMAT, 1200);
      const scenes = validateScript(content);
      if (!scenes) {
        if (content) console.error("ai-video script rejected", content.slice(0, 300));
        return json({ error: "The explainer didn't come back right. Try again." }, 502);
      }
      return json({ scenes, usage: { used: usage.used, limit: usage.limit } });
    }

    if (r.mode === "consent-code" || r.mode === "consent") {
      // its own secret, so no job token or refund ticket can pass as consent
      const signer = await consentSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const day = new Date().toISOString().slice(0, 10);
      if (r.mode === "consent-code") {
        const code = newCode();
        return json({ code, ticket: await signFor(signer, uid, consentTicket(code, day)) });
      }
      // openSigned knows the uid, not the day: only today's ticket for this code opens as today's text
      if ((await openSigned(signer, uid, r.ticket)) !== consentTicket(r.code, day)) return json({ code: "bad_request", error: CODE_GONE }, 400);
      const openai = Deno.env.get("OPENAI_API_KEY");
      if (!openai) return json({ error: "Face checks aren't switched on yet." }, 503);
      const usage = await consumeUsage(admin, uid, "likeness-check");
      if (!usage.allowed) {
        const refusal = usageRefusal(usage);
        return json(refusal.body, refusal.status);
      }
      const heard = await hear(openai, r.wav);
      if (heard === null) {
        await refundUsage(admin, uid, "likeness-check", day);
        return json({ code: "failed", error: CHECK_FAILED }, 502);
      }
      if (!heardCode(heard, r.code)) return json({ code: "not_heard", error: notHeard(r.code), heard }, 422);
      const photoHash = await sha256Hex(r.photo);
      const at = new Date().toISOString();
      return json({ heard, photoHash, at, token: await signFor(signer, uid, faceToken(photoHash, at)), usage: { used: usage.used, limit: usage.limit } });
    }

    const key = Deno.env.get("HF_API_KEY");
    const secret = Deno.env.get("HF_API_SECRET");
    if (!key || !secret) {
      console.error("HF_API_KEY / HF_API_SECRET are not set");
      return json({ error: "AI videos aren't switched on yet." }, 503);
    }
    const auth = { Authorization: `Key ${key}:${secret}` };
    const signing = await tokenSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const day = new Date().toISOString().slice(0, 10); // the counter's day (UTC), as cs_consume_ai_usage keeps it
    // shortcut: logic.ts's ticketText for edit-version, which its REFUNDS doesn't list; fold it in there when that file can change.
    const versionTicket = (ids: string[]) => `${uid}:refund:edit-version:${day}:${ids.map((id) => id.toLowerCase()).join(",")}`;

    if (r.mode === "status") {
      const ids = await Promise.all(r.tokens.map((token) => openJobToken(signing, uid, token)));
      const jobs = await Promise.all(ids.map(async (id): Promise<MediaState> => {
        if (!id) return { state: "failed", error: "That video job isn't known." };
        try {
          const res = await fetch(`${HF_BASE}/requests/${id}/status`, { headers: auth, signal: AbortSignal.timeout(15_000) });
          if (res.status === 404) return { state: "failed", error: "That video job isn't known." };
          if (!res.ok) return { state: "working" };
          const data = await res.json().catch(() => null);
          const m = readMedia(data);
          // Higgsfield's own status and reason, so a failure can be read later (no keys, links cut)
          if (m.state === "failed") console.error("ai-video status failed", id, failureLine(data));
          return m;
        } catch {
          return { state: "working" }; // a blip: the browser asks again
        }
      }));
      if (ids.every(Boolean)) {
        const anyFailed = jobs.some((j) => j.state === "failed");
        const back = await refundFailed(admin, signing, uid, ids as string[], anyFailed, r.refund, day);
        // a version run's ticket names edit-version: both uses back, once per video, as refundFailed does
        if (!back && anyFailed && r.refund && (await openJobToken(signing, versionTicket(ids as string[]), r.refund)) && (await claimOnce(admin, uid, `refund:${ids[0]!.toLowerCase()}`))) {
          await refundUsage(admin, uid, "edit-version" as UsageFeature, day);
          await refundUsage(admin, GLOBAL_COUNTER_USER, "ai-video-global", day);
        }
      }
      // a video's poll (it carries the refund ticket) drops every part at the first failure, so the others are cancelled:
      // Higgsfield cancels and refunds only a queued request; one it is making or has made is charged, and the error says so
      const first = jobs.findIndex((j) => j.state === "failed");
      const failed = jobs[first];
      if (r.refund && failed?.state === "failed") {
        const charged = await Promise.all(ids.map(async (id, i) => {
          if (!id || jobs[i].state === "failed") return false;
          if (jobs[i].state === "done") return true;
          const res = await fetch(`${HF_BASE}/requests/${id}/cancel`, { method: "POST", headers: auth, signal: AbortSignal.timeout(15_000) }).catch(() => null);
          console.log("ai-video cancel", id, res?.status ?? "no answer");
          return !res?.ok;
        }));
        const n = charged.filter(Boolean).length;
        if (n) jobs[first] = { state: "failed", error: `${failed.error} ${partsSpent(n)}` };
      }
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
    /** Nothing was made after the uses were taken: both come back (the adviser's alone when everyone's wasn't taken). */
    const giveBack = (feature: Refundable, both = true) =>
      Promise.all([refundUsage(admin, uid, feature, day), both && refundUsage(admin, GLOBAL_COUNTER_USER, REFUNDS[feature], day)]);

    if (r.mode === "presenters") {
      // the typed part of the look, before anything is counted or paid
      if (r.extra) {
        const answers = await askJev({ look: r.extra }, lookQuestions(), { who: "ai-video presenter look" });
        if (noulOf(answers, "realPerson") === null || noulOf(answers, "minor") === null) console.warn("jev: presenter look unread");
        const refused = readLookCheck(answers);
        if (refused) return json({ code: refused, error: LOOK_REFUSED[refused] }, 422);
      }
      // three of the adviser's uses, one at a time: when one is refused, those already taken come back
      let usage = { used: 0, limit: 0 };
      for (let i = 0; i < 3; i++) {
        const u = await consumeUsage(admin, uid, "ai-presenter");
        if (!u.allowed) {
          for (let k = 0; k < i; k++) await refundUsage(admin, uid, "ai-presenter", day);
          const refusal = usageRefusal(u);
          return json(refusal.body, refusal.status);
        }
        usage = { used: u.used, limit: u.limit };
      }
      const backMine = async () => {
        for (let k = 0; k < 3; k++) await refundUsage(admin, uid, "ai-presenter", day);
      };
      const everyone = await consumeUsage(admin, GLOBAL_COUNTER_USER, "ai-presenter-global");
      if (!everyone.allowed) {
        await backMine();
        if (everyone.reason === "limit") return json({ code: "global_limit", error: "Today's presenters for the whole studio are made. Try again after 8am Singapore time." }, 429);
        const refusal = usageRefusal(everyone);
        return json(refusal.body, refusal.status);
      }
      const looks = presenterLooks(r.prefs, r.extra);
      const ids: string[] = [];
      try {
        for (const look of looks) ids.push(await submit(PICTURE_MODEL, presenterBody(look)));
      } catch (e) {
        // no refund ticket on these pictures: a submit that fails cancels what is queued and gives every use back
        await Promise.all(ids.map((id) => fetch(`${HF_BASE}/requests/${id}/cancel`, { method: "POST", headers: auth }).catch(() => null)));
        await backMine();
        await refundUsage(admin, GLOBAL_COUNTER_USER, "ai-presenter-global", day);
        return json({ code: "failed", error: e instanceof HfError && e.status === 403 ? NO_CREDITS : "Couldn't make the presenters. Try again in a minute." }, 502);
      }
      return json({ tokens: await Promise.all(ids.map((id) => jobToken(signing, uid, id))), looks, usage });
    }

    if (r.mode === "move") {
      // no new use: the explainer took its ai-video use; the pictures must be this caller's and finished
      const ids = await Promise.all(r.tokens.map((token) => openJobToken(signing, uid, token)));
      if (!ids.every(Boolean)) return json({ code: "bad_request", error: "Those pictures aren't known." }, 400);
      const urls = await Promise.all(ids.map(async (id) => {
        const res = await fetch(`${HF_BASE}/requests/${id}/status`, { headers: auth, signal: AbortSignal.timeout(15_000) }).catch(() => null);
        const m = res?.ok ? readMedia(await res.json().catch(() => null)) : null;
        return m?.state === "done" ? m.url : null;
      }));
      if (urls.some((u) => !u)) return json({ code: "not_ready", error: "The pictures aren't ready yet. Try again in a minute." }, 409);
      // each picture moves once: the video's first picture says whether it already has, and a picture sent again later is skipped
      if (!(await claimOnce(admin, uid, moveClaimKey(ids[0]!)))) return json({ code: "already_moving", error: "These scenes are already moving." }, 409);
      const fresh = [true, ...(await Promise.all(ids.slice(1).map((id) => claimOnce(admin, uid, moveClaimKey(id!)))))];
      const prompt = motionPrompt(r.look);
      // a scene Higgsfield won't take stays a still; the rest move
      const moved = await Promise.all(urls.map((u, i) => (fresh[i] ? submit(MOTION_MODEL, motionBody(u!, prompt)).then((id) => jobToken(signing, uid, id), () => null) : null)));
      const credits = moveCredits(moved.filter(Boolean).length);
      console.log("ai-video move", moved.filter(Boolean).length, "of", moved.length, "scenes,", credits, "credits");
      return json({ tokens: moved, credits });
    }

    if (r.mode === "presenter") {
      const usage = await consumeUsage(admin, uid, "ai-image");
      if (!usage.allowed) {
        const refusal = usageRefusal(usage);
        return json(refusal.body, refusal.status);
      }
      try {
        return json({ token: await jobToken(signing, uid, await submit(PICTURE_MODEL, presenterBody(r.look, r.setting))) });
      } catch (e) {
        return failed(e);
      }
    }

    if (r.mode === "set") {
      const usage = await consumeUsage(admin, uid, "ai-image");
      if (!usage.allowed) {
        const refusal = usageRefusal(usage);
        return json(refusal.body, refusal.status);
      }
      try {
        return json({ token: await jobToken(signing, uid, await submit(PICTURE_MODEL, setBody(r.talk))) });
      } catch (e) {
        // Higgsfield took no job, so nothing was made
        await refundUsage(admin, uid, "ai-image", day);
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
        await giveBack("ai-clip", false);
        if (everyone.reason === "limit") return json({ code: "daily_limit", error: "Today's AI clips for the whole studio are used up. Try again after 8am Singapore time." }, 429);
        const refusal = usageRefusal(everyone);
        return json(refusal.body, refusal.status);
      }
      const photo = r.photos[0] ?? null;
      const written = t.fixed ? null : await writeJson(openai, templateSystem(t, r.seconds, photo?.role ?? null), templateDetails(t, r.fields), PROMPT_FORMAT, 1500);
      const prompt = t.fixed ? fixedPrompt(t, photo?.role ?? null) : clipPrompt(written, photo?.role ?? null);
      if (!prompt) {
        if (written) console.error("ai-video template prompt rejected", written.slice(0, 300));
        await giveBack("ai-clip");
        return json({ error: "The clip's shots didn't come back right. Try again." }, 502);
      }
      try {
        const uploaded = photo ? { role: photo.role, url: await upload(photo.jpeg, "image/jpeg") } : null;
        const { model, body } = seedanceRequest(prompt, r.seconds, r.quality, uploaded);
        const id = await submit(model, body);
        const credits = clipCredits(r.seconds, r.quality);
        console.log("ai-video template", t.id, model, r.seconds, r.quality, credits, "credits");
        return json({
          tokens: [await jobToken(signing, uid, id)],
          refund: await refundTicket(signing, uid, "ai-clip", day, [id]),
          credits,
          usage: { used: mine.used, limit: mine.limit },
        });
      } catch (e) {
        await giveBack("ai-clip");
        return failed(e);
      }
    }

    // A video: the adviser's own cap first, so someone at their limit can't use up everyone's.
    // shortcut: the cast type-checks this branch before contracts adds "edit-version" to DAILY_LIMITS; drop it after the wave 1 merge.
    const videoCap = (version ? "edit-version" : "ai-video") as UsageFeature;
    const mine = await consumeUsage(admin, uid, videoCap);
    if (!mine.allowed) {
      const refusal = usageRefusal(mine);
      return json(refusal.body, refusal.status);
    }
    const videoBack = (both = true) =>
      Promise.all([refundUsage(admin, uid, videoCap, day), both && refundUsage(admin, GLOBAL_COUNTER_USER, "ai-video-global", day)]);
    const everyone = await consumeUsage(admin, GLOBAL_COUNTER_USER, "ai-video-global");
    if (!everyone.allowed) {
      await videoBack(false);
      if (everyone.reason === "limit") return json({ code: "daily_limit", error: "Today's AI videos for the whole studio are used up. Try again after 8am Singapore time." }, 429);
      const refusal = usageRefusal(everyone);
      return json(refusal.body, refusal.status);
    }

    const ids: string[] = [];
    try {
      if (r.mode === "avatar") {
        const image = "url" in r.photo ? r.photo.url : await upload(r.photo.jpeg, "image/jpeg");
        const audio = await Promise.all(r.slices.map((s) => upload(s.wav, "audio/wav")));
        const seed = Math.floor(Math.random() * 1_000_000);
        for (let i = 0; i < r.slices.length; i++) ids.push(await submit(SPEAK_MODEL, speakBody(image, audio[i], r.slices[i].seconds, seed)));
      } else {
        // a look is NORTH_STAR_USERS only: anyone else gets today's photos
        const look = listed ? r.look : undefined;
        for (const p of r.pictures) ids.push(await submit(PICTURE_MODEL, pictureBody(p, look)));
      }
    } catch (e) {
      // a half-started video is no use: cancel what is still queued (refunded) before saying so
      await Promise.all(ids.map((id) => fetch(`${HF_BASE}/requests/${id}/cancel`, { method: "POST", headers: auth }).catch(() => null)));
      await videoBack();
      return failed(e);
    }
    const credits = r.mode === "avatar" ? avatarCredits(r.slices.map((s) => s.seconds)) : explainerCredits(r.pictures.length);
    console.log("ai-video", r.mode, ids.length, "jobs,", credits, "credits", ...(version ? [`version of ${version.plan}`] : []));
    return json({
      tokens: await Promise.all(ids.map((id) => jobToken(signing, uid, id))),
      refund: version ? await jobToken(signing, versionTicket(ids), ids[0]) : await refundTicket(signing, uid, "ai-video", day, ids),
      credits,
      usage: { used: mine.used, limit: mine.limit },
    });
  } catch (e) {
    console.error("ai-video failed", e);
    return json({ error: RETRY }, 500);
  }
});
