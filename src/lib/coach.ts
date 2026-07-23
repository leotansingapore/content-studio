// Content Coach — a client-side analysis of a consultant's posts.
//
// No backend: it scores posts against the same craft rules the studio teaches
// (strong hooks, platform-fit length, a clear CTA, compliance, variety) and
// returns prioritised, concrete fixes. Works on pasted posts or the posts the
// consultant already made in-app.

import { scanCompliance, hasComplianceErrors } from "@/lib/compliance";
import { readout, type PlatformId } from "@/lib/platformCounters";

export interface CoachInput {
  text: string;
  platform?: PlatformId;
}

export interface CoachDimension {
  key: string;
  label: string;
  score: number; // 0-100
  note: string;
}

export interface CoachPostScore {
  index: number;
  score: number; // 0-100 for this single post
  snippet: string;
  issue: string; // the biggest thing to fix on this post ("" if none)
}

export interface CoachReport {
  score: number; // 0-100 overall
  postCount: number;
  avgWords: number;
  dimensions: CoachDimension[];
  strengths: string[];
  fixes: string[];
  perPost: CoachPostScore[];
}

const CTA_RE =
  /\b(dm|message me|comment|reply|book(?:\s+a)?|link in bio|save this|follow|share this|drop a|comment below|let me know|get the|grab the|send me)\b/i;
const PERSONAL_RE =
  /\b(i|i'?m|i'?ve|my client|last week|a client|my|me|we)\b/i;
