// What worked for a followed account (docs/north-star/items/remix-patterns.md, part A). Pure: the request, the three
// Jev questions per post, the counted patterns (strongestPatterns, which the app imports too), the ideas prompt and
// the model's answer. No Deno globals, so vitest covers it and the app imports the types and labels from here.

import { COMPLIANCE_RULES, oneLineText, parseObject, sanitizeVoice, type VoiceInput } from "../clone-reel/logic.ts";
import { STRUCTURES, TAG_MIN, pickTag } from "../_shared/tags.ts";
import type { JevAnswer, JevQuestion } from "../_shared/jev.ts";

export const MAX_POSTS = 12;
/** The best posts the app sends: its top 3 at 1.5x their usual or more (scoreAccount). */
export const MAX_BEST = 3;
/** Jev's formula pick is kept at this probability or more: 22 options spread it (decision 7, a proposal). */
export const FORMULA_MIN = 0.4;
/** The most caption text the ideas prompt quotes, across every post. */
export const PROMPT_CAPTIONS = 300;
export const IDEAS = 3;

// Edge functions can't import src/, so these are copies; logic.test.ts fails the moment they drift.
/** { id, name, template } of HOOK_FORMULAS in src/lib/hookFormulas.ts. */
export const FORMULAS = [
  { id: "contrarian", name: "Contrarian take", template: "Most people say {common advice}. After {what you have seen}, I disagree." },
  { id: "number-reveal", name: "Number reveal", template: "I {did something} {N} times. Here is what came out of it." },
  { id: "mistake", name: "Mistake confession", template: "{What it cost} is what {one mistake} cost me." },
  { id: "before-after", name: "Before and after", template: "{Some time ago} I {low point}. Now I {better point}. One change did it." },
  { id: "list", name: "The list", template: "{N} things I wish I knew before {milestone}." },
  { id: "insider", name: "Insider view", template: "After {N} years as {role}, here is what nobody tells you about {topic}." },
  { id: "callout", name: "The callout", template: "If you still {outdated habit}, stop." },
  { id: "dilemma", name: "Real dilemma", template: "{A specific situation with a real cost}. What would you do?" },
  { id: "cold-open", name: "Cold open", template: "\"{A line someone said}\" Then who said it, when, and why it stuck." },
  { id: "receipt", name: "The receipt", template: "{A hard number you can show}. {One line of context}." },
  { id: "myth-bust", name: "Myth bust", template: "{Popular explanation} is not why {bad outcome} happens." },
  { id: "side-by-side", name: "Side by side", template: "{Option A} vs {option B}. {A verdict the reader won't expect}." },
  { id: "permission", name: "Permission", template: "You are allowed to {thing the reader feels guilty about}." },
  { id: "blunt", name: "Short and blunt", template: "{One short sentence, three words or so.}" },
  { id: "warning", name: "The warning", template: "{Common habit} is quietly costing you {something they care about}." },
  { id: "good-great", name: "Good vs great", template: "Good {people} {do X}. Great {people} {do Y}." },
  { id: "time-saved", name: "Time saved", template: "{Task} used to take me {long time}. Now it takes {short time}." },
  { id: "my-rule", name: "My rule", template: "I don't {common practice}. Ever. Here's why." },
  { id: "curiosity", name: "Curiosity gap", template: "The {best or worst} {thing} I ever {did} {broke the obvious rule}." },
  { id: "walk-away", name: "The walk-away", template: "I {turned down or stopped} {something valuable}. {What happened}." },
  { id: "give-it-away", name: "Give it away", template: "Here is the exact {thing} I use to {outcome}. Take it." },
] as const;

/** TOPICS in src/lib/postInsights.ts, as slug ids. */
export const TOPICS = [
  { id: "insurance", label: "Insurance" },
  { id: "investment", label: "Investment" },
  { id: "cpf", label: "CPF" },
  { id: "retirement", label: "Retirement" },
  { id: "estate-planning", label: "Estate Planning" },
  { id: "money-habits", label: "Money Habits" },
  { id: "career-fa-life", label: "Career / FA Life" },
  { id: "personal-brand", label: "Personal Brand" },
] as const;

