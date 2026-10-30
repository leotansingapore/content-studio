// Pure logic for post-score: the predicted engagement score on a finished draft
// in Write. Jev answers five yes/no questions about the post; code weighs them
// into a score out of 10 and names what pulled it down. The tips are fixed copy
// here, never model-written. A carousel or a short-video script (edit-score) is
// asked the same five questions worded for its shape, with the same weights.
// No Deno or npm imports, so vitest covers it.

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

/** What is being scored. A request with no format is a text post, as every caller sent before edit-score. */
export const SCORE_FORMATS = ["text-post", "carousel", "short-video"] as const;
export type ScoreFormat = (typeof SCORE_FORMATS)[number];

export function parseScoreRequest(
  raw: unknown,
): { ok: true; text: string; platform: ScorePlatform; format: ScoreFormat } | { ok: false; error: string } {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (text.length < MIN_TEXT) return { ok: false, error: "Write a bit more before scoring it." };
  if (text.length > MAX_TEXT) return { ok: false, error: `Scores read posts up to ${MAX_TEXT.toLocaleString("en-US")} characters.` };
  const platform = PLATFORMS.find((p) => p === b.platform) ?? "instagram";
  const format = b.format === undefined || b.format === null ? "text-post" : SCORE_FORMATS.find((f) => f === b.format);
  if (!format) return { ok: false, error: "Scores read text posts, carousels and short-video scripts." };
  return { ok: true, text, platform, format };
}

/** Jev reads English best: a post mostly in another script is not scored. */
export function mostlyEnglish(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (!letters.length) return false;
  return letters.filter((c) => /[A-Za-z]/.test(c)).length / letters.length >= 0.8;
}

const FORMAT_NAMES: Record<Exclude<ScoreFormat, "text-post">, string> = { carousel: "carousel", "short-video": "short video script" };
/** A script's spoken label ("HOOK:", "**HOOK (0-3s):**", "[HOOK]"), so the hook question reads the words said. */
const HOOK_LABEL = /^\[?\s*hook\b[^:\]]*[:\]]\s*/i;

/**
 * The state Jev reads: the post, its first line and where it goes. A text post's state is today's, word for word
 * (pinned in fixtures/today.json); a carousel or script also says what it is, and a script's first line is its hook
 * with the label taken off.
 */
