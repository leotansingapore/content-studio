// Chart cards in the video editor's stickers tab: bars or two numbers, typed by
// the adviser or started from a figure found in what they say (videoCharts.ts).
// Each shows for 4 s as its line is said and is burned into every export size.

import { useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { useToast } from "@/hooks/use-toast";
import { useFindFace } from "@/components/MotionControls";
import { CHART, MAX_CHARTS, MAX_LABEL, MAX_ROWS, MAX_TITLE, MAX_VALUE, chartValue, newChart, sanitizeCharts, shownRows, type Chart } from "@/lib/videoCharts";
import { cardText, chartOfFigure, findFigures, motionOf, outOfSpan } from "@/lib/videoMotion";
import { fmtTime, outAt, srcAt, type Caption, type EditSettings, type Segment } from "@/lib/videoEdit";

export default function ChartCards({ settings, caps, segs, speed, total, outT, file, apply, note, seekOut }: {
  settings: EditSettings;
  caps: Caption[];
  segs: Segment[];
  speed: number;
  total: number;
  /** The playhead, on the edited timeline. */
  outT: number;
  file: Blob | null | undefined;
  /** Merges into the latest settings, with Undo. */
  apply: (p: Partial<EditSettings>) => void;
  /** Merges a measured fact into the latest settings, without an Undo step. */
  note: (p: Partial<EditSettings>) => void;
  seekOut: (t: number) => void;
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const charts = sanitizeCharts(settings.charts);
  const shows = motionOf(settings, segs, caps, total).charts;
  const words = caps.flatMap((c) => c.words);
  const figures = findFigures(words).flatMap((fig) => {
    const at = outAt(segs, words[fig.start].s, speed);
    return at === null ? [] : [{ fig, at, text: `${cardText({ from: 0, land: 0, to: 0, fig }, 0, true)} ${fig.label}`.trim() }];
  });
  useFindFace(charts.length > 0, settings, file, total, note);

  const sel = charts.find((c) => c.id === selected) ?? null;
  const showOf = (c: Chart) => shows.find((x) => x.chart.id === c.id);
  const set = (next: Chart[]) => apply({ charts: next });
  const edit = (id: string, p: Partial<Chart>) => set(charts.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const add = (c: Chart, at: number) => {
    if (charts.length >= MAX_CHARTS) return toast({ title: `Up to ${MAX_CHARTS} charts on a video`, variant: "destructive" });
    set([...charts, c]);
    setSelected(c.id);
    // far enough in that every bar has grown
    seekOut(Math.min(Math.max(0, total - 0.1), at + 1.3));
  };
  const fromFigure = (f: (typeof figures)[number]) => add(chartOfFigure(f.fig, words), f.at);
  const atPlayhead = () => {
    const s = srcAt(segs, outT, speed);
    add(newChart(s, s + 0.5), outT);
  };
  const madeFrom = (f: (typeof figures)[number]) => charts.some((c) => Math.abs(c.s - Math.round(words[f.fig.start].s * 100) / 100) < 0.01);
  const setRow = (c: Chart, i: number, p: Partial<Chart["rows"][number]>) => edit(c.id, { rows: c.rows.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const noNumber = sel ? shownRows(sel).some((r) => chartValue(r.value) === null) : false;
  const firstEmpty = sel ? sel.rows.findIndex((r) => !r.label && !r.value) : -1;
  // why a chart with something in it is not on the edit
  const whyNot = (c: Chart) => {
    const at = outOfSpan(segs, c.s, c.e, speed);
    return at === null ? "Cut out" : total - Math.max(at - CHART.lead, 0) < CHART.min ? "Too near the end" : "Too close to another chart";
  };

  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm font-medium">Charts
          <InfoTip label="About charts">Shows for 4 seconds as you say the line.</InfoTip></span>
        <Button size="sm" variant="outline" className="h-11 gap-1.5 sm:h-9" onClick={atPlayhead}><Plus className="h-3.5 w-3.5" /> Add a chart</Button>
      </div>
      {figures.length > 0 && (
        <ul className="divide-y divide-border/60" aria-label="Numbers you say">
          {figures.map((f) => {
            const added = madeFrom(f);
            return (
              <li key={`${f.fig.start}`} className="flex items-center gap-2 py-1.5 text-xs">
                <button type="button" onClick={() => seekOut(f.at)} aria-label={`Go to ${fmtTime(f.at)}`}
                  className="min-h-11 w-12 shrink-0 text-left font-mono text-[11px] text-muted-foreground hover:text-foreground sm:min-h-0">{fmtTime(f.at)}</button>
                <span className="min-w-0 flex-1 truncate font-semibold">{f.text}</span>
                <Button size="sm" variant={added ? "ghost" : "outline"} className="h-11 shrink-0 gap-1 text-xs sm:h-8" disabled={added} onClick={() => fromFigure(f)}>
                  {added ? <><Check className="h-3.5 w-3.5" /> Added</> : "Make a chart"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {charts.length > 0 && (
        <ul className="divide-y divide-border/60 rounded-lg border border-border/60" aria-label="Charts on this video">
          {charts.map((c) => {
            const show = showOf(c);
            const rows = shownRows(c);
            return (
              <li key={c.id}>
                <button type="button" aria-pressed={c.id === selected}
                  onClick={() => { setSelected(c.id); if (show) seekOut(Math.min(show.to - 0.1, show.from + 1.6)); }}
                  className={`flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-xs sm:min-h-0 ${c.id === selected ? "bg-primary/5" : ""}`}>
                  <span className="min-w-0 flex-1 truncate font-medium">{c.title.trim() || rows.map((r) => [r.label, r.value].filter(Boolean).join(" ")).join(", ") || "New chart"}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{show ? `${fmtTime(show.from)}-${fmtTime(show.to)}` : rows.length ? whyNot(c) : "Empty"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {sel && (
        <div className="space-y-3 rounded-lg border border-primary/25 p-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Chart type">
            {([["bars", "Bars"], ["compare", "Two numbers"]] as const).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={sel.kind === k}
                onClick={() => edit(sel.id, k === "compare" ? { kind: k, rows: sel.rows.slice(0, 2) } : { kind: k })}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold [@media(pointer:coarse)]:min-h-11 ${sel.kind === k ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground"}`}>{label}</button>
            ))}
          </div>
          <input value={sel.title} maxLength={MAX_TITLE} placeholder="Title (optional)" aria-label="Chart title" onChange={(e) => edit(sel.id, { title: e.target.value })}
            className="h-11 w-full rounded-md border border-input bg-background px-2 text-sm sm:h-9" />
          <div className="space-y-2">
            {sel.rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={r.label} maxLength={MAX_LABEL} placeholder="Label" aria-label={`Label ${i + 1}`} autoFocus={i === firstEmpty}
                  onChange={(e) => setRow(sel, i, { label: e.target.value })}
                  className="h-11 w-0 min-w-0 flex-[3] rounded-md border border-input bg-background px-2 text-sm sm:h-9" />
                <input value={r.value} maxLength={MAX_VALUE} placeholder="Value" aria-label={`Value ${i + 1}`} inputMode="text"
                  onChange={(e) => setRow(sel, i, { value: e.target.value })}
                  className="h-11 w-0 min-w-0 flex-[2] rounded-md border border-input bg-background px-2 text-sm sm:h-9" />
                {sel.rows.length > 2 && (
                  <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0 text-muted-foreground sm:h-9 sm:w-9" aria-label={`Remove row ${i + 1}`}
                    onClick={() => edit(sel.id, { rows: sel.rows.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Button>
                )}
              </div>
            ))}
          </div>
          {noNumber && <p className="text-xs text-muted-foreground">A value with no number gets no bar.</p>}
          <div className="flex flex-wrap gap-2">
            {sel.kind === "bars" && sel.rows.length < MAX_ROWS && (
              <Button size="sm" variant="outline" className="h-11 gap-1.5 text-xs sm:h-8" onClick={() => edit(sel.id, { rows: [...sel.rows, { label: "", value: "" }] })}>
                <Plus className="h-3.5 w-3.5" /> Add a row
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-11 text-xs sm:h-8" onClick={() => { const s = srcAt(segs, outT, speed); edit(sel.id, { s, e: s + 0.5 }); }}>Start at {fmtTime(outT)}</Button>
            <Button size="sm" variant="ghost" className="h-11 gap-1.5 text-xs text-muted-foreground hover:text-destructive sm:h-8"
              onClick={() => { set(charts.filter((c) => c.id !== sel.id)); setSelected(null); }}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
