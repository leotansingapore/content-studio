// Pure logic for engage-assist, the drafts on the Engage page (/recruit/engage).
// The consultant pastes text in and copies drafts out: nothing here posts,
// comments or messages (docs/social-api-app-review.md). Jev (pinned
// jev-1.13.0) does the sorting; OpenAI (the audit's key) writes the words.
// Each threshold sits beside its constant with the shadow check it was set
// from. No Deno or npm imports, so vitest covers it.
//
// Mode "replies": the comments under the consultant's own post. Jev sorts each
// into potential client, adds something, peer, support or noise; the drafts
// come back clients first, and noise gets none.
// Mode "dms": direct messages. Jev sorts each into lead, recruiter, peer,
// favour or spam and flags automated sequences; spam and automated ones get
// no draft. A lead's draft steers to the goal the consultant picked.
// Mode "thread": one conversation, both sides, marked by the consultant (not
// guessed). One draft answers their latest message in the context of the last
// MAX_THREAD messages and steers to the picked goal. Jev decides only whether to escalate.
// Mode "comments": someone else's post (or 2-10 of them). Jev picks which kinds
// of comment fit; the drafts are two comments of different kinds for one post,
// one each for a batch.
// Mode "connect": a LinkedIn connection note under 200 characters, the first
// message after they accept and two follow-ups. Nothing is decided, so no Jev.
// Replies, DMs and a conversation: Jev also asks whether each one should be
// handled personally (a complaint, a claim, a legal or medical question, press,
// a minor, harassment, or a topic the consultant added). Those go to a pile of
// their own, first, with the topic as the reason and no draft. Without Jev's
// answer nothing is escalated: no keyword guess.
// Ported from Jakeschincariol/linkedin-agent-skill@add2c23 li-reply and
// li-inbox, li-comment and li-dm (MIT), rewritten for Singapore financial consultants.

import { choiceOf, noulOf, type JevAnswer, type JevQuestion } from "../_shared/jev.ts";
import { complianceIssues, parseJsonObject } from "../_shared/socialAudit.ts";
import { mostlyEnglish } from "../post-score/logic.ts";

export const MODES = ["replies", "dms", "thread", "comments", "connect"] as const;
export type EngageMode = (typeof MODES)[number];

export const MAX_ITEMS = 30;
export const MAX_ITEM_CHARS = 1000;
export const MAX_POST_CHARS = 3000;
const MAX_NAME = 60;

/** One pasted comment or message: who wrote it (when given) and what it says. */
export interface Pasted {
  name: string;
  text: string;
}

export type EngageRequest =
  | { mode: "replies"; post: string; comments: Pasted[]; topics: string[] }
  | { mode: "dms"; messages: Pasted[]; goal: DmGoal; topics: string[] }
  | { mode: "thread"; lines: ThreadLine[]; goal: DmGoal; topics: string[] }
  | { mode: "comments"; posts: Pasted[] }
  | { mode: "connect"; name: string; about: string; reason: string; goal: ConnectGoal };

/** Posts to comment on in one run: one gets two comments, a batch one each. */
export const MAX_POSTS = 10;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function pastedList(v: unknown, max = MAX_ITEM_CHARS): Pasted[] {
  return (Array.isArray(v) ? v : [])
    .map((x) => {
      const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
      return { name: str(o.name, MAX_NAME), text: str(o.text, max) };
    })
    .filter((p) => p.text);
}

export function parseEngageRequest(raw: unknown): { ok: true; request: EngageRequest } | { ok: false; error: string } {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (b.mode === "replies") {
    const comments = pastedList(b.comments);
    if (!comments.length) return { ok: false, error: "Paste at least one comment." };
    if (comments.length > MAX_ITEMS) return { ok: false, error: `Paste up to ${MAX_ITEMS} comments at a time.` };
    return { ok: true, request: { mode: "replies", post: str(b.post, MAX_POST_CHARS), comments, topics: topicList(b.topics) } };
  }
  if (b.mode === "dms") {
    const messages = pastedList(b.messages);
    if (!messages.length) return { ok: false, error: "Paste at least one message." };
    if (messages.length > MAX_ITEMS) return { ok: false, error: `Paste up to ${MAX_ITEMS} messages at a time.` };
    return { ok: true, request: { mode: "dms", messages, goal: dmGoal(b.goal), topics: topicList(b.topics) } };
  }
  if (b.mode === "thread") {
    const lines = (Array.isArray(b.lines) ? b.lines : [])
      .flatMap((x) => pastedList([x]).map((p) => ({ ...p, me: (x as { me?: unknown } | null)?.me === true })))
      .slice(-MAX_THREAD);
    if (!lines.length) return { ok: false, error: "Paste the conversation." };
    if (lines[lines.length - 1].me) return { ok: false, error: "The last message is yours. Wait for their reply." };
    return { ok: true, request: { mode: "thread", lines, goal: dmGoal(b.goal), topics: topicList(b.topics) } };
  }
  if (b.mode === "comments") {
    const posts = pastedList(b.posts, MAX_POST_CHARS);
    if (!posts.length) return { ok: false, error: "Paste the post you want to comment on." };
    if (posts.length > MAX_POSTS) return { ok: false, error: `Paste up to ${MAX_POSTS} posts at a time.` };
    return { ok: true, request: { mode: "comments", posts } };
  }
  if (b.mode === "connect") {
    const name = str(b.name, MAX_NAME);
    const reason = str(b.reason, 500);
    if (!name) return { ok: false, error: "Add who you are writing to." };
    if (!reason) return { ok: false, error: "Add why you are reaching out to them now." };
    const goal = CONNECT_GOALS.find((g) => g === b.goal) ?? "know";
    return { ok: true, request: { mode: "connect", name, about: str(b.about, 200), reason, goal } };
  }
  return { ok: false, error: "Pick what to draft." };
}

