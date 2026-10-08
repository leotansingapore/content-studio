// Pure helpers for the link-in-bio edge function (tested in logic.test.ts).

export const APP_ORIGIN = "https://consultant-content-studio.vercel.app";
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** /link-in-bio/<slug> or /link-in-bio/<slug>/<linkId>; null for anything else. */
export function parsePath(pathname: string): { slug: string; linkId: string | null } | null {
  const parts = pathname.split("/").filter(Boolean);
  const at = parts.lastIndexOf("link-in-bio");
  const rest = at >= 0 ? parts.slice(at + 1) : parts;
  if (rest.length < 1 || rest.length > 2) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(rest[0]).toLowerCase();
  } catch {
    return null;
  }
  if (!SLUG_RE.test(slug)) return null;
  if (rest.length === 1) return { slug, linkId: null };
  return UUID_RE.test(rest[1]) ? { slug, linkId: rest[1].toLowerCase() } : null;
}

// Crawlers, link previewers and headless browsers: sent on, never counted.
// In-app browsers (Instagram, FBAN/FBAV, TikTok) are people and do count.
const BOT_RE =
  /bot\b|bot\/|crawl|spider|slurp|preview|facebookexternalhit|facebot|embedly|quora link|pinterest|vkshare|whatsapp|telegram|skypeuripreview|headless|lighthouse|curl\/|wget|python-requests|go-http-client|node-fetch|axios/i;

export function isBot(userAgent: string | null): boolean {
  return !userAgent || BOT_RE.test(userAgent);
}

/** Re-parses a stored URL; only http(s) leaves here, as the parser wrote it. */
export function safeRedirectUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** Where a dead or unknown link goes instead: the page itself in the app. */
export function pageUrl(slug: string): string {
  return `${APP_ORIGIN}/l/${encodeURIComponent(slug)}`;
}

export function safeJson(body: unknown): string {
  return JSON.stringify(body)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
