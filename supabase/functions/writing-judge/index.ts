// The judgment calls in Write, made by Jev (pinned jev-1.13.0): one Jev request
// per call, its thresholds in logic.ts. POST {mode, text, ...}:
//   mode "human" {text, samples?} -> {aiSounding, specific, voiceMatch, shapes}
//     the judged half of the "sounds human" check (the measured half is
//     counted in the browser). About 3,000 Jev input tokens (USD 0.00013).
//   mode "hooks" {hooks, audience, topic, platform} -> {pick: {index, p} | null}
//     the hook Jev recommends for this audience. About 560 tokens.
//   mode "idea" {topic, notes, kind} -> {thin: boolean | null}
//     whether a brief lacks a specific true thing, so Write asks one
//     question before writing. About 450 tokens.
//   mode "profile" {platform, name, bio, pinned, top, link} -> ProfileScore
//     the consultant's own Instagram or TikTok profile out of 100 (Jev score
//     questions, about 800 tokens) with the name and bio rewritten by OpenAI
//     (the audit's key) where they lost points, about 0.3 US cents. Counts
//     against "profile-score", not "writing-judge".
//   mode "carousel" {idea} -> {textPostBetter: boolean | null}
//     whether a carousel idea has no sequence and would read better as a
//     text post. About 420 tokens.
// Counts against the "writing-judge" daily cap. A draft mostly not in English
// gets {code: "not_english"} and no judgment. Without Jev (no key, timeout,
// outage) it says the check is unavailable and the page keeps what it measured.
//
// Secrets: TYPESAFE_API_KEY. Deploy WITH JWT verification:
//   supabase functions deploy writing-judge --project-ref hgdbflprrficdoyxmdxe --use-api
// Logic: ./logic.ts (tested). Jev: ../_shared/jev.ts. Caps: ../_shared/usageCaps.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { askJev } from "../_shared/jev.ts";
import { openAiJson } from "../_shared/auditRunner.ts";
import {
  CAROUSEL_QUESTIONS,
  IDEA_QUESTIONS,
  buildProfileRewritePrompt,
  composeProfile,
  profileQuestions,
  profileState,
  readProfileRewrites,
  readTextPostBetter,
  hookQuestions,
  hookState,
  humanQuestions,
  humanState,
  ideaState,
  mostlyEnglish,
  parseJudgeRequest,
  readHookPick,
  readHuman,
  readIdeaThin,
} from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const UNAVAILABLE = "The check is unavailable for a moment. Try again shortly.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const parsed = parseJudgeRequest(await req.json().catch(() => ({})));
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const r = parsed.request;
    const english =
      r.mode === "hooks" ? r.hooks.join("\n")
      : r.mode === "idea" ? `${r.topic}\n${r.notes}`
      : r.mode === "profile" ? [r.name, r.bio, ...r.pinned].join("\n")
      : r.mode === "carousel" ? r.idea
      : r.text;
    // an empty profile has nothing to read and scores 0 on its own
    const empty = r.mode === "profile" && !/\p{L}/u.test(english);
    if (!empty && !mostlyEnglish(english)) return json({ code: "not_english", error: "This check reads English posts only." }, 422);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to check a post." }, 401);

    if (!Deno.env.get("TYPESAFE_API_KEY")) {
      console.error("TYPESAFE_API_KEY is not set");
      return json({ error: UNAVAILABLE }, 503);
    }
    const usage = await consumeUsage(admin, uid, r.mode === "profile" ? "profile-score" : "writing-judge");
    if (!usage.allowed) {
      const refusal = usageRefusal(usage);
      return json(refusal.body, refusal.status);
    }

    if (r.mode === "profile") {
      const answers = await askJev(profileState(r), profileQuestions(r), { who: "writing-judge profile" });
      const scored = composeProfile(answers, r);
      if (!scored) return json({ error: UNAVAILABLE }, 503);
      const want = scored.items.flatMap((i) => ((i.id === "name" || i.id === "bio") && i.state !== "full" ? [i.id] : []));
      const key = Deno.env.get("OPENAI_API_KEY");
      let rewrites = {};
      if (want.length && key) {
        const { system, user } = buildProfileRewritePrompt(r, want);
        rewrites = readProfileRewrites(await openAiJson(system, user, key, { temperature: 0.5, maxTokens: 300 }), r, want);
      }
      return json({ ...scored, rewrites });
    }
    if (r.mode === "carousel") {
      const answers = await askJev({ idea: r.idea }, CAROUSEL_QUESTIONS, { who: "writing-judge carousel" });
      if (!answers) return json({ error: UNAVAILABLE }, 503);
      return json({ textPostBetter: readTextPostBetter(answers) });
    }
    if (r.mode === "idea") {
      const answers = await askJev(ideaState(r), IDEA_QUESTIONS, { who: "writing-judge idea" });
      if (!answers) return json({ error: UNAVAILABLE }, 503);
      return json({ thin: readIdeaThin(answers) });
    }
    if (r.mode === "hooks") {
      const answers = await askJev(hookState(r), hookQuestions(r.hooks), { who: "writing-judge hooks" });
      if (!answers) return json({ error: UNAVAILABLE }, 503);
      return json({ pick: readHookPick(answers, r.hooks.length) });
    }

    const { sentences, state } = humanState(r.text, r.samples);
    const answers = await askJev(state, humanQuestions(sentences, r.samples.length > 0), { who: "writing-judge human" });
    const result = readHuman(answers, sentences);
    if (!result) return json({ error: UNAVAILABLE }, 503);
    return json(result);
  } catch (e) {
    console.error("writing-judge failed", e);
    return json({ error: UNAVAILABLE }, 500);
  }
});
