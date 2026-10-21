// The in-app assistant acting on the adviser's own posts (gap g51). Each message
// typed in the assistant comes here first, with the titles of the adviser's own
// saved posts (from their browser) and today's date. Jev decides, in one request:
// which one thing the message asks the app to do, which saved post it means, and
// the day and time it names. Nothing here writes anything: the app shows a confirm
// card naming the change and applies it with the pages' own functions on a tap.
// No Jev answer (or a message mostly not in English) means no action, and the
// assistant answers in words as before.
//
// Leo only (NORTH_STAR_USERS, phase 4 brand-voice-memory): a "remember" act for a
// lasting preference, with a second question for what it applies to. Adding an
// option changes Jev's routing for every message, so everyone else gets exactly
// today's questions (pinned in fixtures/).

import { choiceOf, type JevAnswer, type JevQuestion } from "../_shared/jev.ts";

export const ACTS = ["move", "write", "week", "engage_replies", "engage_dms", "engage_thread", "engage_comment", "remember", "none"] as const;
export type Act = (typeof ACTS)[number];
/** What a remembered preference applies to; "all" when the message does not say. */
export const SCOPES = ["posts", "videos", "pictures", "all"] as const;
export type Scope = (typeof SCOPES)[number];

export const MAX_MESSAGE = 3000;
export const MAX_POSTS = 50;
/** How far ahead a post can be put: today and the 59 days after. */
export const DAYS_AHEAD = 60;
/** Posting times on offer, every half hour. */
export const TIMES: readonly string[] = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

// shortcut: thresholds are not yet read off real messages (one paid call allowed in testing); revisit from the assistant's logs.
/** The action is taken only at this probability or more; below it the assistant answers in words. */
export const ACT_MIN = 0.6;
/** Which post, which day, which time: at this probability or more, else treated as not said. */
export const PICK_MIN = 0.5;

export interface ActPost {
  title: string;
  status: "draft" | "scheduled" | "posted";
  /** Its scheduled day ("YYYY-MM-DD", or with "THH:MM"), or the day it was posted. */
  when: string;
  platform: string;
}
export interface ActBody {
  message: string;
  today: string;
  posts: ActPost[];
}
export interface ActPick {
  act: Exclude<Act, "none">;
  /** Index into the posts sent, for move and write. */
  post: number | null;
  /** "YYYY-MM-DD", for move. */
  day: string | null;
  /** "HH:MM", for move. */
  time: string | null;
  /** What a remember act applies to (Leo only). */
  scope?: Scope;
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const utc = (day: string) => {
  const m = DAY_RE.exec(day);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
};
const realDay = (day: string) => utc(day)?.toISOString().slice(0, 10) === day;
// Spelled out rather than toLocaleDateString, whose commas differ between Deno's and Node's ICU.
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDay = (d: Date) => `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const shortDay = (d: Date) => `${WEEKDAYS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
/** "9am", "7:30pm". */
export const timeWords = (t: string) => {
  const h = Number(t.slice(0, 2));
  return `${h % 12 || 12}${t.endsWith(":00") ? "" : t.slice(2)}${h < 12 ? "am" : "pm"}`;
};

/** The day keys on offer, today first. */
export function dayKeys(today: string): string[] {
  const start = utc(today)!;
  return Array.from({ length: DAYS_AHEAD }, (_, i) => new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10));
}

// deno-lint-ignore no-control-regex
const clean = (s: string, n: number) => s.replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ").trim().slice(0, n);

/** The function's body, checked: the message, today's date and up to 50 posts. Null when anything is off. */
export function actBody(raw: unknown): ActBody | null {
  const b = raw as { message?: unknown; today?: unknown; posts?: unknown } | null;
  if (!b || typeof b.message !== "string" || typeof b.today !== "string" || !realDay(b.today)) return null;
  if (b.posts !== undefined && (!Array.isArray(b.posts) || b.posts.length > MAX_POSTS)) return null;
  const message = clean(b.message, MAX_MESSAGE);
  if (!message) return null;
  const posts: ActPost[] = [];
  for (const p of (b.posts ?? []) as Partial<Record<keyof ActPost, unknown>>[]) {
    if (!p || typeof p.title !== "string" || !clean(p.title, 100)) return null;
    const status = p.status === "scheduled" || p.status === "posted" ? p.status : "draft";
    const when = typeof p.when === "string" && /^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d)?$/.test(p.when) ? p.when : "";
    posts.push({ title: clean(p.title, 100), status, when, platform: typeof p.platform === "string" ? clean(p.platform, 20) : "" });
  }
  return { message, today: b.today, posts };
}

function postLine(p: ActPost): string {
  const d = p.when ? utc(p.when.slice(0, 10)) : null;
  const at = d ? `${shortDay(d)} ${d.getUTCFullYear()}${p.when.length > 10 ? `, ${timeWords(p.when.slice(11))}` : ""}` : "";
  const state = p.status === "scheduled" ? `scheduled${at ? ` for ${at}` : ""}` : p.status === "posted" ? `posted${at ? ` on ${at}` : ""}` : "a draft";
  return `"${p.title}" (${[state, p.platform].filter(Boolean).join(", ")})`;
}

