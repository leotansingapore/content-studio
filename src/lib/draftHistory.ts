// Draft history storage.
//
// Per-user FIFO list of generated drafts, capped at MAX_DRAFTS.
// Persisted to localStorage:
//   key: content-studio-drafts-${userId}
//
// Once the SUPABASE handoff lands (content_studio_drafts table), this
// module can swap to Supabase reads/writes without touching callers.

import { scoped, DEFAULT_PROFILE_ID } from "@/lib/profiles";
import { addDays, keyToDate, localDateKey, scheduleAt, scheduleTime, timeLabel } from "@/lib/dueDates";
import type { ShotBeat } from "../../supabase/functions/clone-reel/logic.ts";
import type { Numbers } from "../../supabase/functions/social/metrics.ts";
import type { FactorId } from "../../supabase/functions/post-score/logic.ts";
import type { SocialPlatform } from "../../supabase/functions/_shared/zernio.ts";
import type { RemixSource } from "@/lib/remixSource";
import { links, type PostLang } from "@/lib/links";
import { logActivity } from "@/lib/activity";
import { loadOutbox, queueCancel, saveOutbox, zernioHolds, zernioOps } from "@/lib/zernioOutbox";
export const MAX_DRAFTS = 150;

// Lifecycle of a post. Older entries without a status are treated as "draft".
export type DraftStatus = "draft" | "scheduled" | "posted";

export interface DraftEntry {
  id: string;
  createdAt: string;
  hook: string;
  draft: string;
  pillar: string;
  pillarDetail: string;
  audience: string;
  format: string;
  platform: string;
  ctaType: string;
  vibeSourceId?: string;
  // Post tracking (optional for backwards compatibility with older saves).
  status?: DraftStatus;
  scheduledFor?: string;
  postedAt?: string;
  // Self-reported performance (until a real platform integration lands).
  metrics?: PostMetrics;
  // A recurring post: this entry is the series' next occurrence (scheduledFor).
  // Marking it posted records a posted copy and moves it to the following one.
  repeat?: Repeat;
  // Ids of the user's content labels (labels.ts).
  labels?: string[];
  // Disclosure lines added on copy (plainText.ts DISCLOSURES ids).
  disclosure?: string[];
  // Links moved out of a LinkedIn post, to paste as its first comment.
  firstComment?: string;
  // A short video's shot list, made in Write from the script it shows.
  storyboard?: Storyboard;
  // The hookFormulas.ts id of the formula the hook was written with.
  hookFormula?: string;
  // An http(s) link to the photo or video that goes with it, from a CSV import.
  media?: string;
  // Pictures or one video attached in Write: deviceFiles keys, so the files stay on the device
  // that attached them (like carousel pictures) while the keys sync with the draft.
  attached?: string[];
  // Post it for me: the post Zernio is publishing for it (autoPost.ts). Not security state: the
  // server checks the post is the adviser's on every call.
  zernio?: ZernioLink;
  // The post, ad or trend it was remixed from: a snapshot, so it still shows once the original rotates out.
  source?: RemixSource;
  // How the Remix sheet made it (remixJob.ts).
  remix?: DraftRemix;
  // The agent's chat and message that made it (remixJob.ts), so a draft links back to /agent/<thread>?m=<msg>.
  agent?: { thread: string; msg: string };
  // The post as a thread (formats-text-threads); read it through threadOf.
  thread?: DraftThread;
  // A short video script's titles and cover line (formats-hooks-scripts); read them through titlesOf and coverOf.
  titles?: string[];
  cover?: string;
  // A version in another language (edit-translate): its language, the English post it was made from, the English
  // meaning line by line and Jev's same-meaning answer (null: Jev had no answer). Read through translate.ts.
  lang?: PostLang;
  translationOf?: TranslationLink;
  back?: string[];
  sameP?: number | null;
  // North star phase 7a (Leo only).
  /** Versions made together (remix-variations): `from` is the parent draft id or the source key. */
  set?: { id: string; kind: "versions" | "hook-test"; from?: string };
  /** Its caption and options per network (publish-per-network); a caption equal to the shared one is not stored. */
  versions?: Partial<Record<SocialPlatform, NetworkVersion>>;
  /** Its predicted score (edit-score), read through currentScore (postScore.ts); `key` is textKey(platform, draft) when scored. */
  score?: { v: number; down: FactorId[]; key: string; at: string };
  /** The live post it went out as without Post it for me, matched or linked by hand (learn-real-numbers). */
  live?: LiveLink;
}

