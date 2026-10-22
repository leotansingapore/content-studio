// Where Write's Insert panel puts a snippet, how a hook formula goes in, and the brand kit's hashtag question
// (edit-snippets). Pure: no storage, no React.
import { STARTER_ENDINGS } from "@/data/endings";
import type { HookFormula } from "@/lib/hookFormulas";
import { countHashtags, LINKEDIN_HASHTAGS } from "@/lib/platformCounters";
import { insertSnippet, type SnippetKind } from "@/lib/replySnippets";

/** The editor's selection, when the cursor was placed in it. */
export type Caret = { start: number; end: number };

/**
 * The draft with the snippet in. A placed caret wins; otherwise a hook goes in as the first line, an ending or a
 * hashtag set on a new line at the end, and anything else at the end. Returns where the caret goes after it.
 */
export function insertPlace(kind: SnippetKind, draft: string, snippet: string, caret?: Caret): { text: string; caret: number } {
  if (caret) return insertSnippet(draft, snippet, caret.start, caret.end);
  if (!draft.trim()) return { text: snippet, caret: snippet.length };
  if (kind === "hook") return { text: `${snippet}\n\n${draft.trimStart()}`, caret: snippet.length };
  if (kind === "ending" || kind === "hashtags") {
    const before = `${draft.trimEnd()}\n\n`;
    return { text: before + snippet, caret: before.length + snippet.length };
  }
  return insertSnippet(draft, snippet);
}

/** A hook formula as text to fill in: every {part} becomes a [part] blank, which Write marks. */
export const formulaTemplate = (f: Pick<HookFormula, "template">) => f.template.replace(/\{([^{}]+)\}/g, "[$1]");

export type HashtagAsk = { max: number; n: number; have: number; keep: number };

/**
 * The question before a hashtag set goes in: null when the brand kit and the platform set no limit (`max`
 * undefined) or the post stays within it. `n` is the set's count, `have` the post's, and `keep` how many of the
 * set still fit.
 */
export function hashtagAsk(set: string, draft: string, max: number | undefined): HashtagAsk | null {
  if (max === undefined) return null;
  const n = countHashtags(set);
  const have = countHashtags(draft);
  return have + n <= max ? null : { max, n, have, keep: Math.max(0, max - have) };
}

/** The limit the question holds a set to: the brand kit's or platform's (hashtagMax), and on LinkedIn no more than Write's counter. */
export function insertHashtagMax(kitMax: number | undefined, platform: string): number | undefined {
  if (platform !== "linkedin") return kitMax;
  return Math.min(kitMax ?? LINKEDIN_HASHTAGS, LINKEDIN_HASHTAGS);
}

/** The starter endings, the one matching the draft's call to action first. */
export const startersFor = (cta: string) => [...STARTER_ENDINGS].sort((a, b) => Number(b.cta === cta) - Number(a.cta === cta));
