// Saved / bookmarked reference items (inspiration examples + creators).
//
// Lets a consultant build a personal library they refer back to, instead of
// re-searching the full lists each time. Persisted per brand to localStorage
// (docs/brand-isolation.md): key content-studio-saved-${scoped(userId)}, which is
// the old per-user key for the default brand.

import { scoped } from "@/lib/profiles";

export type SavedKind = "inspiration" | "creators" | "topPosts";

export interface SavedItems {
  inspiration: string[];
  creators: string[];
  /** Saved swipe-file posts, keyed by `${advisorId}-${shortCode}`. */
  topPosts: string[];
}

const KEY_PREFIX = "content-studio-saved-";
const EMPTY: SavedItems = { inspiration: [], creators: [], topPosts: [] };

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (_) {
    return null;
  }
}

export function loadSaved(userId: string | null | undefined): SavedItems {
  if (!userId) return { ...EMPTY };
  const storage = safeStorage();
  if (!storage) return { ...EMPTY };
  const raw = storage.getItem(`${KEY_PREFIX}${scoped(userId)}`);
  if (!raw) return { ...EMPTY };
  try {
    const parsed = JSON.parse(raw) as Partial<SavedItems>;
    return {
      inspiration: Array.isArray(parsed.inspiration) ? parsed.inspiration : [],
      creators: Array.isArray(parsed.creators) ? parsed.creators : [],
      topPosts: Array.isArray(parsed.topPosts) ? parsed.topPosts : [],
    };
  } catch (_) {
    return { ...EMPTY };
  }
}

function save(userId: string, items: SavedItems): void {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(`${KEY_PREFIX}${scoped(userId)}`, JSON.stringify(items));
}

export function toggleSaved(
  userId: string,
  kind: SavedKind,
  id: string,
): SavedItems {
  const items = loadSaved(userId);
  const list = items[kind];
  items[kind] = list.includes(id)
    ? list.filter((x) => x !== id)
    : [id, ...list];
  save(userId, items);
  return items;
}

export function isSaved(items: SavedItems, kind: SavedKind, id: string): boolean {
  return items[kind].includes(id);
}

export function savedCount(items: SavedItems): number {
  return items.inspiration.length + items.creators.length + items.topPosts.length;
}