export type PostFormat = "video" | "carousel" | "image";
export type Field = "formula" | "structure" | "topic" | "format";
export interface PostTags { formula: string | null; structure: string | null; topic: string | null }
export interface Pattern { field: Field; value: string; inBest: number; inRest: number; rest: number }
export interface Idea { hook: string; format: "post" | "carousel" | "script"; angle: string; patterns: string[] }
export interface PatternsResult { tags: Record<string, PostTags>; patterns: Pattern[]; ideas: Idea[]; from: "patterns" | "best" }
export interface PostIn { id: string; caption: string; format: PostFormat }
export interface PatternsRequest {
  account: { platform: "instagram" | "tiktok"; handle: string };
  checkedAt: string;
  posts: PostIn[];
  best: string[];
  brand: { name: string; serves: string; sells: string; topics: string[] };
  voice: VoiceInput | null;
}

const FORMATS: readonly PostFormat[] = ["video", "carousel", "image"];
const IDEA_FORMATS = ["post", "carousel", "script"] as const;
type Item = Record<string, unknown>;
const obj = (v: unknown): Item => (v && typeof v === "object" && !Array.isArray(v) ? (v as Item) : {});

/** The request cleaned, or the 400's words. Posts keep their order (the app sends them best first). */
export function parseRequest(raw: unknown): PatternsRequest | string {
  const r = obj(raw);
  const a = obj(r.account);
  const platform = a.platform === "instagram" || a.platform === "tiktok" ? a.platform : null;
  const handle = oneLineText(a.handle, 60).replace(/^@+/, "");
  if (!platform || !handle) return "Pick a followed Instagram or TikTok account.";
  const checkedAt = typeof r.checkedAt === "string" && Number.isFinite(Date.parse(r.checkedAt)) ? r.checkedAt : "";
  if (!checkedAt) return "Check the account first.";
  if (!Array.isArray(r.posts) || !r.posts.length || r.posts.length > MAX_POSTS) return `Send 1 to ${MAX_POSTS} posts.`;
  const posts: PostIn[] = [];
  for (const p of r.posts.map(obj)) {
    const id = oneLineText(p.id, 80);
    if (!id || posts.some((x) => x.id === id)) return "Each post needs its own id.";
    // captions arrive as Following keeps them, 240 characters at most
    posts.push({ id, caption: typeof p.caption === "string" ? p.caption.replace(/\s+/g, " ").trim().slice(0, 240) : "", format: FORMATS.find((f) => f === p.format) ?? "image" });
  }
  const best = [...new Set((Array.isArray(r.best) ? r.best : []).filter((id): id is string => typeof id === "string" && posts.some((p) => p.id === id)))];
  if (best.length > MAX_BEST) return `Send at most ${MAX_BEST} best posts.`;
  const b = obj(r.brand);
  const topics = (Array.isArray(b.topics) ? b.topics : []).map((t) => oneLineText(t, 60)).filter(Boolean).slice(0, 12);
  const brand = { name: oneLineText(b.name, 80), serves: oneLineText(b.serves, 400), sells: oneLineText(b.sells, 600), topics };
  return { account: { platform, handle }, checkedAt, posts, best, brand, voice: sanitizeVoice(r.voice) };
}

// ---- Jev: three questions per post ---------------------------------------------------------------------------

export const QUESTIONS: Record<"formula" | "structure" | "topic", JevQuestion> = {
  formula: {
    type: "choice",
    instructions: "Which hook formula does the opening line of this post follow?",
    criteria: {
      ...Object.fromEntries(FORMULAS.map((f) => [f.id, `${f.name}: ${f.template}`])),
      none: "None of these, or there is no clear opening line.",
    },
  },
  structure: {
    type: "choice",
    instructions: "How is the body of this post built?",
    criteria: Object.fromEntries(STRUCTURES.map((s) => [s.id, s.meaning])),
  },
  topic: {
    type: "choice",
    instructions: "What is this post mainly about?",
    criteria: { ...Object.fromEntries(TOPICS.map((t) => [t.id, t.label])), other: "Something else" },
  },
};

export const tagState = (p: PostIn) => ({ caption: p.caption, format: p.format });

const FORMULA_IDS = FORMULAS.map((f) => f.id);
// "none" and "other" are left out, so picking them reads as no tag
const STRUCTURE_IDS = STRUCTURES.map((s) => s.id).filter((id) => id !== "other");
const TOPIC_IDS = TOPICS.map((t) => t.id);

/** Each post Jev answered for, tagged; a post it didn't answer for is left out, so {} means Jev was down. */
export function tagsFrom(posts: PostIn[], answers: (Record<string, JevAnswer> | null)[]): Record<string, PostTags> {
  const out: Record<string, PostTags> = {};
  posts.forEach((p, k) => {
    const a = answers[k];
    if (!a) return;
    out[p.id] = {
      formula: pickTag(a.formula, FORMULA_IDS, FORMULA_MIN),
      structure: pickTag(a.structure, STRUCTURE_IDS, TAG_MIN),
      topic: pickTag(a.topic, TOPIC_IDS, TAG_MIN),
    };
  });
  return out;
}

