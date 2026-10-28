// video-assist mode "captions": the post caption written again for TikTok,
// LinkedIn, Facebook, YouTube (title and description), X (one post or a short
// thread) and Threads, each in its own length and with its own hashtag limit
// (src/lib/platformCounters.ts holds the first three's numbers), from what the
// speaker says and the Instagram caption when there is one. The LLM writes;
// the hashtag limits, character caps, the X thread's parts and the YouTube
// title's length are then kept mechanically. When the speaker asks viewers to
// comment or DM a word, the code lists the words said after "comment", "DM",
// "message" and "type" and Jev picks the one that is the keyword (a decision);
// it becomes a first line the consultant confirms. Mode "thread" (Leo only)
// writes a finished post again as a Threads or X thread, fitted by the same
// splitter as X's caption (fitThread). Pure, so vitest covers it
// (captions.test.ts); the app imports it too, so no lookbehind in a regex.

import { choiceOf, type JevAnswer, type JevQuestion } from "../_shared/jev.ts";
import { aOrAn, HONEST_LINE, professionOf } from "../_shared/profession.ts";

export const CAPTION_PLATFORMS = ["tiktok", "linkedin", "facebook", "youtube", "x", "threads"] as const;
export type CaptionPlatform = (typeof CAPTION_PLATFORMS)[number];

export const PLATFORM_RULES: Record<CaptionPlatform, { name: string; shape: string; hashtags: number; maxChars: number }> = {
  tiktok: { name: "TikTok", shape: "one or two short lines, 150 characters or fewer before the hashtags, then 3 to 5 hashtags", hashtags: 5, maxChars: 2200 },
  linkedin: { name: "LinkedIn", shape: "a first line that earns the 'see more' tap, 3 to 6 short paragraphs, 100 to 180 words, a question to close, then 3 hashtags at most, no links", hashtags: 3, maxChars: 3000 },
  facebook: { name: "Facebook", shape: "40 to 80 words in 2 or 3 short paragraphs, a question to close, then 2 hashtags at most", hashtags: 2, maxChars: 63206 },
  youtube: {
    name: "YouTube",
    shape: "the description under the video, 2 to 4 short paragraphs on what it covers; YouTube has no DMs, so a link to give goes in the description and the call to action says 'link in the description'; then 3 hashtags at most. Its title goes in youtube_title, 100 characters or fewer",
    hashtags: 3,
    maxChars: 5000,
  },
  x: { name: "X", shape: "a list of posts: one post of 280 characters or fewer, or, only when the point needs more room, a thread of 2 to 6 posts of 270 characters or fewer, each ending on a full sentence; 2 hashtags at most in all", hashtags: 2, maxChars: 280 },
  threads: { name: "Threads", shape: "one conversational post of 500 characters or fewer, one topic tag at most", hashtags: 1, maxChars: 500 },
};

export const YOUTUBE_TITLE_MAX = 100;
export const X_MAX_PARTS = 6;

const MAX_TRANSCRIPT = 6000;
const str = (v: unknown, n: number) => String(v ?? "").replace(/\r/g, "").trim().slice(0, n);

export function parseCaptionsRequest(
  body: unknown,
): { ok: true; transcript: string; instagram: string; title: string; rules: string; profession?: string } | { ok: false; error: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const transcript = str(b.transcript, MAX_TRANSCRIPT).replace(/\s+/g, " ");
  if (transcript.split(" ").length < 8) return { ok: false, error: "Caption the video first." };
  // rules: the brand kit's emoji, hashtag and offer-link rules, one line (src/lib/brandRules.ts)
  // profession: the brand's "What do you do?" (../_shared/profession.ts); absent for an adviser, who gets today's prompts
  const profession = professionOf(b.profession);
  return { ok: true, transcript, instagram: str(b.instagram, 2200), title: str(b.title, 90).replace(/\s+/g, " "), rules: str(b.rules, 1200).replace(/\s+/g, " "), ...(profession ? { profession } : {}) };
}

export type Keyword = { word: string; verb: "comment" | "dm" };

/** The words said after "comment", "DM", "message" or "type", up to 4 each and to the end of that sentence, once each (at most 12). */
export function keywordCandidates(transcript: string): Keyword[] {
  const out = new Map<string, Keyword>();
  for (const m of transcript.matchAll(/\b(comment|dm|message|type)\b/gi)) {
    const verb = /^(comment|type)$/i.test(m[1]) ? "comment" : "dm";
    const rest = transcript.slice((m.index ?? 0) + m[0].length).split(/[.!?]/)[0];
    // "none" is Jev's answer for no keyword, so it can't be one
    for (const w of (rest.match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 4)) if (w.length > 1 && w.toLowerCase() !== "none" && !out.has(w.toLowerCase())) out.set(w.toLowerCase(), { word: w, verb });
  }
  return [...out.values()].slice(0, 12);
}

