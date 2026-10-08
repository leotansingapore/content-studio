// Compliance preview links: an adviser shares a read-only snapshot of a post
// with someone who has no account (a manager or compliance officer), who
// comments on /review/<token>. The adviser reads and answers those comments
// on My posts. Server side: supabase/hub/012_preview_links.sql (RLS reads,
// RPC writes) and the preview-link edge function (the public page).
//
// The raw token is shown once by the server and only its hash is stored
// there. The app keeps a copy under content-studio-preview-tokens-<scoped>
// so "Copy link" works on every device; turning a link off is a server-side
// revoke and never depends on that key.

import { SUPABASE_URL, supabase } from "@/lib/supabase";
import { scoped } from "@/lib/profiles";
import { friendlyError } from "@/lib/teamReview";

export const PREVIEW_DAYS = 14;
export const PREVIEW_ENDPOINT = `${SUPABASE_URL}/functions/v1/preview-link`;
export const PREVIEW_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const TOKENS_PREFIX = "content-studio-preview-tokens-";

export interface PreviewLink {
  id: string;
  draft_id: string;
  sender_name: string;
  title: string;
  platform: string;
  format: string;
  content: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface PreviewComment {
  id: number;
  link_id: string;
  from_owner: boolean;
  author_name: string;
  body: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (previewLinks.test.ts)
// ---------------------------------------------------------------------------

export function previewUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/review/${token}`;
}

export function isLinkLive(link: Pick<PreviewLink, "revoked_at" | "expires_at">, now = Date.now()): boolean {
  return !link.revoked_at && Date.parse(link.expires_at) > now;
}

/** Links per draft id, newest first. */
export function linksByDraft(links: PreviewLink[]): Map<string, PreviewLink[]> {
  const out = new Map<string, PreviewLink[]>();
  for (const l of [...links].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))) {
    const list = out.get(l.draft_id) ?? [];
    list.push(l);
    out.set(l.draft_id, list);
  }
  return out;
}

/** Reviewer comments (not the adviser's own replies) on a set of links. */
export function reviewerCommentCount(comments: PreviewComment[], linkIds: Set<string>): number {
  return comments.filter((c) => !c.from_owner && linkIds.has(c.link_id)).length;
}

// ---------------------------------------------------------------------------
// Tokens kept for "Copy link" (synced, per profile)
// ---------------------------------------------------------------------------

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadTokens(userId: string): Record<string, string> {
  try {
    const parsed = JSON.parse(storage()?.getItem(TOKENS_PREFIX + scoped(userId)) ?? "{}");
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === "string" && PREVIEW_TOKEN_RE.test(e[1]),
      ),
    );
  } catch {
    return {};
  }
}

function saveToken(userId: string, linkId: string, token: string): void {
  try {
    storage()?.setItem(TOKENS_PREFIX + scoped(userId), JSON.stringify({ ...loadTokens(userId), [linkId]: token }));
  } catch {
    // storage full or blocked: the link still works, it just can't be copied again later
  }
}

// ---------------------------------------------------------------------------
// Adviser side (signed in)
// ---------------------------------------------------------------------------

export class PreviewLinkError extends Error {}

function fail(error: unknown): never {
  throw new PreviewLinkError(friendlyError(error).replace("Team review isn't", "Preview links aren't"));
}

const LINK_COLS = "id,draft_id,sender_name,title,platform,format,content,created_at,expires_at,revoked_at";

/** The adviser's newest 300 links and every comment on them (RLS: own links only). */
export async function fetchMyPreviewLinks(): Promise<{ links: PreviewLink[]; comments: PreviewComment[] }> {
  const { data: links, error } = await supabase
    .from("cs_preview_links")
    .select(LINK_COLS)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) fail(error);
  const ids = (links ?? []).map((l) => l.id as string);
  if (ids.length === 0) return { links: [], comments: [] };
  const { data: comments, error: cErr } = await supabase
    .from("cs_preview_comments")
    .select("id,link_id,from_owner,author_name,body,created_at")
    .in("link_id", ids)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (cErr) fail(cErr);
  return { links: (links ?? []) as PreviewLink[], comments: (comments ?? []) as PreviewComment[] };
}

export interface ShareInput {
  draftId: string;
  title: string;
  platform: string;
  format: string;
  content: string;
  senderName: string | null;
}

/** Makes a link and remembers its token. Returns the link id and the URL to send. */
export async function createPreviewLink(
  userId: string,
  input: ShareInput,
  origin: string,
): Promise<{ id: string; url: string; expiresAt: string }> {
  const { data, error } = await supabase.rpc("cs_create_preview_link", {
    p_draft_id: input.draftId,
    p_title: input.title,
    p_platform: input.platform,
    p_format: input.format,
    p_content: input.content,
    p_sender_name: input.senderName || null,
    p_days: PREVIEW_DAYS,
  });
  if (error) fail(error);
  const r = data as { id: string; token: string; expires_at: string };
  saveToken(userId, r.id, r.token);
  return { id: r.id, url: previewUrl(origin, r.token), expiresAt: r.expires_at };
}

export async function revokePreviewLink(linkId: string): Promise<void> {
  const { error } = await supabase.rpc("cs_revoke_preview_link", { p_link_id: linkId });
  if (error) fail(error);
}

export async function replyToPreview(linkId: string, body: string): Promise<PreviewComment> {
  const { data, error } = await supabase.rpc("cs_reply_preview_link", { p_link_id: linkId, p_body: body });
  if (error) fail(error);
  return data as PreviewComment;
}

// ---------------------------------------------------------------------------
// Reviewer side (public page, no sign-in)
// ---------------------------------------------------------------------------

export interface PublicComment {
  id: number;
  author_name: string;
  from_owner: boolean;
  body: string;
  created_at: string;
}

export interface PublicPreview {
  sender_name: string;
  title: string;
  platform: string;
  format: string;
  content: string;
  shared_at: string;
  expires_at: string;
  superseded: boolean;
  comments: PublicComment[];
}

/** ok with data, or not ok: gone (404: expired, turned off or unknown) or a message to show. */
export interface PublicResult<T> {
  ok: boolean;
  data?: T;
  gone?: boolean;
  message?: string;
}

const OFFLINE = "Couldn't reach Content Studio. Check your connection and try again.";

export async function fetchPublicPreview(token: string): Promise<PublicResult<PublicPreview>> {
  if (!PREVIEW_TOKEN_RE.test(token)) return { ok: false, gone: true, message: "" };
  try {
    const res = await fetch(`${PREVIEW_ENDPOINT}/${token}`);
    if (res.status === 404) return { ok: false, gone: true, message: "" };
    if (!res.ok) return { ok: false, gone: false, message: OFFLINE };
    const json = (await res.json()) as PublicPreview & { gone?: boolean };
    if (json.gone) return { ok: false, gone: true, message: "" };
    return { ok: true, data: json };
  } catch {
    return { ok: false, gone: false, message: OFFLINE };
  }
}

export async function postPublicComment(
  token: string,
  input: { name: string; body: string; website: string },
): Promise<PublicResult<PublicComment | null>> {
  try {
    const res = await fetch(`${PREVIEW_ENDPOINT}/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      comment?: PublicComment | null;
      error?: string;
      message?: string;
    };
    if (res.ok && json.ok) return { ok: true, data: json.comment ?? null };
    return {
      ok: false,
      gone: res.status === 404,
      message: json.message || (res.status === 413 ? "That comment is too long." : OFFLINE),
    };
  } catch {
    return { ok: false, gone: false, message: OFFLINE };
  }
}
