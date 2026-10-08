import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Download, X } from "lucide-react";
import { clearExportJob, exportJob, onExportJob, type ExportJob } from "@/lib/videoMedia";

// A video export keeps running while you use other pages; this says how far it
// has got, and offers the file when it is done. Hidden on the editor itself.
export default function ExportPill() {
  const { pathname } = useLocation();
  const [job, setJob] = useState<ExportJob | null>(exportJob());
  useEffect(() => {
    const off = onExportJob(setJob);
    return () => {
      off();
    };
  }, []);
  if (!job || pathname.startsWith("/edit")) return null;
  return (
    <div className="fixed bottom-20 left-4 z-40 flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-2 text-xs font-semibold shadow-elegant lg:bottom-6 lg:left-[calc(var(--nav-w)+1rem)]">
      {job.state === "running" && (
        <Link to="/edit" className="flex items-center gap-2">
          <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-muted">
            <span className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${Math.round(job.progress * 100)}%` }} />
          </span>
          Exporting {job.name} {Math.round(job.progress * 100)}%
        </Link>
      )}
      {job.state === "done" && job.url && (
        <a href={job.url} download={`${job.name}-edited.${job.ext}`} className="flex items-center gap-1.5 text-primary">
          <Download className="h-3.5 w-3.5" /> {job.name} is ready
        </a>
      )}
      {job.state === "failed" && <Link to="/edit" className="text-destructive">Export failed: open the editor</Link>}
      {job.state !== "running" && (
        <button type="button" onClick={clearExportJob} aria-label="Dismiss" className="rounded-full p-0.5 text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
