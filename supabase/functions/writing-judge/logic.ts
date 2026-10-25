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
import { TAG_MIN } from "../_shared/tags.ts";
import { FORMULAS } from "../remix-patterns/logic.ts";

export { mostlyEnglish };

export const MIN_TEXT = 40;
export const MAX_TEXT = 5000;
/** Sentences judged one by one; a longer post has its first 40 checked. */
export const MAX_SENTENCES = 40;
const MAX_SAMPLES = 3;
const MAX_SAMPLE_CHARS = 1200;
/** Phase 7's reads of posts already out (learn-real-numbers, learn-post-grade, learn-format-winners, remix-own-winners). */
export const POST_MODES = ["same-post", "grade", "tags", "try-next", "evergreen"] as const;
export const MODES = ["human", "hooks", "idea", "profile", "carousel", "facts", "thread", "design", "conflict", "goal", ...POST_MODES] as const;
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
  | { mode: "facts"; text: string }
  | { mode: "thread"; post: string }
  | { mode: "design"; slides: { title: string; body: string }[] }
  | { mode: "conflict"; note: string; notes: string[] }
  | { mode: "goal"; text: string }
  | SamePostRequest
  | GradeRequest
  | TagsRequest
  | TryNextRequest
  | { mode: "evergreen"; text: string }
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
  if (mode === "thread") {
    const post = typeof b.post === "string" ? b.post.trim() : "";
    if (post.length < MIN_TEXT) return { ok: false, error: "Write a bit more before checking it." };
    if (post.length > MAX_TEXT) return { ok: false, error: `Checks read posts up to ${MAX_TEXT.toLocaleString("en-US")} characters.` };
    return { ok: true, request: { mode, post } };
  }
  if (mode === "design") {
    const raw = Array.isArray(b.slides) ? b.slides : [];
    if (raw.length < DESIGN_SLIDES.min || raw.length > DESIGN_SLIDES.max || raw.some((x) => !x || typeof x !== "object")) {
      return { ok: false, error: `Send ${DESIGN_SLIDES.min} to ${DESIGN_SLIDES.max} slides.` };
    }
    const slides = raw.map((x: Record<string, unknown>) => ({ title: str(x.title, 200), body: str(x.body, 600) }));
    if (slides.reduce((n, x) => n + x.title.length + x.body.length, 0) < MIN_TEXT) return { ok: false, error: "Add some text to the slides first." };
    return { ok: true, request: { mode, slides } };
  }
  if (mode === "conflict") {
    const note = str(b.note, CONFLICT_NOTE);
    if (!note) return { ok: false, error: "Add a note first." };
    const raw = Array.isArray(b.notes) ? b.notes : [];
    const notes = raw.map((x) => str(x, CONFLICT_NOTE));
    if (!notes.length || notes.length > MAX_CONFLICT_NOTES || notes.some((x) => !x)) return { ok: false, error: `Send 1 to ${MAX_CONFLICT_NOTES} notes.` };
    return { ok: true, request: { mode, note, notes } };
  }
  if (mode === "goal") {
    // its own length check: MIN_TEXT's 40 characters would refuse most goals
    const text = typeof b.text === "string" ? b.text.trim() : "";
    if (text.length < GOAL_TEXT.min) return { ok: false, error: "Write a few more words." };
    if (text.length > GOAL_TEXT.max) return { ok: false, error: `Keep the goal to ${GOAL_TEXT.max} characters.` };
    return { ok: true, request: { mode, text } };
  }
  if (mode === "same-post") return parseSamePost(b);
  if (mode === "grade") return parseGrade(b);
  if (mode === "tags") return parseTags(b);
  if (mode === "try-next") return parseTryNext(b);
  if (mode === "evergreen") {
    const text = str(b.text, MAX_TEXT);
    if (text.length < POST_TEXT_MIN) return { ok: false, error: "Nothing to read yet." };
    return { ok: true, request: { mode, text } };
  }
  if (mode === "facts") {
    const text = str(b.text, MAX_TEXT);
    if (text.length < 20) return { ok: false, error: "Nothing to check yet." };
    return { ok: true, request: { mode, text } };
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

/** The kind the interview sends with each answer (src/lib/interview.ts THIN_KIND; a test keeps the two equal). */
export const INTERVIEW_KIND = "an interview answer for a social post";

/**
 * An interview answer is read on whether a post can be built on it, story or not (wave 2 live check, 22 Oct: the
 * question above read 37 words of concrete advice and a 27-word opinion at p 0.03 and 0.05, so 3 of 5 answers got the
 * follow-up). Same id, so readIdeaThin reads it.
 * shortcut: IDEA_MIN 0.5 is a proposal for this question, not set from real answers; read the logged { kind, p }.
 */
export const INTERVIEW_QUESTIONS: Record<string, JevQuestion> = {
  specific: {
    type: "noul",
    instructions:
      "Does `notes`, an answer to the interview question in `topic`, give the writer something specific to build a post on: a fact, a number, an opinion with a reason, an example, or a story?",
    criteria: {
      true: "Something a post can stand on: a concrete step or piece of advice, a fact or a number, an opinion with the reason behind it, an example, or something that happened.",
      false: "Too short or general to build on: a one-line truism such as 'people should plan earlier', a bare subject, or a yes or no with nothing behind it.",
    },
  },
};

/** The interview's question for its answers; every other kind (Write's included) gets IDEA_QUESTIONS as before. */
export const ideaQuestions = (kind: string) => (kind === INTERVIEW_KIND ? INTERVIEW_QUESTIONS : IDEA_QUESTIONS);

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

// ---- Mode "thread" (formats-text-threads, Leo only) ---------------------------
// Whether a finished post would read better on Threads as a chain of short
// posts. A hint beside "Make it a thread" only: the button is always there.

/**
 * p(it reads better as a thread) at or above this shows "Reads well as a thread". Proposed (phase 3 decision 11),
 * not yet set from a shadow run: the integrator reads Leo's last 50 text posts and every answer within 0.15 of it.
 */
export const THREAD_YES = 0.6;

export const THREAD_QUESTIONS: Record<string, JevQuestion> = {
  thread: {
    type: "noul",
    instructions:
      "This is a social media post by a Singapore financial adviser. Would it read better on Threads as a chain of 3 to 8 short posts than as one post? Yes when it has several separate points, steps or examples that each stand on their own; no when it is one short thought or one story that needs to be read in one piece.",
    criteria: {
      true: "Several separate points, steps or examples that each stand on their own.",
      false: "One short thought, or one story that needs to be read in one piece.",
    },
  },
};

/** Jev's yes for "reads better as a thread", or null without an answer (no tag). */
export function readThreadYes(answers: Record<string, JevAnswer> | null): number | null {
  const p = answers?.thread?.noul;
  return typeof p === "number" && Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : null;
}

// ---- Mode "design" (formats-carousel-designs, Leo only) ----------------------
// Which of the carousel maker's eight designs suits a carousel's slides. A "Recommended" tag on the Design
// row only: every design stays one press away.

/** The carousel designs, the same ids and order as src/lib/links.ts CAROUSEL_DESIGNS (asserted by logic.test.ts). */
export const DESIGN_IDS = ["clean", "bold", "numbered", "checklist", "post-card", "photo-cover", "quote", "notebook"] as const;
export type DesignId = (typeof DESIGN_IDS)[number];
export const DESIGN_SLIDES = { min: 2, max: 10 } as const;

/**
 * Jev's pick is tagged "Recommended" at or above this. Proposed (phase 3 decision 11), not yet set from a
 * shadow run: the integrator reads Leo's last 30 carousels and every pick within 0.15 of it.
 */
export const DESIGN_MIN = 0.4;

export function designState(slides: { title: string; body: string }[]) {
  return { slides: slides.map((s, i) => `Slide ${i + 1}: ${[s.title, s.body].filter(Boolean).join("\n")}`).join("\n\n") };
}

export const DESIGN_QUESTIONS: Record<string, JevQuestion> = {
  design: {
    type: "choice",
    instructions: "These are the `slides` of an Instagram or LinkedIn carousel by a Singapore financial adviser. Which slide design suits this content best?",
    criteria: {
      clean: "general advice in short paragraphs",
      numbered: "a list of separate tips or reasons",
      checklist: "steps or things to check off",
      "post-card": "a personal opinion or story told in first person",
      quote: "one strong statement or a quotation",
      bold: "a short punchy list with a provocative hook",
      "photo-cover": "a story about a place, a person or a moment",
      notebook: "a lesson or explanation with some detail",
    },
  },
};

/** Jev's likeliest design and its probability; pick is null below DESIGN_MIN, and both are null with no answer. */
export function readDesignPick(answers: Record<string, JevAnswer> | null): { pick: DesignId | null; p: number | null } {
  const probs = answers?.design?.probabilities;
  if (!probs || typeof probs !== "object") return { pick: null, p: null };
  let best: DesignId | null = null;
  let top = -1;
  for (const id of DESIGN_IDS) {
    const p = probs[id];
    if (typeof p === "number" && Number.isFinite(p) && p > top) {
      best = id;
      top = p;
    }
  }
  if (!best) return { pick: null, p: null };
  const p = Math.round(Math.min(1, Math.max(0, top)) * 100) / 100;
  return { pick: p >= DESIGN_MIN ? best : null, p };
}

// ---- Mode "facts" -----------------------------------------------------------
// Sentences that state a checkable fact about CPF, SRS, HDB, MediShield Life,
// insurance rules, government schemes, rates or caps, flagged so the
// consultant checks them before posting. It never rewrites or blocks.

// Set from a shadow check on 2026-10-08 (jev-1.13.0): 22 sentences written for
// it in one request, 12 checkable facts (one wrong on purpose, one that needs
// the sentence before it) and 10 opinions, stories, questions and asks. About
// 230 Jev input tokens a sentence.
/**
 * p(the sentence states a checkable fact) at or above this flags it. Facts
 * 0.82-0.97 ("most hospital claims are paid within 2 weeks" the lowest),
 * everything else 0.03-0.05, and "your SA is not like a savings account" 0.29.
 */
export const FACT_MIN = 0.5;

export function factQuestions(sentences: string[]): Record<string, JevQuestion> {
  return Object.fromEntries(
    sentences.map((s, i) => [
      `fact_${i}`,
      {
        type: "noul",
        instructions: {
          sentence: s,
          sentence_before: i > 0 ? sentences[i - 1] : "",
          question:
            "Does `sentence` (read with `sentence_before` for context) state a checkable fact about CPF, SRS, HDB, MediShield Life, insurance rules, a government scheme, an interest rate, a payout, or a limit or cap in Singapore?",
        },
        criteria: {
          true: "A specific claim that could be right or wrong: a rate (SA earns 4%), an amount or cap ($8,000 tax relief), an age rule (CPF LIFE starts at 65), what a scheme or policy covers, how a rule works.",
          false: "An opinion, a story about a client or the writer, a question, advice, an ask, or a general statement that cannot be checked.",
        },
      } satisfies JevQuestion,
    ]),
  );
}

/** The sentences to check before posting, in order. Null when Jev did not answer. */
export function readFacts(answers: Record<string, JevAnswer> | null, sentences: string[]): string[] | null {
  if (!answers) return null;
  return sentences.filter((_, i) => {
    const p = answers[`fact_${i}`]?.noul;
    return typeof p === "number" && p >= FACT_MIN;
  });
}

// ---- Mode "conflict" (brand-voice-memory, Leo only) -------------------------
// Whether a new standing note to the AI ("use lots of emoji", "one emoji at
// most") changes one already kept ("never use emoji"): reverses, loosens,
// tightens or narrows it, so the assistant's card can say which one it
// replaces. One yes/no per kept note, in one request.

/** A note, and each kept note, at most this long (the learnings' own limit). */
export const CONFLICT_NOTE = 140;
/** The most kept notes compared in one check (the learnings' active limit). */
export const MAX_CONFLICT_NOTES = 30;
// shortcut: threshold not read off real notes; set it from a side-by-side run of 30 real pairs
/** p(the new note changes the kept note's rule) at or above this names the note it replaces. */
export const CONFLICT_MIN = 0.7;

export function conflictQuestions(note: string, notes: string[]): Record<string, JevQuestion> {
  return Object.fromEntries(
    notes.map((old, i) => [
      `conflict_${i}`,
      {
        type: "noul",
        instructions: {
          new_note: note,
          old_note: old,
          question: "Does `new_note` change the rule in `old_note`, by reversing it, loosening or tightening it, or narrowing or widening where it applies?",
        },
        criteria: {
          true: "The new note is another version of the old note's rule on the same thing: its opposite ('use emoji' after 'never use emoji'), a looser or stricter limit ('one emoji at most' after 'no emoji', 'up to 5 hashtags' after 'no hashtags') or the same rule for fewer or more places ('no emoji on LinkedIn' after 'never use emoji').",
          false: "They are about different things, or the new note says the same as the old one.",
        },
      } satisfies JevQuestion,
    ]),
  );
}

/** The kept note the new one replaces: the highest yes at or above CONFLICT_MIN, else null (and null without an answer). */
export function readConflict(answers: Record<string, JevAnswer> | null, count: number): number | null {
  let best: number | null = null;
  let top = CONFLICT_MIN;
  for (let i = 0; i < count; i++) {
    const p = answers?.[`conflict_${i}`]?.noul;
    if (typeof p === "number" && Number.isFinite(p) && p >= top) {
      best = i;
      top = p;
    }
  }
  return best;
}

// ---- Mode "goal" (plan-goal, Leo only) ----------------------------------------
// Which of the five outcomes a typed goal is closest to, so plans and campaigns
// can weight the funnel toward it. A picked chip never asks: only typed goals.

export const GOAL_TEXT = { min: 4, max: 120 } as const;
/** The same five kinds as src/lib/positioning.ts GoalKind. */
export const GOAL_KINDS = ["clients", "audience", "trust", "recruit", "time"] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];
// shortcut: proposed (phase 5 decision 12), not read off real goals; the integrator reads every logged { kind, p }
// within 0.15 of it after the first 20 typed goals and sets it in one commit.
/** Jev's pick is used at or above this; below it the app asks "Which of these is closest?". */
export const JEV_GOAL_MIN = 0.6;