export interface NetworkVersion {
  caption?: string;
  instagram?: { placement: "feed" | "reel" | "story"; shareToFeed?: boolean; trial?: boolean; collaborators?: string[]; commentsOff?: boolean };
  facebook?: { placement: "feed" | "reel" | "story" };
  linkedin?: { poll?: { question: string; options: string[]; days: 1 | 3 | 7 | 14 } };
}

export interface LiveLink {
  /** MetricsPost.id */
  postId: string;
  platform: string;
  url: string | null;
  by: "auto" | "jev" | "you";
  numbers?: Numbers & { at: string };
}

/** The English post a version was made from: its id, textKey(platform, text) of it when translated, and when. */
export interface TranslationLink {
  id: string;
  key: string;
  at: string;
}

export interface DraftThread {
  network: "threads" | "x";
  /** 2 to 10 posts of at most 500 characters. */
  posts: string[];
}

const nonBlank = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** The draft's thread as it should be: a known network and 2 to 10 posts, blanks and non-text dropped, each cut to 500. Else null. */
export function threadOf(entry: Pick<DraftEntry, "thread">): DraftThread | null {
  const t = entry.thread as unknown;
  if (!t || typeof t !== "object") return null;
  const { network, posts } = t as { network?: unknown; posts?: unknown };
  if ((network !== "threads" && network !== "x") || !Array.isArray(posts)) return null;
  const kept = posts.filter(nonBlank).slice(0, 10).map((p) => p.slice(0, 500));
  return kept.length >= 2 ? { network, posts: kept } : null;
}

/** At most 3 titles, blanks and non-text dropped. */
export const titlesOf = (entry: Pick<DraftEntry, "titles">): string[] => (Array.isArray(entry.titles) ? entry.titles.filter(nonBlank).slice(0, 3) : []);

/** The cover line, or "" when there is none or it isn't text. */
export const coverOf = (entry: Pick<DraftEntry, "cover">): string => (nonBlank(entry.cover) ? entry.cover : "");

export interface DraftRemix {
  keep: string;
  as: string;
  close: string;
  /** The topic name, for keep=topic. */
  about?: string;
  /** good | weak | poor | unknown */
  fit?: string;
  flags?: { copied: string[]; claim: boolean; invented: boolean; mas?: boolean | null };
}

export interface ZernioLink {
  /** The client half of the Idempotency-Key: one per send, so a retry never posts twice. */
  key: string;
  /** Set once Zernio has the post. */
  postId?: string;
  /** Zernio's last known status: scheduled, publishing, published, partial, failed... */
  status?: string;
  /** When it goes out (ISO). */
  at?: string;
  /** The IANA zone it was scheduled in (the browser's at the time); Singapore when absent, as for every post before 28 Oct. */
  tz?: string;
  /** Each platform's live post, once published. */
  links?: { platform: string; url: string }[];
  /** Why it failed, in Zernio's words. */
  error?: string;
  /** Its real numbers, pulled on Analytics (social/metrics.ts), summed over its accounts. Typed metrics stay as they are. */
  numbers?: Numbers & { at: string };
  /** The platforms the post went to (publish-schedule), for the calendar card. */
  platforms?: string[];
  /** The platforms that went as drafts (publish-tiktok's inbox), so the chip reads right before Zernio is asked again. */
  drafts?: string[];
}

export interface Storyboard {
  beats: ShotBeat[];
  /** The script it was made from, so Write can tell when the script has changed since. */
  script: string;
  madeAt: string;
}

export type RepeatEvery = "week" | "2weeks" | "month";

export interface Repeat {
  every: RepeatEvery;
  start: string; // YYYY-MM-DD: the day the series counts from
  skip?: string[]; // occurrences skipped with "Skip this one"
}

// The n-th occurrence of a series (n = 0 is its start). Monthly keeps the start's
// day of the month, on the last day of a shorter month (31 Jan, 28 Feb, 31 Mar).
function occurrence(r: Repeat, n: number): string {
  if (r.every !== "month") return addDays(r.start, n * (r.every === "week" ? 7 : 14));
  const y = Number(r.start.slice(0, 4));
  const m = Number(r.start.slice(5, 7)) - 1 + n;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const day = Math.min(Number(r.start.slice(8, 10)), lastDay);
  return localDateKey(new Date(y, m, day));
}

