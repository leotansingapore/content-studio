// Why each post did well or badly (docs/north-star/items/learn-post-grade.md), Leo only: the chip on a Top posts row
// and the panel it opens under that row (?grade=<draftId>). The grade is measured on each view (postGrade.ts); above
// or below the usual the panel asks writing-judge `grade` once per band for the reason, and the fix line comes from
// postGrade's table, so no LLM writes it.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import RemixButton from "@/components/remix/RemixButton";
import { labelForDimension, type TrackedPost } from "@/lib/analytics";
import { links } from "@/lib/links";
import { BAND_LABEL, REASON_NAME, directionOf, fixLine, gradeContext, reasonFor, tryVersionUrl, type Band, type Grade, type ReasonAnswer } from "@/lib/postGrade";
import { fromDraft } from "@/lib/remixSource";
import { WINNER_NOTE } from "@/lib/versionsJob";
import { cn } from "@/lib/utils";

export const GRADE_PANEL_ID = "grade-panel";

/** The chip's ratio: one decimal, as the spec rounds it (1.249 reads 1.2x though it is "About your usual"). */
export const ratioText = (r: number) => `${Math.round(r * 10) / 10}x`;

const TONE: Record<Band, string> = {
  "well-above": "border-primary bg-primary text-primary-foreground",
  above: "border-primary/50 bg-background text-primary",
  about: "border-transparent bg-muted text-muted-foreground",
  below: "border-warning/40 bg-warning/10 text-warning",
  "well-below": "border-destructive/50 bg-background text-destructive",
};

export function chipOf(g: Grade): { label: string; tone: string } {
  return g.kind === "graded" ? { label: `${ratioText(g.ratio)} your usual`, tone: TONE[g.band] } : { label: "Not graded", tone: "border-border/70 bg-background text-muted-foreground" };
}

/** The row's chip: toggles ?grade= for its post. */
export function GradeChip({ grade, open, title, onToggle }: { grade: Grade; open: boolean; title: string; onToggle: () => void }) {
  const c = chipOf(grade);
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={open ? GRADE_PANEL_ID : undefined}
      aria-label={`${c.label}: ${title}`}
      className={cn("inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition-colors hover:opacity-90 [@media(pointer:coarse)]:h-11", c.tone)}
    >
      {c.label}
    </button>
  );
}

// one writing-judge call per post and band, however many times the panel mounts (React's dev double effects)
const asking = new Map<string, Promise<ReasonAnswer>>();
function askReason(userId: string, post: TrackedPost, grade: Extract<Grade, { kind: "graded" }>, tracked: TrackedPost[]): Promise<ReasonAnswer> {
  const k = `${userId}|${post.id}|${grade.band}`;
  let p = asking.get(k);
  if (!p) {
    p = reasonFor(userId, post, grade, tracked).finally(() => asking.delete(k));
    asking.set(k, p);
  }
  return p;
}

const sgDay = (iso: string) => new Date(iso).toLocaleDateString("en-SG", { weekday: "long", timeZone: "Asia/Singapore" });

/**
 * The panel under a row. `titled`: the post is not in the Top posts list, so the panel opens at the top of the section
 * with the post's hook as its title. `scroll`: opened from the address on load, so it is brought into view.
 */
