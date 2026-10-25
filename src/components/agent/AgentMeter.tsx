// The agent's day in the sidebar foot (Fastlane's "fuel used" meter): how much of today's agent messages is used,
// opening the limits on Automations. Loads with the agent's chunk, for the agent's sign-ins only.
import { Link } from "react-router-dom";
import { useAgentUsage } from "@/components/agent/Composer";
import { leftOf, limitOf } from "@/lib/agentBudget";
import { links } from "@/lib/links";

export default function AgentMeter() {
  const left = leftOf(useAgentUsage(), "agent-act");
  const limit = limitOf("agent-act");
  if (left === null || !limit) return null; // before today's count is read
  const used = Math.min(100, Math.max(0, Math.round(((limit - left) / limit) * 100)));
  return (
    <Link
      to={links.automations({ section: "limits" })}
      className="block rounded-xl border border-border/70 bg-background px-3 py-2 transition-colors hover:border-primary/40"
    >
      <span className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Agent messages used</span>
        <span className="font-semibold tabular-nums text-foreground">{used}%</span>
      </span>
      <span aria-hidden className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted">
        <span className={`block h-full rounded-full ${left <= 10 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${used}%` }} />
      </span>
      <span className="mt-1 block text-[11px] text-muted-foreground">{left} left, back at 8am</span>
    </Link>
  );
}
