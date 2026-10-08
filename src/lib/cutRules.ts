// Rules for the automatic cuts, apart from videoEdit.ts's timeline maths.
// Padding by cut type is from ArtCog/chatmonteur skills/cutting.md; merging
// cuts closer than 0.35 s is from codeaashu/Rescript lib/edits.ts (both MIT).

import type { Segment, Word } from "@/lib/videoEdit";

/** Seconds kept after the last word before a cut, and before the first word after it. */
export const PAD_MID = { after: 0.1, before: 0.08 };
/** After a sentence ends the voice needs longer to land, and the next sentence a breath to start. */
export const PAD_END = { after: 0.2, before: 0.14 };
/** A kept part shorter than this between two cuts, with nothing said in it, goes too. */
export const MERGE_GAP = 0.35;

export const endsSentence = (w: string) => /[.!?]["')\]]?$/.test(w);

/** The pause between two said words cut down to the padding its place calls for, or null when it is too short to cut. */
export function pauseCut(a: Word, b: Word): { start: number; end: number } | null {
  const p = endsSentence(a.w) ? PAD_END : PAD_MID;
  const start = a.e + p.after;
  const end = b.s - p.before;
  return end - start > 0.04 ? { start, end } : null;
}

/** Kept parts without the slivers: under MERGE_GAP with no word said in them, so two cuts close together play as one join. */
export function mergeSlivers(segs: Segment[], said: Word[]): Segment[] {
  return segs.filter((g) => g.end - g.start >= MERGE_GAP || said.some((w) => (w.s + w.e) / 2 >= g.start && (w.s + w.e) / 2 < g.end));
}
