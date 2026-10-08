// Pure logic for writing-judge: the judgment calls in Write that Jev makes
// (Leo's rule: anything that decides goes to Jev, never an LLM prompt or a
// keyword list). Each mode is one Jev request over one state; the thresholds
// that turn Jev's probabilities into a yes or no live here, each with the
// shadow-check numbers it was set from. No Deno or npm imports, so vitest
// covers it and the browser imports the shared parts (splitSentences).
//
// Mode "human": the two judged parts of the "sounds human" check (does it read
// as AI-written, does it have a real specific, and with voice samples, does it
// sound like their own posts) plus the AI sentence shapes per sentence. The
// three measured checks (sentence variety, stock words, typography) are counted
// in the browser (src/lib/humanCheck.ts), never judged.

import type { JevAnswer, JevQuestion } from "../_shared/jev.ts";
import { mostlyEnglish } from "../post-score/logic.ts";

export { mostlyEnglish };

export const MIN_TEXT = 40;
export const MAX_TEXT = 5000;
/** Sentences judged one by one; a longer post has its first 40 checked. */
export const MAX_SENTENCES = 40;
const MAX_SAMPLES = 3;
const MAX_SAMPLE_CHARS = 1200;
export const MODES = ["human"] as const;
export type JudgeMode = (typeof MODES)[number];

/**
 * A draft cut into sentences, in code: each line on its own, then split after
 * . ! or ? followed by a space or the line's end (so 3.5% and $1.2M stay
 * whole). Units with no letter (an emoji or a lone number) are dropped.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.match(/(?:[^.!?]|[.!?](?=\S))+(?:[.!?]+|$)/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => /\p{L}/u.test(s));
}

export type JudgeRequest = { mode: "human"; text: string; samples: string[] };

export function parseJudgeRequest(raw: unknown): { ok: true; request: JudgeRequest } | { ok: false; error: string } {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const mode = MODES.find((m) => m === b.mode);
  if (!mode) return { ok: false, error: "Unknown check." };
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (text.length < MIN_TEXT) return { ok: false, error: "Write a bit more before checking it." };
  if (text.length > MAX_TEXT) return { ok: false, error: `Checks read posts up to ${MAX_TEXT.toLocaleString("en-US")} characters.` };
  const samples = (Array.isArray(b.samples) ? b.samples : [])
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .slice(0, MAX_SAMPLES)
    .map((s) => s.trim().slice(0, MAX_SAMPLE_CHARS));
  return { ok: true, request: { mode, text, samples } };
}

// ---- Mode "human" -----------------------------------------------------------

/** AI sentence shapes, with the fix shown beside a flagged line. Fixed copy. */
export const SHAPES = {
  contrast: { label: "Not this, but that", tip: "Say the one thing you mean. Drop the setup half." },
  triad: { label: "List of three for rhythm", tip: "Keep the two that matter, or name real things." },
  reveal: { label: "Staged reveal", tip: "Give the answer in the same line instead of asking it." },
  bait: { label: "Reflex question", tip: "Ask something only this post could ask, or end on your ask." },
} as const;
export type ShapeId = keyof typeof SHAPES;
const SHAPE_IDS = Object.keys(SHAPES) as ShapeId[];

// Thresholds, set from a shadow check on 2026-10-08 against jev-1.13.0 over 20
// drafts written for it: 11 that read human (9 casual, 1 Singlish, 1 formal
// letter), 9 in stock AI style; 15 with a real specific, 5 without. Voice
// samples were three of the casual drafts. About 3,000 Jev input tokens a check.
/** p(reads as AI) at or above this fails the voice check. Human 0.15-0.42 (the formal letter 0.90), AI style 0.87-0.92. */
export const AI_MAX = 0.65;
/** p(has a real specific) below this fails the specifics check. With one 0.81-0.98 (a mini-story 0.56), without 0.02-0.30. */
export const SPECIFIC_MIN = 0.5;
/** p(sounds like their saved posts) below this fails the voice check. Same casual voice 0.53-0.79, AI style 0.13, formal letter 0.09. */
export const VOICE_MIN = 0.35;
/**
 * A sentence is flagged when Jev's pick is a shape with at least this
 * probability. Planted shapes: reversals 0.92-1.00, staged reveals and bare
 * reflex questions 0.88-1.00, triads 0.58-0.92 (one of six under 0.7). Real
 * shapes in the human drafts 0.52-1.00, flagged from 0.88 up. Plain sentences:
 * the strongest shape was 0.43, so none is flagged.
 */
