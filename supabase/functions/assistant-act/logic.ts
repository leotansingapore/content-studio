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
//
// Agent mode (phase 6, Leo only, `agent: true`): the same one Jev request picks the
// agent's act and fills its fixed slots (format, length, who, audience, weeks,
// pace, slide, which, skill beside post, day, time and scope), and the answer
// carries each question's probability for the shadow log. The agent's steps are
// fixed code in the app; nothing here plans or writes.

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
  /** Agent mode's fields: set only for an account on NORTH_STAR_USERS that sent `agent: true`. */
  agent?: AgentFields;
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

/**
 * The function's body, checked: the message, today's date and up to 50 posts. Null when anything is off. With
 * `leo` (the north-star gate) and `agent: true`, agent mode's fields too; anyone else's agent fields are dropped.
 */
export function actBody(raw: unknown, leo = false): ActBody | null {
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
  const body: ActBody = { message, today: b.today, posts };
  if (!leo || (raw as Raw).agent !== true) return body;
  const agent = agentFields(raw as Raw);
  return agent ? { ...body, agent } : null;
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
  const a = leo ? body.agent : undefined;
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
        ...(a ? agentActs(a) : {}),
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
  const more = a ? agentAsk(a, body.message) : { state: {}, questions: {} };
  return { state: { today: longDay(today), message: body.message, ...more.state }, questions: { ...questions, ...more.questions } };
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

// ---- Agent mode (phase 6, Leo only) ----

export const CHIPS = ["post", "carousel", "video", "campaign"] as const;
export type Chip = (typeof CHIPS)[number];
export const SPEAKERS = ["person", "business"] as const;
export const OPEN_KINDS = ["carousel", "slideshow", "video"] as const;
export const FORMATS = ["post", "carousel", "script", "slideshow", "wall", "speaking", "explainer", "image"] as const;
export type Format = (typeof FORMATS)[number];
/** The acts agent mode adds to today's (remember included): approve and decline only with `pending`, edit only with `open`, answer only with `competitorAds`. */
export const AGENT_ACTS = ["remix", "make", "competitor", "campaign", "capabilities", "refuse", "budget", "forget", "memory", "check", "approve", "decline", "edit", "answer"] as const;
export type AgentAct = Exclude<Act, "none"> | (typeof AGENT_ACTS)[number];

// shortcut: thresholds not read off real agent messages; set them from 50 of Leo's own messages run side by side with his labels.
/** A typed yes spends money, so it must be surer than any other act (decline stays at ACT_MIN). */
export const APPROVE_MIN = 0.8;
/** One of the person's own saved skills. Format, length, who, audience, weeks, pace, slide and which use PICK_MIN. */
export const SKILL_MIN = 0.7;

export interface AgentFields {
  chip: Chip | null;
  speaker: (typeof SPEAKERS)[number];
  source: { kind: string; format: string; title: string } | null;
  /** The title of the one proposed card, or "". */
  pending: string;
  open: { kind: (typeof OPEN_KINDS)[number]; title: string; slides: string[]; onScreen: number | null } | null;
  /** "<text> (<scope>)", newest first as the app sends them. */
  learnings: string[];
  lastChange: string;
  speakers: { id: string; look: string }[];
  audiences: { id: string; name: string }[];
  skills: { slash: string; name: string; instruction: string }[];
  competitorAds: boolean;
  /** The last make in this chat (its format and subject), for "another one": null when there is none. */
  last: { format: Format; subject: string } | null;
}

/** Each slot is null when Jev is unsure, it was not asked, or Jev picked its "nothing said" option (none, any, the whole item). */
export interface AgentPick {
  act: AgentAct | null;
  format: Format | null;
  /** Seconds: 8, 15, 20 or 30. */
  length: number | null;
  /** Index into `speakers` sent. */
  who: number | null;
  /** Index into `audiences` sent. */
  audience: number | null;
  /** 1, 2 or 4. */
  weeks: number | null;
  /** Posts a week: 2, 3, 5 or 7. */
  pace: number | null;
  /** Index into `open.slides`; null means the whole item. */
  slide: number | null;
  /** Index into `learnings` sent, or the last change. */
  which: number | "last" | null;
  /** Index into `skills` sent. */
  skill: number | null;
  post: number | null;
  day: string | null;
  time: string | null;
  scope: Scope | null;
  /** What a make is about, in the message's own words from where its topic starts; "last" for another like `last`. */
  subject: string | null;
  /** The business a competitor message names, in its own words. */
  name: string | null;
}
/** Jev's probability for the option it picked on each question, below the cut too; null when not asked or no answer. */
export type AgentP = Record<keyof AgentPick, number | null>;
export const SLOTS = ["act", "format", "length", "who", "audience", "weeks", "pace", "slide", "which", "skill", "post", "day", "time", "scope", "subject", "name"] as const satisfies readonly (keyof AgentPick)[];
export const noP = (): AgentP => Object.fromEntries(SLOTS.map((k) => [k, null])) as AgentP;

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const oneOf = <T extends string>(v: unknown, options: readonly T[]): T | null => ((options as readonly unknown[]).includes(v) ? (v as T) : null);
/** Required words, cleaned and cut; null when missing or blank. */
const words = (v: unknown, n: number) => (typeof v === "string" && clean(v, n) ? clean(v, n) : null);
/** Optional words: "" when absent, null when not a string. */
const maybe = (v: unknown, n: number) => (v === undefined ? "" : typeof v === "string" ? clean(v, n) : null);
/** The first `max` entries, each read by `one`; null when it is not a list or a kept entry is malformed, so indexes stay the app's. */
function listOf<T>(v: unknown, max: number, one: (x: unknown) => T | null): T[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v)) return null;
  const out = v.slice(0, max).map(one);
  return out.every((x) => x !== null) ? (out as T[]) : null;
}
const SPEAKER_ID = /^(mine|new|pr-[A-Za-z0-9_-]{1,60})$/;

