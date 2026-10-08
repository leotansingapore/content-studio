// Day x time heatmap of average engagement rate: one hue, light to dark, empty
// cells muted. Hovering or tapping a cell puts its numbers in the line below
// the grid, which otherwise shows `summary` (the best slot).
import { useState } from "react";
import { DAY_LABELS as DAYS, type TimeCell } from "@/lib/analytics";

export function TimeHeatmap({
  rows,
  columns,
  columnNames = columns,
  showValues = false,
  summary,
}: {
  rows: TimeCell[][];
  /** Short header per column ("" leaves it blank). */
  columns: string[];
  /** Full name per column for the readout ("8pm", "Evening"). */
  columnNames?: string[];
  showValues?: boolean;
  summary?: string | null;
}) {
  const [picked, setPicked] = useState<[number, number] | null>(null);
  const max = Math.max(0.0001, ...rows.flat().map((c) => c.rate));
  const describe = ([i, j]: [number, number]) => {
    const c = rows[i][j];
    const when = `${DAYS[i]}${columnNames[j] ? ` ${columnNames[j]}` : ""}`;
    return c.count ? `${when}: ${c.rate}% across ${c.count} post${c.count === 1 ? "" : "s"}` : `${when}: no posts yet`;
  };
  const readout = picked ? describe(picked) : summary;

  return (
    <div className="space-y-2">
      <table className="w-full table-fixed border-separate border-spacing-[2px]">
        <thead>
          <tr>
            <th className="w-9" aria-hidden />
            {columns.map((c, j) => (
              <th key={j} scope="col" className="overflow-visible whitespace-nowrap px-0 text-left text-[10px] font-medium text-muted-foreground">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <th scope="row" className="pr-1 text-left text-[11px] font-medium text-muted-foreground">
                {DAYS[i]}
              </th>
              {r.map((c, j) => {
                const strength = c.count ? 0.15 + 0.85 * (c.rate / max) : 0;
                const label = describe([i, j]);
                const on = picked?.[0] === i && picked?.[1] === j;
                return (
                  <td
                    key={j}
                    title={label}
                    aria-label={label}
                    onPointerEnter={(e) => e.pointerType === "mouse" && setPicked([i, j])}
                    onPointerLeave={(e) => e.pointerType === "mouse" && setPicked(null)}
                    onClick={() => setPicked(on ? null : [i, j])}
                    className={`cursor-default rounded-[4px] p-0 text-center tabular-nums ${showValues ? "h-11 text-xs font-semibold" : "h-7"} ${
                      c.count ? (strength > 0.6 ? "text-primary-foreground" : "text-foreground") : "bg-muted/60 text-muted-foreground"
                    } ${on ? "ring-2 ring-ring" : ""}`}
                    style={c.count ? { backgroundColor: `hsl(var(--primary) / ${strength.toFixed(2)})` } : undefined}
                  >
                    {showValues && c.count ? `${c.rate}%` : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <p className="min-h-4 text-muted-foreground" aria-live="polite">
          {readout}
        </p>
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground" aria-hidden>
          Lower
          <span className="h-2 w-16 rounded-full" style={{ backgroundImage: "linear-gradient(to right, hsl(var(--primary) / 0.15), hsl(var(--primary)))" }} />
          Higher
        </span>
      </div>
    </div>
  );
}
