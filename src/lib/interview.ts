// The long piece's interview (plan-interview, Leo only): a fixed bank of 8 questions, 5 a session, the answers
// turned into the long piece. Jev (writing-judge "idea", through ideaIsThin) decides when an answer is thin and gets
// one follow-up; the questions themselves cost nothing. The session lives on this device only:
//   localStorage cs-interview-<scoped(uid)> = { sessions, current? }

import { scoped } from "@/lib/profiles";
import { STAGE_GROUPS, type Audience } from "@/lib/audiences";
import type { Positioning } from "@/lib/positioning";

export const QUESTION_COUNT = 5;
export const MAX_ANSWER_CHARS = 2000;
/** idea-dump's MIN_LONG_WORDS: the server refuses a long piece under this many words. */
export const MIN_WORDS = 120;
/** The kind Jev reads an answer as; writing-judge's idea mode takes it as post_kind. */
export const THIN_KIND = "an interview answer for a social post";
export const FOLLOW_UP = "Can you give one example? What happened, to whom, and what changed for them?";

export interface Fill {
  /** The first positioning topic that reads as a topic. */
  topic?: string;
  /** Who they serve: the main saved audience's name, else the life stage's group. */
  who?: string;
}

// "who are" rather than the spec's "who is": every audience line and group name is plural ("fresh grads", "parents")
const BANK: ((f: Fill) => string | null)[] = [
  () => "What did a client or a friend ask you about money this week?",
  (f) => (f.topic ? `What is one thing people get wrong about ${f.topic}?` : null),
  () => "Tell me about a client situation that stayed with you. Leave out names and anything that could identify them.",
  (f) => (f.who ? `What would you tell ${f.who} who are just starting to plan?` : null),
  () => "What is an opinion about your work that other advisers might disagree with?",
  () => "Why did you start doing this work, and what keeps you in it?",
  () => "What happened this week that surprised you?",
  () => "What question do you get so often you could answer it in your sleep?",
];

/**
 * Words that read as a short noun phrase in a question's blank: 1 to `max` words of letters, hyphens, apostrophes
 * and &, with no comma, slash, number or symbol ("Auditor / Accountant, aged 30-48" is not one). A plain capitalised
 * first word goes to lower case ("Sales reps" to "sales reps"); CPF and WhatsApp keep theirs.
 */
function phrase(raw: string | undefined, max: number): string | undefined {
  const t = raw?.trim().replace(/\s+/g, " ") ?? "";
  if (!/^\p{L}[\p{L}'\u2019&-]*(?: \p{L}[\p{L}'\u2019&-]*)*$/u.test(t) || t.split(" ").length > max) return undefined;
  // shortcut: a place name as the first word ("Singapore retirees") loses its capital too; fine until one shows up
  return /^\p{Lu}[\p{Ll}'\u2019-]*(?: |$)/u.test(t) ? t[0].toLowerCase() + t.slice(1) : t;
}

/**
 * A topic reads as one when it is a short noun phrase with no -ing word before its last: "Activity tracking" and
 * "CPF top-ups" do; "Not taking action" and "Letting money sit in bank" are pains (wave 2 live check, 22 Oct).
 * shortcut: a shape check, not Jev; it can also skip a fine topic ("Building wealth"), which only means the bank's
 * other questions are asked.
 */
const asTopic = (t: string) => {
  const p = phrase(t, 3);
  return p && !p.split(" ").slice(0, -1).some((w) => /ing$/i.test(w)) ? p : undefined;
};

/**
 * The blanks: never raw profile text (wave 2 live check: "What would you tell Auditor / Accountant, aged 30-48, ...").
 * `main` is the brand's main saved audience; a blank with nothing that reads right stays empty, and its question is
 * skipped for the bank's others.
 */
