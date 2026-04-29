// Draft history storage.
//
// Per-user FIFO list of generated drafts, capped at MAX_DRAFTS.
// Persisted to localStorage:
//   key: content-studio-drafts-${userId}
//
// Once the SUPABASE handoff lands (content_studio_drafts table), this
// module can swap to Supabase reads/writes without touching callers.

export const MAX_DRAFTS = 50;

export interface DraftEntry {
  id: string;
  createdAt: string;
  hook: string;
  draft: string;
  pillar: string;
  pillarDetail: string;
  audience: string;
  format: string;
  platform: string;
  ctaType: string;
  vibeSourceId?: string;
}

const KEY_PREFIX = "content-studio-drafts-";

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (_) {
    return null;
  }
}

export function loadDrafts(userId: string | null | undefined): DraftEntry[] {
  if (!userId) return [];
  const storage = safeStorage();
  if (!storage) return [];
  const raw = storage.getItem(`${KEY_PREFIX}${userId}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as DraftEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (_) {
    return [];
  }
}

export function saveDrafts(userId: string, drafts: DraftEntry[]): void {
  const storage = safeStorage();
  if (!storage) return;
  // Trim to MAX_DRAFTS, newest first.
  const trimmed = drafts.slice(0, MAX_DRAFTS);
  storage.setItem(`${KEY_PREFIX}${userId}`, JSON.stringify(trimmed));
}

export function upsertDraft(
  userId: string,
  entry: DraftEntry,
): DraftEntry[] {
  const current = loadDrafts(userId);
  const without = current.filter((d) => d.id !== entry.id);
  const next = [entry, ...without].slice(0, MAX_DRAFTS);
  saveDrafts(userId, next);
  return next;
}

export function deleteDraft(userId: string, id: string): DraftEntry[] {
  const current = loadDrafts(userId);
  const next = current.filter((d) => d.id !== id);
  saveDrafts(userId, next);
  return next;
}

export function getDraftById(
  userId: string | null | undefined,
  id: string,
): DraftEntry | null {
  if (!userId) return null;
  return loadDrafts(userId).find((d) => d.id === id) ?? null;
}

export function newDraftId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
