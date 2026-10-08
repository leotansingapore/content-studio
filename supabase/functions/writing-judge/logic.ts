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
export const MODES = ["human", "hooks", "idea"] as const;
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

export type JudgeRequest =
  | { mode: "human"; text: string; samples: string[] }
  | { mode: "hooks"; hooks: string[]; audience: string; topic: string; platform: string }
  | { mode: "idea"; topic: string; notes: string; kind: string };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parseJudgeRequest(raw: unknown): { ok: true; request: JudgeRequest } | { ok: false; error: string } {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const mode = MODES.find((m) => m === b.mode);
  if (!mode) return { ok: false, error: "Unknown check." };
  if (mode === "idea") {
    const topic = str(b.topic, 300);
    if (topic.length < 2) return { ok: false, error: "Add your topic first." };
    return { ok: true, request: { mode, topic, notes: str(b.notes, 2000), kind: str(b.kind, 120) } };
  }
  if (mode === "hooks") {
    const hooks = (Array.isArray(b.hooks) ? b.hooks : []).map((h) => str(h, 400));
    if (hooks.length < 2 || hooks.length > 5 || hooks.some((h) => h.length < 3)) return { ok: false, error: "Send two to five hooks." };
    return { ok: true, request: { mode, hooks, audience: str(b.audience, 120), topic: str(b.topic, 300), platform: str(b.platform, 20) } };
  }
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

// ---- Mode "hooks" -----------------------------------------------------------

/** Option keys for the hooks, in the order they were written. */
const LETTERS = ["A", "B", "C", "D", "E"];

// Set from a shadow check on 2026-10-08 (jev-1.13.0): 8 sets of three hooks
// written for it, 6 with one clearly strongest and 2 with three good ones.
// About 560 Jev input tokens a pick.
/**
 * The recommended hook must lead the next one by this much (average
 * probability over both option orders). The clear sets were picked right
 * every time, leading by 0.90-1.00; of the two even sets one led by 0.40
 * (recommended) and one by 0.03 (a tie, no recommendation).
 */
export const PICK_MARGIN = 0.2;

export function hookState(r: { hooks: string[]; audience: string; topic: string; platform: string }) {
  return { platform: r.platform || "social media", audience: r.audience || "Singapore working adults", topic: r.topic };
}

/**
 * One choice asked twice, the options in written and in reversed order: Jev
 * leans toward the first option, so the pick is read off both together.
 */
export function hookQuestions(hooks: string[]): Record<string, JevQuestion> {
  const options = hooks.map((h, i) => [LETTERS[i], h] as const);
  const ask = (order: (readonly [string, string])[]): JevQuestion => ({
    type: "choice",
    instructions: "Which hook would make someone in `audience`, scrolling `platform`, most likely to stop and read a post about `topic`?",
    criteria: Object.fromEntries(order),
  });
  return { pick_fwd: ask(options), pick_rev: ask([...options].reverse()) };
}

/** The recommended hook's index, or null when Jev did not answer or no hook clearly leads. */
export function readHookPick(answers: Record<string, JevAnswer> | null, count: number): { index: number; p: number } | null {
  const f = answers?.pick_fwd?.probabilities;
  const r = answers?.pick_rev?.probabilities;
  if (!f || !r) return null;
  const avg = Array.from({ length: count }, (_, i) => ((f[LETTERS[i]] ?? 0) + (r[LETTERS[i]] ?? 0)) / 2);
  const order = avg.map((p, i) => ({ index: i, p: Math.round(p * 100) / 100 })).sort((a, b) => b.p - a.p);
  return order.length > 1 && Math.round((order[0].p - order[1].p) * 100) / 100 >= PICK_MARGIN ? order[0] : null;
}

// ---- Mode "idea" ------------------------------------------------------------

// Set from a shadow check on 2026-10-08 (jev-1.13.0): 16 briefs written for
// it, 8 with a specific true thing and 8 with only a subject or an angle, plus
// 3 in between. About 450 Jev input tokens a check.
/**
 * p(the idea has a specific) below this asks the one question first. With a
 * specific 0.91-0.98, subject only 0.03-0.23. In between: "a client asked if
 * riders are worth it" 0.48 and "I almost quit in my first year" 0.41 (asked),
 * "most clients under 30 have under a month saved" 0.66 (not asked).
 */
export const IDEA_MIN = 0.5;

export function ideaState(r: { topic: string; notes: string; kind: string }) {
  return { post_kind: r.kind || "a social post", topic: r.topic, notes: r.notes };
}

export const IDEA_QUESTIONS: Record<string, JevQuestion> = {
  specific: {
    type: "noul",
    instructions:
      "Do `topic` and `notes` already give one specific true thing to build the post on: something that happened, to whom, and what it cost or returned?",
    criteria: {
      true: "A concrete event or case: a client's situation with a detail such as an age, an amount, a date or what went wrong; a real question someone asked; the writer's own experience with a number or a moment.",
      false: "Only a subject or a general angle, such as 'CPF top-ups', 'why insurance matters' or '3 tips for fresh grads', with no event, person or number.",
    },
  },
};

/** True when the idea is thin (ask first), false when it has a specific, null without an answer. */
export function readIdeaThin(answers: Record<string, JevAnswer> | null): boolean | null {
  const p = answers?.specific?.noul;
  return typeof p === "number" && Number.isFinite(p) ? p < IDEA_MIN : null;
}
