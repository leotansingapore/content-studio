import { useState } from "react";
import { Play } from "lucide-react";
import { embedUrlFor } from "@/lib/embed";
import { cn } from "@/lib/utils";

// Click-to-play: a grid of eight third-party players would load several MB of
// script up front, so each one loads only when someone taps it. A modal the
// viewer opened on purpose passes autoPlay to load the player straight away.
export default function VideoEmbed({
  url,
  label,
  autoPlay = false,
  className,
}: {
  url: string | null | undefined;
  label?: string;
  autoPlay?: boolean;
  className?: string;
}) {
  const [playing, setPlaying] = useState(autoPlay);
  const [loaded, setLoaded] = useState(false);
  const src = embedUrlFor(url);
  if (!src) return null;
  return (
    <div
      className={cn(
        "relative mx-auto aspect-[9/16] w-full max-w-[260px] overflow-hidden rounded-xl border border-border/60 bg-muted/40",
        className,
      )}
    >
      {playing && !loaded && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs font-semibold text-white/80" aria-live="polite">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          Loading the video...
        </span>
      )}
      {playing ? (
        <iframe
          src={src}
          title={label ?? "Video"}
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 h-full w-full"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm font-semibold text-foreground/80 transition-colors hover:bg-muted/60"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-elegant">
            <Play className="h-6 w-6 translate-x-0.5" />
          </span>
          Watch the video
        </button>
      )}
    </div>
  );
}
