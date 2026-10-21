// Post it for me (My posts, Calendar, Write): an adviser's draft scheduled through Zernio on their own
// connected accounts, its status per platform, cancel and retry, and the upload links for its media.
// Every id from a request passes the checks in _shared/zernio.ts before Zernio sees it (rules H1, H2, H4,
// M2 in docs/zernio-connection.md), and every post Zernio hands back passes the post check before the
// caller sees it. Shapes are from https://zernio.com/openapi.json and the platform pages as of 2026-10-11.
// Pure: Zernio comes in. Also imported by the app, so the screen shows the same refusals before it sends.

import {
  NotYours,
  SOCIAL_PLATFORMS,
  ZernioError,
  callerAccounts,
  checkPost,
  idempotencyKey,
  isProfileId,
  isZernioId,
  ownPost,
  pathId,
  refId,
  requireAccounts,
  type SocialPlatform,
  type Zernio,
} from "../_shared/zernio.ts";
import { isAllowed } from "./logic.ts";

export const POST_ACTIONS = ["presign", "schedule", "post", "cancel", "retry", "tiktok-creator-info"] as const;
export type PostAction = (typeof POST_ACTIONS)[number];

/** The app works in Singapore time; Zernio stores it on the post. */
export const TIMEZONE = "Asia/Singapore";

// What one upload may be. The app's video exports run at 8 Mbps, so 300 MB (Instagram's own cap for
// a Reel) holds about 5 minutes; slides and pictures are far under 8 MB.
export const MEDIA_TYPES: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "video/mp4": ["mp4"],
  "video/quicktime": ["mov"],
};
export const MAX_IMAGE_BYTES = 8_000_000;
export const MAX_VIDEO_BYTES = 300_000_000;
export const MAX_PICTURES = 10;

/** Caption limits from each platform's Zernio page. */
export const CAPTION_MAX: Record<SocialPlatform, number> = { instagram: 2200, facebook: 63206, tiktok: 2200, linkedin: 3000, youtube: 5000, threads: 500 };
export const FIRST_COMMENT_MAX = 1250;
export const YOUTUBE_TITLE_MAX = 100;
/** Platforms with no text-only posts. */
export const NEEDS_MEDIA: string[] = ["instagram", "tiktok", "youtube"];
/** Where Zernio posts a first comment (not TikTok). */
const FIRST_COMMENT_PLATFORMS = ["instagram", "facebook", "linkedin", "threads", "youtube"];
/** A "now" post goes out a minute ahead, so Zernio publishes it in the background and a slow upload never times out the call. */
export const NOW_LEAD_MS = 60_000;

const NAMES: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", linkedin: "LinkedIn", youtube: "YouTube", threads: "Threads" };
const nameOf = (p: string) => NAMES[p] ?? p;

export interface TikTokInput {
  privacyLevel: string;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
}

export interface YouTubeInput {
  title: string;
  visibility: "public" | "unlisted" | "private";
}

/** What the screen sends to schedule a draft. */
export interface ScheduleInput {
  /** A UUID made once per send of a draft; a retry with it never makes a second post (H4). */
  clientKey: string;
  content: string;
  /** Per platform caption; the content when absent. */
  captions: Partial<Record<SocialPlatform, string>>;
  mediaUrls: string[];
  /** ISO with an offset, or null for now. */
  scheduledFor: string | null;
  firstComment: string;
  tiktok: TikTokInput | null;
  youtube: YouTubeInput | null;
  /** A Threads thread, 2 to 10 posts, the first the root (Leo only, formats-text-threads). content is then its first post. */
  thread?: string[];
}

/** A thread's posts, the first the root. Zernio's ThreadsPlatformData.threadItems (zernio.com/openapi.json, read 2026-10-21). */
export const THREAD_POSTS = { min: 2, max: 10 } as const;
export const THREAD_MIXED = "Send the thread to Threads on its own, then the post to the others.";