// ---- Counted, not judged ----------------------------------------------------------------------------------------

const FIELDS: readonly Field[] = ["formula", "structure", "topic", "format"];
const share = (n: number, of: number) => (of ? n / of : 0);

/**
 * The values most of the best posts share: at least 2 of them, at twice (or more) their share among the other posts.
 * Strongest first (more best posts, then rarer in the rest), at most 3. The format comes from the post data.
 */
export function strongestPatterns(posts: Pick<PostIn, "id" | "format">[], tags: Record<string, PostTags>, best: string[]): Pattern[] {
  const top = posts.filter((p) => best.includes(p.id));
  const rest = posts.filter((p) => !best.includes(p.id));
  const valueOf = (p: Pick<PostIn, "id" | "format">, f: Field) => (f === "format" ? p.format : tags[p.id]?.[f] ?? null);
  const out: Pattern[] = [];
  for (const field of FIELDS) {
    for (const value of new Set(top.map((p) => valueOf(p, field)))) {
      if (value === null) continue;
      const inBest = top.filter((p) => valueOf(p, field) === value).length;
      const inRest = rest.filter((p) => valueOf(p, field) === value).length;
      if (inBest >= 2 && share(inBest, top.length) >= 2 * share(inRest, rest.length)) out.push({ field, value, inBest, inRest, rest: rest.length });
    }
  }
  return out.sort((a, b) => b.inBest - a.inBest || share(a.inRest, a.rest) - share(b.inRest, b.rest)).slice(0, 3);
}

const FORMAT_NAMES: Record<string, string> = { video: "Videos", carousel: "Carousels", image: "Photos" };

/** How a pattern reads on screen and in the ideas: "Number reveal hooks", "List posts", "Posts on CPF", "Carousels". */
export function patternName(p: Pick<Pattern, "field" | "value">): string {
  if (p.field === "formula") return `${FORMULAS.find((f) => f.id === p.value)?.name ?? p.value} hooks`;
  if (p.field === "structure") return `${STRUCTURES.find((s) => s.id === p.value)?.label ?? p.value} posts`;
  if (p.field === "topic") return `Posts on ${TOPICS.find((t) => t.id === p.value)?.label ?? p.value}`;
  return FORMAT_NAMES[p.value] ?? p.value;
}

/** What the writer is told a pattern means; topics never reach it, since their topic does not carry over. */
function patternBrief(p: Pick<Pattern, "field" | "value">): string {
  if (p.field === "formula") return `${patternName(p)}: ${FORMULAS.find((f) => f.id === p.value)?.template ?? ""}`;
  if (p.field === "structure") return `${patternName(p)}: ${STRUCTURES.find((s) => s.id === p.value)?.meaning ?? ""}`;
  return `${patternName(p)}: ${p.value === "video" ? "a short video script" : p.value === "carousel" ? "a carousel" : "a single picture post"}`;
}

// ---- The ideas ------------------------------------------------------------------------------------------------

const ideasCompliance = COMPLIANCE_RULES.map((l) => (l.startsWith("Compliance (") ? "Compliance (the post is published in Singapore):" : l));

