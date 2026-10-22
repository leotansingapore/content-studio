// Agent now on Leo's Home (docs/north-star/items/agent-home.md): agentRun's agentNow in words, running, a card waiting,
// something made in the last hour, or idle, with Open into its chat and Open chat to /agent.

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { agentNow } from "@/lib/agentRun";
import { links } from "@/lib/links";
import { cn } from "@/lib/utils";

type Now = ReturnType<typeof agentNow>;

/** The panel's two lines: agentNow's "Your video is ready" reads "Video ready" here. */
export function nowWords(now: Now): { title: string; line?: string } {
  if (now.kind === "idle") return { title: "Ready for what's next", line: "Nothing is running right now." };
  if (now.kind === "waiting") return { title: "Waiting for your yes", line: now.line };
  const made = now.kind === "ready" && /^Your (.+) is ready$/.exec(now.line);
  return { title: made ? `${made[1][0].toUpperCase()}${made[1].slice(1)} ready` : now.line };
}

export default function AgentNow({ now, className }: { now: Now; className?: string }) {
  const { title, line } = nowWords(now);
  return (
    <section aria-labelledby="agent-now-label" className={cn("rounded-2xl border border-border/70 bg-card p-4 shadow-card", className)}>
      <div className="flex min-h-9 items-center justify-between gap-2">
        <h2 id="agent-now-label" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          AGENT NOW
        </h2>
        <Link to={links.agent()} className="inline-flex min-h-9 items-center text-xs font-semibold text-primary hover:underline [@media(pointer:coarse)]:min-h-11">
          Open chat
        </Link>
      </div>
      <div className="mt-1 flex items-end justify-between gap-3" aria-live="polite">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {now.kind === "running" && <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary" aria-hidden />}
            {title}
          </p>
          {line && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{line}</p>}
        </div>
        {now.kind !== "idle" && (
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link to={now.to}>Open</Link>
          </Button>
        )}
      </div>
    </section>
  );
}