// narrowed with "error" in r: the app compiles without strictNullChecks, where an ok flag would not narrow
type Checked<T> = { value: T } | { error: string };
const refuse = (error: string): Checked<never> => ({ error });
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// hours 00-23 and minutes 00-59 only: Date.parse takes 24:00
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const PRIVACY = /^[A-Z_]{1,40}$/;

/** image or video from the link's file ending (Zernio reads the type the same way), or null. */
export function mediaKind(url: string): "image" | "video" | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || url.length > 2000) return null;
    const ext = u.pathname.split(".").pop()?.toLowerCase() ?? "";
    return ["jpg", "jpeg", "png", "webp"].includes(ext) ? "image" : ["mp4", "mov"].includes(ext) ? "video" : null;
  } catch {
    return null;
  }
}

/** The fields, checked the same way whatever the platforms. Plain words for the adviser. */
export function checkSchedule(raw: unknown, now = Date.now()): Checked<ScheduleInput> {
  if (!raw || typeof raw !== "object") return refuse("Fill in the post first.");
  const b = raw as Record<string, unknown>;
  if (typeof b.clientKey !== "string" || !UUID.test(b.clientKey)) return refuse("Close this and try again.");
  let thread: string[] | undefined;
  if (b.thread !== undefined && b.thread !== null) {
    if (!Array.isArray(b.thread) || b.thread.length < THREAD_POSTS.min || b.thread.length > THREAD_POSTS.max) return refuse(`A thread has ${THREAD_POSTS.min} to ${THREAD_POSTS.max} posts.`);
    thread = b.thread.map(text);
    if (thread.some((p) => !p)) return refuse("Fill in every post in the thread, or take the empty one out.");
    if (thread.some((p) => p.length > CAPTION_MAX.threads)) return refuse(`Keep each post in the thread under ${CAPTION_MAX.threads + 1} characters.`);
  }
  // a thread's first post is the post Zernio shows; the thread itself is what goes out
  const content = thread ? thread[0] : text(b.content);
  if (content.length > CAPTION_MAX.facebook) return refuse("The post is too long for any platform.");
  const captions: ScheduleInput["captions"] = {};
  const rawCaptions = b.captions && typeof b.captions === "object" ? (b.captions as Record<string, unknown>) : {};
  for (const p of SOCIAL_PLATFORMS) if (typeof rawCaptions[p] === "string") captions[p] = text(rawCaptions[p]);
  const mediaUrls = Array.isArray(b.mediaUrls) ? b.mediaUrls : [];
  if (mediaUrls.some((u) => typeof u !== "string" || !mediaKind(u))) return refuse("Attach the media again.");
  const kinds = (mediaUrls as string[]).map(mediaKind);
  const videos = kinds.filter((k) => k === "video").length;
  if (videos > 1 || (videos === 1 && kinds.length > 1)) return refuse("Post one video, or up to 10 pictures.");
  if (kinds.length > MAX_PICTURES) return refuse(`Post up to ${MAX_PICTURES} pictures.`);
  let scheduledFor: string | null = null;
  if (b.now !== true) {
    if (typeof b.scheduledFor !== "string" || !ISO_WITH_OFFSET.test(b.scheduledFor) || !Number.isFinite(Date.parse(b.scheduledFor))) {
      return refuse("Pick the day and time again.");
    }
    if (Date.parse(b.scheduledFor) < now + NOW_LEAD_MS) return refuse("That time has passed. Pick a later time, or post now.");
    scheduledFor = b.scheduledFor;
  }
  const firstComment = text(b.firstComment);
  if (firstComment.length > FIRST_COMMENT_MAX) return refuse(`Keep the first comment under ${FIRST_COMMENT_MAX + 1} characters.`);
  let tiktok: TikTokInput | null = null;
  if (b.tiktok && typeof b.tiktok === "object") {
    const t = b.tiktok as Record<string, unknown>;
    if (typeof t.privacyLevel !== "string" || !PRIVACY.test(t.privacyLevel)) return refuse("Pick who can see it on TikTok.");
    tiktok = { privacyLevel: t.privacyLevel, allowComment: t.allowComment === true, allowDuet: t.allowDuet === true, allowStitch: t.allowStitch === true };
  }
  let youtube: YouTubeInput | null = null;
  if (b.youtube && typeof b.youtube === "object") {
    const y = b.youtube as Record<string, unknown>;
    const title = text(y.title);
    if (title.length > YOUTUBE_TITLE_MAX) return refuse(`Keep the YouTube title under ${YOUTUBE_TITLE_MAX + 1} characters.`);
    const visibility = y.visibility === "unlisted" || y.visibility === "private" ? y.visibility : "public";
    youtube = { title, visibility };
  }
  return { value: { clientKey: b.clientKey.toLowerCase(), content, captions, mediaUrls: mediaUrls as string[], scheduledFor, firstComment, tiktok, youtube, ...(thread ? { thread } : {}) } };
}

