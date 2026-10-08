// Retakes: a sentence said again a little later. The earlier take is cut and
// the last one kept. Whether two sentences match is measured from their words
// (in-order overlap), not judged; every match is listed for review with Keep.

import { PAD_END, PAD_MID, endsSentence } from "@/lib/cutRules";
import { isFiller, sentencesOf, type Sentence, type Word } from "@/lib/videoEdit";

/** A later take counts when it starts within this many seconds of the earlier one's end. */
export const RETAKE_WITHIN = 20;
/** Share of words two takes have in common, in order (2 x common / both lengths). 0.85: one word changed in 7 counts, in 6 or fewer does not ("You need to save more." / "You need to invest more." is two lines, not a retake). */
export const RETAKE_MATCH = 0.85;

const tokens = (text: string) =>
  text.split(/\s+/).map((t) => t.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "")).filter((t) => t && !isFiller(t));

/** Longest run of words two lists share in order (not necessarily side by side). */
export function commonWords(a: string[], b: string[]): number {
  let prev = new Array(b.length + 1).fill(0);
  for (const x of a) {
    const cur = [0];
    for (let j = 0; j < b.length; j++) cur.push(x === b[j] ? prev[j] + 1 : Math.max(prev[j + 1], cur[j]));
    prev = cur;
  }
  return prev[b.length];
}

/** B says A again: nearly the same words in the same order, or A is B's opening cut off (a false start). */
export function saysAgain(a: string, b: string): boolean {
  const x = tokens(a);
  const y = tokens(b);
  if (x.length >= 2 && x.length < y.length && x.every((t, i) => t === y[i])) return true;
  return x.length >= 4 && (2 * commonWords(x, y)) / (x.length + y.length) >= RETAKE_MATCH;
}

export interface Retake {
  /** The earlier take, on the source timeline, and its words. */
  s: number;
  e: number;
  text: string;
  /** Where the take that replaces it starts. */
  again: number;
  /** The cut: the take plus the silence either side, down to the padding its place calls for. */
  start: number;
  end: number;
}

/** Every sentence said again within RETAKE_WITHIN seconds, earliest first; words are the ones still said (fillers out). */
export function findRetakes(said: Word[]): Retake[] {
  const sents = sentencesOf(said);
  const out: Retake[] = [];
  for (let i = 0; i < sents.length; i++) {
    const a = sents[i];
    let later: Sentence | undefined;
    for (let j = i + 1; j < sents.length && sents[j].s - a.e <= RETAKE_WITHIN && !later; j++) if (saysAgain(a.text, sents[j].text)) later = sents[j];
    if (!later) continue;
    const first = said.findIndex((w) => w.s >= a.s);
    let last = first;
    while (said[last + 1] && said[last + 1].e <= a.e) last++;
    const prev = said[first - 1];
    const next = said[last + 1];
    const p = prev && !endsSentence(prev.w) ? PAD_MID : PAD_END;
    out.push({
      s: a.s,
      e: a.e,
      text: a.text,
      again: later.s,
      start: prev ? Math.min(a.s, prev.e + p.after) : a.s,
      end: next ? Math.max(a.e, next.s - p.before) : a.e,
    });
  }
  return out;
}
