// Own-account audit: the pure logic behind "Your account audit" on the
// Analytics page. Shared by the audit-social-account and refresh-social-audits
// edge functions (Deno) and the app (Vite), so it imports nothing and vitest
// covers it directly (socialAudit.test.ts).
//
// Honesty rules:
// - Numbers always come from the scrape, never from the model.
// - Every post is judged against this account's OWN medians, not other creators.
// - Advice may only cite posts that exist in the scrape; anything else is dropped.
// - Posts younger than two days are still collecting views, so they aren't judged.

export type AuditPlatform = "instagram" | "tiktok";
export type PostFormat = "video" | "carousel" | "image";
export type AuditStatus = "pending" | "refreshing" | "ready" | "error";

export const POSTS_TO_READ = 30;
export const MIN_POSTS_FOR_ADVICE = 5;
export const YOUNG_POST_HOURS = 48;
export const BREAKOUT_RATIO = 1.5;
export const WEAK_RATIO = 0.5;
/** Opening the page refreshes an audit at most this often. */
export const REFRESH_COOLDOWN_HOURS = 20;
/** A refresh still marked running after this long is treated as stuck. */
export const BUSY_TIMEOUT_MINUTES = 5;
export const ERROR_RETRY_MINUTES = 2;
export const ADVICE_RETRY_MINUTES = 10;

export interface SocialPost {
  id: string;
  url: string;
  format: PostFormat;
  caption: string;
  postedAt: string | null;
  /** Plays. Null when the platform hides views (Instagram photos and carousels). */
  views: number | null;
  likes: number;
  comments: number;
  shares: number | null;
  saves: number | null;
  durationSec: number | null;
  pinned: boolean;
  /** Made by another account and shared onto this one (a collab). */
  collab: boolean;
}

export interface RatedPost extends SocialPost {
  interactions: number;
  /** Instagram: % of followers. TikTok: % of views. */
  engagementRate: number | null;
  /** Versus this account's usual: 2 = twice its median. Null while too new to judge. */
  ratio: number | null;
  young: boolean;
}

export interface AuditProfile {
  handle: string;
  url: string;
  fullName: string;
  bio: string;
  followers: number | null;
  postsCount: number | null;
  verified: boolean;
  isPrivate: boolean;
}

export interface FormatStat {
  format: PostFormat;
  count: number;
  medianViews: number | null;
  medianEngagementRate: number | null;
}

export interface DurationStat {
  bucket: "under 30s" | "30 to 60s" | "over 60s";
  count: number;
  medianViews: number | null;
}

export interface AuditStats {
  postsAnalyzed: number;
  followers: number | null;
  medianViews: number | null;
  medianInteractions: number;
  medianEngagementRate: number | null;
  engagementBasis: "followers" | "views";
  postsPerWeek: number | null;
  daysSinceLastPost: number | null;
  formats: FormatStat[];
  durations: DurationStat[];
  /** Best first: judged posts at or above their usual, up to 5. */
  topIds: string[];
  /** Worst first: judged posts at half their usual or less, up to 5. */
  weakIds: string[];
}

export interface AdvicePoint {
  title: string;
  detail: string;
  postIds: string[];
}

export interface RemixPick {
  postId: string;
  why: string;
  newAngle: string;
}

export interface AuditAdvice {
  summary: string;
  doubleDown: AdvicePoint[];
  fix: AdvicePoint[];
  stop: AdvicePoint[];
  remix: RemixPick[];
}

// ---- Handles ----------------------------------------------------------------

const IG_RESERVED = new Set(["p", "reel", "reels", "stories", "explore", "tv", "accounts", "direct"]);
const TIKTOK_RESERVED = new Set(["video", "tag", "discover", "music", "live", "foryou"]);