export const goalState = (text: string) => ({ goal: text, country: "Singapore", who: "a financial adviser or a small business that posts on social media" });

export const GOAL_QUESTIONS: Record<string, JevQuestion> = {
  kind: {
    type: "choice",
    instructions: "Which outcome does `who` most want from posting, going by `goal`?",
    criteria: {
      clients: "new clients, enquiries, appointments, leads or sales",
      audience: "more followers, reach, views or being known in a niche",
      trust: "existing clients and followers trusting them more, staying in touch or sending referrals",
      recruit: "recruiting people to join their team, agency or business",
      time: "posting regularly with less effort, time or stress",
    },
  },
};

/** Jev's likeliest kind and its probability (two decimals) whatever the cut, for the log; nulls without an answer or an unknown kind. */
export function goalTop(answers: Record<string, JevAnswer> | null): { kind: GoalKind | null; p: number | null } {
  const kind = GOAL_KINDS.find((k) => k === answers?.kind?.choice) ?? null;
  const p = kind ? answers?.kind?.probabilities?.[kind] : undefined;
  if (!kind || typeof p !== "number" || !Number.isFinite(p)) return { kind: null, p: null };
  return { kind, p: Math.round(Math.min(1, Math.max(0, p)) * 100) / 100 };
}

/** The answer the app gets: the kind only at JEV_GOAL_MIN or more, with its probability either way. */
export function goalPick(answers: Record<string, JevAnswer> | null): { kind: GoalKind | null; p: number | null } {
  const top = goalTop(answers);
  return { kind: top.p !== null && top.p >= JEV_GOAL_MIN ? top.kind : null, p: top.p };
}

