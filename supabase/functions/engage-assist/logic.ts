// Pure logic for engage-assist, the drafts on the Engage page (/recruit/engage).
// The consultant pastes text in and copies drafts out: nothing here posts,
// comments or messages (docs/social-api-app-review.md). Jev (pinned
// jev-1.13.0) does the sorting; OpenAI (the audit's key) writes the words.
// Each threshold sits beside its constant with the shadow check it was set
// from. No Deno or npm imports, so vitest covers it.
//
// Mode "replies": the comments under the consultant's own post. Jev sorts each
// into potential client, adds something, peer, support or noise; the drafts
// come back clients first, and noise gets none. Ported from
// Jakeschincariol/linkedin-agent-skill@add2c23 li-reply (MIT), rewritten for
// Singapore financial consultants.

import { choiceOf, type JevAnswer, type JevQuestion } from "../_shared/jev.ts";
import { complianceIssues, parseJsonObject } from "../_shared/socialAudit.ts";
import { mostlyEnglish } from "../post-score/logic.ts";

export const MODES = ["replies"] as const;
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

export type EngageRequest = { mode: "replies"; post: string; comments: Pasted[] };

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function pastedList(v: unknown): Pasted[] {
  return (Array.isArray(v) ? v : [])
    .map((x) => {
      const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
      return { name: str(o.name, MAX_NAME), text: str(o.text, MAX_ITEM_CHARS) };
    })
    .filter((p) => p.text);
}

export function parseEngageRequest(raw: unknown): { ok: true; request: EngageRequest } | { ok: false; error: string } {
  const b = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (b.mode === "replies") {
    const comments = pastedList(b.comments);
    if (!comments.length) return { ok: false, error: "Paste at least one comment." };
    if (comments.length > MAX_ITEMS) return { ok: false, error: `Paste up to ${MAX_ITEMS} comments at a time.` };
    return { ok: true, request: { mode: "replies", post: str(b.post, MAX_POST_CHARS), comments } };
  }
  return { ok: false, error: "Pick what to draft." };
}

/**
 * Whether Jev reads this text: mostly English, or no letters at all (an emoji,
 * "+1"). Text mostly in another script stays "not sorted": no keyword guess.
 */
export const jevReads = (text: string) => !/\p{L}/u.test(text) || mostlyEnglish(text);

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

export function buildRepliesPrompt(post: string, comments: Pasted[], kinds: CommentKind[]): { system: string; user: string } {
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
  const lines = comments.flatMap((c, i) => (kinds[i] === "noise" ? [] : [`[c${i}] ${kinds[i]} | ${c.name || "(no name)"}: ${c.text.replace(/\s+/g, " ")}`]));
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
  /** Null for noise; "" when no usable draft came back. */
  reply: string | null;
  /** The first DM, for potential clients only. */
  dm?: string;
}

/** The comments with their drafts, clients first, in paste order within a kind. */
export function readReplies(content: string | null, comments: Pasted[], kinds: CommentKind[]): ReplyItem[] {
  const obj = content ? parseJsonObject(content) : null;
  const byId = new Map<string, Record<string, unknown>>();
  for (const r of Array.isArray(obj?.replies) ? obj.replies : []) {
    const o = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
    if (typeof o.id === "string") byId.set(o.id, o);
  }
  const items: ReplyItem[] = comments.map((c, i) => {
    const kind = kinds[i];
    if (kind === "noise") return { ...c, i, kind, reply: null };
    const r = byId.get(`c${i}`);
    const item: ReplyItem = { ...c, i, kind, reply: cleanDraft(r?.reply, 700, { links: false }) };
    if (kind === "client") item.dm = cleanDraft(r?.dm, 900);
    return item;
  });
  return items.sort((a, b) => REPLY_ORDER.indexOf(a.kind) - REPLY_ORDER.indexOf(b.kind) || a.i - b.i);
}