export const SHAPE_MIN = 0.7;

export function humanState(text: string, samples: string[]) {
  const sentences = splitSentences(text).slice(0, MAX_SENTENCES);
  return {
    sentences,
    state: { draft: text, ...(samples.length ? { voice_samples: samples } : {}) },
  };
}

export function humanQuestions(sentences: string[], hasSamples: boolean): Record<string, JevQuestion> {
  const q: Record<string, JevQuestion> = {
    ai: {
      type: "noul",
      instructions: "Does `draft` read as if an AI writing tool wrote it, rather than a person writing in their own words?",
      criteria: {
        true: "Smooth and generic: stock phrases, every sentence a similar length, tidy lists of three, staged reveals, upbeat filler, nothing only this writer would say.",
        false: "Sounds like a real person: uneven rhythm, plain everyday words, personal details, a clear opinion, small quirks of how this person talks.",
      },
    },
    specific: {
      type: "noul",
      instructions: "Does `draft` contain at least one real specific detail?",
      criteria: {
        true: "At least one of: a number tied to a real situation (an amount, an age, a count, a date), a short account of what happened to a particular person, or a named place or event.",
        false: "Only general statements, advice or opinions that could appear in anyone's post.",
      },
    },
  };
  if (hasSamples) {
    q.voice = {
      type: "noul",
      instructions: "Does `draft` sound like it was written by the same person who wrote `voice_samples`?",
      criteria: {
        true: "Same kind of word choice, sentence length, tone and way of talking to the reader as the samples.",
        false: "A noticeably different voice from the samples: more formal or more generic, different rhythm or vocabulary.",
      },
    };
  }
  sentences.forEach((s, i) => {
    q[`shape_${i}`] = {
      type: "choice",
      instructions: {
        sentence: s,
        sentence_before: i > 0 ? sentences[i - 1] : "",
        question: "Which of these AI writing shapes is `sentence`? Read it together with `sentence_before`.",
      },
      criteria: {
        none: "None of these. An ordinary sentence: a statement, a story detail, a comparison of two people or numbers, a real list of named things such as 'CPF, SRS and cash', a real question about the topic, or an instruction such as 'Comment X and I'll send you Y'.",
        contrast: "A reversal that denies one thing to assert another: 'It's not just X, it's Y', 'Not only X but also Y', 'X is a journey, not a destination', or 'It isn't about X.' followed by 'It's about Y.' A sentence that merely contains 'not' is not this.",
        triad: "Three short words or phrases stacked for rhythm, such as 'clear, simple, and powerful' or 'plan, protect, prosper'.",
        reveal: "A short rhetorical question that sets up its own answer, such as 'The result?', 'The best part?' or 'The catch?'",
        bait: "A bare reflex question tacked on for comments, usually one to three words: 'Thoughts?', 'Agree?', 'Who else?', 'Am I wrong?'. Not a real question about the post's topic.",
      },
    };
  });
  return q;
}

export interface HumanJudgment {
  /** Null when Jev gave no answer for it. */
  aiSounding: boolean | null;
  specific: boolean | null;
  /** Null without voice samples, or with no answer. */
  voiceMatch: boolean | null;
  shapes: { text: string; shape: ShapeId }[];
}

const yes = (p: number | null | undefined, min: number) => (typeof p === "number" && Number.isFinite(p) ? p >= min : null);

/** Jev's answers made into yes or no with the thresholds above. Null when nothing came back. */
export function readHuman(answers: Record<string, JevAnswer> | null, sentences: string[]): HumanJudgment | null {
  if (!answers) return null;
  const shapes: HumanJudgment["shapes"] = [];
  sentences.forEach((text, i) => {
    const a = answers[`shape_${i}`];
    const pick = a?.choice as ShapeId | undefined;
    if (!pick || !SHAPE_IDS.includes(pick)) return;
    if ((a?.probabilities?.[pick] ?? 0) >= SHAPE_MIN) shapes.push({ text, shape: pick });
  });
  return {
    aiSounding: yes(answers.ai?.noul, AI_MAX),
    specific: yes(answers.specific?.noul, SPECIFIC_MIN),
    voiceMatch: yes(answers.voice?.noul, VOICE_MIN),
    shapes,
  };
}

