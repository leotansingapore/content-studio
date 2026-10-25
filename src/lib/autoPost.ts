// Post it for me (My posts, Calendar, Write): a dated draft scheduled through Zernio on the adviser's own
// connected accounts, by the `social` function (supabase/functions/social/posts.ts, which checks every id
// and every field again). Media goes from the browser straight to Zernio's storage: `presign` hands out a
// one-hour PUT link per file, the file is PUT there with progress, and the post carries its public link.
// If that storage ever refuses a browser PUT (CORS), see docs/zernio-connection.md for the fallback.

import { callFn } from "@/lib/edgeFn";
import type { DraftEntry, ZernioLink } from "@/lib/draftHistory";
import type { CarouselBrand } from "@/lib/carousel";
import { tagLinks, toPlainText, withCredit, withDisclosure, withSignOff, type DisclosureId } from "@/lib/plainText";
import { keyToDate, timeLabel } from "@/lib/dueDates";
import { hasComplianceErrors, scanCompliance } from "@/lib/compliance";
import { platformName } from "@/lib/socialConnect";
import {
  CAPTION_MAX,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_PICTURES,
  MAX_VIDEO_BYTES,
  MEDIA_TYPES,
  NOW_LEAD_MS,
  PDF_TYPE,
  platformProblem,
  type CreatorInfo,
  type PlatformResult,
  type PostView,
  type ScheduleInput,
  type TikTokInput,
} from "../../supabase/functions/social/posts.ts";

export { CAPTION_MAX, NEEDS_MEDIA, PDF_LINKEDIN_ONLY, PDF_TYPE, THREAD_MIXED, YOUTUBE_TITLE_MAX, checkSchedule, isPdf, mediaKind, platformProblem } from "../../supabase/functions/social/posts.ts";
export { MAX_PICTURES, MEDIA_TYPES, type CreatorInfo, type PostView };

// ---- the draft ----

/** The draft as it would be pasted: plain text, the brand kit sign-off, its disclosure, the remix credit when ticked, tracked links when the kit asks. */
export function postText(d: Pick<DraftEntry, "draft" | "disclosure" | "platform" | "hook" | "pillarDetail" | "source">, brand: CarouselBrand | null): string {
  const out = withCredit(withDisclosure(withSignOff(toPlainText(d.draft), brand?.signOff?.trim() ?? ""), (d.disclosure ?? []) as DisclosureId[]), d.source);
  return brand?.tagLinks ? tagLinks(out, { source: d.platform, campaign: d.hook || d.pillarDetail || "post" }) : out;
}

/** The draft's day and time as Zernio takes it (Singapore, +08:00), or null when it has no time. */
export function zernioTime(scheduledFor: string | undefined, time?: string): string | null {
  const day = scheduledFor?.slice(0, 10) ?? "";
  const t = time || scheduledFor?.slice(11, 16) || "";
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? `${day}T${t}:00+08:00` : null;
}

/** "Tue 14 Oct, 9:00 am" for a draft day and time. */
export const whenLabel = (day: string, time: string) =>
  `${keyToDate(day).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}, ${timeLabel(time)}`;

/** "Tue 14 Oct, 9:00 am" in Singapore time for an ISO time from Zernio. */
export const sgLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-SG", { timeZone: "Asia/Singapore", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// ---- the status chip ----

// shortcut: social-server adds PlatformResult.draft in wave 1's merge; then this is PostView itself
type View = Omit<PostView, "platforms"> & { platforms: (PlatformResult & { draft?: boolean })[] };

export type ChipTone = "wait" | "good" | "bad" | "muted";

/** Every network it went to went as a TikTok inbox draft, which Zernio calls published though nothing is live. */
const inboxOnly = (link: ZernioLink) => !!link.drafts?.length && (link.platforms ?? link.drafts).every((p) => link.drafts!.includes(p));

/**
 * What the chip on a draft says about its Zernio post, or null when nothing was sent. `markedPosted`: the adviser
 * finished an inbox draft in TikTok and pressed Mark posted, which Zernio never learns.
 */
