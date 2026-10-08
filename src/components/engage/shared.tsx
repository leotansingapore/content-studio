import { AlertTriangle, Clock, Copy, RotateCcw } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/components/recruit/shared";
import type { EngageOutcome } from "@/lib/engageDrafts";

/** A draft to paste, with its Copy button (44px on phones). Empty: the one line that says so. */
export function Draft({ label, text }: { label: string; text: string }) {
  const copy = useCopy();
  if (!text)
    return <p className="text-xs italic text-muted-foreground">No safe draft came back for this one. Run it again or write your own.</p>;
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 whitespace-pre-line text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">{text}</p>
        <button
          type="button"
          onClick={() => copy(text, `${label} copied`)}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="inline-flex h-11 shrink-0 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10 sm:h-8"
        >
          <Copy className="h-3.5 w-3.5" /> Copy
        </button>
      </div>
    </div>
  );
}

/** What a run is doing: working, failed (with Try again), or out of today's uses. */
export function RunStatus({
  busy,
  busyText,
  outcome,
  retry,
}: {
  busy: boolean;
  busyText: string;
  outcome: EngageOutcome | null;
  retry: () => void;
}) {
  return (
    <div aria-live="polite" className="empty:hidden">
      {busy && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4" role="status">
          <ThinkingOrb state="composing" size={20} theme="light" aria-hidden />
          <p className="text-sm font-medium text-foreground">{busyText}</p>
        </div>
      )}
      {!busy && outcome?.kind === "error" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4" role="alert">
          <p className="flex min-w-0 flex-1 items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {outcome.message}
          </p>
          <Button size="sm" variant="outline" onClick={retry} className="h-11 gap-1.5 sm:h-9">
            <RotateCcw className="h-4 w-4" /> Try again
          </Button>
        </div>
      )}
      {!busy && outcome?.kind === "limit" && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-foreground" role="status">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>{outcome.message} What you pasted stays here.</p>
        </div>
      )}
    </div>
  );
}
