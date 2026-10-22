// Audiences (brand-audiences, Leo only): the named groups a brand's posts are for, synced per brand under
// content-studio-audiences-<scoped>. Remove sets offAt, so the row stays (hidden) and the seed from positioning
// never comes back. The suggestion job lives in audienceSuggest.ts; this file is the store only.

import { isPositioningUsable, loadPositioning, type PlanAudience } from "@/lib/positioning";
import { scoped } from "@/lib/profiles";
import { cutAtWord } from "@/lib/scriptCaption";

export const MAX_ACTIVE = 6;
export const MAX_KEPT = 20;
export const AUDIENCE_LIMITS = { name: 60, who: 240, care: 80, cares: 5, says: 160 } as const;
export const AUDIENCES_CHANGED = "content-studio-audiences-changed";
export const FULL_LINE = "6 is the most. Remove one to add another.";
export const NO_ROOM_LINE = "This device is out of room, so that wasn't saved. Clear some space, then try again.";
const PREFIX = "content-studio-audiences-";

/** The seed's name when positioning has no audience detail. */
export const STAGE_GROUPS: Record<PlanAudience, string> = {
  "young-adult": "Young adults",
  "working-adult": "Working adults",
  parent: "Parents",
  "pre-retiree": "Pre-retirees",
  general: "Everyone I serve",
};

export interface Audience {
  id: string;
  name: string;
  who: string;
  lifeStage: PlanAudience;
  cares: string[];
  says?: string;
  main?: boolean;
  source: "website" | "profile" | "you";
  createdAt: string;
  offAt?: string;
}

export type SaveAudienceResult = { ok: true; audience: Audience } | { ok: false; error: string };

