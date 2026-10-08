// Daily per-user caps for paid AI and scraping calls (cs_ai_usage, migration
// 009). Call consumeUsage before the paid call; it counts the use and says
// whether it's allowed. No Deno or npm imports, so vitest can test it.

export const DAILY_LIMITS = {
  "reel-clone": 20,
  // Another concept of a cloned reel, written from the cached post (clone-reel).
  "reel-concepts": 20,
  // A shot list for a short-video draft in Write (storyboard).
  storyboard: 30,
  // The frames read after each Instagram clone (reel-visuals).
  "reel-visuals": 20,
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
  // Watching (feed-ideas, mentions, youtube-captions, track-accounts): fetches and paid lookups.
  feeds: 60,
  mentions: 10,
  "yt-captions": 10,
  "track-accounts": 10,
  // Engage this week: one Jev call over the people who commented on your posts.
  "engage-picks": 20,
  // Free stock photos and B-roll (stock-media, Pexels): searches not already cached.
  "stock-search": 100,
  // "Make the image" on Write (ai-image, Higgsfield Soul v2, about USD 0.006 each).
  "ai-image": 5,
  // "Voiceover from text" in the video editor (text-voice, ElevenLabs turbo v2.5).
  "ai-voice": 10,
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
} as const;

export type UsageFeature = keyof typeof DAILY_LIMITS;

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
