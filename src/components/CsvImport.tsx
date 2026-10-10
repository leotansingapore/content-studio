// My posts: import post ideas or drafts from a CSV file. Pick a file, check every
// row's problems, then the row, date, time and platform summary, and import on confirm.
import { useRef, useState } from "react";
import { Download, FileUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_DRAFTS, type DraftEntry } from "@/lib/draftHistory";
import { exampleCsv, importDrafts, MAX_IMPORT_ROWS, planImport, PLATFORM_NAME, type ImportPlan } from "@/lib/csvImport";
import { localDateKey, timeLabel } from "@/lib/dueDates";
import type { PlanPlatform } from "@/lib/positioning";

const MAX_FILE_BYTES = 2_000_000;

const dayLabel = (day: string) => {
  const d = new Date(`${day}T00:00:00`);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts);
};

export default function CsvImport({
  posts,
  defaultPlatform,
  onImport,
  onClose,
}: {
  /** What My posts holds now: for the room left and the times already taken. */
  posts: DraftEntry[];
  defaultPlatform: PlanPlatform;
  /** Saves the drafts; the panel closes after. */
  onImport: (drafts: DraftEntry[]) => void;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const room = Math.max(0, MAX_DRAFTS - posts.length);

  const read = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    const fail = (msg: string) => {
      setPlan(null);
      setError(msg);
    };
    if (file.size > MAX_FILE_BYTES) return fail("That file is over 2 MB. Split it into smaller files.");
    const next = planImport(await file.text(), defaultPlatform, room, new Date(), posts);
    if (!next.rows.some((r) => !r.skip)) return fail("No posts found in that file. It needs a hook or text column.");
    setFileName(file.name);
    setPlan(next);
  };

  const downloadExample = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([exampleCsv(localDateKey())], { type: "text/csv" }));
    a.download = "content-studio-import-example.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };

  const fits = plan?.rows.filter((r) => r.fits).length ?? 0;
  const noRoom = plan?.rows.filter((r) => !r.skip && !r.fits).length ?? 0;
  const problems = (plan?.rows ?? [])
    .map((r) => ({ row: r.row, notes: r.skip ? [r.skip] : r.fits ? r.notes : ["No room left"] }))
    .filter((p) => p.notes.length);

  return (
    <div className="space-y-3 rounded-xl border border-primary/30 bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold text-foreground">{plan ? `Import from ${fileName}` : "Import posts from a CSV"}</h2>
        <button type="button" onClick={onClose} aria-label="Close import" className="-m-2 p-2 text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:-m-3.5 [@media(pointer:coarse)]:p-3.5">
          <X className="h-4 w-4" />
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          void read(e.target.files?.[0]);
          e.target.value = ""; // picking the same file again still reads it
        }}
      />

      {!plan ? (
        <>
          <p className="text-sm text-muted-foreground">
            Columns: hook or topic, then text, platform, date (YYYY-MM-DD), time (9:30 or 9:30pm), media link and
            hashtags, all optional. Up to {MAX_IMPORT_ROWS} rows.
          </p>
          {room === 0 ? (
            <p className="text-sm font-medium text-warning">My posts is full ({MAX_DRAFTS} posts). Delete some to make room.</p>
          ) : (
            room < MAX_IMPORT_ROWS && <p className="text-xs text-muted-foreground">My posts has room for {room} more.</p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => input.current?.click()} disabled={room === 0} className="gap-1.5">
              <FileUp className="h-4 w-4" /> Choose CSV file
            </Button>
            <Button variant="ghost" size="sm" onClick={downloadExample} className="gap-1.5 text-xs">
              <Download className="h-3.5 w-3.5" /> Download example CSV
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-foreground">
            {fits} post{fits === 1 ? "" : "s"} ready
            {problems.length ? `, ${problems.length} row${problems.length === 1 ? "" : "s"} to check` : ""}
            {noRoom ? `. ${noRoom} won't fit: My posts holds ${MAX_DRAFTS}.` : "."}
          </p>
          {plan.skipped > 0 && (
            <p className="text-xs text-warning">
              Only the first {MAX_IMPORT_ROWS} rows are read; {plan.skipped} more were left out.
            </p>
          )}
          {problems.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-warning/30 bg-warning/[0.06] p-2.5 text-xs">
              {problems.map((p) => (
                <li key={p.row} className="text-foreground">
                  <span className="font-semibold tabular-nums">Row {p.row}:</span> {p.notes.join(". ")}
                </li>
              ))}
            </ul>
          )}
          <div className="max-h-96 overflow-y-auto rounded-lg border border-border/60">
            <table className="w-full table-fixed text-left text-xs">
              <thead className="sticky top-0 bg-muted text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>
                  <th className="w-7 px-1.5 py-1.5 font-semibold">#</th>
                  <th className="px-1.5 py-1.5 font-semibold">Post</th>
                  <th className="w-[3.75rem] px-1.5 py-1.5 font-semibold">Date</th>
                  <th className="w-[3.75rem] px-1.5 py-1.5 font-semibold">Time</th>
                  <th className="w-[4.5rem] px-1.5 py-1.5 font-semibold">Platform</th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.map((r) => (
                  <tr key={r.row} className={`border-t border-border/50 align-top ${r.fits ? "" : "opacity-50"}`}>
                    <td className="px-1.5 py-1.5 tabular-nums text-muted-foreground">{r.row}</td>
                    <td className="min-w-0 px-1.5 py-1.5">
                      <p className="truncate font-medium text-foreground">{r.skip ? "Left out" : r.hook || r.text.split("\n")[0]}</p>
                      {r.hook && r.text && <p className="truncate text-muted-foreground">{r.text.replace(/\s+/g, " ")}</p>}
                    </td>
                    <td className="px-1.5 py-1.5 text-muted-foreground">{r.skip ? "" : r.date ? dayLabel(r.date) : "Draft"}</td>
                    <td className="px-1.5 py-1.5 tabular-nums text-muted-foreground">{r.time ? timeLabel(r.time) : ""}</td>
                    <td className="truncate px-1.5 py-1.5 text-muted-foreground">{r.skip ? "" : PLATFORM_NAME[r.platform]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button variant="ghost" size="sm" onClick={() => input.current?.click()} className="text-xs sm:mr-auto">
              Choose another file
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => onImport(importDrafts(plan).slice(0, room))} disabled={fits === 0}>
              Import {fits} post{fits === 1 ? "" : "s"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
