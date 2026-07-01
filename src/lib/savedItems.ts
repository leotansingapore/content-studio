// Saved / bookmarked reference items (inspiration examples + creators).
//
// Lets a consultant build a personal library they refer back to, instead of
// re-searching the full lists each time. Persisted per user to localStorage:
//   key: content-studio-saved-${userId}

export type SavedKind = "inspiration" | "creators";

export interface SavedItems {
  inspiration: string[];
  creators: string[];
}

const KEY_PREFIX = "content-studio-saved-";
const EMPTY: SavedItems = { inspiration: [], creators: [] };

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
  const raw = storage.getItem(`${KEY_PREFIX}${userId}`);
  if (!raw) return { ...EMPTY };
  try {
    const parsed = JSON.parse(raw) as Partial<SavedItems>;
    return {
      inspiration: Array.isArray(parsed.inspiration) ? parsed.inspiration : [],
      creators: Array.isArray(parsed.creators) ? parsed.creators : [],
    };
  } catch (_) {
    return { ...EMPTY };
  }
}

function save(userId: string, items: SavedItems): void {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(`${KEY_PREFIX}${userId}`, JSON.stringify(items));
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
  return items.inspiration.length + items.creators.length;
}
