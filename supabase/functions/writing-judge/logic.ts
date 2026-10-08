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
import { complianceIssues, parseJsonObject } from "../_shared/socialAudit.ts";

export { mostlyEnglish };

export const MIN_TEXT = 40;
export const MAX_TEXT = 5000;
/** Sentences judged one by one; a longer post has its first 40 checked. */
export const MAX_SENTENCES = 40;
const MAX_SAMPLES = 3;
const MAX_SAMPLE_CHARS = 1200;
export const MODES = ["human", "hooks", "idea", "profile", "carousel"] as const;
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
  | { mode: "idea"; topic: string; notes: string; kind: string }
  | { mode: "carousel"; idea: string }
  | ProfileRequest;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parseJudgeRequest(raw: unknown): { ok: true; request: JudgeRequest } | { ok: false; error: string } {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const mode = MODES.find((m) => m === b.mode);
  if (!mode) return { ok: false, error: "Unknown check." };
  if (mode === "profile") {
    const platform = b.platform === "tiktok" ? "tiktok" : "instagram";
    const list = (v: unknown, max: number) =>
      (Array.isArray(v) ? v : []).map((x) => str(x, max)).filter(Boolean).slice(0, 3);
    return {
      ok: true,
      request: {
        mode,
        platform,
        name: str(b.name, 100),
        bio: str(b.bio, 500),
        pinned: list(b.pinned, 400),
        top: list(b.top, 300),
        link: b.link === null || b.link === undefined ? null : str(b.link, 300),
      },
    };
  }
  if (mode === "carousel") {
    const idea = str(b.idea, 3000);
    if (idea.length < 3) return { ok: false, error: "Add a topic first." };
    return { ok: true, request: { mode, idea } };
  }
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

// ---- Mode "profile" ---------------------------------------------------------
// The consultant's own Instagram or TikTok profile out of 100, from what the
// account audit already read. Name field, bio and pinned posts are Jev score
// questions; the contact link is measured. The photo is not scored: Jev reads
// text only. Rubric after Jakeschincariol/linkedin-agent-skill li-profile,
// cut to what an Instagram or TikTok profile has.

export interface ProfileRequest {
  mode: "profile";
  platform: "instagram" | "tiktok";
  name: string;
  bio: string;
  /** Captions of the pinned posts. */
  pinned: string[];
  /** Captions of their best posts, context for the rewrites. */
  top: string[];
  /** The profile's link; null when the audit predates reading it. */
  link: string | null;
}

export const PROFILE_ITEMS = { name: 25, bio: 35, pinned: 20, contact: 20 } as const;
export type ProfileItemId = keyof typeof PROFILE_ITEMS;
/** Name and bio length limits, for the rewrites. */
export const PROFILE_LIMITS = { instagram: { name: 30, bio: 150 }, tiktok: { name: 30, bio: 80 } } as const;

const NAME_LEVELS = [
  "Only a personal name, a nickname or a handle.",
  "A name plus a job title or industry only, such as 'Jane Tan | Financial Consultant'.",
  "Says who they help or with what, such as 'Jane | Retirement plans for SG parents'.",
  "Says who they help and what changes for them, with a proof point such as years, clients helped or a credential.",
];
const BIO_LEVELS = [
  "Empty, or only a quote, emojis or personal hobbies.",
  "Describes the writer (job title, company, credentials) but not who they help.",
  "Says who they help and with what.",
  "Says who they help and what changes for them, gives one proof point, and tells the reader what to do next (DM, tap the link, book).",
];
const PINNED_LEVELS = [
  "Off-topic or personal posts that say nothing about the work.",
  "About the work, but generic tips with no proof and no way to get in touch.",
  "Shows the work with proof (a client story, a result, a number) or a clear way to work with them.",
  "Together they cover who they help, proof that it works, and how to work with them.",
];

export function profileState(r: ProfileRequest) {
  return {
    platform: r.platform === "tiktok" ? "TikTok" : "Instagram",
    role: "a financial consultant in Singapore",
    name: r.name,
    bio: r.bio,
    ...(r.pinned.length ? { pinned_posts: r.pinned } : {}),
  };
}

export function profileQuestions(r: ProfileRequest): Record<string, JevQuestion> {
  const q: Record<string, JevQuestion> = {
    name: {
      type: "score",
      instructions: "On `platform` the name field shows beside the photo and is searchable. How well does `name` tell a visitor what this consultant (`role`) does and for whom?",
      criteria: NAME_LEVELS,
    },
    bio: {
      type: "score",
      instructions: "How well does `bio` tell a first-time visitor who this consultant (`role`) helps, why to follow, and what to do next?",
      criteria: BIO_LEVELS,
    },
  };
  if (r.pinned.length) {
    q.pinned = {
      type: "score",
      instructions: "`pinned_posts` are the posts pinned to the top of this consultant's profile. How well do they show a first-time visitor who this consultant helps, proof that it works, and how to work with them?",
      criteria: PINNED_LEVELS,
    };
  }
  return q;
}

// Set from a shadow check on 2026-10-08 (jev-1.13.0) over 10 Instagram
// profiles written for it, from a bare name to a full one. About 800 Jev input
// tokens a score.
/**
 * A level counts once Jev's expected level is within this of it (1.5 rounds
 * up to 2). Expected levels sat near whole numbers: bare profiles 0.00-0.12,
 * title only 1.00-1.04, who they help 1.77-2.11, full 2.77-3.00; the
 * in-between pinned sets (1.34, 1.89) rounded to the level they read as.
 */
export const LEVEL_ROUND = 0.5;

/** A link, an email, a phone number or a WhatsApp or Telegram link in the bio counts as a way to reach them. */
const CONTACT_IN_BIO = /https?:\/\/|www\.|\b[\w.-]+\.(?:com|sg|me|ee|co|io|link|bio|page)\b|@[\w.-]+\.\w{2,}|wa\.me|t\.me|(?:\+65\s?)?\b[689]\d{3}\s?\d{4}\b/i;

export type ProfileItemState = "full" | "partial" | "none" | "unknown";
export interface ProfileItem {
  id: ProfileItemId;
  earned: number;
  points: number;
  state: ProfileItemState;
}
export interface ProfileScore {
  /** Out of 100, over the items that could be checked. */
  score: number;
  items: ProfileItem[];
  /** Rewrites the LLM wrote for the name and bio when they lost points. */
  rewrites: { name?: string; bio?: string };
}

function levelPoints(score: number | null, levels: number, points: number): number | null {
  if (score === null) return null;
  const level = Math.min(levels - 1, Math.max(0, Math.floor(score + LEVEL_ROUND)));
  return Math.round((level / (levels - 1)) * points);
}

/** The score out of 100 from Jev's levels and the measured contact link. Null when Jev did not answer. */
export function composeProfile(answers: Record<string, JevAnswer> | null, r: ProfileRequest): Omit<ProfileScore, "rewrites"> | null {
  const level = (id: string) => (typeof answers?.[id]?.score === "number" && Number.isFinite(answers[id].score) ? (answers[id].score as number) : null);
  const name = r.name ? levelPoints(level("name"), NAME_LEVELS.length, PROFILE_ITEMS.name) : 0;
  const bio = r.bio ? levelPoints(level("bio"), BIO_LEVELS.length, PROFILE_ITEMS.bio) : 0;
  const pinned = r.pinned.length ? levelPoints(level("pinned"), PINNED_LEVELS.length, PROFILE_ITEMS.pinned) : 0;
  if (name === null || bio === null || pinned === null) return null;
  const reachable = Boolean(r.link) || CONTACT_IN_BIO.test(r.bio);
  const contact = reachable ? PROFILE_ITEMS.contact : r.link === null ? null : 0;
  const item = (id: ProfileItemId, earned: number | null): ProfileItem => {
    const points = PROFILE_ITEMS[id];
    if (earned === null) return { id, earned: 0, points, state: "unknown" };
    return { id, earned, points, state: earned >= points ? "full" : earned > 0 ? "partial" : "none" };
  };
  const items = [item("name", name), item("bio", bio), item("pinned", pinned), item("contact", contact)];
  const counted = items.filter((i) => i.state !== "unknown");
  const possible = counted.reduce((a, i) => a + i.points, 0);
  const earned = counted.reduce((a, i) => a + i.earned, 0);
  return { score: possible ? Math.round((earned / possible) * 100) : 0, items };
}

/** The prompt for the name and bio rewrites, for the items that lost points. */
export function buildProfileRewritePrompt(r: ProfileRequest, want: ("name" | "bio")[]): { system: string; user: string } {
  const lim = PROFILE_LIMITS[r.platform];
  const platform = r.platform === "tiktok" ? "TikTok" : "Instagram";
  const system = [
    `You rewrite the profile of a financial consultant in Singapore on ${platform}.`,
    "Name field: keep their own name if they have one, then say who they help or with what.",
    "Bio: who they help, what changes for them, one proof point, and what to do next (DM, tap the link).",
    "Use only facts given here. Where a fact is missing, leave a blank in square brackets, like [years] or [number] families.",
    "Rules: no promised or guaranteed returns, no named insurers or products, no hashtags, no em dashes, plain words.",
    `Limits: name at most ${lim.name} characters, bio at most ${lim.bio} characters.`,
    `Reply with JSON only: {${want.map((w) => `"${w}": "..."`).join(", ")}}`,
  ].join("\n");
  const user = [
    `Name now: ${r.name || "(empty)"}`,
    `Bio now: ${r.bio || "(empty)"}`,
    r.top.length ? `Their best posts start:\n${r.top.map((t) => `- ${t.slice(0, 200)}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
  return { system, user };
}

/** The rewrites that are usable: within the limits, compliant, dashes made plain. */
export function readProfileRewrites(raw: string | null, r: ProfileRequest, want: ("name" | "bio")[]): ProfileScore["rewrites"] {
  const obj = raw ? parseJsonObject(raw) : null;
  const out: ProfileScore["rewrites"] = {};
  for (const id of want) {
    const v = typeof obj?.[id] === "string" ? (obj[id] as string).replace(/\s*[\u2014\u2013]\s*/g, ", ").trim() : "";
    if (v && v.length <= PROFILE_LIMITS[r.platform][id] && !complianceIssues(v).length) out[id] = v;
  }
  return out;
}

// ---- Mode "carousel" --------------------------------------------------------
// A carousel works when the idea has a sequence; one claim cut into slides is
// the usual way carousels fail, and it reads better as a text post. After
// Jakeschincariol/linkedin-agent-skill li-carousel "when to use it".

// Set from a shadow check on 2026-10-08 (jev-1.13.0): 14 carousel ideas
// written for it, 7 with a sequence and 7 that are one point. About 420 Jev
// input tokens a check.
/**
 * p(the idea has a sequence) below this suggests a text post instead. Steps,
 * lists, ages and before-and-after 0.91-0.98; one claim or story 0.06-0.31.
 */
export const SEQUENCE_MIN = 0.5;

export const CAROUSEL_QUESTIONS: Record<string, JevQuestion> = {
  sequence: {
    type: "noul",
    instructions: "Does `idea` have a sequence that suits a swipeable carousel of several slides: steps, a numbered list or countdown, a before-and-after progression, or a framework with parts?",
    criteria: {
      true: "Several distinct parts in an order, one per slide, such as '5 steps to claim from your hospital plan', '3 mistakes fresh grads make', or how something changes from age 55 to 65 to 70.",
      false: "One claim, opinion or story that would have to be cut into pieces across slides, such as 'insurance is not an investment' or 'my first client'.",
    },
  },
};

/** True when the idea would work better as a text post, null without an answer. */
export function readTextPostBetter(answers: Record<string, JevAnswer> | null): boolean | null {
  const p = answers?.sequence?.noul;
  return typeof p === "number" && Number.isFinite(p) ? p < SEQUENCE_MIN : null;
}
