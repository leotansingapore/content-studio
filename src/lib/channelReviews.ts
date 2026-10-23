// Leo's Skip and comments on channel posts (the MoneyBees Telegram channel), from the calendar's post drawer.
// Leo 2026-10-23: "how do I give comments for this/skip this", then picked "skip + comment". One synced key, one writer:
//   content-studio-channelreviews-<uid>  written by the app; ~/.local/bin/moneybees-telegram-roundup only reads it
//   (calendar_reviews, every 10 min): a skip holds the article so the 8pm run sends the next one, a comment is given
//   to the writer and the post is made again (a new preview DM when it was already previewed).
// Bare user id, not scoped(): the job reads Leo's account, whatever brand is open.
import { newCommentId } from "@/lib/teamPosts";
import type { FeedStatus } from "@/lib/channelFeeds";

export interface ChannelComment {
  id: string;
  at: string; // ISO
  text: string;
}
export interface ChannelReview {
  skip?: { on: boolean; at: string };
  comments: ChannelComment[];
}
export type ChannelReviews = Record<string, ChannelReview>;

export const channelReviewsKey = (uid: string) => `content-studio-channelreviews-${uid}`;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const comments = (v: unknown): ChannelComment[] =>
  Array.isArray(v) ? v.filter((c) => c && typeof c.id === "string" && typeof c.text === "string") : [];

export function readChannelReviews(uid: string | null | undefined): ChannelReviews {
  if (!uid) return {};
  try {
    const doc = JSON.parse(storage()?.getItem(channelReviewsKey(uid)) ?? "null");
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return {};
    return Object.fromEntries(Object.entries(doc as Record<string, ChannelReview>).map(([id, r]) => [id, { ...r, comments: comments(r?.comments) }]));
  } catch {
    return {};
  }
}

function update(uid: string, id: string, change: (r: ChannelReview) => ChannelReview): ChannelReviews {
  const all = readChannelReviews(uid);
  const next = { ...all, [id]: change({ comments: [], ...all[id] }) };
  storage()?.setItem(channelReviewsKey(uid), JSON.stringify(next));
  return next;
}

/** Skip (on) or Undo (off); the job reads the latest. */
export const skipChannelPost = (uid: string, id: string, on: boolean) =>
  update(uid, id, (r) => ({ ...r, skip: { on, at: new Date().toISOString() } }));

/** A change Leo asks for; blank text is ignored. */
export function commentChannelPost(uid: string, id: string, text: string): ChannelReviews {
  const body = text.trim();
  if (!body) return readChannelReviews(uid);
  return update(uid, id, (r) => ({ ...r, comments: [...r.comments, { id: newCommentId(), at: new Date().toISOString(), text: body }] }));
}

/** The status to show: a Skip or Undo here counts at once, before the job's next feed says so. */
export function shownStatus(status: FeedStatus, review?: ChannelReview): FeedStatus {
  if (status === "posted" || !review?.skip) return status;
  if (review.skip.on) return "skipped";
  return status === "skipped" ? "planned" : status;
}
