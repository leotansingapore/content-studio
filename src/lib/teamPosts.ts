// Team posts Leo reviews in the calendar before they go to his Telegram group.
// Data contract: ~/.local/share/team-posts/CONTRACT.md. Two synced keys, one writer each:
//   content-studio-teamposts-<uid>    written by the jobs; the app only reads it
//   content-studio-teamreviews-<uid>  written by the app (approvals, comments, skips); the jobs only read it
// Bare user id, not scoped(): team posts belong to the account whatever profile is open.

export interface TeamComment {
  id: string;
  at: string; // ISO
  text: string;
  rev: number;
}

export interface TeamPost {
  id: string;
  title: string;
  product: "gac" | "at";
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
}

export interface TeamReview {
  approvedRev: number | null;
  comments: TeamComment[];
  skip?: { on: boolean; at: string }; // the calendar's Skip / Undo
}
export type TeamReviews = Record<string, TeamReview>;

export type TeamStatus = "posted" | "skipped" | "approved" | "revising" | "waiting";
export type ThreadComment = TeamComment & { source: "calendar" | "telegram" };

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
