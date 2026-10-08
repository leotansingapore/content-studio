// Notes and campaigns pinned to a calendar day ("Webinar push", "CPF week").
//
// Per profile, synced across devices:
//   key: content-studio-calnotes-${scoped(userId)}

import { scoped } from "@/lib/profiles";

export const NOTE_COLORS = ["brand", "primary", "success", "warning", "destructive"] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export interface CalNote {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  color: NoteColor;
}

const KEY_PREFIX = "content-studio-calnotes-";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadNotes(userId: string | null | undefined): CalNote[] {
  const s = storage();
  if (!s || !userId) return [];
  try {
    const parsed = JSON.parse(s.getItem(KEY_PREFIX + scoped(userId)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((n) => n && typeof n.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(n.date) && typeof n.title === "string")
      .map((n) => ({ ...n, color: NOTE_COLORS.includes(n.color) ? n.color : "brand" }));
  } catch {
    return [];
  }
}

function save(userId: string, notes: CalNote[]): CalNote[] {
  storage()?.setItem(KEY_PREFIX + scoped(userId), JSON.stringify(notes));
  return notes;
}

/** Adds the note, or replaces the one with the same id. */
export function saveNote(userId: string, note: CalNote): CalNote[] {
  const rest = loadNotes(userId).filter((n) => n.id !== note.id);
  return save(userId, [...rest, { ...note, title: note.title.trim().slice(0, 80) }]);
}

export function deleteNote(userId: string, id: string): CalNote[] {
  return save(userId, loadNotes(userId).filter((n) => n.id !== id));
}

export function newNoteId(): string {
  return `note-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
