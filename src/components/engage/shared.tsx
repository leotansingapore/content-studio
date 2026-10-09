import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Clock, Copy, RotateCcw } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { useCopy } from "@/components/recruit/shared";
import { loadRun, runningJob, saveRun, startRun, type EngageOutcome, type EngageTool, type Run } from "@/lib/engageDrafts";

/**
 * A tool's pasted text, its last drafts and whether a run is going. A run
 * started before leaving the page is picked up again on return; typed text is
 * saved as it is typed.
 */
export function useEngageRun<T>(tool: EngageTool, userId: string) {
  const [run, setRun] = useState<Run<T>>(() => loadRun<T>(tool, userId));
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<EngageOutcome | null>(null);

  const follow = (job: Promise<EngageOutcome>) => {
    setBusy(true);
    setOutcome(null);
    let live = true;
    job.then((o) => {
      if (!live) return;
      setBusy(false);
      setOutcome(o);
      setRun(loadRun<T>(tool, userId));
    });
    return () => {
      live = false;
    };
  };

  useEffect(() => {
    setRun(loadRun<T>(tool, userId));
    const job = runningJob(tool, userId);
    return job ? follow(job) : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, userId]);

  return {
    run,
    busy,
    outcome,
    edit: (patch: Partial<Run<T>>) => setRun((r) => saveRun(tool, userId, { ...r, ...patch })),
    start: () => void follow(startRun(tool, userId, run)),
  };
}

export type Group<T> = { key: string; label: string; tip?: string; items: T[] };

/** The sorted drafts: a count per group, then each group under its heading. */
export function Groups<T>({ groups, testId, render }: { groups: Group<T>[]; testId: string; render: (item: T) => ReactNode }) {
  const shown = groups.filter((g) => g.items.length);
  if (!shown.length) return null;
  return (
    <div className="space-y-4" data-testid={testId}>
      <p className="flex flex-wrap gap-1.5" aria-label="How they sorted">
        {shown.map((g) => (
          <span key={g.key} className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {g.label} <span className="tabular-nums text-foreground">{g.items.length}</span>
          </span>
        ))}
      </p>
      {shown.map((g) => (
        <div key={g.key} className="space-y-2">
          <h3 className="flex items-center gap-1 text-sm font-semibold text-foreground">
            {g.label}
            {g.tip && <InfoTip label={`About ${g.label}`}>{g.tip}</InfoTip>}
          </h3>
          <ul className="space-y-2">{g.items.map(render)}</ul>
        </div>
      ))}
    </div>
  );
}

/** What was pasted, shown above its draft. */
export function Quote({ name, text, tag }: { name: string; text: string; tag?: string }) {
  return (
    <p className="line-clamp-3 text-sm text-muted-foreground [overflow-wrap:anywhere]">
      {tag && <span className="mr-1.5 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-foreground">{tag}</span>}
      {name && <span className="font-semibold text-foreground">{name}: </span>}
      {text}
    </p>
  );
}

/** A draft to paste, with its Copy button (44px on phones). Empty: the one line that says so. */
export function Draft({ label, text, onCopy }: { label: string; text: string; onCopy?: () => void }) {
  const copy = useCopy();
  if (!text)
    return <p className="text-xs italic text-muted-foreground">No safe draft came back for this one. Run it again or write your own.</p>;
  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 whitespace-pre-line text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">{text}</p>
        <button
          type="button"
          onClick={() => {
            void copy(text, `${label} copied`);
            onCopy?.();
          }}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="inline-flex h-11 shrink-0 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10 sm:h-8 [@media(pointer:coarse)]:h-11"
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
          <Button size="sm" variant="outline" onClick={retry} className="h-11 gap-1.5 sm:h-9 [@media(pointer:coarse)]:h-11">
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
