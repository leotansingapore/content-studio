// Horizontal ranked-bar chart: one measure (avg engagement rate) across a
// handful of categories. Sequential single-hue by default — the top bar gets
// full primary, the rest a lighter step of the same hue, which is the
// "magnitude, low to high" encoding rather than a categorical palette (each
// bar's identity already comes from its axis label, not its color).
//
// Rows can instead carry an explicit `tone` (good/warn/over) to switch to
// the reserved status palette, for e.g. the length-correlation chart.

export interface RankBarRow {
  key: string;
  label: string;
  value: number; // the metric, e.g. avg engagement rate (%)
  count: number; // sample size backing this row
  tone?: "good" | "warn" | "over";
}

const TONE_CLASS: Record<"good" | "warn" | "over", string> = {
  good: "bg-success",
  warn: "bg-warning",
  over: "bg-destructive",
};

export function RankBars({
  rows,
  valueSuffix = "%",
  minSample = 2,
  emptyLabel = "Not enough tracked posts yet.",
}: {
  rows: RankBarRow[];
  valueSuffix?: string;
  minSample?: number;
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  const max = Math.max(...rows.map((r) => r.value), 0.0001);

  return (
    <div className="space-y-3">
      {rows.map((row, i) => {
        const widthPct = Math.max(3, (row.value / max) * 100);
        const lowSample = row.count < minSample;
        const barClass = row.tone
          ? TONE_CLASS[row.tone]
          : i === 0
            ? "bg-primary"
            : "bg-primary/45";
        return (
          <div key={row.key} className={lowSample ? "opacity-60" : undefined}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-foreground">{row.label}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {row.value}
                  {valueSuffix}
                </span>{" "}
                · {row.count} post{row.count === 1 ? "" : "s"}
                {lowSample ? " (low sample)" : ""}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barClass}`}
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