export function scoreState(text: string, platform: ScorePlatform, format: ScoreFormat = "text-post") {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (format === "text-post") return { platform: NAMES[platform], first_line: lines[0] ?? "", post: text };
  const said = format === "short-video" ? lines.map((l) => l.replace(/[*_#>]/g, "").trim().replace(HOOK_LABEL, "").trim()).filter(Boolean) : lines;
  return { platform: NAMES[platform], format: FORMAT_NAMES[format], first_line: said[0] ?? "", post: text };
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

const CTA_CRITERIA = { true: "A clear, specific next step: comment a word, send a DM, save it or book a call.", false: "No ask, or only a vague one such as 'let me know your thoughts'." };

/** The five questions worded for each shape. Same ids and weights, so composeScore, the cache and the colours hold. */
const FORMAT_QUESTIONS: Record<Exclude<ScoreFormat, "text-post">, Record<FactorId, JevQuestion>> = {
  carousel: {
    hook: {
      type: "noul",
      instructions: "Would the cover slide in `first_line` make someone scrolling `platform` stop and swipe to the next slide?",
      criteria: {
        true: "Specific and pulls the reader in on the cover itself: a number, a surprising claim, a tension or a question this reader cares about.",
        false: "Generic or slow: a bare topic title, a greeting, or a cover that could start any carousel.",
      },
    },
    oneIdea: {
      type: "noul",
      instructions: "Do the slides in `post` follow one clear idea, with one point per slide?",
      criteria: { true: "One main idea, each slide adding one point to it.", false: "Several separate ideas, or slides crammed with more than one point." },
    },
    specific: {
      type: "noul",
      instructions: "Does `post` give the viewer something concrete: a number, a real example, a short story, or a step they can take?",
      criteria: { true: "At least one concrete number, example, story or action.", false: "Only general advice or opinions." },
    },
    cta: { type: "noul", instructions: "Does the last slide or the caption in `post` ask the reader to do one specific thing next?", criteria: CTA_CRITERIA },
    readable: {
      type: "noul",
      instructions: "Can each slide in `post` be read in about 3 seconds on a phone: a short title and at most two short sentences?",
      criteria: { true: "A short title and one or two short sentences on every slide.", false: "Slides with long paragraphs or dense lists that take a while to read." },
    },
  },
  "short-video": {
    hook: {
      type: "noul",
      instructions: "Would the opening line in `first_line`, said in the first 3 seconds of a `platform` video, make someone keep watching?",
      criteria: {
        true: "Specific and pulls the viewer in from the first words: a number, a surprising claim, a tension or a question this viewer cares about.",
        false: "Generic, slow or throat-clearing: a greeting, an introduction, or an opening that could start any video.",
      },
    },
    oneIdea: {
      type: "noul",
      instructions: "Does the script in `post` stick to one clear idea from start to finish?",
      criteria: { true: "One main point that everything said supports.", false: "Several separate points or a list of loosely related tips." },
    },
    specific: {
      type: "noul",
      instructions: "Does `post` give the viewer something concrete: a number, a real example, a short story, or a step they can take?",
      criteria: { true: "At least one concrete number, example, story or action.", false: "Only general advice or opinions." },
    },
    cta: { type: "noul", instructions: "Does the script or caption in `post` end by asking the viewer to do one specific thing next?", criteria: CTA_CRITERIA },
    readable: {
      type: "noul",
      instructions: "Does the script in `post` move quickly, with no slow stretch, and end soon after its last point?",
      criteria: { true: "Every line moves it forward, and it ends soon after the last point.", false: "Slow stretches, repeated points, or a long wind-down after the last point." },
    },
  },
};

/** The questions for a format; a text post gets SCORE_QUESTIONS itself. */
export const scoreQuestions = (format: ScoreFormat = "text-post"): Record<FactorId, JevQuestion> =>
  format === "text-post" ? SCORE_QUESTIONS : FORMAT_QUESTIONS[format];

/** The fixed tip per factor for a carousel and a script; a text post keeps FACTORS' own. */
const FORMAT_TIPS: Record<Exclude<ScoreFormat, "text-post">, Record<FactorId, string>> = {
  carousel: {
    hook: "Put the number, the surprise or the question on the cover. The cover decides if anyone swipes.",
    oneIdea: "Keep the carousel to one idea, one point per slide.",
    specific: "Give one slide a number, a client story with no names, or a step they can take today.",
    cta: "End on a slide with one clear ask: comment a word, send you a DM, or save it.",
    readable: "Keep each slide to a short title and two short sentences at most.",
  },
  "short-video": {
    hook: "Say the number, the surprise or the question in the first 3 seconds, and put it on screen too.",
    oneIdea: "Keep the video to one idea. Give the other points their own videos.",
    specific: "Add one concrete thing: a number, a client story with no names, or a step they can take today.",
    cta: "End with one clear ask, said out loud and in the caption.",
    readable: "Cut the slow parts and end soon after the last point.",
  },
};

export const tipFor = (id: FactorId, format: ScoreFormat = "text-post"): string =>
  format === "text-post" ? FACTORS[id].tip : FORMAT_TIPS[format][id];

/** The factor's name; a script's readable reads "Easy to follow". */
export const labelFor = (id: FactorId, format: ScoreFormat = "text-post"): string =>
  id === "readable" && format === "short-video" ? "Easy to follow" : FACTORS[id].label;

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

// The LinkedIn post check ({check: "linkedin"}, everyone): the things a LinkedIn post that takes off has, from
// Christian Di Bratto's reel De9PijYAX9J, with the Ship or Revise verdict of his hattip-linkedin-os review (MIT).
// Jev answers eleven yes/no questions; the twelfth, relevant media, can't be read from the text, so Write shows it as
// a reminder. Code turns the answers into the verdict and the one fix to make first. Tips are fixed copy here.

/** The checks in the order a fix is worth making: the first one that misses is the fix. `must`: Ship needs it. */
export const LINKEDIN_CHECKS = {
  hook: { must: true, label: "First line", tip: "Rewrite the first line so a stranger needs the second one: a number, a surprising claim or the exact problem they have." },
  cold: { must: true, label: "Works for a stranger", tip: "Cut anything a stranger needs your earlier posts to follow, and say who it's for in the first two lines." },
  objection: { must: false, label: "Answers the doubt", tip: "Name the first 'yes, but' your reader will think, and answer it in one line." },
  doable: { must: false, label: "Doable today", tip: "Give one step the reader can take today, small enough to start before lunch." },
  saveable: { must: false, label: "Worth coming back to", tip: "Turn the middle into a list, steps or a framework someone would save to use later." },
  shareable: { must: false, label: "Worth sharing", tip: "Make it something your reader looks smart passing on: a clear rule, a fresh number or a sharp take." },
  topic: { must: false, label: "Big topic or exact result", tip: "Tie the point to something your whole market argues about, or promise one exact result." },
  tight: { must: false, label: "No longer than it's worth", tip: "Cut every line that doesn't add a new point, and stop when the value stops." },
  simple: { must: false, label: "Simple words", tip: "Swap long words for the ones you'd say out loud to a client." },
  skimmable: { must: false, label: "Easy to skim", tip: "Use short lines and white space, one idea per line, so it reads in a scroll." },
  flow: { must: false, label: "One line leads to the next", tip: "Make each line follow from the one before; add the 'so' or 'because' that's missing." },
} as const;
export type LinkedInCheckId = keyof typeof LINKEDIN_CHECKS;
export const LINKEDIN_CHECK_IDS = Object.keys(LINKEDIN_CHECKS) as LinkedInCheckId[];
/** The twelfth check, shown as a reminder: Jev reads only the words. */
export const LINKEDIN_MEDIA_TIP = "Add a picture that shows the first line's point: a screenshot, a photo of the work or a simple chart.";
/** Ship when every must passes and no more than this many others miss. */
export const LINKEDIN_SHIP_MISSES = 2;

const yesNo = (instructions: string, yes: string, no: string): JevQuestion => ({ type: "noul", instructions, criteria: { true: yes, false: no } });
export const LINKEDIN_QUESTIONS: Record<LinkedInCheckId, JevQuestion> = {
  hook: yesNo("Would `first_line` leave a LinkedIn reader no choice but to press 'see more' on `post`?",
    "Specific and pulls the reader in: a number, a surprising claim, a tension, a problem the reader knows they have, or a story already moving.",
    "Generic, slow or throat-clearing: a greeting, a vague statement, or an opening that could start any post."),
  cold: yesNo("Could a stranger who has never seen the writer before understand `post` and get value from it?",
    "Self-contained: no inside references, no 'as I said last week', the who and what are clear.",
    "Leans on earlier posts, inside jokes or context only followers have."),
  objection: yesNo("Does `post` answer the obvious objection a reader would raise to its main point?",
    "It names or answers the 'yes, but' a sceptical reader would think.",
    "It makes its point and leaves the obvious doubt unanswered."),
  doable: yesNo("After reading `post`, would the reader think 'I could do this today'?",
    "It gives a step, rule or change the reader can act on today.",
    "Only ideas, opinions or a story with nothing to do."),
  saveable: yesNo("Does `post` have something worth coming back to, such as a list, a process or a framework?",
    "A list, steps, a framework or a template a reader would save.",
    "Nothing a reader would need to come back to."),
  shareable: yesNo("Would sharing `post` make the person who shares it look good to their own network?",
    "Smart, useful or a sharp take someone would be proud to pass on.",
    "Too self-promotional, too niche or too thin to be worth sharing."),
  topic: yesNo("Does `post` cover a broad topic people in its field argue about, or promise one very concrete outcome?",
    "A topic with wide interest or debate, or a precise result the reader gets.",
    "A narrow or vague topic with no clear payoff."),
  tight: yesNo("Is `post` only as long as it is valuable, with no padding or repetition?",
    "Every line adds something; it stops when the value stops.",
    "Padding, repetition or a long build-up before the point."),
  simple: yesNo("Does `post` use simple words that anyone could understand?",
    "Plain, everyday words and short sentences.",
    "Jargon, long words or complicated sentences."),
  skimmable: yesNo("Is `post` formatted so it can be skimmed easily on a phone?",
    "Short lines, white space, one idea per line or a clear list.",
    "Long dense paragraphs that are hard to skim."),
  flow: yesNo("Does each sentence in `post` connect naturally to the next one?",
    "Each line follows from the one before, so the reader keeps going.",
    "Jumps between points, or lines that don't connect."),
};

/** What Jev reads for the LinkedIn check: the post and its first line. */
export function linkedInState(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return { platform: "LinkedIn", first_line: lines[0] ?? "", post: text };
}

export interface LinkedInCheck {
  verdict: "ship" | "revise";
  /** Checks Jev leaned yes on, out of LINKEDIN_CHECK_IDS.length. */
  passed: number;
  /** The ids Jev leaned no on, in fix order. */
  missed: LinkedInCheckId[];
  /** The one fix to make first, or null when nothing missed. */
  fix: LinkedInCheckId | null;
}

/** The verdict from Jev's yes probabilities. Null when any answer is missing, so a partial outage never ships a post. */
export function composeLinkedInCheck(probs: Partial<Record<LinkedInCheckId, number | null>>): LinkedInCheck | null {
  if (LINKEDIN_CHECK_IDS.some((id) => typeof probs[id] !== "number")) return null;
  const missed = LINKEDIN_CHECK_IDS.filter((id) => (probs[id] as number) < 0.5);
  const mustMissed = missed.some((id) => LINKEDIN_CHECKS[id].must);
  const verdict = !mustMissed && missed.length <= LINKEDIN_SHIP_MISSES ? "ship" : "revise";
  return { verdict, passed: LINKEDIN_CHECK_IDS.length - missed.length, missed, fix: missed[0] ?? null };
}

/** {check: "linkedin"} with a draft between MIN_TEXT and MAX_TEXT. */
export function parseLinkedInCheck(raw: unknown): { ok: true; text: string } | { ok: false; error: string } | null {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (b.check !== "linkedin") return null;
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (text.length < MIN_TEXT) return { ok: false, error: "Write a bit more before checking it." };
  if (text.length > MAX_TEXT) return { ok: false, error: `The check reads posts up to ${MAX_TEXT.toLocaleString("en-US")} characters.` };
  return { ok: true, text };
}
