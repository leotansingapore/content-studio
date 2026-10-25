// What's left of today's AI uses, shown beside the AI buttons before a run.
// The counter is cs_ai_usage (supabase/hub/009): edge functions count each use
// with cs_consume_ai_usage, and its RLS lets a person read their own rows, so
// no new RPC is needed. A day is the UTC date, as the counter keeps it, so it
// turns over at 8am Singapore time.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DAILY_LIMITS, type UsageFeature } from "../../supabase/functions/_shared/usageCaps.ts";

export interface Usage {
  day: string;
  used: Record<string, number>;
}

export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

/** Uses left today, or null before today's count has been read. */
export function usesLeft(u: Usage | null, feature: UsageFeature, now = new Date()): number | null {
  if (!u) return null;
  const used = u.day === utcDay(now) ? (u.used[feature] ?? 0) : 0;
  return Math.max(0, DAILY_LIMITS[feature] - used);
}

/** Today's counts for the signed-in person, or null when they can't be read (then nothing is shown). */
export async function readUsage(): Promise<Usage | null> {
  const day = utcDay();
  const { data, error } = await supabase.from("cs_ai_usage").select("feature,count").eq("day", day);
  if (error || !Array.isArray(data)) return null;
  return { day, used: Object.fromEntries(data.map((r: { feature: string; count: number }) => [r.feature, r.count])) };
}

// Caps that count something other than an AI run (fetches, scrapes, Zernio reads and writes, comments): Pace's
// "AI runs, last 7 days" cell leaves them out, or social-read's own pulls would top it (learn-pace).
export const NOT_AI: UsageFeature[] = [
  "social-connect", "social-read", "social-automation-write", "social-schedule", "social-presign", "team-comment",
  "feeds", "stock-search", "mentions", "yt-captions", "track-accounts", "reel-style", "reel-video",
];

/**
 * AI runs in the last 7 UTC days (the counter's days, not Posts out's Monday week), with the most used feature, or
 * null when the rows can't be read. Counts are per sign-in across every brand: cs_ai_usage has no brand column. Only
 * caps in DAILY_LIMITS count, minus the "-global" counters on GLOBAL_COUNTER_USER (Leo's own sign-in, so they would
 * count twice) and NOT_AI; that also drops the per-brand "market-check:<profile>" and claimOnce rows.
 */
export async function readUsageWeek(now = new Date()): Promise<{ total: number; most: { feature: string; n: number } | null } | null> {
  const { data, error } = await supabase.from("cs_ai_usage").select("feature,day,count").gte("day", utcDay(new Date(now.getTime() - 6 * 86_400_000)));
  if (error || !Array.isArray(data)) return null;
  const by = new Map<string, number>();
  for (const r of data as { feature: string; count: number }[]) {
    if (!(r.feature in DAILY_LIMITS) || r.feature.endsWith("-global") || NOT_AI.includes(r.feature as UsageFeature)) continue;
    by.set(r.feature, (by.get(r.feature) ?? 0) + (Number(r.count) || 0));
  }
  const [top] = [...by].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { total: [...by.values()].reduce((a, b) => a + b, 0), most: top && top[1] > 0 ? { feature: top[0], n: top[1] } : null };
}

/** Uses left per feature, read on mount and again each time `busy` (an AI run) goes back to false. */
export function useUsesLeft(busy: boolean): (feature: UsageFeature) => number | null {
  const [usage, setUsage] = useState<Usage | null>(null);
  useEffect(() => {
    if (!busy) void readUsage().then(setUsage);
  }, [busy]);
  return (feature) => usesLeft(usage, feature);
}
