// "Open with my strongest line" under Hook and frame: Jev rates the lines as
// first words heard, the best one plays first and the video runs from its
// start. The line can be heard again in its place (the default) or moved.

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import { coldCandidates, coldLength, pickColdOpen, sanitizeColdOpen } from "@/lib/coldOpen";
import { keepSegments, type EditSettings, type Segment, type Word } from "@/lib/videoEdit";

export default function ColdOpenControl({ settings, words, duration, segs, speed, apply, seek }: {
  settings: EditSettings;
  words: Word[];
  duration: number;
  /** The kept parts as played (with the cold open). */
  segs: Segment[];
  speed: number;
  /** Merges into the latest settings, with Undo. */
  apply: (p: Partial<EditSettings>) => void;
  /** Moves the playhead (seconds into the edit). */
  seek: (t: number) => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const left = useUsesLeft(busy)("cold-open");
  const co = sanitizeColdOpen(settings.coldOpen);
  const teaser = coldLength(segs, co) / speed;
  // to the start once the new order is in place (seeking before it lands on the old order)
  const jump = useRef(false);
  useEffect(() => {
    if (jump.current && co) {
      jump.current = false;
      seek(0);
    }
  }, [co?.s, co?.e, segs]); // eslint-disable-line react-hooks/exhaustive-deps
  const lineText = useMemo(() => (co ? words.filter((w) => w.s >= co.s && w.s < co.e).map((w) => w.w).join(" ") : ""), [co?.s, co?.e, words]); // eslint-disable-line react-hooks/exhaustive-deps

  const find = async () => {
    setBusy(true);
    try {
      // the lines of the edit as it is without a cold open
      const c = coldCandidates(words, keepSegments(words, duration, settings), speed);
      if (!c.candidates.length) return toast({ title: "No line is long enough to open with", description: "Caption the video first, or keep more of it.", variant: "destructive" });
      const { pick, why } = await pickColdOpen(c, settings.hook);
      if (why === "language") return toast({ title: "Cold open works on English videos for now" });
      if (why === "unrated") return toast({ title: "Couldn't rate your lines right now", description: "Try again in a minute.", variant: "destructive" });
      if (pick === null) return toast({ title: "Your video already opens strong", description: "No later line rated as a stronger start." });
      jump.current = true;
      apply({ coldOpen: { ...c.source[pick], repeat: true } });
    } catch (e) {
      toast({ title: "Couldn't pick the line", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto flex items-center text-sm font-medium">Cold open
          <InfoTip label="About cold open">Your strongest line plays first, then the video starts from the top.</InfoTip></span>
        {co && teaser > 0 ? (
          <Button size="sm" variant="ghost" className="h-11 text-xs text-muted-foreground sm:h-8" onClick={() => apply({ coldOpen: undefined })}>Remove</Button>
        ) : (
          <>
            {left !== null && <span className={`text-[11px] ${left ? "text-muted-foreground" : "font-medium text-destructive"}`}>{left ? `${left} left today` : "None left today"}</span>}
            <Button size="sm" variant="outline" onClick={() => void find()} disabled={busy || !words.length || left === 0}
              className={`h-11 gap-1.5 sm:h-9 ${busy ? "disabled:opacity-100" : ""}`}>
              {busy ? <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" />}
              {busy ? "Rating your lines..." : "Open with my strongest line"}
            </Button>
          </>
        )}
      </div>
      {co && teaser > 0 && (
        <>
          <button type="button" onClick={() => seek(0)} className="block w-full rounded-md bg-primary/5 px-2.5 py-2 text-left text-sm">
            <span className="font-medium">&ldquo;{lineText}&rdquo;</span>
            <span className="block text-[11px] text-muted-foreground">Plays first, {teaser.toFixed(1)}s</span>
          </button>
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 text-sm sm:min-h-0">
            <span className="font-medium">Hear it again in its place</span>
            <button type="button" role="switch" aria-checked={co.repeat} aria-label="Hear it again in its place" onClick={() => apply({ coldOpen: { ...co, repeat: !co.repeat } })}
              className={`relative h-6 w-11 rounded-full transition-colors after:absolute after:-inset-y-2.5 after:inset-x-0 after:content-[''] ${co.repeat ? "bg-primary" : "bg-muted"}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${co.repeat ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
