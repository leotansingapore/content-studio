// Your own saved replies (Engage > Saved replies): short texts you send often,
// inserted into any Engage draft or copied straight. Per profile, synced:
//   key: content-studio-snippets-${scoped(userId)}
// The add form's unsaved name and text, this device only:
//   key: cs-snippet-form-${scoped(userId)}
import { scoped } from "@/lib/profiles";

export interface Snippet {
  id: string;
  name: string;
  text: string;
}

export const MAX_SNIPPETS = 30;
export const MAX_SNIPPET_NAME = 40;
export const MAX_SNIPPET_TEXT = 1000;

const KEY = "content-studio-snippets-";
const FORM_KEY = "cs-snippet-form-";

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadSnippets(userId: string | null | undefined): Snippet[] {
  if (!userId) return [];
  try {
    const v = JSON.parse(store()?.getItem(KEY + scoped(userId)) ?? "[]");
    return Array.isArray(v)
      ? v
          .filter((s) => s && typeof s.id === "string" && typeof s.name === "string" && typeof s.text === "string" && s.text.trim())
          .map((s) => ({ id: s.id, name: s.name, text: s.text }))
          .slice(0, MAX_SNIPPETS)
      : [];
  } catch {
    return [];
  }
}

function write(userId: string, list: Snippet[]): Snippet[] {
  try {
    store()?.setItem(KEY + scoped(userId), JSON.stringify(list));
  } catch {
    // storage full: the list still holds for this visit
  }
  return list;
}

/** A name from the text's first words, for a draft saved in one tap. */
export function snippetName(text: string): string {
  const words = text.trim().replace(/\s+/g, " ").split(" ").slice(0, 5).join(" ");
  return words.length > MAX_SNIPPET_NAME ? `${words.slice(0, MAX_SNIPPET_NAME - 3).trimEnd()}...` : words;
}

export type SaveResult = { list: Snippet[]; saved: Snippet | null; problem?: "empty" | "full" | "duplicate" };

/**
 * Adds a snippet, or changes the one with `id`. The name falls back to the
 * text's first words; the same text twice and a 31st are refused.
 */
export function saveSnippet(userId: string, input: { id?: string; name: string; text: string }): SaveResult {
  const list = loadSnippets(userId);
  const text = input.text.trim().slice(0, MAX_SNIPPET_TEXT);
  if (!text) return { list, saved: null, problem: "empty" };
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, MAX_SNIPPET_NAME) || snippetName(text);
  const twin = list.find((s) => s.id !== input.id && s.text === text);
  if (twin) return { list, saved: twin, problem: "duplicate" };
  if (input.id && list.some((s) => s.id === input.id)) {
    const saved = { id: input.id, name, text };
    return { list: write(userId, list.map((s) => (s.id === input.id ? saved : s))), saved };
  }
  if (list.length >= MAX_SNIPPETS) return { list, saved: null, problem: "full" };
  const saved = { id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, text };
  return { list: write(userId, [saved, ...list]), saved };
}

export const removeSnippet = (userId: string, id: string) => write(userId, loadSnippets(userId).filter((s) => s.id !== id));

/**
 * The snippet put into a draft between `start` and `end` (the selection; the
 * end of the draft when nothing was selected), with a space before it when
 * it would touch a word. Returns the new text and where the caret goes.
 */
export function insertSnippet(draft: string, snippet: string, start = draft.length, end = start): { text: string; caret: number } {
  const before = draft.slice(0, start);
  const gap = before && !/\s$/.test(before) ? " " : "";
  const text = `${before}${gap}${snippet}${draft.slice(end)}`;
  return { text, caret: before.length + gap.length + snippet.length };
}

// ---- The add form, kept while it is being typed ------------------------------------

export type SnippetForm = { id?: string; name: string; text: string };

export function loadForm(userId: string): SnippetForm {
  try {
    const v = JSON.parse(store()?.getItem(FORM_KEY + scoped(userId)) ?? "null");
    if (v && typeof v.name === "string" && typeof v.text === "string") return { id: typeof v.id === "string" ? v.id : undefined, name: v.name, text: v.text };
  } catch {
    // unreadable: start empty
  }
  return { name: "", text: "" };
}

export function saveForm(userId: string, form: SnippetForm): SnippetForm {
  try {
    if (form.name || form.text) store()?.setItem(FORM_KEY + scoped(userId), JSON.stringify(form));
    else store()?.removeItem(FORM_KEY + scoped(userId));
  } catch {
    // storage full: the form still holds for this visit
  }
  return form;
}
