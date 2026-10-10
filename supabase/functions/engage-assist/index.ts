// Drafts for the Engage page (/recruit/engage). The consultant pastes text in
// and copies drafts out; this function never posts, comments or messages
// (docs/social-api-app-review.md). Jev (pinned jev-1.13.0) sorts, OpenAI (the
// audit's key) writes. POST {mode, ...}:
//   mode "replies" {post?, comments:[{name?, text}]} -> {items:[{i, name, text,
//     kind, reply, dm?}]}: the comments under their own post, sorted into
//     potential client, adds something, peer, support or noise, clients first,
//     a reply for each but noise and a first DM for each client. About 320 Jev
//     input tokens a comment and one OpenAI call (about 2 US cents for 30
//     comments). Cap "engage-replies".
//   mode "dms" {messages:[{name?, text}], goal?} -> {items:[{i, name, text, kind,
//     automated, reply}]}: direct messages sorted into lead, recruiter, peer,
//     favour or spam, with automated sequences flagged; spam and automated
//     ones get no draft. A lead's draft steers to goal (call, guide or
//     rapport; call by default). About 520 Jev input tokens a message and one
//     OpenAI call. Cap "engage-dms".
//   mode "thread" {lines:[{name?, text, me}], goal?} -> {items:[{i, name, text,
//     reply}]}: one conversation, each line marked by the consultant as theirs
//     (me) or the other person's; one draft answering the latest message in the
//     context of the last 10, steered to goal. No Jev; one OpenAI call, under
//     1 US cent. Shares cap "engage-dms".
//   mode "comments" {posts:[{name?, text}]} -> {items:[{i, name, text, sorted,
//     comments:[{type, text}]}]}: comments for other people's posts, two of
//     different kinds for one post, one each for 2-10. Jev picks the kinds
//     (number, question, disagree, result), asked in both option orders and
//     spread so no kind fills more than half a batch;
//     about 580 Jev input tokens a post and one OpenAI call (about 2 US cents
//     for 10 posts). Cap "engage-comments".
//   mode "connect" {name, about?, reason, goal} -> {drafts:{note, first,
//     follow4, follow10}}: a LinkedIn connection note, the first message
//     after they accept and two follow-ups. No Jev (nothing is decided); one
//     OpenAI call, under 1 US cent. Cap "engage-connect".
// Text mostly in another script is "unsorted" and still drafted; without Jev
// (no key, timeout, outage) everything is unsorted, in paste order.
//
// Secrets: OPENAI_API_KEY, TYPESAFE_API_KEY. Deploy WITH JWT verification:
//   supabase functions deploy engage-assist --project-ref hgdbflprrficdoyxmdxe --use-api
// Logic: ./logic.ts (tested). Jev: ../_shared/jev.ts. Caps: ../_shared/usageCaps.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { askJev } from "../_shared/jev.ts";
import { openAiJson } from "../_shared/auditRunner.ts";
import {
  buildCommentsPrompt,
  buildConnectPrompt,
  buildDmsPrompt,
  buildRepliesPrompt,
  buildThreadPrompt,
  commentQuestions,
  commentState,
  dmQuestions,
  parseEngageRequest,
  readCommentKinds,
  readCommentTypes,
  readComments,
  readConnect,
  typeQuestions,
  readDmKinds,
  readDmReplies,
  readReplies,
  readThread,
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
    const parsed = parseEngageRequest(await req.json().catch(() => ({})));
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const r = parsed.request;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to draft replies." }, 401);
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return json({ error: "Drafting isn't switched on yet." }, 503);

    const feature = r.mode === "dms" || r.mode === "thread" ? "engage-dms" : r.mode === "comments" ? "engage-comments" : r.mode === "connect" ? "engage-connect" : "engage-replies";
    const usage = await consumeUsage(admin, uid, feature);
    if (!usage.allowed) {
      const refusal = usageRefusal(usage);
      return json(refusal.body, refusal.status);
    }
    const used = { used: usage.used, limit: usage.limit };

    if (r.mode === "connect") {
      const { system, user } = buildConnectPrompt(r);
      const drafts = readConnect(await openAiJson(system, user, key, { temperature: 0.7, maxTokens: 700 }));
      if (!drafts) return json({ error: "Couldn't write the note right now. Try again in a minute." }, 502);
      return json({ drafts, usage: used });
    }

    if (r.mode === "thread") {
      const { system, user } = buildThreadPrompt(r.lines, r.goal);
      const content = await openAiJson(system, user, key, { temperature: 0.6, maxTokens: 600 });
      if (content === null) return json({ error: "Couldn't write the reply right now. Try again in a minute." }, 502);
      return json({ items: [readThread(content, r.lines)], usage: used });
    }

    if (r.mode === "comments") {
      const questions = typeQuestions(r.posts);
      const answers = Object.keys(questions).length ? await askJev({}, questions, { who: "engage-assist comments" }) : null;
      const picks = readCommentTypes(answers, r.posts);
      const { system, user } = buildCommentsPrompt(r.posts, picks);
      const content = await openAiJson(system, user, key, { temperature: 0.7, maxTokens: 3000 });
      if (content === null) return json({ error: "Couldn't write the comments right now. Try again in a minute." }, 502);
      return json({ items: readComments(content, r.posts, picks), usage: used });
    }

    if (r.mode === "dms") {
      const questions = dmQuestions(r.messages);
      const answers = Object.keys(questions).length ? await askJev({}, questions, { who: "engage-assist dms" }) : null;
      const sorted = readDmKinds(answers, r.messages);
      let content: string | null = null;
      if (sorted.some((x) => x.kind !== "spam" && !x.automated)) {
        const { system, user } = buildDmsPrompt(r.messages, sorted, r.goal);
        content = await openAiJson(system, user, key, { temperature: 0.6, maxTokens: 3000 });
        if (content === null) return json({ error: "Couldn't write the replies right now. Try again in a minute." }, 502);
      }
      return json({ items: readDmReplies(content, r.messages, sorted), usage: used });
    }

    const questions = commentQuestions(r.comments);
    const answers = Object.keys(questions).length ? await askJev(commentState(r.post), questions, { who: "engage-assist replies" }) : null;
    const kinds = readCommentKinds(answers, r.comments);
    let content: string | null = null;
    if (kinds.some((k) => k !== "noise")) {
      const { system, user } = buildRepliesPrompt(r.post, r.comments, kinds);
      content = await openAiJson(system, user, key, { temperature: 0.6, maxTokens: 3000 });
      if (content === null) return json({ error: "Couldn't write the replies right now. Try again in a minute." }, 502);
    }
    return json({ items: readReplies(content, r.comments, kinds), usage: used });
  } catch (e) {
    console.error("engage-assist failed", e);
    return json({ error: "Something went wrong. Try again." }, 500);
  }
});
