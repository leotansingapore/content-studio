// Daily per-user caps for paid AI and scraping calls (cs_ai_usage, migration
// 009). Call consumeUsage before the paid call; it counts the use and says
// whether it's allowed. No Deno or npm imports, so vitest can test it.

export const DAILY_LIMITS = {
  "reel-clone": 20,
  // Another concept of a cloned reel, written from the cached post (clone-reel).
  "reel-concepts": 20,
  // A shot list for a short-video draft in Write (storyboard).
  storyboard: 30,
  // The frames read after each Instagram clone (reel-visuals), and a reel's captions read for "Copy a reel's style".
  "reel-visuals": 20,
  // "Copy a reel's style" in the video editor: the post read through Apify (clone-reel style), no OpenAI.
  "reel-style": 20,
  // A reel's video relayed by clone-reel when Instagram refuses the browser's own download.
  "reel-video": 20,
  "idea-dump": 30,
  // One long piece into 5 posts (idea-dump mode "long"), about 4 US cents a run.
  "repurpose-long": 20,
  carousel: 30,
  // Video editor (/edit): one transcription per uploaded video, and chat edits.
  "video-transcribe": 30,
  "vibe-edit": 100,
  "video-clips": 20,
  "video-translate": 30,
  "video-cutaways": 20,
  // Titles and a cover idea for a finished video (video-assist publish).
  "video-publish": 30,
  // Key lines for zooms, the music drop and pop-ups (video-assist motion, Jev): one use per pick.
  "motion-picks": 20,
  // Watching (feed-ideas, mentions, youtube-captions, track-accounts): fetches and paid lookups.
  feeds: 60,
  mentions: 10,
  "yt-captions": 10,
  "track-accounts": 10,
  // Your market (market): one check a week per brand profile (its own "market-check:<profile>" row) and at most 3 a week
  // per account (this row, read over 7 days by the function), up to 5 ChatGPT answers at about USD 0.004 each plus the
  // news; across everyone 20 a day on GLOBAL_COUNTER_USER.
  "market-check": 3,
  "market-check-global": 20,
  // Set-up suggestions on Your market (market suggest): the LLM writes candidates, Jev keeps the ones that fit.
  "market-suggest": 5,
  // Engage this week: one Jev call over the people who commented on your posts.
  "engage-picks": 20,
  // The one move for the week (g44): Jev picks it for the Monday email (notify) and Analytics' This week card (week-pick).
  "week-pick": 10,
  // The in-app assistant's actions (g51): one Jev call per message typed; over the cap it answers in words.
  "assistant-act": 30,
  // Free stock photos and B-roll (stock-media, Pexels): searches not already cached.
  "stock-search": 100,
  // "Add B-roll for me" in the video editor (video-assist broll): Jev picks the lines, OpenAI writes the searches.
  "broll-picks": 20,
  // A montage from a theme (video-assist montage): the LLM writes the beats, Jev picks the grade; then
  // "montage-pick": Jev picks the stock clip for each beat. No paid generation; stock searches have their own cap.
  "montage-beats": 10,
  "montage-pick": 20,
  // "Open with my strongest line" in the video editor (video-assist coldopen): Jev rates the lines, no LLM.
  "cold-open": 20,
  // The post caption written for TikTok, LinkedIn and Facebook at once (video-assist captions, gpt-4.1, about 1 US cent).
  "video-captions": 30,
  // "Watch it like a viewer" after an export (video-assist watch): Gemini watches the file twice, about US$0.07 for a 40 s reel.
  "video-watch": 30,
  // "Make the image" on Write (ai-image, Higgsfield Soul v2, about USD 0.006 each).
  "ai-image": 5,
  // "Fix it" under that picture (ai-image mode "fix", Qwen Image 3 edit at 2k): per adviser, and across
  // everyone on GLOBAL_COUNTER_USER so the prepaid Higgsfield pool can't be drained.
  "ai-image-fix": 5,
  "ai-image-fix-global": 40,
  // An AI B-roll clip when stock has nothing (ai-image mode "broll": Soul v2 picture + DoP lite, about USD 0.13
  // each): per adviser, and across everyone on GLOBAL_COUNTER_USER so the prepaid pool can't be drained.
  "ai-broll": 3,
  "ai-broll-global": 20,
  // "Voiceover from text" in the video editor (text-voice, ElevenLabs turbo v2.5).
  "ai-voice": 10,
  // "Music for me" in the video editor (text-voice mode "music", Eleven Music at about USD 0.15 a minute,
  // so up to USD 0.30 for the longest 2-minute track): per adviser, and across everyone on
  // GLOBAL_COUNTER_USER, since the ElevenLabs credits also pay for every voiceover and dub.
  "ai-music": 5,
  "ai-music-global": 20,
  // The mood Jev reads from what is said before a track is made (text-voice mode "mood"); calm once used up.
  "music-mood": 30,
  // Predicted engagement score in Write (post-score, Jev); the browser caches it per draft text.
  "post-score": 40,
  // Jev's judgment calls in Write (writing-judge): the sounds-human check and the rest.
  "writing-judge": 60,
  // Profile score out of 100 with name and bio rewrites (writing-judge mode "profile", Jev + OpenAI).
  "profile-score": 10,
  // Stated facts flagged to check before posting (writing-judge mode "facts", Jev).
  "fact-check": 60,
  // Engage (engage-assist): Jev sorts, OpenAI drafts; about 2 US cents a run at most.
  "engage-replies": 30,
  "engage-dms": 30,
  "engage-comments": 30,
  "engage-connect": 30,
  // Videos made without filming (ai-video, Higgsfield): per adviser, and across everyone on the owner's
  // account so the prepaid pool can't be drained (an avatar video is up to 88 credits, about USD 5.50).
  "ai-video": 2,
  "ai-video-global": 20,
  // The explainer's script and scene pictures, written by OpenAI (ai-video mode "script").
  "ai-video-script": 10,
  // A template clip (ai-video mode "template", Seedance 2.5): US$0.82 for 4 s at 480p up to US$3.70 for 8 s at
  // 720p, so per adviser, and across everyone on GLOBAL_COUNTER_USER at 8 a day (under US$30, like the AI videos).
  "ai-clip": 2,
  "ai-clip-global": 8,
  // Social accounts through Zernio (social): a sign-in link to connect one, and the reads and disconnects.
  "social-connect": 3,
  "social-read": 300,
  // Auto-DM (social automations): creating, editing, pausing and deleting an automation; listing and logs are reads.
  "social-automation-write": 30,
  // Post it for me (social posts.ts): scheduling a post or trying a failed one again, and each file's upload link.
  "social-schedule": 30,
  "social-presign": 30,
  // A team member's note on Leo's posts board (team-board); Leo's own notes are not counted.
  "team-comment": 60,
  // Adding a brand from its website, or reading it again on /brand (brand-dna): up to 5 pages, one LLM call and two Jev calls.
  "brand-dna": 10,
  // North star phase 1, declared up front (Leo only, NORTH_STAR_USERS). One remix written in one format (remix make).
  "remix-make": 30,
  // A post broken down into its hook, beats and what not to reuse, before a remix (remix teardown, OpenAI + Jev).
  "remix-teardown": 40,
  // Whether a post fits the adviser's brand before a remix (remix fit): one Jev call, refunded when Jev has no answer.
  "remix-fit": 100,
  // A pasted link read for Remix (remix-link): Apify or YouTube captions; a cached Instagram or TikTok read is free.
  "remix-link": 20,
  // A pasted picture or a video's frames read for Remix (remix-link image and frames, OpenAI vision).
  "remix-image": 10,
  // North star phase 2, declared up front (Leo only, NORTH_STAR_USERS). A competitor added by site or name (competitors read).
  "competitor-read": 20,
  // Competitors suggested for the brand (competitors suggest): two OpenAI calls plus up to 88 Jev questions.
  "competitor-suggest": 5,
  // One competitor's Meta ads (competitors ads, apify~facebook-ads-scraper): up to 30 ads at US$5.80 per 1,000.
  "competitor-ads": 15,
  // Those ad checks across everyone on GLOBAL_COUNTER_USER, so one account can't spend the Apify plan's monthly limit.
  "competitor-ads-global": 60,
  // One competitor's Instagram or TikTok posts (competitors posts, Apify): 30 posts a read.
  "competitor-posts": 30,
  // Those post reads across everyone on GLOBAL_COUNTER_USER.
  "competitor-posts-global": 60,
  // Ads in your space (competitors space): 3 Meta Ad Library searches of 30 ads each.
  "space-ads": 2,
  // Those space runs across everyone on GLOBAL_COUNTER_USER.
  "space-ads-global": 10,
  // Hook, feeling and audience labels on up to 60 ads (competitors label): Jev only.
  "ad-labels": 10,
  // How well up to 80 feed items match the brand (competitors match): Jev only.
  "niche-match": 5,
  // A viral search (viral-search): 20 TikTok results through Apify and one DataForSEO YouTube block, then Jev.
  "viral-search": 10,
  // Those searches across everyone on GLOBAL_COUNTER_USER.
  "viral-search-global": 40,
  // A saved post broken down with its tags (remix teardown with tags): OpenAI plus Jev, charged in place of remix-teardown.
  "post-tags": 60,
  // What moved, picked for Monday's email (week-pick brief): Jev only, counted like week-pick.
  "brief-pick": 10,
  // Which hand-picked creators fit the brand (remix creator-fit): Jev 6 creators at a time, 70 at most.
  "creator-fit": 5,
  // What people search for (market searches): 5 DataForSEO Labs tasks plus 10 YouTube pages, one a week per brand.
  "search-topics": 2,
  // Those search checks across everyone on GLOBAL_COUNTER_USER.
  "search-topics-global": 10,
  // What worked for a followed account (remix-patterns): Jev on 12 posts plus one OpenAI call for the ideas.
  "remix-patterns": 10,
  // North star phase 3, declared up front (Leo only, NORTH_STAR_USERS). Words for your own video or pictures (video-assist own-words): one short LLM call plus one Jev hook pick.
  "own-words": 20,
  // A pasted article read for a narrated video (ai-video read): one capped page fetch and one Jev question.
  "page-read": 10,
  // A post split into a Threads or X thread (video-assist thread): one LLM call.
  "thread-copy": 30,
  // One carousel slide rewritten from a typed ask (carousel-copy ask): about 700 tokens in and 100 out on gpt-4.1.
  "edit-ask": 60,
  // The key word and emoji for each caption line (video-assist keywords): Jev only.
  "caption-keywords": 30,
  // North star phase 4, declared up front (Leo only, NORTH_STAR_USERS). The consent check before a face is saved (ai-video consent): Whisper hears up to 15 s.
  "likeness-check": 5,
  // Three presenter options (ai-video presenters): one Soul v2 picture each, so a make spends 3.
  "ai-presenter": 12,
  // Those presenter makes across everyone on GLOBAL_COUNTER_USER, 1 a make, so the prepaid Higgsfield pool can't be drained.
  "ai-presenter-global": 10,
  // Products and services read from the brand's site (brand-dna products): one LLM call plus Jev's offer and named-product checks.
  "brand-products": 10,
  // A picture fetched from the brand's site (brand-dna image): a capped public fetch, no provider.
  "brand-image": 100,
  // A photo or video sorted, or a demo read, in Media (media-sort sort and demo): gpt-4.1 low-detail vision plus one Jev pick.
  "media-sort": 200,
  // A post translated with its English meaning (video-assist translate kind post): one gpt-4.1 call.
  "post-translate": 30,
  // North star phase 5, declared up front (Leo only, NORTH_STAR_USERS). Audiences suggested for the brand (brand-dna audiences): one LLM call plus Jev.
  "audience-suggest": 5,
  // Angles suggested for a campaign (idea-dump angles): one LLM call writes 8, Jev keeps up to 5.
  "campaign-angles": 10,
  // Up to 7 campaign or autopilot posts written in one call (idea-dump campaign), plus Jev's MAS question per post.
  "campaign-draft": 20,
  // One campaign post written again (idea-dump campaign with swap).
  "campaign-swap": 40,
  // A set of ideas for the inbox (idea-dump ideas): one LLM call plus Jev.
  "ideas-daily": 15,
} as const;

