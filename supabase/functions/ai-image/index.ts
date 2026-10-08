// "Make the image" on Write: one picture from the post's image prompt, with
// Higgsfield Soul v2 (about USD 0.006 each at 1080p, by Higgsfield's estimate).
//   POST {mode:"start", prompt} -> {token}: counts against the "ai-image" daily cap
//   POST {mode:"status", token} -> {state:"working"} | {state:"done", url} | {state:"failed", error}
// The token is the Higgsfield request id signed for the adviser who started it
// (logic.ts jobToken), so nobody else can read the job.
// The browser polls status, then downloads the picture straight from Higgsfield's
// CDN (it allows any site) into the media library.
//
// Secrets: HF_API_KEY, HF_API_SECRET. Deploy WITH JWT verification:
//   supabase functions deploy ai-image --project-ref hgdbflprrficdoyxmdxe --use-api
// Logic: ./logic.ts (tested). Caps: ../_shared/usageCaps.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { HF_BASE, HF_MODEL, buildImageBody, jobToken, openJobToken, parseImageRequest, readStatus, tokenSecret } from "./logic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const RETRY = "Couldn't make the image right now. Try again in a minute.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const parsed = parseImageRequest(await req.json().catch(() => ({})));
    if (!parsed.ok) return json({ error: parsed.error }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to make images." }, 401);

    const key = Deno.env.get("HF_API_KEY");
    const secret = Deno.env.get("HF_API_SECRET");
    if (!key || !secret) {
      console.error("HF_API_KEY / HF_API_SECRET are not set");
      return json({ error: "Making images isn't switched on yet." }, 503);
    }
    const auth = { Authorization: `Key ${key}:${secret}` };
    const signing = await tokenSecret(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (parsed.request.mode === "status") {
      const id = await openJobToken(signing, uid, parsed.request.token);
      if (!id) return json({ error: "That image job isn't known." }, 404);
      let res: Response;
      try {
        res = await fetch(`${HF_BASE}/requests/${id}/status`, { headers: auth, signal: AbortSignal.timeout(15_000) });
      } catch {
        return json({ state: "working" }); // a blip: the browser asks again
      }
      if (res.status === 404) return json({ state: "failed", error: "That image job isn't known." });
      if (!res.ok) return json({ state: "working" });
      return json(readStatus(await res.json().catch(() => null)));
    }

    const usage = await consumeUsage(admin, uid, "ai-image");
    if (!usage.allowed) {
      const r = usageRefusal(usage);
      return json(r.body, r.status);
    }
    let res: Response;
    try {
      res = await fetch(`${HF_BASE}/${HF_MODEL}`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(buildImageBody(parsed.request.prompt)),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (e) {
      console.error("ai-image submit failed", e);
      return json({ error: RETRY }, 502);
    }
    if (!res.ok) {
      console.error("ai-image submit", res.status, (await res.text()).slice(0, 300));
      return json({ error: res.status === 403 ? "Image credits have run out. Tell your studio admin." : RETRY }, 502);
    }
    const id = (await res.json().catch(() => null))?.request_id;
    if (typeof id !== "string") return json({ error: RETRY }, 502);
    return json({ token: await jobToken(signing, uid, id), usage: { used: usage.used, limit: usage.limit } });
  } catch (e) {
    console.error("ai-image failed", e);
    return json({ error: RETRY }, 500);
  }
});
