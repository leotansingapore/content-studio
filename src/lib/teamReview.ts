// Team review (v1): consultants submit drafts to their agency leader, who
// approves them or asks for changes, and every step lands in an append-only
// audit trail (MAS digital advertising guidelines, in force 25 Mar 2026).
//
// All writes go through the SECURITY DEFINER functions in
// supabase/hub/011_team_review.sql; reads go through RLS. Nothing here is
// cached in localStorage: the server is the record.
//
// The pure helpers come first and are covered by teamReview.test.ts.

import { supabase } from "@/lib/supabase";
import { toPlainText } from "@/lib/plainText";

export type TeamRole = "leader" | "member";
export type ReviewStatus = "pending" | "approved" | "changes_requested";
export type ReviewDecision = "approved" | "changes_requested";
export type ReviewEventKind =
  | "team_created"
  | "member_joined"
  | "member_left"
  | "submitted"
  | "approved"
  | "changes_requested";

export interface Team {
  id: string;
  name: string;
  owner_id: string | null;
  created_at: string;
}

export interface TeamMember {
  team_id: string;
  user_id: string;
  role: TeamRole;
  display_name: string;
  joined_at: string;
}

/** A compliance flag as captured at submission (see scanCompliance). */
export interface SubmittedFlag {
  ruleId?: string;
  severity?: string;
  message?: string;
  match?: string;
}

