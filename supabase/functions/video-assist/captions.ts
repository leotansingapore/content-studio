// video-assist mode "captions": the post caption written again for TikTok,
// LinkedIn, Facebook, YouTube (title and description), X (one post or a short
// thread) and Threads, each in its own length and with its own hashtag limit
// (src/lib/platformCounters.ts holds the first three's numbers), from what the
// speaker says and the Instagram caption when there is one. The LLM writes;
// the hashtag limits, character caps, the X thread's parts and the YouTube
// title's length are then kept mechanically. When the speaker asks viewers to
// comment or DM a word, the code lists the words said after "comment", "DM",
// "message" and "type" and Jev picks the one that is the keyword (a decision);
// it becomes a first line the consultant confirms. Pure, so vitest covers it
// (captions.test.ts); the app imports it too, so no lookbehind in a regex.

import { choiceOf, type JevAnswer, type JevQuestion } from "../_shared/jev.ts";

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

export function parseCaptionsRequest(body: unknown): { ok: true; transcript: string; instagram: string; title: string; rules: string } | { ok: false; error: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const transcript = str(b.transcript, MAX_TRANSCRIPT).replace(/\s+/g, " ");
  if (transcript.split(" ").length < 8) return { ok: false, error: "Caption the video first." };
  // rules: the brand kit's emoji, hashtag and offer-link rules, one line (src/lib/brandRules.ts)
  return { ok: true, transcript, instagram: str(b.instagram, 2200), title: str(b.title, 90).replace(/\s+/g, " "), rules: str(b.rules, 1200).replace(/\s+/g, " ") };
}

export type Keyword = { word: string; verb: "comment" | "dm" };

/** The words said after "comment", "DM", "message" or "type", up to 4 each and to the end of that sentence, once each (at most 12). */
export function keywordCandidates(transcript: string): Keyword[] {
  const out = new Map<string, Keyword>();
  for (const m of transcript.matchAll(/\b(comment|dm|message|type)\b/gi)) {
    const verb = /^(comment|type)$/i.test(m[1]) ? "comment" : "dm";
    const rest = transcript.slice((m.index ?? 0) + m[0].length).split(/[.!?]/)[0];
    for (const w of (rest.match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 4)) if (w.length > 1 && !out.has(w.toLowerCase())) out.set(w.toLowerCase(), { word: w, verb });
  }
  return [...out.values()].slice(0, 12);
}

/** Jev's one question: which of the words is the keyword the speaker asks for, or none. */
export function keywordQuestion(cands: Keyword[]): Record<string, JevQuestion> {
  const criteria: Record<string, string> = {};
  for (const c of cands) criteria[c.word.toLowerCase()] = `"${c.word}" is the word the speaker asks viewers to ${c.verb === "comment" ? "comment or type in the comments" : "send them in a DM or message"}`;
  criteria.none = "None of these: the speaker does not ask viewers to comment or send a particular word";
  return {
    keyword: {
      type: "choice",
      instructions: "A financial consultant says this in a short video. Some ask viewers to comment a word, or send it by DM, to get something (like PLAN in 'comment PLAN and I will send you the checklist'). Which word, if any, is that keyword?",
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

export function buildCaptionsMessages(transcript: string, instagram: string, title: string, rules = "", keyword: Keyword | null = null): { role: string; content: string }[] {
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
      ].join("\n"),
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
const sentencesOf = (t: string) => (t.match(/\S[\s\S]*?(?:[.!?]+["')\]]*(?=\s|$)|$)/g) ?? []).map((x) => x.trim()).filter(Boolean);

/**
 * X: one post of 280 or fewer, or a thread of up to 6 parts numbered "1/3", each ending on a full sentence.
 * A part the writer made too long is split between its sentences.
 * shortcut: a single sentence over 275 characters is cut at a word; a thread past 6 parts loses its end.
 */
export function fitX(parts: string[]): string {
  const room = PLATFORM_RULES.x.maxChars - 5; // "6/6 " and a spare
  const chunks: string[] = [];
  for (const part of parts.map((p) => p.replace(/^\s*\d+\s*\/\s*\d+\s*/, "").trim()).filter(Boolean)) {
    if (part.length <= room || (parts.length === 1 && part.length <= PLATFORM_RULES.x.maxChars)) {
      chunks.push(part);
      continue;
    }
    let cur = "";
    for (const s of sentencesOf(part.replace(/\s+/g, " "))) {
      const next = cur ? `${cur} ${s}` : s;
      if (next.length <= room) cur = next;
      else {
        if (cur) chunks.push(cur);
        cur = cutAtWord(s, room);
      }
    }
    if (cur) chunks.push(cur);
  }
  const kept = chunks.slice(0, X_MAX_PARTS);
  return kept.length > 1 ? kept.map((c, i) => `${i + 1}/${kept.length} ${c}`).join("\n\n") : (kept[0] ?? "");
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
