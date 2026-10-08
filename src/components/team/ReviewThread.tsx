import { Fragment, useEffect, useMemo, useState } from "react";
import { AtSign, Loader2, MessageSquare, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatWhen } from "@/components/team/shared";
import {
  addReviewComment,
  extractMentions,
  fetchThread,
  friendlyError,
  insertMention,
  markMentionsSeen,
  mentionCandidates,
  type ReviewComment,
  type ReviewMention,
  type ReviewSubmission,
  type TeamMember,
} from "@/lib/teamReview";

// "@Name" in a comment body, highlighted for the names of people mentioned in it.
function Body({ text, names }: { text: string; names: string[] }) {
  if (names.length === 0) return <>{text}</>;
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(@(?:${[...names].sort((a, b) => b.length - a.length).map(escape).join("|")}))`, "giu");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="font-semibold text-primary">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

// The comment thread under a team review submission.
export default function ReviewThread({
  sub,
  userId,
  roster,
  canComment,
  count,
  defaultOpen = false,
  onSeen,
}: {
  sub: ReviewSubmission;
  userId: string;
  /** The viewer's current team; empty for someone who left. */
  roster: TeamMember[];
  canComment: boolean;
  count?: number;
  defaultOpen?: boolean;
  onSeen?: (submissionId: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [mentions, setMentions] = useState<ReviewMention[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || status !== "idle") return;
    let active = true;
    setStatus("loading");
    fetchThread(sub.id)
      .then(async (t) => {
        if (!active) return;
        setComments(t.comments);
        setMentions(t.mentions);
        setStatus("ready");
        if (t.mentions.some((m) => m.user_id === userId && !m.seen_at)) {
          await markMentionsSeen(sub.id).catch(() => 0);
          onSeen?.(sub.id);
        }
      })
      .catch((e) => {
        if (!active) return;
        setError(friendlyError(e));
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [open, status, sub.id, userId, onSeen]);

  const mentioned = useMemo(() => new Set(mentions.map((m) => m.user_id)), [mentions]);
  const candidates = useMemo(() => mentionCandidates(roster, userId, sub, mentioned), [roster, userId, sub, mentioned]);
  const nameOf = useMemo(() => new Map(roster.map((m) => [m.user_id, m.display_name])), [roster]);

  const send = async () => {
    if (!draft.trim()) return;
    setSending(true);
    setError("");
    try {
      const ids = extractMentions(draft, candidates);
      const c = await addReviewComment(sub.id, draft, ids);
      setComments((prev) => [...prev, c]);
      setMentions((prev) => [
        ...prev,
        ...ids.map((user_id) => ({ comment_id: c.id, user_id, submission_id: sub.id, created_at: c.created_at, seen_at: null })),
      ]);
      setDraft("");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSending(false);
    }
  };

  const shown = status === "ready" ? comments.length : count;

  return (
    <div className="mt-3 border-t border-border/50 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex h-9 items-center gap-1.5 rounded-md px-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        {shown ? `Comments (${shown})` : canComment ? "Comment" : "Comments"}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {status === "loading" && (
            <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading comments…
            </p>
          )}
          {comments.length > 0 && (
            <ul className="space-y-2">
              {comments.map((c) => {
                const names = mentions
                  .filter((m) => m.comment_id === c.id)
                  .map((m) => nameOf.get(m.user_id))
                  .filter((n): n is string => Boolean(n));
                return (
                  <li key={c.id} className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-xs">
                    <p className="flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">{c.author_id === userId ? "You" : c.author_name}</span>
                      <span>{formatWhen(c.created_at)}</span>
                    </p>
                    <p className="mt-1 whitespace-pre-line break-words text-foreground [overflow-wrap:anywhere]">
                      <Body text={c.body} names={names} />
                    </p>
                  </li>
                );
              })}
            </ul>
          )}

          {canComment && status === "ready" && (
            <div className="space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a comment. Type @ and a name, or tap a name below."
                aria-label="Write a comment"
                maxLength={2000}
                autoResize
              />
              {candidates.length > 0 && (
                <div className="flex flex-wrap gap-1.5" aria-label="Mention someone">
                  {candidates.map((m) => (
                    <button
                      key={m.user_id}
                      type="button"
                      onClick={() => setDraft((d) => insertMention(d, m.display_name))}
                      className="inline-flex h-9 items-center gap-1 rounded-full border border-border/70 bg-background px-2.5 text-[11px] font-medium text-foreground hover:border-primary/50 sm:h-7"
                    >
                      <AtSign className="h-3 w-3 text-muted-foreground" />
                      {m.display_name}
                    </button>
                  ))}
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => void send()}
                disabled={sending || !draft.trim()}
                className="h-10 gap-1.5 sm:h-9"
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send comment
              </Button>
            </div>
          )}

          {status === "ready" && comments.length === 0 && !canComment && (
            <p className="text-xs text-muted-foreground">No comments.</p>
          )}
          {error && (
            <p role="alert" className="break-words text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
