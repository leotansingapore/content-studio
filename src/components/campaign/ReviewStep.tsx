// The campaign wizard's step 5 and its result (plan-campaign, Leo only). Review names the campaign, lists every
// answer with the goal and the success target, says what Add does and what it costs, and Add campaign carries the
// campaign-draft chip (one use per 7 posts). The result card says what was added and what making it will cost.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { MAX_NAME } from "@/lib/campaignWizard";
import { priceOf, type Price } from "@/lib/prices";
import { links } from "@/lib/links";

/** Writing the words: one campaign-draft use per 7 posts. */
const writePrice = (uses: number): Price => {
  const one = priceOf("campaign-draft") as Price;
  return { usd: one.usd * uses, kind: one.kind };
};

const HEAD = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";

export default function ReviewStep(p: {
  name: string;
  onName: (name: string) => void;
  rows: [string, ReactNode][];
  goal: string;
  success: string;
  cost: string;
  adding: boolean;
  /** campaign-draft uses: today's left (null unread) and what Add spends. */
  left: number | null;
  uses: number;
  limitLine: string | null;
  /** Why Add can't go (12 campaigns already), or why it didn't (no room). */
  blocked: string | null;
  error: string | null;
  onBack: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="campaign-name" className={HEAD}>Campaign name</label>
        <Input id="campaign-name" value={p.name} maxLength={MAX_NAME} disabled={p.adding} onChange={(e) => p.onName(e.target.value)} />
      </div>

      <dl className="grid gap-x-4 gap-y-2.5 text-sm sm:grid-cols-[11rem_minmax(0,1fr)]">
        {p.rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="-mt-2 break-words sm:mt-0">{value}</dd>
          </div>
        ))}
        <dt className="text-muted-foreground">Goal</dt>
        <dd className="-mt-2 break-words sm:mt-0">
          {p.goal || (
            <>
              <span className="text-muted-foreground">Not set</span>{" "}
              <Link to={links.campaigns({ goal: "change" })} className="text-primary underline-offset-4 hover:underline">Set goal</Link>
            </>
          )}
        </dd>
        <dt className="flex items-center gap-1 text-muted-foreground">
          Success looks like
          <InfoTip label="About success">A winner gets half again your usual engagement.</InfoTip>
        </dt>
        <dd className="-mt-2 sm:mt-0">{p.success}</dd>
      </dl>

      <p className="text-sm">{p.cost}</p>

      <div className="space-y-3 border-t border-border/60 pt-4">
        <p className="text-sm text-muted-foreground">Adding this writes the words for every post. Nothing is posted, and no AI video is made, until you press Make on it.</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {p.adding ? <span /> : <Button variant="outline" onClick={p.onBack}>Back</Button>}
          <div className="flex flex-col items-end gap-1">
            <Button onClick={p.onAdd} disabled={p.adding || !!p.blocked}>{p.adding ? "Adding..." : "Add campaign"}</Button>
            <PriceChip price={writePrice(p.uses)} uses={p.uses} left={p.left} />
          </div>
        </div>
        {p.limitLine && <p className="text-right text-xs text-muted-foreground">{p.limitLine}</p>}
        {(p.blocked || p.error) && <p role="alert" className="text-right text-sm text-destructive">{p.blocked || p.error}</p>}
      </div>
    </div>
  );
}

/** After Add: what is in, that it is being written, and what making it costs. */
export function AddedCard({ id, name, line, cost }: { id: string; name: string; line: string; cost: string }) {
  return (
    <section aria-labelledby="added-h" className="space-y-3 rounded-xl border border-border/60 bg-card p-5 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-success">Added</p>
      <h2 id="added-h" className="font-serif text-xl sm:text-2xl">{name} is in your campaigns.</h2>
      <p className="text-sm">{line}</p>
      <p className="text-sm text-muted-foreground">{cost}</p>
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <Button asChild variant="outline"><Link to={links.campaigns()}>Back to campaigns</Link></Button>
        <Button asChild><Link to={links.campaign(id)}>Open campaign</Link></Button>
      </div>
    </section>
  );
}
