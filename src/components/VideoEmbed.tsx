import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { embedUrlFor, originalUrlFor } from "@/lib/embed";
import { cn } from "@/lib/utils";

// A grid of third-party players would load several MB of script up front, so
// a player loads only when it is wanted: on a tap, straight away in a modal the
// viewer opened on purpose (autoPlay), or as its card nears the screen
// (whenVisible), so a feed shows the videos themselves without loading the lot.
export default function VideoEmbed({
  url,
  label,
  autoPlay = false,
  whenVisible = false,
  className,
}: {
  url: string | null | undefined;
  label?: string;
  autoPlay?: boolean;
  whenVisible?: boolean;
  className?: string;
}) {
  const [playing, setPlaying] = useState(autoPlay);
  const [loaded, setLoaded] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!whenVisible || playing || !box.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setPlaying(true);
        io.disconnect();
      }
    }, { rootMargin: "300px 0px" });
    io.observe(box.current);
    return () => io.disconnect();
  }, [whenVisible, playing]);
  const src = embedUrlFor(url);
  if (!src) return null;
  const site = src.startsWith("https://www.tiktok.com/") ? "TikTok" : "Instagram";
  const original = originalUrlFor(url);
  return (
    <div className="space-y-1">
    <div
      ref={box}
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
          scrolling="no"
          className="absolute inset-0 h-full w-full overflow-hidden"
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
    {playing && original && (
      // Its own background keeps it readable on a light card and on the black post modal alike.
      <a href={original} target="_blank" rel="noopener noreferrer" className="mx-auto block w-fit rounded-full bg-background px-3 py-1 text-[11px] font-medium text-foreground/80 hover:text-primary [@media(pointer:coarse)]:py-3.5">
        Not playing? Watch it on {site}
      </a>
    )}
    </div>
  );
}
