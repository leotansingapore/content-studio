// "Add B-roll for me" in the video editor's B-roll tab: Jev picks the lines a
// picture helps, a stock clip goes over each (src/lib/autoBroll.ts). The job
// keeps going on other pages; this shows its progress and what it placed.

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { useUsesLeft } from "@/lib/aiUsage";
import BrollSheet from "@/components/BrollSheet";
import { aiBrollOn, brollJob, dismissBrollJob, onBrollJob, running as isRunning, startAutoBroll, stopBrollJob, type BrollJob, type Orientation } from "@/lib/autoBroll";
import { MAX_BROLL, editedSentences, type EditSettings, type Segment, type Word } from "@/lib/videoEdit";

export default function AutoBroll({ userId, projectId, settings, words, segs, total, speed, apply, seek }: {
  userId: string;
  projectId: string;
  settings: EditSettings;
  words: Word[];
  segs: Segment[];
  total: number;
  speed: number;
  /** Merges into the latest settings, with Undo. */
  apply: (p: Partial<EditSettings>) => void;
  seek: (t: number) => void;
}) {
  const [j, setJ] = useState<BrollJob | null>(brollJob());
  useEffect(() => onBrollJob(setJ), []);
  const running = isRunning(j);
  const mine = j?.projectId === projectId ? j : null;
  const usesLeft = useUsesLeft(running);
  const left = usesLeft("broll-picks");
  // AI clips when stock has nothing: held back until the Higgsfield pool is topped up (autoBroll.ts AI_BROLL)
  const aiOffered = aiBrollOn();
  const [ai, setAi] = useState(false);
  const aiLeft = usesLeft("ai-broll");
  const existing = settings.broll ?? [];
  const orientation: Orientation = settings.aspect === "16:9" ? "landscape" : settings.aspect === "1:1" ? "square" : "portrait";

  const start = () =>
    void startAutoBroll(userId, {
      projectId,
      sentences: editedSentences(words, segs, speed),
      total,
      hookSeconds: settings.hook?.trim() ? settings.hookSeconds : 0,
      existing,
      stickers: settings.overlays?.length ?? 0,
      color: settings.activeColor,
      orientation,
      ai: aiOffered && ai && aiLeft !== 0,
    }).catch(() => {}); // a second start while one runs: the button is disabled then

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className={`h-11 gap-1.5 sm:h-9 ${running ? "disabled:opacity-100" : ""}`} onClick={start}
          disabled={running || !words.length || existing.length >= MAX_BROLL || left === 0}>
          {running && mine ? <ThinkingOrb state="working" size={20} theme="light" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" />}
          {running && mine ? "Finding B-roll..." : "Add B-roll for me"}
        </Button>
        <InfoTip label="About B-roll for me">Puts a clip or a text card over each line a visual helps.</InfoTip>
        {left !== null && !running && <span className={`text-[11px] ${left ? "text-muted-foreground" : "font-medium text-destructive"}`}>{left ? `${left} left today` : "None left today"}</span>}
      </div>
      {mine && running && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
          {mine.state === "reading" ? "Reading your lines..." : mine.state === "making" ? `Making AI clips: ${mine.done} of ${mine.of}, about a minute each` : `Finding clips: ${mine.done} of ${mine.of}`}
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={stopBrollJob}>Stop</Button>
        </p>
      )}
      {aiOffered && (
        <label className="flex min-h-11 flex-wrap items-center gap-2 text-xs sm:min-h-0">
          <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} disabled={running || aiLeft === 0} className="h-4 w-4 accent-primary" />
          <span className="font-medium">Make an AI clip when stock has none</span>
          {aiLeft !== null && <span className={aiLeft ? "text-muted-foreground" : "font-medium text-destructive"}>{aiLeft ? `${aiLeft} left today` : "None left today"}</span>}
        </label>
      )}
      {mine?.state === "failed" && <p className="text-xs text-destructive" role="alert">{mine.error}</p>}
      {mine?.note && !running && <p className="text-xs text-destructive" role="alert">AI clips stopped: {mine.note}</p>}
      {mine?.state === "done" && (!mine.placed.length || mine.missed.length > 0) && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {!mine.placed.length && !mine.missed.length && "No line needed B-roll this time."}
          {mine.missed.length > 0 && `Nothing found for ${mine.missed.map((m) => `"${m}"`).join(", ")}.`}
        </p>
      )}
      {mine && !running && <BrollSheet placed={mine.placed} brolls={existing} overlays={settings.overlays ?? []} orientation={orientation} apply={apply} seek={seek} onDone={dismissBrollJob} />}
      {!mine && running && <p className="text-xs text-muted-foreground">Finding B-roll for another video. Try again when it's done.</p>}
    </div>
  );
}
