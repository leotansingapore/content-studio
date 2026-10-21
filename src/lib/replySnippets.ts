// Your own saved replies (Engage > Saved replies): short texts you send often,
// inserted into any Engage draft or copied straight. Leo's sign-ins also keep
// lines, hashtag sets, endings, hooks and post templates in the same list,
// inserted from Write's Insert panel (edit-snippets). Per profile, synced:
//   key: content-studio-snippets-${scoped(userId)}
// The add form's unsaved name and text, this device only:
//   key: cs-snippet-form-${scoped(userId)} (replies), cs-snippet-form-<kind>-${scoped(userId)} (the others)
import { dmFields, dmLinks } from "@/lib/bioPage";
import { brandOffers } from "@/lib/brandRules";
import type { CarouselBrand } from "@/lib/carousel";
import { scoped } from "@/lib/profiles";

export type SnippetKind = "reply" | "line" | "hashtags" | "ending" | "hook" | "post";
export const SNIPPET_KINDS: readonly SnippetKind[] = ["reply", "line", "hashtags", "ending", "hook", "post"];

export interface Snippet {
  id: string;
  name: string;
  text: string;
  /** Left out for a reply, so rows saved before kinds existed are replies. */
  kind?: SnippetKind;
}

/** 30 of each kind. */
export const MAX_PER_KIND = 30;
/** Engage's count, which is replies only. */
export const MAX_SNIPPETS = MAX_PER_KIND;
export const MAX_SNIPPET_NAME = 40;
export const MAX_SNIPPET_TEXT = 1000;
export const MAX_TEXT: Record<SnippetKind, number> = { reply: 1000, line: 1000, hashtags: 300, ending: 300, hook: 200, post: 2200 };
/** What one and several of a kind are called on screen. */
export const KIND_NAME: Record<SnippetKind, { one: string; many: string }> = {
  reply: { one: "reply", many: "replies" },
  line: { one: "line", many: "lines" },
  hashtags: { one: "hashtag set", many: "hashtag sets" },
  ending: { one: "ending", many: "endings" },
  hook: { one: "hook", many: "hooks" },
  post: { one: "post template", many: "post templates" },
};

export const kindOf = (s: Pick<Snippet, "kind">): SnippetKind => s.kind ?? "reply";
export const ofKind = (list: Snippet[], kind: SnippetKind) => list.filter((s) => kindOf(s) === kind);

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
    if (!Array.isArray(v)) return [];
    const count = new Map<SnippetKind, number>();
    return v
      .filter((s) => s && typeof s.id === "string" && typeof s.name === "string" && typeof s.text === "string" && s.text.trim())
      .map((s): Snippet => (s.kind !== "reply" && SNIPPET_KINDS.includes(s.kind) ? { id: s.id, name: s.name, text: s.text, kind: s.kind } : { id: s.id, name: s.name, text: s.text }))
      .filter((s) => {
        const n = count.get(kindOf(s)) ?? 0;
        count.set(kindOf(s), n + 1);
        return n < MAX_PER_KIND;
      });
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
  globalThis.dispatchEvent?.(new Event("content-studio-snippets-changed"));
  return list;
}

/** A name from the text's first words, for a draft saved in one tap. */
export function snippetName(text: string): string {
  const words = text.trim().replace(/\s+/g, " ").split(" ").slice(0, 5).join(" ");
  return words.length > MAX_SNIPPET_NAME ? `${words.slice(0, MAX_SNIPPET_NAME - 3).trimEnd()}...` : words;
}

export type SaveResult = { list: Snippet[]; saved: Snippet | null; problem?: "empty" | "full" | "duplicate" };

/**
 * Adds a snippet (a reply unless `kind` says otherwise), or changes the one
 * with `id`, which keeps its kind. The name falls back to the text's first
 * words; the same text twice within a kind and a 31st of a kind are refused.
 */
