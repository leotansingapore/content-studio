// A format's example, as Fastlane's format cards show theirs (13 Nov, "Playing, muted"): the poster, and for a video
// format its silent clip playing while the card is on screen. The clip loads only once the card nears the screen and
// pauses when it leaves; with reduced motion it plays on hover or focus only. A missing poster draws `fallback`.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SpeakerXIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

const CALM = "(prefers-reduced-motion: reduce)";

export default function FormatPreview({ slug, video = false, poster = `/formats/${slug}.webp`, fallback = null, active = false, className }: {
  slug: string;
  /** A video format with a clip at /formats/<slug>.mp4. */
  video?: boolean;
  poster?: string;
  fallback?: ReactNode;
  /** The card is hovered or focused: plays even under reduced motion. */
  active?: boolean;
  className?: string;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const clip = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [seen, setSeen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [broken, setBroken] = useState(false);
  const calm = typeof window !== "undefined" && !!window.matchMedia?.(CALM).matches;

  useEffect(() => {
    const el = box.current;
    if (!video || !el) return;
    if (typeof IntersectionObserver === "undefined") return setNear(true);
    // near: start loading 300px early; seen: at least a third of the card on screen
    const load = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setNear(true), { rootMargin: "300px" });
    const view = new IntersectionObserver((e) => setSeen(e[e.length - 1].isIntersecting), { threshold: 0.35 });
    load.observe(el);
    view.observe(el);
    return () => {
      load.disconnect();
      view.disconnect();
    };
  }, [video]);

  const wanted = video && near && !broken && (active || (seen && !calm));
  useEffect(() => {
    const v = clip.current;
    if (!v) return;
    if (wanted) void v.play().catch(() => setPlaying(false));
    else v.pause();
  }, [wanted, near]);

  if (broken) return <>{fallback}</>;
  return (
    <span ref={box} className={cn("relative block h-full w-full", className)}>
      <img src={poster} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover object-top" />
      {video && near && (
        <video
          ref={clip}
          src={`/formats/${slug}.mp4`}
          poster={poster}
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden
          onPlaying={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          className={cn("absolute inset-0 h-full w-full object-cover object-top transition-opacity", playing ? "opacity-100" : "opacity-0")}
        />
      )}
      {playing && (
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[11px] font-medium text-foreground">
          <SpeakerXIcon className="h-3 w-3" aria-hidden /> Playing, muted
        </span>
      )}
    </span>
  );
}