export const captionFor = (input: ScheduleInput, platform: string) => input.captions[platform as SocialPlatform] ?? input.content;

/** What these platforms can't take, or null when it fits. Before Zernio's own 400. */
export function platformProblem(input: ScheduleInput, platforms: string[]): string | null {
  if (!platforms.length) return "Pick an account to post to.";
  if (input.thread && platforms.some((p) => p !== "threads")) return THREAD_MIXED;
  const kinds = input.mediaUrls.map(mediaKind);
  const video = kinds.includes("video");
  for (const p of platforms) {
    if (!(SOCIAL_PLATFORMS as readonly string[]).includes(p)) return "Posting doesn't work on that account.";
    const caption = captionFor(input, p);
    if (caption.length > CAPTION_MAX[p as SocialPlatform]) return `Keep the ${nameOf(p)} caption under ${CAPTION_MAX[p as SocialPlatform] + 1} characters.`;
    if (!kinds.length && NEEDS_MEDIA.includes(p)) return `${nameOf(p)} needs a picture or video.`;
    if (!kinds.length && !caption) return "Write the caption, or attach a picture or video.";
    if (p === "youtube" && !video) return "YouTube takes one video.";
    // the formats on each platform's Zernio page
    if (["instagram", "threads", "linkedin"].includes(p) && input.mediaUrls.some((u) => /\.webp$/i.test(new URL(u).pathname))) return `${nameOf(p)} takes JPG or PNG pictures.`;
    if (p === "threads" && input.mediaUrls.some((u) => /\.mov$/i.test(new URL(u).pathname))) return "Threads takes MP4 videos.";
    if (p === "tiktok" && !input.tiktok) return "Pick who can see it on TikTok.";
  }
  return null;
}

/** The settings Zernio takes on one platform's entry, or null for none. */
function platformData(input: ScheduleInput, platform: string): Record<string, unknown> | null {
  const video = input.mediaUrls.some((u) => mediaKind(u) === "video");
  const data: Record<string, unknown> = {};
  if (platform === "tiktok" && input.tiktok) {
    Object.assign(data, {
      privacyLevel: input.tiktok.privacyLevel,
      allowComment: input.tiktok.allowComment,
      // TikTok's legal requirement: the adviser saw the post and pressed post on this screen
      contentPreviewConfirmed: true,
      expressConsentGiven: true,
    });
    if (video) Object.assign(data, { allowDuet: input.tiktok.allowDuet, allowStitch: input.tiktok.allowStitch });
    // a photo post's content becomes a 90-character title; the full caption goes in description
    else data.description = captionFor(input, platform);
  }
  if (platform === "youtube") {
    Object.assign(data, { visibility: input.youtube?.visibility ?? "public", madeForKids: false });
    if (input.youtube?.title) data.title = input.youtube.title;
  }
  if (platform === "threads" && input.thread) {
    // item 0 is the root post and carries the media; the rest are chained as replies
    data.threadItems = input.thread.map((content, i) => (i === 0 && input.mediaUrls.length ? { content, mediaItems: input.mediaUrls.map((url) => ({ url })) } : { content }));
  }
  if (input.firstComment && FIRST_COMMENT_PLATFORMS.includes(platform)) data.firstComment = input.firstComment;
  return Object.keys(data).length ? data : null;
}

