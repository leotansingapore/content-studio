// video-assist mode "keywords" (edit-captions): Jev picks the one word in each
// spoken caption line that carries the meaning, drawn bigger in the captions,
// and an emoji from the pop-ups' own set (motion.ts EMOJI) for a lit line. A
// pick is a decision, so Jev makes it (Leo's rule); the editor draws it. Pure,
// so vitest covers it (keywords.test.ts). The client builds each line's
// candidates with keyCandidates too.

import type { JevAnswer, JevQuestion } from "../_shared/jev.ts";
import { EMOJI } from "./motion.ts";

/** Lines per request, and candidate words per line. */
export const MAX_KEYWORD_LINES = 80;
export const MAX_CANDIDATES = 12;
const MAX_WORD = 30;
/** Proposals (phase 3 decision 11): set from Leo's first 10 edited videos, every pick read. */
export const KEY_WORD_AT = 0.35;
export const EMOJI_AT = 0.5;
/** At most one emoji in this many seconds, the strongest first. */
export const EMOJI_GAP = 6;

export interface KeywordLine {
  text: string;
  /** The candidate words, from keyCandidates. */
  words: string[];
  /** Where the line starts on the edited timeline (seconds); for the emoji spacing. */
  s: number;
}
/** off: no emoji asked; one: the single strongest kept (the brand kit's "one at most"). */
export type EmojiAsk = "off" | "on" | "one";
export interface KeywordPick {
  line: number;
  word: string | null;
  emoji?: string;
}

// short words that never carry a line's meaning, and the fillers the editor can keep (2 letters and under are left out anyway)
const STOP = new Set(
  ("the and you your yours that this these those with for are was were have has had but not they them their what when where which who whom why how will would can could " +
    "should just like really very about from into our ours out all any been being its it's there here then than some more most also because know mean going gonna want get got " +
    "let let's i'm you're we're they're don't can't won't did does doing one say said thing things way much many well even still only too yeah okay right so " +
    "umm uhh uhm erm ahh hmm mhm").split(" "),
);
const isNumber = (w: string) => /\d|[$%]/.test(w);

/** A line's candidates: its words of 3 or more letters that are not stop words, and any number, once each, at most 12. */
export function keyCandidates(words: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of words) {
    // the word as said, without the punctuation around it (a number keeps its $ and %)
    const w = String(raw ?? "").replace(/^[^\p{L}\p{N}$]+|[^\p{L}\p{N}%]+$/gu, "");
    const key = w.toLowerCase();
    if (!w || w.length > MAX_WORD || seen.has(key)) continue;
    if (!isNumber(w) && ((w.match(/\p{L}/gu) ?? []).length < 3 || STOP.has(key))) continue;
    seen.add(key);
    out.push(w);
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

export function parseKeywordsRequest(body: unknown): { ok: true; lines: KeywordLine[]; emoji: EmojiAsk } | { ok: false; error: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const raw = Array.isArray(b.lines) ? b.lines : [];
  if (raw.length > MAX_KEYWORD_LINES) return { ok: false, error: `Send at most ${MAX_KEYWORD_LINES} lines.` };
  const lines = raw.map((x) => {
    const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    const s = Number(o.s);
    return {
      text: String(o.text ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
      words: keyCandidates(Array.isArray(o.words) ? o.words : []),
      s: Number.isFinite(s) && s >= 0 ? s : 0,
    };
  });
  if (!lines.length || lines.every((l) => !l.text)) return { ok: false, error: "Caption the video first." };
  return { ok: true, lines, emoji: b.emoji === true ? "on" : b.emoji === "one" ? "one" : "off" };
}

/** What Jev reads: the whole video, each line tagged, so a line is judged against the rest. */
export function keywordsState(lines: KeywordLine[]) {
  return { video: "Captions of a short video by a Singapore financial adviser, line by line.", transcript: lines.map((l, i) => `L${i}| ${l.text}`).join("\n").slice(0, 8000) };
}

/**
 * Per asked line, w<i> (which word) and with emoji e<i> (which picture). Only lines `asked` says yes to are asked
 * (English, with a candidate); the rest stay plain.
 */
export function keywordQuestions(lines: KeywordLine[], emoji: EmojiAsk, asked: (l: KeywordLine) => boolean): Record<string, JevQuestion> {
  const q: Record<string, JevQuestion> = {};
  lines.forEach((l, i) => {
    if (!l.text || !l.words.length || !asked(l)) return;
    q[`w${i}`] = {
      type: "choice",
      instructions: `A Singapore financial adviser says this line in a short video: \`${l.text}\`. Which one word carries the meaning a viewer must catch, so it is worth showing bigger in the captions?`,
      criteria: {
        ...Object.fromEntries(l.words.map((w, j) => [`c${j}`, `the word "${w}"`])),
        none: "No single word stands out; leave the line plain.",
      },
    };
    if (emoji === "off") return;
    q[`e${i}`] = {
      type: "choice",
      instructions: `Which small picture fits this line from a financial adviser's video, if any: \`${l.text}\`?`,
      criteria: { ...Object.fromEntries(Object.entries(EMOJI).map(([k, v]) => [k, v.when])), none: "No picture fits, or it would look out of place." },
    };
  });
  return q;
}

/** Jev's pick for a question and its probability, or null on none, no answer or a pick outside the options. */
function pickOf(a: JevAnswer | undefined, options: string[]): { id: string; p: number } | null {
  const id = a?.choice;
  if (typeof id !== "string" || id === "none" || !options.includes(id)) return null;
  const p = a?.probabilities?.[id];
  return { id, p: typeof p === "number" && Number.isFinite(p) ? p : 0 };
}

/**
 * A pick per line: the word when Jev's pick is a candidate at KEY_WORD_AT or more, else null; and on a lit line the
 * emoji at EMOJI_AT or more, at most one in EMOJI_GAP seconds (one in all with "one"), the strongest kept first.
 * No answers give every line null.
 */
export function readKeywords(answers: Record<string, JevAnswer> | null, lines: KeywordLine[], emoji: EmojiAsk): KeywordPick[] {
  const picks: KeywordPick[] = lines.map((l, i) => {
    const w = pickOf(answers?.[`w${i}`], l.words.map((_, j) => `c${j}`));
    return { line: i, word: w && w.p >= KEY_WORD_AT ? l.words[Number(w.id.slice(1))] : null };
  });
  if (emoji === "off" || !answers) return picks;
  const strong = picks
    .flatMap((p) => {
      const e = p.word ? pickOf(answers[`e${p.line}`], Object.keys(EMOJI)) : null;
      return e && e.p >= EMOJI_AT ? [{ line: p.line, key: e.id, p: e.p }] : [];
    })
    .sort((a, b) => b.p - a.p);
  const kept: typeof strong = [];
  for (const e of strong) {
    if (emoji === "one" && kept.length) break;
    if (kept.some((k) => Math.abs(lines[k.line].s - lines[e.line].s) < EMOJI_GAP)) continue;
    kept.push(e);
  }
  for (const e of kept) picks[e.line].emoji = EMOJI[e.key].emoji;
  return picks;
}