/**
 * Whether Jev reads this text: mostly English, or no letters at all (an emoji,
 * "+1"). Text mostly in another script stays "not sorted": no keyword guess.
 */
export const jevReads = (text: string) => !/\p{L}/u.test(text) || mostlyEnglish(text);

// ---- Handle yourself: escalated, never drafted ------------------------------------

/** What always goes to the consultant (kevinbadi/social-agents respond-to-comments' escalation list, for Singapore advisers). */
export const ESCALATE_TOPICS = ["complaint", "billing", "claim", "legal", "medical", "press", "minor", "harassment"] as const;
type BuiltInTopic = (typeof ESCALATE_TOPICS)[number];

const TOPIC_CRITERIA: Record<BuiltInTopic, string> = {
  complaint: "A complaint about the consultant, their service or a bad experience with them.",
  billing: "A refund, a fee, a charge or a billing or payment problem.",
  claim: "An insurance claim or policy dispute: a claim turned down, delayed or argued over, or a policy lapsed, cancelled or changed against their wishes.",
  legal: "A legal question or a legal threat: lawyers, suing, a will or estate dispute, a contract they want to get out of.",
  medical: "A medical question, or their own or a family member's health condition or diagnosis.",
  press: "A request from a journalist, the press or the media.",
  minor: "The writer says or seems to be under 18, or a child's safety is at risk. A parent asking how to cover their children is not this.",
  harassment: "Harassment of a specific person, or a threat.",
};

/** The reason shown on an escalated item, by topic. */
export const TOPIC_LABEL: Record<BuiltInTopic, string> = {
  complaint: "A complaint",
  billing: "Refund, fees or billing",
  claim: "A claim or policy dispute",
  legal: "A legal question",
  medical: "A medical question",
  press: "Press or media",
  minor: "Involves a minor",
  harassment: "Harassment or a threat",
};

/** Topics a consultant adds (saved per profile on the page): at most this many, each this long. */
export const MAX_TOPICS = 10;
export const MAX_TOPIC_CHARS = 60;