/** Agent mode's fields, checked and cut to their sizes. Null when one has the wrong shape (the app sent a bad body). */
function agentFields(b: Raw): AgentFields | null {
  if ((b.chip !== undefined && !oneOf(b.chip, CHIPS)) || (b.speaker !== undefined && !oneOf(b.speaker, SPEAKERS))) return null;
  if (b.competitorAds !== undefined && typeof b.competitorAds !== "boolean") return null;
  const pending = maybe(b.pending, 120);
  const lastChange = maybe(b.lastChange, 120);
  let source: AgentFields["source"] = null;
  if (b.source !== undefined) {
    const s = isObj(b.source) ? b.source : {};
    const [kind, format, title] = [maybe(s.kind, 40), maybe(s.format, 40), words(s.title, 120)];
    if (kind === null || format === null || !title) return null;
    source = { kind, format, title };
  }
  let open: AgentFields["open"] = null;
  if (b.open !== undefined) {
    const o = isObj(b.open) ? b.open : {};
    const [kind, title] = [oneOf(o.kind, OPEN_KINDS), words(o.title, 120)];
    const slides = listOf(o.slides, 10, (x) => (typeof x === "string" ? clean(x, 80) : null));
    if (!kind || !title || !slides) return null;
    const n = o.onScreen;
    open = { kind, title, slides, onScreen: typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= slides.length ? n : null };
  }
  const learnings = listOf(b.learnings, 10, (x) => words(x, 160));
  const speakers = listOf(b.speakers, 7, (x) => (isObj(x) && typeof x.id === "string" && SPEAKER_ID.test(x.id) && words(x.look, 160) ? { id: x.id, look: words(x.look, 160)! } : null));
  const audiences = listOf(b.audiences, 6, (x) => (isObj(x) && words(x.id, 60) && words(x.name, 60) ? { id: words(x.id, 60)!, name: words(x.name, 60)! } : null));
  const skills = listOf(b.skills, 12, (x) =>
    isObj(x) && maybe(x.slash, 40) !== null && words(x.name, 40) && words(x.instruction, 300) ? { slash: maybe(x.slash, 40)!, name: words(x.name, 40)!, instruction: words(x.instruction, 300)! } : null,
  );
  if (pending === null || lastChange === null || !learnings || !speakers || !audiences || !skills) return null;
  let last: AgentFields["last"] = null;
  if (b.last !== undefined) {
    const l = isObj(b.last) ? b.last : {};
    const [format, subject] = [oneOf(l.format, FORMATS), words(l.subject, 120)];
    if (!format || !subject) return null;
    last = { format, subject };
  }
  return {
    chip: oneOf(b.chip, CHIPS),
    speaker: oneOf(b.speaker, SPEAKERS) ?? "person",
    source,
    pending,
    open,
    learnings,
    lastChange,
    speakers,
    audiences,
    skills,
    competitorAds: b.competitorAds === true,
    last,
  };
}

