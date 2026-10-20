// Creators to learn from (docs/north-star/items/find-creators.md), Leo only: "Best for you" on /profiles, the Follow
// button on a creator's card and page, and the blocks on a creator's page. Jev scores each hand-picked creator against
// the brand (remix's creator-fit mode); the answer is kept on this device for 7 days, or until the brand's audience,
// offer or topics change. Without an answer the list puts creators who share the Plan's audience first.

import type { AdvisorEntry } from "@/components/AdvisorProfiles";
import type { CreatorAnalysis } from "@/lib/creatorAnalysis";
import { loadBrand } from "@/lib/carousel";
import { callFn } from "@/lib/edgeFn";
import type { FollowPlatform } from "@/lib/following";
import { loadMarket } from "@/lib/market";
import { inNicheGroups, nicheGroup } from "@/lib/nicheGroups";
import { enrich } from "@/lib/postInsights";
import { loadPositioning, type Positioning } from "@/lib/positioning";
import { scoped } from "@/lib/profiles";

/** proposal (decision 7 of the phase-2 brief): "Good fit for you" from here up; set from the first real run. */
export const FIT_CHIP = 0.6;
const FIT_DAYS = 7;
const MAX_SENT = 70;
const KEY = "cs-creator-fit-";

export const FOLLOW_ONLY = "Following reads Instagram and TikTok accounts only.";
export const CAP_LINE = "Their posts load after 8am, when today's checks reset.";

export interface FitInput {
  serves: string;
  sells: string;
  topics: string[];
}

/** Who the brand serves and what it sells (decision 6), as find-niche-feed defines them, plus the Plan's topics. */
export function fitInput(userId: string, p: Positioning | null = loadPositioning(userId)): FitInput {
  const offers = (loadBrand(userId)?.offers ?? []).map((o) => o.name.trim());
  const sells = [...offers, p?.oneLiner.trim() ?? "", p?.edge.trim() ?? ""].filter(Boolean).join(". ");
  const audience = p && p.audience !== "general" ? p.audience.replace(/-/g, " ") : "";
  const serves = p?.audienceDetail.trim() || audience || loadMarket(userId).audience.trim();
  return { serves, sells, topics: (p?.topics ?? []).map((t) => t.trim()).filter(Boolean) };
}

/** A short fingerprint of the input, so a changed audience, offer or topic list asks Jev again. */
export function fitHash(input: FitInput): string {
  let h = 5381;
  for (const ch of JSON.stringify(input)) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}

/** The cached scores for this input, or null when there are none, they are 7+ days old or the input changed. */
export function loadFit(userId: string, hash: string, now = Date.now()): Record<string, number> | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY + scoped(userId)) ?? "null");
    if (!v || v.inputHash !== hash || typeof v.fit !== "object" || !v.fit) return null;
    if (!(now - Date.parse(v.at) < FIT_DAYS * 86_400_000)) return null;
    return v.fit;
  } catch {
    return null;
  }
}

export function saveFit(userId: string, hash: string, fit: Record<string, number>, now = Date.now()): void {
  try {
    localStorage.setItem(KEY + scoped(userId), JSON.stringify({ at: new Date(now).toISOString(), inputHash: hash, fit }));
  } catch { /* full storage: the sort still shows for this visit */ }
}

