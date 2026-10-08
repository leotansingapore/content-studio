import { useCallback, useEffect, useState } from "react";
import { AtSign } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ReviewThread from "@/components/team/ReviewThread";
import { PostChips, formatWhen } from "@/components/team/shared";
import {
  fetchMyUnseenMentions,
  fetchRoster,
  fetchSubmissionsByIds,
  type MyTeam,
  type ReviewSubmission,
  type TeamMember,
} from "@/lib/teamReview";

// "Mentioned you": posts where a teammate @mentioned the viewer and they
// haven't opened the thread since. Hidden when there are none.
export default function MentionsCard({ myTeam, userId }: { myTeam: MyTeam; userId: string }) {
  const [subs, setSubs] = useState<ReviewSubmission[]>([]);
  const [roster, setRoster] = useState<TeamMember[]>([]);
  const [unseen, setUnseen] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const mentions = await fetchMyUnseenMentions(userId);
        const ids = [...new Set(mentions.map((m) => m.submission_id))];
        if (ids.length === 0) return;
        const [rows, people] = await Promise.all([fetchSubmissionsByIds(ids), fetchRoster(myTeam.team.id)]);
        if (!active) return;
        setSubs(rows);
        setRoster(people);
        setUnseen(new Set(ids));
      } catch {
        // Mentions are an extra; the rest of the page works without them.
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, myTeam.team.id]);

  const handleSeen = useCallback((id: string) => {
    setUnseen((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  if (subs.length === 0) return null;

  return (
    <Card className="border-primary/40 shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-serif text-xl">
          <AtSign className="h-5 w-5 text-primary" />
          Mentioned you
          {unseen.size > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
              {unseen.size}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {subs.map((s) => (
            <li key={s.id} className="rounded-xl border border-border/70 bg-card p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-sm font-semibold text-foreground">{s.author_name}</span>
                <PostChips platform={s.platform} format={s.format} />
                <span className="ml-auto text-[11px] text-muted-foreground">{formatWhen(s.submitted_at)}</span>
              </div>
              <p className="mt-2 line-clamp-4 whitespace-pre-line break-words text-sm leading-relaxed text-foreground">
                {s.content}
              </p>
              <ReviewThread
                sub={s}
                userId={userId}
                roster={roster}
                canComment
                defaultOpen={unseen.has(s.id)}
                onSeen={handleSeen}
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
