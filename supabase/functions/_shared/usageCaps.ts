// Daily per-user caps for paid AI and scraping calls (cs_ai_usage, migration
// 009). Call consumeUsage before the paid call; it counts the use and says
// whether it's allowed. No Deno or npm imports, so vitest can test it.

export const DAILY_LIMITS = {
  "reel-clone": 20,
  "idea-dump": 30,
  carousel: 30,
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