/** The writer's prompt: the two strongest patterns (topics left out), or the best posts' shapes when none hold. */
export function ideasPrompt(req: PatternsRequest, patterns: Pattern[], tags: Record<string, PostTags>): { system: string; user: string } {
  const used = patterns.filter((p) => p.field !== "topic").slice(0, 2);
  const b = req.brand;
  const system = [
    `You write ${IDEAS} post ideas for a brand, from what worked for another account.`,
    "- Use the pattern, never their words or topic. Every idea is on one of the brand's own topics, for the brand's own audience.",
    "- Each idea: a hook (its opening line, at most 20 words), a format (post, carousel or script), an angle (one sentence: what the post says and why the brand's audience cares) and the patterns it uses, copied from the list given.",
    "- Write the hook in the brand's voice described in the message.",
    "- No invented numbers, results or client stories: a number the brand must supply goes in [brackets], like [N] clients. Brackets hold numbers only, never a date, time, place or link.",
    "- Never invent an event, launch, webinar, offer or feature the message does not name. An announcement idea announces a tip, a lesson or a change the audience can use today.",
    ...ideasCompliance,
  ].join("\n");
  const best = req.posts.filter((p) => req.best.includes(p.id));
  const shown = (best.length ? best : req.posts).slice(0, 3);
  // never more than PROMPT_CAPTIONS characters of their words in all
  const each = Math.floor(PROMPT_CAPTIONS / Math.max(1, shown.length));
  const shape = (p: PostIn) => {
    const t = tags[p.id];
    return [t?.formula && patternName({ field: "formula", value: t.formula }), t?.structure && patternName({ field: "structure", value: t.structure }), FORMAT_NAMES[p.format]]
      .filter(Boolean)
      .join(", ");
  };
  const user = [
    `The brand: ${b.name || "this brand"}.`,
    b.sells ? `It sells: ${b.sells}` : "",
    b.serves ? `It serves: ${b.serves}` : "",
    b.topics.length ? `Its topics (write on these): ${b.topics.join("; ")}` : "Its topics: pick ones that fit what it sells and who it serves.",
    "",
    ...(used.length
      ? [`What @${req.account.handle}'s best posts share (the patterns to use):`, ...used.map((p) => `- ${patternBrief(p)}`)]
      : [
        `@${req.account.handle}'s best posts share no clear pattern. Take the shape of these, never their words or topic:`,
        ...shown.map((p, k) => `${k + 1}. ${shape(p) || "A post"}. It opens: "${p.caption.slice(0, each)}"`),
      ]),
    ...voiceLines(req.voice),
  ].filter((l, i, all) => l !== "" || all[i - 1] !== "").join("\n");
  return { system, user };
}

function voiceLines(v: VoiceInput | null): string[] {
  if (!v) return ["", "The brand's voice: none saved yet. Write plainly and warmly."];
  return [
    "",
    "The brand's voice:",
    ...(v.summary ? [`Summary: ${v.summary}`] : []),
    ...v.samples.map((s, i) => `Post they wrote ${i + 1}: """${s}"""`),
  ];
}

/** The names the model may put in an idea's patterns: the ones it was given, or the best posts' shapes. */
export function allowedPatterns(patterns: Pattern[], posts: PostIn[], tags: Record<string, PostTags>): string[] {
  const used = patterns.filter((p) => p.field !== "topic").slice(0, 2);
  if (used.length) return used.map(patternName);
  const names = posts.flatMap((p) => {
    const t = tags[p.id];
    return [
      t?.formula ? patternName({ field: "formula", value: t.formula }) : "",
      t?.structure ? patternName({ field: "structure", value: t.structure }) : "",
      FORMAT_NAMES[p.format],
    ];
  });
  return [...new Set(names.filter(Boolean))];
}

const str = (description: string) => ({ type: "string", description });

/** OpenAI structured output: three ideas, every field required. */
export const IDEAS_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "pattern_ideas",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["ideas"],
      properties: {
        ideas: {
          type: "array",
          description: `Exactly ${IDEAS} ideas`,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["hook", "format", "angle", "patterns"],
            properties: {
              hook: str("The opening line, at most 20 words"),
              format: { type: "string", enum: IDEA_FORMATS },
              angle: str("One sentence: what the post says and why the audience cares"),
              patterns: { type: "array", description: "Pattern names copied from the list given", items: { type: "string" } },
            },
          },
        },
      },
    },
  },
} as const;

/** The Chat Completions body. openaiChat answers on OPENAI_MODEL and falls back to this model. */
export const ideasBody = (prompt: { system: string; user: string }) => ({
  model: "gpt-4.1",
  temperature: 0.7,
  max_tokens: 900,
  response_format: IDEAS_FORMAT,
  messages: [
    { role: "system", content: prompt.system },
    { role: "user", content: prompt.user },
  ],
});

/** Three usable ideas, their pattern names kept to `allowed`; null when the answer has fewer than three. */
export function parseIdeas(raw: unknown, allowed: string[]): Idea[] | null {
  const list = parseObject(raw)?.ideas;
  const ideas = (Array.isArray(list) ? list : [])
    .map(obj)
    .map((i) => ({
      hook: oneLineText(i.hook, 200),
      format: IDEA_FORMATS.find((f) => f === i.format) ?? "post",
      angle: oneLineText(i.angle, 300),
      patterns: [...new Set((Array.isArray(i.patterns) ? i.patterns : []).filter((p): p is string => typeof p === "string" && allowed.includes(p)))],
    }))
    .filter((i) => i.hook.length >= 8 && i.angle);
  return ideas.length >= IDEAS ? ideas.slice(0, IDEAS) : null;
}
