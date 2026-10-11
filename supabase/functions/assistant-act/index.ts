// The in-app assistant's actions (gap g51): which one thing a message asks the
// app to do, which of the adviser's saved posts it means and the day and time it
// names (logic.ts). One Jev call, no AI writing, nothing written anywhere: the
// app shows a confirm card and applies the change itself on a tap. Counted
// against the "assistant-act" daily cap. Null when Jev has no answer or the
// message is mostly not in English: the assistant then answers in words.
//
// Secrets: TYPESAFE_API_KEY (optional: without it there is no action).
// Deploy WITH JWT verification:
//   supabase functions deploy assistant-act --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { askJev } from "../_shared/jev.ts";
import { mostlyEnglish } from "../post-score/logic.ts";
import { actAsk, actBody, actPick } from "./logic.ts";

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

    const body = actBody(await req.json().catch(() => null));
    if (!body) return json({ error: "Nothing to read." }, 400);
    if (!mostlyEnglish(body.message)) return json({ pick: null });
    const usage = await consumeUsage(admin, uid, "assistant-act");
    if (!usage.allowed) {
      const r = usageRefusal(usage);
      return json(r.body, r.status);
    }
    const ask = actAsk(body);
    const answers = await askJev(ask.state, ask.questions, { who: "assistant-act" });
    return json({ pick: actPick(answers, body) });
  } catch (e) {
    console.error("assistant-act failed", e instanceof Error ? e.message : String(e));
    return json({ error: "The assistant can't do that right now." }, 500);
  }
});