/** Highest fit first; data order breaks ties, and creators with no score go last. */
export function sortByFit<T extends { id: string }>(entries: T[], fit: Record<string, number>): T[] {
  return entries
    .map((e, i) => ({ e, i, s: typeof fit[e.id] === "number" ? fit[e.id] : -1 }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.e);
}

/** Without a fit answer: creators who share the Plan's one audience first, data order inside each half. */
export function sortByAudience<T extends { audience: string[] }>(entries: T[], planAudience: string): T[] {
  if (!planAudience || planAudience === "general") return entries;
  const shared = (e: T) => e.audience.includes(planAudience);
  return [...entries.filter(shared), ...entries.filter((e) => !shared(e))];
}

const bareHandle = (h: string) => h.replace(/^@/, "").toLowerCase();

/** Up to `n` other creators in the group of this creator's first niche, best fit first when scores are cached. */
export function similarCreators<T extends Pick<AdvisorEntry, "id" | "handle" | "niche">>(
  entry: T,
  entries: T[],
  fit: Record<string, number> | null,
  n = 4,
): { group: string; list: T[] } | null {
  const group = entry.niche[0] ? nicheGroup(entry.niche[0]) : undefined;
  if (!group) return null;
  const picked = new Set([group]);
  // the same person on a second platform is not "another creator": one card per handle, never this one's
  const handles = new Set([bareHandle(entry.handle)]);
  const same = entries.filter((e) => inNicheGroups(e.niche, picked) && !handles.has(bareHandle(e.handle)) && handles.add(bareHandle(e.handle)));
  const list = (fit ? sortByFit(same, fit) : same).slice(0, n);
  return list.length ? { group, list } : null;
}

export const followable = (platform: string): platform is FollowPlatform => platform === "instagram" || platform === "tiktok";

/**
 * The Follow button for a creator, or null when none shows: never for anyone but Leo, and not on a card for a
 * platform Following can't read (its page shows it disabled with the reason instead).
 */
export function followButton(
  platform: string,
  s: { leo: boolean; where: "card" | "page"; followed?: boolean; capped?: boolean; failure?: string | null },
): { label: "Follow" | "Following"; disabled: boolean; reason: string | null } | null {
  if (!s.leo) return null;
  if (!followable(platform)) return s.where === "card" ? null : { label: "Follow", disabled: true, reason: FOLLOW_ONLY };
  if (!s.followed) return { label: "Follow", disabled: false, reason: null };
  return { label: "Following", disabled: false, reason: s.capped ? CAP_LINE : s.failure || null };
}

/** What "What works for them" shows: the read posts, the empty line, or nothing (everyone but Leo). */
export function showsInsights(leo: boolean, analysis: CreatorAnalysis | null): "insights" | "empty" | null {
  if (!leo) return null;
  return analysis?.posts.length ? "insights" : "empty";
}

const ascii = (s: string) => s.replace(/→/g, "->").replace(/[–—]/g, "-").replace(/·/g, "|");

/** The angles and structures a creator's read posts use most (enrich's labels), most used first, top 2 each. */
export function usedMost(analysis: CreatorAnalysis): { angles: [string, number][]; structures: [string, number][] } {
  const { advisor } = analysis;
  const angles = new Map<string, number>();
  const structures = new Map<string, number>();
  for (const p of analysis.posts) {
    const i = enrich({ ...p, advisorId: advisor.id, advisorName: advisor.name, handle: advisor.handle, niche: advisor.niche, audience: advisor.audience }, {});
    if (i.angle) angles.set(i.angle, (angles.get(i.angle) ?? 0) + 1);
    // "Talking-head reel | Scroll-stopping hook ..." names the post's own build first; the rest is the format's
    const built = ascii(i.structure.split(" · ")[0]);
    structures.set(built, (structures.get(built) ?? 0) + 1);
  }
  const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 2);
  return { angles: top(angles), structures: top(structures) };
}

// The fit run lives outside React, so leaving /profiles while Jev answers does not lose it.
export interface FitRun {
  hash: string;
  state: "working" | "done" | "capped" | "failed";
  fit: Record<string, number> | null;
}
let run: FitRun | null = null;
const listeners = new Set<() => void>();
const set = (next: FitRun) => {
  run = next;
  listeners.forEach((l) => l());
};

/** This input's run in this tab, or null when none has started. */
export const fitRun = (hash: string): FitRun | null => (run?.hash === hash ? run : null);

export function onFitRun(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function runFit(userId: string, input: FitInput, entries: AdvisorEntry[]): Promise<void> {
  const hash = fitHash(input);
  if (fitRun(hash)?.state === "working") return;
  set({ hash, state: "working", fit: null });
  try {
    const creators = entries.slice(0, MAX_SENT).map((e) => ({ id: e.id, name: e.name, why: e.why_follow, niche: e.niche, audience: e.audience }));
    const r = await callFn<{ fit?: Record<string, number> | null }>("remix", { mode: "creator-fit", ...input, creators });
    const fit = r?.fit && typeof r.fit === "object" ? r.fit : null;
    if (fit) saveFit(userId, hash, fit);
    set({ hash, state: "done", fit });
  } catch (e) {
    set({ hash, state: (e as { code?: string }).code === "daily_limit" ? "capped" : "failed", fit: null });
  }
}
