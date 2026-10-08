import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Loader2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtTime } from "@/lib/videoEdit";
import {
  clipWriteUrl, findYoutubeClips, loadYoutubeClips, onYoutubeJob, watchUrl, youtubeJob,
  type YoutubeClips as Result, type YoutubeJob,
} from "@/lib/youtubeClips";

const STEP = { captions: "Reading the captions...", clips: "Finding the best moments..." };

/** Edit a video's start screen: paste a YouTube link, get its best clips from the captions. */
export default function YoutubeClips({ userId }: { userId: string | null }) {
  const [job, setJob] = useState<YoutubeJob | null>(youtubeJob());
  const [saved, setSaved] = useState<Result | null>(null);
  const [url, setUrl] = useState(job?.url ?? "");

  useEffect(() => onYoutubeJob(setJob), []);
  useEffect(() => setSaved(userId ? loadYoutubeClips(userId) : null), [userId]);

  const busy = job?.state === "captions" || job?.state === "clips";
  const result = job?.state === "done" ? job.result : saved;

  return (
    <section className="space-y-3 rounded-2xl border border-border/60 p-4">
      <h2 className="text-sm font-semibold">Find clips in a YouTube video</h2>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (userId && url.trim()) findYoutubeClips(userId, url.trim());
        }}
      >
        <Input type="url" inputMode="url" placeholder="Paste a YouTube link" aria-label="YouTube link" value={url}
          onChange={(e) => setUrl(e.target.value)} disabled={busy} className="h-11 sm:h-10" />
        <Button type="submit" variant="outline" disabled={busy || !userId || !url.trim()} className="h-11 shrink-0 sm:h-10">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {STEP[job.state]}</> : "Find clips"}
        </Button>
      </form>
      {job?.state === "failed" && <p role="alert" className="text-xs text-destructive">{job.error}</p>}
      {result && !busy && (
        <div className="space-y-2" aria-live="polite">
          <p className="text-xs text-muted-foreground">
            {result.clips.length} {result.clips.length === 1 ? "clip" : "clips"} from {result.title || "this video"}
          </p>
          <ul className="space-y-2">
            {result.clips.map((c) => (
              <li key={`${c.start}-${c.end}`} className="space-y-1.5 rounded-xl bg-secondary/50 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm font-semibold">
                    {typeof c.score === "number" && <span className="mr-1.5 rounded-md bg-background px-1.5 py-0.5 text-xs tabular-nums" aria-label={`Score ${c.score} out of 100`}>{c.score}</span>}
                    {c.title}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">{fmtTime(c.start)} to {fmtTime(c.end)}</span>
                </div>
                {c.reason && <p className="text-xs text-muted-foreground">{c.reason}</p>}
                {c.hook && <p className="text-xs">"{c.hook}"</p>}
                <div className="flex flex-wrap gap-2 pt-0.5">
                  <Button asChild size="sm" variant="outline" className="h-9">
                    <a href={watchUrl(result.videoId, c.start)} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Watch</a>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="h-9">
                    <Link to={clipWriteUrl(result, c)}><PenLine className="h-3.5 w-3.5" /> Write a post</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">To cut one into a reel, upload the video file above.</p>
        </div>
      )}
    </section>
  );
}