const REFUSE = {
  person:
    "Ask for something that must not be made: a post that promises returns, a percentage or results, or guarantees them; names an insurer's product; copies another person's words exactly; uses another real person's face or voice; or makes a real person (a celebrity, a public figure or anyone who is not them) appear to say, recommend or endorse something.",
  business:
    "Ask for something that must not be made: a post that copies another person's words exactly, uses another real person's face or voice, or makes a real person (a celebrity, a public figure or anyone outside the business) appear to say, recommend or endorse something.",
};

/** The act criteria agent mode adds, in the order Jev reads them. */
function agentActs(a: AgentFields): Record<string, string> {
  return {
    remix: "Make their own version of a post, ad, reel or video someone else made: remix it, copy its idea or format, or do one like it. The message has a link, or a post is attached to it.",
    make: "Make a new piece of content from a topic or idea: a post, a carousel, a script, a talking video, an explainer video or a picture.",
    competitor: "Add a business, brand or social account to the competitors they track.",
    campaign: "Plan a campaign, a month of posts or several weeks of content.",
    capabilities: "Ask what the assistant can do, make or help with.",
    refuse: REFUSE[a.speaker],
    budget: "Ask how many AI videos, pictures, voiceovers or other AI uses they have left today, or what something costs to make.",
    forget: "Take something back: undo the last change, forget a preference they gave earlier, or stop doing something the app was told to do.",
    memory: "Ask what the app remembers, has learned or follows about them and their preferences.",
    check: "Check one of their saved posts before it goes out: compliance, facts, whether it sounds human, how it might do.",
    ...(a.pending
      ? {
          approve: "Say an explicit yes to the proposal waiting for them, `pending`: approve it, go ahead, do it, make it. A bare acknowledgement such as ok, okay, noted, got it or thanks is not a yes.",
          decline: "Say no to the proposal waiting for them, `pending`: not now, cancel it, don't make it.",
        }
      : {}),
    ...(a.open ? { edit: `Change the ${a.open.kind} that is open on screen right now, "${a.open.title}": its words, length, tone, captions, look, or the order of its slides.` } : {}),
    ...(a.competitorAds ? { answer: "Answer or respond to a competitor's new ad or post with a post of their own." } : {}),
  };
}

const choice = (instructions: string, criteria: Record<string, string>): JevQuestion => ({ type: "choice", instructions, criteria });
const numbered = (prefix: string, texts: string[]) => Object.fromEntries(texts.map((t, i) => [`${prefix}${i + 1}`, t]));
/** A learning's own words, without the "(scope)" the app appends. */
const SCOPED = /\s*\((posts|videos|pictures|all)\)$/;

