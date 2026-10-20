// viral-search's pure half (docs/north-star/items/find-viral-search.md): the request, each provider's items as one
// Found shape, the reach ratio, the Jev relevance asks, and the sorts and filters the Search tab on /swipe draws with
// (the app imports this file, so it has no imports of its own).
//
// Shapes checked on the integrator's real answers in ./fixtures: tiktok-search.json (clockworks~tiktok-scraper
// keyword search) and youtube-organic.json (DataForSEO serp/youtube/organic/live/advanced).

export type SearchPlatform = "tiktok" | "youtube";
export const PLATFORMS: readonly SearchPlatform[] = ["tiktok", "youtube"];

export interface Found {
  /** "tiktok:<video id>" or "youtube:<video id>". */
  id: string;
  platform: SearchPlatform;
  url: string;
  /** "@handle" on TikTok, the channel name on YouTube. */
  author: string | null;
  /** YouTube's title; null on TikTok, where the caption is all there is. */
  title: string | null;
  /** At most 200 characters. */
  caption: string | null;
  cover: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  followers: number | null;
  /** ISO. */
  postedAt: string | null;
  durationSec: number | null;
  /** Views over the author's followers, one decimal; null when either is unknown. */
  ratio: number | null;
  /** Jev's yes probability that the result fits the search and the business; null without an answer. */
  relevance: number | null;
}

/** Why one platform has no results, as the app's notice says it: "TikTok took too long, so ...". */
export const FAIL_SLOW = "took too long";
export const FAIL_DOWN = "couldn't be searched";
export type Failed = Partial<Record<SearchPlatform, string>>;

export const Q_MIN = 2;
export const Q_MAX = 60;
const CAPTION_MAX = 200;
const PER_PLATFORM = 20;

export interface SearchBrand {
  sells: string;
  serves: string;
}
export interface SearchRequest {
  q: string;
  platforms: SearchPlatform[];
  brand: SearchBrand;
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max).trim() : "");

/** The cleaned request, or the line to answer 400 with. */
export function parseRequest(body: unknown): SearchRequest | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const q = text(b.q, 200);
  if (q.length < Q_MIN || q.length > Q_MAX) return `Search for ${Q_MIN} to ${Q_MAX} characters.`;
  let platforms: SearchPlatform[] = [...PLATFORMS];
  if (b.platforms !== undefined) {
    if (!Array.isArray(b.platforms) || !b.platforms.length || b.platforms.some((p) => !PLATFORMS.includes(p))) return "Platforms are tiktok and youtube.";
    platforms = PLATFORMS.filter((p) => (b.platforms as unknown[]).includes(p));
  }
  const brand = (b.brand ?? {}) as Record<string, unknown>;
  return { q, platforms, brand: { sells: text(brand.sells, 600), serves: text(brand.serves, 400) } };
}

// ---- Provider requests --------------------------------------------------------------------------------------------

/** No sorting, date or country add-ons: each is charged on top of the per-result price. */
export const tiktokInput = (q: string) => ({ searchQueries: [q], resultsPerPage: PER_PLATFORM, searchSection: "/video" });
// YouTube organic takes block_depth, never depth (DataForSEO answers 40501 "Invalid Field: 'depth'": the live check, 20 Oct)
export const youtubeTask = (q: string) => ({ keyword: q, location_code: 2702, language_code: "en", block_depth: PER_PLATFORM });

// ---- Provider items to Found ---------------------------------------------------------------------------------------