/** A series' occurrences after `after` and up to `until` (day keys), skipped ones left out. */
export function occurrencesBetween(r: Repeat, after: string, until: string): string[] {
  const out: string[] = [];
  // ponytail: walks from the start; ~5 years of weekly posts is 260 steps, fine on a page render.
  for (let n = 0, day = r.start; day <= until && n < 2000; day = occurrence(r, ++n)) {
    if (day > after && !r.skip?.includes(day)) out.push(day);
  }
  return out;
}

/** The first occurrence after `after` that is not skipped. */
export function nextOccurrence(r: Repeat, after: string): string {
  for (let n = 0, day = r.start; n < 2000; day = occurrence(r, ++n)) {
    if (day > after && !r.skip?.includes(day)) return day;
  }
  return addDays(after, 7); // unreachable for a sane series
}

// Moves a series entry on to its next occurrence after `after`, keeping the time
// and dropping skips it has passed.
function advance(d: DraftEntry, after: string): DraftEntry {
  const r = d.repeat!;
  const day = nextOccurrence(r, after);
  const skip = r.skip?.filter((s) => s > day);
  return {
    ...d,
    scheduledFor: scheduleAt(day, scheduleTime(d.scheduledFor)),
    repeat: { every: r.every, start: r.start, ...(skip?.length ? { skip } : {}) },
  };
}

export interface PostMetrics {
  impressions?: number;
  reactions?: number;
  comments?: number;
  shares?: number;
}

export function draftStatus(d: DraftEntry): DraftStatus {
  return d.status ?? "draft";
}

// Total engagement actions (reactions + comments + shares).
export function engagement(m?: PostMetrics): number {
  if (!m) return 0;
  return (m.reactions ?? 0) + (m.comments ?? 0) + (m.shares ?? 0);
}

const KEY_PREFIX = "content-studio-drafts-";

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (_) {
    return null;
  }
}

/** Another brand's posts as stored, for the Calendar's all-brands view (they are edited in their own brand). */
export function draftsOfBrand(userId: string, profileId: string): DraftEntry[] {
  const key = `${KEY_PREFIX}${profileId === DEFAULT_PROFILE_ID ? userId : `${userId}~${profileId}`}`;
  try {
    const parsed = JSON.parse(safeStorage()?.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? (parsed as DraftEntry[]) : [];
  } catch {
    return [];
  }
}

/** The drafts list exactly as stored for the open brand, so a reader can skip parsing when it hasn't changed. */
export function draftsRaw(userId: string): string | null {
  return safeStorage()?.getItem(`${KEY_PREFIX}${scoped(userId)}`) ?? null;
}

export function loadDrafts(userId: string | null | undefined): DraftEntry[] {
  if (!userId) return [];
  const storage = safeStorage();
  if (!storage) return [];
  const raw = storage.getItem(`${KEY_PREFIX}${scoped(userId)}`);
  let stored: DraftEntry[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DraftEntry[];
      if (Array.isArray(parsed)) stored = parsed;
    } catch (_) {
      stored = [];
    }
  }
  return absorbClaudeDrafts(storage, userId, stored);
}

// Drafts Claude saved through the MCP connector (supabase/functions/content-studio-mcp)
// arrive by sync as one row each: content-studio-mcpdraft-claude-<id>-<scope>. The
// first read takes them into the drafts list and removes the rows, so a delete sticks
// and a page saving an older copy of the list can't drop them. Each one is a Claude row
// in Activity (Leo only), at the time Claude saved it, under the draft's own id so a
// second device absorbing the same row still makes one event.
const CLAUDE_DRAFT = "content-studio-mcpdraft-";

