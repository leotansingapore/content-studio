import { useState } from "react";
import { Play } from "lucide-react";
import { embedUrlFor } from "@/lib/embed";

// Click-to-play: a grid of eight third-party players would load several MB of
// script up front, so each one loads only when someone taps it.
export default function VideoEmbed({ url, label }: { url: string | null | undefined; label?: string }) {
  const [playing, setPlaying] = useState(false);
  const src = embedUrlFor(url);
  if (!src) return null;
  return (
    <div className="relative mx-auto aspect-[9/16] w-full max-w-[260px] overflow-hidden rounded-xl border border-border/60 bg-muted/40">
      {playing ? (
        <iframe
          src={src}
          title={label ?? "Video"}
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
