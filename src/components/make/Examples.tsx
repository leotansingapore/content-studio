// A video format's examples on its page (/make/<slug>): every clip it has (exampleClips), playing silently while motion
// is allowed, each with controls so it can be paused. A format whose clips carry sound (`sound`) offers Play with sound
// under each: it plays that one from the start with its sound and silences the others.
import { useRef, useState } from "react";
import { SpeakerHighIcon, SpeakerSlashIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { exampleClips, type FormatDef } from "@/data/formats";
import { cn } from "@/lib/utils";

const MOTION = "(hover: hover) and (prefers-reduced-motion: no-preference)";

export default function Examples({ f, card }: { f: Pick<FormatDef, "slug" | "name" | "examples" | "sound">; card: string }) {
  const clips = exampleClips(f);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);
  const [loud, setLoud] = useState<number | null>(null);
  const plays = typeof window !== "undefined" && !!window.matchMedia?.(MOTION).matches;
  const press = (i: number) => {
    const off = loud === i;
    videos.current.forEach((v, j) => v && (v.muted = off || j !== i));
    setLoud(off ? null : i);
    const v = videos.current[i];
    if (off || !v) return;
    v.currentTime = 0;
    void v.play().catch(() => undefined);
  };
  return (
    <figure className="space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground">{clips.length > 1 ? "Examples" : "Example"}</p>
      <div className="flex flex-wrap gap-2">
        {clips.map((c, i) => (
          <div key={c.src} className={cn("space-y-1.5", card)}>
            <div className="aspect-[9/16] overflow-hidden rounded-lg border border-border/60 bg-muted shadow-card">
              <video
                ref={(el) => void (videos.current[i] = el)}
                src={c.src}
                poster={c.poster}
                muted
                loop
                playsInline
                autoPlay={plays}
                controls
                aria-label={clips.length > 1 ? `${f.name} example ${i + 1}` : `${f.name} example`}
                // the controls' own mute button keeps Play with sound in step
                onVolumeChange={(e) => {
                  // read now: the event's target is gone by the time the updater runs
                  const muted = e.currentTarget.muted;
                  setLoud((l) => (muted ? (l === i ? null : l) : i));
                }}
                className="h-full w-full object-cover"
              />
            </div>
            {f.sound && (
              <Button type="button" size="sm" variant="outline" aria-pressed={loud === i} onClick={() => press(i)} className="w-full gap-1 px-2 text-xs [@media(pointer:coarse)]:min-h-11">
                {loud === i ? <SpeakerSlashIcon className="h-3.5 w-3.5" aria-hidden /> : <SpeakerHighIcon className="h-3.5 w-3.5" aria-hidden />}
                {loud === i ? "Mute" : "Play with sound"}
              </Button>
            )}
          </div>
        ))}
      </div>
    </figure>
  );
}
