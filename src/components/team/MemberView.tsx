import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { History, Pencil, Send } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import LeaveTeam from "@/components/team/LeaveTeam";
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  PostChips,
  ReviewStateBadge,
  formatWhen,
} from "@/components/team/shared";
import { loadDrafts } from "@/lib/draftHistory";
import {
  deriveReviewState,
  fetchMySubmissions,
  fetchRoster,
  friendlyError,
  latestSubmissionByDraft,
  reviewHash,
  reviewTextForDraft,
  type MyTeam,
  type ReviewSubmission,
} from "@/lib/teamReview";

export default function MemberView({
  myTeam,
  userId,
  onLeft,
}: {
  myTeam: MyTeam;
  userId: string;
  onLeft: () => void;
}) {
  const navigate = useNavigate();
  const { team, me } = myTeam;
  const [subs, setSubs] = useState<ReviewSubmission[]>([]);
  const [leaders, setLeaders] = useState<string[]>([]);
  const [editedIds, setEditedIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const [mine, roster] = await Promise.all([
        fetchMySubmissions(userId, team.id),
        fetchRoster(team.id),
      ]);
      // "Edited since approval": compare each approved snapshot with the
      // draft as it is saved now.
      const drafts = new Map(loadDrafts(userId).map((d) => [d.id, d]));
      const edited = new Set<string>();
      await Promise.all(
        [...latestSubmissionByDraft(mine).values()]
          .filter((s) => s.status === "approved")
          .map(async (s) => {
            const draft = drafts.get(s.draft_id);
            if (!draft) return;
            const hash = await reviewHash(reviewTextForDraft(draft.draft));
            if (deriveReviewState(s, hash) === "edited_since_approval") edited.add(s.id);
          }),
      );
      setSubs(mine);
      setLeaders(roster.filter((m) => m.role === "leader").map((m) => m.display_name));
      setEditedIds(edited);
      setStatus("ready");
    } catch (e) {
      setError(friendlyError(e));
      setStatus("error");
    }
  }, [team.id, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const latestIds = useMemo(
    () => new Set([...latestSubmissionByDraft(subs).values()].map((s) => s.id)),
    [subs],
  );
  const localDraftIds = useMemo(
    () => new Set(loadDrafts(userId).map((d) => d.id)),
    [userId],
  );

  return (
    <div className="space-y-6">
      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Your team
          </p>
          <CardTitle className="break-words font-serif text-xl">{team.name}</CardTitle>
          <CardDescription>
            {leaders.length > 0 ? `Led by ${leaders.join(", ")}. ` : ""}
            You joined {formatWhen(me.joined_at)} as {me.display_name}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <Button size="sm" onClick={() => navigate("/drafts")} className="gap-1.5">
            <Send className="h-3.5 w-3.5" /> Submit a draft from My posts
          </Button>
          <LeaveTeam
            teamName={team.name}
            note="Your past submissions stay on record with your leader."
            onLeft={onLeft}
          />
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl">Your submissions</CardTitle>
          <CardDescription>
            Newest first. Post only what shows Approved. If you edit an approved post,
            submit it again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === "loading" ? (
            <LoadingBlock label="Loading your submissions…" />
          ) : status === "error" ? (
            <ErrorBlock message={error} onRetry={() => void load()} />
          ) : subs.length === 0 ? (
            <EmptyBlock icon={<History className="h-6 w-6" />}>
              <p>Nothing submitted yet. In My posts, choose Submit for review on a draft.</p>
              <Button size="sm" variant="outline" onClick={() => navigate("/drafts")}>
                Open My posts
              </Button>
            </EmptyBlock>
          ) : (
            <ul className="space-y-3">
              {subs.map((s) => {
                const isLatest = latestIds.has(s.id);
                return (
                  <li
                    key={s.id}
                    className={`rounded-xl border border-border/70 bg-card p-3 sm:p-4 ${
                      isLatest ? "" : "opacity-70"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ReviewStateBadge
                        state={editedIds.has(s.id) ? "edited_since_approval" : s.status}
                      />
                      <PostChips platform={s.platform} format={s.format} />
                      {!isLatest && (
                        <span className="text-[10px] text-muted-foreground">Earlier version</span>
                      )}
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {formatWhen(s.submitted_at)}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-3 whitespace-pre-line break-words text-sm leading-relaxed text-foreground">
                      {s.content}
                    </p>
                    {s.status !== "pending" && (
                      <div className="mt-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                        <p className="text-muted-foreground">
                          {s.status === "approved" ? "Approved" : "Changes requested"} by{" "}
                          {s.reviewer_name ?? "your leader"}, {formatWhen(s.reviewed_at)}
                        </p>
                        {s.review_comment && (
                          <p className="mt-1 whitespace-pre-line break-words text-foreground">
                            {s.review_comment}
                          </p>
                        )}
                      </div>
                    )}
                    {editedIds.has(s.id) && (
                      <p className="mt-2 text-[11px] text-amber-700">
                        You changed this post after it was approved. Submit it again before
                        posting.
                      </p>
                    )}
                    {isLatest && localDraftIds.has(s.draft_id) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate(`/generate?draft=${encodeURIComponent(s.draft_id)}`)}
                        className="mt-1 gap-1.5 px-2 text-xs"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit draft
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
