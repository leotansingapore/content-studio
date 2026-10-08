// Motion in the video editor's frame tab: zooms on the key lines Jev picks.
// The picks are asked for once (one "motion-picks" use) and kept on the edit.

import { useState } from "react";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import { editedSentences, type Caption, type EditSettings, type Segment, type Word } from "@/lib/videoEdit";
import { keyLinesFrom, motionOf, pickKeyLines, sanitizeMotion } from "@/lib/videoMotion";

export default function MotionControls({ settings, words, segs, caps, total, speed, apply }: {
  settings: EditSettings;
  words: Word[];
  segs: Segment[];
  caps: Caption[];
  total: number;
  speed: number;
  /** Merges into the latest settings, with Undo. */
  apply: (p: Partial<EditSettings>) => void;
}) {
  const { toast } = useToast();
  const [picking, setPicking] = useState(false);
  const left = useUsesLeft(picking)("motion-picks");
  const picked = !!sanitizeMotion(settings.motion)?.lines.length;
  const zooms = motionOf(settings, segs, caps, total).zooms.length;

  // the first time: Jev reads the edit and picks its key lines, then the zooms go on
  const pick = async (then: Partial<EditSettings>) => {
    setPicking(true);
    try {
      const sent = editedSentences(words, segs, speed);
      const lines = keyLinesFrom(await pickKeyLines(sent, total, settings.hook?.trim() ? settings.hookSeconds : 0), sent, segs, speed);
      if (!lines) return toast({ title: "No key lines picked", description: "This works on videos in English. Try again in a minute if yours is.", variant: "destructive" });
      apply({ ...then, motion: { lines } });
    } catch (e) {
      toast({ title: "Couldn't pick the key lines", description: (e as Error).message, variant: "destructive" });
    } finally {
      setPicking(false);
    }
  };
  const setZooms = (on: boolean) => (on && !picked ? void pick({ keyZooms: true }) : apply({ keyZooms: on }));

  return (
    <div className="space-y-2 border-t border-border/60 pt-3">
      <p className="flex items-center text-sm font-medium">Motion
        <InfoTip label="About motion">The key lines are picked from what you say, once per video.</InfoTip></p>
      <Row label={settings.keyZooms && picked ? `Zoom on key lines (${zooms})` : "Zoom on key lines"}>
        {picking ? (
          <span className="text-xs text-muted-foreground" aria-live="polite">Picking key lines...</span>
        ) : !picked && left !== null ? (
          <span className={`text-[11px] ${left ? "text-muted-foreground" : "font-medium text-destructive"}`}>{left ? `${left} left today` : "None left today"}</span>
        ) : null}
        <Toggle label="Zoom on key lines" on={!!settings.keyZooms && picked} disabled={picking || !words.length || (!picked && left === 0)} set={setZooms} />
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="font-medium">{label}</span>
      <span className="flex items-center gap-1.5">{children}</span>
    </div>
  );
}

function Toggle({ label, on, set, disabled }: { label: string; on: boolean; set: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => set(!on)} disabled={disabled}
      className={`relative h-6 w-11 rounded-full transition-colors after:absolute after:-inset-y-2.5 after:inset-x-0 after:content-[''] disabled:opacity-50 ${on ? "bg-primary" : "bg-muted"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}