/** POST /v1/posts body for these checked accounts. */
export function postBody(input: ScheduleInput, accounts: { _id: string; platform: string }[], now = Date.now()): Record<string, unknown> {
  return {
    content: input.content,
    mediaItems: input.mediaUrls.map((url) => ({ url })),
    platforms: accounts.map((a) => {
      const data = platformData(input, a.platform);
      return { platform: a.platform, accountId: a._id, customContent: captionFor(input, a.platform), ...(data ? { platformSpecificData: data } : {}) };
    }),
    scheduledFor: input.scheduledFor ?? new Date(now + NOW_LEAD_MS).toISOString(),
    timezone: TIMEZONE,
  };
}

// ---- requests ----

export interface UploadFile {
  filename: string;
  contentType: string;
  size: number;
}

export type PostRequest =
  | { action: "presign"; profileId: string; file: UploadFile }
  | { action: "schedule"; profileId: string; accountIds: string[]; input: ScheduleInput }
  | { action: "post" | "cancel" | "retry"; profileId: string; postId: string }
  | { action: "tiktok-creator-info"; profileId: string; accountId: string; mediaType: "video" | "photo" };

type Parsed = { ok: true; req: PostRequest } | { ok: false; status: number; error: string };
const notFound: Parsed = { ok: false, status: 404, error: "Not found." };
const bad = (error: string): Parsed => ({ ok: false, status: 400, error });

/** The upload's name, type and size, or the reason it can't go. */
export function checkUpload(raw: Record<string, unknown>): Checked<UploadFile> {
  const exts = MEDIA_TYPES[raw.contentType as string];
  if (!exts) return refuse("Attach a JPG, PNG or WebP picture, or an MP4 or MOV video.");
  const filename = typeof raw.filename === "string" ? raw.filename : "";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(filename) || !exts.includes(ext)) return refuse("Rename the file to letters and numbers, with its own ending.");
  const size = raw.size;
  const max = (raw.contentType as string).startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (!Number.isInteger(size) || (size as number) <= 0) return refuse("That file is empty.");
  if ((size as number) > max) return refuse(`Keep ${max === MAX_VIDEO_BYTES ? "a video under 300 MB" : "a picture under 8 MB"}.`);
  return { value: { filename, contentType: raw.contentType as string, size: size as number } };
}

/** Null when the action is not a posting one. H1: a malformed id is a 404 before any other use. */
export function parsePostRequest(body: unknown, now = Date.now()): Parsed | null {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const action = b.action as PostAction;
  if (!POST_ACTIONS.includes(action)) return null;
  if (!isProfileId(b.profileId)) return notFound;
  const profileId = b.profileId;
  if (action === "presign") {
    const file = checkUpload(b);
    return "error" in file ? bad(file.error) : { ok: true, req: { action, profileId, file: file.value } };
  }
  if (action === "schedule") {
    if (!Array.isArray(b.accountIds) || b.accountIds.length === 0) return bad("Pick an account to post to.");
    if (b.accountIds.length > SOCIAL_PLATFORMS.length * 2 || !b.accountIds.every(isZernioId)) return notFound;
    const input = checkSchedule(b, now);
    return "error" in input ? bad(input.error) : { ok: true, req: { action, profileId, accountIds: [...new Set(b.accountIds as string[])], input: input.value } };
  }
  if (action === "tiktok-creator-info") {
    if (!isZernioId(b.accountId)) return notFound;
    return { ok: true, req: { action, profileId, accountId: b.accountId, mediaType: b.mediaType === "photo" ? "photo" : "video" } };
  }
  if (!isZernioId(b.postId)) return notFound;
  return { ok: true, req: { action, profileId, postId: b.postId } };
}

