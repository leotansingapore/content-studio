// Best for your brand on /carousels (the carousel library, supabase/hub/029). Everyone signed in: the page sends
// who the brand serves, what it sells and its topics; Jev keeps the topics worth borrowing from and scores the
// biggest outliers in them (./logic.ts). No AI writing, counted against the "carousel-fit" daily cap.
// Answers { fit: { <carousel id>: 0..1 }, topics } or { fit: null } when there is no answer (no key, an outage),
// and the page then sorts by the biggest multiple.
//
// Secrets: TYPESAFE_API_KEY (optional: without it there is no ranking).
// Deploy WITH JWT verification:
//   supabase functions deploy carousel-fit --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { consumeUsage, refundUsage } from "../_shared/usageCaps.ts";
import { askJev } from "../_shared/jev.ts";
import { handleFit, type Candidate } from "./logic.ts";

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
    if (!uid) return json({ error: "Sign in to rank the library for your brand." }, 401);

    const reply = await handleFit(await req.json().catch(() => null), {
      hasJev: Boolean(Deno.env.get("TYPESAFE_API_KEY")),
      consume: () => consumeUsage(admin, uid, "carousel-fit"),
      refund: (day) => refundUsage(admin, uid, "carousel-fit", day),
      ask: (state, q) => askJev(state, q, { who: "carousel-fit" }),
      candidates: async (topics, limit) => {
        const { data, error } = await admin
          .from("cs_carousels")
          .select("id, title, topic, format, caption, slide_text")
          .in("topic", topics)
          .eq("hidden", false)
          .order("multiple", { ascending: false })
          .limit(limit);
        if (error) throw new Error(error.message);
        return (data ?? []) as Candidate[];
      },
    });
    return json(reply.body, reply.status);
  } catch (e) {
    console.error("carousel-fit failed", e instanceof Error ? e.message : String(e));
    return json({ error: "Couldn't rank the library right now." }, 500);
  }
});
