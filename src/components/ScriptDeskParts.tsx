// Pieces the Scriptwriter (/script) and the script desk card on Clone a reel share (wave 1, Leo only):
// a run's wait line, the hook that runs one job at a time, and what comes with a script (alternate hooks, flags,
// notes).

import { useEffect, useId, useRef, useState } from "react";
import { WarningIcon, CircleNotchIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { DeskPhase, Script } from "@/lib/scriptDesk";

export interface DeskBusy {
  what: string;
  phase: DeskPhase | "filing";
  since: number;
}

/**
 * One job at a time: `run` marks it busy, keeps its phase, and turns a failure into the line to show. It resolves with
 * the answer, null when the job failed, or undefined when the wait was cut off here (Stop, leaving the page): the job
 * may still finish on the Mac, so a caller keeps whatever lets it pick the wait back up.
 */
export function useDeskRun() {
  const [busy, setBusy] = useState<DeskBusy | null>(null);
  const [error, setError] = useState("");
  const stop = useRef<AbortController | null>(null);
  useEffect(() => () => stop.current?.abort(), []);
  const run = async <T,>(what: string, job: (o: { signal: AbortSignal; onPhase: (p: DeskPhase) => void }) => Promise<T>, since = Date.now()): Promise<T | null | undefined> => {
    stop.current?.abort();
    const ctl = new AbortController();
    stop.current = ctl;
    setError("");
    setBusy({ what, phase: "filing", since });
    try {
      const r = await job({ signal: ctl.signal, onPhase: (phase) => setBusy((b) => (b ? { ...b, phase } : b)) });
      return ctl.signal.aborted ? undefined : r;
    } catch (e) {
      if (ctl.signal.aborted) return undefined;
      setError(e instanceof Error ? e.message : "That didn't go through. Try again.");
      return null;
    } finally {
      if (stop.current === ctl) setBusy(null);
    }
  };
  const cancel = () => {
    stop.current?.abort();
    setBusy(null);
  };
  return { busy, error, setError, run, cancel };
}

/** At least 44x44 on touch screens (UX law 2), as AudiencesPage's TOUCH. */
export const TOUCH = "[@media(pointer:coarse)]:min-h-11";

const PHASE: Record<DeskBusy["phase"], string> = { filing: "Sending", queued: "Waiting for your Mac", claimed: "Writing on your Mac" };

/** The wait, said plainly with its seconds, and a way to stop waiting. */
export function DeskWait({ busy, onStop }: { busy: DeskBusy; onStop: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((Date.now() - busy.since) / 1000));
  return (
    <div role="status" className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm">
      <CircleNotchIcon className="h-4 w-4 shrink-0 animate-spin text-primary" />
      <span className="min-w-0 flex-1">
        {busy.what}: {PHASE[busy.phase]} <span aria-hidden="true" className="tabular-nums text-muted-foreground">{s}s</span>
      </span>
      <Button type="button" variant="ghost" size="sm" className={TOUCH} onClick={onStop}>Stop</Button>
    </div>
  );
}

export function DeskError({ text }: { text: string }) {
  if (!text) return null;
  return <p role="alert" className="text-sm text-destructive">{text}</p>;
}

/** The alternate hooks (each can open the script instead), the writer's flags and its production notes. */
export function ScriptExtras({ s, onUseHook }: { s: Pick<Script, "hooks" | "flags" | "notes">; onUseHook?: (hook: string) => void }) {
  const id = useId();
  if (!s.hooks.length && !s.flags.length && !s.notes.length) return null;
  return (
    <div className="space-y-4">
      {s.hooks.length > 0 && (
        <section className="space-y-2" aria-labelledby={`${id}-hooks`}>
          <h3 id={`${id}-hooks`} className="text-sm font-semibold">Other hooks</h3>
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {s.hooks.map((h) => (
              <li key={h.hook} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 basis-48 [overflow-wrap:anywhere]">{h.hook}</span>
                {h.formula && <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">{h.formula}</span>}
                {onUseHook && <Button type="button" variant="ghost" size="sm" className={TOUCH} onClick={() => onUseHook(h.hook)}>Open with this</Button>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {s.flags.length > 0 && (
        <section className="space-y-1.5" aria-labelledby={`${id}-flags`}>
          <h3 id={`${id}-flags`} className="text-sm font-semibold">Check before you film</h3>
          <ul className="space-y-1 text-sm">
            {s.flags.map((f) => (
              <li key={f} className="flex gap-2"><WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" /><span>{f}</span></li>
            ))}
          </ul>
        </section>
      )}
      {s.notes.length > 0 && (
        <section className="space-y-1.5" aria-labelledby={`${id}-notes`}>
          <h3 id={`${id}-notes`} className="text-sm font-semibold">Production notes</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {s.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

/** A script with its first line swapped for another hook. */
export const withHook = (script: string, hook: string) => {
  const rest = script.split("\n").slice(1);
  return [hook, ...rest].join("\n");
};