/** Agent mode's slot questions, each only under its "asked when", and the state they read. */
function agentAsk(a: AgentFields, message: string): { state: Record<string, string>; questions: Record<string, JevQuestion> } {
  const state: Record<string, string> = {};
  if (a.chip) state.chip = `The person pressed the ${a.chip[0].toUpperCase()}${a.chip.slice(1)} chip`;
  if (a.source) state.source = `The person attached a post to the message: "${a.source.title}" (${[a.source.kind, a.source.format].filter(Boolean).join(", ")})`;
  if (a.pending) state.pending = a.pending;
  const questions: Record<string, JevQuestion> = {
    format: choice("If the message asks the app to make or remix something, what should it make? Pick none when it does not say.", {
      post: "A written post or caption.",
      carousel: "A carousel: several slides to swipe through.",
      script: "A script or shot list they film themselves.",
      slideshow: "Words on a few photos, swiped one at a time.",
      wall: "One bold claim over a short clip.",
      speaking: "A talking video or talking head: them or a presenter talking to camera.",
      // replay D10: "make an explainer video about ..." read as speaking at 0.60 next to a presenter preference
      explainer: "An explainer video: a voiceover over pictures, with no one on camera. A message that asks for an explainer means this, whoever their presenter is.",
      image: "One picture.",
      none: "The message does not say what to make.",
    }),
    length: choice("If the message asks for a video, how long should it be? Pick none when it does not say.", {
      8: "About 8 seconds, a very short clip.",
      15: "About 15 seconds.",
      20: "About 20 seconds.",
      30: "About 30 seconds, or half a minute.",
      none: "The message does not say how long.",
    }),
  };
  if (a.speakers.length) {
    const prefs = a.learnings.filter((l) => /\((videos|all)\)$/.test(l)).map((l) => l.replace(SCOPED, ""));
    state.video_preferences = prefs.length ? prefs.join("; ") : "None.";
    questions.who = choice(
      "If the message asks for a video with someone on camera, who should appear in it? Read the message and the person's standing preferences in `video_preferences`. Pick any when neither says anything about who appears.",
      { ...numbered("w", a.speakers.map((s) => s.look)), any: "The message and their preferences say nothing about who appears." },
    );
  }
  if (a.audiences.length) {
    questions.audience = choice("If the message asks for content or a campaign for a particular audience, which one does it mean? Pick none when it names none of these.", {
      ...numbered("a", a.audiences.map((x) => x.name)),
      none: "No audience is named, or none of these fits.",
    });
  }
  questions.weeks = choice("If the message asks to plan a campaign or several weeks of posts, how many weeks should it cover? Pick none when it does not say.", {
    1: "One week.",
    2: "Two weeks.",
    4: "Four weeks, or a month.",
    none: "The message does not say how long.",
  });
  questions.pace = choice("If the message asks to plan a campaign or several weeks of posts, how many posts a week does it ask for? Pick none when it does not say.", {
    2: "2 posts a week.",
    3: "3 posts a week.",
    5: "5 posts a week, or every weekday.",
    7: "7 posts a week, or one every day.",
    none: "The message does not say how often.",
  });
  if (a.open?.slides.length) {
    const { kind, slides, onScreen } = a.open;
    questions.slide = choice(
      `The adviser has a ${kind} open with ${slides.length} slides${onScreen ? `, and slide ${onScreen} is the one on screen` : ""}. Which slide does the message mean? Pick all when it means the whole ${kind} or names no slide.`,
      { ...Object.fromEntries(slides.map((t, i) => [`s${i + 1}`, `Slide ${i + 1}: "${t}"`])), all: `The whole ${kind}, or no slide is named.` },
    );
  }
  if (a.learnings.length || a.lastChange) {
    if (a.lastChange) state.last_change = a.lastChange;
    questions.which = choice("If the message asks the app to forget or undo something, which one does it mean?", {
      ...numbered("l", a.learnings),
      ...(a.lastChange ? { last: "The most recent change made in this chat: `last_change`." } : {}),
      none: "None of these fits.",
    });
  }
  if (a.skills.length) {
    questions.skill = choice("Does the message ask the app to run one of the adviser's own saved skills? Pick none when it does not.", {
      ...numbered("s", a.skills.map((x) => `${x.name}: ${x.instruction}`)),
      none: "The message does not ask for any of these.",
    });
  }
  if (a.last) state.last_made = `A ${LAST_NOUN[a.last.format]} about "${a.last.subject}"`;
  const ends = endings(message);
  if (Object.keys(ends).length) {
    questions.subject = choice(
      "If the message asks the app to make something, where does its topic start? Each option is the message from one word to its end: pick the one that starts where the topic starts. Pick none when it names no topic.",
      { ...ends, ...(a.last ? { last: "It asks for another one like `last_made`, about the same subject, and names no topic of its own." } : {}), none: "The message names no topic." },
    );
  }
  const names = spans(message);
  if (Object.keys(names).length) {
    questions.name = choice("If the message asks to add a business, brand or account to the competitors they track, which words are its name? Pick none when it names none.", {
      ...names,
      none: "The message names no business, or asks for something else.",
    });
  }
  return { state, questions };
}