const CURIOSITY_RE =
  /\b(most|nobody|secret|mistake|truth|why|how|stop|never|before you|the real|here'?s)\b/i;

function firstLine(text: string): string {
  const t = text.trim();
  const nl = t.indexOf("\n");
  const line = (nl === -1 ? t : t.slice(0, nl)).trim();
  return line || t.slice(0, 120);
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Split a blob of pasted posts into individual posts. Posts are separated by a
// line of dashes ("---"), so blank lines can stay as paragraph breaks *within*
// a post (which real posts use heavily). Falls back to one post.
export function splitPastedPosts(raw: string): string[] {
  const parts = raw
    .split(/\n\s*(?:-{3,}|={3,}|\*{3,}|_{3,})\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 15);
  if (parts.length > 0) return parts;
  const t = raw.trim();
  return t ? [t] : [];
}

function pct(n: number, d: number): number {
  if (d === 0) return 0;
  return Math.round((n / d) * 100);
}

export function analyzePosts(posts: CoachInput[]): CoachReport | null {
  const clean = posts.filter((p) => p.text.trim().length > 0);
  if (clean.length === 0) return null;

  let strongHooks = 0;
  let goodLength = 0;
  let withCta = 0;
  let clean_compliance = 0;
  let personal = 0;
  let totalWords = 0;
  const openings = new Set<string>();
  const perPost: CoachPostScore[] = [];

  clean.forEach((p, i) => {
    const text = p.text.trim();
    const platform: PlatformId = p.platform ?? "linkedin";
    const hook = firstLine(text);
    const words = wordCount(text);
    totalWords += words;

    // Hook: short, or asks a question, or has a number, or a curiosity trigger.
    const hookWords = wordCount(hook);
    const strong =
      hookWords <= 14 &&
      hook.length <= 100 &&
      (/\d/.test(hook) || hook.trim().endsWith("?") || CURIOSITY_RE.test(hook));
    if (strong) strongHooks++;

    const lengthOk = readout(text, platform).status === "good";
    if (lengthOk) goodLength++;

    // Clear CTA anywhere, or a question in the last ~2 lines.
    const tail = text.split("\n").slice(-2).join(" ");
    const hasCta = CTA_RE.test(text) || tail.includes("?");
    if (hasCta) withCta++;

    const compliant = !hasComplianceErrors(scanCompliance(text));
    if (compliant) clean_compliance++;

    if (PERSONAL_RE.test(text)) personal++;
    openings.add(hook.toLowerCase().split(/\s+/).slice(0, 3).join(" "));

    // Per-post score (variety is a set-level trait, so excluded here).
    const postScore = Math.round(
      (strong ? 35 : 0) +
        (hasCta ? 25 : 0) +
        (lengthOk ? 20 : 0) +
        (compliant ? 20 : 0),
    );
    const issue = !strong
      ? "Weak hook — open with a question, number, or bold claim."
      : !hasCta
        ? "No clear ask — tell the reader what to do next."
        : !lengthOk
          ? "Length is off for the platform."
          : !compliant
            ? "Uses a regulated phrase — reword it."
            : "";
    perPost.push({
      index: i,
      score: postScore,
      snippet: hook.slice(0, 70),
      issue,
    });
  });

  const n = clean.length;
  // Variety: distinct openings + a healthy mix of personal vs teaching posts.
  const distinctRatio = pct(openings.size, n);
  const personalRatio = pct(personal, n);
  const mixBonus = personalRatio > 20 && personalRatio < 90 ? 100 : 60;
  const varietyScore =
    n === 1 ? 70 : Math.round(distinctRatio * 0.6 + mixBonus * 0.4);

  const dimensions: CoachDimension[] = [
    {
      key: "hook",
      label: "Hooks",
      score: pct(strongHooks, n),
      note:
        strongHooks === n
          ? "First lines pull the reader in."
          : `${strongHooks}/${n} posts open with a strong hook (a question, a number, or a curiosity trigger).`,
    },
    {
      key: "cta",
      label: "Clear ask",
      score: pct(withCta, n),
      note:
        withCta === n
          ? "Every post asks for a next step."
          : `${n - withCta}/${n} posts have no clear CTA. Tell the reader what to do next.`,
    },
    {
      key: "length",
      label: "Length fit",
      score: pct(goodLength, n),
      note:
        goodLength === n
          ? "Lengths sit in the platform sweet spot."
          : `${n - goodLength}/${n} posts are outside the ideal length for their platform.`,
    },
    {
      key: "variety",
      label: "Variety",
      score: varietyScore,
      note:
        n === 1
          ? "Add a few more posts to gauge how varied your angles are."
          : personalRatio < 20
            ? "Almost all posts teach. Add personal stories so people connect with you."
            : personalRatio > 90
              ? "Almost all posts are personal. Add authority posts that show what you know."
              : "Good mix of personal and authority angles.",
    },
    {
      key: "compliance",
      label: "Compliance",
      score: pct(clean_compliance, n),
      note:
        clean_compliance === n
          ? "No risky regulated phrases spotted."
          : `${n - clean_compliance}/${n} posts use phrases regulators flag (e.g. "guaranteed", "risk-free"). Reword them.`,
    },
  ];

  // Weighted overall score.
  const weights: Record<string, number> = {
    hook: 0.3,
    cta: 0.2,
    length: 0.15,
    variety: 0.2,
    compliance: 0.15,
  };
  const score = Math.round(
    dimensions.reduce((sum, d) => sum + d.score * (weights[d.key] ?? 0), 0),
  );

  const sorted = [...dimensions].sort((a, b) => a.score - b.score);
  const fixes = sorted
    .filter((d) => d.score < 85)
    .slice(0, 3)
    .map((d) => d.note);
  const strengths = [...dimensions]
    .filter((d) => d.score >= 80)
    .sort((a, b) => b.score - a.score)
    .map((d) => `${d.label}: ${d.note}`);

  if (fixes.length === 0) {
    fixes.push("Strong across the board — keep the cadence going.");
  }

  return {
    score,
    postCount: n,
    avgWords: Math.round(totalWords / n),
    dimensions,
    strengths,
    fixes,
    perPost,
  };
}

// ---- History -------------------------------------------------------------

export interface CoachHistoryEntry {
  id: string;
  date: string;
  score: number;
  postCount: number;
  topFix: string;
  /** Full report snapshot so history rows can reopen it (absent on old entries). */
  report?: CoachReport;
}

const KEY_PREFIX = "content-studio-coach-";
const MAX_HISTORY = 30;

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (_) {
    return null;
  }
}

export function loadCoachHistory(
  userId: string | null | undefined,
): CoachHistoryEntry[] {
  if (!userId) return [];
  const storage = safeStorage();
  if (!storage) return [];
  const raw = storage.getItem(`${KEY_PREFIX}${userId}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CoachHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

export function addCoachEntry(
  userId: string,
  report: CoachReport,
): CoachHistoryEntry[] {
  const storage = safeStorage();
  if (!storage) return loadCoachHistory(userId);
  const entry: CoachHistoryEntry = {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `coach-${Date.now()}`,
    date: new Date().toISOString(),
    score: report.score,
    postCount: report.postCount,
    topFix: report.fixes[0] ?? "",
    report,
  };
  const next = [entry, ...loadCoachHistory(userId)].slice(0, MAX_HISTORY);
  storage.setItem(`${KEY_PREFIX}${userId}`, JSON.stringify(next));
  return next;
}