/** Jev's one question: which of the words is the keyword the speaker asks for, or none. */
export function keywordQuestion(cands: Keyword[], profession = ""): Record<string, JevQuestion> {
  const criteria: Record<string, string> = {};
  for (const c of cands) criteria[c.word.toLowerCase()] = `"${c.word}" is the word the speaker asks viewers to ${c.verb === "comment" ? "comment or type in the comments" : "send them in a DM or message"}`;
  criteria.none = "None of these: the speaker does not ask viewers to comment or send a particular word";
  return {
    keyword: {
      type: "choice",
      instructions: `${profession ? aOrAn(profession).replace(/^a/, "A") : "A financial consultant"} says this in a short video. Some ask viewers to comment a word, or send it by DM, to get something (like PLAN in 'comment PLAN and I will send you the checklist'). Which word, if any, is that keyword?`,
      criteria,
    },
  };
}

/** The keyword Jev picked, or null on none, no answer or an answer outside the list. */
export function readKeyword(answers: Record<string, JevAnswer> | null, cands: Keyword[]): Keyword | null {
  const pick = choiceOf(answers, "keyword", [...cands.map((c) => c.word.toLowerCase()), "none"]);
  return cands.find((c) => c.word.toLowerCase() === pick) ?? null;
}

/** The first line for Instagram, TikTok and Facebook: the keyword ask, with what the viewer gets when the writer named it. */
export function ctaLine(k: Keyword, raw: unknown): string {
  const o = asObject(raw);
  const offer = typeof o?.cta_offer === "string" ? o.cta_offer.replace(/\s+/g, " ").replace(/\s*—\s*/g, ", ").replace(/[.!\s]+$/, "").trim().slice(0, 80) : "";
  const ask = `${k.verb === "comment" ? "Comment" : "DM me"} "${k.word.toUpperCase()}"`;
  return offer ? `${ask} and I'll send you ${offer}.` : `${ask}${k.verb === "comment" ? " below" : ""}.`;
}

/** The captions' lines for any other work: their work named, and the honesty everyone keeps in place of the adviser's rule. */
const generalLine = (p: string) => (l: string) =>
  l
    .replace("a licensed financial consultant in Singapore filmed", () => `${aOrAn(p)} filmed`)
    .replace("Never promise returns, name an insurer's product or a fund, or give a personal recommendation.", HONEST_LINE)
    .replace("the consultant adds it", "they add it")
    .replace('(like "my CPF top-up checklist")', '(like "my starter checklist")');

export function buildCaptionsMessages(
  transcript: string,
  instagram: string,
  title: string,
  rules = "",
  keyword: Keyword | null = null,
  profession = "",
): { role: string; content: string }[] {
  const said = profession ? generalLine(profession) : (l: string) => l;
  return [
    {
      role: "system",
      content: [
        "You write the post caption that goes with a short video a licensed financial consultant in Singapore filmed, once for each platform, each in that platform's own shape:",
        ...CAPTION_PLATFORMS.map((p) => `- ${p}: ${PLATFORM_RULES[p].name}, ${PLATFORM_RULES[p].shape}.`),
        "Use only what the speaker says: their facts, figures and stories. Never promise returns, name an insurer's product or a fund, or give a personal recommendation.",
        "Write as the speaker, in plain words, first person. Plain punctuation, never an em dash.",
        ...(keyword
          ? [
              `The speaker asks viewers to ${keyword.verb === "comment" ? "comment" : "DM them"} the word ${keyword.word.toUpperCase()}. Leave that ask out of every caption: the consultant adds it as the first line where it works. Put what the viewer gets for it in cta_offer, a short phrase from what the speaker says (like "my CPF top-up checklist"), or "" when they don't say.`,
            ]
          : []),
        ...(rules ? [rules] : []),
        `Return JSON: {"tiktok": "...", "linkedin": "...", "facebook": "...", "youtube_title": "...", "youtube": "...", "x": ["..."], "threads": "..."${keyword ? ', "cta_offer": "..."' : ""}}.`,
      ]
        .map(said)
        .join("\n"),
    },
    {
      role: "user",
      content: [title ? `Video title: ${title}` : "", instagram ? `The Instagram caption already written for it:\n${instagram}` : "", `What the speaker says:\n${transcript}`].filter(Boolean).join("\n\n"),
    },
  ];
}

