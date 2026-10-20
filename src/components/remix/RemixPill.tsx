import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Loader2, Shuffle, X } from "lucide-react";
import { clearRemixJob, onRemixJob, remixJob, runParams } from "@/lib/remixJob";

// A remix keeps running while you use other pages; this says so, and offers the draft when it is ready. It sits
// one row above ExportPill so the two never overlap, and hides while the sheet for the same remix is open.
export default function RemixPill() {
  const { pathname, search } = useLocation();
  const [job, setJob] = useState(remixJob);
  useEffect(() => {
    const off = onRemixJob(setJob);
    return () => {
      off();
    };
  }, []);
  const params = new URLSearchParams(search);
  if (!job || params.get("remix") === job.key) return null;
  for (const [k, v] of Object.entries(runParams(job.key, job.run))) {
    if (v) params.set(k, v);
    else params.delete(k);
  }
  const sheet = `${pathname}?${params}`;
  const ready = job.rows.find((r) => r.state === "done");
  return (
    <div
      role="status"
      className="fixed bottom-32 left-4 z-40 flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-2 text-xs [@media(pointer:coarse)]:py-0 font-semibold shadow-elegant lg:bottom-16 lg:left-[calc(var(--nav-w)+1rem)]"
    >
      {job.state === "working" && (
        <Link to={sheet} className="flex items-center gap-2 [@media(pointer:coarse)]:min-h-11">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Remixing...
        </Link>
      )}
      {job.state === "done" && ready?.href && (
        <>
          <Shuffle className="h-3.5 w-3.5 text-primary" /> Your remix is ready
          <Link to={ready.href} onClick={clearRemixJob} className="inline-flex items-center justify-center text-primary hover:underline [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11">
            Open
          </Link>
        </>
      )}
      {job.state === "failed" && (
        <Link to={sheet} className="inline-flex items-center text-destructive [@media(pointer:coarse)]:min-h-11">
          Your remix didn't go through
        </Link>
      )}
      {job.state !== "working" && (
        <button type="button" onClick={clearRemixJob} aria-label="Dismiss" className="flex items-center justify-center rounded-full p-0.5 text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
