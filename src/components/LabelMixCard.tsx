// Analytics "Mix": how many posts each content label got in the period, as a
// share, against the share the user is aiming for (equal unless they set one).
import { useState } from "react";
import { Link } from "react-router-dom";
import { Shapes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LABEL_SWATCH, updateLabel, type Label, type MixRow } from "@/lib/labels";

export default function LabelMixCard({
  userId,
  rows,
  posts,
  unlabelled,
  onLabelsChange,
}: {
  userId: string;
  rows: MixRow[];
  posts: number;
  unlabelled: number;
  onLabelsChange: (labels: Label[]) => void;
}) {
  const [targets, setTargets] = useState<Record<string, string> | null>(null);
  const total = targets ? Object.values(targets).reduce((s, v) => s + (Number(v) || 0), 0) : 0;

  const save = (reset = false) => {
    let next: Label[] = [];
    for (const r of rows) next = updateLabel(userId, r.label.id, { target: reset ? undefined : Math.max(0, Number(targets?.[r.label.id]) || 0) });
    onLabelsChange(next);
    setTargets(null);
  };

  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <Shapes className="h-4 w-4 text-muted-foreground" /> Mix
        </CardTitle>
        {!targets && (
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-muted-foreground"
            onClick={() => setTargets(Object.fromEntries(rows.map((r) => [r.label.id, String(r.target)])))}
          >
            Set targets
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {posts === 0 && <p className="text-sm text-muted-foreground">Nothing posted in this period.</p>}
        {rows.map((r) => (
          <div key={r.label.id}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${LABEL_SWATCH[r.label.color]}`} />
                <span className="truncate">{r.label.name}</span>
              </span>
              {targets ? (
                <label className="flex shrink-0 items-center gap-1 text-muted-foreground">
                  Target
                  <input
                    type="number"
                    min={0}
                    max={100}
                    inputMode="numeric"
                    value={targets[r.label.id] ?? ""}
                    onChange={(e) => setTargets({ ...targets, [r.label.id]: e.target.value })}
                    aria-label={`Target share for ${r.label.name}`}
                    className="h-9 w-16 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  %
                </label>
              ) : (
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {r.count} post{r.count === 1 ? "" : "s"},{" "}
                  <span className="font-semibold text-foreground">{r.share}%</span> of {r.target}% target
                </span>
              )}
            </div>
            <div className="relative h-2.5 w-full rounded-full bg-muted">
              <div className={`h-full rounded-full transition-all duration-500 ${LABEL_SWATCH[r.label.color]}`} style={{ width: `${r.share}%` }} />
              <div
                className="absolute -top-1 h-[18px] w-0.5 -translate-x-1/2 rounded-full bg-foreground"
                style={{ left: `${Math.min(100, Math.max(0, r.target))}%` }}
                aria-hidden
              />
            </div>
          </div>
        ))}
        {targets ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className={`mr-auto text-xs ${total === 100 ? "text-muted-foreground" : "text-warning"}`}>
              Total {total}%{total !== 100 && total > 0 ? ", scaled to 100% when saved" : ""}
            </span>
            <Button size="sm" variant="ghost" onClick={() => save(true)} className="text-xs">
              Make equal
            </Button>
            <Button size="sm" variant="outline" onClick={() => setTargets(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => save()} disabled={total <= 0}>
              Save targets
            </Button>
          </div>
        ) : (
          unlabelled > 0 && (
            <p className="text-xs text-muted-foreground">
              {unlabelled} of {posts} posts have no label.{" "}
              <Link to="/drafts" className="font-medium text-primary hover:underline">
                Label them
              </Link>
            </p>
          )
        )}
      </CardContent>
    </Card>
  );
}
