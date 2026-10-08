// The shot list a short video is filmed from: what to say and how to say it,
// the text on screen, what to show and roughly how long, per beat. Clone a reel shows it
// for a cloned reel and Write for any short-video draft's storyboard.

import { useEffect, useState } from "react";
import { AlertTriangle, Camera, Check, Copy, Eye, Mic } from "lucide-react";

import { useToast } from "@/hooks/use-toast";
import { countWords, reelTooLong } from "@/lib/platformCounters";
import { shotListText, type ShotBeat } from "@/lib/reelClone";

const LABEL = "text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";

export function CopyButton({ text, label, display = "Copy" }: { text: string; label: string; display?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          toast({ title: `${label} copied` });
        } catch {
          toast({ title: "Copy failed", variant: "destructive" });
        }
      }}
      aria-label={`Copy ${label.toLowerCase()}`}
      className="-my-3.5 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-4 text-[11px] font-medium sm:my-0 sm:py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : display}
    </button>
  );
}

/**
 * `shots` replaces a beat's own shot when set (Clone a reel's read of the
 * original's look, then `matched` says so); `script` adds Copy script.
 */
export default function ShotList({
  beats,
  shots = [],
  script,
  matched = false,
}: {
  beats: ShotBeat[];
  shots?: string[];
  script?: string;
  matched?: boolean;
}) {
  const total = beats.reduce((sum, b) => sum + b.seconds, 0);
  const words = beats.reduce((sum, b) => sum + countWords(b.say), 0);
  const tooLong = reelTooLong(words, total);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className={LABEL}>
          Shot list · about {total}s · {words} words
        </p>
        <div className="flex items-center gap-1">
          {script && <CopyButton text={script} label="Script" display="Copy script" />}
          <CopyButton text={shotListText(beats, shots)} label="Shot list" display="Copy shot list" />
        </div>
      </div>
      {tooLong && (
        <p role="alert" className="flex items-center gap-1 text-[11px] font-medium text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-3 w-3 shrink-0" /> {tooLong}
        </p>
      )}
      {matched && (
        <p className="flex items-center gap-1 text-[11px] font-medium text-primary">
          <Eye className="h-3 w-3 shrink-0" /> Shots match the original's look
        </p>
      )}
      <ol className="space-y-2">
        {beats.map((b, i) => {
          const shot = shots[i] || b.visual;
          return (
            <li key={i} className="flex gap-2.5 rounded-lg border border-border/50 bg-muted/10 p-2.5">
              <div className="flex w-8 shrink-0 flex-col items-center gap-1 pt-0.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground">{b.seconds}s</span>
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-sm font-medium leading-relaxed text-foreground [overflow-wrap:anywhere]">{b.say}</p>
                {b.delivery && (
                  <p className="flex gap-1.5 text-xs italic leading-relaxed text-foreground/70">
                    <Mic className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      <span className="sr-only">Delivery: </span>
                      {b.delivery}
                    </span>
                  </p>
                )}
                {b.onScreen && (
                  <p className="w-fit max-w-full rounded bg-foreground px-1.5 py-0.5 text-[11px] font-semibold text-background [overflow-wrap:anywhere]">
                    <span className="sr-only">On screen: </span>
                    {b.onScreen}
                  </p>
                )}
                {shot && (
                  <p className="flex gap-1.5 text-xs leading-relaxed text-muted-foreground">
                    <Camera className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      <span className="sr-only">Show: </span>
                      {shot}
                    </span>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