function topicList(v: unknown): string[] {
  const out: string[] = [];
  for (const t of Array.isArray(v) ? v : []) {
    const s = str(t, MAX_TOPIC_CHARS);
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out.slice(0, MAX_TOPICS);
}

/** Every topic as a Choice option: the built-in ones, then the consultant's as u0, u1... */
const topicOptions = (topics: string[]): Record<string, string> => ({
  ...TOPIC_CRITERIA,
  ...Object.fromEntries(topics.map((t, i) => [`u${i}`, `About ${t}.`])),
});

// Set from a shadow check on 2026-10-11 against jev-1.13.0, three runs over 36
// messages written for it, sent as the DMs mode sends them (kind, automated,
// escalate and topic in one request; 144 questions answered in 1.2-2.5 s, 30
// DMs in 0.9 s): 15 to escalate (fees and refunds, a turned-down claim, a
// lapsed policy, "can I sue", a cancer diagnosis, a Straits Times reporter, a
// 15-year-old, two threats, a complaint, "divorce" as an added topic) and 21
// not (leads, a parent covering their kids, a 68-year-old's premium, praise,
// spam, peers, recruiters). Escalate scored 0.90-0.97, the rest 0.03-0.66 (the
// highest: "Mine went up too ... am I overpaying?" and "kena increase sia",
// read as billing). The topic Choice named a fitting topic on all 15.
/**
 * A text goes to Handle yourself from this p(escalate) up. Between the two
 * groups with room on both sides; a troll ("advisers just want commission",
 * 0.65-0.67) and "Do you cover people with diabetes?" (0.54-0.59) stay in
 * their normal pile.
 */
export const ESCALATE_MIN = 0.8;

/**
 * Per text Jev reads, a Noul (e<i>): handle it personally? and a Choice (t<i>):
 * which topic, read only when the Noul says yes, as the one-line reason.
 * `where` says what the text is, e.g. "a comment under their post".
 */
export function escalateQuestions(texts: Pasted[], topics: string[], where: string): Record<string, JevQuestion> {
  const q: Record<string, JevQuestion> = {};
  const options = topicOptions(topics);
  const list = Object.values(options);
  texts.forEach((x, i) => {
    if (!jevReads(x.text)) return;
    const about = { text: x.text, from: x.name || "(no name)" };
    q[`e${i}`] = {
      type: "noul",
      instructions: {
        ...about,
        topics: list,
        question: `A Singapore financial consultant got \`text\` as ${where}. Does it raise any of \`topics\`, so the consultant should handle it personally instead of answering with a drafted reply?`,
      },
      criteria: {
        true: "It raises one of the topics, even in passing or as a question.",
        false: "None of the topics: a general question about money, insurance, CPF or the post, someone asking for help with their own or their family's plans, praise, a peer, a recruiter, spam or a sales pitch.",
      },
    };
    q[`t${i}`] = {
      type: "choice",
      instructions: { ...about, question: `A Singapore financial consultant got \`text\` as ${where}. Which topic does it raise most?` },
      criteria: options,
    };
  });
  return q;
}

/** Each text's reason to handle it yourself, or null: not escalated, or Jev did not answer. */
export function readEscalations(answers: Record<string, JevAnswer> | null, count: number, topics: string[]): (string | null)[] {
  const labels: Record<string, string> = { ...TOPIC_LABEL, ...Object.fromEntries(topics.map((t, i) => [`u${i}`, t])) };
  return Array.from({ length: count }, (_, i) => {
    const p = noulOf(answers, `e${i}`);
    if (p === null || p < ESCALATE_MIN) return null;
    const t = choiceOf(answers, `t${i}`, Object.keys(labels));
    return t ? labels[t] : "Sensitive";
  });
}

// ---- Mode "replies" -----------------------------------------------------------

export const COMMENT_KINDS = ["client", "substantive", "peer", "support", "noise"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number] | "unsorted";
/** The order the drafts come back in: clients first, noise last. */
export const REPLY_ORDER: CommentKind[] = ["client", "substantive", "peer", "support", "unsorted", "noise"];

// Set from a shadow check on 2026-10-08 against jev-1.13.0, four runs over 40
// comments written under one hospital-plan renewal post: 12 clear clients
// (their own situation, the CTA keyword, "are you hiring?"), 7 adding
// something, 3 peers, 10 support, 7 noise (a poaching adviser and a troll
// among them) and 3 that sit between client and something else. Jev's top
// pick was right on 38-39 of 40; reversing the option order moved no pick. A
// question is about 320 Jev input tokens.
/**
 * A comment goes to Potential client when p(client) is at least this, even
 * when another kind is likelier: clients are answered first, and a missed one
 * costs more than one more reply. Non-clients reached 0.19 at most (a
 * MediShield question), the clear clients 0.93-1.00, and the in-between ones
 * 0.42-0.60 ("Thanks! Sent you a DM", "lol my premium tripled", "Which
 * insurer is the cheapest?"). With it, 40 of 40 in every run.
 */
export const CLIENT_MIN = 0.35;

const COMMENT_CRITERIA: Record<(typeof COMMENT_KINDS)[number], string> = {
  client:
    "A possible client or recruit: they describe their own or their family's money, insurance, CPF or retirement situation or worry, ask how to get help with it or about joining the writer's team, or comment the keyword the post asked for to get something.",
  substantive:
    "Adds to the discussion about the topic: a fact, a number, an example, a disagreement made in good faith, a correction, or a question about how the topic works in general.",
  peer: "Another professional in the same field, such as a fellow adviser, agency leader or finance writer, speaking as a colleague.",
  support: "Short praise, agreement or thanks, emoji only, or tagging a friend, with nothing new to answer.",
  noise:
    "Not worth a reply: a sales pitch, self-promotion, another adviser inviting the readers to contact them instead, spam, a scam, or a hostile attack made in bad faith.",
};

export const commentState = (post: string) => ({ post: post || "(the post was not pasted)" });

/** One Choice per comment Jev reads, keyed c<index>. */
export function commentQuestions(comments: Pasted[]): Record<string, JevQuestion> {
  const q: Record<string, JevQuestion> = {};
  comments.forEach((c, i) => {
    if (!jevReads(c.text)) return;
    q[`c${i}`] = {
      type: "choice",
      instructions: {
        comment: c.text,
        commenter: c.name || "(no name)",
        question: "This comment was left under `post`, which a Singapore financial consultant wrote. Which kind of comment is `comment`?",
      },
      criteria: COMMENT_CRITERIA,
    };
  });
  return q;
}

/** Each comment's kind; "unsorted" when Jev did not read it or gave no answer. */
export function readCommentKinds(answers: Record<string, JevAnswer> | null, comments: Pasted[]): CommentKind[] {
  return comments.map((_, i) => {
    const pick = choiceOf(answers, `c${i}`, COMMENT_KINDS);
    if (!pick) return "unsorted";
    const pClient = answers?.[`c${i}`]?.probabilities?.client;
    return typeof pClient === "number" && pClient >= CLIENT_MIN ? "client" : pick;
  });
}

/**
 * The house answers to recruit questions (src/data/recruitKit.ts REPLY_ANSWERS;
 * a test keeps them identical), so a comment or DM asking one gets the same line.
 */
export const HOUSE_ANSWERS: { q: string; a: string }[] = [
  { q: "Is this sales?", a: "Part of it is. Most of it is advising people and building a team. Can I show you what a normal week looks like?" },
  { q: "What if I can't make it?", a: "Fair question. Let me walk you through the first 90 days and the support you'd get. Then you decide." },
  { q: "How much can I earn?", a: "It depends on what you build, so I won't promise a number. Let's go through how it works, face to face." },
];

const COMPLIANCE_LINES = [
  "Never promise returns or results, never say guaranteed, risk-free or best, and never name an insurer, a fund or a product.",
  "Never invent a fact, number, client or experience. Where the writer's own figure or story would help, write [your number] or [your example] for them to fill in.",
  "No em dashes, no hashtags, no emoji.",
];

const houseLines = () => [
  "When someone asks one of these, answer in this spirit:",
  ...HOUSE_ANSWERS.map((h) => `- "${h.q}" -> "${h.a}"`),
];

const KIND_BRIEF: Record<CommentKind, string> = {
  client:
    "client (a possible client or recruit): a warm public reply that answers in general terms, then offers to carry on in a DM in one sentence. Also write dm: the first private message to send them, 2 to 4 sentences, where anything personal, a checklist or a link goes (write [link] for a link).",
  substantive:
    "substantive (adds a fact, an example or a disagreement): the longest reply on the thread. Agree with the true part first, in their words, then add one thing or hold your view calmly.",
  peer: "peer (a fellow adviser or professional): reply as a colleague and give them something back, a detail or a real question.",
  support: "support (praise, an emoji, a tag): 3 to 8 words.",
  unsorted: "unsorted (not in English): a short reply in the comment's own language.",
  noise: "",
};

export function buildRepliesPrompt(post: string, comments: Pasted[], kinds: CommentKind[], escalated: (string | null)[] = []): { system: string; user: string } {
  const system = [
    "You draft replies a Singapore financial consultant will paste under their own social post. They read each draft and post it themselves.",
    "Each comment comes with its kind. Write for each:",
    ...REPLY_ORDER.filter((k) => KIND_BRIEF[k]).map((k) => `- ${KIND_BRIEF[k]}`),
    "Every reply:",
    "- Starts with their first name once, with no exclamation mark after it. No name given: no name.",
    "- Matches their length: a one-line comment gets a one-line reply. Plain, warm, everyday words.",
    "- Holds no link. A link goes in the DM.",
    "- Gives no advice on their own situation in public: no product, no amount, no 'you should'. General facts are fine; their situation goes to the DM.",
    "- Asked which insurer or product to pick: offer to compare options with them in a DM, without saying what you are not allowed to say.",
    ...COMPLIANCE_LINES.map((l) => `- ${l}`),
    ...houseLines(),
    'Reply with JSON only: {"replies":[{"id":"c0","reply":"...","dm":"..."}]}, one per comment id given, dm only for client.',
  ].join("\n");
  const lines = comments.flatMap((c, i) => (kinds[i] === "noise" || escalated[i] ? [] : [`[c${i}] ${kinds[i]} | ${c.name || "(no name)"}: ${c.text.replace(/\s+/g, " ")}`]));
  const user = [`The post:\n${post || "(not pasted)"}`, "", "The comments:", ...lines].join("\n");
  return { system, user };
}

/**
 * A draft cleaned for pasting: no em or en dashes, straight quotes, no
 * hashtags, tidy spaces, cut at a word under `max`. `links: false` takes out
 * any web address (a public reply never holds one). Empty when it breaks a
 * compliance rule, so a draft that promises or guarantees never reaches the page.
 */
export function cleanDraft(v: unknown, max: number, opts: { links?: boolean } = {}): string {
  if (typeof v !== "string") return "";
  let s = v
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "$1");
  if (opts.links === false) s = s.replace(/\b(?:https?:\/\/|www\.)\S+/gi, "");
  s = s
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").replace(/ ([,.!?])/g, "$1").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (s.length > max) s = s.slice(0, max).replace(/\s+\S*$/, "").trim();
  return complianceIssues(s).length ? "" : s;
}

