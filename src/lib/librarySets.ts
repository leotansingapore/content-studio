// The Library's sets (Fastlane's Sets, 14 Nov): named collections of Library items, per brand and synced:
//   content-studio-sets-${scoped(userId)}: LibrarySet[], newest first
// A set holds Library item keys ("d:<draftId>", "c:<carouselId>"...), so it never copies a piece; a key whose piece
// no longer exists is skipped when the set is drawn, and comes back with it if an Undo restores the piece.

import { scoped } from "@/lib/profiles";

export interface LibrarySet {
  id: string;
  name: string;
  keys: string[];
  createdAt: string;
}

export const MAX_SETS = 50;
export const MAX_SET_ITEMS = 500;
export const MAX_SET_NAME = 40;
const PREFIX = "content-studio-sets-";
export const SETS_EVENT = "content-studio-sets-changed";
const ID = /^set-[a-z0-9]{4,30}$/;
const KEY = /^[a-z]:\S{1,160}$/;

const cleanName = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, MAX_SET_NAME) : "");

/** One stored set as it should be, or null. */
export function sanitizeSet(raw: unknown): LibrarySet | null {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const name = cleanName(r?.name);
  if (!r || typeof r.id !== "string" || !ID.test(r.id) || !name) return null;
  const keys = [...new Set((Array.isArray(r.keys) ? r.keys : []).filter((k): k is string => typeof k === "string" && KEY.test(k)))].slice(0, MAX_SET_ITEMS);
  return { id: r.id, name, keys, createdAt: typeof r.createdAt === "string" ? r.createdAt : "" };
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadSets(userId: string | null | undefined): LibrarySet[] {
  if (!userId) return [];
  try {
    const raw = JSON.parse(storage()?.getItem(PREFIX + scoped(userId)) ?? "[]");
    return (Array.isArray(raw) ? raw : []).map(sanitizeSet).filter((x): x is LibrarySet => !!x).slice(0, MAX_SETS);
  } catch {
    return [];
  }
}

function write(userId: string, list: LibrarySet[]): LibrarySet[] {
  try {
    storage()?.setItem(PREFIX + scoped(userId), JSON.stringify(list));
  } catch {
    // storage full or blocked: the sets still show for this visit
  }
  globalThis.dispatchEvent?.(new Event(SETS_EVENT));
  return list;
}

let seq = 0;
const newSetId = () => `set-${Date.now().toString(36)}${(seq++ % 36).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** A new set, first in the list, holding `keys`; null without a name or past MAX_SETS. */
export function createSet(userId: string, name: string, keys: string[] = [], now = new Date()): LibrarySet | null {
  const list = loadSets(userId);
  const set = sanitizeSet({ id: newSetId(), name, keys, createdAt: now.toISOString() });
  if (!set || list.length >= MAX_SETS) return null;
  write(userId, [set, ...list]);
  return set;
}

const change = (userId: string, id: string, edit: (s: LibrarySet) => LibrarySet) => write(userId, loadSets(userId).map((s) => (s.id === id ? edit(s) : s)));

export function renameSet(userId: string, id: string, name: string): LibrarySet[] {
  const clean = cleanName(name);
  return clean ? change(userId, id, (s) => ({ ...s, name: clean })) : loadSets(userId);
}

/** Takes a set off the list; what restoreSet needs to put it back, or null. */
export function deleteSet(userId: string, id: string): { set: LibrarySet; at: number } | null {
  const list = loadSets(userId);
  const at = list.findIndex((s) => s.id === id);
  if (at < 0) return null;
  write(userId, list.filter((s) => s.id !== id));
  return { set: list[at], at };
}

export function restoreSet(userId: string, gone: { set: LibrarySet; at: number }): LibrarySet[] {
  const list = loadSets(userId).filter((s) => s.id !== gone.set.id);
  list.splice(Math.min(gone.at, list.length), 0, gone.set);
  return write(userId, list.slice(0, MAX_SETS));
}

/** Adds the keys a set doesn't hold yet, newest first; how many were added. */
export function addToSet(userId: string, id: string, keys: string[]): number {
  const set = loadSets(userId).find((s) => s.id === id);
  if (!set) return 0;
  const fresh = [...new Set(keys)].filter((k) => KEY.test(k) && !set.keys.includes(k));
  const room = Math.max(0, MAX_SET_ITEMS - set.keys.length);
  const added = fresh.slice(0, room);
  if (added.length) change(userId, id, (s) => ({ ...s, keys: [...added, ...s.keys] }));
  return added.length;
}

export function removeFromSet(userId: string, id: string, keys: string[]): LibrarySet[] {
  const out = new Set(keys);
  return change(userId, id, (s) => ({ ...s, keys: s.keys.filter((k) => !out.has(k)) }));
}
