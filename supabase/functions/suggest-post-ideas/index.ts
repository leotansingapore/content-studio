// "Post ideas in your style" on the account audit. A signed-in consultant sends
// {auditId}; this studies what went furthest on that account and returns up to
// 5 fresh post ideas that repeat nothing they've posted or been shown before.
// Every idea is stored in cs_social_ideas so later batches can avoid it.
//
// Secrets: OPENAI_API_KEY. Deploy WITH JWT verification.
// Logic: ../_shared/postIdeas.ts (tested).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  IDEAS_PER_BATCH,
  IDEAS_REQUESTED,
  MIN_POSTS_FOR_IDEAS,
  buildIdeasPrompt,
  seenTexts,
  validateIdeas,
  type PostIdea,
  type PreviousIdea,
} from "../_shared/postIdeas.ts";
import type { RatedPost } from "../_shared/socialAudit.ts";
import { openAiJson } from "../_shared/auditRunner.ts";

/** About 20 batches a day per consultant. */
const MAX_IDEAS_PER_DAY = 100;
/** A second model call tops up a batch that lost ideas to repeats. */
const ATTEMPTS = 2;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const auditId = String(body?.auditId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(auditId)) return json({ error: "Missing audit." }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "Sign in to get ideas." }, 401);

    const { data: audit, error: auditError } = await admin
      .from("cs_social_audits")
      .select("id, platform, profile, posts, stats")
      .eq("id", auditId)
      .eq("user_id", uid)
      .maybeSingle();
    if (auditError) throw auditError;
    if (!audit) return json({ error: "That audit wasn't found. Refresh the page." }, 404);
    const posts = (audit.posts ?? []) as RatedPost[];
    if (!audit.stats || posts.length < MIN_POSTS_FOR_IDEAS) {
      return json({ error: `Ideas need at least ${MIN_POSTS_FOR_IDEAS} public posts to learn from.` }, 400);
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ error: "Post ideas aren't switched on yet." }, 503);

    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const { count, error: countError } = await admin
      .from("cs_social_ideas")
      .select("id", { count: "exact", head: true })
      .eq("user_id", uid)
      .gte("created_at", dayAgo);
    if (countError) throw countError;
    if ((count ?? 0) >= MAX_IDEAS_PER_DAY) {
      return json({ error: "That's a lot of ideas for one day. You'll get more tomorrow." }, 429);
    }

    const { data: prev, error: prevError } = await admin
      .from("cs_social_ideas")
      .select("hook, status, batch")
      .eq("audit_id", auditId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (prevError) throw prevError;
    const previous: PreviousIdea[] = (prev ?? []).map((p) => ({ hook: p.hook, status: p.status }));
    const nextBatch = (prev ?? []).reduce((m, p) => Math.max(m, p.batch), 0) + 1;
    const seen = seenTexts(posts, previous);

    const accepted: PostIdea[] = [];
    let formula = "";
    for (let attempt = 0; attempt < ATTEMPTS && accepted.length < IDEAS_PER_BATCH; attempt++) {
      const { system, user } = buildIdeasPrompt({
        platform: audit.platform,
        profile: audit.profile,
        stats: audit.stats,
        posts,
        previous: [...accepted.map((i) => ({ hook: i.hook, status: "new" as const })), ...previous],
        count: IDEAS_REQUESTED,
      });
      const content = await openAiJson(system, user, apiKey, { temperature: 0.9, maxTokens: 2200 });
      if (!content) continue;
      const result = validateIdeas(content, {
        knownPostIds: posts.map((p) => p.id),
        seen: [...seen, ...accepted.map((i) => i.hook)],
        max: IDEAS_PER_BATCH - accepted.length,
      });
      if (!result) continue;
      formula ||= result.formula;
      accepted.push(...result.ideas);
    }
    if (accepted.length === 0) {
      return json({ error: "Couldn't come up with new ideas right now. Try again in a minute." }, 502);
    }

    const { error: insertError } = await admin.from("cs_social_ideas").insert(
      accepted.map((idea, position) => ({
        audit_id: auditId,
        user_id: uid,
        batch: nextBatch,
        position,
        hook: idea.hook,
        idea: idea.idea,
        format: idea.format,
        based_on_post_id: idea.basedOn,
        why: idea.why || null,
        formula: formula || null,
      })),
    );
    if (insertError) throw insertError;

    // Read back rather than trusting the insert's representation (see claimAudit).
    const { data: saved, error: readError } = await admin
      .from("cs_social_ideas")
      .select("*")
      .eq("audit_id", auditId)
      .eq("batch", nextBatch)
      .order("position", { ascending: true });
    if (readError) throw readError;
    return json({ ideas: saved ?? [] });
  } catch (e) {
    console.error("suggest-post-ideas failed", e);
    return json({ error: "Couldn't get ideas. Try again in a minute." }, 500);
  }
});
