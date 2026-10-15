// The two daily free feeds from scripts/sg-feeds.mjs (run on Leo's Mac by content-studio-drop.sh sg-feeds):
// real questions people asked this fortnight (r/singaporefi, HardwareZone Money Mind) for Write, and
// this month's most-viewed Singapore personal-finance videos on YouTube for /trends.
import questionsData from "@/data/realQuestions.json";
import type { PlanAudience } from "@/lib/positioning";
import videosData from "@/data/youtubeTrends.json";

export interface RealQuestion {
  question: string;
  url: string;
  source: string;
  publishedAt: string | null;
  /** The Plan audience the asker is in, judged by Jev from the post (missing on questions before 2026-10-15). */
  audience?: PlanAudience;
}

export interface TrendVideo {
  id: string;
  title: string;
  channel: string | null;
  views: number;
  published: string | null;
  length: string | null;
}

export const REAL_QUESTIONS: RealQuestion[] = (questionsData as { questions?: RealQuestion[] }).questions ?? [];
export const TREND_VIDEOS: TrendVideo[] = (videosData as { videos?: TrendVideo[] }).videos ?? [];

const GROUP: Record<Exclude<PlanAudience, "general">, string> = {
  "young-adult": "young adults",
  "working-adult": "working adults",
  parent: "parents",
  "pre-retiree": "pre-retirees",
};

/**
 * Write's real questions for an adviser's Plan audience: only theirs when there are 3 or more, under their group's
 * name; otherwise theirs first, then general ones, then the rest, under the usual label.
 */
export function questionsFor(audience: PlanAudience | undefined, list: RealQuestion[] = REAL_QUESTIONS, max = 5): { label: string; questions: RealQuestion[] } {
  const usual = "Asked this week in Singapore";
  if (!audience || audience === "general") return { label: usual, questions: list.slice(0, max) };
  const mine = list.filter((q) => q.audience === audience);
  if (mine.length >= 3) return { label: `Asked this week by ${GROUP[audience]} in Singapore`, questions: mine.slice(0, max) };
  const general = list.filter((q) => q.audience === "general");
  const rest = list.filter((q) => q.audience !== audience && q.audience !== "general");
  return { label: usual, questions: [...mine, ...general, ...rest].slice(0, max) };
}

/** The picked question goes on top; whatever the consultant already typed stays below it. */
export function withQuestion(context: string, question: string): string {
  if (context.includes(question)) return context;
  return context.trim() ? `${question}\n\n${context}` : question;
}

export const videoUrl = (id: string) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
export const videoThumb = (id: string) => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`;

export function buildVideoWriteUrl(v: TrendVideo): string {
  const ctx = [
    `A popular YouTube video in Singapore this month: "${v.title}"${v.channel ? ` by ${v.channel}` : ""}, ${v.views.toLocaleString("en-SG")} views.`,
    "Write my own take on the same topic for my audience. Do not reuse its wording or claims.",
  ].join("\n");
  return `/generate?${new URLSearchParams({ pillar: "topic", detail: v.title, idea: "news-hook", ctx })}`;
}
