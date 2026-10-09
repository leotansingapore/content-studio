// The two daily free feeds from scripts/sg-feeds.mjs (run on Leo's Mac by content-studio-drop.sh sg-feeds):
// real questions people asked this fortnight (r/singaporefi, HardwareZone Money Mind) for Write, and
// this month's most-viewed Singapore personal-finance videos on YouTube for /trends.
import questionsData from "@/data/realQuestions.json";
import videosData from "@/data/youtubeTrends.json";

export interface RealQuestion {
  question: string;
  url: string;
  source: string;
  publishedAt: string | null;
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
