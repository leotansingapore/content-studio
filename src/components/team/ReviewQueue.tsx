import { useCallback, useEffect, useState } from "react";
import { Ban, CheckCircle2, ClipboardCheck, Loader2, MessageSquareWarning } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  EmptyBlock,
  ErrorBlock,
  FlagList,
  LoadingBlock,
  PostChips,
  ReviewStateBadge,
  formatWhen,
} from "@/components/team/shared";
import {
  QUEUE_LIMIT,
  fetchTeamSubmissions,
  friendlyError,
  reviewSubmission,
  type ReviewDecision,
  type ReviewStatus,
  type ReviewSubmission,
} from "@/lib/teamReview";

const TABS: { key: ReviewStatus; label: string; empty: string }[] = [
  { key: "pending", label: "Pending", empty: "Nothing waiting for review." },
  { key: "approved", label: "Approved", empty: "No approved posts yet." },
  {
    key: "changes_requested",
    label: "Changes requested",
    empty: "You haven't asked for changes on any post yet.",
  },
  { key: "rejected", label: "Rejected", empty: "No rejected posts." },
];

type Lists = Record<ReviewStatus, ReviewSubmission[]>;
const EMPTY: Lists = { pending: [], approved: [], changes_requested: [], rejected: [] };

export default function ReviewQueue({
  teamId,
  userId,
  onReviewed,
}: {
  teamId: string;
  userId: string;
  onReviewed: () => void;
}) {
  const [tab, setTab] = useState<ReviewStatus>("pending");
  const [lists, setLists] = useState<Lists>(EMPTY);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const [pending, approved, changes, rejected] = await Promise.all([
        fetchTeamSubmissions(teamId, "pending"),
        fetchTeamSubmissions(teamId, "approved"),
        fetchTeamSubmissions(teamId, "changes_requested"),
        fetchTeamSubmissions(teamId, "rejected"),
      ]);
      setLists({ pending, approved, changes_requested: changes, rejected });
      setStatus("ready");
    } catch (e) {
      setError(friendlyError(e));
      setStatus("error");
    }
  }, [teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDecided = (row: ReviewSubmission) => {
    setLists((prev) => ({
      pending: prev.pending.filter((s) => s.id !== row.id),
      approved: row.status === "approved" ? [row, ...prev.approved] : prev.approved,
      changes_requested:
        row.status === "changes_requested"
          ? [row, ...prev.changes_requested]
          : prev.changes_requested,
      rejected: row.status === "rejected" ? [row, ...prev.rejected] : prev.rejected,
    }));
    onReviewed();
  };

  const current = lists[tab];
  const count = (key: ReviewStatus) => {
    const n = lists[key].length;
    return n >= QUEUE_LIMIT ? `${QUEUE_LIMIT}+` : String(n);
  };

  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader>
        <CardTitle className="font-serif text-xl">Review queue</CardTitle>
        <CardDescription>
          Each post is shown exactly as it was submitted, with the compliance flags found
          at the time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          role="tablist"
          aria-label="Submissions by status"
          className="flex w-full max-w-full flex-wrap gap-1 rounded-lg border border-border/60 bg-muted/30 p-1 sm:w-fit"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors sm:flex-none ${
                tab === t.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {status === "ready" && (
                <span className="ml-1.5 tabular-nums text-muted-foreground">{count(t.key)}</span>
              )}
            </button>
          ))}
        </div>

        {status === "loading" ? (
          <LoadingBlock label="Loading submissions…" />
        ) : status === "error" ? (
          <ErrorBlock message={error} onRetry={() => void load()} />
        ) : current.length === 0 ? (
          <EmptyBlock icon={<ClipboardCheck className="h-6 w-6" />}>
            <p>{TABS.find((t) => t.key === tab)?.empty}</p>
          </EmptyBlock>
        ) : (
          <ul className="space-y-3">
            {current.map((s) => (
              <li key={s.id}>
                <SubmissionCard sub={s} userId={userId} onDecided={handleDecided} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SubmissionCard({
  sub,
  userId,
  onDecided,
}: {
  sub: ReviewSubmission;
  userId: string;
  onDecided: (row: ReviewSubmission) => void;
}) {
  const { toast } = useToast();
  // Which decision the comment box is for: changes need a comment, a rejection a reason.
  const [asking, setAsking] = useState<"changes_requested" | "rejected" | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<ReviewDecision | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);

  const own = sub.author_id === userId;
  const long = sub.content.length > 500 || sub.content.split("\n").length > 10;

  const decide = async (decision: ReviewDecision) => {
    if (decision !== "approved" && !comment.trim()) {
      setError(decision === "rejected" ? "Add a reason for rejecting this post." : "Add a comment saying what needs to change.");
      return;
    }
    setBusy(decision);
    setError("");
    try {
      const row = await reviewSubmission(sub.id, decision, decision === "approved" ? "" : comment);
      toast({
        title: decision === "approved" ? "Post approved" : decision === "rejected" ? "Post rejected" : "Changes requested",
        description: `${sub.author_name} can see your decision now.`,
      });
      onDecided(row);
    } catch (e) {
      setError(friendlyError(e));
      setBusy(null);
    }
  };

  const commentId = `review-comment-${sub.id}`;

  return (
    <article className="rounded-xl border border-border/70 bg-card p-3 shadow-card sm:p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 min-w-0 break-words text-sm font-semibold text-foreground">
          {sub.author_name}
        </span>
        <PostChips platform={sub.platform} format={sub.format} />
        <span className="ml-auto text-[11px] text-muted-foreground">
          Submitted {formatWhen(sub.submitted_at)}
        </span>
      </div>

      <div className="mt-3">
        <FlagList flags={sub.compliance_flags} />
      </div>

      <div
        className={`mt-3 whitespace-pre-wrap break-words rounded-lg border border-border/50 bg-muted/20 p-3 text-sm leading-relaxed text-foreground [overflow-wrap:anywhere] ${
          long && !expanded ? "max-h-56 overflow-hidden" : ""
        }`}
      >
        {sub.content}
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs font-medium text-primary hover:underline"
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : "Show the full post"}
        </button>
      )}

      {sub.status === "pending" ? (
        own ? (
          <p className="mt-3 text-xs text-muted-foreground">
            This is your own post. You can't approve your own posts.
          </p>
        ) : asking ? (
          <div className="mt-3 space-y-2">
            <Label htmlFor={commentId}>
              {asking === "rejected" ? "Why is this post rejected?" : "What needs to change?"}
            </Label>
            <Textarea
              id={commentId}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                asking === "rejected"
                  ? "e.g. We can't promise returns in any version of this post."
                  : "e.g. Remove 'guaranteed' and add the illustrated-returns disclaimer."
              }
              maxLength={2000}
              autoResize
              autoFocus
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => decide(asking)}
                disabled={busy !== null}
                className="gap-1.5"
              >
                {busy === asking ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : asking === "rejected" ? (
                  <Ban className="h-3.5 w-3.5" />
                ) : (
                  <MessageSquareWarning className="h-3.5 w-3.5" />
                )}
                {asking === "rejected" ? "Reject post" : "Send request"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAsking(null);
                  setError("");
                }}
                disabled={busy !== null}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button
              size="sm"
              onClick={() => decide("approved")}
              disabled={busy !== null}
              className="gap-1.5 bg-success text-white hover:bg-success/90"
            >
              {busy === "approved" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAsking("changes_requested")}
              disabled={busy !== null}
              className="gap-1.5"
            >
              <MessageSquareWarning className="h-3.5 w-3.5" /> Request changes
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAsking("rejected")}
              disabled={busy !== null}
              className="gap-1.5 text-destructive hover:text-destructive"
            >
              <Ban className="h-3.5 w-3.5" /> Reject
            </Button>
          </div>
        )
      ) : (
        <div className="mt-3 space-y-1 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <ReviewStateBadge state={sub.status} />
            <span className="text-muted-foreground">
              by {sub.reviewer_name ?? "a leader"}, {formatWhen(sub.reviewed_at)}
            </span>
          </div>
          {sub.review_comment && (
            <p className="whitespace-pre-line break-words text-foreground">{sub.review_comment}</p>
          )}
          <p className="font-mono text-[10px] text-muted-foreground" title={sub.content_hash}>
            Record hash {sub.content_hash.slice(0, 16)}…
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 break-words text-xs text-destructive">
          {error}
        </p>
      )}
    </article>
  );
}
