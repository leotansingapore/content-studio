import { Link } from "react-router-dom";
import { Loader2, Send, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ReviewStateBadge, formatWhen } from "@/components/team/shared";
import type { DraftReviews } from "@/hooks/useDraftReviews";
import type { DraftEntry } from "@/lib/draftHistory";
import { canSubmitForReview } from "@/lib/teamReview";

// Review status + "Submit for review" on a My posts card (team members only).
export default function DraftReviewControl({
  draft,
  reviews,
}: {
  draft: DraftEntry;
  reviews: DraftReviews;
}) {
  const info = reviews.infoFor(draft);
  if (!info) {
    return <div className="mb-3 h-9 animate-pulse rounded-lg bg-muted/40" aria-hidden />;
  }
  const { state, latest } = info;
  const busy = reviews.submittingId === draft.id;
  const error = reviews.errors[draft.id];

  return (
    <div className="mb-3 space-y-1.5 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/team"
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          title="Open Team review"
        >
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          <ReviewStateBadge state={state} />
        </Link>
        {latest && (
          <span className="text-[10px] text-muted-foreground">
            {state === "pending"
              ? `Sent ${formatWhen(latest.submitted_at)}`
              : formatWhen(latest.reviewed_at)}
          </span>
        )}
        {canSubmitForReview(state) && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void reviews.submit(draft)}
            disabled={busy || reviews.submittingId !== null}
            className="ml-auto h-8 gap-1.5 px-2.5 text-xs"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {state === "none" ? "Submit for review" : "Resubmit"}
          </Button>
        )}
      </div>
      {latest?.review_comment && state !== "pending" && (
        <p className="whitespace-pre-line break-words text-[11px] leading-snug text-foreground">
          <span className="font-semibold">{latest.reviewer_name ?? "Leader"}:</span>{" "}
          {latest.review_comment}
        </p>
      )}
      {state === "edited_since_approval" && (
        <p className="text-[11px] leading-snug text-amber-700">
          You changed this post after it was approved. Resubmit before posting.
        </p>
      )}
      {error && (
        <p role="alert" className="break-words text-[11px] leading-snug text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
