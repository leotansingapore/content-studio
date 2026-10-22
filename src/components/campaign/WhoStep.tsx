// The campaign wizard's step 1 (plan-campaign, Leo only): which saved audience the campaign reaches, one row each,
// main first. The wizard page draws the step's header, Back and Confirm.

import { Link } from "react-router-dom";
import type { Audience } from "@/lib/audiences";
import { links } from "@/lib/links";

export const ROW = "flex min-h-11 w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors";
export const rowOn = (on: boolean) => (on ? "border-primary/60 bg-primary/10" : "border-border/70 hover:border-primary/40");
export const dot = (on: boolean) => `mt-0.5 h-4 w-4 shrink-0 rounded-full border ${on ? "border-[5px] border-primary" : "border-muted-foreground/60"}`;

/** No audience yet: who the brand serves comes first. */
export function NoAudience({ positioningUsable }: { positioningUsable: boolean }) {
  return (
    <div className="space-y-3 rounded-xl border border-dashed border-border p-5">
      <p className="text-sm">Say who you serve first, so the posts are about them.</p>
      <Link to={positioningUsable ? links.audiences() : links.plan({ view: "setup" })} className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        {positioningUsable ? "Add an audience" : "Set up positioning"}
      </Link>
    </div>
  );
}

export default function WhoStep({ audiences, picked, onPick }: { audiences: Audience[]; picked: string | null; onPick: (id: string) => void }) {
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-labelledby="wizard-q" className="grid gap-1.5">
        {audiences.map((a) => (
          <button key={a.id} type="button" role="radio" aria-checked={picked === a.id} onClick={() => onPick(a.id)} className={`${ROW} ${rowOn(picked === a.id)}`}>
            <span aria-hidden className={dot(picked === a.id)} />
            <span className="min-w-0">
              <span className="block break-words font-medium">{a.name}</span>
              {a.who && <span className="mt-0.5 line-clamp-2 block break-words text-xs text-muted-foreground">{a.who}</span>}
            </span>
          </button>
        ))}
      </div>
      <Link to={links.audiences()} className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline">
        Change audiences
      </Link>
    </div>
  );
}
