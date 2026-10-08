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

/** Uses left per feature, read on mount and again each time `busy` (an AI run) goes back to false. */
export function useUsesLeft(busy: boolean): (feature: UsageFeature) => number | null {
  const [usage, setUsage] = useState<Usage | null>(null);
  useEffect(() => {
    if (!busy) void readUsage().then(setUsage);
  }, [busy]);
  return (feature) => usesLeft(usage, feature);
}
