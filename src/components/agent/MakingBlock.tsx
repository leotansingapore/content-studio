// A make on its way in the agent's thread (Fastlane's MAKING block, 11 Nov walk): "MAKING" and a running clock from
// when it started (stored on the message, so a reload or another device shows the same time), the step it is on, and
// where it lands. The engine runs outside React (agentRun.ts), so leaving the page loses nothing.
import { useEffect, useState } from "react";
import { CircleNotchIcon } from "@phosphor-icons/react";
import { tookWords } from "@/components/agent/MadeBlock";

export default function MakingBlock({ title, startedAt, step }: { title: string; startedAt: string; step?: string }) {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date().toISOString()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <section aria-label={`Making: ${title}`} className="w-full max-w-xl rounded-xl border border-border bg-card shadow-card">
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2">
        <span className="text-[11px] font-semibold tracking-[0.14em] text-primary">MAKING</span>
        {/* the ticking clock stays out of the live region below */}
        <span className="text-[11px] tabular-nums text-muted-foreground" aria-hidden>{tookWords({ startedAt, endedAt: now })}</span>
      </header>
      <div className="space-y-2 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium" role="status">
          <CircleNotchIcon className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />
          <span className="min-w-0 break-words">{step?.replace(/\.\.\.$/, "") || "Getting it ready"}</span>
        </p>
        <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
        </div>
        <p className="text-xs text-muted-foreground">It lands right here. Leaving this page loses nothing.</p>
      </div>
    </section>
  );
}