const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
const https = (v: unknown) => {
  try {
    const u = new URL(String(v ?? ""));
    return u.protocol === "https:" && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
};
const iso = (v: unknown) => {
  // DataForSEO: "2024-10-20 11:11:57 +00:00"
  const t = typeof v === "string" ? Date.parse(v.replace(/^(\S+) (\S+) ?/, "$1T$2")) : typeof v === "number" ? v * 1000 : NaN;
  return Number.isFinite(t) && t > 0 ? new Date(t).toISOString() : null;
};
export const ratioOf = (views: number | null, followers: number | null) => (views !== null && followers ? Math.round((views / followers) * 10) / 10 : null);

export function tiktokFound(raw: unknown): Found | null {
  const i = (raw ?? {}) as Record<string, unknown>;
  const id = String(i.id ?? "");
  if (!/^\d{5,30}$/.test(id) || i.isAd === true || i.isSponsored === true) return null;
  const a = (i.authorMeta ?? {}) as Record<string, unknown>;
  const v = (i.videoMeta ?? {}) as Record<string, unknown>;
  const handle = typeof a.name === "string" && /^[A-Za-z0-9._]{1,64}$/.test(a.name) ? a.name : null;
  const url = https(i.webVideoUrl) ?? (handle ? `https://www.tiktok.com/@${handle}/video/${id}` : null);
  if (!url) return null;
  const views = count(i.playCount);
  const followers = count(a.fans);
  return {
    id: `tiktok:${id}`,
    platform: "tiktok",
    url,
    author: handle ? `@${handle}` : null,
    title: null,
    caption: text(i.text, CAPTION_MAX) || null,
    cover: https(v.coverUrl),
    views,
    likes: count(i.diggCount),
    comments: count(i.commentCount),
    shares: count(i.shareCount),
    followers,
    postedAt: iso(i.createTimeISO) ?? iso(i.createTime),
    durationSec: count(v.duration),
    ratio: ratioOf(views, followers),
    relevance: null,
  };
}

export function youtubeFound(raw: unknown): Found | null {
  const i = (raw ?? {}) as Record<string, unknown>;
  const id = String(i.video_id ?? "");
  if (i.type !== "youtube_video" || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  return {
    id: `youtube:${id}`,
    platform: "youtube",
    url: i.is_shorts === true ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`,
    author: text(i.channel_name, 80) || null,
    title: text(i.title, 120) || null,
    caption: text(i.description, CAPTION_MAX) || null,
    cover: https(i.thumbnail_url),
    views: count(i.views_count),
    likes: null,
    comments: null,
    shares: null,
    followers: null,
    postedAt: iso(i.timestamp),
    durationSec: count(i.duration_time_seconds),
    // YouTube's search page gives no subscriber count
    ratio: null,
    relevance: null,
  };
}

const dedupe = (list: (Found | null)[]) => {
  const seen = new Set<string>();
  return list.filter((f): f is Found => !!f && !seen.has(f.id) && !!seen.add(f.id)).slice(0, PER_PLATFORM);
};
export const tiktokResults = (items: unknown[]) => dedupe(items.map(tiktokFound));
export const youtubeResults = (serp: unknown) => {
  const items = (serp as { tasks?: { result?: { items?: unknown[] }[] }[] })?.tasks?.[0]?.result?.[0]?.items;
  return dedupe((Array.isArray(items) ? items : []).map(youtubeFound));
};

// ---- Jev: is each result about the search and useful to this business? ---------------------------------------------

/** proposal (decision 7 of the phase-2 brief): under this, a result sits behind "Show N less relevant". */
export const RELEVANT = 0.4;
const ASK_SIZE = 10;

const PLATFORM_NAME: Record<SearchPlatform, string> = { tiktok: "TikTok", youtube: "YouTube" };
export const platformName = (p: SearchPlatform) => PLATFORM_NAME[p];

/** Who the question is for: the brand's own offer and audience (decision 6), never "a financial adviser". */
function business(b: SearchBrand): string {
  const sells = b.sells.slice(0, 160).trim();
  const serves = b.serves.slice(0, 160).trim();
  if (sells && serves) return `a business that sells ${sells} to ${serves}`;
  if (sells) return `a business that sells ${sells}`;
  if (serves) return `a business that serves ${serves}`;
  return "a small business";
}

export interface RelevanceAsk {
  state: { search: string; results: string[] };
  questions: Record<string, { type: "noul"; instructions: string }>;
  /** Indexes into the results, one per question r<n>. */
  indexes: number[];
}

/** One noul per result (r0 to r39), 10 to a call. */
export function relevanceAsks(q: string, brand: SearchBrand, results: Found[]): RelevanceAsk[] {
  const who = business(brand);
  const asks: RelevanceAsk[] = [];
  for (let start = 0; start < results.length; start += ASK_SIZE) {
    const indexes = results.slice(start, start + ASK_SIZE).map((_, k) => start + k);
    asks.push({
      state: {
        search: q,
        results: indexes.map((n) => {
          const f = results[n];
          const words = [f.title, f.caption].filter(Boolean).join(". ").slice(0, 240);
          return `Result ${n}: ${PLATFORM_NAME[f.platform]}, ${f.author ?? "unknown author"}, ${f.views ?? "unknown"} views. ${words}`;
        }),
      },
      questions: Object.fromEntries(
        indexes.map((n) => [`r${n}`, { type: "noul" as const, instructions: `Is result ${n} about "${q}", and something ${who} could learn from or remake for its own posts?` }]),
      ),
      indexes,
    });
  }
  return asks;
}

// ---- What the tab shows ----------------------------------------------------------------------------------------------

export type SearchSort = "reach" | "views" | "engagement" | "newest";
export const SEARCH_SORTS: { value: SearchSort; label: string }[] = [
  { value: "reach", label: "Beat their size" },
  { value: "views", label: "Most views" },
  { value: "engagement", label: "Most engagement" },
  { value: "newest", label: "Newest" },
];
export type Posted = "30d" | "90d" | "any";
export const POSTED: { value: Posted; label: string }[] = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "any", label: "Any time" },
];

const engagement = (f: Found) => (f.likes ?? f.comments ?? f.shares) === null ? null : (f.likes ?? 0) + (f.comments ?? 0) + (f.shares ?? 0);
const time = (f: Found) => (f.postedAt ? Date.parse(f.postedAt) : null);
/** Bigger first, unknowns last. */
const desc = (a: number | null, b: number | null) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : b - a);

/** A sorted copy. Beat their size: by ratio, and results with no ratio (YouTube's) after the rest by views. */
export function sortFound(list: Found[], sort: SearchSort): Found[] {
  const by: Record<SearchSort, (a: Found, b: Found) => number> = {
    reach: (a, b) => desc(a.ratio, b.ratio) || desc(a.views, b.views),
    views: (a, b) => desc(a.views, b.views),
    engagement: (a, b) => desc(engagement(a), engagement(b)) || desc(a.views, b.views),
    newest: (a, b) => desc(time(a), time(b)),
  };
  return [...list].sort(by[sort]);
}

/** Within the period; an undated result counts only for any time. */
export function inPeriod(f: Found, posted: Posted, now = Date.now()): boolean {
  if (posted === "any") return true;
  const t = time(f);
  return t !== null && now - t <= (posted === "30d" ? 30 : 90) * 86_400_000;
}

/** Results Jev judged off-topic go behind "Show N less relevant"; without an answer a result shows. */
export function splitRelevant(list: Found[], min = RELEVANT): { relevant: Found[]; less: Found[] } {
  return {
    relevant: list.filter((f) => f.relevance === null || f.relevance >= min),
    less: list.filter((f) => f.relevance !== null && f.relevance < min),
  };
}