export function saveSnippet(userId: string, input: { id?: string; name: string; text: string; kind?: SnippetKind }): SaveResult {
  const list = loadSnippets(userId);
  const old = input.id ? list.find((s) => s.id === input.id) : undefined;
  const kind = old ? kindOf(old) : (input.kind ?? "reply");
  const text = input.text.trim().slice(0, MAX_TEXT[kind]);
  if (!text) return { list, saved: null, problem: "empty" };
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, MAX_SNIPPET_NAME) || snippetName(text);
  const same = ofKind(list, kind);
  const twin = same.find((s) => s.id !== input.id && s.text === text);
  if (twin) return { list, saved: twin, problem: "duplicate" };
  const row = (id: string): Snippet => (kind === "reply" ? { id, name, text } : { id, name, text, kind });
  if (old) {
    const saved = row(old.id);
    return { list: write(userId, list.map((s) => (s.id === old.id ? saved : s))), saved };
  }
  if (same.length >= MAX_PER_KIND) return { list, saved: null, problem: "full" };
  const saved = row(`s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
  return { list: write(userId, [saved, ...list]), saved };
}

export const removeSnippet = (userId: string, id: string) => write(userId, loadSnippets(userId).filter((s) => s.id !== id));

/**
 * The snippet put into a draft between `start` and `end` (the selection; the
 * end of the draft when nothing was selected), with a space before and after
 * it when it would touch a word. Returns the new text and where the caret goes.
 */
export function insertSnippet(draft: string, snippet: string, start = draft.length, end = start): { text: string; caret: number } {
  const before = draft.slice(0, start);
  const after = draft.slice(end);
  const gap = before && !/\s$/.test(before) ? " " : "";
  const gapAfter = /^[\p{L}\p{N}]/u.test(after) && !/\s$/.test(snippet) ? " " : "";
  const text = `${before}${gap}${snippet}${gapAfter}${after}`;
  return { text, caret: before.length + gap.length + snippet.length };
}

// ---- The add form, kept while it is being typed ------------------------------------

export type SnippetForm = { id?: string; name: string; text: string };

const formKey = (userId: string, kind: SnippetKind) => `${FORM_KEY}${kind === "reply" ? "" : `${kind}-`}${scoped(userId)}`;

export function loadForm(userId: string, kind: SnippetKind = "reply"): SnippetForm {
  try {
    const v = JSON.parse(store()?.getItem(formKey(userId, kind)) ?? "null");
    if (v && typeof v.name === "string" && typeof v.text === "string") return { id: typeof v.id === "string" ? v.id : undefined, name: v.name, text: v.text };
  } catch {
    // unreadable: start empty
  }
  return { name: "", text: "" };
}

export function saveForm(userId: string, form: SnippetForm, kind: SnippetKind = "reply"): SnippetForm {
  try {
    if (form.name || form.text) store()?.setItem(formKey(userId, kind), JSON.stringify(form));
    else store()?.removeItem(formKey(userId, kind));
  } catch {
    // storage full: the form still holds for this visit
  }
  return form;
}

// ---- Brand values that fill themselves at insert time --------------------------------

export type BrandValue = "name" | "handle" | "role" | "offer" | "offer_link" | "whatsapp" | "instagram";
/** How a missing value is named in its blank ("[your WhatsApp number]") and its line ("Add your ... in Brand kit"). */
export const BRAND_VALUE_NAME: Record<BrandValue, string> = {
  name: "name",
  handle: "handle",
  role: "role",
  offer: "offer",
  offer_link: "offer link",
  whatsapp: "WhatsApp number",
  instagram: "Instagram username",
};

/**
 * The text with {name}, {handle}, {role}, {offer}, {offer_link}, {whatsapp} and {instagram} filled from the brand
 * kit. The two DM links are the ones Brand kit shows (dmLinks, Analytics accounts as the start). An empty value
 * becomes a blank such as "[your WhatsApp number]" and is listed in `missing`; an unknown token stays as typed.
 */
export function fillVariables(
  text: string,
  brand: CarouselBrand | null | undefined,
  accounts: Parameters<typeof dmFields>[1] = {},
): { text: string; missing: BrandValue[] } {
  const offer = brandOffers(brand)[0];
  const dm = dmLinks(dmFields(brand ?? null, accounts));
  const values: Record<BrandValue, string> = {
    name: brand?.name?.trim() ?? "",
    handle: brand?.handle?.trim() ?? "",
    role: brand?.role?.trim() ?? "",
    offer: offer?.name ?? "",
    offer_link: offer?.url ?? "",
    whatsapp: dm.find((l) => l.id === "whatsapp")?.url ?? "",
    instagram: dm.find((l) => l.id === "instagram")?.url ?? "",
  };
  const missing = new Set<BrandValue>();
  const out = text.replace(/\{(\w+)\}/g, (token, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return token;
    const v = values[key as BrandValue];
    if (v) return v;
    missing.add(key as BrandValue);
    return `[your ${BRAND_VALUE_NAME[key as BrandValue]}]`;
  });
  return { text: out, missing: [...missing] };
}