export default function GradePanel({
  userId,
  post,
  tracked,
  grade,
  titled = false,
  scroll = false,
  onClose,
}: {
  userId: string;
  post: TrackedPost;
  tracked: TrackedPost[];
  grade: Grade;
  titled?: boolean;
  scroll?: boolean;
  onClose: () => void;
}) {
  const graded = grade.kind === "graded" ? grade : null;
  const direction = graded ? directionOf(graded.band) : null;
  const [answer, setAnswer] = useState<ReasonAnswer | "reading" | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scroll) ref.current?.scrollIntoView({ block: "center" });
  }, [scroll]);

  // About the usual asks nothing; above or below asks once per band (a small change in the numbers keeps the band)
  useEffect(() => {
    setAnswer(null);
    if (!graded || !direction) return;
    let live = true;
    setAnswer("reading");
    void askReason(userId, post, graded, tracked).then((a) => live && setAnswer(a));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, post.id, graded?.band]);

  const network = labelForDimension("platform", post.platform);
  const best = tracked.filter((p) => p.platform === post.platform && p.id !== post.id).sort((a, b) => b.engagementTotal - a.engagementTotal)[0];
  const ctx = direction ? gradeContext(post, tracked) : null;
  const found = answer && answer !== "reading" && answer.state === "found" ? answer.reason : null;
  const fix = found && direction && ctx ? fixLine(found, direction, ctx) : null;
  const tryUrl = found && direction === "below" && graded && ctx ? tryVersionUrl(post, graded.ratio, found, ctx) : null;
  const openPost = links.generate({ draft: post.id });

  return (
    <div ref={ref} id={GRADE_PANEL_ID} role="region" aria-label="Grade" className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
      {titled && <p className="truncate text-sm font-medium text-foreground">{post.hook || post.draft.slice(0, 60)}</p>}
      <div className="flex items-start justify-between gap-2">
        <h3 className="pt-2 text-sm font-semibold text-foreground">{graded ? BAND_LABEL[graded.band] : "Not graded"}</h3>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close the grade" className="h-9 w-9 shrink-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {graded && (
        <div className="space-y-0.5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">
            {ratioText(graded.ratio)} your usual engagement on {network}
          </p>
          <p>
            {graded.engagements.toLocaleString()} engagements; your usual is {Math.round(graded.usual).toLocaleString()} (median of {graded.of} {network} posts)
          </p>
          {graded.impressions !== null && <p>{ratioText(graded.impressions)} your usual impressions</p>}
        </div>
      )}
      {grade.kind === "young" && <p className="text-sm text-muted-foreground">Still collecting numbers. Check back on {sgDay(grade.ready)}.</p>}
      {grade.kind === "few" && (
        <p className="text-sm text-muted-foreground">
          Not enough {network} posts with numbers to compare yet: 5 needed, you have {grade.have}.
        </p>
      )}

      {direction && (
        <div className="text-sm" aria-live="polite">
          {answer === "reading" && <p className="text-muted-foreground">Reading why...</p>}
          {found && (
            <>
              <p className="flex items-center gap-1 font-medium text-foreground">
                Why: {REASON_NAME[found]}
                <InfoTip label="About why">Jev's best guess from the post and your other posts.</InfoTip>
              </p>
              {fix && <p className="text-muted-foreground">{fix}</p>}
            </>
          )}
          {answer && answer !== "reading" && answer.state === "none" && (
            <p className="text-muted-foreground">
              No single reason stands out. Compare it with{" "}
              {best ? (
                <Link to={links.generate({ draft: best.id })} className="font-medium text-primary underline-offset-2 hover:underline">
                  your best {network} post
                </Link>
              ) : (
                `your best ${network} post`
              )}
              .
            </p>
          )}
          {answer && answer !== "reading" && answer.state === "capped" && <p className="text-muted-foreground">Reasons are used up for today. They come back at 8am.</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {direction === "above" && (
          <RemixButton source={fromDraft(post)} label={post.hook || "this post"} note={WINNER_NOTE}>
            {null}
          </RemixButton>
        )}
        {tryUrl && (
          <Button asChild size="sm" className="[@media(pointer:coarse)]:h-11">
            <Link to={tryUrl}>Try a new version</Link>
          </Button>
        )}
        {grade.kind === "few" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="[@media(pointer:coarse)]:h-11"
            onClick={() => document.getElementById("add-your-numbers")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            Add numbers
          </Button>
        )}
        <Button asChild variant="ghost" size="sm" className="[@media(pointer:coarse)]:h-11">
          <Link to={openPost}>Open the post</Link>
        </Button>
      </div>
    </div>
  );
}
