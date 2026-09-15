// "Post ideas in your style" on the account audit: turns what went furthest on
// a consultant's own account into fresh post ideas, never repeating a post
// they've made or an idea they've already been shown. Pure logic shared by the
// suggest-post-ideas edge function and the app; vitest covers it
// (postIdeas.test.ts).

import {
  cleanText,
  complianceIssues,
  formatWord,
  oneLine,
  parseJsonObject,
  type AuditPlatform,
  type AuditProfile,
  type AuditStats,
  type PostFormat,
  type RatedPost,
} from "./socialAudit.ts";

export const IDEAS_PER_BATCH = 5;
/** Ask for more than we show, so a few can be dropped as repeats. */
export const IDEAS_REQUESTED = 8;
export const MIN_POSTS_FOR_IDEAS = 5;
/** Share of content words two hooks need in common to count as the same idea. */
export const REPEAT_SIMILARITY = 0.5;
const MAX_PREVIOUS_IN_PROMPT = 60;
const FORMATS: PostFormat[] = ["video", "carousel", "image"];

export interface PostIdea {
  hook: string;
  idea: string;
  format: PostFormat;
  /** The best post whose formula this idea borrows. */
  basedOn: string | null;
  why: string;
}

export interface PreviousIdea {
  hook: string;
  status: "new" | "used" | "dismissed";
}

// ---- Repeat detection ---------------------------------------------------------

const STOP_WORDS = new Set(
  (
    "the and you your yours for are this that with what how why when can will have has had not but all get " +
    "its our out who was were been into from than then them they their there these those just really about " +
    "more most much very like make does did dont youre some any one two three need should would could " +
    "here now even still ever never every thing things"
  ).split(" "),
);

export function contentWords(text: string): Set<string> {
  return new Set(
    String(text ?? "")
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
      .map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)),
  );
}

/** Jaccard overlap of content words, 0 to 1. */
export function similarity(a: string, b: string): number {
  const x = contentWords(a);
  const y = contentWords(b);
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / (x.size + y.size - shared);
}

export function isRepeat(text: string, seen: string[], threshold = REPEAT_SIMILARITY): boolean {
  return seen.some((s) => similarity(text, s) >= threshold);
}

function firstLineOf(caption: string): string {
  return (
    String(caption ?? "")
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? ""
  );
}

/** Everything a new idea must not repeat: past suggestions and the account's own posts. */
export function seenTexts(posts: RatedPost[], previous: PreviousIdea[]): string[] {
  return [...previous.map((p) => p.hook), ...posts.map((p) => firstLineOf(p.caption))].filter(Boolean);
}

// ---- Prompt -------------------------------------------------------------------

