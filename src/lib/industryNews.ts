// SG news worth raising with clients, copied daily from ActivityTracker's
// Bulletin > Industry tab by scripts/industry-news.mjs (static, like trends).

import newsData from "@/data/industryNews.json";

export interface NewsStory {
  id: string;
  title: string;
  gist: string;
  talkingPoint: string;
  /** Null when ActivityTracker's advice check passed no draft: nothing to send. */
  clientMessage: string | null;
  source: string;
  url: string;
  publishedAt: string;
  topic: string;
  /** Our committed copy of the article clipping, e.g. "/news/abc.jpg". */
  clipping?: string;
}

export const NEWS: NewsStory[] = newsData as NewsStory[];

/** What a consultant sends: the message, then the article on its own line. */
export const clientMessageText = (s: NewsStory): string | null =>
  s.clientMessage ? `${s.clientMessage}\n\n${s.url}` : null;

/** Open Write pre-filled with the story as a news hook (same params as buildTrendRemixUrl). */
export function buildNewsWriteUrl(s: NewsStory): string {
  const ctx = [
    `Write a post about this news: "${s.title}" (${s.source}, ${s.publishedAt.slice(0, 10)}, ${s.url}).`,
    `What happened: ${s.gist}`,
    `Angle for my audience: ${s.talkingPoint}`,
    `Stick to the facts above, name the source, and do not recommend a product.`,
  ].join("\n");
  const params = new URLSearchParams({
    pillar: "topic",
    detail: s.title,
    idea: "news-hook",
    ctx,
  });
  return `/generate?${params.toString()}`;
}