// ---- Posts already out (north star phase 7, Leo only) ----------------------------------------------
// Five reads of posts an adviser has published: is a pulled post the same as a draft (same-post), why a post did
// better or worse than usual (grade), each post's angle and hook (tags), which untried hooks suit them (try-next),
// and whether a winner can be told again next month (evergreen). Each is 403 not_enabled off NORTH_STAR_USERS
// before anything is counted, counts its own cap, and gives the use back when Jev never answered. The batch modes
// (same-post, tags) and try-next skip the whole-request English check and read each post on its own instead.

/** A posted post is read from this many characters (a short caption is still a post). */
export const POST_TEXT_MIN = 10;

const NETWORKS: Record<string, string> = {
  linkedin: "LinkedIn", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", threads: "Threads", youtube: "YouTube", x: "X",
};
const networkName = (platform: string) => NETWORKS[platform.toLowerCase()] ?? platform;
const round2 = (p: number) => Math.round(Math.min(1, Math.max(0, p)) * 100) / 100;
/** Jev's probability as it came back: every cut compares this, so 0.699 stays under 0.7. */
const rawP = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** The same, rounded to two decimals for the answer and the log. */
const prob = (v: unknown): number | null => (rawP(v) === null ? null : round2(v as number));

/** English function words: Malay, Indonesian and Tagalog are Latin letters, so mostlyEnglish passes them. */
const EN_WORDS = new Set(
  ("the a an and or but to of in on for with is are was were be been it its this that these those you your i my me we our us " +
    "they their them he she his her not no do does did don't have has had will would can could should if so at from as what " +
    "how when why who about just more all than then there here up out by").split(" "),
);
/** Below this many words (hashtags, handles and links left out) the share says too little, and mostlyEnglish decides. */
const EN_WORDS_FLOOR = 12;
/**
 * The share of words that are English function words at or above this reads as English. Measured 25 Oct 2026 over
 * the 115 bundled captions, ads and news items with 12 or more words (src/data): the lowest English one was 0.125
 * (a terse WhatsApp ad), the median 0.38; four Malay adviser posts written for it were 0.00.
 */
