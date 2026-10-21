// Posts in Chinese, Malay or Tamil (edit-translate). English stays the source: a version is its own draft with
// `lang`, `translationOf` (the English post's id, its textKey when translated, and when), `back` (its English meaning,
// line by line) and `sameP` (Jev's same-meaning answer). loadDrafts checks no fields, so these readers do.
// The call is video-assist translate with kind "post" (Leo only on the server, cap "post-translate").

import { callFn } from "@/lib/edgeFn";
import type { DraftEntry, TranslationLink } from "@/lib/draftHistory";
import type { PostLang } from "@/lib/links";
import { textKey } from "@/lib/postScore";

/** Jev's same-meaning cut (decision 15): null keeps the check in shadow, so no version shows a warning until it is set. */
export const SAME_WARN: number | null = null;

/** The English names DUB_LANGS uses, for chips and lines ("Chinese version saved."). */
export const LANG_NAMES: Record<PostLang, string> = { zh: "Chinese", ms: "Malay", ta: "Tamil" };

export const asPostLang = (v: unknown): PostLang | null => (v === "zh" || v === "ms" || v === "ta" ? v : null);

/** The draft's language, or null for English (an older draft, or a language this app doesn't make). */
export const langOf = (entry: Pick<DraftEntry, "lang">): PostLang | null => asPostLang(entry.lang);

/** The English post a version was made from, only when its three fields are text. */
export function sourceOf(entry: Pick<DraftEntry, "translationOf">): TranslationLink | null {
  const t = entry.translationOf as unknown;
  if (!t || typeof t !== "object") return null;
  const { id, key, at } = t as Record<string, unknown>;
  return typeof id === "string" && typeof key === "string" && typeof at === "string" ? { id, key, at } : null;
}

/** The English changed after the version was made. False when the English is gone: the version then stands alone. */
export function isStale(version: Pick<DraftEntry, "translationOf">, source: Pick<DraftEntry, "platform" | "draft"> | null | undefined): boolean {
  const link = sourceOf(version);
  return !!link && !!source && textKey(source.platform, source.draft) !== link.key;
}

/** "Check this version" shows only once a cut is set, and never when Jev had no answer. */
export const sameWarns = (sameP: unknown, cut: number | null = SAME_WARN): boolean => cut !== null && typeof sameP === "number" && sameP < cut;

export interface PostTranslation {
  /** The version, its line breaks where the English had them. */
  text: string;
  /** The version's English meaning, one per line of the post. */
  back: string[];
  /** Jev's yes probability that `back` says what the English says, or null with no answer. */
  same: number | null;
}

/** One post into `lang`. Refusals come as EdgeError with the server's line and code (not_enabled, bad_request, daily_limit, failed, incomplete). */
export async function translatePost(lang: PostLang, text: string): Promise<PostTranslation> {
  const r = await callFn<{ lines: string[]; back: string[]; same: number | null }>(
    "video-assist",
    { mode: "translate", kind: "post", back: true, lang, lines: text.split("\n") },
    "Couldn't translate it right now. Try again in a minute.",
  );
  return { text: r.lines.join("\n"), back: r.back, same: typeof r.same === "number" ? r.same : null };
}