// ---- what the app sees ----

export const POST_STATUSES = ["draft", "scheduled", "publishing", "published", "partial", "failed", "cancelled"] as const;
export type PostStatus = (typeof POST_STATUSES)[number] | "unknown";

export interface PlatformResult {
  platform: string;
  accountId: string;
  /** pending, processing, uploading, published, failed or cancelled */
  status: string;
  url: string | null;
  error: string;
}

export interface PostView {
  id: string;
  status: PostStatus;
  scheduledFor: string | null;
  platforms: PlatformResult[];
}

export interface CreatorInfo {
  privacyLevels: { value: string; label: string }[];
  /** False when the creator switched it off in the TikTok app. Duet and stitch are null for photos. */
  comment: boolean;
  duet: boolean | null;
  stitch: boolean | null;
  canPostMore: boolean;
  maxVideoSeconds: number | null;
}

const https = (v: unknown) => (typeof v === "string" && /^https:\/\//.test(v) ? v : null);
const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");

export function postView(p: Record<string, unknown>): PostView {
  const status = POST_STATUSES.includes(p.status as (typeof POST_STATUSES)[number]) ? (p.status as PostStatus) : "unknown";
  return {
    id: p._id as string,
    status,
    scheduledFor: typeof p.scheduledFor === "string" ? p.scheduledFor : null,
    platforms: (Array.isArray(p.platforms) ? p.platforms : []).map((x: Record<string, unknown>) => ({
      platform: str(x?.platform, 40),
      accountId: refId(x?.accountId),
      status: str(x?.status, 20) || "pending",
      url: https(x?.platformPostUrl),
      error: str(x?.errorMessage),
    })),
  };
}

const toggle = (v: unknown) => (v && typeof v === "object" ? (v as { enabled?: unknown }).enabled !== false : null);

export function creatorInfoView(d: Record<string, unknown>): CreatorInfo {
  const limits = (d.postingLimits ?? {}) as Record<string, unknown>;
  const settings = (limits.interactionSettings ?? {}) as Record<string, unknown>;
  const levels = Array.isArray(d.privacyLevels) ? d.privacyLevels : [];
  return {
    privacyLevels: levels
      .filter((l: { value?: unknown }) => typeof l?.value === "string" && PRIVACY.test(l.value))
      .map((l: { value: string; label?: unknown }) => ({ value: l.value, label: str(l.label, 60) || l.value })),
    comment: toggle(settings.allow_comment) ?? true,
    duet: toggle(settings.allow_duet),
    stitch: toggle(settings.allow_stitch),
    canPostMore: (d.creator as { canPostMore?: unknown } | undefined)?.canPostMore !== false,
    maxVideoSeconds: typeof limits.maxVideoDurationSec === "number" ? limits.maxVideoDurationSec : null,
  };
}

// ---- the actions ----

type Reply = { status: number; body: Record<string, unknown> };
// read when called: the app imports this file too, where there is no Deno
const northStarUsers = () => (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get("NORTH_STAR_USERS");
const ok = (body: Record<string, unknown>): Reply => ({ status: 200, body });

/** Runs one posting action for the caller's brand. mapped: the brand's Zernio profile, or null before its first connect. */
export async function runPost(z: Zernio, mapped: string | null, uid: string, q: PostRequest, now = Date.now()): Promise<Reply> {
  // a thread is Leo's (NORTH_STAR_USERS) on top of SOCIAL_CONNECT_USERS, refused before Zernio hears of it
  if (q.action === "schedule" && q.input.thread && !isAllowed(northStarUsers(), uid)) {
    return { status: 403, body: { code: "not_enabled", error: "This isn't switched on for your account yet." } };
  }
  if (!mapped) throw new NotYours("no profile");

  if (q.action === "presign") {
    const data = await z("POST", "/media/presign", { body: q.file });
    const uploadUrl = https(data?.uploadUrl);
    const publicUrl = https(data?.publicUrl);
    if (!uploadUrl || !publicUrl || !mediaKind(publicUrl)) throw new ZernioError(502, "unreadable", "Zernio didn't send an upload link.");
    return ok({ uploadUrl, publicUrl });
  }

  const own = await callerAccounts(z, mapped);
  const ids = new Set(own.map((a) => a._id));

  if (q.action === "tiktok-creator-info") {
    const [accountId] = requireAccounts(ids, [q.accountId]);
    if (own.find((a) => a._id === accountId)?.platform !== "tiktok") throw new NotYours("not a TikTok account");
    const data = await z("GET", `/accounts/${pathId(accountId)}/tiktok/creator-info`, { query: { mediaType: q.mediaType } });
    return ok({ info: creatorInfoView(data ?? {}) });
  }

  if (q.action === "schedule") {
    const accounts = requireAccounts(ids, q.accountIds).map((id) => own.find((a) => a._id === id)!);
    const why = platformProblem(q.input, accounts.map((a) => a.platform));
    if (why) return { status: 400, body: { error: why } };
    const data = await z("POST", "/posts", { body: postBody(q.input, accounts, now), idempotencyKey: idempotencyKey(uid, q.profileId, q.input.clientKey) });
    // H4: a replay of the key returns whatever post holds it; it must be this caller's
    return ok({ post: postView(ownPost(data?.post, ids)) });
  }

  // H2: the post is the caller's before anything else
  const post = (await checkPost(z, ids, q.postId)) as Record<string, unknown>;
  const view = postView(post);
  const path = `/posts/${pathId(q.postId)}`;

  if (q.action === "post") return ok({ post: view });

  if (q.action === "cancel") {
    const live = view.platforms.filter((p) => p.status === "published").map((p) => nameOf(p.platform));
    if (view.status === "published" || live.length) {
      return { status: 409, body: { code: "published", error: `It's already posted${live.length ? ` on ${[...new Set(live)].join(" and ")}` : ""}, so it can't be cancelled. Delete it there.` } };
    }
    await z("DELETE", path);
    return ok({ cancelled: true });
  }

  // retry: Zernio documents it for a failed post; a partial one has failed platforms too
  if (view.status !== "failed" && view.status !== "partial") return { status: 409, body: { code: "not_failed", error: "Only a post that failed can be tried again." } };
  const data = await z("POST", `${path}/retry`);
  return ok({ post: postView(ownPost(data?.post, ids)) });
}

/** Zernio's refusals of a post in plain words; null leaves it to the shared errorReply. */
export function postErrorReply(e: unknown): Reply | null {
  if (!(e instanceof ZernioError)) return null;
  if (e.status === 409 && e.code === "idempotency_conflict") return { status: 409, body: { code: "in_flight", error: "Still sending the first try. Check again in a minute." } };
  if (e.status === 409) return { status: 409, body: { code: "duplicate", error: "This exact post is already scheduled or went out on that account in the last 24 hours. Change the caption or media to post it again." } };
  if (e.status === 403 && (e.code === "ACCOUNT_DISCONNECTED" || e.code === "ACCOUNT_NOT_ENABLED_FOR_POSTING")) {
    return { status: 409, body: { code: "reconnect", error: "Reconnect that account on Social accounts first." } };
  }
  if (e.status === 402) return { status: 402, body: { code: "payment_required", error: "Posting isn't available right now." } };
  if (e.status === 429) return { status: 429, body: { code: "rate_limited", error: "Too many posts on that account right now. Try again in an hour." } };
  // a platform rule Zernio checks that we don't (a TikTok privacy level, a video too long): its own words help
  if (e.status === 400 || e.status === 422) {
    const why = e.message.replace(/\s+/g, " ").trim().slice(0, 300);
    return { status: 400, body: { code: e.code || "invalid", error: why && !/^Zernio answered/.test(why) ? `Zernio didn't take it: ${why}` : "Zernio didn't take it. Check the post and try again." } };
  }
  return null;
}
