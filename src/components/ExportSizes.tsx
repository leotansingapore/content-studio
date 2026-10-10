// Export in several sizes: tick the shapes, and one run exports each in turn
// through videoMedia's export queue (so it keeps going on other pages), names
// each file by its shape and reads each file back with the export check.

import { useEffect, useState } from "react";
import { Check, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtBytes, type EditSettings } from "@/lib/videoEdit";
import { currentVersion, versionPlan, type VersionPlan } from "@/lib/exportVersions";
import { exportJob, exportQueue, onExportJob, stopExportQueue } from "@/lib/videoMedia";

export default function ExportSizes({ projectId, name, settings, seconds, srcW, srcH, onExport }: {
  projectId: string;
  name: string;
  settings: EditSettings;
  /** How long the edit runs, end card included. */
  seconds: number;
  srcW: number;
  srcH: number;
  /** Starts the run; each version's queue id is `${projectId}/${version id}`. */
  onExport: (list: VersionPlan[]) => void;
}) {
  // the export store lives outside React: re-read it whenever it changes
  const [, setTick] = useState(0);
  useEffect(() => {
    const off = onExportJob(() => setTick((t) => t + 1));
    return () => { off(); };
  }, []);
  // null = only the shape the edit is in, until something is ticked
  const [ticked, setTicked] = useState<string[] | null>(null);
  const plan = versionPlan(settings, name, seconds, srcW, srcH);
  const cur = currentVersion(settings);
  const on = ticked ?? (cur ? [cur] : []);
  const list = plan.filter((p) => on.includes(p.id));
  const job = exportJob();
  const queue = exportQueue();
  const ours = !!queue && queue.ids.some((id) => id.startsWith(`${projectId}/`));
  const pct = job?.state === "running" ? Math.round(job.progress * 100) : null;

  return (
    <section aria-label="More sizes" className="space-y-2 rounded-xl border border-border/70 p-3">
      <ul className="space-y-1">
        {plan.map((p) => {
          const id = `${projectId}/${p.id}`;
          const file = ours ? queue.files[id] : undefined;
          const failed = ours ? queue.failed[id] : undefined;
          const check = ours ? queue.checks[id] : undefined;
          const now = ours && queue.running && queue.ids[queue.at - 1] === id && !file;
          return (
            <li key={p.id} className="space-y-1">
              <div className="flex flex-wrap items-center gap-x-3">
                <label className="mr-auto flex min-h-11 cursor-pointer items-center gap-2 text-sm sm:min-h-9">
                  <input type="checkbox" checked={on.includes(p.id)} onChange={(e) => setTicked(e.target.checked ? [...on, p.id] : on.filter((x) => x !== p.id))} className="h-4 w-4 accent-primary" />
                  {p.label}
                  <span className="text-xs text-muted-foreground">{fmtBytes(p.size.bytes)}</span>
                </label>
                {/* on a phone the result sits under its size, so every row reads the same */}
                <span className="flex basis-full items-center gap-3 pl-6 text-xs empty:hidden sm:basis-auto sm:pl-0">
                  {now && <span className="text-muted-foreground">Exporting{pct !== null ? ` ${pct}%` : "..."}</span>}
                  {failed && <span className="text-destructive">Couldn't export: {failed}</span>}
                  {file && (!check ? <span className="text-muted-foreground">Checking...</span> : check.issues.length ? null : check.read ? <span className="flex items-center gap-1"><Check className="h-3.5 w-3.5 text-success" /> Checked</span> : <span className="text-muted-foreground">Couldn't check</span>)}
                  {file && <a href={file.url} download={`${p.name}-edited.${file.ext}`} className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-2 hover:underline sm:min-h-0">Download</a>}
                </span>
              </div>
              {check?.issues.map((i) => <p key={i.id} className="rounded-md border border-warning/50 bg-warning/10 px-2 py-1.5 text-xs">{i.text}</p>)}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3" aria-live="polite">
        {ours && queue.running ? (
          <>
            <p className="mr-auto text-sm font-medium">
              Exporting {queue.at} of {queue.of}{pct !== null ? `, ${pct}%` : ""}
              <span className="block text-xs font-normal text-muted-foreground">You can use other pages; keep this tab in front.</span>
            </p>
            <Button size="sm" variant="outline" className="h-11 sm:h-9" onClick={stopExportQueue} disabled={queue.stopping}>
              {queue.stopping ? "Stopping after this one..." : "Stop after this one"}
            </Button>
          </>
        ) : (
          <>
            {ours && <p className="mr-auto text-sm font-medium">{Object.keys(queue.files).length} of {queue.of} exported{queue.stopping ? ", stopped" : ""}</p>}
            <Button size="sm" variant="outline" className="ml-auto h-11 gap-1.5 sm:h-9" onClick={() => onExport(list)} disabled={!list.length || job?.state === "running" || !!queue?.running}>
              <Download className="h-3.5 w-3.5" /> Export {list.length} {list.length === 1 ? "size" : "sizes"}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