function absorbClaudeDrafts(storage: Storage, userId: string, stored: DraftEntry[]): DraftEntry[] {
  const suffix = `-${scoped(userId)}`;
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(CLAUDE_DRAFT) && k.endsWith(suffix) && /^claude-[a-z0-9]+$/.test(k.slice(CLAUDE_DRAFT.length, -suffix.length))) keys.push(k);
  }
  if (!keys.length) return stored;
  const have = new Set(stored.map((d) => d.id));
  const incoming: DraftEntry[] = [];
  for (const k of keys) {
    try {
      const d = JSON.parse(storage.getItem(k) ?? "null") as Partial<DraftEntry> | null;
      if (!d || typeof d.id !== "string" || typeof d.draft !== "string" || have.has(d.id)) continue;
      const when = d.status === "scheduled" && typeof d.scheduledFor === "string" && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(d.scheduledFor) ? d.scheduledFor : undefined;
      incoming.push({
        id: d.id,
        createdAt: typeof d.createdAt === "string" ? d.createdAt : new Date().toISOString(),
        hook: String(d.hook ?? "").slice(0, 160),
        draft: d.draft.slice(0, 5000),
        pillar: "topic",
        pillarDetail: String(d.pillarDetail ?? d.hook ?? "").slice(0, 160),
        audience: "general",
        format: ["text-post", "carousel", "short-video", "story"].includes(String(d.format)) ? String(d.format) : "text-post",
        platform: ["linkedin", "instagram", "facebook", "tiktok"].includes(String(d.platform)) ? String(d.platform) : "linkedin",
        ctaType: "comment-keyword",
        status: when ? "scheduled" : "draft",
        ...(when ? { scheduledFor: when } : {}),
      });
      have.add(d.id);
    } catch (_) {
      // a malformed row is removed below with the rest
    }
  }
  incoming.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const merged = trimDrafts([...incoming, ...stored]);
  try {
    storage.setItem(`${KEY_PREFIX}${scoped(userId)}`, JSON.stringify(merged));
  } catch (_) {
    return [...incoming, ...stored]; // storage full: keep the rows for the next read
  }
  for (const d of incoming) logClaudeDraft(userId, d);
  for (const k of keys) storage.removeItem(k);
  return merged;
}

function logClaudeDraft(userId: string, d: DraftEntry): void {
  const hook = d.hook.replace(/\s+/g, " ").trim() || "Untitled";
  const day = d.scheduledFor?.slice(0, 10);
  const time = scheduleTime(d.scheduledFor);
  const when = day && `${keyToDate(day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}${time ? `, ${timeLabel(time)}` : ""}`;
  logActivity(userId, {
    id: d.id,
    at: d.createdAt,
    who: "claude",
    kind: "post",
    title: `Added a draft: "${hook.length > 90 ? `${hook.slice(0, 87).trimEnd()}...` : hook}"`,
    detail: d.status === "scheduled" && when ? `Scheduled for ${when}.` : "Saved as a draft in My posts.",
    link: links.generate({ draft: d.id }),
  });
}

/** The newest MAX_DRAFTS, dropping the oldest posts Zernio doesn't hold first, so a post still going out keeps its card. */
function trimDrafts(drafts: DraftEntry[]): DraftEntry[] {
  const over = drafts.length - MAX_DRAFTS;
  if (over <= 0) return drafts;
  const drop = new Set<number>();
  for (let i = drafts.length - 1; i >= 0 && drop.size < over; i--) if (!zernioHolds(drafts[i])) drop.add(i);
  for (let i = drafts.length - 1; drop.size < over; i--) drop.add(i);
  return drafts.filter((_, i) => !drop.has(i));
}

/** The entries `adding` new ones at the top push out of the list, by trimDrafts' rule (so a post Zernio holds goes last). */
export function pushedOut(drafts: DraftEntry[], adding: number): DraftEntry[] {
  // the new ones only need to be posts Zernio doesn't hold
  const kept = new Set(trimDrafts([...Array.from({ length: adding }, () => ({}) as DraftEntry), ...drafts]));
  return drafts.filter((d) => !kept.has(d));
}

function withoutZernio({ zernio: _, ...rest }: DraftEntry): DraftEntry {
  return rest;
}

