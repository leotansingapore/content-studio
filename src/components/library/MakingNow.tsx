// "Making now" on /library: what is being made right now, each job linking to the page where it runs, and the five
// newest things made. Jobs live outside React (one module each), so leaving the page never stops one; this only
// listens. A later job kind adds one mapper in library.ts and one subscription in useLibraryJobs.

import { useEffect, useId, useMemo, useReducer } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Clock, Download, FileText, Film, GalleryHorizontal, Image as ImageIcon, Loader2, Shuffle } from "lucide-react";
import { imageJob, onImageJob } from "@/lib/aiImage";
import { aiJob, onAiJob, pendingAvatar } from "@/lib/aiVideo";
import { aiJobs, exportJobs, FORMAT_LABELS, imageJobs, joinJobs, madeCount, montageJobs, remixJobs, slideshowJobs, wallJobs, type LibraryItem, type LibraryJob } from "@/lib/library";
import { montageJob, onMontageJob } from "@/lib/montage";
import { onRemixJob, remixJob } from "@/lib/remixJob";
import { ago } from "@/lib/slideshow";
import { onSlideshowJob, slideshowJob } from "@/lib/slideshowJob";
import { currentJoin, exportJob, onExportJob, onJoinJob } from "@/lib/videoMedia";
import { onWallJob, wallJob } from "@/lib/wallJob";
import { cn } from "@/lib/utils";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const FORMAT_ICON = { text: FileText, carousel: GalleryHorizontal, video: Film, image: ImageIcon };
/** A row's icon by kind: an export and a montage have their own, the rest show what they make. */
const iconOf = (j: LibraryJob) => (j.kind === "export" ? Download : j.kind === "montage" ? Shuffle : FORMAT_ICON[j.format]);

/** Every job the library shows, current within a frame of its change. `base`: the page a Remix row reopens the sheet over. */
export function useLibraryJobs(base: string): LibraryJob[] {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const offs = [onAiJob(bump), onMontageJob(bump), onImageJob(bump), onExportJob(bump), onJoinJob(bump), onRemixJob(bump), onSlideshowJob(bump), onWallJob(bump)];
    return () => offs.forEach((off) => void off());
  }, []);
  const key = JSON.stringify([
    ...aiJobs(aiJob(), pendingAvatar()),
    ...montageJobs(montageJob()),
    ...imageJobs(imageJob()),
    ...exportJobs(exportJob()),
    ...joinJobs(currentJoin()),
    ...remixJobs(remixJob(), base),
    ...slideshowJobs(slideshowJob()),
    ...wallJobs(wallJob()),
  ]);
  // the same list keeps the same array, so the page rebuilds only when a job really changed
  return useMemo(() => JSON.parse(key) as LibraryJob[], [key]);
}

export default function MakingNow({ items, jobs, className }: { items: LibraryItem[]; jobs: LibraryJob[]; className?: string }) {
  const making = jobs.filter((j) => j.state === "working").length;
  const rows = jobs.filter((j) => j.state !== "ready");
  const recent = items.filter((i) => i.status !== "making" && i.status !== "failed").slice(0, 5);
  const heading = useId();
  return (
    <section aria-labelledby={heading} className={cn("space-y-4", className)}>
      <div>
        <h2 id={heading} className="font-serif text-lg font-semibold">
          Making now
        </h2>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {making ? `${making} making` : "Nothing making now"} | {madeCount(items)} made
        </p>
      </div>
      {rows.length > 0 && (
        <ul className="space-y-1">
          {rows.map((j) => {
            const failed = j.state === "failed";
            const Icon = failed ? AlertCircle : iconOf(j);
            return (
              <li key={j.kind}>
                <Link to={j.href} className={cn("flex items-start gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted/60", TOUCH)}>
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", failed ? "text-destructive" : "text-primary")} aria-hidden />
                  <span className="min-w-0">
                    <span className="block font-medium">{j.label}</span>
                    <span className={cn("flex items-start gap-1 text-xs", failed ? "text-destructive" : "text-muted-foreground")}>
                      {!failed && (j.waiting ? <Clock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> : <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin" aria-hidden />)}
                      <span className="min-w-0">{failed ? j.error || "That didn't go through." : j.step}</span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {recent.length > 0 && (
        <div className="space-y-1">
          <h3 className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Recent</h3>
          <ul>
            {recent.map((i) => (
              <li key={i.key}>
                <Link to={i.href} className={cn("block rounded-md px-2 py-1.5 hover:bg-muted/60", TOUCH)}>
                  <span className="block truncate text-sm">{i.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {FORMAT_LABELS[i.format]} | {ago(i.at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