export interface ReviewSubmission {
  id: string;
  team_id: string;
  author_id: string;
  author_name: string;
  draft_id: string;
  platform: string;
  format: string;
  content: string;
  compliance_flags: SubmittedFlag[];
  content_hash: string;
  status: ReviewStatus;
  reviewer_id: string | null;
  reviewer_name: string | null;
  review_comment: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

export interface ReviewEvent {
  id: number;
  team_id: string;
  actor_id: string | null;
  actor_name: string;
  submission_id: string | null;
  kind: ReviewEventKind;
  detail: Record<string, unknown>;
  content_hash: string;
  created_at: string;
}

export interface MyTeam {
  team: Team;
  me: TeamMember;
  /** Only leaders can read it (RLS); null for members. */
  inviteCode: string | null;
}

// ---------------------------------------------------------------------------
// Hashing ("Edited since approval")
// ---------------------------------------------------------------------------

/**
 * Must match public.cs_review_normalize(): CRLF/CR become LF, then spaces,
 * tabs and newlines are trimmed from both ends. Nothing else changes.
 */
export function normalizeReviewText(text: string): string {
  return (text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/^[ \t\n]+|[ \t\n]+$/g, "");
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Same value the server stores in content_hash for this text. */
export function reviewHash(text: string): Promise<string> {
  return sha256Hex(normalizeReviewText(text));
}

/** What a leader reviews: the post as it will be pasted (markdown stripped). */
export function reviewTextForDraft(draftText: string): string {
  return normalizeReviewText(toPlainText(draftText));
}

// ---------------------------------------------------------------------------
// Draft status
// ---------------------------------------------------------------------------

export type DraftReviewState =
  | "none"
  | "pending"
  | "approved"
  | "edited_since_approval"
  | "changes_requested";

export const REVIEW_STATE_LABEL: Record<DraftReviewState, string> = {
  none: "Not submitted",
  pending: "Pending review",
  approved: "Approved",
  edited_since_approval: "Edited since approval",
  changes_requested: "Changes requested",
};

/** Newest submission per draft id. */
export function latestSubmissionByDraft(
  subs: ReviewSubmission[],
): Map<string, ReviewSubmission> {
  const latest = new Map<string, ReviewSubmission>();
  for (const s of subs) {
    const current = latest.get(s.draft_id);
    if (!current || Date.parse(s.submitted_at) > Date.parse(current.submitted_at)) {
      latest.set(s.draft_id, s);
    }
  }
  return latest;
}

/** `currentHash` is reviewHash(reviewTextForDraft(current draft text)). */
export function deriveReviewState(
  latest: ReviewSubmission | undefined,
  currentHash: string,
): DraftReviewState {
  if (!latest) return "none";
  if (latest.status === "pending") return "pending";
  if (latest.status === "changes_requested") return "changes_requested";
  return latest.content_hash === currentHash ? "approved" : "edited_since_approval";
}

export function canSubmitForReview(state: DraftReviewState): boolean {
  return state === "none" || state === "changes_requested" || state === "edited_since_approval";
}

// ---------------------------------------------------------------------------
// Invite codes
// ---------------------------------------------------------------------------

/** 32 symbols: no 0, O, 1 or I. Mirrors the check on cs_team_invites.code. */
export const INVITE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const INVITE_RE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/;

/** Uppercase, separators dropped - same as the server does before lookup. */
export function normalizeInviteCode(input: string): string {
  return (input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isWellFormedInviteCode(input: string): boolean {
  return INVITE_RE.test(normalizeInviteCode(input));
}

/** "ABCDE-FGHJK" for reading aloud or typing. */
export function formatInviteCode(code: string): string {
  const c = normalizeInviteCode(code);
  return c.length === 10 ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
}

export function inviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/team?code=${encodeURIComponent(normalizeInviteCode(code))}`;
}

// ---------------------------------------------------------------------------
// Audit trail CSV
// ---------------------------------------------------------------------------

export const EVENT_LABEL: Record<ReviewEventKind, string> = {
  team_created: "Team created",
  member_joined: "Member joined",
  member_left: "Member left",
  submitted: "Submitted for review",
  approved: "Approved",
  changes_requested: "Changes requested",
};

/**
 * One CSV cell, always quoted. Cells that a spreadsheet could run as a
 * formula (starting with = + - @, a tab or CR, or whitespace then = + - @)
 * are prefixed with an apostrophe.
 */
export function csvCell(value: unknown): string {
  let s =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
  if (/^[=+\-@\t\r]/.test(s) || /^\s+[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** RFC 4180 CSV with CRLF line endings. */
export function buildCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const SGT_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Singapore",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** "2026-09-15 10:04:05" in Singapore time (UTC+8, no DST). */
export function formatSgt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = Object.fromEntries(SGT_PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** "YYYY-MM-DD" for a moment, in Singapore time. */
export function sgtDateString(d: Date): string {
  return formatSgt(d.toISOString()).slice(0, 10);
}

/**
 * Inclusive Singapore-time day range -> [fromIso, toIso) instants, or null
 * when a date is malformed or the range runs backwards.
 */
export function sgtDayBounds(
  from: string,
  to: string,
): { fromIso: string; toIso: string } | null {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(from) || !re.test(to)) return null;
  const start = new Date(`${from}T00:00:00+08:00`);
  const lastDay = new Date(`${to}T00:00:00+08:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(lastDay.getTime())) return null;
  // Rejects dates like 2026-02-30 that Date would roll over.
  if (sgtDateString(start) !== from || sgtDateString(lastDay) !== to) return null;
  if (start.getTime() > lastDay.getTime()) return null;
  return {
    fromIso: start.toISOString(),
    toIso: new Date(lastDay.getTime() + 86_400_000).toISOString(),
  };
}

function detailText(detail: Record<string, unknown> | null | undefined, key: string): string {
  const v = detail?.[key];
  return v === null || v === undefined ? "" : typeof v === "string" ? v : String(v);
}

export const AUDIT_CSV_HEADERS = [
  "event_id",
  "time_sgt",
  "time_utc",
  "event",
  "by",
  "by_user_id",
  "consultant",
  "submission_id",
  "draft_id",
  "platform",
  "format",
  "comment",
  "content_hash",
];

export function auditCsv(events: ReviewEvent[]): string {
  return buildCsv(
    AUDIT_CSV_HEADERS,
    events.map((e) => {
      const d = new Date(e.created_at);
      return [
        String(e.id),
        formatSgt(e.created_at),
        Number.isNaN(d.getTime()) ? e.created_at : d.toISOString(),
        EVENT_LABEL[e.kind] ?? e.kind,
        e.actor_name,
        e.actor_id ?? "",
        detailText(e.detail, "author_name") || (e.kind === "submitted" ? e.actor_name : ""),
        e.submission_id ?? "",
        detailText(e.detail, "draft_id"),
        detailText(e.detail, "platform"),
        detailText(e.detail, "format"),
        detailText(e.detail, "comment"),
        e.content_hash,
      ];
    }),
  );
}

export function auditCsvFilename(teamName: string, from: string, to: string): string {
  const slug =
    teamName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "team";
  return `review-audit-${slug}-${from}-to-${to}.csv`;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Turns a Supabase/PostgREST error into a sentence a consultant can act on. */
export function friendlyError(err: unknown): string {
  const e = (err && typeof err === "object" ? err : {}) as { message?: unknown; code?: unknown };
  const code = typeof e.code === "string" ? e.code : "";
  const message =
    typeof e.message === "string" ? e.message : typeof err === "string" ? err : "";
  if (
    ["PGRST202", "PGRST205", "42P01", "42883"].includes(code) ||
    /could not find the (function|table)/i.test(message)
  ) {
    return "Team review isn't switched on yet. Try again later.";
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  if (/jwt expired|invalid jwt/i.test(message)) {
    return "Your session has expired. Sign in again.";
  }
  if (/^permission denied/i.test(message)) {
    return "You don't have access to do that.";
  }
  return message.trim() || "Something went wrong. Try again.";
}

export class TeamReviewError extends Error {
  reason?: string;
  constructor(message: string, reason?: string) {
    super(message);
    this.name = "TeamReviewError";
    this.reason = reason;
  }
}

function fail(error: unknown): never {
  throw new TeamReviewError(friendlyError(error));
}

// ---------------------------------------------------------------------------
// Reads (RLS decides what comes back)
// ---------------------------------------------------------------------------

const TEAM_COLS = "id,name,owner_id,created_at";
const MEMBER_COLS = "team_id,user_id,role,display_name,joined_at";
const SUBMISSION_COLS =
  "id,team_id,author_id,author_name,draft_id,platform,format,content,compliance_flags,content_hash,status,reviewer_id,reviewer_name,review_comment,submitted_at,reviewed_at";
const EVENT_COLS = "id,team_id,actor_id,actor_name,submission_id,kind,detail,content_hash,created_at";

export async function fetchMyMembership(userId: string): Promise<TeamMember | null> {
  const { data, error } = await supabase
    .from("cs_team_members")
    .select(MEMBER_COLS)
    .eq("user_id", userId)
    .limit(1);
  if (error) fail(error);
  return ((data ?? [])[0] as TeamMember | undefined) ?? null;
}

export async function fetchMyTeam(userId: string): Promise<MyTeam | null> {
  const me = await fetchMyMembership(userId);
  if (!me) return null;
  const [teamRes, inviteRes] = await Promise.all([
    supabase.from("cs_teams").select(TEAM_COLS).eq("id", me.team_id).limit(1),
    me.role === "leader"
      ? supabase.from("cs_team_invites").select("code").eq("team_id", me.team_id).limit(1)
      : Promise.resolve(null),
  ]);
  if (teamRes.error) fail(teamRes.error);
  if (inviteRes?.error) fail(inviteRes.error);
  const team = ((teamRes.data ?? [])[0] as Team | undefined) ?? null;
  if (!team) return null;
  const code = ((inviteRes?.data ?? [])[0] as { code: string } | undefined)?.code ?? null;
  return { team, me, inviteCode: code };
}

export async function fetchRoster(teamId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from("cs_team_members")
    .select(MEMBER_COLS)
    .eq("team_id", teamId)
    .order("joined_at", { ascending: true });
  if (error) fail(error);
  return (data ?? []) as TeamMember[];
}

export async function fetchMySubmissions(
  userId: string,
  teamId: string,
): Promise<ReviewSubmission[]> {
  const { data, error } = await supabase
    .from("cs_review_submissions")
    .select(SUBMISSION_COLS)
    .eq("author_id", userId)
    .eq("team_id", teamId)
    .order("submitted_at", { ascending: false })
    .limit(200);
  if (error) fail(error);
  return (data ?? []) as ReviewSubmission[];
}

export const QUEUE_LIMIT = 100;

/** Pending oldest first (a queue); decided ones newest first. */
export async function fetchTeamSubmissions(
  teamId: string,
  status: ReviewStatus,
): Promise<ReviewSubmission[]> {
  const { data, error } = await supabase
    .from("cs_review_submissions")
    .select(SUBMISSION_COLS)
    .eq("team_id", teamId)
    .eq("status", status)
    .order(status === "pending" ? "submitted_at" : "reviewed_at", {
      ascending: status === "pending",
    })
    .limit(QUEUE_LIMIT);
  if (error) fail(error);
  return (data ?? []) as ReviewSubmission[];
}

export const AUDIT_PAGE = 200;

export async function fetchEvents(
  teamId: string,
  fromIso: string,
  toIso: string,
  offset = 0,
  limit = AUDIT_PAGE,
): Promise<ReviewEvent[]> {
  const { data, error } = await supabase
    .from("cs_review_events")
    .select(EVENT_COLS)
    .eq("team_id", teamId)
    .gte("created_at", fromIso)
    .lt("created_at", toIso)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) fail(error);
  return (data ?? []) as ReviewEvent[];
}

/** Every event in the range, paged, oldest first - for the CSV export. */
export async function fetchAllEvents(
  teamId: string,
  fromIso: string,
  toIso: string,
): Promise<ReviewEvent[]> {
  const page = 1000;
  const all: ReviewEvent[] = [];
  for (let offset = 0; offset < 100_000; offset += page) {
    const rows = await fetchEvents(teamId, fromIso, toIso, offset, page);
    all.push(...rows);
    if (rows.length < page) break;
  }
  return all.sort((a, b) => a.id - b.id);
}

// ---------------------------------------------------------------------------
// Writes (RPCs)
// ---------------------------------------------------------------------------

export async function createTeam(name: string, displayName: string): Promise<string> {
  const { data, error } = await supabase.rpc("cs_create_team", {
    p_name: name,
    p_display_name: displayName || null,
  });
  if (error) fail(error);
  return data as string;
}

type JoinResult =
  | { ok: true; team_id: string; team_name: string }
  | { ok: false; error: string; message: string; attempts_left?: number };

export async function joinTeam(
  code: string,
  displayName: string,
): Promise<{ teamId: string; teamName: string }> {
  const { data, error } = await supabase.rpc("cs_join_team", {
    p_code: normalizeInviteCode(code),
    p_display_name: displayName || null,
  });
  if (error) fail(error);
  const result = data as JoinResult | null;
  if (!result) throw new TeamReviewError("Something went wrong. Try again.");
  if (result.ok === true) return { teamId: result.team_id, teamName: result.team_name };
  const failed = result as Extract<JoinResult, { ok: false }>;
  let message = failed.message || "That code didn't work.";
  const left = failed.attempts_left;
  if (failed.error === "invalid_code" && typeof left === "number" && left <= 3) {
    message += ` ${left} ${left === 1 ? "try" : "tries"} left this hour.`;
  }
  throw new TeamReviewError(message, failed.error);
}

export async function leaveTeam(): Promise<void> {
  const { error } = await supabase.rpc("cs_leave_team");
  if (error) fail(error);
}

export interface SubmitInput {
  draftId: string;
  platform: string;
  format: string;
  content: string;
  flags: SubmittedFlag[];
}

export async function submitForReview(input: SubmitInput): Promise<ReviewSubmission> {
  const { data, error } = await supabase.rpc("cs_submit_for_review", {
    p_draft_id: input.draftId,
    p_platform: input.platform,
    p_format: input.format,
    p_content: input.content,
    p_flags: input.flags.map((f) => ({
      ruleId: f.ruleId,
      severity: f.severity,
      message: f.message,
      match: f.match,
    })),
  });
  if (error) fail(error);
  return data as ReviewSubmission;
}

export async function reviewSubmission(
  id: string,
  decision: ReviewDecision,
  comment: string,
): Promise<ReviewSubmission> {
  const { data, error } = await supabase.rpc("cs_review_submission", {
    p_submission_id: id,
    p_decision: decision,
    p_comment: comment.trim() || null,
  });
  if (error) fail(error);
  return data as ReviewSubmission;
}
