// The foot of a step in a maker that already has ordered steps (the post writer's brief, the campaign wizard): where
// you are on the left, Back and one filled Continue on the right, in the same place on every step. It draws only
// the chrome: the maker keeps its own step state, and a step's own action (Generate, Add campaign), with its price
// chip, is passed in as children and stays the maker's button.
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** "Step 2 of 4 | Funnel": the one way a step is named. */
export const stepLine = (step: number, total: number, name: string) => `Step ${step} of ${total} | ${name}`;

export default function StepFooter(p: {
  /** Counted from 1. */
  step: number;
  total: number;
  name: string;
  /** None on the first step: Back keeps its place, switched off. */
  onBack?: () => void;
  backDisabled?: boolean;
  /** None on a step whose own action (children) moves on. */
  onContinue?: () => void;
  /** Why Continue can't be pressed yet: shown under it, and Continue is off ("" when the fields show why themselves). */
  reason?: string | null;
  /** Outline when children hold the screen's one filled button. */
  continueVariant?: "default" | "outline";
  children?: ReactNode;
}) {
  return (
    <div className="space-y-1 border-t border-border/60 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {/* a status: a screen reader hears the count when the step changes */}
        <p role="status" className="text-xs font-medium text-muted-foreground">{stepLine(p.step, p.total, p.name)}</p>
        <div className="ml-auto flex flex-wrap items-start justify-end gap-2">
          <Button type="button" variant="outline" onClick={p.onBack} disabled={!p.onBack || p.backDisabled}>Back</Button>
          {p.onContinue && (
            <Button type="button" variant={p.continueVariant} onClick={p.onContinue} disabled={p.reason != null}>Continue</Button>
          )}
          {p.children}
        </div>
      </div>
      {p.reason && <p className="text-right text-xs text-muted-foreground">{p.reason}</p>}
    </div>
  );
}