export const newAudienceId = () => `au-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const audiencesKey = (userId: string) => PREFIX + scoped(userId);

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isStage = (v: unknown): v is PlanAudience => typeof v === "string" && v in STAGE_GROUPS;

/** One stored row as the app reads it, every field clipped; null without an id or a name. */
export function sanitizeAudience(raw: unknown): Audience | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id, 40);
  const name = text(r.name, AUDIENCE_LIMITS.name);
  if (!id || !name) return null;
  const cares = (Array.isArray(r.cares) ? r.cares : []).map((c) => text(c, AUDIENCE_LIMITS.care)).filter(Boolean).slice(0, AUDIENCE_LIMITS.cares);
  const says = text(r.says, AUDIENCE_LIMITS.says);
  const offAt = text(r.offAt, 40);
  return {
    id,
    name,
    who: text(r.who, AUDIENCE_LIMITS.who),
    lifeStage: isStage(r.lifeStage) ? r.lifeStage : "general",
    cares,
    ...(says ? { says } : {}),
    ...(r.main === true && !offAt ? { main: true } : {}),
    source: r.source === "website" || r.source === "profile" ? r.source : "you",
    createdAt: text(r.createdAt, 40),
    ...(offAt ? { offAt } : {}),
  };
}

/** Exactly one main while any row is active: the first main kept, else the first active row. */
function oneMain(rows: Audience[]): Audience[] {
  const mainId = (rows.find((a) => a.main && !a.offAt) ?? rows.find((a) => !a.offAt))?.id;
  return rows.map(({ main: _, ...a }) => (a.id === mainId ? { ...a, main: true } : a));
}

/** The stored rows, removed ones included; null when the key was never written (bad JSON reads as no rows). */
function readRows(userId: string): Audience[] | null {
  try {
    const stored = localStorage.getItem(audiencesKey(userId));
    if (stored === null) return null;
    const raw = JSON.parse(stored);
    if (!Array.isArray(raw)) return [];
    const rows: Audience[] = [];
    for (const r of raw) {
      const a = sanitizeAudience(r);
      if (a && !rows.some((x) => x.id === a.id)) rows.push(a);
    }
    return oneMain(rows.slice(0, MAX_KEPT));
  } catch {
    return [];
  }
}

function writeRows(userId: string, rows: Audience[]): string | null {
  // past 20 rows, the oldest removed ones go first (active rows are at most 6)
  const off = rows.filter((a) => a.offAt).sort((a, b) => (a.offAt ?? "").localeCompare(b.offAt ?? ""));
  const drop = new Set(off.slice(0, Math.max(0, rows.length - MAX_KEPT)).map((a) => a.id));
  try {
    localStorage.setItem(audiencesKey(userId), JSON.stringify(oneMain(rows.filter((a) => !drop.has(a.id)))));
  } catch {
    return NO_ROOM_LINE;
  }
  window.dispatchEvent(new Event(AUDIENCES_CHANGED));
  return null;
}

/** The seed from positioning: its detail as the name (cut at a word), else the life stage as a group. */
export function seedAudience(p: { audience: PlanAudience; audienceDetail: string }, now: Date): Audience {
  const detail = p.audienceDetail.trim();
  return {
    id: newAudienceId(),
    name: detail ? cutAtWord(detail, AUDIENCE_LIMITS.name) : STAGE_GROUPS[p.audience] ?? STAGE_GROUPS.general,
    who: detail.slice(0, AUDIENCE_LIMITS.who),
    lifeStage: isStage(p.audience) ? p.audience : "general",
    cares: [],
    main: true,
    source: "profile",
    createdAt: now.toISOString(),
  };
}

/**
 * The brand's active audiences, main first. With no row at all (removed ones count) and positioning usable, the
 * seed is made and saved once, with no AI call; positioning arrives in the same sync pull as this key, so a fresh
 * device never seeds over audiences it has not pulled yet.
 */
export function loadAudiences(userId: string | null | undefined, now = new Date()): Audience[] {
  if (!userId) return [];
  let rows = readRows(userId);
  if (rows === null) {
    const p = loadPositioning(userId);
    if (!p || !isPositioningUsable(p)) return [];
    rows = [seedAudience(p, now)];
    writeRows(userId, rows);
  }
  const active = rows.filter((a) => !a.offAt);
  return [...active.filter((a) => a.main), ...active.filter((a) => !a.main)];
}

/** Adds a row (no id, or an id not stored) or changes one. A new row past 6 active is refused with FULL_LINE. */
export function saveAudience(userId: string, a: Partial<Audience> & Pick<Audience, "name">, now = new Date()): SaveAudienceResult {
  const rows = readRows(userId) ?? [];
  const prev = rows.find((x) => x.id === a.id);
  if (!prev && rows.filter((x) => !x.offAt).length >= MAX_ACTIVE) return { ok: false, error: FULL_LINE };
  const audience = sanitizeAudience({ source: "you", cares: [], ...prev, ...a, id: prev?.id ?? newAudienceId(), createdAt: prev?.createdAt ?? now.toISOString() });
  if (!audience) return { ok: false, error: "Give it a name first." };
  const next = (prev ? rows.map((x) => (x.id === audience.id ? audience : x)) : [audience, ...rows])
    .map((x) => (audience.main && x.id !== audience.id ? { ...x, main: false } : x));
  const error = writeRows(userId, next);
  return error ? { ok: false, error } : { ok: true, audience: oneMain(next).find((x) => x.id === audience.id) ?? audience };
}

/** Hides a row (offAt); when it was the main one, the next active row becomes main. Null when saved, else the line. */
export function removeAudience(userId: string, id: string, now = new Date()): string | null {
  const rows = readRows(userId) ?? [];
  if (!rows.some((a) => a.id === id && !a.offAt)) return null;
  return writeRows(userId, rows.map((a) => (a.id === id ? { ...a, main: false, offAt: now.toISOString() } : a)));
}

export function setMain(userId: string, id: string): string | null {
  const rows = readRows(userId) ?? [];
  if (!rows.some((a) => a.id === id && !a.offAt)) return null;
  return writeRows(userId, rows.map((a) => ({ ...a, main: a.id === id })));
}

export function onAudiencesChanged(cb: () => void): () => void {
  window.addEventListener(AUDIENCES_CHANGED, cb);
  return () => window.removeEventListener(AUDIENCES_CHANGED, cb);
}

/**
 * The line Write and Batch add to ideaContext for a picked audience (brand-audiences' writer line). `says` is
 * introduced as talk about money only for an adviser's brand (remixBrand's speakerFor gives "person"); a business's
 * buyers, or a caller that doesn't say, get "How they talk about it" (wave 2 live check, 22 Oct: sales reps' "who I
 * need to call" went out as money talk).
 */
export function audienceLine(a: Pick<Audience, "name" | "who" | "cares" | "says">, speaker?: "person" | "business"): string {
  // a seed has no cares yet: its line leaves that sentence out rather than end "They care about: ."
  const who = a.who.trim() && !/[.!?]$/.test(a.who.trim()) ? `${a.who.trim()}.` : a.who.trim();
  const cares = a.cares.length ? ` They care about: ${a.cares.join(", ")}.` : "";
  const says = a.says ? ` How they talk about ${speaker === "person" ? "money" : "it"}: ${a.says}` : "";
  // a seed's who is its name, or the detail its name was cut from: say it once (wave 2 live check, 22 Oct)
  const key = (s: string) => s.toLowerCase().replace(/[.!?\s]+$/, "").replace(/\s+/g, " ");
  const named = key(who) === key(a.name) || key(who).startsWith(`${key(a.name)} `);
  return `WRITE FOR THIS AUDIENCE: ${named ? who : `${a.name}.${who ? ` ${who}` : ""}`}${cares}${says}`;
}

/**
 * Write's and Batch's pick from the address: `aud` (an active saved audience) beats `audience` (a life stage).
 * An unknown or removed `aud` gives aud null, so the page falls back to the life stages and drops it from the address.
 */
export function audienceFromParams(params: URLSearchParams, saved: Audience[]): { aud: Audience | null; audience: PlanAudience | null } {
  const id = params.get("aud");
  const aud = (id && saved.find((a) => a.id === id && !a.offAt)) || null;
  const stage = params.get("audience");
  return { aud, audience: aud ? aud.lifeStage : isStage(stage) ? stage : null };
}
