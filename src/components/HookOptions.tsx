// Hook card ideas under "Hook on screen": three lines from what is said, each
// in its own formula, with Jev's pick put on the card straight away. Tap another
// to use it; "Write 3 more" takes the next three formulas.

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useUsesLeft } from "@/lib/aiUsage";
import { hookFormula } from "@/lib/hookFormulas";
import { writeHooks, type HookIdeas } from "@/lib/hookCard";
import { editedSentences, type Segment, type Word } from "@/lib/videoEdit";

// kept while the page is open, so switching tabs doesn't lose them
const kept = new Map<string, { ideas: HookIdeas; set: number }>();

export default function HookOptions({ projectId, words, segs, total, speed, hook, onUse }: {
  projectId: string;
  words: Word[];
  segs: Segment[];
  total: number;
  speed: number;
  /** The hook on the card now. */
  hook: string;
  /** Puts a line on the card, with Undo. */
  onUse: (text: string) => void;
}) {
  const { toast } = useToast();
  const [state, setState] = useState(() => kept.get(projectId) ?? null);
  const [busy, setBusy] = useState(false);
  const left = useUsesLeft(busy)("vibe-edit");

  const write = async () => {
    const set = state ? state.set + 1 : 0;
    setBusy(true);
    try {
      const ideas = await writeHooks(editedSentences(words, segs, speed), total, set);
      const next = { ideas, set };
      kept.set(projectId, next);
      setState(next);
      if (ideas.pick !== null) onUse(ideas.hooks[ideas.pick].text);
    } catch (e) {
      toast({ title: "Couldn't write hooks", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => void write()} disabled={busy || !words.length || left === 0}
          className={`h-11 gap-1.5 sm:h-9 ${busy ? "disabled:opacity-100" : ""}`}>
          {busy ? <ThinkingOrb state="composing" size={20} theme="light" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" />}
          {busy ? "Writing..." : state ? "Write 3 more" : "Write 3 hooks from what I say"}
        </Button>
        {left !== null && <span className={`text-[11px] ${left ? "text-muted-foreground" : "font-medium text-destructive"}`}>{left ? `${left} left today` : "None left today"}</span>}
      </div>
      {state && (
        <ul className="divide-y divide-border/60 rounded-lg border border-border/60" aria-label="Hook ideas">
          {state.ideas.hooks.map((h, i) => {
            const on = hook.trim() === h.text;
            return (
              <li key={h.text}>
                <button type="button" aria-pressed={on} onClick={() => onUse(h.text)}
                  className={`flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left ${on ? "bg-primary/5" : "hover:bg-muted/40"}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{h.text}</span>
                    <span className="block text-[11px] text-muted-foreground">{hookFormula(h.formula)?.name ?? ""}</span>
                  </span>
                  {i === state.ideas.pick && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Recommended</span>}
                  {on && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