export const EN_WORDS_MIN = 0.06;

/** mostlyEnglish, plus a measured share of English function words, so a Malay post is not read as English. */
export function readsEnglish(text: string): boolean {
  if (!mostlyEnglish(text)) return false;
  const words = text.toLowerCase().replace(/https?:\/\/\S+|www\.\S+|[#@][\w.]+/g, " ").match(/[a-z]+(?:['’][a-z]+)?/g) ?? [];
  if (words.length < EN_WORDS_FLOOR) return true;
  return words.filter((w) => EN_WORDS.has(w.replace("’", "'"))).length / words.length >= EN_WORDS_MIN;
}

/** The first line with text on it. */
const firstLine = (text: string) => text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";

// ---- Mode "same-post" (learn-real-numbers) ----

export const MAX_PAIRS = 10;
export interface SamePostRequest {
  mode: "same-post";
  /** One pulled post (`live`, all 300 characters Zernio keeps) against one draft (its first 600). */
  pairs: { key: string; draft: string; live: string; platform: string }[];
}
// shortcut: proposed (phase 7 decision 10), not read off real pairs; the integrator reads every logged p within 0.15
// of it after the first 20 real runs and sets it in one commit.
/** p(the pulled post is the published draft) at or above this links them, when no other draft clears it for that post. */
export const SAME_POST_MIN = 0.7;

function parseSamePost(b: Record<string, unknown>): { ok: true; request: SamePostRequest } | { ok: false; error: string } {
  const raw = Array.isArray(b.pairs) ? b.pairs : [];
  const pairs = raw.map((x) => {
    const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    return { key: str(o.key, 80), draft: str(o.draft, 600), live: str(o.live, 300), platform: str(o.platform, 20) };
  });
  const keys = new Set(pairs.map((p) => p.key));
  if (!pairs.length || pairs.length > MAX_PAIRS || keys.size !== pairs.length || pairs.some((p) => !p.key || !p.draft || !p.live)) {
    return { ok: false, error: `Send 1 to ${MAX_PAIRS} pairs, each with a key, a draft and a live post.` };
  }
  return { ok: true, request: { mode: "same-post", pairs } };
}

/** One yes/no per pair, both halves in its instructions; a pair with a half not in English gets no question. */
export function samePostQuestions(pairs: SamePostRequest["pairs"]): Record<string, JevQuestion> {
  return Object.fromEntries(
    pairs.flatMap((p, i) =>
      readsEnglish(p.draft) && readsEnglish(p.live)
        ? [[
            `same_${i}`,
            {
              type: "noul",
              instructions: {
                platform: networkName(p.platform),
                draft: p.draft,
                live: p.live,
                question: "Is `live` the published version of `draft`, the same post with at most light edits such as added hashtags, a sign-off or a changed line?",
              },
              criteria: {
                true: "Yes: same topic, same points in the same order, mostly the same sentences.",
                false: "No: a different post, even if it covers the same subject.",
              },
            } satisfies JevQuestion,
          ]]
        : [],
    ),
  );
}

/**
 * Jev's p per key (null with no question or no answer) and the keys that link: at SAME_POST_MIN or more, and the
 * only pair for that pulled post (the same `live` text) that clears it.
 */
export function readSamePost(answers: Record<string, JevAnswer> | null, pairs: SamePostRequest["pairs"]): { links: string[]; p: Record<string, number | null> } {
  const raw = pairs.map((_, i) => rawP(answers?.[`same_${i}`]?.noul));
  const ps = raw.map(prob);
  const clears = (i: number) => (raw[i] ?? -1) >= SAME_POST_MIN;
  const links = pairs.filter((x, i) => clears(i) && pairs.every((y, j) => j === i || y.live !== x.live || !clears(j))).map((x) => x.key);
  return { links, p: Object.fromEntries(pairs.map((x, i) => [x.key, ps[i]])) };
}

// ---- Mode "grade" (learn-post-grade) ----

export const GRADE_REASONS = ["hook", "topic", "format", "timing", "ask"] as const;
export type GradeReason = (typeof GRADE_REASONS)[number];
export const GRADE_CRITERIA: Record<GradeReason, string> = {
  hook: "The opening line: how strongly the first line makes someone stop, compared with the openings of their best posts.",
  topic: "The subject: how much this topic matters to their audience compared with their usual topics.",
  format: "The format or length: whether a post of this kind and length suits this network.",
  timing: "When it went out: the day and time compared with when their best posts went out.",
  ask: "The ending: whether it gave readers a clear, easy reason to comment, save or message.",
};
// shortcut: proposed (phase 7 decision 10; a 5-way random pick sits at 0.2), not read off real posts; the integrator
// reads every logged p within 0.15 of it after the first 20 real runs and sets it in one commit.
/** Jev's reason is shown at or above this probability. */
export const GRADE_MIN = 0.4;
export const GRADE_TEXT = 1500;
export const MAX_BEST = 3;

export interface GradeRequest {
  mode: "grade";
  text: string;
  platform: string;
  format: string;
  /** When it went out, as the app has it (ISO). */
  posted: string;
  words: number;
  /** Its engagements over the usual, unrounded. */
  ratio: number;
  direction: "above" | "below";
  best: { firstLine: string; format: string; posted: string }[];
  /** The reasons whose fix line the app can fill (offeredReasons); all five when not sent. */
  reasons: GradeReason[];
}

function parseGrade(b: Record<string, unknown>): { ok: true; request: GradeRequest } | { ok: false; error: string } {
  const text = str(b.text, GRADE_TEXT);
  if (text.length < POST_TEXT_MIN) return { ok: false, error: "Nothing to read yet." };
  const platform = str(b.platform, 20);
  if (!platform) return { ok: false, error: "Say which network it went out on." };
  const ratio = typeof b.ratio === "number" && Number.isFinite(b.ratio) && b.ratio >= 0 ? b.ratio : null;
  if (ratio === null) return { ok: false, error: "Send the post's ratio to its usual." };
  if (b.direction !== "above" && b.direction !== "below") return { ok: false, error: "Say if it did above or below its usual." };
  const best = (Array.isArray(b.best) ? b.best : []).map((x) => {
    const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    return { firstLine: str(o.firstLine, 200), format: str(o.format, 30), posted: str(o.posted, 40) };
  }).filter((x) => x.firstLine || x.format || x.posted).slice(0, MAX_BEST);
  const asked = b.reasons === undefined ? [...GRADE_REASONS] : Array.isArray(b.reasons) ? b.reasons : [];
  const reasons = GRADE_REASONS.filter((r) => asked.includes(r));
  if (reasons.length < 2) return { ok: false, error: "Send at least two reasons to choose from." };
  const words = typeof b.words === "number" && Number.isFinite(b.words) ? Math.max(0, Math.round(b.words)) : 0;
  return { ok: true, request: { mode: "grade", text, platform, format: str(b.format, 30), posted: str(b.posted, 40), words, ratio, direction: b.direction, best, reasons } };
}

/** The ratio as the chip shows it, to one decimal ("2.4x"). */
const times = (ratio: number) => `${Math.round(ratio * 10) / 10}x`;

export function gradeState(r: GradeRequest) {
  return {
    post: r.text,
    platform: networkName(r.platform),
    format: r.format,
    posted: r.posted,
    words: r.words,
    vs_usual: times(r.ratio),
    best: r.best.map((x) => ({ first_line: x.firstLine, format: x.format, posted: x.posted })),
  };
}

/** One choice over the reasons offered. */
export function gradeQuestions(r: GradeRequest): Record<string, JevQuestion> {
  return {
    reason: {
      type: "choice",
      instructions: `This post by a Singapore financial adviser got ${times(r.ratio)} their usual engagement on ${networkName(r.platform)}. Which ONE thing most likely explains why it did ${r.direction === "above" ? "better" : "worse"} than usual? \`best\` are their best recent posts on the same network.`,
      criteria: Object.fromEntries(r.reasons.map((id) => [id, GRADE_CRITERIA[id]])),
    },
  };
}

/** Jev's likeliest offered reason and its p; the reason is null under GRADE_MIN, and both are null with no answer. */
export function readGrade(answers: Record<string, JevAnswer> | null, reasons: readonly GradeReason[]): { reason: GradeReason | null; p: number | null } {
  const reason = reasons.find((x) => x === answers?.reason?.choice) ?? null;
  const p = reason ? rawP(answers?.reason?.probabilities?.[reason]) : null;
  if (!reason || p === null) return { reason: null, p: null };
  return { reason: p >= GRADE_MIN ? reason : null, p: round2(p) };
}

// ---- Modes "tags" and "try-next" (learn-format-winners) ----

/** The angles of ANGLES in src/lib/postLabels.ts as they apply to an adviser's own posts (kept in step by logic.test.ts). */
export const ANGLE_CRITERIA = {
  Storytelling: "Tells what happened to the writer or a client",
  Contrarian: "Argues against a common belief or common advice",
  Educational: "Explains how something works or how to do it",
  Emotional: "Leans on fear, loss, love or relief",
  Relatable: "Names a feeling or habit most readers share",
  "Objection Handling": "Answers a reason people give for not acting",
  Humour: "Mainly tries to be funny",
  Authority: "Leans on the writer's experience, numbers or credentials",
} as const;
export type Angle = keyof typeof ANGLE_CRITERIA;
const ANGLE_LABELS = Object.keys(ANGLE_CRITERIA) as Angle[];
/** Jev's option ids are slugs ("objection-handling"), as remix teardown asks them. */
const angleId = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const ANGLE_OPTIONS = Object.fromEntries(ANGLE_LABELS.map((a) => [angleId(a), ANGLE_CRITERIA[a]]));
const FORMULA_IDS: readonly string[] = FORMULAS.map((f) => f.id);
const HOOK_OPTIONS = { ...Object.fromEntries(FORMULAS.map((f) => [f.id, `${f.name}: ${f.template}`])), none: "None of these shapes" };

export const MAX_TAG_POSTS = 20;
/** One request of 20 posts asks up to 40 questions, more than JEV_TIMEOUT_MS was measured on. */
export const TAGS_TIMEOUT_MS = 15_000;
export { TAG_MIN };

export interface TagsRequest {
  mode: "tags";
  /** The first 600 characters of each posted draft; needHook when it was not written from a formula. */
  posts: { id: string; text: string; needHook: boolean }[];
}
export type PostTag = { angle: Angle | "unclear"; hook?: string };

function parseTags(b: Record<string, unknown>): { ok: true; request: TagsRequest } | { ok: false; error: string } {
  const raw = Array.isArray(b.posts) ? b.posts : [];
  const posts = raw.map((x) => {
    const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    return { id: str(o.id, 80), text: str(o.text, 600), needHook: o.needHook === true };
  });
  if (!posts.length || posts.length > MAX_TAG_POSTS || new Set(posts.map((p) => p.id)).size !== posts.length || posts.some((p) => !p.id || !p.text)) {
    return { ok: false, error: `Send 1 to ${MAX_TAG_POSTS} posts, each with an id and its text.` };
  }
  return { ok: true, request: { mode: "tags", posts } };
}

export const tagsState = () => ({ country: "Singapore", writer: "a licensed financial adviser" });

/** An angle question per English post, and a hook question on its first line when needHook. */
export function tagsQuestions(posts: TagsRequest["posts"]): Record<string, JevQuestion> {
  const q: Record<string, JevQuestion> = {};
  for (const p of posts) {
    if (!readsEnglish(p.text)) continue;
    q[`angle:${p.id}`] = { type: "choice", instructions: { post: p.text, question: "Which angle does `post` mainly take?" }, criteria: ANGLE_OPTIONS };
    if (p.needHook) {
      q[`hook:${p.id}`] = {
        type: "choice",
        instructions: { first_line: firstLine(p.text), question: "Which hook formula does `first_line`, the first line of a post, follow?" },
        criteria: HOOK_OPTIONS,
      };
    }
  }
  return q;
}

/** Jev's top pick and its raw p for a question, whatever the cut, else nulls. */
function topPick(a: JevAnswer | undefined, ids: readonly string[]): [string | null, number | null] {
  const c = typeof a?.choice === "string" && ids.includes(a.choice) ? a.choice : null;
  return [c, c ? rawP(a?.probabilities?.[c]) : null];
}

/** Every post's tags: a pick at TAG_MIN or more, else "unclear" (a post not in English, an unsure or missing answer). */
export function readTags(answers: Record<string, JevAnswer> | null, posts: TagsRequest["posts"]): { tags: Record<string, PostTag>; log: unknown[] } {
  const tags: Record<string, PostTag> = {};
  const log: unknown[] = [];
  for (const p of posts) {
    const [a, ap] = topPick(answers?.[`angle:${p.id}`], ANGLE_LABELS.map(angleId));
    const angle = a && ap !== null && ap >= TAG_MIN ? ANGLE_LABELS.find((x) => angleId(x) === a)! : "unclear";
    const tag: PostTag = { angle };
    let row: unknown[] = [a, prob(ap)];
    if (p.needHook) {
      const [h, hp] = topPick(answers?.[`hook:${p.id}`], [...FORMULA_IDS, "none"]);
      tag.hook = h && hp !== null && hp >= TAG_MIN ? h : "unclear";
      row = [...row, h, prob(hp)];
    }
    tags[p.id] = tag;
    log.push(row);
  }
  return { tags, log };
}

export interface TryNextRequest {
  mode: "try-next";
  audience: string;
  topics: string[];
  /** Up to 3 hook lines of their best posts. */
  best: string[];
  /** HOOK_FORMULAS ids with no post in 90 days. */
  untried: string[];
}
// shortcut: proposed (phase 7 decision 10), not read off real answers; set from the logged p after the first 20 runs.
/** An untried hook is suggested at or above this p, the top 2. */
export const TRY_MIN = 0.6;
export const TRY_PICKS = 2;

function parseTryNext(b: Record<string, unknown>): { ok: true; request: TryNextRequest } | { ok: false; error: string } {
  const list = (v: unknown, max: number, n: number) =>
    (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : []).map((x) => str(x, max)).filter(Boolean).slice(0, n);
  const audience = str(b.audience, 300);
  const topics = list(b.topics, 80, 10);
  if (!audience && !topics.length) return { ok: false, error: "Add who you write for first." };
  const asked = Array.isArray(b.untried) ? b.untried : [];
  const untried = FORMULA_IDS.filter((id) => asked.includes(id));
  if (!untried.length) return { ok: false, error: "Send the hook formulas to check." };
  return { ok: true, request: { mode: "try-next", audience, topics, best: list(b.best, 200, MAX_BEST), untried } };
}

export const tryNextState = (r: TryNextRequest) => ({ audience: r.audience, topics: r.topics, best_hooks: r.best, writer: "a Singapore financial adviser" });

/** One yes/no per untried formula. */
export function tryNextQuestions(untried: string[]): Record<string, JevQuestion> {
  return Object.fromEntries(
    FORMULAS.filter((f) => untried.includes(f.id)).map((f) => [
      `try_${f.id}`,
      {
        type: "noul",
        instructions: `Would opening a post with the "${f.name}" hook ("${f.template}") suit this adviser's \`audience\` and \`topics\`?`,
        criteria: {
          true: "Yes: it fits the people they write for and the subjects they cover, and can be written without promising returns.",
          false: "No: it clashes with their audience or topics, or pushes them toward claims an adviser must not make.",
        },
      } satisfies JevQuestion,
    ]),
  );
}

/** The top TRY_PICKS formula ids at TRY_MIN or more, likeliest first, and every p for the log. */
export function readTryNext(answers: Record<string, JevAnswer> | null, untried: string[]): { hooks: string[]; p: Record<string, number | null> } {
  const raw = Object.fromEntries(untried.map((id) => [id, rawP(answers?.[`try_${id}`]?.noul)]));
  const hooks = untried.filter((id) => (raw[id] ?? -1) >= TRY_MIN).sort((a, b) => (raw[b] as number) - (raw[a] as number)).slice(0, TRY_PICKS);
  return { hooks, p: Object.fromEntries(untried.map((id) => [id, prob(raw[id])])) };
}

// ---- Mode "evergreen" (remix-own-winners) ----

// shortcut: proposed (phase 7 decision 10), not read off real winners; set from the logged p after the first 20 runs.
/** p(a fresh version still makes sense next month) at or above this keeps the winner. */
export const EVERGREEN_MIN = 0.5;

export const evergreenState = (text: string) => ({ post: text, writer: "a Singapore financial adviser" });

export const EVERGREEN_QUESTIONS: Record<string, JevQuestion> = {
  evergreen: {
    type: "noul",
    instructions: "Would a fresh version of `post` still make sense to post next month?",
    criteria: {
      true: "Yes: the idea is evergreen, such as a money habit, a common mistake, a client story or a how-to, and can be told again with a new hook and example.",
      false: "No: it hangs on a dated event, a one-off announcement, a promotion with an end date, a personal milestone or breaking news.",
    },
  },
};

/** Keep (true) at EVERGREEN_MIN or more, dated (false) below it, null with no answer (the app keeps the winner). */
export function readEvergreen(answers: Record<string, JevAnswer> | null): { evergreen: boolean | null; p: number | null } {
  const p = rawP(answers?.evergreen?.noul);
  return { evergreen: p === null ? null : p >= EVERGREEN_MIN, p: prob(p) };
}
