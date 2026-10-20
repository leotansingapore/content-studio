// Every remix keeps its source (docs/north-star/items/remix-source-trail.md): the record a draft carries of the
// post, ad or trend it was remixed from, the key shapes that name one, the snapshot builders each browse page
// uses, and which keys this brand has remixed. No JSON or component imports (resolveSource.ts reads the data
// drops); the only value imports are draftHistory.ts and profiles.ts, and draftHistory.ts imports the type only.

import { draftsRaw, loadDrafts, type DraftEntry } from "@/lib/draftHistory";
import { scoped } from "@/lib/profiles";
import type { TopPost } from "@/lib/topPosts";
import type { FollowedAccount, TrackedPost } from "@/lib/following";
import type { SwipeAd } from "@/lib/adsSwipe";
import type { TrendEntry } from "@/lib/trends";
import type { HubTrend } from "@/lib/hub";
import type { InspirationEntry } from "@/components/Inspiration";
import type { AuditPlatform, RatedPost } from "@/lib/accountAudit";
import type { SavedClone } from "@/lib/reelClone";

export type RemixSourceKind = "top-post" | "follow" | "ad" | "clone" | "own" | "trend" | "inspiration" | "link" | "upload" | "pattern";
export type SourceFormat = "video" | "carousel" | "image" | "text";

export interface RemixSource {
  key: string;
  kind: RemixSourceKind;
  format?: SourceFormat;
  /** instagram | tiktok | youtube | linkedin | x | facebook | meta-ad */
  platform?: string;
  /** https only, rebuilt from validated parts. */
  url?: string;
  /** Display form: '@handle' or the advertiser's name; prompts and UI never add another '@'. */
  author?: string;
  /** At most 120 characters. */
  title?: string;
  /** At most 400 characters, kept as a reference. */
  caption?: string;
  /** An app path or https. */
  cover?: string;
  numbers?: { views?: number; likes?: number; comments?: number; ratio?: number; daysRunning?: number };
  /** At most 600 characters in all. */
  teardown?: { hook?: string; structure?: string; why?: string };
  /** The original's own date (ISO), for your own posts: "Remixing your post from 12 Oct". */
  postedAt?: string;
  /** ISO; '' until saved. */
  remixedAt: string;
  /** Add "Idea from {author}." on copy. */
  credit?: boolean;
}

export const sourceKey = {
  top: (advisorId: string, shortCode: string) => `top:${advisorId}-${shortCode}`,
  /** /market posts use follow:<MarketPost id>, since that id is already <platform>:<postId>. */
  follow: (platform: string, postId: string) => `follow:${platform}:${postId}`,
  ad: (adId: string) => `ad:${adId}`,
  clone: (platform: string, postId: string) => `clone:${platform}:${postId}`,
  own: (draftId: string) => `own:${draftId}`,
  /** kind 'own' */
  audit: (platform: string, postId: string) => `audit:${platform}:${postId}`,
  trend: (id: string) => `trend:${id}`,
  /** kind 'trend' */
  hubtrend: (id: string) => `hubtrend:${id}`,
  /** kind 'inspiration' */
  insp: (id: string) => `insp:${id}`,
  link: (platform: string, id: string) => `link:${platform}:${id}`,
  upload: (sha1: string) => `upload:${sha1}`,
  pattern: (platform: string, handle: string, n: number) => `pattern:${platform}:${handle}:${n}`,
};

export type SourceNoun = "reel" | "video" | "carousel" | "post" | "ad" | "Short" | "trend" | "upload";

export function sourceNoun(s: Pick<RemixSource, "kind" | "format" | "platform">): SourceNoun {
  if (s.kind === "ad") return "ad";
  if (s.kind === "trend") return "trend";
  if (s.kind === "upload") return "upload";
  if (s.format === "carousel") return "carousel";
  if (s.format === "video") return s.platform === "instagram" ? "reel" : s.platform === "youtube" ? "Short" : "video";
  return "post";
}

// ---- small cleaners -------------------------------------------------------------------------

const clip = (v: unknown, max: number): string | undefined => {
  const t = typeof v === "string" ? v.trim().slice(0, max).trim() : "";
  return t || undefined;
};

