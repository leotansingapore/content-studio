// Mentions (Top posts > News): names, products or topics an adviser watches,
// checked against recent news by the mentions edge function.
//   keywords: content-studio-mentions-${scoped(userId)} (synced)
//   seen:     cs-mentions-seen-${scoped(userId)} (this device: which links were already shown)

import { scoped } from "@/lib/profiles";
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";

export const MAX_WATCH = 5;
const KEY = "content-studio-mentions-";
const SEEN = "cs-mentions-seen-";

export interface Mention {
  title: string;
  url: string;
  source: string;
  snippet: string;
  date: string;
}
export interface MentionResult {
  keyword: string;
  items: Mention[];
  error?: string;
}

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadWatch(userId: string | null | undefined): string[] {
  const s = store();
  if (!s || !userId) return [];
  try {
    const v = JSON.parse(s.getItem(KEY + scoped(userId)) ?? "[]");
    return Array.isArray(v) ? v.filter((k): k is string => typeof k === "string" && k.trim().length >= 2).map((k) => k.slice(0, 60)).slice(0, MAX_WATCH) : [];
  } catch {
    return [];
  }
}

export function saveWatch(userId: string, list: string[]): string[] {
  const next = [...new Set(list.map((k) => k.replace(/\s+/g, " ").trim()).filter((k) => k.length >= 2))].slice(0, MAX_WATCH);
  try {
    store()?.setItem(KEY + scoped(userId), JSON.stringify(next));
  } catch {
    // storage full: the list still applies for this visit
  }
  return next;
}

/** Links this device has already shown; a result not in it is new. */
export function loadSeen(userId: string): Set<string> {
  try {
    return new Set(JSON.parse(store()?.getItem(SEEN + scoped(userId)) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function markSeen(userId: string, urls: string[]): void {
  const all = [...new Set([...loadSeen(userId), ...urls])].slice(-500);
  try {
    store()?.setItem(SEEN + scoped(userId), JSON.stringify(all));
  } catch {
    // storage full: everything just looks new again
  }
}

/** How many results in a check weren't shown before. */
export function countNew(results: MentionResult[], seen: Set<string>): number {
  return new Set(results.flatMap((r) => r.items.map((i) => i.url)).filter((u) => !seen.has(u))).size;
}

export async function checkMentions(keywords: string[]): Promise<MentionResult[]> {
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/mentions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ keywords }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Mentions answered ${res.status}.`);
  return Array.isArray(body.results) ? body.results : [];
}