export function fillFrom(p: Pick<Positioning, "topics" | "audience"> | null, main?: Pick<Audience, "name"> | null): Fill {
  const topic = p?.topics?.map(asTopic).find(Boolean);
  const named = main && main.name !== STAGE_GROUPS.general ? phrase(main.name, 6) : undefined;
  const stage = p?.audience && p.audience !== "general" ? STAGE_GROUPS[p.audience]?.toLowerCase() : undefined;
  return { topic, who: named || stage };
}

/** 5 questions from the bank, starting at `sessions % 8`, skipping any whose blank can't be filled. */
export function pickQuestions(sessions: number, fill: Fill): string[] {
  const out: string[] = [];
  for (let k = 0; k < BANK.length && out.length < QUESTION_COUNT; k++) {
    const q = BANK[(sessions + k) % BANK.length](fill);
    if (q) out.push(q);
  }
  return out;
}

export interface InterviewSession {
  questions: string[];
  answers: string[];
  /** The follow-up has been shown for this question (one at most). */
  followed: boolean[];
  /** A question's index; questions.length is the review; questions.length + 1 is done. */
  step: number;
  startedAt: string;
  /** The review's text once it has been edited. */
  review?: string;
}
export interface InterviewStore {
  sessions: number;
  current?: InterviewSession;
}

/** A new session, opening one question further round the bank than the last. */
export function startSession(store: InterviewStore, fill: Fill, now: Date): InterviewStore {
  const questions = pickQuestions(store.sessions, fill);
  return {
    sessions: store.sessions + 1,
    current: { questions, answers: questions.map(() => ""), followed: questions.map(() => false), step: 0, startedAt: now.toISOString() },
  };
}

/** The long piece: each answered question as "Q: ..." then "A: ...", skipped ones left out. */
export function transcriptOf(questions: string[], answers: string[]): string {
  return questions.flatMap((q, i) => (answers[i]?.trim() ? [`Q: ${q}\nA: ${answers[i].trim()}`] : [])).join("\n\n");
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Words in the answers only. */
export function answerWords(answers: string[]): number {
  return answers.reduce((n, a) => n + words(a), 0);
}

/** Words of the answers in the review's text: the Q: lines and the A: labels left out. */
export function reviewWords(text: string): number {
  return words(text.split("\n").filter((l) => !/^\s*Q:/.test(l)).join("\n").replace(/^\s*A:/gm, " "));
}

/** After Next: "check" asks Jev first (thin is undefined until it answers); a thin answer gets its one follow-up. */
export function nextStep(answer: string, thin: boolean | null | undefined, followed: boolean): "check" | "follow-up" | "next" {
  if (!answer.trim() || followed) return "next";
  if (thin === undefined) return "check";
  return thin ? "follow-up" : "next";
}

const KEY = "cs-interview-";
const strings = (v: unknown, n: number): v is string[] => Array.isArray(v) && v.length === n && v.every((x) => typeof x === "string");

/** The device's interview; an empty one on bad JSON or a broken session. */
export function loadInterview(userId: string | null): InterviewStore {
  if (!userId) return { sessions: 0 };
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(KEY + scoped(userId)) ?? "null");
    const sessions = Number.isInteger(raw?.sessions) && raw.sessions >= 0 ? raw.sessions : 0;
    const c = raw?.current;
    const n = Array.isArray(c?.questions) ? c.questions.length : 0;
    const ok =
      n > 0 && strings(c.questions, n) && strings(c.answers, n) &&
      Array.isArray(c.followed) && c.followed.length === n && c.followed.every((x: unknown) => typeof x === "boolean") &&
      Number.isInteger(c.step) && c.step >= 0 && c.step <= n + 1 && typeof c.startedAt === "string" &&
      (c.review === undefined || typeof c.review === "string");
    return ok ? { sessions, current: c } : { sessions };
  } catch {
    return { sessions: 0 };
  }
}

/** False when the device refuses the write (the answers still show this visit). */
export function saveInterview(userId: string, store: InterviewStore): boolean {
  try {
    globalThis.localStorage?.setItem(KEY + scoped(userId), JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}
