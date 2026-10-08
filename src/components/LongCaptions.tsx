// Captions for a long recording in the video editor: says how many parts it
// takes (each one use of captioning) before it starts, then shows the job's
// progress, which keeps going on other pages (src/lib/captionJob.ts).

import { useEffect, useState } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { useUsesLeft } from "@/lib/aiUsage";
import { captionJob, onCaptionJob, partsDone, startCaptions, type CaptionJob } from "@/lib/captionJob";
import { captionPlan, hoursMinutes } from "@/lib/longCaptions";
import type { Word } from "@/lib/videoEdit";
import type { VideoProject } from "@/lib/videoProjects";

/** The caption job as it changes. */
export function useCaptionJob(): CaptionJob | null {
  const [j, setJ] = useState<CaptionJob | null>(captionJob());
  useEffect(() => {
    const off = onCaptionJob(setJ);
    return () => { off(); };
  }, []);
  return j;
}

export default function LongCaptions({ userId, project, file, onWords }: {
  userId: string;
  project: VideoProject;
  file: Blob | null | undefined;
  onWords: (words: Word[]) => void;
}) {
  const j = useCaptionJob();
  const ours = j?.id === project.id;
  const running = j?.state === "running";
  const of = captionPlan(project.duration).length;
  const [done, setDone] = useState(0);
  useEffect(() => {
    let live = true;
    void partsDone(project).then((r) => live && setDone(r.filter(Boolean).length));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, j?.done, j?.state]);
  useEffect(() => {
    if (ours && j?.state === "done" && j.words) onWords(j.words);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ours, j?.state]);
  const left = useUsesLeft(running)("video-transcribe");
  const rest = of - done;

  if (ours && running) {
    return (
      <div className="flex items-center gap-2" aria-live="polite">
        <ThinkingOrb state="working" size={20} theme="light" aria-hidden />
        <div className="text-sm">
          <p className="font-medium">Captioning part {Math.min(j.of, j.done + 1)} of {j.of}...</p>
          <p className="text-[11px] text-muted-foreground">Keeps going if you leave this page.</p>
        </div>
      </div>
    );
  }
  const start = () => {
    if (file) void startCaptions(userId, project, file);
  };
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="h-11 sm:h-9" onClick={start} disabled={!file || running || left === 0}>
          {of === 1 ? "Caption it" : done ? `Caption the rest, ${rest} ${rest === 1 ? "part" : "parts"}` : `Caption it in ${of} parts`}
        </Button>
        {left !== null && <span className={`text-[11px] ${left ? "text-muted-foreground" : "font-medium text-destructive"}`}>{left ? `${left} captioning uses left today` : "None left today"}</span>}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {hoursMinutes(project.duration)}{of > 1 ? `, captioned in ${of} parts of about 10 minutes, each one use` : ""}{done ? `. ${done} of ${of} done` : ""}.
        {left !== null && left > 0 && left < rest ? ` Today's ${left} do ${left === 1 ? "one part" : `${left} parts`}; the rest tomorrow.` : ""}
      </p>
      {ours && j?.state === "failed" && <p className="text-xs text-destructive">Stopped after {j.done} of {j.of}: {j.error}</p>}
      {running && !ours && <p className="text-[11px] text-muted-foreground">{j?.name} is being captioned. This one can start when it finishes.</p>}
    </div>
  );
}

/** On the upload screen: which recording is being captioned, and how far it is. */
export function CaptionJobStatus({ onOpen }: { onOpen: (id: string) => void }) {
  const j = useCaptionJob();
  if (j?.state !== "running") return null;
  return (
    <button type="button" onClick={() => onOpen(j.id)} className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-border/60 px-3 py-2 text-left text-sm hover:border-primary/50" aria-live="polite">
      <ThinkingOrb state="working" size={20} theme="light" aria-hidden />
      <span className="min-w-0 flex-1 truncate">Captioning {j.name}, part {Math.min(j.of, j.done + 1)} of {j.of}</span>
    </button>
  );
}