export function buildIdeasPrompt(input: {
  platform: AuditPlatform;
  profile: AuditProfile | null;
  stats: Pick<AuditStats, "topIds" | "weakIds">;
  posts: RatedPost[];
  previous: PreviousIdea[];
  count?: number;
}): { system: string; user: string } {
  const { platform, profile, stats, posts, previous } = input;
  const count = input.count ?? IDEAS_REQUESTED;
  const name = platform === "instagram" ? "Instagram" : "TikTok";
  const byId = new Map(posts.map((p) => [p.id, p]));
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((p): p is RatedPost => p !== undefined);
  const best = pick(stats.topIds);
  const weak = pick(stats.weakIds);
  const listed = new Set([...best, ...weak].map((p) => p.id));
  const others = posts.filter((p) => !listed.has(p.id));

  const fmtNum = (n: number) => n.toLocaleString("en-US");
  const line = (p: RatedPost, captionMax: number) =>
    [
      `[${p.id}]`,
      `${formatWord(platform, p.format)}${p.durationSec ? ` ${p.durationSec}s` : ""}`,
      p.ratio !== null ? `${p.ratio}x their usual` : "",
      p.views !== null ? `${fmtNum(p.views)} views` : `${fmtNum(p.likes)} likes`,
      `"${oneLine(p.caption, captionMax) || "no caption"}"`,
    ]
      .filter(Boolean)
      .join(" | ");

  const system = [
    `You are a short-form content strategist for a licensed financial consultant in Singapore. You study what went furthest on their own ${name} account and write new post ideas in that same style.`,
    "Step 1: work out their winning formula from their best posts: the hook style, the topic angle, the format and the length. Write it as one plain sentence in \"formula\".",
    `Step 2: write ${count} post ideas that use that formula. Each idea is either a new topic told in their winning style, or a fresh twist on a winning topic (a new angle, example or audience). Mix both kinds.`,
    "Rules:",
    "- Build every idea to spread: a scroll-stopping first line (curiosity, a surprising number, a myth, a strong opinion or a relatable pain), one clear payoff, and a reason to save it or send it to a friend.",
    "- Never recreate or lightly reword any post or idea listed below. A twist on a winning topic must change the angle, example or audience enough to feel like a new post.",
    "- Avoid what fell flat.",
    "- Stay compliant: no guaranteed or risk-free returns, no specific return percentages, no pressure like 'act now', no calling a product the best.",
    "- Fit their audience and niche from their bio and posts. Use Singapore context where it suits the account.",
    "- hook: the exact first line to say or show, under 15 words. idea: what the post covers, 1 or 2 sentences. format: \"video\", \"carousel\" or \"image\". basedOn: the id of the best post whose formula it borrows. why: one short sentence on why it should travel, tied to that post.",
    "- Plain English. No hashtags, no emojis, no em dashes.",
    'Return JSON only: {"formula": "...", "ideas": [{"hook": "...", "idea": "...", "format": "video", "basedOn": "...", "why": "..."}]}',
  ].join("\n");

  const sections = [
    [
      profile
        ? `Account: @${profile.handle}${profile.fullName ? ` (${profile.fullName})` : ""} on ${name}`
        : `Account on ${name}`,
      profile?.bio ? `Bio: ${oneLine(profile.bio, 200)}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    ["Best posts (these went furthest for them):", ...best.map((p) => line(p, 300))].join("\n"),
    weak.length ? ["Fell flat:", ...weak.map((p) => line(p, 150))].join("\n") : "",
    others.length
      ? ["Already posted (don't repeat):", ...others.map((p) => `- ${oneLine(firstLineOf(p.caption), 110) || "no caption"}`)].join("\n")
      : "",
    previous.length
      ? [
          "Already suggested (don't repeat; rejected ones missed the mark):",
          ...previous
            .slice(0, MAX_PREVIOUS_IN_PROMPT)
            .map((p) => `- ${p.hook}${p.status === "dismissed" ? " (rejected)" : ""}`),
        ].join("\n")
      : "",
  ].filter(Boolean);

  return { system, user: sections.join("\n\n") };
}

// ---- Validating the model's ideas --------------------------------------------

/**
 * Keeps compliant ideas that repeat nothing in `seen` or earlier in the batch,
 * up to `max`. Returns null when none survive.
 */
export function validateIdeas(
  raw: unknown,
  opts: { knownPostIds: string[]; seen: string[]; max?: number },
): { formula: string; ideas: PostIdea[] } | null {
  const obj =
    typeof raw === "string"
      ? parseJsonObject(raw)
      : raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : null;
  if (!obj) return null;
  const known = new Set(opts.knownPostIds);
  const max = opts.max ?? IDEAS_PER_BATCH;
  const seen = [...opts.seen];
  const ideas: PostIdea[] = [];

  for (const it of Array.isArray(obj.ideas) ? obj.ideas : []) {
    if (ideas.length >= max) break;
    const r = (it ?? {}) as Record<string, unknown>;
    const hook = cleanText(r.hook, 140);
    const idea = cleanText(r.idea, 320);
    const why = cleanText(r.why, 200);
    if (!hook || !idea) continue;
    if (complianceIssues(`${hook} ${idea} ${why}`).length) continue;
    if (isRepeat(hook, seen)) continue;
    ideas.push({
      hook,
      idea,
      format: FORMATS.includes(r.format as PostFormat) ? (r.format as PostFormat) : "video",
      basedOn: typeof r.basedOn === "string" && known.has(r.basedOn) ? r.basedOn : null,
      why,
    });
    seen.push(hook);
  }

  let formula = cleanText(obj.formula, 240);
  if (complianceIssues(formula).length) formula = "";
  return ideas.length ? { formula, ideas } : null;
}
