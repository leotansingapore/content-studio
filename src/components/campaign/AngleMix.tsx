// A campaign's angle mix (plan-angles, Leo only, in the campaign page's THE GOAL panel): one bar segment per angle,
// sized by its unskipped posts (angleCounts), and a chip per angle with its count as text, so colour is never the
// only signal. A chip press filters the queue to that angle (the page keeps ?angle= and passes it in); pressing the
// outlined chip again clears it.

import { angleCounts, type Campaign } from "@/lib/campaigns";
import { LABEL_SWATCH } from "@/lib/labels";

// the five label colours that never read as an error, repeating after the fifth angle
const SWATCHES = [LABEL_SWATCH.primary, LABEL_SWATCH.brand, LABEL_SWATCH.success, LABEL_SWATCH.warning, LABEL_SWATCH.muted];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "S"}`;

export default function AngleMix({
  campaign,
  active = null,
  onPick,
}: {
  campaign: Pick<Campaign, "angles" | "posts">;
  /** The angle the queue is filtered to; an id that isn't in the campaign outlines nothing. */
  active?: string | null;
  onPick?: (id: string | null) => void;
}) {
  const counts = angleCounts(campaign).map((a, i) => ({ ...a, swatch: SWATCHES[i % SWATCHES.length] }));
  const total = counts.reduce((s, a) => s + a.count, 0);
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {plural(counts.length, "ANGLE")} | {plural(total, "POST")}
      </p>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">No posts left in this campaign.</p>
      ) : (
        <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          {counts.filter((a) => a.count > 0).map((a) => (
            <div key={a.id} className={`h-full ${a.swatch}`} style={{ flexGrow: a.count }} />
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {counts.map((a) => {
          const on = a.id === active;
          return (
            <button
              key={a.id}
              type="button"
              aria-pressed={on}
              disabled={!onPick}
              onClick={() => onPick?.(on ? null : a.id)}
              className={`inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default [@media(pointer:coarse)]:min-h-11 ${
                on ? "border-foreground bg-accent font-medium ring-1 ring-foreground" : "border-border/60 hover:bg-accent"
              }`}
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${a.swatch}`} aria-hidden />
              <span className="min-w-0 break-words">{a.title}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{a.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
