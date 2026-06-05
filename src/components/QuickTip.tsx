import { useMemo, useState } from "react";
import { Lightbulb, RefreshCw } from "lucide-react";
import { tipsFor, type QuickTip as QuickTipType } from "@/data/quickTips";

interface QuickTipProps {
  context?: QuickTipType["context"];
  className?: string;
}

/**
 * A small, dismissable-feeling inspiration banner. Shows one actionable tip and
 * lets the user cycle to the next. Purely client-side, no persistence — it's a
 * nudge, not a notification.
 */
export default function QuickTip({ context = "any", className = "" }: QuickTipProps) {
  const tips = useMemo(() => tipsFor(context), [context]);
  const [index, setIndex] = useState(() =>
    tips.length > 0 ? Math.floor(Math.random() * tips.length) : 0,
  );

  if (tips.length === 0) return null;
  const tip = tips[index % tips.length];

  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5 text-xs ${className}`}
    >
      <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-foreground" />
      <p className="flex-1 leading-relaxed text-foreground/90">
        <span className="font-semibold uppercase tracking-[0.14em] text-[10px] text-accent-foreground/80">
          Quick tip
        </span>
        <br />
        {tip.text}
      </p>
      <button
        type="button"
        onClick={() => setIndex((i) => (i + 1) % tips.length)}
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
        aria-label="Show another tip"
        title="Another tip"
      >
        <RefreshCw className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
