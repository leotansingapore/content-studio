// The "sounds human" check on a draft in Write: five checks. Three are
// measured here, never judged (sentence variety, stock words, typography); two
// are Jev's judgments from the writing-judge edge function (a real specific;
// voice: does it read as AI-written, and with saved voice posts, does it sound
// like them). Plus the AI sentence shapes Jev flags, for rewriting.

import { callFn } from "@/lib/edgeFn";
import { scanAiTells } from "@/lib/plainText";
import {
  SHAPES,
  mostlyEnglish,
  splitSentences,
  type HumanJudgment,
  type ShapeId,
} from "../../supabase/functions/writing-judge/logic.ts";

export { SHAPES, mostlyEnglish, type HumanJudgment, type ShapeId };

// Measured thresholds, from the same 20 drafts as the Jev ones (logic.ts).
/**
 * Spread of sentence lengths (standard deviation over mean, sentences of 3+
 * words) below this fails variety. Human drafts 0.29-0.66, AI style 0.19-0.49:
 * in posts this short spread alone does not tell them apart, so it fails only
 * a draft where nearly every sentence is the same length (0.22 is the machine
 * end in the reference's detect.py).
 */
export const SPREAD_MIN = 0.25;
/** Fewer than 4 sentences of 3+ words is too short to judge variety. */
export const SPREAD_MIN_SENTENCES = 4;
/** Any stock word from Clean AI tells' fixed list fails: human drafts had 0, AI style 1-5. */
export const STOCK_MAX = 0;

export type CheckId = "voice" | "specifics" | "variety" | "stock" | "typography";
/** Fix-first order when several fail: the judged ones change the post most, the last two are one tap. */
export const CHECK_ORDER: CheckId[] = ["voice", "specifics", "variety", "stock", "typography"];

export interface Measured {
  /** Null when too short to judge. */
  spread: number | null;
  words: string[];
  typography: number;
}

export function measure(text: string): Measured {
  const lens = splitSentences(text)
    .map((s) => s.split(/\s+/).filter(Boolean).length)
    .filter((n) => n > 2);
  let spread: number | null = null;
  if (lens.length >= SPREAD_MIN_SENTENCES) {
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
    spread = Math.round((sd / mean) * 100) / 100;
  }
  const { words, typography } = scanAiTells(text);
  return { spread, words, typography };
}

export type CheckState = "pass" | "fix" | "skip";
export interface Check {
  id: CheckId;
  label: string;
  state: CheckState;
  /** What was found, short. */
  note: string;
  /** How to fix it, when it fails. */
  tip: string;
}

export interface HumanResult {
  checks: Check[];
  passed: number;
  /** Checks that ran (a skipped one is not counted). */
  counted: number;
  fixFirst: CheckId | null;
  shapes: HumanJudgment["shapes"];
  /** Why the judged checks were skipped, when they were. */
  skipped: string | null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The five checks from what was measured and what Jev judged (null when Jev did not answer). */
export function composeChecks(m: Measured, j: HumanJudgment | null, skipped: string | null = null): HumanResult {
  const judged = (v: boolean | null | undefined) => (j && typeof v === "boolean" ? v : null);
  const ai = judged(j?.aiSounding);
  const voice = judged(j?.voiceMatch);
  const specific = judged(j?.specific);

  const voiceState: CheckState = ai === null ? "skip" : ai || voice === false ? "fix" : "pass";
  const checks: Record<CheckId, Check> = {
    voice: {
      id: "voice",
      label: "Voice",
      state: voiceState,
      note: ai === null ? "Not checked" : ai ? "Reads as AI-written" : voice === false ? "Doesn't sound like your saved posts" : "Sounds like a person",
      tip: voice === false && !ai
        ? "Put back the words and rhythm of your saved posts. Read it aloud and change any line you wouldn't say."
        : "Read it aloud and rewrite any line you wouldn't say to a client. Add one phrase you use all the time.",
    },
    specifics: {
      id: "specifics",
      label: "Specifics",
      state: specific === null ? "skip" : specific ? "pass" : "fix",
      note: specific === null ? "Not checked" : specific ? "Has a real detail" : "No real detail",
      tip: "Add one real detail: a number, a place, or what happened to a client (no names).",
    },
    variety: {
      id: "variety",
      label: "Sentence variety",
      state: m.spread === null ? "skip" : m.spread >= SPREAD_MIN ? "pass" : "fix",
      note: m.spread === null ? "Too short to judge" : m.spread >= SPREAD_MIN ? "Lengths vary" : "Sentences all the same length",
      tip: "Cut one sentence down to three or four words, and let another run long.",
    },
    stock: {
      id: "stock",
      label: "Stock words",
      state: m.words.length > STOCK_MAX ? "fix" : "pass",
      note: m.words.length ? [...new Set(m.words)].slice(0, 4).join(", ") : "None",
      tip: "Clean AI tells swaps them for plain words.",
    },
    typography: {
      id: "typography",
      label: "Typography",
      state: m.typography > 0 ? "fix" : "pass",
      note: m.typography ? `${plural(m.typography, "curly quote, dash or hidden character", "curly quotes, dashes or hidden characters")}` : "Plain",
      tip: "Clean AI tells makes them plain.",
    },
  };
  const list = CHECK_ORDER.map((id) => checks[id]);
  const counted = list.filter((c) => c.state !== "skip").length;
  return {
    checks: list,
    passed: list.filter((c) => c.state === "pass").length,
    counted,
    fixFirst: list.find((c) => c.state === "fix")?.id ?? null,
    shapes: j?.shapes ?? [],
    skipped,
  };
}

/** Jev's half of the check, from the writing-judge edge function. */
export async function judgeHuman(text: string, samples: string[]): Promise<HumanJudgment> {
  const res = await callFn<HumanJudgment>("writing-judge", { mode: "human", text, samples }, "Couldn't check it right now. Try again in a minute.");
  if (!res || !Array.isArray(res.shapes)) throw new Error("Couldn't check it right now. Try again in a minute.");
  return res;
}

export { splitSentences };