/** A bare lowercase handle from "@name", "name" or a profile link, or null. */
export function normalizeHandle(platform: AuditPlatform, raw: string): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const m =
    platform === "instagram"
      ? t.match(/instagram\.com\/([^/?#]+)/i)
      : t.match(/tiktok\.com\/@?([^/?#]+)/i);
  const reserved = platform === "instagram" ? IG_RESERVED : TIKTOK_RESERVED;
  if (m && reserved.has(m[1].toLowerCase())) return null;
  const bare = (m ? m[1] : t).replace(/^@/, "").replace(/\/+$/, "").toLowerCase();
  const max = platform === "instagram" ? 30 : 24;
  if (bare.length < 2 || bare.length > max) return null;
  if (!/^[a-z0-9._]+$/.test(bare) || !/[a-z0-9]/.test(bare)) return null;
  return bare;
}

export function profileUrl(platform: AuditPlatform, handle: string): string {
  return platform === "instagram"
    ? `https://www.instagram.com/${handle}/`
    : `https://www.tiktok.com/@${handle}`;
}

// ---- Normalizing scraped items ---------------------------------------------

type Item = Record<string, unknown>;

function count(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function countOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function isoOrNull(v: unknown): string | null {
  if (typeof v === "number" && v > 0) {
    return new Date(v < 1e12 ? v * 1000 : v).toISOString();
  }
  if (typeof v === "string" && v) {
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  }
  return null;
}

/** One item from apify~instagram-post-scraper (detailedData). */
export function normalizeIgPost(item: Item, handle: string): SocialPost | null {
  if (!item || item.error) return null;
  const shortCode = String(item.shortCode ?? "").trim();
  if (!shortCode) return null;
  const kind = `${item.productType ?? ""} ${item.type ?? ""}`;
  const format: PostFormat = /video|clips|igtv/i.test(kind)
    ? "video"
    : /sidecar|carousel/i.test(kind)
      ? "carousel"
      : "image";
  // Reels show plays as "views" on Instagram; videoViewCount is an older,
  // smaller count. Fall back to it only when plays are missing.
  const plays = countOrNull(item.videoPlayCount);
  const views = format === "video" ? (plays ? plays : countOrNull(item.videoViewCount)) : null;
  const owner = String(item.ownerUsername ?? "").toLowerCase();
  return {
    id: shortCode,
    url: String(item.url ?? "") || `https://www.instagram.com/p/${shortCode}/`,
    format,
    caption: String(item.caption ?? "").slice(0, 2200),
    postedAt: isoOrNull(item.timestamp),
    views,
    likes: count(item.likesCount),
    comments: count(item.commentsCount),
    shares: null,
    saves: null,
    durationSec: format === "video" ? countOrNull(item.videoDuration) : null,
    pinned: Boolean(item.isPinned),
    collab: owner !== "" && owner !== handle,
  };
}

/** One item from clockworks~tiktok-scraper (profiles input). */
export function normalizeTiktokPost(item: Item, handle: string): SocialPost | null {
  if (!item || item.error) return null;
  const id = String(item.id ?? "").trim();
  if (!id) return null;
  const meta = (item.videoMeta ?? {}) as Item;
  const author = String(((item.authorMeta ?? {}) as Item).name ?? "").toLowerCase();
  const slideshow = Boolean(item.isSlideshow);
  return {
    id,
    url: String(item.webVideoUrl ?? "") || `https://www.tiktok.com/@${handle}/video/${id}`,
    format: slideshow ? "carousel" : "video",
    caption: String(item.text ?? "").slice(0, 2200),
    postedAt: isoOrNull(item.createTimeISO) ?? isoOrNull(item.createTime),
    views: countOrNull(item.playCount),
    likes: count(item.diggCount),
    comments: count(item.commentCount),
    shares: countOrNull(item.shareCount),
    saves: countOrNull(item.collectCount),
    durationSec: slideshow ? null : countOrNull(meta.duration),
    pinned: Boolean(item.isPinned),
    collab: author !== "" && author !== handle,
  };
}

/** The item from apify~instagram-profile-scraper. */
export function igProfile(item: Item, handle: string): AuditProfile {
  return {
    handle,
    url: profileUrl("instagram", handle),
    fullName: String(item.fullName ?? ""),
    bio: String(item.biography ?? "").slice(0, 500),
    followers: countOrNull(item.followersCount),
    postsCount: countOrNull(item.postsCount),
    verified: Boolean(item.verified),
    isPrivate: Boolean(item.private),
  };
}

/** TikTok has no separate profile call: every video carries authorMeta. */
export function tiktokProfile(items: Item[], handle: string): AuditProfile {
  const own =
    items.find((i) => String(((i.authorMeta ?? {}) as Item).name ?? "").toLowerCase() === handle) ??
    items[0];
  const a = ((own ?? {}).authorMeta ?? {}) as Item;
  return {
    handle,
    url: profileUrl("tiktok", handle),
    fullName: String(a.nickName ?? ""),
    bio: String(a.signature ?? "").slice(0, 500),
    followers: countOrNull(a.fans),
    postsCount: countOrNull(a.video),
    verified: Boolean(a.verified),
    isPrivate: Boolean(a.privateAccount),
  };
}

// ---- Stats ------------------------------------------------------------------

export function median(values: number[]): number | null {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

const DAY_MS = 86_400_000;
const FORMATS: PostFormat[] = ["video", "carousel", "image"];

/**
 * Rates every post against the account's own medians and summarizes the
 * account. Posts with views are compared on views; posts without (Instagram
 * photos and carousels) on likes + comments.
 */
export function computeAudit(
  posts: SocialPost[],
  platform: AuditPlatform,
  followers: number | null,
  now: number,
): { posts: RatedPost[]; stats: AuditStats } {
  const interactionsOf = (p: SocialPost) => p.likes + p.comments + (p.shares ?? 0) + (p.saves ?? 0);
  const isYoung = (p: SocialPost) =>
    p.postedAt !== null && (now - Date.parse(p.postedAt)) / 3_600_000 < YOUNG_POST_HOURS;
  const engagementOf = (p: SocialPost): number | null => {
    const inter = interactionsOf(p);
    if (platform === "instagram") {
      return followers && followers > 0 ? round((inter / followers) * 100, 2) : null;
    }
    return p.views && p.views > 0 ? round((inter / p.views) * 100, 2) : null;
  };

  const settled = posts.filter((p) => !isYoung(p));
  const baseline = settled.length >= 3 ? settled : posts;
  const viewsMedian = median(baseline.filter((p) => p.views !== null).map((p) => p.views as number));
  const interMedian = median(baseline.filter((p) => p.views === null).map(interactionsOf));

  const rated: RatedPost[] = posts.map((p) => {
    const young = isYoung(p);
    let ratio: number | null = null;
    if (!young) {
      if (p.views !== null) {
        ratio = viewsMedian && viewsMedian > 0 ? round(p.views / viewsMedian, 2) : null;
      } else {
        ratio = interMedian && interMedian > 0 ? round(interactionsOf(p) / interMedian, 2) : null;
      }
    }
    return { ...p, interactions: interactionsOf(p), engagementRate: engagementOf(p), ratio, young };
  });

  const dated = rated
    .filter((p) => p.postedAt)
    .map((p) => Date.parse(p.postedAt as string))
    .sort((a, b) => b - a);
  const daysSinceLastPost = dated.length ? Math.max(0, Math.floor((now - dated[0]) / DAY_MS)) : null;
  let postsPerWeek: number | null = null;
  if (dated.length >= 2) {
    const oldest = dated[dated.length - 1];
    if (now - oldest >= 28 * DAY_MS) {
      // The sample reaches back past four weeks, so count what landed in them.
      // An old pinned post can't stretch the window this way.
      postsPerWeek = round(dated.filter((t) => now - t <= 28 * DAY_MS).length / 4, 1);
    } else {
      const spanDays = Math.max(1, (dated[0] - oldest) / DAY_MS);
      postsPerWeek = round(((dated.length - 1) / spanDays) * 7, 1);
    }
  }

  const judged = rated.filter((p) => !p.young);
  const medianRate = (list: RatedPost[]) => {
    const m = median(list.filter((p) => p.engagementRate !== null).map((p) => p.engagementRate as number));
    return m === null ? null : round(m, 2);
  };
  const medianViewsOf = (list: RatedPost[]) => {
    const m = median(list.filter((p) => p.views !== null).map((p) => p.views as number));
    return m === null ? null : Math.round(m);
  };

  const formats: FormatStat[] = FORMATS.map((format) => {
    const list = judged.filter((p) => p.format === format);
    return {
      format,
      count: rated.filter((p) => p.format === format).length,
      medianViews: medianViewsOf(list),
      medianEngagementRate: medianRate(list),
    };
  }).filter((f) => f.count > 0);

  const bucketOf = (s: number): DurationStat["bucket"] =>
    s < 30 ? "under 30s" : s <= 60 ? "30 to 60s" : "over 60s";
  const durations: DurationStat[] = (["under 30s", "30 to 60s", "over 60s"] as const)
    .map((bucket) => {
      const list = judged.filter(
        (p) => p.format === "video" && p.durationSec !== null && bucketOf(p.durationSec) === bucket,
      );
      return { bucket, count: list.length, medianViews: medianViewsOf(list) };
    })
    .filter((d) => d.count > 0);

  const withRatio = rated.filter((p) => p.ratio !== null);
  const topIds = [...withRatio]
    .sort((a, b) => (b.ratio as number) - (a.ratio as number))
    .filter((p) => (p.ratio as number) >= 1)
    .slice(0, 5)
    .map((p) => p.id);
  const weakIds = [...withRatio]
    .sort((a, b) => (a.ratio as number) - (b.ratio as number))
    .filter((p) => (p.ratio as number) <= WEAK_RATIO)
    .slice(0, 5)
    .map((p) => p.id);

  const medianInteractions = median(baseline.map(interactionsOf));
  return {
    posts: rated,
    stats: {
      postsAnalyzed: rated.length,
      followers,
      medianViews: viewsMedian === null ? null : Math.round(viewsMedian),
      medianInteractions: Math.round(medianInteractions ?? 0),
      medianEngagementRate: medianRate(judged.length ? judged : rated),
      engagementBasis: platform === "instagram" ? "followers" : "views",
      postsPerWeek,
      daysSinceLastPost,
      formats,
      durations,
      topIds,
      weakIds,
    },
  };
}

export function snapshotFields(stats: AuditStats) {
  return {
    followers: stats.followers,
    posts_analyzed: stats.postsAnalyzed,
    median_views: stats.medianViews,
    median_engagement_rate: stats.medianEngagementRate,
    posts_per_week: stats.postsPerWeek,
  };
}

// ---- Advice prompt ----------------------------------------------------------

const FORMAT_WORD: Record<AuditPlatform, Record<PostFormat, string>> = {
  instagram: { video: "reel", carousel: "carousel", image: "photo" },
  tiktok: { video: "video", carousel: "photo slideshow", image: "photo" },
};

export function formatWord(platform: AuditPlatform, format: PostFormat): string {
  return FORMAT_WORD[platform][format];
}

/** Collapse whitespace and cut to max characters, ending with an ellipsis. */
export function oneLine(text: string, max: number): string {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

export function buildAdvicePrompt(input: {
  platform: AuditPlatform;
  profile: AuditProfile;
  stats: AuditStats;
  posts: RatedPost[];
}): { system: string; user: string } {
  const { platform, profile, stats, posts } = input;
  const name = platform === "instagram" ? "Instagram" : "TikTok";
  const system = [
    `You audit the ${name} account of a licensed financial consultant in Singapore. You get their recent posts with real numbers.`,
    "Rules:",
    "- Base every point on the numbers given, and cite the ids of the posts that prove it. Never invent numbers, posts or trends.",
    "- Judge posts against this account's own usual numbers. The ratio shows it: 2x means twice their median, 0.4x means well under it.",
    "- Posts marked new are still collecting views. Don't judge them.",
    "- One post is not a pattern. Prefer points backed by two or more posts, and say so when a point rests on one post.",
    "- doubleDown: 2 or 3 things clearly working that they should do more of.",
    "- fix: 2 or 3 things worth keeping but done badly, each with the exact change to make (hook, length, format, caption or posting rhythm).",
    "- stop: up to 3 things that keep underperforming or could hurt trust, and should stop now. If nothing clearly underperforms, return an empty list.",
    "- remix: up to 3 of their best posts worth making a fresh version of, each with a new angle for the new version.",
    "- Stay compliant for a licensed financial consultant: never suggest guaranteed or risk-free returns, specific return percentages, pressure like 'act now', or calling a product 'the best'.",
    "- Write for the consultant: plain English, short sentences, no jargon, no hashtags, no em dashes. Keep each detail under 45 words.",
    'Return JSON only, in this shape: {"summary": "at most 2 sentences", "doubleDown": [{"title": "...", "detail": "...", "postIds": ["..."]}], "fix": [same shape], "stop": [same shape], "remix": [{"postId": "...", "why": "...", "newAngle": "..."}]}',
  ].join("\n");

  const fmtNum = (n: number) => n.toLocaleString("en-US");
  const basis = stats.engagementBasis === "followers" ? "followers" : "views";
  const statLines = [
    `Followers: ${stats.followers !== null ? fmtNum(stats.followers) : "unknown"}`,
    `Median views per video: ${stats.medianViews !== null ? fmtNum(stats.medianViews) : "n/a"}`,
    `Median engagement: ${stats.medianEngagementRate !== null ? `${stats.medianEngagementRate}% of ${basis}` : "n/a"}`,
    `Posts per week: ${stats.postsPerWeek ?? "unknown"}; last post ${stats.daysSinceLastPost ?? "?"} days ago`,
    stats.formats.length
      ? `By format: ${stats.formats
          .map(
            (f) =>
              `${formatWord(platform, f.format)} ${f.count} posts` +
              (f.medianViews !== null ? `, median ${fmtNum(f.medianViews)} views` : "") +
              (f.medianEngagementRate !== null ? `, ${f.medianEngagementRate}% engagement` : ""),
          )
          .join("; ")}`
      : "",
    stats.durations.length
      ? `By video length: ${stats.durations
          .map((d) => `${d.bucket} ${d.count} videos${d.medianViews !== null ? `, median ${fmtNum(d.medianViews)} views` : ""}`)
          .join("; ")}`
      : "",
  ];

  const postLines = [...posts]
    .sort((a, b) => Date.parse(b.postedAt ?? "") - Date.parse(a.postedAt ?? "") || 0)
    .map((p) => {
      const metrics = [
        p.views !== null ? `views ${fmtNum(p.views)}` : "",
        `likes ${fmtNum(p.likes)}`,
        `comments ${fmtNum(p.comments)}`,
        p.shares !== null ? `shares ${fmtNum(p.shares)}` : "",
        p.saves !== null ? `saves ${fmtNum(p.saves)}` : "",
      ].filter(Boolean);
      const standing = p.young
        ? "new, still growing"
        : p.ratio !== null
          ? `${p.ratio}x usual ${p.views !== null ? "views" : "likes and comments"}`
          : "";
      return [
        `[${p.id}]`,
        `${formatWord(platform, p.format)}${p.durationSec ? ` ${p.durationSec}s` : ""}`,
        p.postedAt ? p.postedAt.slice(0, 10) : "date unknown",
        metrics.join(", "),
        standing,
        p.pinned ? "pinned" : "",
        p.collab ? "collab from another account" : "",
        `caption: "${oneLine(p.caption, 220)}"`,
      ]
        .filter(Boolean)
        .join(" | ");
    });

  const header = [
    `Account: @${profile.handle}${profile.fullName ? ` (${profile.fullName})` : ""}`,
    profile.bio ? `Bio: ${oneLine(profile.bio, 200)}` : "",
    ...statLines,
  ].filter(Boolean);
  const user = [...header, "", `Their last ${posts.length} posts, newest first:`, ...postLines].join("\n");
  return { system, user };
}

// ---- Validating the model's advice -----------------------------------------

/** Mirror of COMPLIANCE_FLAGS in src/lib/compliance.ts (a test keeps them identical). */
export const COMPLIANCE_RULES: { id: string; pattern: RegExp }[] = [
  { id: "guarantee", pattern: /\b(guaranteed?|guarantee[ds]?)\b/i },
  { id: "risk-free", pattern: /\b(risk[-\s]?free|no\s+risk)\b/i },
  { id: "100-safe", pattern: /\b(100%|completely)\s+(safe|secure)\b/i },
  { id: "best-superlative", pattern: /\b(best|number\s*one|#1)\s+(insurance|policy|plan|fund|product)/i },
  { id: "aia-best", pattern: /\bAIA\s+is\s+the\s+best/i },
  { id: "specific-return", pattern: /\b(\d+%\s+(return|p\.a\.|annual)|\d+%\s+(rate|interest))\b/i },
  { id: "easy-money", pattern: /\b(easy|guaranteed|sure)\s+(money|profit|win)/i },
  { id: "act-now", pattern: /\bact\s+(now|today)\b/i },
];

export function complianceIssues(text: string): string[] {
  return COMPLIANCE_RULES.filter((r) => r.pattern.test(text)).map((r) => r.id);
}

export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = String(raw ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const attempt = (s: string) => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const direct = attempt(cleaned);
  if (direct) return direct;
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  return first !== -1 && last > first ? attempt(cleaned.slice(first, last + 1)) : null;
}

/** Trim model text: no em dashes, collapsed whitespace, cut at a word boundary. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  const s = v.replace(/\s*—\s*/g, ", ").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : s;
}

/**
 * Keeps only advice that cites real posts and passes the compliance rules.
 * Returns null when nothing usable is left.
 */
export function validateAdvice(raw: unknown, knownIds: string[]): AuditAdvice | null {
  const obj =
    typeof raw === "string"
      ? parseJsonObject(raw)
      : raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : null;
  if (!obj) return null;
  const known = new Set(knownIds);

  const points = (v: unknown): AdvicePoint[] =>
    (Array.isArray(v) ? v : [])
      .map((it) => {
        const r = (it ?? {}) as Record<string, unknown>;
        const ids = Array.isArray(r.postIds) ? r.postIds.map(String) : [];
        return {
          title: cleanText(r.title, 90),
          detail: cleanText(r.detail, 320),
          postIds: [...new Set(ids.filter((id) => known.has(id)))].slice(0, 4),
        };
      })
      .filter((p) => p.title && p.detail && complianceIssues(`${p.title} ${p.detail}`).length === 0)
      .slice(0, 3);

  const seen = new Set<string>();
  const remix: RemixPick[] = (Array.isArray(obj.remix) ? obj.remix : [])
    .map((it) => {
      const r = (it ?? {}) as Record<string, unknown>;
      return {
        postId: String(r.postId ?? ""),
        why: cleanText(r.why, 200),
        newAngle: cleanText(r.newAngle, 200),
      };
    })
    .filter((r) => {
      if (!known.has(r.postId) || seen.has(r.postId) || !r.why || !r.newAngle) return false;
      if (complianceIssues(`${r.why} ${r.newAngle}`).length) return false;
      seen.add(r.postId);
      return true;
    })
    .slice(0, 3);

  let summary = cleanText(obj.summary, 360);
  if (complianceIssues(summary).length) summary = "";

  const advice: AuditAdvice = {
    summary,
    doubleDown: points(obj.doubleDown),
    fix: points(obj.fix),
    stop: points(obj.stop),
    remix,
  };
  const empty =
    !advice.summary &&
    !advice.doubleDown.length &&
    !advice.fix.length &&
    !advice.stop.length &&
    !advice.remix.length;
  return empty ? null : advice;
}

// ---- When to refresh --------------------------------------------------------

export interface AuditFreshness {
  status: AuditStatus;
  fetchedAt: string | null;
  refreshStartedAt: string | null;
  hasAdvice: boolean;
  postsAnalyzed: number;
}

export type RefreshDecision =
  | { action: "refresh" }
  | { action: "busy" }
  | { action: "serve"; nextRefreshAt: string | null };

export function freshnessOf(row: {
  status: AuditStatus;
  fetched_at: string | null;
  refresh_started_at: string | null;
  advice: unknown;
  stats: { postsAnalyzed?: number } | null;
}): AuditFreshness {
  return {
    status: row.status,
    fetchedAt: row.fetched_at,
    refreshStartedAt: row.refresh_started_at,
    hasAdvice: row.advice !== null && row.advice !== undefined,
    postsAnalyzed: row.stats?.postsAnalyzed ?? 0,
  };
}

/**
 * Opening the page refreshes a stale audit (at most once per
 * REFRESH_COOLDOWN_HOURS). Failed runs can be retried after a short pause,
 * and a run whose advice failed can retry sooner than the cooldown.
 */
export function refreshDecision(s: AuditFreshness, now: number): RefreshDecision {
  const started = s.refreshStartedAt ? Date.parse(s.refreshStartedAt) : Number.NaN;
  const minsSinceStart = Number.isNaN(started) ? Number.POSITIVE_INFINITY : (now - started) / 60_000;
  const at = (ms: number) => new Date(ms).toISOString();

  if (s.status === "refreshing" && minsSinceStart < BUSY_TIMEOUT_MINUTES) return { action: "busy" };
  const errorPause =
    s.status === "error" && minsSinceStart < ERROR_RETRY_MINUTES
      ? at(started + ERROR_RETRY_MINUTES * 60_000)
      : null;

  if (!s.fetchedAt) {
    return errorPause ? { action: "serve", nextRefreshAt: errorPause } : { action: "refresh" };
  }
  const next = Date.parse(s.fetchedAt) + REFRESH_COOLDOWN_HOURS * 3_600_000;
  if (now >= next) {
    return errorPause ? { action: "serve", nextRefreshAt: errorPause } : { action: "refresh" };
  }
  if (
    !s.hasAdvice &&
    s.postsAnalyzed >= MIN_POSTS_FOR_ADVICE &&
    minsSinceStart >= ADVICE_RETRY_MINUTES
  ) {
    return { action: "refresh" };
  }
  return { action: "serve", nextRefreshAt: at(next) };
}
