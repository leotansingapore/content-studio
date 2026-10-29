// Team posts Leo reviews in the calendar before they go to his Telegram group.
// Data contract: ~/.local/share/team-posts/CONTRACT.md. Two synced keys, one writer each:
//   content-studio-teamposts-<uid>    written by the jobs; the app only reads it
//   content-studio-teamreviews-<uid>  written by the app (approvals, comments, skips); the jobs only read it
// Bare user id, not scoped(): team posts belong to the account whatever profile is open; each shows on its home brand.

import { DEFAULT_PROFILE_ID, activeProfileId, profileForBusiness } from "@/lib/profiles";

export interface TeamComment {
  id: string;
  at: string; // ISO
  text: string;
  rev: number;
}

export type TeamChannel = "fastrack" | "advisoros" | "memos" | "industry" | "subscribers";
export const TEAM_GROUP: Record<TeamChannel, string> = {
  fastrack: "FINTERNSHIP FASTRACK",
  advisoros: "AdvisorOS",
  memos: "FINTERNSHIP FASTRACK memos",
  industry: "FINTERNSHIP FASTRACK industry",
  subscribers: "FINTERNSHIP FASTRACK subscribers",
};
/** The group's name, as the job's CHANNELS spell it. */
export const groupOf = (post: Pick<TeamPost, "channel">) => TEAM_GROUP[post.channel ?? "fastrack"] ?? TEAM_GROUP.fastrack;
/** The group as a calendar chip names it: "FINTERNSHIP FASTRACK" wraps a letter at a time in a week column. */
export const shortGroupOf = (post: Pick<TeamPost, "channel">) =>
  post.channel === "advisoros" ? "AdvisorOS" : post.channel === "memos" ? "Memos" : post.channel === "industry" ? "Industry" : post.channel === "subscribers" ? "Subscribers" : "FASTRACK";

export interface TeamPost {
  id: string;
  title: string;
  product: "gac" | "at";
  channel?: TeamChannel; // the Telegram group it goes to; missing = FINTERNSHIP FASTRACK (posts from before 23 Oct 2026)
  day: string; // YYYY-MM-DD, Singapore date it goes out
  time: string; // Singapore time, "10:00"
  image: string;
  message: string;
  rev: number;
  revisedAt: string | null;
  postedAt: string | null;
  postLink: string | null;
  skipped: boolean;
  skippedAt?: string | null; // ISO; older Telegram skips have none and count as the oldest time
  telegram: { approvedRev: number | null; comments: TeamComment[] };
  handled: string[];
  /** Goes out on its day unless skipped (memo posts, Leo 2026-10-28); the job keeps it approved at every revision. */
  auto?: boolean;
  /** For advisers to send their clients, when the memo is client-facing: a picture and a message template. */
  client?: { image: string; message: string };
}

export interface TeamReview {
  approvedRev: number | null;
  comments: TeamComment[];
  skip?: { on: boolean; at: string }; // the calendar's Skip / Undo
}
export type TeamReviews = Record<string, TeamReview>;

export type TeamStatus = "posted" | "skipped" | "approved" | "revising" | "waiting";
export type ThreadComment = TeamComment & { source: "calendar" | "telegram" };

export const TEAM_BRAND = "Leo's team";
/** The brand a team post sits on (Leo 2026-10-28): AdvisorOS on ActivityTracker, FASTRACK and its memo and industry posts on Leo's team
 *  (no post = FASTRACK). A brand that does not exist yet falls back to ActivityTracker, then the default brand. */
export const teamHome = (uid: string, post?: Pick<TeamPost, "channel">) => {
  const at = profileForBusiness(uid, "ActivityTracker") ?? DEFAULT_PROFILE_ID;
  return post?.channel === "advisoros" ? at : (profileForBusiness(uid, TEAM_BRAND) ?? at);
};
/** The team posts on the open brand (docs/brand-isolation.md). */
export const teamPostsHere = (uid: string, posts: TeamPost[]) => posts.filter((p) => teamHome(uid, p) === activeProfileId(uid));