/** The text with at most `max` hashtags (the first ones kept), spacing tidied where one was taken out. */
export function capHashtags(text: string, max: number): string {
  let n = 0;
  return text
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, (m) => (++n <= max ? m : ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const tagCount = (t: string) => (t.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
const noDash = (t: string) => t.replace(/\s*—\s*/g, ", ");

/** The text cut to `max` characters at a word, never mid-word unless one word is longer. */
export function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return (cut.replace(/\s+\S*$/, "") || cut).trimEnd();
}

/** Threads' 500: whole paragraphs while they fit, then the next cut at a word. Ported from kevinbadi/social-agents (MIT). */
export function fitThreads(text: string, max = PLATFORM_RULES.threads.maxChars): string {
  if (text.length <= max) return text;
  let acc = "";
  for (const para of text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)) {
    const next = acc ? `${acc}\n\n${para}` : para;
    if (next.length > max) return acc || cutAtWord(next, max);
    acc = next;
  }
  return acc;
}

// whole sentences, each with its closing punctuation (a full stop inside S$1.2 does not end one)
export const sentencesOf = (t: string) => (t.match(/\S[\s\S]*?(?:[.!?]+["')\]]*(?=\s|$)|$)/g) ?? []).map((x) => x.trim()).filter(Boolean);

/**
 * A thread's posts, each `max` characters or fewer and at most `maxParts` of them: a part the writer gave stays one
 * post when it fits, and a longer one is split between its sentences. Only a thread gets numbered ("6/6 " and a
 * spare), so a lone part may run 5 characters past `max`. The writer's own "2/3" numbering goes.
 * shortcut: a single sentence over `max` is cut at a word and the rest dropped, and a thread past `maxParts` loses its
 * end; the page's own split (src/lib/threadSplit.ts) breaks those up first, so only a writer's reply can hit them.
 */
export function fitThread(parts: string[], max: number, maxParts: number): string[] {
  const chunks: string[] = [];
  // only the writer's own "2/3" numbering goes, so a post opening with 50/30/20 or 24/7 keeps it
  const given = parts.filter((p) => p.trim());
  for (const part of given.map((p, i) => p.replace(new RegExp(`^\\s*${i + 1}\\s*/\\s*${given.length}(?!\\d)\\s*`), "").trim()).filter(Boolean)) {
    if (part.length <= max || (parts.length === 1 && part.length <= max + 5)) {
      chunks.push(part);
      continue;
    }
    let cur = "";
    for (const s of sentencesOf(part.replace(/\s+/g, " "))) {
      const next = cur ? `${cur} ${s}` : s;
      if (next.length <= max) cur = next;
      else {
        if (cur) chunks.push(cur);
        cur = cutAtWord(s, max);
      }
    }
    if (cur) chunks.push(cur);
  }
  return chunks.slice(0, maxParts);
}

/** "1/3 " in front of each post, the way an X thread is numbered. */
export const numbered = (posts: string[]) => posts.map((p, i) => `${i + 1}/${posts.length} ${p}`);

/** X: one post of 280 or fewer, or a thread of up to 6 parts numbered "1/3", each ending on a full sentence. */
export function fitX(parts: string[]): string {
  const kept = fitThread(parts, PLATFORM_RULES.x.maxChars - 5, X_MAX_PARTS);
  return kept.length > 1 ? numbered(kept).join("\n\n") : (kept[0] ?? "");
}

/** An X caption's posts: the numbered parts of a thread, or the one post. */
export const xParts = (text: string): string[] => text.split(/\n{2,}(?=\d+\/\d+ )/).map((p) => p.trim()).filter(Boolean);

function asObject(raw: unknown): Record<string, unknown> | null {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export type CaptionSet = Partial<Record<CaptionPlatform | "youtubeTitle", string>>;

/** Each platform's caption within its limits (and YouTube's title), or null when none came back. */
export function parseCaptionsReply(raw: unknown): CaptionSet | null {
  const o = asObject(raw);
  if (!o) return null;
  const out: CaptionSet = {};
  for (const p of CAPTION_PLATFORMS) {
    const rule = PLATFORM_RULES[p];
    if (p === "x") {
      // the hashtag limit holds across the whole thread, the first ones kept
      let left = rule.hashtags;
      const parts = (Array.isArray(o.x) ? o.x : [o.x]).filter((v): v is string => typeof v === "string").map((v) => {
        const kept = capHashtags(noDash(v), left);
        left -= tagCount(kept);
        return kept;
      });
      const text = fitX(parts);
      if (text) out.x = text;
      continue;
    }
    if (typeof o[p] !== "string") continue;
    const text = capHashtags(noDash(o[p] as string), rule.hashtags);
    const fitted = p === "threads" ? fitThreads(text) : text.slice(0, rule.maxChars);
    if (fitted) out[p] = fitted;
  }
  const title = typeof o.youtube_title === "string" ? cutAtWord(noDash(o.youtube_title).replace(/\s+/g, " ").trim(), YOUTUBE_TITLE_MAX) : "";
  if (title) out.youtubeTitle = title;
  return Object.keys(out).length ? out : null;
}

// ---- mode "thread" (formats-text-threads, Leo only): a finished post written again as a thread ----

export const THREAD_NETWORKS = { threads: { name: "Threads", max: 500 }, x: { name: "X", max: 280 } } as const;
export type ThreadNetwork = keyof typeof THREAD_NETWORKS;
/** A thread holds 2 to 10 posts (DraftEntry.thread, social's schedule); the writer is asked for 3 to 8. */
export const THREAD_MAX_POSTS = 10;
export const THREAD_WRITE = { min: 3, max: 8 } as const;
/** Each post leaves 5 characters for "1/5 " numbering. */
export const threadRoom = (n: ThreadNetwork) => THREAD_NETWORKS[n].max - 5;
const MAX_THREAD_POST = 5000;

export function parseThreadRequest(body: unknown): { ok: true; post: string; network: ThreadNetwork; posts: number | null } | { ok: false; error: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const post = typeof b.post === "string" ? b.post.replace(/\r/g, "").trim() : "";
  if (post.length < 40) return { ok: false, error: "Write a bit more before making it a thread." };
  if (post.length > MAX_THREAD_POST) return { ok: false, error: "Threads are made from posts up to 5,000 characters." };
  if (b.network !== "threads" && b.network !== "x") return { ok: false, error: "Pick Threads or X." };
  const n = b.posts;
  if (n !== undefined && n !== null && !(Number.isInteger(n) && (n as number) >= THREAD_WRITE.min && (n as number) <= THREAD_WRITE.max)) return { ok: false, error: "Ask for 3 to 8 posts." };
  return { ok: true, post, network: b.network, posts: typeof n === "number" ? n : null };
}

export function buildThreadMessages(post: string, network: ThreadNetwork, posts: number | null = null): { role: string; content: string }[] {
  return [
    {
      role: "system",
      content: [
        `You rewrite a social media post by a licensed financial adviser in Singapore as a thread for ${THREAD_NETWORKS[network].name}: a chain of short posts read one after another.`,
        "Post 1 is the hook and stands alone: it makes someone want to read on. Each later post makes one point and reads on its own.",
        `Write ${posts ? `exactly ${posts}` : `${THREAD_WRITE.min} to ${THREAD_WRITE.max}`} posts, each ${threadRoom(network)} characters or fewer. Do not number them.`,
        "Keep every fact, number and call to action from the post, and add none: no new facts, figures, examples or claims.",
        "Plain spoken English, as the person who wrote the post. Plain punctuation, never an em dash.",
        "No hashtags, except up to 3 at the end of the last post.",
        "Never promise or imply a return or result, never call anything guaranteed or risk-free, never name an insurer, a policy or a fund, and never tell the reader what they personally should buy.",
        'Return JSON: {"posts": ["...", "..."]}.',
      ].join("\n"),
    },
    { role: "user", content: `The post:\n${post}` },
  ];
}

/** The writer's thread within the network's limits, or null when it isn't 3 to 8 posts once fitted. */
export function parseThreadReply(raw: unknown, network: ThreadNetwork): string[] | null {
  const given = asObject(raw)?.posts;
  if (!Array.isArray(given)) return null;
  const parts = given.filter((v): v is string => typeof v === "string" && v.trim() !== "");
  // hashtags only at the end of the last post, 3 at most
  const cleaned = parts.map((p, i) => capHashtags(noDash(p), i === parts.length - 1 ? 3 : 0));
  const posts = fitThread(cleaned, threadRoom(network), THREAD_MAX_POSTS);
  return posts.length >= THREAD_WRITE.min && posts.length <= THREAD_WRITE.max ? posts : null;
}
