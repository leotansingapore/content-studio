// Angles (plan-angles, Leo only): the reasons a campaign gives an audience to care, kept per audience id under
// content-studio-angles-<scoped>, newest first, so the next campaign for the same audience starts with them
// ("used before"). Nothing is saved until the wizard's Confirm (confirmAngles). A campaign keeps its own copies.

import { scoped } from "@/lib/profiles";

export const MAX_PER_AUDIENCE = 30;
export const ANGLE_LIMITS = { title: 40, line: 140 } as const;
export const ANGLES_CHANGED = "content-studio-angles-changed";
export const NO_ROOM_LINE = "This device is out of room, so your angles weren't kept for next time.";
const PREFIX = "content-studio-angles-";

export interface Angle {
  id: string;
  title: string;
  line: string;
  origin: "suggested" | "mine";
  createdAt: string;
  usedAt?: string;
}
/** Audience id -> its angles, newest first. */
export type AngleStore = Record<string, Angle[]>;
/** A picked row at Confirm: a saved angle keeps its id, a new one has none. */
export type PickedAngle = Pick<Angle, "title" | "line" | "origin"> & { id?: string };

export const newAngleId = () => `an-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const anglesKey = (userId: string) => PREFIX + scoped(userId);

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function sanitizeAngle(raw: unknown): Angle | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = text(r.id, 40);
  const title = text(r.title, ANGLE_LIMITS.title);
  if (!id || !title) return null;
  const usedAt = text(r.usedAt, 40);
  return {
    id, title, line: text(r.line, ANGLE_LIMITS.line), origin: r.origin === "mine" ? "mine" : "suggested", createdAt: text(r.createdAt, 40),
    ...(usedAt ? { usedAt } : {}),
  };
}

/** At most 30: the oldest never-used ones go first, then the least recently used. */
export function trimAngles(list: Angle[]): Angle[] {
  if (list.length <= MAX_PER_AUDIENCE) return list;
  const rank = (a: Angle) => (a.usedAt ? `1${a.usedAt}` : `0${a.createdAt}`);
  const drop = new Set([...list].sort((a, b) => rank(a).localeCompare(rank(b))).slice(0, list.length - MAX_PER_AUDIENCE).map((a) => a.id));
  return list.filter((a) => !drop.has(a.id));
}

export function loadAngleStore(userId: string | null | undefined): AngleStore {
  if (!userId) return {};
  try {
    const raw = JSON.parse(localStorage.getItem(anglesKey(userId)) ?? "null");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const store: AngleStore = {};
    for (const [audienceId, list] of Object.entries(raw)) {
      if (!Array.isArray(list)) continue;
      const angles = list.map(sanitizeAngle).filter((a): a is Angle => !!a).filter((a, i, all) => all.findIndex((x) => x.id === a.id) === i);
      if (angles.length) store[audienceId] = trimAngles(angles);
    }
    return store;
  } catch {
    return {};
  }
}

export const anglesFor = (userId: string | null | undefined, audienceId: string): Angle[] => loadAngleStore(userId)[audienceId] ?? [];

function writeStore(userId: string, store: AngleStore): string | null {
  try {
    localStorage.setItem(anglesKey(userId), JSON.stringify(store));
  } catch {
    return NO_ROOM_LINE;
  }
  window.dispatchEvent(new Event(ANGLES_CHANGED));
  return null;
}

/**
 * Confirm: every picked angle is kept for this audience with usedAt now (a saved one, matched by id or the same
 * title, takes the new words; a new one is added first). Returns the picked angles with their ids, in the picked
 * order, for the campaign to copy, even when this device had no room to keep them (error says so).
 */
export function confirmAngles(userId: string, audienceId: string, picked: PickedAngle[], now = new Date()): { angles: Angle[]; error: string | null } {
  const store = loadAngleStore(userId);
  let list = store[audienceId] ?? [];
  const at = now.toISOString();
  const angles: Angle[] = [];
  for (const p of picked) {
    const prev = list.find((a) => (p.id && a.id === p.id) || same(a.title, p.title));
    const angle = sanitizeAngle({ ...prev, ...p, id: prev?.id ?? p.id ?? newAngleId(), origin: prev?.origin ?? p.origin, createdAt: prev?.createdAt ?? at, usedAt: at });
    if (!angle || angles.some((a) => a.id === angle.id)) continue;
    angles.push(angle);
    list = prev ? list.map((a) => (a.id === prev.id ? angle : a)) : [angle, ...list];
  }
  const error = writeStore(userId, { ...store, [audienceId]: trimAngles(list) });
  return { angles, error };
}

/** Deletes a saved angle; returns it for the Undo toast (restoreAngle), or null when it wasn't there. */
export function removeAngle(userId: string, audienceId: string, id: string): Angle | null {
  const store = loadAngleStore(userId);
  const gone = store[audienceId]?.find((a) => a.id === id) ?? null;
  if (gone) writeStore(userId, { ...store, [audienceId]: store[audienceId].filter((a) => a.id !== id) });
  return gone;
}

/** Undo for removeAngle: puts it back in its createdAt place. Null when saved, else the line. */
export function restoreAngle(userId: string, audienceId: string, angle: Angle): string | null {
  const store = loadAngleStore(userId);
  const list = (store[audienceId] ?? []).filter((a) => a.id !== angle.id);
  const next = [...list, angle].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return writeStore(userId, { ...store, [audienceId]: trimAngles(next) });
}

export function onAnglesChanged(cb: () => void): () => void {
  window.addEventListener(ANGLES_CHANGED, cb);
  return () => window.removeEventListener(ANGLES_CHANGED, cb);
}