export function chipOf(link: ZernioLink | undefined, markedPosted = false): { label: string; tone: ChipTone } | null {
  if (!link?.postId) return null;
  switch (link.status) {
    case "published":
      return inboxOnly(link) && !markedPosted ? { label: "In your TikTok inbox", tone: "wait" } : { label: "Posted", tone: "good" };
    case "partial":
      return { label: "Partly posted", tone: "bad" };
    case "failed":
      return { label: "Failed", tone: "bad" };
    case "publishing":
      return { label: "Posting", tone: "wait" };
    case "cancelled":
      return { label: "Cancelled", tone: "muted" };
    default:
      return { label: link.at ? `Scheduled ${sgLabel(link.at)}` : "Scheduled", tone: "wait" };
  }
}

/** Zernio refuses a cancel once anything is live. */
export const canCancel = (link: ZernioLink | undefined) => !!link?.postId && !["published", "partial", "cancelled"].includes(link.status ?? "") && !link.links?.length;
/** Zernio's retry is for a failed post; a partly posted one has failed platforms too. */
export const canRetry = (link: ZernioLink | undefined) => !!link?.postId && (link.status === "failed" || link.status === "partial");
/** Worth asking Zernio again: its time has come and it hasn't settled. */
export const isDue = (link: ZernioLink | undefined, now = Date.now()) =>
  !!link?.postId && !["published", "partial", "failed", "cancelled"].includes(link.status ?? "") && (!link.at || Date.parse(link.at) <= now);

// ---- calls ----

export interface ScheduleRequest {
  accountIds: string[];
  clientKey: string;
  content: string;
  captions?: Record<string, string>;
  mediaUrls: string[];
  scheduledFor?: string;
  now?: boolean;
  firstComment?: string;
  tiktok?: { privacyLevel: string; allowComment: boolean; allowDuet: boolean; allowStitch: boolean };
  youtube?: { title: string; visibility: "public" | "unlisted" | "private" };
  /** A Threads thread (Leo only): 2 to 10 posts, Threads accounts only; content is its first post. */
  thread?: string[];
  /** The title LinkedIn shows on a PDF document (Leo only); sent with a PDF. */
  documentTitle?: string;
}

export const schedulePost = (profileId: string, req: ScheduleRequest) =>
  callFn<{ post: PostView }>("social", { action: "schedule", profileId, ...req }, "Couldn't schedule it. Try again in a minute.");
export const readPost = (profileId: string, postId: string) => callFn<{ post: PostView }>("social", { action: "post", profileId, postId }, "Couldn't check the post. Try again in a minute.");
export const cancelPost = (profileId: string, postId: string) => callFn<{ cancelled: true }>("social", { action: "cancel", profileId, postId }, "Couldn't cancel it. Try again in a minute.");
export const retryPost = (profileId: string, postId: string) => callFn<{ post: PostView }>("social", { action: "retry", profileId, postId }, "Couldn't try it again. Try again in a minute.");
export const tiktokInfo = (profileId: string, accountId: string, mediaType: "video" | "photo") =>
  callFn<{ info: CreatorInfo }>("social", { action: "tiktok-creator-info", profileId, accountId, mediaType }, "Couldn't read your TikTok settings. Try again in a minute.");

/** A file the adviser picked or the app rendered, before it is uploaded. */
export interface MediaFile {
  file: Blob;
  name: string;
  type: string;
}

/**
 * The upload type for a file: its own type when Zernio takes it, else read from its name; null when it can't go.
 * A PDF only with `pdf` (a carousel's LinkedIn document, Leo only), so a picked file is a picture or a video as before.
 */
export function fileType(f: { name: string; type: string }, o: { pdf?: boolean } = {}): string | null {
  const ok = (t: string) => o.pdf || t !== PDF_TYPE;
  if (MEDIA_TYPES[f.type] && ok(f.type)) return f.type;
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  return Object.keys(MEDIA_TYPES).find((t) => ok(t) && MEDIA_TYPES[t].includes(ext)) ?? null;
}