export interface ReplyItem extends Pasted {
  /** Where it was in the paste, from 0. */
  i: number;
  kind: CommentKind;
  /** Null for noise and escalated ones; "" when no usable draft came back. */
  reply: string | null;
  /** The first DM, for potential clients only. */
  dm?: string;
  /** Why to handle it yourself (no draft); absent when it is not escalated. */
  escalate?: string;
}

/** The model's {"replies":[{id, ...}]} keyed by id. */
function repliesById(content: string | null): Map<string, Record<string, unknown>> {
  const obj = content ? parseJsonObject(content) : null;
  const byId = new Map<string, Record<string, unknown>>();
  for (const r of Array.isArray(obj?.replies) ? obj.replies : []) {
    const o = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
    if (typeof o.id === "string") byId.set(o.id, o);
  }
  return byId;
}

/** The comments with their drafts: escalated ones first, then clients, in paste order within a kind. */
export function readReplies(content: string | null, comments: Pasted[], kinds: CommentKind[], escalated: (string | null)[] = []): ReplyItem[] {
  const byId = repliesById(content);
  const rank = (x: ReplyItem) => (x.escalate ? -1 : REPLY_ORDER.indexOf(x.kind));
  const items: ReplyItem[] = comments.map((c, i) => {
    const kind = kinds[i];
    if (escalated[i]) return { ...c, i, kind, reply: null, escalate: escalated[i]! };
    if (kind === "noise") return { ...c, i, kind, reply: null };
    const r = byId.get(`c${i}`);
    const item: ReplyItem = { ...c, i, kind, reply: cleanDraft(r?.reply, 700, { links: false }) };
    if (kind === "client") item.dm = cleanDraft(r?.dm, 900);
    return item;
  });
  return items.sort((a, b) => rank(a) - rank(b) || a.i - b.i);
}

// ---- Mode "dms" -----------------------------------------------------------------

export const DM_KINDS = ["lead", "recruiter", "peer", "favour", "spam"] as const;
export type DmKind = (typeof DM_KINDS)[number] | "unsorted";
/** The order the messages come back in: leads first, spam last. */
export const DM_ORDER: DmKind[] = ["lead", "recruiter", "peer", "favour", "unsorted", "spam"];

// Set from a shadow check on 2026-10-08 against jev-1.13.0, three runs over 33
// direct messages written for it: 9 leads (their own situation, a career
// switcher, "send me the checklist"), 5 recruiters, 6 peers, 6 favours, 7
// spam, 7 of the 33 automated templates. Jev's top pick for the kind was right
// on 33 of 33 in every run (leads 0.67-1.00; a non-lead reached 0.40 at most),
// so the kind needs no threshold. About 520 Jev input tokens a message.
/**
 * p(automated sequence) at or above this flags a message: it gets no draft.
 * Templates scored 0.89-0.97 (a booking link, {first_name}, "just bumping
 * this", an agency's blast), two short openers 0.75-0.84 (missed, both spam
 * or a vague recruiter). Written-for-you messages: leads 0.10-0.37, peers and
 * favours up to 0.72, named recruiters up to 0.80; only a crypto pitch went
 * over (0.95), which is spam anyway.
 */
