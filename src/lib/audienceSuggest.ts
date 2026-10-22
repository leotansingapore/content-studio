// Suggesting audiences (brand-audiences, Leo only): one brand-dna audiences call, run outside React so leaving
// /audiences keeps it going. The answer waits for this tab in sessionStorage (cs-audience-suggest-<scoped>, never
// synced) until each row is kept or removed; Keep saves through audiences.ts, and nothing is saved before it.
// It reads the site typed on the page (the kit's website, else Your market's site), or with none the profile.

import { toast } from "@/hooks/use-toast";
import { loadAudiences, saveAudience } from "@/lib/audiences";
import { hostOf } from "@/lib/brandRead";
import { loadBrand } from "@/lib/carousel";
import { loadCoachProfile } from "@/lib/coachProfile";
import { callFn, EdgeError } from "@/lib/edgeFn";
import { loadMarket } from "@/lib/market";
import { loadPositioning, type PlanAudience } from "@/lib/positioning";
import { scoped } from "@/lib/profiles";

export const suggestKey = (userId: string) => `cs-audience-suggest-${scoped(userId)}`;
const STAGES: PlanAudience[] = ["young-adult", "working-adult", "parent", "pre-retiree", "general"];

export interface Suggested {
  name: string;
  who: string;
  lifeStage: PlanAudience;
  cares: string[];
  says?: string;
}
/** brand-dna's answer as it waits: where it read from, and the rows not yet kept or removed. */
export interface Waiting {
  from: "website" | "profile";
  host: string;
  audiences: Suggested[];
  /** false when Jev gave no answers: every row is "general" and needs a closer look. */
  scored: boolean;
}
export interface Suggesting {
  from: "website" | "profile";
  host: string;
  startedAt: number;
}

export const failedLine = (host: string) =>
  host ? `We couldn't read ${host}. Check the address, or suggest from your profile.` : "Couldn't suggest audiences right now. Try again in a few minutes.";
export const statusLine = (s: Pick<Suggesting, "host">) =>
  `Reading ${s.host || "your profile"} and writing up to 4 audiences. This takes about 20 seconds.`;

/** Where Suggest reads first: the kit's website, else Your market's site, else "" (the profile). */
export function siteFor(userId: string): string {
  const site = loadBrand(userId)?.website || loadMarket(userId).site;
  return site.trim() ? hostOf(site) : "";
}

/** What "Suggest from my profile" sends: positioning, Coach's "Who you're for" and the kit's role. */
export function profileAsk(userId: string) {
  const p = loadPositioning(userId);
  return {
    oneLiner: p?.oneLiner ?? "",
    audienceDetail: p?.audienceDetail ?? "",
    topics: (p?.topics ?? []).join(", "),
    edge: p?.edge ?? "",
    role: loadBrand(userId)?.role ?? "",
    coachAudience: loadCoachProfile(userId).audience,
  };
}
export const hasProfile = (userId: string) => Object.values(profileAsk(userId)).some((v) => v.trim());

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** brand-dna's answer (or what this tab kept) as the page reads it; null when it isn't one. */
export function waitingOf(d: unknown, from: Waiting["from"], host: string): Waiting | null {
  const x = d as Record<string, unknown> | null;
  if (!x || !Array.isArray(x.audiences)) return null;
  const audiences = x.audiences.flatMap((a: Record<string, unknown>): Suggested[] => {
    const name = str(a?.name);
    if (!name) return [];
    const says = str(a.says);
    return [{
      name,
      who: str(a.who),
      lifeStage: STAGES.find((s) => s === a.lifeStage) ?? "general",
      cares: Array.isArray(a.cares) ? a.cares.map(str).filter(Boolean).slice(0, 5) : [],
      ...(says ? { says } : {}),
    }];
  });
  return { from, host, audiences: audiences.slice(0, 4), scored: x.scored !== false };
}

// a copy in memory too, so a tab with storage blocked still reaches its rows on this visit
const memory = new Map<string, Waiting | null>();
const running = new Map<string, Suggesting>();
const failed = new Map<string, { line: string; code: string }>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function onSuggest(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export const suggestingNow = (userId: string): Suggesting | undefined => running.get(suggestKey(userId));
/** The last run's refusal: the server's own line and code (none_new, daily_limit, not_enabled...). */
export const suggestFailed = (userId: string) => failed.get(suggestKey(userId));

export function loadWaiting(userId: string): Waiting | null {
  const key = suggestKey(userId);
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    const v = JSON.parse(sessionStorage.getItem(key) ?? "null");
    const w = v ? waitingOf(v, v.from === "profile" ? "profile" : "website", str(v.host)) : null;
    return w?.audiences.length ? w : null;
  } catch {
    return null;
  }
}

function keep(key: string, w: Waiting | null): void {
  const next = w?.audiences.length ? w : null;
  memory.set(key, next);
  try {
    if (next) sessionStorage.setItem(key, JSON.stringify(next));
    else sessionStorage.removeItem(key);
  } catch {
    // storage full or blocked: the memory copy serves this visit
  }
  emit();
}

/** Keep one suggested row: saved as an audience, gone from the waiting rows. The refusal's line, or null. */
export function keepSuggested(userId: string, i: number, now = new Date()): string | null {
  const w = loadWaiting(userId);
  const s = w?.audiences[i];
  if (!w || !s) return null;
  const r = saveAudience(userId, { ...s, source: w.from }, now);
  if (r.ok === false) return r.error;
  keep(suggestKey(userId), { ...w, audiences: w.audiences.filter((_, j) => j !== i) });
  return null;
}

/** Keep all, in order, until one is refused (6 is the most): how many were kept, and the refusal's line. */
export function keepAllSuggested(userId: string, now = new Date()): { kept: number; error: string | null } {
  let kept = 0;
  while (loadWaiting(userId)) {
    const error = keepSuggested(userId, 0, now);
    if (error) return { kept, error };
    kept++;
  }
  return { kept, error: null };
}

export function removeSuggested(userId: string, i: number): void {
  const w = loadWaiting(userId);
  if (w) keep(suggestKey(userId), { ...w, audiences: w.audiences.filter((_, j) => j !== i) });
}

/** Suggest: the typed site, or the profile when none is typed. One run per brand at a time. */
export async function startSuggest(userId: string, address: string, now = Date.now): Promise<void> {
  // the brand open when the run starts is the one its rows wait for
  const key = suggestKey(userId);
  if (running.has(key)) return;
  const site = address.trim();
  const run: Suggesting = { from: site ? "website" : "profile", host: site ? hostOf(site) : "", startedAt: now() };
  running.set(key, run);
  failed.delete(key);
  emit();
  const saved = loadAudiences(userId).map((a) => ({ name: a.name, who: a.who }));
  let line = "";
  try {
    const d = await callFn<unknown>("brand-dna", site ? { mode: "audiences", url: site, saved } : { mode: "audiences", profile: profileAsk(userId), saved }, failedLine(run.host));
    const w = waitingOf(d, run.from, run.host);
    if (!w?.audiences.length) throw new EdgeError(failedLine(run.host), 200, "bad_reply");
    keep(key, w);
  } catch (e) {
    const err = e instanceof EdgeError ? e : null;
    line = err?.message || failedLine(run.host);
    failed.set(key, { line, code: err?.code ?? "" });
  } finally {
    running.delete(key);
    emit();
  }
  // left /audiences while it ran: say so where they are
  if (typeof location !== "undefined" && location.pathname !== "/audiences")
    toast(line ? { title: line, variant: "destructive" } : { title: "Your suggested audiences are ready", description: "Open Audiences to keep the ones you want." });
}
