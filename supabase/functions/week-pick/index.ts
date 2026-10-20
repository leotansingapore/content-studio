// The one move for the week on Analytics' This week card (gap g44): the app
// builds the week's report and its moves with notify/logic.ts (the same code
// as the Monday email) and sends the facts and moves here; Jev picks one. One
// Jev call, no AI writing, counted against the "week-pick" daily cap. Null when
// Jev has no answer: the card then shows no move rather than a guess.
//
// { mode: "brief", findings: { id, kind, line }[] (2 to 10), brand: { sells, serves } }
// is Home's What moved card (find-alerts-digest): Jev keeps the findings worth
// the week, { ids } in order, or { ids: null } without an answer. That mode
// alone is gated by NORTH_STAR_USERS and counted against "brief-pick".
//
// Secrets: TYPESAFE_API_KEY (optional: without it there is no pick),
// NORTH_STAR_USERS (who may use the brief mode).
// Deploy WITH JWT verification:
//   supabase functions deploy week-pick --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { askJev } from "../_shared/jev.ts";
import { briefAsk, briefBody, moveAsk, moveBody, pickedFindings, pickedMove } from "../notify/logic.ts";
import { isAllowed } from "../market/logic.ts";

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
    if (!uid) return json({ error: "Sign in to see this week's move." }, 401);

    const raw = await req.json().catch(() => null);
    if (raw?.mode === "brief") {
      if (!isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)) return json({ code: "not_enabled", error: "This isn't switched on for your account yet." }, 403);
      const brief = briefBody(raw);
      if (!brief) return json({ code: "bad_request", error: "Nothing to pick from." }, 400);
      const usage = await consumeUsage(admin, uid, "brief-pick");
      if (!usage.allowed) {
        const r = usageRefusal(usage);
        return json(r.body, r.status);
      }
      const ask = briefAsk(brief.items, brief.brand);
      const answers = await askJev(ask.state, ask.questions, { who: "week-pick brief" });
      return json({ ids: answers ? pickedFindings(answers, brief.items).map((f) => f.id) : null });
    }
    const body = moveBody(raw);
    if (!body) return json({ error: "Nothing to pick from." }, 400);
    const usage = await consumeUsage(admin, uid, "week-pick");
    if (!usage.allowed) {
      const r = usageRefusal(usage);
      return json(r.body, r.status);
    }
    const ask = moveAsk(body.facts, body.moves)!;
    const answers = await askJev(ask.state, ask.questions, { who: "week-pick" });
    return json({ pick: pickedMove(answers, body.moves)?.id ?? null });
  } catch (e) {
    console.error("week-pick failed", e instanceof Error ? e.message : String(e));
    return json({ error: "Couldn't pick this week's move right now." }, 500);
  }
});
