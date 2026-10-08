// YouTube link to clips (Edit a video > From a YouTube link): reads a video's
// captions through DataForSEO's YouTube subtitles API and returns them as
// sentences for video-assist's clip finder. The video itself is never fetched.
// One link counts once against the "yt-captions" daily cap and is one paid
// DataForSEO request (about USD 0.006).
//
// Secrets: DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD. Deploy WITH JWT verification:
//   supabase functions deploy youtube-captions --project-ref hgdbflprrficdoyxmdxe --use-api

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { captionSentences, youtubeId } from "./logic.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const videoId = youtubeId((await req.json().catch(() => ({})))?.url);
    if (!videoId) return json({ error: "That isn't a YouTube video link." }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to find clips." }, 401);

    const login = Deno.env.get("DATAFORSEO_LOGIN");
    const password = Deno.env.get("DATAFORSEO_PASSWORD");
    if (!login || !password) {
      console.error("DATAFORSEO credentials are not set");
      return json({ error: "YouTube links aren't switched on yet." }, 503);
    }
    const usage = await consumeUsage(admin, uid, "yt-captions");
    if (!usage.allowed) {
      const r = usageRefusal(usage);
      return json(r.body, r.status);
    }

    const res = await fetch("https://api.dataforseo.com/v3/serp/youtube/video_subtitles/live/advanced", {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${login}:${password}`)}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ video_id: videoId, location_code: 2702, language_code: "en" }]),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`subtitles answered ${res.status}`);
    const { title, duration, sentences } = captionSentences(await res.json());
    if (sentences.length < 5) return json({ error: "This video has no captions YouTube shares, so there's nothing to cut from. Upload the file instead." }, 422);
    return json({ videoId, title, duration, sentences });
  } catch (e) {
    console.error("youtube-captions failed", e instanceof Error ? e.message : String(e));
    return json({ error: "Couldn't read that video's captions right now. Try again in a minute." }, 500);
  }
});
