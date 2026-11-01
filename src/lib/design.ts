// Design (/design): a slideshow made of free layers (text, image, shape, fade) on a 1080-wide frame, the editor
// Volume (tryvolume.app) built, folded in with its founders' permission (Leo, 31 Oct 2026). The document shape
// matches Volume's own, so its templates load as they are. The model and sanitizer are pure and live in
// supabase/functions/_shared/design.ts (Connect Claude's design tools clean with the same rules); this file adds
// loading, saving and following Claude's edits. Drawing is components/design/SlideView.tsx, export designExport.ts.
//   synced: content-studio-designs-${scoped(userId)}, newest MAX_DESIGNS, sanitized on read; Claude writes it too
//   synced: content-studio-design-templates-${scoped(userId)}, the "Save as template" ones

import { scoped } from "@/lib/profiles";
import { FONTS_CSS, MAX_DESIGNS, MAX_TEMPLATES, newId, parseTemplates, sanitizeDesign, type Design, type DesignTemplate } from "../../supabase/functions/_shared/design.ts";

export * from "../../supabase/functions/_shared/design.ts";

/** Loads the editor's fonts once (a stylesheet link, like the caption fonts). */
export function ensureDesignFonts(): void {
  if (typeof document === "undefined" || document.getElementById("design-fonts")) return;
  const link = document.createElement("link");
  link.id = "design-fonts";
  link.rel = "stylesheet";
  link.href = FONTS_CSS;
  document.head.appendChild(link);
}

// ---- load and save ----
const PREFIX = "content-studio-designs-";
const TEMPLATES_PREFIX = "content-studio-design-templates-";
export const DESIGNS_CHANGED = "content-studio-designs-changed";
const storage = () => (typeof localStorage === "undefined" ? null : localStorage);

function read(key: string): Design[] {
  try {
    const raw = JSON.parse(storage()?.getItem(key) ?? "[]");
    return (Array.isArray(raw) ? raw : []).map(sanitizeDesign).filter((d): d is Design => !!d);
  } catch {
    return [];
  }
}
function write(key: string, list: Design[]): Design[] {
  try {
    storage()?.setItem(key, JSON.stringify(list));
  } catch {
    // storage full or blocked: the list still shows for this visit
  }
  globalThis.dispatchEvent?.(new Event(DESIGNS_CHANGED));
  return list;
}

export const loadDesigns = (userId: string | null | undefined): Design[] => (userId ? read(PREFIX + scoped(userId)) : []);
export const designById = (userId: string | null | undefined, id: string | undefined) => (id ? (loadDesigns(userId).find((d) => d.id === id) ?? null) : null);
/** Saves (or replaces) one design, newest first, keeping the latest MAX_DESIGNS. */
export function saveDesign(userId: string, d: Design, now = new Date()): Design[] {
  return write(PREFIX + scoped(userId), [{ ...d, updatedAt: now.toISOString() }, ...loadDesigns(userId).filter((x) => x.id !== d.id)].slice(0, MAX_DESIGNS));
}
export const removeDesign = (userId: string, id: string) => write(PREFIX + scoped(userId), loadDesigns(userId).filter((x) => x.id !== id));

export const loadOwnTemplates = (userId: string | null | undefined): Design[] => (userId ? read(TEMPLATES_PREFIX + scoped(userId)) : []);
/** "Save as template": a copy anyone on this account can start from. */
export function saveOwnTemplate(userId: string, d: Design, now = new Date()): Design[] {
  const t = { ...d, id: newId("tpl"), draftId: undefined, updatedAt: now.toISOString() };
  return write(TEMPLATES_PREFIX + scoped(userId), [t, ...loadOwnTemplates(userId)].slice(0, MAX_TEMPLATES));
}
export const removeOwnTemplate = (userId: string, id: string) => write(TEMPLATES_PREFIX + scoped(userId), loadOwnTemplates(userId).filter((x) => x.id !== id));

/** The synced row the open brand's slideshows live in (content-studio-mcp's designsKey writes the same one). */
export const designsKey = (userId: string) => PREFIX + scoped(userId);

/** The built-in templates, loaded when the gallery opens. */
export async function loadTemplates(): Promise<DesignTemplate[]> {
  return parseTemplates((await import("../../supabase/functions/_shared/designTemplates.json", { with: { type: "json" } })).default);
}

// ---- following Claude's edits in the open editor (Volume's "Claude is editing") ----
/** A user edit this recent keeps the screen: Claude's version is offered instead of applied. */
export const FOLLOW_QUIET_MS = 5000;
const sameDoc = (a: Design, b: Design) => JSON.stringify(sanitizeDesign({ ...a, updatedAt: "" })) === JSON.stringify(sanitizeDesign({ ...b, updatedAt: "" }));

/**
 * What the open editor does with this device's stored copy of its slideshow after a pull: "apply" it, "offer" it
 * (the user edited within FOLLOW_QUIET_MS), or "ignore" it (missing, no newer than the editor's last save, or the same).
 */
export function followStep(open: Design, stored: Design | null, o: { savedAt: string; editedAt: number; now: number }): "apply" | "offer" | "ignore" {
  if (!stored || !(Date.parse(stored.updatedAt) > Date.parse(o.savedAt)) || sameDoc(open, stored)) return "ignore";
  return o.now - o.editedAt < FOLLOW_QUIET_MS ? "offer" : "apply";
}