export type UsageFeature = keyof typeof DAILY_LIMITS;

/** cs_ai_usage.user_id must be a real account, so the across-everyone counters live on the owner's. */
export const GLOBAL_COUNTER_USER = "13b28b1d-2ecb-40be-b3a9-aefc90366f9b";

export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

export type UsageResult =
  | { allowed: true; used: number; limit: number }
  | { allowed: false; limit: number; reason: "limit" | "unavailable" };

export async function consumeUsage(
  admin: RpcClient,
  userId: string,
  feature: UsageFeature,
): Promise<UsageResult> {
  const limit = DAILY_LIMITS[feature];
  try {
    const { data, error } = await admin.rpc("cs_consume_ai_usage", {
      p_user: userId,
      p_feature: feature,
      p_limit: limit,
    });
    // Fail closed: these calls cost money, so an unreadable counter blocks them.
    if (error) return { allowed: false, limit, reason: "unavailable" };
    if (typeof data !== "number") return { allowed: false, limit, reason: "limit" };
    return { allowed: true, used: data, limit };
  } catch {
    return { allowed: false, limit, reason: "unavailable" };
  }
}

/** What giving a use back needs from the service-role client besides rpc: one row read and one conditional update. */
export interface UsageClient extends RpcClient {
  from(table: string): {
    select(columns: string): { match(query: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
    update(values: Record<string, unknown>): {
      match(query: Record<string, unknown>): { select(columns: string): PromiseLike<{ data: unknown; error: unknown }> };
    };
  };
}

/**
 * Gives back one use of `feature` counted on `day` (a paid job that failed), never below 0. No SQL function of its own:
 * the row is updated only while it still holds the count just read, and read again when another call moved it.
 */
export async function refundUsage(admin: UsageClient, userId: string, feature: UsageFeature, day: string): Promise<boolean> {
  const row = { user_id: userId, feature, day };
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data } = await admin.from("cs_ai_usage").select("count").match(row);
      const count = (data as { count?: unknown }[] | null)?.[0]?.count;
      if (typeof count !== "number" || count <= 0) return false;
      const { data: moved, error } = await admin.from("cs_ai_usage").update({ count: count - 1 }).match({ ...row, count }).select("count");
      if (!error && Array.isArray(moved) && moved.length === 1) return true;
    }
  } catch {
    // a refund that can't be written leaves the use spent, the safe side for a paid feature
  }
  return false;
}

/** True only the first time `key` is claimed for this user today (a row on the same counter, limit 1). */
export async function claimOnce(admin: RpcClient, userId: string, key: string): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc("cs_consume_ai_usage", { p_user: userId, p_feature: key, p_limit: 1 });
    return !error && data === 1;
  } catch {
    return false;
  }
}

/** The JSON body and status to send back when consumeUsage refuses. */
export function usageRefusal(result: Extract<UsageResult, { allowed: false }>): {
  status: number;
  body: { error: string; code: string };
} {
  return result.reason === "limit"
    ? {
        status: 429,
        body: {
          code: "daily_limit",
          error: `You've used all ${result.limit} for today. It resets at 8am Singapore time.`,
        },
      }
    : {
        status: 503,
        body: { code: "usage_unavailable", error: "This is unavailable for a moment. Try again shortly." },
      };
}