function parseList(raw: string | null): DraftEntry[] {
  try {
    const parsed = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Saves the list, trimmed (trimDrafts), and returns it as saved. A post Zernio has cancelled loses its link first,
 * and a changed time on a post Zernio holds queues a move in the outbox (zernioOutbox.ts); nothing else touches it.
 */
export function saveDrafts(userId: string, drafts: DraftEntry[]): DraftEntry[] {
  const storage = safeStorage();
  if (!storage) return drafts;
  const key = `${KEY_PREFIX}${scoped(userId)}`;
  const box = loadOutbox(userId);
  const unlinked = box.gone.length ? drafts.map((d) => (d.zernio?.postId && box.gone.includes(d.zernio.postId) ? withoutZernio(d) : d)) : drafts;
  const next = trimDrafts(unlinked);
  const ops = next.some(zernioHolds) ? zernioOps(parseList(storage.getItem(key)), next, box) : box;
  storage.setItem(key, JSON.stringify(next));
  if (ops !== box) saveOutbox(userId, ops);
  return next;
}

const CHANGED = "content-studio-drafts-changed";

/** Tells open pages the drafts changed from outside them (the assistant), so they read them again. */
export const draftsChanged = () => void globalThis.dispatchEvent?.(new Event(CHANGED));

/** Calls `cb` on draftsChanged; returns the unsubscribe, for a useEffect. */
export function onDraftsChanged(cb: () => void): () => void {
  window.addEventListener(CHANGED, cb);
  return () => window.removeEventListener(CHANGED, cb);
}

export function upsertDraft(
  userId: string,
  entry: DraftEntry,
): DraftEntry[] {
  const current = loadDrafts(userId);
  const prev = current.find((d) => d.id === entry.id);
  // Write rebuilds an entry from its own fields, which don't include the post's
  // numbers or labels: keep them rather than wipe them on every edit.
  if (prev?.metrics && !entry.metrics) entry = { ...entry, metrics: prev.metrics };
  if (prev?.labels && !entry.labels) entry = { ...entry, labels: prev.labels };
  if (prev?.storyboard && !entry.storyboard) entry = { ...entry, storyboard: prev.storyboard };
  if (prev?.zernio && !entry.zernio) entry = { ...entry, zernio: prev.zernio };
  if (prev?.media && !entry.media) entry = { ...entry, media: prev.media };
  if (prev?.attached && !entry.attached) entry = { ...entry, attached: prev.attached };
  // A writer that never heard of the source leaves the key out; Write always sets it (undefined clears it).
  if (prev?.source && !("source" in entry)) entry = { ...entry, source: prev.source };
  if (prev?.remix && !entry.remix) entry = { ...entry, remix: prev.remix };
  if (prev?.agent && !entry.agent) entry = { ...entry, agent: prev.agent };
  if (prev?.thread && !entry.thread) entry = { ...entry, thread: prev.thread };
  if (prev?.titles && !entry.titles) entry = { ...entry, titles: prev.titles };
  if (prev?.cover && !entry.cover) entry = { ...entry, cover: prev.cover };
  // ...or a version's language, its link to the English, the English meaning and Jev's answer (a writer that sets one, even to undefined, wins)
  if (prev?.lang && !("lang" in entry)) entry = { ...entry, lang: prev.lang };
  if (prev?.translationOf && !("translationOf" in entry)) entry = { ...entry, translationOf: prev.translationOf };
  if (prev?.back && !("back" in entry)) entry = { ...entry, back: prev.back };
  if (prev && prev.sameP !== undefined && !("sameP" in entry)) entry = { ...entry, sameP: prev.sameP };
  // ...or the formula its hook was written with, while the hook is unchanged
  if (prev?.hookFormula && !entry.hookFormula && prev.hook === entry.hook) entry = { ...entry, hookFormula: prev.hookFormula };
  // ...or its set and network versions (a writer that sets one, even to undefined, wins), its hand-linked live post,
  // and its score while the text and platform it was scored on are the same
  if (prev?.set && !("set" in entry)) entry = { ...entry, set: prev.set };
  if (prev?.versions && !("versions" in entry)) entry = { ...entry, versions: prev.versions };
  if (prev?.live && !entry.live) entry = { ...entry, live: prev.live };
  if (prev?.score && !("score" in entry) && prev.draft === entry.draft && prev.platform === entry.platform) entry = { ...entry, score: prev.score };
  return saveDrafts(userId, [entry, ...current.filter((d) => d.id !== entry.id)]);
}

export function deleteDraft(userId: string, id: string): DraftEntry[] {
  const current = loadDrafts(userId);
  const next = saveDrafts(userId, current.filter((d) => d.id !== id));
  const gone = current.find((d) => d.id === id);
  if (gone) queueCancel(userId, gone, true); // Zernio won't post it, and a failed post comes off Zernio too
  return next;
}

export function getDraftById(
  userId: string | null | undefined,
  id: string,
): DraftEntry | null {
  if (!userId) return null;
  return loadDrafts(userId).find((d) => d.id === id) ?? null;
}

export function setDraftStatus(
  userId: string,
  id: string,
  status: DraftStatus,
  when?: string,
): DraftEntry[] {
  const current = loadDrafts(userId);
  const series = current.find((d) => d.id === id);
  // Posting one occurrence of a recurring post: record it as its own posted entry
  // and move the series on. A post made today covers every occurrence up to today.
  if (status === "posted" && series?.repeat && series.scheduledFor) {
    const record: DraftEntry = { ...series, id: newDraftId(), status: "posted", postedAt: when ?? new Date().toISOString() };
    delete record.repeat;
    delete record.metrics;
    const day = series.scheduledFor.slice(0, 10);
    const today = localDateKey();
    const moved = advance(series, day > today ? day : today);
    delete moved.zernio; // that post was this occurrence's, kept on the posted record
    const next = [record, ...current.map((d) => (d.id === id ? moved : d))];
    return saveDrafts(userId, next);
  }
  const next = current.map((d) => {
    if (d.id !== id) return d;
    const updated: DraftEntry = { ...d, status };
    if (status === "posted") updated.postedAt = when ?? new Date().toISOString();
    if (status === "scheduled") {
      delete updated.postedAt; // back from posted (Mark unposted, a plan slot unticked)
      updated.scheduledFor = when ?? d.scheduledFor;
      // Moving a recurring post moves the whole series to count from the new day.
      if (when && d.repeat) updated.repeat = { every: d.repeat.every, start: when.slice(0, 10) };
    }
    if (status === "draft") {
      delete updated.postedAt;
      delete updated.scheduledFor;
      delete updated.repeat;
    }
    return updated;
  });
  const saved = saveDrafts(userId, next);
  if (status === "draft" && series) queueCancel(userId, series); // Back in drafts: Zernio won't post it
  return saved;
}

/** Real numbers pulled on Analytics onto the drafts linked to a post (by draft id): its Zernio link, else its live one. Saves only on a change. */
export function setDraftNumbers(userId: string, byDraft: Map<string, Numbers>, at: string): DraftEntry[] {
  const current = loadDrafts(userId);
  let changed = false;
  const next = current.map((d) => {
    const link = d.zernio ?? d.live;
    const n = link && byDraft.get(d.id);
    if (!n || JSON.stringify({ ...link!.numbers, at: "" }) === JSON.stringify({ ...n, at: "" })) return d;
    changed = true;
    return d.zernio ? { ...d, zernio: { ...d.zernio, numbers: { ...n, at } } } : { ...d, live: { ...d.live!, numbers: { ...n, at } } };
  });
  return changed ? saveDrafts(userId, next) : next;
}

/** Post it for me: sets or (null) clears the Zernio post a draft is linked to. */
/** The files attached in Write; an empty list removes the field. */
export function setDraftAttached(userId: string, id: string, keys: string[]): DraftEntry[] {
  const next = loadDrafts(userId).map((d) => {
    if (d.id !== id) return d;
    const updated: DraftEntry = { ...d, attached: keys };
    if (!keys.length) delete updated.attached;
    return updated;
  });
  return saveDrafts(userId, next);
}

export function setDraftZernio(userId: string, id: string, link: ZernioLink | null): DraftEntry[] {
  const before = loadDrafts(userId).find((d) => d.id === id);
  const next = loadDrafts(userId).map((d) => {
    if (d.id !== id) return d;
    // Zernio's answer (linkFromView) knows nothing of the zone the send was made in: the same send keeps it
    const tz = link && !link.tz && d.zernio?.tz && d.zernio.key === link.key ? { tz: d.zernio.tz } : {};
    const updated: DraftEntry = { ...d, zernio: link ? { ...link, ...tz } : undefined };
    if (!link) delete updated.zernio;
    return updated;
  });
  const saved = saveDrafts(userId, next);
  // the first read that finds it failed or partly posted goes in Activity's Corrections, once per post and outcome
  const went = link?.status;
  if (before && (went === "failed" || went === "partial") && before.zernio?.status !== went) {
    const hook = before.hook || before.draft.slice(0, 60) || "Untitled";
    logActivity(userId, {
      id: `fx${id.replace(/-/g, "")}${went === "partial" ? "p" : "f"}`.slice(0, 64),
      who: "schedule",
      kind: "correction",
      title: went === "failed" ? `"${hook}" didn't go out` : `"${hook}" only partly went out`,
      detail: went === "failed" ? "Zernio marked it failed. Try it again from the post, or post it yourself." : "Some networks didn't take it. Try those again from the post.",
      link: links.generate({ draft: id, panel: "post" }),
    });
  }
  return saved;
}

/**
 * "Mark unposted": back to Scheduled on the day, time and repeat it had, numbers kept.
 * A post that never had a day goes back to the drafts.
 */
export function markUnposted(userId: string, id: string): DraftEntry[] {
  const d = loadDrafts(userId).find((x) => x.id === id);
  return setDraftStatus(userId, id, d?.scheduledFor ? "scheduled" : "draft");
}

/**
 * A copy of a post as a fresh draft at the top of the list: same content, labels,
 * network versions and score, " (copy)" on the title, no schedule, posting
 * record, numbers, live post or set.
 * `dropped` is whatever the cap pushed off the end, so Undo can put it back.
 */
export function duplicateDraft(userId: string, id: string): { drafts: DraftEntry[]; copy: DraftEntry; dropped: DraftEntry[] } | null {
  const current = loadDrafts(userId);
  const src = current.find((d) => d.id === id);
  if (!src) return null;
  const copy: DraftEntry = { ...src, id: newDraftId(), createdAt: new Date().toISOString(), hook: `${src.hook} (copy)`.trim(), status: "draft" };
  for (const k of ["scheduledFor", "postedAt", "repeat", "metrics", "zernio", "live", "set"] as const) delete copy[k];
  const drafts = saveDrafts(userId, [copy, ...current]);
  const kept = new Set(drafts.map((d) => d.id));
  return { drafts, copy, dropped: current.filter((d) => !kept.has(d.id)) };
}

/** Undo for duplicateDraft: removes the copy and puts back anything it pushed off the end. */
export function undoDuplicate(userId: string, copyId: string, dropped: DraftEntry[]): DraftEntry[] {
  return saveDrafts(userId, [...loadDrafts(userId).filter((d) => d.id !== copyId), ...dropped]);
}

/**
 * Undo for marking a post posted: puts the post back as it was, removes the posted
 * copy a recurring post leaves, and returns any post that copy pushed past the cap.
 * `before` is the list as it was just before the post was marked.
 */
export function undoPosted(userId: string, prev: DraftEntry, before: DraftEntry[]): DraftEntry[] {
  const was = new Set(before.map((d) => d.id));
  const current = loadDrafts(userId);
  const now = new Set(current.map((d) => d.id));
  const next = [
    // a draft Claude saved in the meantime arrived through loadDrafts, which removed its row: keep it
    ...current.filter((d) => was.has(d.id) || d.id.startsWith("claude-")).map((d) => (d.id === prev.id ? prev : d)),
    ...before.filter((d) => !now.has(d.id)),
  ];
  return saveDrafts(userId, next);
}

/** Puts an entry back exactly as it was (for Undo), in its place in the list. */
export function restoreDraft(userId: string, entry: DraftEntry): DraftEntry[] {
  const next = loadDrafts(userId).map((d) => (d.id === entry.id ? entry : d));
  return saveDrafts(userId, next);
}

/** Makes a scheduled post repeat from its scheduled day, or stops it repeating. */
export function setRepeat(userId: string, id: string, every: RepeatEvery | null): DraftEntry[] {
  const next = loadDrafts(userId).map((d) => {
    if (d.id !== id) return d;
    const updated: DraftEntry = { ...d };
    if (every && d.scheduledFor) updated.repeat = { every, start: d.scheduledFor.slice(0, 10) };
    else delete updated.repeat;
    return updated;
  });
  return saveDrafts(userId, next);
}

/** "Skip this one": the series' next occurrence moves on; a later one is left out. */
export function skipOccurrence(userId: string, id: string, day: string): DraftEntry[] {
  const next = loadDrafts(userId).map((d) => {
    if (d.id !== id || !d.repeat || !d.scheduledFor) return d;
    if (day === d.scheduledFor.slice(0, 10)) {
      const today = localDateKey();
      return advance(d, day > today ? day : today);
    }
    return { ...d, repeat: { ...d.repeat, skip: [...(d.repeat.skip ?? []), day] } };
  });
  return saveDrafts(userId, next);
}

export interface DraftStats {
  total: number;
  drafts: number;
  scheduled: number;
  posted: number;
  postedThisMonth: number;
  lastPostedAt: string | null;
}

export function getDraftStats(userId: string | null | undefined): DraftStats {
  const all = loadDrafts(userId);
  const now = new Date();
  let drafts = 0;
  let scheduled = 0;
  let posted = 0;
  let postedThisMonth = 0;
  let lastPostedAt: string | null = null;
  for (const d of all) {
    const s = draftStatus(d);
    if (s === "scheduled") scheduled++;
    else if (s === "posted") {
      posted++;
      if (d.postedAt) {
        const p = new Date(d.postedAt);
        if (
          p.getFullYear() === now.getFullYear() &&
          p.getMonth() === now.getMonth()
        ) {
          postedThisMonth++;
        }
        if (!lastPostedAt || d.postedAt > lastPostedAt) lastPostedAt = d.postedAt;
      }
    } else drafts++;
  }
  return { total: all.length, drafts, scheduled, posted, postedThisMonth, lastPostedAt };
}

function mondayOf(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // Mon = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}
function weekKey(d: Date): string {
  const m = mondayOf(d);
  return `${m.getFullYear()}-${m.getMonth()}-${m.getDate()}`;
}

export interface PostingActivity {
  thisWeekPosted: number;
  weekStreak: number;
}

// Weekly posting rhythm: how many posts went out this (Mon-Sun) week, and how
// many consecutive weeks have had at least one post (the current in-progress
// week doesn't break the streak).
export function getPostingActivity(
  userId: string | null | undefined,
): PostingActivity {
  const posted = loadDrafts(userId).filter(
    (d) => draftStatus(d) === "posted" && d.postedAt,
  );
  const active = new Set(posted.map((d) => weekKey(new Date(d.postedAt!))));
  const now = new Date();
  const thisWeekPosted = posted.filter(
    (d) => weekKey(new Date(d.postedAt!)) === weekKey(now),
  ).length;

  let streak = 0;
  let cursor = mondayOf(now);
  if (!active.has(weekKey(cursor))) {
    // Current week not yet posted — start counting from last week instead.
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 7);
  }
  while (active.has(weekKey(cursor))) {
    streak++;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 7);
  }
  return { thisWeekPosted, weekStreak: streak };
}

export function setDraftMetrics(
  userId: string,
  id: string,
  metrics: PostMetrics,
): DraftEntry[] {
  const current = loadDrafts(userId);
  const next = current.map((d) =>
    d.id === id
      ? { ...d, metrics: { ...d.metrics, ...metrics } }
      : d,
  );
  return saveDrafts(userId, next);
}

export interface AnalyticsSummary {
  trackedCount: number;
  totalImpressions: number;
  totalEngagement: number;
  avgEngagementRate: number; // % of impressions that engaged
  top: DraftEntry[]; // posts with metrics, best engagement first
  bestPillar: string | null;
  bestFormat: string | null;
}

export function getAnalytics(
  userId: string | null | undefined,
): AnalyticsSummary {
  const tracked = loadDrafts(userId).filter(
    (d) => d.metrics && (d.metrics.impressions || engagement(d.metrics)),
  );
  let totalImpressions = 0;
  let totalEngagement = 0;
  const byPillar: Record<string, number> = {};
  const byFormat: Record<string, number> = {};
  for (const d of tracked) {
    totalImpressions += d.metrics?.impressions ?? 0;
    const e = engagement(d.metrics);
    totalEngagement += e;
    byPillar[d.pillar] = (byPillar[d.pillar] ?? 0) + e;
    byFormat[d.format] = (byFormat[d.format] ?? 0) + e;
  }
  const top = [...tracked].sort(
    (a, b) => engagement(b.metrics) - engagement(a.metrics),
  );
  const bestOf = (r: Record<string, number>): string | null => {
    const keys = Object.keys(r);
    if (keys.length === 0) return null;
    return keys.sort((a, b) => r[b] - r[a])[0];
  };
  return {
    trackedCount: tracked.length,
    totalImpressions,
    totalEngagement,
    avgEngagementRate:
      totalImpressions > 0
        ? Math.round((totalEngagement / totalImpressions) * 1000) / 10
        : 0,
    top,
    bestPillar: bestOf(byPillar),
    bestFormat: bestOf(byFormat),
  };
}

export function newDraftId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