const LAST_NOUN: Record<Format, string> = { post: "post", carousel: "carousel", script: "script", slideshow: "slideshow", wall: "wall of text", speaking: "talking video", explainer: "explainer video", image: "picture" };
/** The longest message the subject and name questions read: a make or an add is short, a pasted chat is not. */
export const SUBJECT_WORDS = 30;
export const NAME_WORDS = 15;
const wordsOf = (m: string) => m.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}@]+|[^\p{L}\p{N}]+$/gu, "")).filter(Boolean);
/** Each ending of the message from its second word, keyed by that word's place: Jev picks where the topic starts. */
export function endings(message: string): Record<string, string> {
  const w = wordsOf(message);
  if (w.length < 2 || w.length > SUBJECT_WORDS) return {};
  return Object.fromEntries(w.slice(1).map((_, i) => [`t${i + 2}`, w.slice(i + 1).join(" ")]));
}
/** Every run of 1 to 4 words, for a short message with no link or @handle (those name the competitor already). */
export function spans(message: string): Record<string, string> {
  const w = wordsOf(message);
  if (!w.length || w.length > NAME_WORDS || /https?:\/\/|(^|\s)@[A-Za-z0-9._]{2,}/i.test(message)) return {};
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  for (let i = 0; i < w.length; i++)
    for (let n = 1; n <= 4 && i + n <= w.length; n++) {
      const text = w.slice(i, i + n).join(" ");
      if (seen.has(text.toLowerCase())) continue;
      seen.add(text.toLowerCase());
      out[`n${i + 1}_${n}`] = text;
    }
  return out;
}

/**
 * Agent mode's answer: every slot Jev is sure of, and Jev's probability on every question asked. The options read are the
 * ones `actAsk` offered for this body, so a stray answer (approve with nothing pending, edit with nothing open) is never taken.
 */
const BARE_ACK = /^(ok|okay|k|kk|noted|got it|thanks|thank you|ty)[.!]*$/i;

export function agentPick(answers: Record<string, JevAnswer> | null, body: ActBody): { pick: AgentPick | null; p: AgentP } {
  const { questions } = actAsk(body, true);
  const read = (id: string) => {
    const q = questions[id] as { criteria?: Record<string, unknown> } | undefined;
    const c = q?.criteria ? choiceOf(answers, id, Object.keys(q.criteria)) : null;
    const p = c ? answers?.[id]?.probabilities?.[c] : undefined;
    return c && typeof p === "number" ? { c, p } : null;
  };
  const p = Object.fromEntries(SLOTS.map((k) => [k, read(k)?.p ?? null])) as AgentP;
  if (!answers) return { pick: null, p };
  /** Jev's pick at `min` or more, null for an option that says nothing. */
  const at = (id: string, min = PICK_MIN) => {
    const r = read(id);
    return r && r.p >= min && r.c !== "none" && r.c !== "any" && !(r.c === "all" && id !== "scope") ? r.c : null;
  };
  const index = (k: string | null) => (k ? Number(k.slice(1)) - 1 : null);
  const number = (k: string | null) => (k ? Number(k) : null);
  const picked = at("act", read("act")?.c === "approve" ? APPROVE_MIN : ACT_MIN) as AgentAct | null;
  // Leo's standing rule: a bare ok is noted, never go, so no score lets it approve a paid card
  const act = picked === "approve" && BARE_ACK.test(body.message.trim()) ? null : picked;
  const which = at("which");
  /** A words question's option back to its words; "last" stays the key. */
  const told = (id: "subject" | "name") => {
    const k = at(id);
    return k === "last" ? "last" : k ? String((questions[id] as { criteria: Record<string, unknown> }).criteria[k]) : null;
  };
  return {
    pick: {
      act,
      format: at("format") as Format | null,
      length: number(at("length")),
      who: index(at("who")),
      audience: index(at("audience")),
      weeks: number(at("weeks")),
      pace: number(at("pace")),
      slide: index(at("slide")),
      which: which === "last" ? "last" : index(which),
      skill: index(at("skill", SKILL_MIN)),
      post: index(at("post")),
      day: at("day"),
      time: at("time"),
      scope: at("scope") as Scope | null,
      subject: told("subject"),
      name: told("name"),
    },
    p,
  };
}
