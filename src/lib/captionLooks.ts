// Caption styles (edit-captions), Leo's sign-ins only for now: four more looks in the editor's caption grid, each a
// caption-only patch over one of the six styles applied through withLook, so cuts, hook and frame stay; the key
// word Jev picks in each line (video-assist keywords) kept on the edit by its source time; and the captions saved
// into the default skill for every new video.

import { captionLookOf, isKeyAt, sanitizeKeyWords, withLook, withStyle, withoutCaptions, type CaptionLine, type EditSettings, type KeyWord, type StyleId, type Word } from "@/lib/videoEdit";
import { keyCandidates, type KeywordPick } from "../../supabase/functions/video-assist/keywords.ts";
import type { VideoSkill } from "@/lib/videoSkills";

export interface CaptionLook {
  id: "boxed-word" | "key-word" | "two-words" | "typewriter";
  label: string;
  look: Record<string, unknown> & { style: StyleId };
}

// each sets its size, so moving from one look to another never carries the last one's
export const CAPTION_LOOKS: CaptionLook[] = [
  { id: "boxed-word", label: "Boxed word", look: { style: "bold", captionBox: "word", font: "clean", uppercase: false, wordsPerCaption: 4, size: 1 } },
  { id: "key-word", label: "Key word", look: { style: "native", keyWordsOn: true, size: 1 } },
  { id: "two-words", label: "Two words", look: { style: "bold", wordsPerCaption: 2, size: 1.3 } },
  { id: "typewriter", label: "Typewriter", look: { style: "minimal", captionAnim: "type", size: 1 } },
];

/** The settings in a look: its style's own looks first, as tapping the style does, then the patch. */
export function withCaptionLook(s: EditSettings, l: CaptionLook): EditSettings {
  return withLook(withStyle(s, l.look.style), l.look);
}

/** The look the captions are in now, or null (a colour changed since, or a style tile). */
export function captionLookIn(s: EditSettings): CaptionLook | null {
  const now = JSON.stringify(captionLookOf(s));
  return CAPTION_LOOKS.find((l) => JSON.stringify(captionLookOf(withCaptionLook(s, l))) === now) ?? null;
}

/** The default skill holding these captions: today's default with only its caption keys replaced, or a new default "My captions". */
export function captionsAsDefault(def: VideoSkill | null, s: EditSettings, newId: string): Omit<VideoSkill, "updatedAt"> {
  return def ? { ...def, look: { ...withoutCaptions(def.look), ...captionLookOf(s) } } : { id: newId, name: "My captions", look: captionLookOf(s), isDefault: true };
}

// ---------- key words ----------

/** Jev's picks as key words on the edit: the source start of the picked word in its line, with its emoji. */
export function keyWordsFrom(lines: CaptionLine[], picks: KeywordPick[]): KeyWord[] {
  const out = picks.flatMap((p) => {
    const want = p.word?.toLowerCase();
    const w = want ? lines[p.line]?.words.find((x) => keyCandidates([x.w])[0]?.toLowerCase() === want) : undefined;
    return w ? [{ at: w.s, ...(p.emoji ? { emoji: p.emoji } : {}) }] : [];
  });
  return sanitizeKeyWords(out) ?? [];
}

/** How many of the lines have a lit word, of how many. */
export function keyCount(lines: CaptionLine[], keyWords: KeyWord[] | undefined): { n: number; m: number } {
  return { n: lines.filter((l) => l.words.some((w) => keyWords?.some((k) => isKeyAt(k, w)))).length, m: lines.length };
}

/** True when a pick's word is no longer heard (cut, or the words captioned again): time to pick again. */
export function keysStale(lines: CaptionLine[], keyWords: KeyWord[] | undefined): boolean {
  return !!keyWords?.some((k) => !lines.some((l) => l.words.some((w) => isKeyAt(k, w))));
}

/** A tapped word: lit, it goes dark; else it becomes its line's key word in place of the one there (keeping that one's emoji). */
export function tapKeyWord(lines: CaptionLine[], keyWords: KeyWord[] | undefined, w: Pick<Word, "s">): KeyWord[] {
  const list = keyWords ?? [];
  if (list.some((k) => isKeyAt(k, w))) return list.filter((k) => !isKeyAt(k, w));
  const line = lines.find((l) => l.words.some((x) => Math.abs(x.s - w.s) < 0.001));
  if (!line) return list;
  const was = list.find((k) => line.words.some((x) => isKeyAt(k, x)));
  return [...list.filter((k) => k !== was), { at: w.s, ...(was?.emoji ? { emoji: was.emoji } : {}) }];
}