/** Why this file can't go, or null. The same caps the server checks. */
export function fileProblem(f: { name: string; type: string; size: number }, o: { pdf?: boolean } = {}): string | null {
  const type = fileType(f, o);
  if (!type) return `${f.name} isn't a JPG, PNG or WebP picture, or an MP4 or MOV video.`;
  if (type === PDF_TYPE) return f.size > MAX_PDF_BYTES ? `${f.name} is over 20 MB.` : null;
  const video = type.startsWith("video/");
  if (f.size > (video ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) return `${f.name} is over ${video ? "300" : "8"} MB.`;
  return null;
}

/** A plain name the presign takes: letters, numbers and dashes, numbered, with the type's own ending. */
export function uploadName(name: string, type: string, index: number): string {
  const base =
    name
      .replace(/\.[^.]*$/, "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "media";
  return `${base}-${index + 1}.${MEDIA_TYPES[type][0]}`;
}

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

/** PUTs one file to a presigned link, reporting bytes sent. A refused or blocked PUT (status 0) rejects in plain words. */
export function putFile(url: string, file: Blob, type: string, onProgress?: (sent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", type);
    xhr.upload.onprogress = (e) => onProgress?.(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new UploadError(`The upload was refused (${xhr.status}). Try again.`)));
    xhr.onerror = () => reject(new UploadError("The upload didn't go through. Check your connection and try again."));
    xhr.ontimeout = xhr.onerror;
    xhr.send(file);
  });
}

export const presignUpload = (profileId: string, filename: string, contentType: string, size: number) =>
  callFn<{ uploadUrl: string; publicUrl: string }>("social", { action: "presign", profileId, filename, contentType, size }, "Couldn't start the upload. Try again in a minute.");

/**
 * Uploads every file not already in `done` (file -> its public link), in order, and returns the links.
 * A failure keeps what went up in `done`, so trying again sends only the rest.
 */
export async function uploadAll(profileId: string, files: MediaFile[], done: Map<Blob, string>, onProgress: (percent: number) => void): Promise<string[]> {
  const total = files.reduce((n, f) => n + f.file.size, 0) || 1;
  let before = files.filter((f) => done.has(f.file)).reduce((n, f) => n + f.file.size, 0);
  onProgress(Math.round((before / total) * 100));
  for (const [i, f] of files.entries()) {
    if (done.has(f.file)) continue;
    const { uploadUrl, publicUrl } = await presignUpload(profileId, uploadName(f.name, f.type, i), f.type, f.file.size);
    await putFile(uploadUrl, f.file, f.type, (sent) => onProgress(Math.min(99, Math.round(((before + sent) / total) * 100))));
    done.set(f.file, publicUrl);
    before += f.file.size;
    onProgress(Math.round((before / total) * 100));
  }
  return files.map((f) => done.get(f.file)!);
}

/**
 * The draft's link from what Zernio says about its post: status, time, each live post's link, the first reason it
 * failed, the networks when there are several (one network is the draft's own, as before) and those sent as drafts.
 */
