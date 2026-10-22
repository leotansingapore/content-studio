// The in-app assistant's actions (gap g51): which one thing a message asks the
// app to do, which of the adviser's saved posts it means and the day and time it
// names (logic.ts). One Jev call, no AI writing, nothing written anywhere: the
// app shows a confirm card and applies the change itself on a tap. Counted
// against the "assistant-act" daily cap. Null when Jev has no answer or the
// message is mostly not in English: the assistant then answers in words.
// For an account on NORTH_STAR_USERS it also offers "remember" (a lasting
// preference) and asks what it applies to; everyone else's questions are today's.
// Agent mode (phase 6): the same account sending `agent: true` gets the agent's
// acts and slots and Jev's probabilities back, counted on "agent-act" and given
// back when Jev never answers. Anyone else's agent fields are ignored, not refused.
//
// Secrets: TYPESAFE_API_KEY (optional for today's dock: without it there is no
// action; agent mode answers 503 not_configured without it), NORTH_STAR_USERS.
// Deploy WITH JWT verification:
//   supabase functions deploy assistant-act --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { consumeUsage, refundUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { askJev } from "../_shared/jev.ts";
import { mostlyEnglish } from "../post-score/logic.ts";
import { isAllowed } from "../market/logic.ts";
import { actAsk, actBody, actPick, agentPick, noP } from "./logic.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to use the assistant." }, 401);
    const leo = isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid);

    const raw = await req.json().catch(() => null);
    const agent = leo && (raw as { agent?: unknown } | null)?.agent === true;
    const body = actBody(raw, leo);
    if (!body) return json(agent ? { code: "bad_request", error: "Nothing to read." } : { error: "Nothing to read." }, 400);
    if (!mostlyEnglish(body.message)) return json(agent ? { pick: null, p: noP() } : { pick: null });
    if (agent && !Deno.env.get("TYPESAFE_API_KEY")) return json({ code: "not_configured", error: "The agent isn't set up yet." }, 503);
    const day = new Date().toISOString().slice(0, 10); // the counter's day (UTC), read before the count for a refund
    const cap = (agent ? "agent-act" : "assistant-act") satisfies "agent-act" | "assistant-act";
    const usage = await consumeUsage(admin, uid, cap);
    if (!usage.allowed) {
      const r = usageRefusal(usage);
      return json(r.body, r.status);
    }
    const ask = actAsk(body, leo);
    const answers = await askJev(ask.state, ask.questions, { who: agent ? "assistant-act agent" : "assistant-act" });
    if (!agent) return json({ pick: actPick(answers, body, leo) });
    // A Jev reply always parses, so null means Jev never answered: the use goes back.
    if (!answers) await refundUsage(admin, uid, cap, day);
    return json(agentPick(answers, body));
  } catch (e) {
    console.error("assistant-act failed", e instanceof Error ? e.message : String(e));
    return json({ error: "The assistant can't do that right now." }, 500);
  }
});
