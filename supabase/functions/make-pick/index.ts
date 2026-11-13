// The formats that suit an agent ask (logic.ts): one Jev call ranks the formats the app sends, and the agent shows the
// top four as a numbered pick list. No AI writing. Leo only (NORTH_STAR_USERS), like the agent; counted against the
// "make-pick" daily cap and given back when Jev never answers. { ids: null } without an answer or without a key: the
// app then shows its own default list.
//
// Secrets: TYPESAFE_API_KEY (optional: without it there is no ranking), NORTH_STAR_USERS.
// Deploy WITH JWT verification:
//   supabase functions deploy make-pick --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { consumeUsage, refundUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { askJev } from "../_shared/jev.ts";
import { isAllowed } from "../market/logic.ts";
import { pickAsk, pickBody, ranked } from "./logic.ts";

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
    if (!uid) return json({ error: "Sign in to use the agent." }, 401);
    if (!isAllowed(Deno.env.get("NORTH_STAR_USERS"), uid)) return json({ code: "not_allowed", error: "This isn't switched on for your account." }, 403);
    const body = pickBody(await req.json().catch(() => null));
    if (!body) return json({ code: "bad_request", error: "Nothing to pick from." }, 400);
    if (!Deno.env.get("TYPESAFE_API_KEY")) return json({ ids: null });
    const day = new Date().toISOString().slice(0, 10); // the counter's day (UTC), read before the count for a refund
    const usage = await consumeUsage(admin, uid, "make-pick");
    if (!usage.allowed) {
      const r = usageRefusal(usage);
      return json(r.body, r.status);
    }
    const ask = pickAsk(body);
    const answers = await askJev(ask.state, ask.questions, { who: "make-pick" });
    if (!answers) await refundUsage(admin, uid, "make-pick", day);
    return json({ ids: ranked(answers, body) });
  } catch (e) {
    console.error("make-pick failed", e instanceof Error ? e.message : String(e));
    return json({ error: "Couldn't pick formats right now." }, 500);
  }
});