export const teamPostsKey = (uid: string) => `content-studio-teamposts-${uid}`;
export const teamReviewsKey = (uid: string) => `content-studio-teamreviews-${uid}`;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readJson(key: string): unknown {
  try {
    return JSON.parse(storage()?.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

const comments = (v: unknown): TeamComment[] =>
  Array.isArray(v) ? v.filter((c) => c && typeof c.id === "string" && typeof c.text === "string") : [];

/** The jobs' posts, malformed rows dropped. [] when the account has none. */
export function readTeamPosts(uid: string | null | undefined): TeamPost[] {
  if (!uid) return [];
  const doc = readJson(teamPostsKey(uid)) as { posts?: unknown } | null;
  if (!doc || !Array.isArray(doc.posts)) return [];
  return doc.posts
    .filter((p) => p && typeof p.id === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.day) && typeof p.rev === "number")
    .map((p) => ({
      ...p,
      title: String(p.title ?? p.id),
      message: String(p.message ?? ""),
      time: String(p.time ?? "10:00"),
      telegram: { approvedRev: p.telegram?.approvedRev ?? null, comments: comments(p.telegram?.comments) },
      handled: Array.isArray(p.handled) ? p.handled : [],
      client: p.client && typeof p.client.image === "string" && typeof p.client.message === "string" ? p.client : undefined,
    }));
}

export function readTeamReviews(uid: string | null | undefined): TeamReviews {
  if (!uid) return {};
  const doc = readJson(teamReviewsKey(uid));
  return doc && typeof doc === "object" && !Array.isArray(doc) ? (doc as TeamReviews) : {};
}

/** Who skipped it, or null: the later of the Telegram skip (the job's) and the calendar's Skip/Undo wins.
 *  ISO strings compared as text, a tie going to the calendar, exactly as the job's is_skipped does. */
export function skippedBy(post: TeamPost, review?: TeamReview): "calendar" | "telegram" | null {
  const app = review?.skip;
  if (app && (app.at ?? "") >= (post.skippedAt ?? "")) return app.on ? "calendar" : null;
  return post.skipped ? "telegram" : null;
}

/** The contract's 5-step rule, in order. */
export function statusOf(post: TeamPost, review?: TeamReview): TeamStatus {
  if (post.postedAt) return "posted";
  if (skippedBy(post, review)) return "skipped";
  if (Math.max(review?.approvedRev ?? 0, post.telegram.approvedRev ?? 0) === post.rev) return "approved";
  const handled = new Set(post.handled);
  if ([...comments(review?.comments), ...post.telegram.comments].some((c) => !handled.has(c.id))) return "revising";
  return "waiting";
}

const when = (p: TeamPost) => `${p.day}T${p.time}`;

/** The review queue's order: posts still to go out, in the order they go out. */
export function reviewOrder(posts: TeamPost[]): TeamPost[] {
  return posts
    .filter((p) => !p.postedAt)
    .sort((a, b) => (when(a) < when(b) ? -1 : when(a) > when(b) ? 1 : a.id.localeCompare(b.id, undefined, { numeric: true })));
}

/** The next post waiting for Leo after this one in the queue, wrapping round; null when none is left. */
export function nextToReview(order: TeamPost[], reviews: TeamReviews, afterId: string): TeamPost | null {
  const i = order.findIndex((p) => p.id === afterId);
  const rest = [...order.slice(i + 1), ...order.slice(0, Math.max(i, 0))];
  return rest.find((p) => p.id !== afterId && statusOf(p, reviews[p.id]) === "waiting") ?? null;
}

/** Calendar and Telegram comments in one thread, oldest first. */
export function threadOf(post: TeamPost, review?: TeamReview): ThreadComment[] {
  return [
    ...comments(review?.comments).map((c) => ({ ...c, source: "calendar" as const })),
    ...post.telegram.comments.map((c) => ({ ...c, source: "telegram" as const })),
  ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

function update(uid: string, postId: string, change: (r: TeamReview) => TeamReview): TeamReviews {
  const all = readTeamReviews(uid);
  const next = { ...all, [postId]: change({ approvedRev: null, comments: [], ...all[postId] }) };
  storage()?.setItem(teamReviewsKey(uid), JSON.stringify(next));
  return next;
}

export const approve = (uid: string, post: TeamPost) => update(uid, post.id, (r) => ({ ...r, approvedRev: post.rev }));

export const unapprove = (uid: string, post: TeamPost) => update(uid, post.id, (r) => ({ ...r, approvedRev: null }));

export const skip = (uid: string, post: TeamPost) =>
  update(uid, post.id, (r) => ({ ...r, skip: { on: true, at: new Date().toISOString() } }));

/** Undo: a later "not skipped" from the calendar, which also reverses a Telegram skip. */
export const unskip = (uid: string, post: TeamPost) =>
  update(uid, post.id, (r) => ({ ...r, skip: { on: false, at: new Date().toISOString() } }));

export function newCommentId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return "c-" + Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/** Adds a comment about the post's current version; blank text is ignored. */
export function addComment(uid: string, post: TeamPost, text: string): TeamReviews {
  const body = text.trim();
  if (!body) return readTeamReviews(uid);
  const comment: TeamComment = { id: newCommentId(), at: new Date().toISOString(), text: body, rev: post.rev };
  return update(uid, post.id, (r) => ({ ...r, comments: [...comments(r.comments), comment] }));
}
