import { Button } from "@/components/ui/button";
import { fmtTime } from "@/lib/videoEdit";
import { stopExport, type ExportJob } from "@/lib/videoMedia";

/** Under the Export button while it runs: how a real-time export has to be left, or the way to stop a fast one. */
export default function ExportRunning({ job, total }: { job: ExportJob; total: number }) {
  if (job.fast === false) {
    return (
      <p className="text-xs text-muted-foreground" aria-live="polite">
        Exporting in real time ({fmtTime(total)}). You can use other pages; keep this browser tab in front until it finishes.
      </p>
    );
  }
  if (!job.fast) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="mr-auto text-xs text-muted-foreground" aria-live="polite">You can use other pages while it exports.</p>
      <Button size="sm" variant="outline" onClick={stopExport} className="h-11 sm:h-9">Stop export</Button>
    </div>
  );
}