/**
 * Jev's questions over the message: the action, and, when there are posts, which post, day and time. `leo`
 * (the north-star gate, set by index.ts after sign-in) adds the remember act and the scope question; without
 * it the questions are today's exactly.
 */
export function actAsk(body: ActBody, leo = false): { state: Record<string, string>; questions: Record<string, JevQuestion> } {
  const today = utc(body.today)!;
  const questions: Record<string, JevQuestion> = {
    act: {
      type: "choice",
      instructions:
        "A financial adviser typed `message` to the assistant inside Content Studio, the app where they write, plan and track their social media posts. Which one thing is the message asking the app to do right now?",
      criteria: {
        move: "Schedule one of their saved posts, or move it to another day or time: put it on the calendar, reschedule it, change when it goes out.",
        write: "Change the words of one of their saved posts: rewrite it, shorten or lengthen it, change its tone, fix it or add something to it.",
        week: "Show how their posts did over the last week: their numbers, results, impressions, engagement, best or weakest post.",
        engage_replies: "Help them reply to comments people left on their own post. The message contains those comments.",
        engage_dms: "Help them reply to several separate direct messages from different people. The message contains those messages.",
        engage_thread: "Help them reply in one back-and-forth direct message conversation with one person. The message contains that conversation.",
        engage_comment: "Help them write a comment to leave on someone else's post. The message contains that post.",
        ...(leo ? { remember: REMEMBER } : {}),
        none: "Anything else: a question about how the app works, an idea, a problem or bug, a feature request, a message for the team, small talk, or something the app cannot do.",
      },
    },
  };
  if (body.posts.length) {
    questions.post = {
      type: "choice",
      instructions: "If the message asks to schedule, move or change one of the adviser's saved posts, which one does it mean? Pick none when it names no post or none of these fits.",
      criteria: { ...Object.fromEntries(body.posts.map((p, i) => [`p${i + 1}`, postLine(p)])), none: "No saved post is named, or none of these fits." },
    };
    questions.day = {
      type: "choice",
      instructions: `Today is ${longDay(today)}. If the message asks to schedule or move a post, which day does it say the post should go out on? Pick none when it names no day.`,
      criteria: {
        ...Object.fromEntries(
          dayKeys(body.today).map((k, i) => [k, `${longDay(utc(k)!)}${i === 0 ? " (today)" : i === 1 ? " (tomorrow)" : ` (in ${i} days)`}`]),
        ),
        none: "The message names no day.",
      },
    };
    questions.time = {
      type: "choice",
      instructions: "If the message asks to schedule or move a post, what time of day does it say the post should go out? Pick none when it names no time.",
      criteria: { ...Object.fromEntries(TIMES.map((t) => [t, timeWords(t)])), none: "The message names no time." },
    };
  }
  if (leo) questions.scope = SCOPE_QUESTION;
  return { state: { today: longDay(today), message: body.message }, questions };
}

const REMEMBER =
  "Tell the app a lasting preference for what it makes from now on: always or never do something in their posts, videos or pictures, for example 'never use emoji', 'always end with a question', 'use Asian presenters'.";
const SCOPE_QUESTION: JevQuestion = {
  type: "choice",
  instructions: "Which kind of content does the preference in `message` apply to?",
  criteria: {
    posts: "Written posts, captions, carousels and scripts.",
    videos: "Videos: presenters, on-screen captions, editing, music.",
    pictures: "Pictures and images.",
    all: "Everything, or the message does not say.",
  },
};

/** A Choice's pick when its own probability is at least `min`. */
function sure<T extends string>(answers: Record<string, JevAnswer> | null, id: string, options: readonly T[], min: number): T | null {
  const c = choiceOf(answers, id, options);
  const p = c ? answers?.[id]?.probabilities?.[c] : undefined;
  return c && typeof p === "number" && p >= min ? c : null;
}

/** What the message asks for, or null: no answer, not sure enough, or nothing the app does. Remember only for `leo`. */
export function actPick(answers: Record<string, JevAnswer> | null, body: ActBody, leo = false): ActPick | null {
  const act = sure(answers, "act", ACTS, ACT_MIN);
  if (!act || act === "none" || (act === "remember" && !leo)) return null;
  if (act === "remember") return { act, post: null, day: null, time: null, scope: sure(answers, "scope", SCOPES, PICK_MIN) ?? "all" };
  const keys = body.posts.map((_, i) => `p${i + 1}`);
  const onPost = act === "move" || act === "write";
  const post = onPost ? sure(answers, "post", [...keys, "none"], PICK_MIN) : null;
  const day = act === "move" ? sure(answers, "day", [...dayKeys(body.today), "none"], PICK_MIN) : null;
  const time = act === "move" ? sure(answers, "time", [...TIMES, "none"], PICK_MIN) : null;
  return {
    act,
    post: post && post !== "none" ? keys.indexOf(post) : null,
    day: day && day !== "none" ? day : null,
    time: time && time !== "none" ? time : null,
  };
}
