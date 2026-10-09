// Ready-made styles in the vibe edit box: one tap sets captions, grade, frame
// and pace (stylePresets.ts), with Undo. A style with zooms or pop-ups gets the
// key lines picked straight after, as switching those on under Motion does.

import { useState } from "react";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import { PRESETS, applyRecipe, isRecipe, needsKeyLines, type Preset } from "@/lib/stylePresets";
import { editedSentences, type EditSettings, type Segment, type Word } from "@/lib/videoEdit";
import { keyLinesFrom, pickKeyLines } from "@/lib/videoMotion";

export default function StylePresets({ settings, words, segs, total, speed, apply, disabled }: {
  settings: EditSettings;
  words: Word[];
  segs: Segment[];
  total: number;
  speed: number;
  /** Merges into the latest settings, with Undo. */
  apply: (p: Partial<EditSettings>) => void;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const [picking, setPicking] = useState(false);
  const left = useUsesLeft(picking)("motion-picks");

  const use = async (p: Preset) => {
    const next = applyRecipe(settings, p.recipe);
    apply(next);
    if (!needsKeyLines(settings, p.recipe) || !words.length) return;
    if (left === 0) return toast({ title: "Style on, without its zooms and pop-ups", description: "No key line picks left today. Switch them on under Hook and frame tomorrow." });
    setPicking(true);
    try {
      const sent = editedSentences(words, segs, speed);
      const lines = keyLinesFrom(await pickKeyLines(sent, total, next.hook?.trim() ? next.hookSeconds : 0), sent, segs, speed);
      if (lines) apply({ motion: { lines } });
      else toast({ title: "Zooms and pop-ups are waiting for key lines", description: "This works on videos in English. Switch them on under Hook and frame to try again." });
    } catch (e) {
      toast({ title: "Couldn't pick the key lines", description: (e as Error).message, variant: "destructive" });
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <p className="flex items-center text-xs font-semibold">Ready-made styles
        <InfoTip label="About ready-made styles">Sets captions, colour, pace and motion in one tap.</InfoTip>
        {picking && <span className="ml-2 font-normal text-muted-foreground" aria-live="polite">Picking key lines...</span>}
      </p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ready-made styles">
        {PRESETS.map((p) => {
          const on = isRecipe(settings, p.recipe);
          return (
            <button key={p.id} type="button" onClick={() => void use(p)} disabled={disabled || picking} aria-pressed={on} title={p.about}
              className={`min-h-11 rounded-full border px-3 text-xs font-semibold sm:min-h-8 ${on ? "border-primary bg-primary text-primary-foreground" : "border-border/70 bg-background text-foreground hover:border-primary/60"}`}>
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
