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

/** Stories matching every word of the query, in title, gist, talking point or source. */
export function searchStories(list: NewsStory[], query: string): NewsStory[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((s) => {
    const hay = `${s.title} ${s.gist} ${s.talkingPoint} ${s.source} ${s.topic}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Topics that have stories, most stories first. */
export function topicCounts(list: NewsStory[]): { topic: string; n: number }[] {
  const m = new Map<string, number>();
  for (const s of list) m.set(s.topic, (m.get(s.topic) ?? 0) + 1);
  return [...m].map(([topic, n]) => ({ topic, n })).sort((a, b) => b.n - a.n || a.topic.localeCompare(b.topic));
}

/** Newest month first, each month's stories newest first, labelled like "October 2026" (Singapore time). */
export function byMonth(list: NewsStory[]): { label: string; stories: NewsStory[] }[] {
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-SG", { month: "long", year: "numeric", timeZone: "Asia/Singapore" });
  const groups: { label: string; stories: NewsStory[] }[] = [];
  for (const s of [...list].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))) {
    const label = fmt(s.publishedAt);
    const g = groups[groups.length - 1];
    if (g?.label === label) g.stories.push(s);
    else groups.push({ label, stories: [s] });
  }
  return groups;
}
