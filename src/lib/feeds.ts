// Your feeds (Top posts > News): news sources an adviser follows for post ideas,
// per profile and synced: key content-studio-feeds-${scoped(userId)}.
// Stories come from the feed-ideas edge function.

import { scoped } from "@/lib/profiles";
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase";

export interface Feed {
  url: string;
  label: string;
}

export interface FeedStory {
  title: string;
  link: string;
  date: string;
  summary: string;
  source: string;
}

export const MAX_FEEDS = 10;
const KEY = "content-studio-feeds-";

/** Money news that Singapore advisers post about; each address checked on 2026-10-08. */
export const SUGGESTED_FEEDS: Feed[] = [
  { label: "Straits Times Business", url: "https://www.straitstimes.com/news/business/rss.xml" },
  { label: "Business Times", url: "https://www.businesstimes.com.sg/rss/top-stories" },
  { label: "CNA Business", url: "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6936" },
  { label: "MoneySmart", url: "https://blog.moneysmart.sg/feed/" },
  { label: "Dollars and Sense", url: "https://dollarsandsense.sg/feed/" },
];

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadFeeds(userId: string | null | undefined): Feed[] {
  const s = store();
  if (!s || !userId) return [];
  try {
    const v = JSON.parse(s.getItem(KEY + scoped(userId)) ?? "[]");
    return Array.isArray(v)
      ? v.filter((f): f is Feed => !!f && typeof f.url === "string" && /^https?:\/\//.test(f.url)).map((f) => ({ url: f.url.slice(0, 500), label: String(f.label ?? "").slice(0, 60) })).slice(0, MAX_FEEDS)
      : [];
  } catch {
    return [];
  }
}

export function saveFeeds(userId: string, feeds: Feed[]): Feed[] {
  const next = feeds.slice(0, MAX_FEEDS);
  try {
    store()?.setItem(KEY + scoped(userId), JSON.stringify(next));
  } catch {
    // storage full: the list still applies for this visit
  }
  return next;
}

/** A label for a pasted address: the feed's own title once known, else the site name. */
export function labelFor(url: string, title?: string): string {
  const known = SUGGESTED_FEEDS.find((f) => f.url === url);
  if (known) return known.label;
  if (title?.trim()) return title.trim().slice(0, 60);
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 60);
  }
}

/** Stories from every feed, newest first, with the source each came from. */
export function mergeStories(feeds: Feed[], results: { url: string; items: Omit<FeedStory, "source">[] }[]): FeedStory[] {
  const seen = new Set<string>();
  return results
    .flatMap((r) => r.items.map((i) => ({ ...i, source: feeds.find((f) => f.url === r.url)?.label || labelFor(r.url) })))
    .filter((s) => (seen.has(s.link) ? false : (seen.add(s.link), true)))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Write's brief for a story: the facts, the source, and no product recommendation. */
export function storyWriteUrl(s: FeedStory): string {
  const ctx = [
    `Write a post about this news: "${s.title}" (${s.source}${s.date ? `, ${s.date.slice(0, 10)}` : ""}, ${s.link}).`,
    s.summary ? `What it says: ${s.summary}` : "",
    "Stick to the facts above, name the source, and do not recommend a product.",
  ].filter(Boolean).join("\n");
  return `/generate?${new URLSearchParams({ pillar: "topic", detail: s.title, idea: "news-hook", ctx }).toString()}`;
}

export interface FeedResult {
  url: string;
  title: string;
  items: Omit<FeedStory, "source">[];
  error?: string;
}

export async function fetchFeeds(urls: string[]): Promise<FeedResult[]> {
  const token = (await supabase.auth.getSession()).data.session?.access_token ?? SUPABASE_ANON_KEY;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/feed-ideas`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ urls }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Feeds answered ${res.status}.`);
  return Array.isArray(body.feeds) ? body.feeds : [];
}
