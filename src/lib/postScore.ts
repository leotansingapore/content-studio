// The predicted engagement score on a draft in Write (post-score edge function,
// Jev). Each score is remembered on this device against the draft's exact text
// and platform, so a draft is never scored twice and going back to an earlier
// wording shows its score at once.
//   key: cs-postscore-${scoped(userId)}  (device-only)
// edit-score (Leo only): a carousel or a script scored as its own format, the
// score saved on the draft or carousel (read only through currentScore), and
// scoreVsResults, the check of whether higher scores got more engagement.

import { callFn } from "@/lib/edgeFn";
import { scoped } from "@/lib/profiles";
import { withReal } from "@/lib/analytics";
import { draftStatus, engagement, type DraftEntry } from "@/lib/draftHistory";
import { FACTOR_IDS, type FactorId, type PostScore, type ScoreFormat } from "../../supabase/functions/post-score/logic.ts";

export {
  FACTORS,
  SCORE_FORMATS,
  labelFor,
  tipFor,
  type FactorId,
  type PostScore,
  type ScoreFormat,
} from "../../supabase/functions/post-score/logic.ts";

const PREFIX = "cs-postscore-";
const MAX_KEPT = 40;

type Cache = Record<string, PostScore & { at: number }>;

/** A short fingerprint of the platform and text (cyrb53), so the cache never stores the draft itself. */
export function textKey(platform: string, text: string): string {
  const s = `${platform}\n${text.trim()}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${s.length}-${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadScores(userId: string | null | undefined): Cache {
  if (!userId) return {};
  try {
    const v = JSON.parse(store()?.getItem(PREFIX + scoped(userId)) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Keeps a score, dropping the oldest beyond MAX_KEPT. */
export function saveScore(userId: string, key: string, score: PostScore, now = Date.now()): Cache {
  const all = { ...loadScores(userId), [key]: { ...score, at: now } };
  const kept = Object.fromEntries(Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_KEPT));
  try {
    store()?.setItem(PREFIX + scoped(userId), JSON.stringify(kept));
  } catch {
    // storage full: the score still shows for this visit
  }
  return kept;
}

/** Scores the text; `format` is sent only when given, so a call without it is today's request. */
export async function scorePost(text: string, platform: string, format?: ScoreFormat): Promise<PostScore> {
  const res = await callFn<PostScore>("post-score", format ? { text, platform, format } : { text, platform }, "Couldn't score it right now. Try again in a minute.");
  if (typeof res?.score !== "number" || !Array.isArray(res.down)) throw new Error("Couldn't score it right now. Try again in a minute.");
  return res;
}

/**
 * A Fix this rewrite scored before Use this is offered (edit-score, Leo only; live-p7a-fix D12 and D26: both fixes left
 * their own factor flagged): the score kept on this device under the rewrite's words, so Use this shows "Was a, now b"
 * with no second call, and whether the factor it fixes is still flagged. Null when the score didn't come back.
 */
export async function scoreFix(userId: string, text: string, platform: string, format: ScoreFormat, factor: FactorId): Promise<{ cache: Cache; still: boolean } | null> {
  try {
    const s = await scorePost(text, platform, format);
    return { cache: saveScore(userId, textKey(platform, text), s), still: s.down.includes(factor) };
  } catch {
    return null;
  }
}

/**
 * What a carousel is scored on: one "Slide N: <title>. <body>" line per slide, then the linked draft's caption.
 * The key of a carousel's saved score is textKey(platform, this).
 */
export function carouselScoreText(slides: { title: string; body: string }[], caption?: string): string {
  const lines = slides.flatMap((x) => {
    const title = x.title.trim();
    const body = x.body.trim().replace(/\s*\n+\s*/g, " ");
    if (!title && !body) return [];
    const head = title && body && !/[.!?:]$/.test(title) ? `${title}.` : title;
    return [[head, body].filter(Boolean).join(" ")];
  });
  const text = lines.map((l, i) => `Slide ${i + 1}: ${l}`).join("\n");
  return caption?.trim() ? `${text}\n\nCaption: ${caption.trim()}` : text;
}

/** A score saved on a draft or a saved carousel (DraftEntry.score, SavedCarousel.score). */
export interface SavedScore {
  /** Out of 10, one decimal. */
  v: number;
  down: FactorId[];
  /** textKey(platform, text) of the text scored. */
  key: string;
  at: string;
}

/**
 * The saved score when it is well formed and still about the text as it is now, else null. loadDrafts checks no
 * fields, so this is the only way to read one. `text` is the draft's own unless given (a carousel's is
 * carouselScoreText of its slides and caption).
 */
export function currentScore(entry: { platform?: string; draft?: string; score?: unknown }, text: string = entry.draft ?? ""): SavedScore | null {
  const s = entry.score;
  if (!s || typeof s !== "object") return null;
  const { v, down, key, at } = s as Record<string, unknown>;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 10) return null;
  if (!Array.isArray(down) || down.length > 3 || down.some((id) => !(FACTOR_IDS as unknown[]).includes(id))) return null;
  if (typeof key !== "string" || key.length >= 40 || typeof at !== "string") return null;
  if (key !== textKey(entry.platform ?? "", text)) return null;
  return { v: Math.round(v * 10) / 10, down: [...down] as FactorId[], key, at };
}

/** The Analytics check needs this many posted posts with impressions and a current score. */
export const SCORE_CHECK_MIN = 10;

/**
 * How the score did: posted drafts with a current score and impressions (real numbers in place of typed ones), split
 * at the median score, the higher half's mean engagement rate over the lower half's. Null under SCORE_CHECK_MIN posts;
 * ratio null when the lower half had no engagement.
 */
export function scoreVsResults(drafts: DraftEntry[]): { n: number; ratio: number | null } | null {
  const rows = drafts.flatMap((d) => {
    const score = draftStatus(d) === "posted" ? currentScore(d) : null;
    const m = score ? withReal(d).metrics : undefined;
    const impressions = m?.impressions ?? 0;
    // as getTrackedPosts works the rate out, in percent to one decimal
    return score && impressions > 0 ? [{ v: score.v, rate: Math.round((engagement(m) / impressions) * 1000) / 10 }] : [];
  });
  if (rows.length < SCORE_CHECK_MIN) return null;
  rows.sort((a, b) => a.v - b.v);
  const half = Math.floor(rows.length / 2);
  const mean = (xs: { rate: number }[]) => xs.reduce((a, x) => a + x.rate, 0) / xs.length;
  const low = mean(rows.slice(0, half));
  const high = mean(rows.slice(rows.length - half));
  return { n: rows.length, ratio: low > 0 ? Math.round((high / low) * 100) / 100 : null };
}
