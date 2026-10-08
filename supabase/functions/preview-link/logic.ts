// Pure helpers for the preview-link edge function (tested in logic.test.ts).

/** 32 random bytes, base64url: what cs_create_preview_link hands out. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const MAX_BODY = 8 * 1024;

// The app in production, its Vercel previews, and local dev.
const ORIGINS = [
  /^https:\/\/consultant-content-studio\.vercel\.app$/,
  /^https:\/\/content-studio-[a-z0-9-]+\.vercel\.app$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/,
];

export function allowedOrigin(origin: string | null): string | null {
  return origin && ORIGINS.some((re) => re.test(origin)) ? origin : null;
}

/** The token is the last path segment: /preview-link/<token>. */
export function tokenFromPath(pathname: string): string | null {
  const last = pathname.split("/").filter(Boolean).pop() ?? "";
  let token = last;
  try {
    token = decodeURIComponent(last);
  } catch {
    return null;
  }
  return TOKEN_RE.test(token) ? token : null;
}

export interface CommentInput {
  name: string;
  body: string;
  /** The hidden "website" field was filled: a bot. */
  honeypot: boolean;
}

/** {name, body, website?} with string values, or null. Lengths are the database's job. */
export function parseCommentBody(raw: unknown): CommentInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || typeof r.body !== "string") return null;
  const website = r.website;
  return {
    name: r.name,
    body: r.body,
    honeypot: typeof website === "string" ? website.trim().length > 0 : website != null,
  };
}

export type CommentResult = { ok: true } | { ok: false; error?: string };

export function statusForComment(result: CommentResult): number {
  if (result.ok) return 200;
  switch (result.error) {
    case "not_found":
      return 404;
    case "rate_limited":
      return 429;
    default:
      return 400;
  }
}

/**
 * JSON with <, > and & written as \u escapes. It parses to exactly the same
 * strings, but no user text can ever read as HTML if something sniffs it.
 */
export function safeJson(body: unknown): string {
  return JSON.stringify(body)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
