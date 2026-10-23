// Short-video drafts come back from the generator as a spoken script
// (HOOK / BODY / CTA) followed by a suggested caption under a heading like
// "**CAPTION:**" or "Suggested caption:". Only the caption is what actually
// gets posted, so previews need the two halves separated.

import type { DraftEntry } from "@/lib/draftHistory";
import { links } from "@/lib/links";
import { spokenLines } from "@/lib/platformCounters";

// Also "SUGGESTED POST CAPTION:" / "Post caption:" and "[CAPTION SUGGESTION]", which the generator writes too.
const CAPTION_HEADING =
  /^[\s>#*[-]*(?:suggested\s+)?(?:post\s+)?caption(?:\s+suggestions?)?\s*[\]*]*\s*(?::\s*\**\s*(.*))?$/i;

export function splitScriptCaption(text: string): {
  script: string | null;
  caption: string;
} {
  const trimmed = text.trim();
  if (!trimmed) return { script: null, caption: "" };

  const lines = trimmed.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(CAPTION_HEADING);
    if (!m) continue;

    const inline = m[1]?.trim() ?? "";
    const after = lines.slice(i + 1).join("\n").trim();
    const caption = [inline, after].filter(Boolean).join("\n").trim();

    // Drop a trailing "---" style separator left above the heading.
    const script = lines
      .slice(0, i)
      .join("\n")
      .replace(/\n[\s*_-]{3,}\s*$/, "")
      .trim();

    return { script: script || null, caption };
  }

  return { script: null, caption: trimmed };
}

/**
 * A post with a video's caption in place of its own, in Clone a reel's shape (script, a --- line, CAPTION:), so
 * splitScriptCaption still splits it: the script half and every other field kept. Text with no caption heading is
 * all script here, the way the video was spoken from it, so no words are lost.
 */
export function withVideoCaption(entry: DraftEntry, caption: string): DraftEntry {
  const old = entry.draft.trim();
  const split = splitScriptCaption(old);
  // no heading gives the whole text back as the caption; a heading with nothing above it has no script
  const script = split.script ?? (split.caption === old ? old : "");
  return { ...entry, draft: `${script ? `${script}\n\n---\n\n` : ""}CAPTION:\n${caption.trim()}` };
}

// ---------- a post's script on the AI video panel (edit-video, Leo only) ----------

/** The script half of a short-video post: the part above its caption heading, else all of it. */
const scriptHalf = (text: string) => (splitScriptCaption(text).script ?? text).trim();
const wordsIn = (s: string) => s.split(/\s+/).filter(Boolean).length;
/** A paragraph's sentences, each keeping its end mark ("S$1.5" never splits: an end mark needs a space after it). */
const sentencesOf = (text: string): string[] => text.replace(/\s+/g, " ").trim().split(/(?<=[.!?]["')\]]?)\s+/).filter(Boolean);

/**
 * The words said in a short-video post, as one paragraph: its script half without HOOK:/BODY:/CTA: labels, markdown,
 * notes for the edit (B-roll, text on screen) or stage directions in square brackets.
 */
export function spokenScript(text: string): string {
  return spokenLines(scriptHalf(text)).join(" ").replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
}

/** Text cut at the last whole word that fits in `max` characters, with no comma or dash left hanging. */
export function cutAtWord(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const at = t.slice(0, max + 1).lastIndexOf(" ");
  return (at > 0 ? t.slice(0, at) : t.slice(0, max)).replace(/[\s,;:-]+$/, "");
}

export interface Fit {
  text: string;
  /** Sentences kept from the start, and left out after them. */
  kept: number;
  left: number;
}

/**
 * The longest run of whole sentences from the start that fits in `max` characters and `maxWords` words. Only a first
 * sentence too long on its own is cut, at a word, so there is always something to say.
 */
export function fitScript(text: string, max: number, maxWords = Infinity): Fit {
  const all = sentencesOf(text);
  let out = "";
  let kept = 0;
  for (const s of all) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > max || wordsIn(next) > maxWords) break;
    out = next;
    kept++;
  }
  if (!kept && all.length) {
    out = cutAtWord(all[0].split(" ").slice(0, maxWords).join(" "), max);
    kept = 1;
  }
  return { text: out, kept, left: all.length - kept };
}

/** The AI panel's box sizes a post fills; AiVideo.tsx passes its own. */
export interface FillLimits {
  /** You speaking's script: characters, and words for its 30 s. */
  say: number;
  sayWords: number;
  /** The montage theme. */
  theme: number;
  /** A template's "What they say". */
  line: number;
}

export interface PostFill {
  id: string;
  /** What the strip calls the post: its hook, else its first spoken sentence. */
  title: string;
  /** You speaking: the storyboard's say lines while it was made from this script, else the spoken script. */
  say: Fit;
  /** The montage theme: the title cut at a word. */
  theme: string;
  /** A template's "What they say": the first spoken sentence cut at a word. */
  line: string;
  /** The caption under the script's caption heading, "" when it has none; the made video takes it to the editor. */
  caption: string;
}

/**
 * What a short-video post fills on the AI panel's forms (/edit?panel=ai&draft=<id>). Null when it has nothing to say
 * yet (a board idea): under 5 spoken words, the narrated video's "A draft" floor.
 */
export function postFill(entry: Pick<DraftEntry, "id" | "hook" | "draft" | "storyboard">, max: FillLimits): PostFill | null {
  const script = spokenScript(entry.draft);
  if (wordsIn(script) < 5) return null;
  const beats = entry.storyboard?.script === scriptHalf(entry.draft) ? entry.storyboard.beats : [];
  const said = beats.map((b) => String(b.say ?? "").trim()).filter(Boolean).join(" ");
  const first = sentencesOf(script)[0];
  const title = spokenScript(entry.hook ?? "") || first;
  const split = splitScriptCaption(entry.draft);
  return {
    id: entry.id, title, say: fitScript(said || script, max.say, max.sayWords), theme: cutAtWord(title, max.theme), line: cutAtWord(first, max.line),
    caption: split.script ? split.caption : "",
  };
}

export type MakeVideoKind = "avatar" | "explainer" | "montage" | "film";

/** "Make the video" on a short-video post (Write and Clone a reel, Leo only), in menu order. */
export const MAKE_VIDEO: { kind: MakeVideoKind; label: string }[] = [
  { kind: "avatar", label: "You speaking (AI)" },
  { kind: "explainer", label: "Explainer" },
  { kind: "montage", label: "Stock montage" },
  { kind: "film", label: "Film it" },
];

/** Where each opens on that post: the AI panel filled from it (the explainer as the narrated video's "A draft"), or Write's teleprompter. */
export const makeVideoHref = (kind: MakeVideoKind, draft: string): string =>
  kind === "film"
    ? links.generate({ draft, view: "prompter" })
    : links.edit({ panel: ["ai"], kind, draft, ...(kind === "explainer" ? { from: "draft" as const } : {}) });
