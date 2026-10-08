// Pure logic for post-score: the predicted engagement score on a finished draft
// in Write. Jev answers five yes/no questions about the post; code weighs them
// into a score out of 10 and names what pulled it down. The tips are fixed copy
// here, never model-written. No Deno or npm imports, so vitest covers it.

import type { JevQuestion } from "../_shared/jev.ts";

export const MIN_TEXT = 40;
export const MAX_TEXT = 5000;
export const PLATFORMS = ["linkedin", "instagram", "facebook", "tiktok"] as const;
export type ScorePlatform = (typeof PLATFORMS)[number];
const NAMES: Record<ScorePlatform, string> = { linkedin: "LinkedIn", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };

/** What each check is worth (they add up to 10), its name, and the fix when it is missing. */
export const FACTORS = {
  hook: { weight: 3, label: "First line", tip: "Open with the number, the surprise or the question your reader is asking. The first line decides if anyone reads the second." },
  oneIdea: { weight: 2, label: "One idea", tip: "Keep it to one idea. Give the other points their own posts." },
  specific: { weight: 2, label: "Something concrete", tip: "Add one concrete thing: a number, a client story with no names, or a step they can take today." },
  cta: { weight: 1.5, label: "Clear ask", tip: "End with one clear ask: comment a word, send you a DM, or save the post." },
  readable: { weight: 1.5, label: "Easy to read", tip: "Break it into short lines of one or two sentences, and cut what the platform won't show without a tap." },
} as const;
export type FactorId = keyof typeof FACTORS;
export const FACTOR_IDS = Object.keys(FACTORS) as FactorId[];

export function parseScoreRequest(raw: unknown): { ok: true; text: string; platform: ScorePlatform } | { ok: false; error: string } {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (text.length < MIN_TEXT) return { ok: false, error: "Write a bit more before scoring it." };
  if (text.length > MAX_TEXT) return { ok: false, error: `Scores read posts up to ${MAX_TEXT.toLocaleString("en-US")} characters.` };
  const platform = PLATFORMS.find((p) => p === b.platform) ?? "instagram";
  return { ok: true, text, platform };
}

/** Jev reads English best: a post mostly in another script is not scored. */
export function mostlyEnglish(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (!letters.length) return false;
  return letters.filter((c) => /[A-Za-z]/.test(c)).length / letters.length >= 0.8;
}

/** The state Jev reads: the post, its first line and where it goes. */
export function scoreState(text: string, platform: ScorePlatform) {
  return { platform: NAMES[platform], first_line: text.split("\n").find((l) => l.trim())?.trim() ?? "", post: text };
}

export const SCORE_QUESTIONS: Record<FactorId, JevQuestion> = {
  hook: {
    type: "noul",
    instructions: "Would `first_line` make someone scrolling `platform` stop and read the rest of `post`?",
    criteria: {
      true: "Specific and pulls the reader in: a number, a surprising claim, a tension, a question this reader cares about, or a story already in motion.",
      false: "Generic, slow or throat-clearing: a greeting, a vague statement, or an opening that could start any post.",
    },
  },
  oneIdea: {
    type: "noul",
    instructions: "Does `post` stick to one clear idea from start to finish?",
    criteria: { true: "One main point that everything supports.", false: "Several separate points or a list of loosely related tips." },
  },
  specific: {
    type: "noul",
    instructions: "Does `post` give the reader something concrete: a number, a real example, a short story, or a step they can take?",
    criteria: { true: "At least one concrete number, example, story or action.", false: "Only general advice or opinions." },
  },
  cta: {
    type: "noul",
    instructions: "Does `post` end by asking the reader to do one specific thing next, such as comment a word, send a DM, save the post or book a call?",
    criteria: { true: "A clear, specific next step for the reader.", false: "No ask, or only a vague one such as 'let me know your thoughts'." },
  },
  readable: {
    type: "noul",
    instructions: "Is `post` easy to read on a phone on `platform`: short paragraphs and lines, and a length that suits `platform`?",
    criteria: { true: "Short lines and paragraphs, a length that fits the platform.", false: "Dense blocks of text, or far too long or too short for the platform." },
  },
};

export interface PostScore {
  /** Out of 10, one decimal. */
  score: number;
  /** What pulled it down most, worst first (2-3 at most). */
  down: FactorId[];
}

/** The weighted score and what cost it the most. Null when any answer is missing. */
export function composeScore(probs: Partial<Record<FactorId, number | null>>): PostScore | null {
  if (FACTOR_IDS.some((id) => typeof probs[id] !== "number")) return null;
  const p = probs as Record<FactorId, number>;
  const score = Math.round(FACTOR_IDS.reduce((s, id) => s + FACTORS[id].weight * p[id], 0) * 10) / 10;
  // what Jev leans no on, costliest first; topped up to two with the doubtful ones (under 0.75)
  const costliest = [...FACTOR_IDS].sort((a, b) => FACTORS[b].weight * (1 - p[b]) - FACTORS[a].weight * (1 - p[a]));
  const no = costliest.filter((id) => p[id] < 0.5);
  const doubtful = costliest.filter((id) => p[id] >= 0.5 && p[id] < 0.75);
  return { score, down: [...no, ...doubtful.slice(0, Math.max(0, 2 - no.length))].slice(0, 3) };
}