export const AUTOMATED_MIN = 0.85;

const DM_CRITERIA: Record<(typeof DM_KINDS)[number], string> = {
  lead:
    "A possible client or recruit: they describe their own or their family's money, insurance, CPF or retirement situation, ask for help with it or for something the writer offered in a post, ask about the writer's services, or are thinking about joining the writer's team or switching into this career.",
  recruiter: "Offers the writer a job or a move: a recruiter, headhunter, bank, insurer or another agency with a role or better terms.",
  peer: "Someone in the same field or a real contact writing as a colleague: swapping notes, a compliment with substance, an invitation to work on something together.",
  favour:
    "Asks the writer for time or help with something of the asker's own that is not about becoming a client or joining the team: tips on their marketing, a share, a recommendation, an introduction, a survey.",
  spam: "Not worth a reply: selling the writer a service such as leads, marketing or websites, get-rich offers, scams, fake friendship, or a bump of an earlier unanswered pitch.",
};

/** A Choice (k<index>) and an automated Noul (a<index>) per message Jev reads. */
export function dmQuestions(messages: Pasted[]): Record<string, JevQuestion> {
  const q: Record<string, JevQuestion> = {};
  messages.forEach((m, i) => {
    if (!jevReads(m.text)) return;
    const about = { message: m.text, sender: m.name || "(no name)" };
    q[`k${i}`] = {
      type: "choice",
      instructions: { ...about, question: "A Singapore financial consultant received `message` as a direct message on LinkedIn or Instagram. Which kind of message is it?" },
      criteria: DM_CRITERIA,
    };
    q[`a${i}`] = {
      type: "noul",
      instructions: {
        ...about,
        question: "Was `message` most likely sent by an automated outreach sequence or as a template to many people, rather than written by a person for this reader?",
      },
      criteria: {
        true: "Template signs: nothing only this reader would recognise, 'quick question' with no question, 'I noticed you're in {industry}', a fill-in field such as {first_name}, a booking link in a first message, or a bump such as 'just bumping this' or 'did you see my last message'.",
        false: "Written for this reader: mentions something specific about them or their post, a real shared context, or asks a specific question of the sender's own.",
      },
    };
  });
  return q;
}

/** Each message's kind and whether it looks automated; "unsorted" when Jev did not read it. */
export function readDmKinds(answers: Record<string, JevAnswer> | null, messages: Pasted[]): { kind: DmKind; automated: boolean }[] {
  return messages.map((_, i) => {
    const p = answers?.[`a${i}`]?.noul;
    return { kind: choiceOf(answers, `k${i}`, DM_KINDS) ?? "unsorted", automated: typeof p === "number" && p >= AUTOMATED_MIN };
  });
}

/**
 * Where a DM draft steers, picked by the consultant (social-agents' objective:
 * book calls, give free value, build rapport). No draft holds a real link: a
 * guide is [guide link] for them to fill in.
 */
export const DM_GOALS = ["call", "guide", "rapport"] as const;
export type DmGoal = (typeof DM_GOALS)[number];
const dmGoal = (v: unknown): DmGoal => DM_GOALS.find((g) => g === v) ?? "call";

const GOAL_ASK: Record<DmGoal, string> = {
  call: "one small ask: a 15-minute call or a coffee at [time 1] or [time 2], written exactly like that for them to fill in. Never name a day or time yourself.",
  guide: "offer them the guide or checklist that fits what they asked, as [guide link], written exactly like that for them to fill in. Never write a web address yourself.",
  rapport: "no ask and no pitch: pick up one detail they gave and end with one easy question about them.",
};

const DM_BRIEF: Record<DmKind, string> = {
  lead: "lead (a possible client or recruit): answer what they asked in plain, general terms, then ",
  recruiter: "recruiter (offers you a role): short and warm, commits to nothing: thanks, not looking right now, happy to point someone their way.",
  peer: "peer (a colleague or contact): reply like a person, answer their question or take up their idea, with [time 1] or [time 2] if you meet.",
  favour: "favour (asks for your time or help): if it is quick and specific, say yes and do it; if it is open-ended, decline in one warm sentence and give the one answer you would have given.",
  unsorted: "unsorted (not in English): a short reply in the message's own language.",
  spam: "",
};

/** The rules every DM draft keeps, in a batch or a conversation. */
const DM_RULES = [
  "- Holds no booking or calendar link, and never puts income or earnings figures in writing.",
  ...COMPLIANCE_LINES.map((l) => `- ${l}`),
];

/** A message's sorting: its kind, whether it looks automated, and why to handle it yourself (when escalated). */
export type DmSort = { kind: DmKind; automated: boolean; escalate?: string | null };

/** No draft for spam, automated or escalated messages. */
export const undrafted = (x: DmSort) => x.kind === "spam" || x.automated || Boolean(x.escalate);

