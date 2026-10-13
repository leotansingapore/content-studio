import { REELS_BOARD_OWNERS } from "@/lib/reelsBoard";

/**
 * Channel feeds: posts that jobs outside the app publish on a schedule (the MoneyBees Telegram channel first),
 * so the calendar shows everything that goes out, for every business. Each job writes one feed to the public
 * `channel-feeds` bucket on the academy project and lists it in index.json (writer:
 * ~/.local/bin/moneybees-telegram-roundup, publish_feed). Leo 2026-10-13: "place it here", "sort the posts based on
 * business", "see the full post (the caption, plus all the content, if its multiple)".
 */
export const FEED_BASE = "https://hgdbflprrficdoyxmdxe.supabase.co/storage/v1/object/public/channel-feeds/";
export const FEED_INDEX_URL = `${FEED_BASE}index.json`;

export type FeedStatus = "posted" | "locked" | "planned";

export interface FeedQuiz {
  question: string;
  options: string[];
  answer: number;
  explain: string;
}

export interface FeedItem {
  id: string;
  date: string; // YYYY-MM-DD, Singapore time
  time: string; // HH:MM
  status: FeedStatus;
  title: string;
  kind: string; // "news" or "guide"
  format: string;
  link: string;
  caption: string; // Telegram HTML: <b> and <a href> only
  media: string[];
  quiz?: FeedQuiz;
}

export interface CalendarFeedItem extends FeedItem {
  business: string;
  channel: string;
  handle: string;
}

const STATUSES: FeedStatus[] = ["posted", "locked", "planned"];

/** Lowercase letters and digits only, so "MoneyBees", "moneybees" and a reels brand id "moneybees" match. */
export function businessKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const https = (u: unknown): u is string => typeof u === "string" && /^https:\/\//i.test(u);

/** One feed's items, with anything malformed dropped. Pictures must come from the feeds bucket. */
export function normalizeFeed(raw: unknown): CalendarFeedItem[] {
  const f = raw as Record<string, unknown> | null;
  if (!f || typeof f !== "object" || !Array.isArray(f.items)) return [];
  const business = typeof f.business === "string" && f.business.trim() ? f.business.trim() : "";
  const channel = typeof f.channel === "string" ? f.channel : "";
  if (!business || !channel) return [];
  const handle = typeof f.handle === "string" ? f.handle : "";
  const out: CalendarFeedItem[] = [];
  for (const r of f.items as Record<string, unknown>[]) {
    if (!r || typeof r !== "object") continue;
    const date = typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : "";
    const status = STATUSES.includes(r.status as FeedStatus) ? (r.status as FeedStatus) : null;
    if (!date || !status || typeof r.id !== "string" || typeof r.title !== "string") continue;
    const q = r.quiz as Record<string, unknown> | undefined;
    const quiz =
      q && typeof q.question === "string" && Array.isArray(q.options) && typeof q.answer === "number"
        ? { question: q.question, options: q.options.map(String), answer: q.answer, explain: String(q.explain ?? "") }
        : undefined;
    out.push({
      id: r.id,
      date,
      time: typeof r.time === "string" && /^\d{2}:\d{2}$/.test(r.time) ? r.time : "",
      status,
      title: r.title,
      kind: typeof r.kind === "string" ? r.kind : "",
      format: typeof r.format === "string" ? r.format : "",
      link: https(r.link) ? r.link : "",
      caption: typeof r.caption === "string" ? r.caption : "",
      media: Array.isArray(r.media) ? r.media.filter((m): m is string => typeof m === "string" && m.startsWith(FEED_BASE)) : [],
      quiz,
      business,
      channel,
      handle,
    });
  }
  return out;
}

/** Every feed listed in index.json, flattened. A feed that fails to load is skipped, never the calendar. */
export async function fetchChannelFeeds(f: typeof fetch = fetch): Promise<CalendarFeedItem[]> {
  const bust = `?t=${Date.now()}`;
  const index = await (await f(FEED_INDEX_URL + bust, { cache: "no-store" })).json();
  const feeds: { url?: unknown }[] = Array.isArray(index?.feeds) ? index.feeds : [];
  const lists = await Promise.all(
    feeds
      .filter((x) => typeof x?.url === "string" && (x.url as string).startsWith(FEED_BASE))
      .map(async (x) => {
        try {
          return normalizeFeed(await (await f((x.url as string) + bust, { cache: "no-store" })).json());
        } catch {
          return [];
        }
      }),
  );
  return lists.flat();
}

/** The feeds are Leo's businesses' channels: shown to the reels board's owners (and to a device with the QA flag). */
export function canSeeChannelFeeds(email: string | null | undefined): boolean {
  if (REELS_BOARD_OWNERS.includes((email ?? "").toLowerCase())) return true;
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("cs-flag-channel-feeds") === "1";
  } catch {
    return false;
  }
}

export type CaptionPart =
  | { t: "text"; s: string; bold: boolean }
  | { t: "link"; s: string; href: string; bold: boolean }
  | { t: "br" };

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITY[e.toLowerCase()] ?? m;
  });
}

/**
 * A Telegram HTML caption as parts React can render without innerHTML: bold, https links and line breaks;
 * any other tag is dropped and its text kept.
 */
export function parseCaption(html: string): CaptionPart[] {
  const out: CaptionPart[] = [];
  let bold = 0;
  let href: string | null = null;
  for (const m of html.matchAll(/<(\/?)([a-z]+)([^>]*)>|([^<]+)|</gi)) {
    if (m[4] !== undefined || m[0] === "<") {
      const parts = decode(m[4] ?? "<").split("\n");
      parts.forEach((p, i) => {
        if (i) out.push({ t: "br" });
        if (p) out.push(href ? { t: "link", s: p, href, bold: bold > 0 } : { t: "text", s: p, bold: bold > 0 });
      });
      continue;
    }
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    if (tag === "b" || tag === "strong") bold = Math.max(0, bold + (closing ? -1 : 1));
    else if (tag === "a") {
      if (closing) href = null;
      else {
        const h = decode(/href\s*=\s*"([^"]*)"/i.exec(m[3])?.[1] ?? "");
        href = https(h) ? h : null;
      }
    } else if (tag === "br") out.push({ t: "br" });
  }
  return out;
}

export const STATUS_LABEL: Record<FeedStatus, string> = {
  posted: "Posted",
  locked: "Previewed and locked",
  planned: "Planned",
};