/** The first non-empty line, whitespace collapsed. */
const firstLine = (v: unknown, max = 120) =>
  clip(String(v ?? "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).find(Boolean), max);

/** https only, rebuilt from its parts (no credentials, no fragment). */
export function safeUrl(v: unknown): string | undefined {
  try {
    const u = new URL(String(v ?? ""));
    return u.protocol === "https:" && u.hostname ? `https://${u.host}${u.pathname}${u.search}` : undefined;
  } catch {
    return undefined;
  }
}

const safeCover = (v: unknown) => (typeof v === "string" && /^\/[^/]/.test(v) ? v : safeUrl(v));
const handle = (h: unknown) => {
  const t = String(h ?? "").trim().replace(/^@+/, "");
  return t ? `@${t}` : undefined;
};
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

function numbers(n: RemixSource["numbers"]): RemixSource["numbers"] {
  const out = Object.fromEntries(Object.entries(n ?? {}).filter(([, v]) => num(v) !== undefined));
  return Object.keys(out).length ? out : undefined;
}

/** Each part at most 200 characters, so the whole stays under 600. */
function teardown(t: RemixSource["teardown"]): RemixSource["teardown"] {
  const out = { hook: clip(t?.hook, 200), structure: clip(t?.structure, 200), why: clip(t?.why, 200) };
  const kept = Object.fromEntries(Object.entries(out).filter(([, v]) => v));
  return Object.keys(kept).length ? kept : undefined;
}

/** Drops empty fields, so a snapshot stays small on the draft. */
function snap(s: RemixSource): RemixSource {
  const full: RemixSource = { ...s, numbers: numbers(s.numbers), teardown: teardown(s.teardown) };
  return Object.fromEntries(Object.entries(full).filter(([, v]) => v !== undefined)) as unknown as RemixSource;
}

const formatOf = (v: unknown): SourceFormat => {
  const t = String(v ?? "").toLowerCase();
  if (/video|clips|igtv|reel/.test(t)) return "video";
  if (/sidecar|carousel/.test(t)) return "carousel";
  if (/image|photo/.test(t)) return "image";
  return "text";
};

// ---- snapshot builders: every one sets format and remixedAt '' ------------------------------

export function fromTopPost(post: TopPost, advisor: { id: string; name: string; handle: string }): RemixSource {
  const f = formatOf(post.productType || post.type);
  return snap({
    key: sourceKey.top(advisor.id, post.shortCode),
    kind: "top-post",
    format: f === "text" ? "image" : f,
    platform: "instagram",
    url: safeUrl(post.url),
    author: handle(advisor.handle),
    title: firstLine(post.caption) ?? clip(post.idea?.hook, 120),
    caption: clip(post.caption, 400),
    cover: safeCover(post.cover),
    numbers: { views: post.views, likes: post.likes, comments: post.comments },
    teardown: { hook: post.idea?.hook, structure: post.idea?.format, why: post.idea?.why },
    remixedAt: "",
  });
}

export function fromFollowPost(account: Pick<FollowedAccount, "handle" | "platform">, post: TrackedPost): RemixSource {
  return snap({
    key: sourceKey.follow(account.platform, post.id),
    kind: "follow",
    format: formatOf(post.format),
    platform: account.platform,
    url: safeUrl(post.url),
    author: handle(account.handle),
    title: firstLine(post.caption),
    caption: clip(post.caption, 400),
    numbers: { views: post.views ?? undefined, likes: post.likes, comments: post.comments },
    remixedAt: "",
  });
}

export function fromAd(ad: SwipeAd, now = Date.now()): RemixSource {
  const days = ad.start ? Math.floor((now - Date.parse(ad.start)) / 86_400_000) : NaN;
  return snap({
    key: sourceKey.ad(ad.adId),
    kind: "ad",
    format: formatOf(ad.format) === "text" ? "image" : formatOf(ad.format),
    platform: "meta-ad",
    url: safeUrl(ad.libraryUrl),
    author: clip(ad.advertiser, 80),
    title: clip(ad.headline, 120) ?? firstLine(ad.body),
    caption: clip(ad.body, 400),
    cover: safeCover(ad.image),
    numbers: { daysRunning: days },
    remixedAt: "",
  });
}

export function fromTrend(t: TrendEntry): RemixSource {
  return snap({
    key: sourceKey.trend(t.id),
    kind: "trend",
    format: formatOf(t.format),
    platform: t.platform,
    url: safeUrl(t.source_url),
    author: t.author ? handle(t.author) : undefined,
    title: clip(t.title, 120),
    caption: clip(t.trend_source ?? t.why_it_works, 400),
    numbers: { views: t.views, likes: t.likes, comments: t.comments },
    teardown: { hook: t.hooks?.find((h) => typeof h === "string" && h.trim()), why: t.why_it_works },
    remixedAt: "",
  });
}

export function fromHubTrend(t: HubTrend): RemixSource {
  return snap({
    key: sourceKey.hubtrend(t.id),
    kind: "trend",
    format: t.example_video_urls?.length ? "video" : "text",
    url: safeUrl(t.source_urls?.[0]),
    title: clip(t.title, 120),
    caption: clip(t.summary_md, 400),
    teardown: { why: t.angles_md },
    remixedAt: "",
  });
}

export function fromInspiration(item: InspirationEntry): RemixSource {
  return snap({
    key: sourceKey.insp(item.id),
    kind: "inspiration",
    format: formatOf(item.format),
    platform: item.platform,
    title: clip(item.hook, 120),
    caption: clip(item.content, 400),
    teardown: { hook: item.hook, why: item.why_it_works },
    remixedAt: "",
  });
}

export function fromAuditPost(post: RatedPost, platform: AuditPlatform, accountHandle: string): RemixSource {
  return snap({
    key: sourceKey.audit(platform, post.id),
    kind: "own",
    format: formatOf(post.format),
    platform,
    url: safeUrl(post.url),
    author: handle(accountHandle),
    title: firstLine(post.caption),
    caption: clip(post.caption, 400),
    numbers: { views: post.views ?? undefined, likes: post.likes, comments: post.comments, ratio: post.ratio ?? undefined },
    postedAt: post.postedAt ?? undefined,
    remixedAt: "",
  });
}

/** The teardown comes from the clone's breakdown: its hook, beats and why it worked. */
export function fromClone(c: SavedClone): RemixSource {
  const { source, breakdown } = c.result;
  return snap({
    key: sourceKey.clone(source.platform, source.postId),
    kind: "clone",
    format: source.isVideo ? "video" : "image",
    platform: source.platform,
    url: safeUrl(source.url),
    author: handle(source.author),
    title: firstLine(source.caption),
    caption: clip(source.caption, 400),
    numbers: { views: source.metrics?.views ?? undefined, likes: source.metrics?.likes ?? undefined, comments: source.metrics?.comments ?? undefined },
    teardown: { hook: breakdown.hook, structure: breakdown.beats.join(" / "), why: breakdown.whyItWorked },
    remixedAt: "",
  });
}

export function fromDraft(d: DraftEntry): RemixSource {
  return snap({
    key: sourceKey.own(d.id),
    kind: "own",
    format: d.format === "short-video" || d.format === "story" ? "video" : d.format === "carousel" ? "carousel" : "text",
    platform: d.platform,
    title: firstLine(d.hook) ?? firstLine(d.draft),
    caption: clip(d.draft, 400),
    postedAt: d.postedAt ?? d.createdAt,
    remixedAt: "",
  });
}

// ---- words the screens use ------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Oct". A fixed month list: en-GB's short September is "Sept". */
export const dayMonth = (iso: string) => {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

const article = (noun: string) => (/^[aeiou]/i.test(noun) ? "an" : "a");

function named(s: RemixSource, ownLink: "from" | "of"): string {
  if (s.kind === "pattern") return `what worked for ${s.author ?? "this account"}`;
  if (s.kind === "own") return s.postedAt && Number.isFinite(Date.parse(s.postedAt)) ? `your post ${ownLink} ${dayMonth(s.postedAt)}` : "your post";
  const noun = sourceNoun(s);
  return s.author ? `${s.author}'s ${noun}` : `${article(noun)} ${noun}`;
}

/** Write's chip: "Remixing @mrbrown's reel", "Remixing your post from 12 Oct". */
export const sourceChip = (s: RemixSource) => `Remixing ${named(s, "from")}`;

/** The grey line on a draft: "From @mrbrown's reel". */
export const draftLine = (s: RemixSource) => `From ${named(s, "of")}`;

/** "Credit them when I copy" applies only to someone else's idea with a name to credit. */
export const canCredit = (s: RemixSource, keep?: string) => s.kind !== "own" && s.kind !== "pattern" && Boolean(s.author) && keep !== "react";

// ---- this tab's registry: sources seen in a list, so keys with no data drop resolve -----------

// A tab hint, not synced: audit: and hubtrend: keys come from server rows the device doesn't keep, so the
// card remembers what it showed when it is pressed and Write, opened in this tab, finds it here. Per brand.
const SEEN = "cs-remix-seen-";
const MAX_SEEN = 30;

function tabStore(): Storage | null {
  try {
    return globalThis.window?.sessionStorage ?? null;
  } catch {
    return null;
  }
}

const isSource = (v: unknown): v is RemixSource =>
  Boolean(v) && typeof (v as RemixSource).key === "string" && typeof (v as RemixSource).kind === "string";

export function seenSources(userId: string): RemixSource[] {
  try {
    const list = JSON.parse(tabStore()?.getItem(SEEN + scoped(userId)) ?? "[]");
    return Array.isArray(list) ? list.filter(isSource) : [];
  } catch {
    return [];
  }
}

export function rememberSource(s: RemixSource, userId: string): void {
  try {
    tabStore()?.setItem(SEEN + scoped(userId), JSON.stringify([s, ...seenSources(userId).filter((x) => x.key !== s.key)].slice(0, MAX_SEEN)));
  } catch {
    // full or blocked storage: the key just won't resolve, and Write carries on without a source
  }
}

/** The sheet's typed note, kept on this device until the remix is done. */
export const noteKey = (key: string) => `cs-remix-note-${key}`;

/** Puts a card's own suggestion (the audit's remix idea) in the sheet's note box when it is empty, so the make call sees it. */
export function seedNote(key: string, text: string): void {
  try {
    const store = globalThis.window?.localStorage;
    if (store && !store.getItem(noteKey(key))) store.setItem(noteKey(key), text.slice(0, 300));
  } catch {
    // blocked storage: the sheet opens with an empty note
  }
}

// ---- remix history ----------------------------------------------------------------------------

const DAY = 86_400_000;
const remixedAtOf = (d: DraftEntry) => d.source?.remixedAt || d.createdAt;

/** The newest draft remixed from that key in the last 30 days, or null. */
export function remixedOn(userId: string, key: string, now = Date.now()): { at: string; draftId: string } | null {
  let best: { at: string; draftId: string } | null = null;
  for (const d of loadDrafts(userId)) {
    if (d.source?.key !== key) continue;
    const at = remixedAtOf(d);
    const t = Date.parse(at);
    if (!Number.isFinite(t) || now - t > 30 * DAY) continue;
    if (!best || at > best.at) best = { at, draftId: d.id };
  }
  return best;
}

/** Write's repeat notice: an earlier remix of a source not saved yet. A saved source is that remix, and the
 * drafts sharing its key and date are its own platform versions and copies. */
export const earlierRemix = (userId: string, s: RemixSource | null, now = Date.now()) =>
  s && !s.remixedAt ? remixedOn(userId, s.key, now) : null;

let keysMemo: { userId: string; raw: string | null; map: Map<string, string> } | null = null;

/** Every key this brand has remixed, to its newest date. Lists call it per card, so it reparses only on a change. */
export function remixedKeys(userId: string): Map<string, string> {
  // the raw string is per brand (scoped), so a brand switch reads as a change too
  const raw = draftsRaw(userId);
  if (keysMemo && keysMemo.userId === userId && keysMemo.raw === raw) return keysMemo.map;
  const map = new Map<string, string>();
  let list: unknown = [];
  try {
    list = JSON.parse(raw ?? "[]");
  } catch {
    list = [];
  }
  for (const d of Array.isArray(list) ? (list as DraftEntry[]) : []) {
    if (!d?.source?.key) continue;
    const at = remixedAtOf(d);
    if (!map.has(d.source.key) || at > map.get(d.source.key)!) map.set(d.source.key, at);
  }
  keysMemo = { userId, raw, map };
  return map;
}