export function buildDmsPrompt(messages: Pasted[], sorted: DmSort[], goal: DmGoal = "call"): { system: string; user: string } {
  const brief = (k: DmKind) => (k === "lead" ? `${DM_BRIEF.lead}${GOAL_ASK[goal]} Nothing personal is advised before you have met.` : DM_BRIEF[k]);
  const system = [
    "You draft direct-message replies for a Singapore financial consultant. They read each draft and send it themselves.",
    "Each message comes with its kind. Write for each:",
    ...DM_ORDER.filter((k) => DM_BRIEF[k]).map((k) => `- ${brief(k)}`),
    "Every reply:",
    "- Is 2 to 4 sentences, starts with their first name once, with no exclamation mark after it. No name given: no name.",
    "- Matches their energy: a short message gets a short reply. Plain, warm, everyday words.",
    ...DM_RULES,
    ...houseLines(),
    'Reply with JSON only: {"replies":[{"id":"m0","reply":"..."}]}, one per message id given.',
  ].join("\n");
  const lines = messages.flatMap((m, i) =>
    undrafted(sorted[i]) ? [] : [`[m${i}] ${sorted[i].kind} | ${m.name || "(no name)"}: ${m.text.replace(/\s+/g, " ")}`],
  );
  return { system, user: ["The messages:", ...lines].join("\n") };
}

export interface DmItem extends Pasted {
  i: number;
  kind: DmKind;
  automated: boolean;
  /** Null for spam, automated and escalated messages; "" when no usable draft came back. */
  reply: string | null;
  /** Why to handle it yourself (no draft); absent when it is not escalated. */
  escalate?: string;
}

/** The messages with their drafts: escalated ones first, then leads; spam and automated ones last, undrafted. */
export function readDmReplies(content: string | null, messages: Pasted[], sorted: DmSort[]): DmItem[] {
  const byId = repliesById(content);
  const rank = (x: DmItem) => (x.escalate ? -1 : x.automated ? DM_ORDER.length : DM_ORDER.indexOf(x.kind));
  return messages
    .map((m, i): DmItem => {
      const { kind, automated, escalate } = sorted[i];
      if (escalate) return { ...m, i, kind, automated, reply: null, escalate };
      // links: false, the model was given no address, so any it writes is made up
      return { ...m, i, kind, automated, reply: undrafted(sorted[i]) ? null : cleanDraft(byId.get(`m${i}`)?.reply, 900, { links: false }) };
    })
    .sort((a, b) => rank(a) - rank(b) || a.i - b.i);
}

// ---- Mode "thread" ----------------------------------------------------------------

/** The messages a conversation draft reads, the latest kept (insta-p8 reads the last 10). */
export const MAX_THREAD = 10;

/** One message in a pasted conversation; `me` is the consultant's own, as they marked it. */
export interface ThreadLine extends Pasted {
  me: boolean;
}

/** Their name: the first one given on their side of the conversation. */
const theirName = (lines: ThreadLine[]) => lines.find((l) => !l.me && l.name)?.name ?? "";

export function buildThreadPrompt(lines: ThreadLine[], goal: DmGoal): { system: string; user: string } {
  const system = [
    "You draft one direct-message reply for a Singapore financial consultant, in a conversation they are having with one person. They read the draft and send it themselves.",
    "The conversation comes oldest first. Them: the other person. You: the consultant.",
    "Answer what they wrote since the consultant's last message, in the context of the whole conversation. Never repeat what the consultant already said or asked, and never introduce the consultant again.",
    `Once you have answered them, steer toward the consultant's goal: ${GOAL_ASK[goal]}`,
    "The reply:",
    "- Is 1 to 4 sentences and matches their energy. Plain, warm, everyday words, in the language of their last message.",
    "- Uses their first name at most once, with no exclamation mark after it, and only when it is given.",
    "- Gives no advice on their own situation in writing: no product, no amount, no 'you should'. General facts are fine.",
    ...DM_RULES,
    ...houseLines(),
    'Reply with JSON only: {"reply":"..."}',
  ].join("\n");
  const name = theirName(lines);
  const said = lines.map((l) => `${l.me ? "You" : "Them"}: ${l.text.replace(/\s+/g, " ")}`);
  return { system, user: [...(name ? [`Their name: ${name}`] : []), "The conversation:", ...said].join("\n") };
}

export interface ThreadItem extends Pasted {
  /** Where their latest message sits among the lines sent, from 0. */
  i: number;
  /** Null when escalated; "" when no usable draft came back. */
  reply: string | null;
  /** Why to handle it yourself (no draft); absent when it is not escalated. */
  escalate?: string;
}

/**
 * What Jev reads to escalate a conversation: their side only, latest last,
 * as one text (the consultant's own words raise nothing).
 */
export const threadText = (lines: ThreadLine[]): Pasted => ({ name: theirName(lines), text: lines.filter((l) => !l.me).map((l) => l.text).join("\n") });

/** The one draft, shown under their latest message; none when the conversation is escalated. */
export function readThread(content: string | null, lines: ThreadLine[], escalate: string | null = null): ThreadItem {
  const i = lines.length - 1;
  const item = { name: theirName(lines), text: lines[i].text, i };
  if (escalate) return { ...item, reply: null, escalate };
  const o = content ? parseJsonObject(content) : null;
  return { ...item, reply: cleanDraft(o?.reply, 900, { links: false }) };
}

// ---- Mode "comments" ------------------------------------------------------------

export const COMMENT_TYPES = ["number", "question", "disagree", "result"] as const;
export type CommentType = (typeof COMMENT_TYPES)[number];

