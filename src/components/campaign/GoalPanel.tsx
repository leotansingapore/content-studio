// THE GOAL on /campaigns/:id (plan-campaign-page, Leo only): the goal copied onto the campaign at Add, or Set goal
// (the /campaigns goal editor; a new goal applies to new campaigns, never this one), then the angle mix. `angle` is
// the page's ?angle= filter (null for all), and `onAngle` sets it: AngleMix's chips filter the queue.

import { Link } from "react-router-dom";
import AngleMix from "@/components/campaign/AngleMix";
import type { Campaign } from "@/lib/campaigns";
import { links } from "@/lib/links";

export default function GoalPanel({ campaign: c, angle, onAngle }: { userId: string; campaign: Campaign; angle: string | null; onAngle: (id: string | null) => void }) {
  return (
    <section aria-labelledby="goal-h" className="space-y-3 rounded-xl border border-border/60 bg-card p-5 shadow-card">
      <h2 id="goal-h" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">The goal</h2>
      {c.goal ? (
        <p className="text-base [overflow-wrap:anywhere]">{c.goal}</p>
      ) : (
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="text-muted-foreground">No goal set.</span>
          <Link to={links.campaigns({ goal: "change" })} className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline sm:min-h-0">Set goal</Link>
        </p>
      )}
      <AngleMix campaign={c} active={angle} onPick={onAngle} />
    </section>
  );
}