export function linkFromView(key: string, v: View): ZernioLink {
  const links = v.platforms.filter((p) => p.url && /^https:\/\//.test(p.url)).map((p) => ({ platform: p.platform, url: p.url! }));
  const error = v.platforms.find((p) => p.error)?.error;
  const platforms = [...new Set(v.platforms.map((p) => p.platform))];
  const drafts = [...new Set(v.platforms.filter((p) => p.draft).map((p) => p.platform))];
  return {
    key,
    postId: v.id,
    status: v.status,
    ...(v.scheduledFor ? { at: v.scheduledFor } : {}),
    ...(links.length ? { links } : {}),
    ...(error ? { error } : {}),
    ...(platforms.length > 1 ? { platforms } : {}),
    ...(drafts.length ? { drafts } : {}),
  };
}

/** Whether a read of the post means it is live, so the draft is marked posted: published, unless every entry went to an inbox. */
export const postedNow = (v: View) => v.status === "published" && !(v.platforms.length && v.platforms.every((p) => p.draft));

export const TIKTOK_BUSY = "TikTok is busy for direct posts right now. Send it to your inbox instead, or retry in a few hours.";
// Zernio's TikTok errors (docs.zernio.com/platforms/tiktok/posts.mdx, read 20 Oct 2026)
const TIKTOK_LINES: [RegExp, string][] = [
  [/5 pending drafts/i, "TikTok holds 5 drafts at most. Finish or delete drafts in the TikTok app, then retry."],
  [/direct posting is at capacity/i, TIKTOK_BUSY],
  [/too many posts in the last 24 hours/i, "TikTok's daily limit for this account is reached. Try tomorrow, or post it in the TikTok app."],
];

/** A TikTok failure in plain words; anything else in Zernio's own. */
export const tiktokReason = (error: string) => TIKTOK_LINES.find(([re]) => re.test(error))?.[1] ?? error;

// ---- the schedule steps (publish-schedule) ----

/** Draws the items one at a time, counting each, and stops with an AbortError once the signal aborts. */
export async function renderEach<T>(items: T[], draw: (t: T) => Promise<Blob>, onSlide: (done: number, total: number) => void, signal: AbortSignal): Promise<Blob[]> {
  signal.throwIfAborted();
  const out: Blob[] = [];
  for (const t of items) {
    const blob = await draw(t);
    signal.throwIfAborted();
    out.push(blob);
    onSlide(out.length, items.length);
  }
  return out;
}

export const STEPS = ["where", "when", "caption"] as const;
export type Step = (typeof STEPS)[number];

/** What the steps hold so far. */
export interface StepForm {
  /** Step 1: the networks ticked, and the accounts ticked under them. */
  platforms: string[];
  accounts: { platform: string }[];
  /** Stand-in links with each file's own ending, as the panel builds them, so the server's media rules apply. */
  mediaUrls: string[];
  /** Files picked on this device. */
  files?: { name: string; type: string; size: number }[];
  thread?: string[];
  /** Step 2: Zernio's time (zernioTime), null for now, "" while Pick a time is not filled in. */
  scheduledFor: string | null;
  /** Step 3: the shared caption, each network's own, TikTok's choice. */
  content: string;
  captions?: Partial<Record<string, string>>;
  tiktok?: TikTokInput | null;
}

const input = (f: StepForm, o: Partial<ScheduleInput> = {}): ScheduleInput => ({
  clientKey: "",
  content: f.content,
  captions: f.captions ?? {},
  mediaUrls: f.mediaUrls,
  scheduledFor: null,
  firstComment: "",
  tiktok: f.tiktok ?? null,
  youtube: null,
  ...(f.thread ? { thread: f.thread } : {}),
  ...o,
});

/** The one reason this step can't go on, or null. */
export function stepProblem(step: Step, f: StepForm, now = Date.now()): string | null {
  if (step === "where") {
    if (!f.platforms.length) return platformProblem(input(f), []);
    const missing = f.platforms.find((p) => !f.accounts.some((a) => a.platform === p));
    if (missing) return `Choose an account to post to ${platformName(missing)}.`;
    const file = f.files?.map((x) => fileProblem(x)).find(Boolean);
    if (file) return file;
    if ((f.files?.length ?? 0) > MAX_PICTURES) return `Pick up to ${MAX_PICTURES} pictures.`;
    // a stand-in caption and TikTok choice, so only the network and media rules speak here
    return platformProblem(input(f, { content: "-", captions: {}, tiktok: { privacyLevel: "-", allowComment: false, allowDuet: false, allowStitch: false } }), f.platforms);
  }
  if (step === "when") {
    if (f.scheduledFor === null) return null;
    const at = Date.parse(f.scheduledFor);
    if (!Number.isFinite(at)) return "Pick a day and time.";
    return at < now + NOW_LEAD_MS ? "That time has passed. Pick a later time, or post now." : null;
  }
  for (const p of f.platforms) {
    const caption = f.captions?.[p] ?? f.content;
    const over = caption.length - (CAPTION_MAX[p as keyof typeof CAPTION_MAX] ?? Infinity);
    if (over > 0) return `The ${platformName(p)} caption is ${over} characters too long.`;
  }
  if (f.thread) {
    if (hasComplianceErrors(scanCompliance(f.thread.join("\n\n")))) return "Fix the compliance error in the thread first.";
  } else {
    const flagged = f.platforms.find((p) => hasComplianceErrors(scanCompliance(f.captions?.[p] ?? f.content)));
    if (flagged) return `Fix the compliance error in the ${platformName(flagged)} caption first.`;
  }
  return platformProblem(input(f), f.platforms);
}

/** The step a link asks for, or the first step before it that can't go on; the first step for anything else. */
export function stepToOpen(asked: Step | null | undefined, f: StepForm, now = Date.now()): Step {
  const i = STEPS.indexOf(asked as Step);
  if (i < 0) return "where";
  return STEPS.slice(0, i).find((s) => stepProblem(s, f, now)) ?? STEPS[i];
}