const TYPE_CRITERIA: Record<CommentType, string> = {
  number: "Add a number: the post makes a claim the commenter could back up or test with a figure from their own work with clients.",
  question: "Ask the real question: the post skips the hard part or leaves an obvious next question a reader would want answered.",
  disagree: "Respectfully disagree: the post makes a claim a thoughtful adviser could reasonably push back on, in part or in full.",
  result: "Share your own result: the post describes something the commenter has likely done or seen with clients, so a short account of what happened to them adds most.",
};

// Shadow check on 2026-10-08 against jev-1.13.0: 10 posts written for it (a
// retirement claim, "whole life is a waste", a client's CI payout, an ILP
// list, a career switch, an MDRT thank-you, a protection-gap claim, "emergency
// fund first", a hiring post, "50/30/20 fails in Singapore"). Jev leans toward
// the option listed first: "disagree" rose from 0.28 to 0.49 and 0.33 to 0.47
// when it came first. So the Choice is asked in both orders and averaged, like
// the hook pick; averaged, the top two held an acceptable kind on 9 of 10
// posts and the top one on 8. No threshold: the likeliest kinds are taken as
// they come. About 290 Jev input tokens a post per order.
/** A Choice per post in written order (f<i>) and reversed (r<i>). */
export function typeQuestions(posts: Pasted[]): Record<string, JevQuestion> {
  const q: Record<string, JevQuestion> = {};
  const ask = (p: Pasted, order: CommentType[]): JevQuestion => ({
    type: "choice",
    instructions: {
      post: p.text,
      author: p.name || "(no name)",
      question: "A Singapore financial consultant wants to leave a comment under `post` that the author and their readers find useful. Which kind of comment would add the most?",
    },
    criteria: Object.fromEntries(order.map((t) => [t, TYPE_CRITERIA[t]])),
  });
  posts.forEach((p, i) => {
    if (!jevReads(p.text)) return;
    q[`f${i}`] = ask(p, [...COMMENT_TYPES]);
    q[`r${i}`] = ask(p, [...COMMENT_TYPES].reverse());
  });
  return q;
}

/** Without a pick (not English, or no answer from Jev): ask the real question, then share a result. */
export const UNSORTED_TYPES: CommentType[] = ["question", "result"];

/**
 * In a batch no kind is used for more than this share of the posts: in the
 * live check on 2026-10-08 four posts all came back "question", which reads
 * like a script. The likeliest pairs are placed first, the rest take their
 * next-likeliest kind.
 */
export const BATCH_SHARE_MAX = 0.5;

/**
 * The kinds to write for each post, likeliest first: two for a single post,
 * one each in a batch. `sorted` is false when Jev did not pick.
 */
export function readCommentTypes(answers: Record<string, JevAnswer> | null, posts: Pasted[]): { types: CommentType[]; sorted: boolean }[] {
  const ranked = posts.map((_, i) => {
    const f = answers?.[`f${i}`]?.probabilities;
    const r = answers?.[`r${i}`]?.probabilities;
    if (!f || !r) return null;
    return COMMENT_TYPES.map((t) => ({ t, p: ((f[t] ?? 0) + (r[t] ?? 0)) / 2 })).sort((a, b) => b.p - a.p);
  });
  if (posts.length === 1) return [ranked[0] ? { types: ranked[0].slice(0, 2).map((x) => x.t), sorted: true } : { types: UNSORTED_TYPES, sorted: false }];
  const cap = Math.max(1, Math.ceil(posts.length * BATCH_SHARE_MAX));
  const used = new Map<CommentType, number>();
  const pick = new Map<number, CommentType>();
  const pairs = ranked.flatMap((list, i) => (list ?? []).map((x) => ({ i, ...x }))).sort((a, b) => b.p - a.p);
  for (const { i, t } of pairs) {
    if (pick.has(i) || (used.get(t) ?? 0) >= cap) continue;
    pick.set(i, t);
    used.set(t, (used.get(t) ?? 0) + 1);
  }
  return posts.map((_, i) => (pick.has(i) ? { types: [pick.get(i)!], sorted: true } : { types: [UNSORTED_TYPES[0]], sorted: false }));
}

const TYPE_BRIEF: Record<CommentType, string> = {
  number: "number: add one figure from the consultant's own work that backs or tests the post's claim. Write it as [your number] for them to fill in, never a figure of your own.",
  question: "question: one specific question about the hard part the post skipped. No 'curious to hear'.",
  disagree: "disagree: agree with what is true first, for real, then say kindly where you see it differently and why.",
  result: "result: what happened with the consultant's own clients, in two sentences, as [your result] or [your example] where the detail goes, never a story of your own.",
};

export function buildCommentsPrompt(posts: Pasted[], picks: { types: CommentType[] }[]): { system: string; user: string } {
  const system = [
    "You draft comments a Singapore financial consultant will post under other people's LinkedIn or Instagram posts. They read each draft and post it themselves.",
    "Each post comes with the kinds of comment to write, one comment per kind:",
    ...COMMENT_TYPES.map((t) => `- ${TYPE_BRIEF[t]}`),
    "Every comment:",
    "- Is 2 to 4 sentences and makes one point that only fits under this post. Never restate the post.",
    "- Never opens with 'Great post', 'Love this', 'So true', 'Couldn't agree more', 'This resonates' or the author's name and an exclamation mark.",
    "- Holds no link, and gives the author's readers no advice on their own situation and no 'DM me'.",
    "- Never runs down another adviser, company or the author.",
    "- Is in the post's own language.",
    ...COMPLIANCE_LINES.map((l) => `- ${l}`),
    'Reply with JSON only: {"comments":[{"id":"p0","type":"number","text":"..."}]}, one per post id and kind given.',
  ].join("\n");
  const blocks = posts.map((p, i) => `[p${i}] kinds: ${picks[i].types.join(", ")} | by ${p.name || "(no name)"}\n${p.text}`);
  return { system, user: ["The posts:", ...blocks].join("\n\n") };
}

