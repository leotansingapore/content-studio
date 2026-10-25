// Analytics > How the score did (edit-score part 4, Leo only): whether posts the score rated higher got more
// engagement (scoreVsResults in src/lib/postScore.ts), the check to read before any weight or band changes. Under 10
// scored posts with numbers it offers "Score my last 30 posts": one post-score use each (Jev, NO_PRICE), run as a job
// outside React so leaving the page keeps it going, saved on each draft as Write saves a score. Other sign-ins draw
// nothing and make no call.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PriceChip from "@/components/PriceChip";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useUsesLeft } from "@/lib/aiUsage";
import { reasonText } from "@/lib/prices";
import { scoped } from "@/lib/profiles";
import { EdgeError } from "@/lib/edgeFn";
import { withReal } from "@/lib/analytics";
import { draftStatus, draftsChanged, loadDrafts, saveDrafts, type DraftEntry } from "@/lib/draftHistory";
import { currentScore, scorePost, scoreVsResults, textKey, SCORE_CHECK_MIN, type ScoreFormat } from "@/lib/postScore";
import { MAX_TEXT, MIN_TEXT } from "../../../supabase/functions/post-score/logic.ts";
import { times } from "../../../supabase/functions/_shared/outlier.ts";

const MAX_BATCH = 30;
const timeOf = (d: DraftEntry) => Date.parse(d.postedAt ?? d.scheduledFor ?? "") || 0;
const formatOf = (d: DraftEntry): ScoreFormat => (d.format === "carousel" || d.format === "short-video" ? d.format : "text-post");

/**
 * The posted posts worth scoring for the check, newest first: numbers with impressions (the check skips the rest), no
 * current score, English (a translated version is never scored) and a length the score reads.
 */
export function toScore(drafts: DraftEntry[]): DraftEntry[] {
  return drafts
    .filter((d) => {
      const len = (d.draft ?? "").trim().length;
      return draftStatus(d) === "posted" && !d.lang && !currentScore(d) && (withReal(d).metrics?.impressions ?? 0) > 0 && len >= MIN_TEXT && len <= MAX_TEXT;
    })
    .sort((a, b) => timeOf(b) - timeOf(a))
    .slice(0, MAX_BATCH);
}

// ---- the scoring job (outside React) ----

export interface ScoreJob {
  running: boolean;
  /** Cancel was pressed: the call in flight finishes and is kept, then the job stops. */
  stopping: boolean;
  done: number;
  total: number;
  /** The line it stopped on: the cap's own words on a 429. */
  error: string | null;
}

const idle = (): ScoreJob => ({ running: false, stopping: false, done: 0, total: 0, error: null });
const jobs = new Map<string, ScoreJob>();
const listeners = new Set<() => void>();

export const scoreJob = (userId: string): ScoreJob => jobs.get(scoped(userId)) ?? idle();

export function onScoreJob(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const set = (scope: string, j: Partial<ScoreJob>) => {
  jobs.set(scope, { ...(jobs.get(scope) ?? idle()), ...j });
  listeners.forEach((l) => l());
};

export function cancelScoring(userId: string): void {
  const scope = scoped(userId);
  if (jobs.get(scope)?.running) set(scope, { stopping: true });
}

/** Scores up to 30 posts from toScore, one at a time, until done, cancelled, another brand opens or a call refuses. */
export async function scoreLast30(userId: string): Promise<void> {
  const scope = scoped(userId);
  if (jobs.get(scope)?.running) return;
  const todo = toScore(loadDrafts(userId));
  if (!todo.length) return;
  set(scope, { running: true, stopping: false, done: 0, total: todo.length, error: null });
  let done = 0;
  let error: string | null = null;
  for (const d of todo) {
    if (jobs.get(scope)?.stopping || scoped(userId) !== scope) break;
    try {
      const s = await scorePost(d.draft, d.platform, formatOf(d));
      // another brand opened while Jev read: this draft isn't in the list on screen
      if (scoped(userId) !== scope) break;
      const key = textKey(d.platform, d.draft);
      const list = loadDrafts(userId);
      // kept only while the text is the one scored, in place so My posts' order stays
      if (list.some((x) => x.id === d.id && textKey(x.platform, x.draft) === key))
        saveDrafts(userId, list.map((x) => (x.id === d.id ? { ...x, score: { v: s.score, down: s.down, key, at: new Date().toISOString() } } : x)));
    } catch (e) {
      // a post the score can't read (not English, too long once trimmed) is skipped; anything else stops the run
      if (!(e instanceof EdgeError && (e.status === 400 || e.status === 422))) {
        error = e instanceof Error ? e.message : "Couldn't score it right now. Try again in a minute.";
        break;
      }
    }
    set(scope, { done: ++done });
  }
  set(scope, { running: false, stopping: false, error });
  draftsChanged();
}

// ---- the card ----

export default function ScoreCheck({ userId, drafts }: { userId: string; drafts: DraftEntry[] }) {
  const leo = useLeoUser();
  const scope = scoped(userId);
  const [job, setJob] = useState(() => scoreJob(userId));
  // after the job saves, the card reads the stored list (the page's may be older)
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    if (!leo) return;
    setJob(scoreJob(userId));
    return onScoreJob(() => {
      setJob(scoreJob(userId));
      setTicks((t) => t + 1);
    });
  }, [leo, userId, scope]);

  const list = ticks ? loadDrafts(userId) : drafts;
  const result = scoreVsResults(list);
  const todo = result ? [] : toScore(list);
  const offer = !result && todo.length > 0 && !job.running;
  // uses left are read only for Leo, and only while the button shows
  const left = useUsesLeft(!leo || !offer)("post-score");

  if (!leo) return null;

  const blocked = reasonText({ left, leo: true });
  return (
    <Card id="score-check" className="scroll-mt-20 border-border/60 shadow-card">
      <CardHeader>
        <CardTitle className="font-serif text-lg">How the score did</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {result ? (
          <p className="text-sm text-foreground">
            {result.ratio === null
              ? `Of your ${result.n} posted posts with numbers, the lower-scored half got no engagement yet.`
              : `Of your ${result.n} posted posts with numbers, the higher-scored half got ${times(result.ratio)} the engagement of the lower half.`}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Needs {SCORE_CHECK_MIN} posted posts with numbers.</p>
        )}
        {job.running ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Scoring {Math.min(job.done + 1, job.total)} of {job.total}
            </p>
            <Button size="sm" variant="ghost" className="h-9 [@media(pointer:coarse)]:min-h-11" disabled={job.stopping} onClick={() => cancelScoring(userId)}>
              Cancel
            </Button>
          </div>
        ) : (
          offer && (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Button size="sm" className="h-9 [@media(pointer:coarse)]:min-h-11" disabled={left === 0} onClick={() => void scoreLast30(userId)}>
                  Score my last 30 posts
                </Button>
                <PriceChip feature="post-score" left={left} uses={todo.length} />
              </div>
              {blocked && <p className="text-xs text-muted-foreground">{blocked}</p>}
            </div>
          )
        )}
        {!job.running && job.error && <p className="text-sm text-muted-foreground">{job.error}</p>}
      </CardContent>
    </Card>
  );
}
