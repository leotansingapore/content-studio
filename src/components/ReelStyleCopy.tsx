// "Copy a reel's style" in the vibe edit box: paste an Instagram or TikTok
// link and the reel's look and pace are measured and laid over this video
// (reelStyle.ts), with Undo, then offered as a skill.

import { useEffect, useRef, useState } from "react";
import { Link2, X } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import { parseReelUrl } from "@/lib/reelClone";
import { needsKeyLines, pickLinesFor } from "@/lib/stylePresets";
import { markReelStyleApplied, onReelStyleJob, reelStyleJob, startReelStyle, withReelStyle, type ReelFacts, type ReelStyleJob } from "@/lib/reelStyle";
import { heardWords, totalLength, type EditSettings, type Segment, type Word } from "@/lib/videoEdit";

const PHASE: Record<string, string> = { fetch: "Reading the reel...", measure: "Measuring its cuts and zooms...", read: "Reading its captions..." };

export default function ReelStyleCopy({ projectId, settings, words, segs, total, speed, apply, onSaveSkill, disabled }: {
  projectId: string;
  settings: EditSettings;
  words: Word[];
  /** The kept parts as played, the edit's length and speed. */
  segs: Segment[];
  total: number;
  speed: number;
  /** Merges into the latest settings, with Undo. */
  apply: (next: EditSettings) => void;
  /** Opens the skill form with this name. */
  onSaveSkill: (name: string) => void;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [job, setJob] = useState<ReelStyleJob | null>(() => reelStyleJob());
  const [done, setDone] = useState<{ author: string; facts: ReelFacts; note: string | null } | null>(null);
  const busy = !!job && job.projectId === projectId && !["done", "error"].includes(job.phase);
  const [picking, setPicking] = useState(false);
  const uses = useUsesLeft(busy || picking);
  const left = uses("reel-style");
  const latest = useRef({ settings, words, segs, total, speed, apply, picks: uses("motion-picks") });
  latest.current = { settings, words, segs, total, speed, apply, picks: uses("motion-picks") };

  useEffect(() => onReelStyleJob(setJob), []);
  // a finished read lands on the video it was started from, once, even after a trip to another page
  useEffect(() => {
    if (!job || job.projectId !== projectId || job.applied) return;
    if (job.phase === "error") {
      markReelStyleApplied();
      toast({ title: "Couldn't copy that reel's style", description: job.error, variant: "destructive" });
      return;
    }
    if (job.phase !== "done" || !job.read) return;
    markReelStyleApplied();
    const { settings: s, words: ws, segs: gs, total, speed, picks } = latest.current;
    const len = totalLength(gs) / 60;
    const myWpm = ws.length && len > 0.1 ? heardWords(ws, gs).length / len : null;
    const { next, facts } = withReelStyle(s, job.read, myWpm);
    latest.current.apply(next);
    // zooms or pop-ups copied: their key lines picked straight after, as the ready-made styles do
    if (needsKeyLines(s, next) && ws.length && picks !== 0) {
      setPicking(true);
      void pickLinesFor(next, ws, gs, total, speed)
        .then((lines) => lines && latest.current.apply({ ...latest.current.settings, motion: { lines } }))
        .catch(() => {})
        .finally(() => setPicking(false));
    }
    const r = job.read;
    setDone({
      author: r.source.author ? `@${r.source.author}` : "the reel",
      facts,
      note: !r.measure ? "TikTok doesn't share the video file, so only the pace was copied." : r.note ? `${r.note} The pace was copied.` : r.look?.captions === false ? "It shows no captions, so yours are off." : null,
    });
  }, [job, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = () => {
    const parsed = parseReelUrl(url);
    if (parsed.ok === false) return toast({ title: "Check the link", description: parsed.message, variant: "destructive" });
    setDone(null);
    void startReelStyle(projectId, url.trim());
  };

  const f = done?.facts;
  const figures = f
    ? [
        f.cutsPerMin !== null && `${f.cutsPerMin} cuts a minute`,
        f.zoomsPerMin !== null && `${f.zoomsPerMin} zooms a minute`,
        f.hookSeconds !== null && `hook text up ${f.hookSeconds}s`,
        f.wpm !== null && `${f.wpm} words a minute`,
        f.overlays > 0 && `${f.overlays} text pop-ups`,
      ].filter(Boolean).join(", ")
    : "";

  return (
    <div className="space-y-1.5">
      <p className="flex items-center text-xs font-semibold">Copy a reel&apos;s style
        <InfoTip label="About copying a reel's style">Its captions, cuts, zooms and pace, measured from the video.</InfoTip></p>
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); copy(); }}>
        <label className="sr-only" htmlFor="reel-style-link">Reel link</label>
        <input id="reel-style-link" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste an Instagram or TikTok link" inputMode="url" autoComplete="off"
          className="h-11 min-w-0 flex-1 basis-full rounded-md border border-input bg-background px-2 text-sm sm:h-9 sm:basis-0" disabled={busy} />
        <Button type="submit" size="sm" variant="outline" disabled={disabled || busy || !url.trim() || left === 0} className={`h-11 gap-1.5 sm:h-9 ${busy ? "disabled:opacity-100" : ""}`}>
          {busy ? <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> : <Link2 className="h-3.5 w-3.5" />}
          {busy ? "Copying..." : "Copy style"}
        </Button>
        {!busy && left !== null && <span className={`text-[11px] ${left ? "text-muted-foreground" : "font-medium text-destructive"}`}>{left ? `${left} left today` : "None left today"}</span>}
      </form>
      {picking && <p className="text-xs text-muted-foreground" aria-live="polite">Picking key lines...</p>}
      {busy && job && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {PHASE[job.phase]}{job.phase === "measure" ? ` ${Math.round(job.progress * 100)}%` : ""}
        </p>
      )}
      {done && (
        <div className="space-y-1.5 rounded-lg border border-primary/30 bg-background p-2.5 text-xs" role="status">
          <div className="flex items-start gap-2">
            <p className="mr-auto"><span className="font-semibold">Copied {done.author}&apos;s style.</span>{figures ? ` ${figures[0].toUpperCase()}${figures.slice(1)}.` : ""}</p>
            <button type="button" onClick={() => setDone(null)} aria-label="Close" className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground sm:h-8 sm:w-8">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {done.note && <p className="text-muted-foreground">{done.note}</p>}
          <Button size="sm" variant="outline" className="h-11 text-xs sm:h-8" onClick={() => onSaveSkill(`${done.author.replace(/^@/, "")} style`)}>Save as a skill</Button>
        </div>
      )}
    </div>
  );
}