export interface CommentItem extends Pasted {
  i: number;
  /** False when Jev did not pick the kinds. */
  sorted: boolean;
  /** In the order Jev ranked the kinds; text "" when no usable draft came back. */
  comments: { type: CommentType; text: string }[];
}

/** Each post with its comment drafts, in paste order. */
export function readComments(content: string | null, posts: Pasted[], picks: { types: CommentType[]; sorted: boolean }[]): CommentItem[] {
  const obj = content ? parseJsonObject(content) : null;
  const got = new Map<string, unknown>();
  for (const c of Array.isArray(obj?.comments) ? obj.comments : []) {
    const o = c && typeof c === "object" ? (c as Record<string, unknown>) : {};
    if (typeof o.id === "string" && typeof o.type === "string" && !got.has(`${o.id}:${o.type}`)) got.set(`${o.id}:${o.type}`, o.text);
  }
  return posts.map((p, i) => ({
    ...p,
    i,
    sorted: picks[i].sorted,
    comments: picks[i].types.map((type) => ({ type, text: cleanDraft(got.get(`p${i}:${type}`), 700, { links: false }) })),
  }));
}

// ---- Mode "connect" -------------------------------------------------------------

/** LinkedIn's limit on a connection note. */
export const NOTE_MAX = 200;
export const CONNECT_GOALS = ["know", "recruit", "client", "referral"] as const;
export type ConnectGoal = (typeof CONNECT_GOALS)[number];

const GOAL_BRIEF: Record<ConnectGoal, string> = {
  know: "get to know them",
  recruit: "see if they might one day join the consultant's team. Come as a researcher, not a recruiter: the first message follows the spirit of this script, in its own words, with no job pitch:",
  client: "start a conversation that might one day make them a client. No pitch, no product.",
  referral: "build a relationship that might lead to referrals both ways.",
};

/**
 * The recruit kit's opening message (src/data/recruitKit.ts SEND_TEN_SCRIPT; a
 * test keeps them identical), the model for a first message to a possible recruit.
 */
export const SEND_TEN = "Hi [name]! I'm working on a content series about career crossroads for [your ONE candidate], speaking to 10 people with real stories. I've always found yours interesting. Could I borrow 20 minutes, purely to hear your story, no business talk? This week or next?";

export function buildConnectPrompt(r: { name: string; about: string; reason: string; goal: ConnectGoal }): { system: string; user: string } {
  const system = [
    "You write LinkedIn outreach for a Singapore financial consultant: a connection note, the first message after they accept, and two follow-ups. They send each one themselves.",
    `- note: under ${NOTE_MAX - 20} characters including spaces. One specific line about them from the reason given, one line on who the consultant is, and no ask.`,
    "- first: sent a day after they accept. 2 to 4 sentences. Picks up the same specific thing as the note, gives something before asking (a thought, a resource as [link], an answer), then one small ask such as a 15-minute call. No calendar link.",
    "- follow4: four days later if there is no reply. Adds one new thing taken from what you were given, or written as [your example] for them to fill in; never a conversation, client or event you made up, never 'just bumping this' or 'following up on my last message'. 1 to 3 sentences.",
    "- follow10: ten days later. Closes the loop kindly: says you will leave it here, and means it. 1 to 3 sentences.",
    "- Use their first name. Never invent a mutual connection, a shared school or something you read; use only the reason given. Never open with 'I hope this message finds you well'.",
    "- All four drafts: you know only their name, the line about them and the reason given. Nothing else exists: no other interest or post of theirs, and nothing the consultant ran, led, saw, heard or was told (a workshop, a talk, a client, an earlier chat, what other people found useful). Where the consultant's own experience would help, write [your example]. Never write 'I recently spoke with', 'as we discussed', 'I also noticed' or 'after a workshop I ran'.",
    "- Never put income or earnings figures in writing.",
    ...COMPLIANCE_LINES.map((l) => `- ${l}`),
    'Reply with JSON only: {"note":"...","first":"...","follow4":"...","follow10":"..."}',
  ].join("\n");
  const goal = r.goal === "recruit" ? `${GOAL_BRIEF.recruit} "${SEND_TEN}"` : GOAL_BRIEF[r.goal];
  const user = [`To: ${r.name}${r.about ? `, ${r.about}` : ""}`, `Why them, why now: ${r.reason}`, `What the consultant wants (never said outright): ${goal}`].join("\n");
  return { system, user };
}

export interface ConnectDrafts {
  note: string;
  first: string;
  follow4: string;
  follow10: string;
}

/** The four drafts, or null when the note or the first message is missing. The note may run long; the page counts it. */
export function readConnect(content: string | null): ConnectDrafts | null {
  const o = content ? parseJsonObject(content) : null;
  if (!o) return null;
  const d = {
    note: cleanDraft(o.note, NOTE_MAX + 100, { links: false }),
    first: cleanDraft(o.first, 900, { links: false }),
    follow4: cleanDraft(o.follow4, 600, { links: false }),
    follow10: cleanDraft(o.follow10, 600, { links: false }),
  };
  return d.note && d.first ? d : null;
}
