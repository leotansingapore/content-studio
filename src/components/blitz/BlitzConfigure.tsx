// Configure on /blitz (?configure=1, Leo's sign-ins), after Fastlane's Configure Blitz (11 Nov walk). Only the
// settings our slideshow and wall-of-text makers have an option for: where cards come from (Change mix), the content
// mix, the remix ratio (a source or one of your ideas), the own-media mix (the slideshow's Media pictures) and slide
// rules (the slideshow's photo mood). Each change saves at once and shapes the next deck.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { candidatesOf, loadBlitz, saveMix, SOURCE_KINDS, SOURCE_LABELS, type BlitzMix } from "@/lib/blitz";
import { loadPools } from "@/lib/blitzJob";
import { links } from "@/lib/links";
import { loadMedia } from "@/lib/mediaLibrary";
import { PHOTO_MOOD_IDS, PHOTO_MOODS } from "@/lib/slideshowJob";

const HEAD = "text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const RANGE = "h-11 w-full cursor-pointer accent-primary sm:h-6";

function Slider({ id, label, value, onChange, disabled, children }: { id: string; label: string; value: number; onChange: (v: number) => void; disabled?: boolean; children?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className={HEAD}>{label}</label>
        <span className="text-sm font-semibold tabular-nums">{value}%</span>
      </div>
      {children}
      <input id={id} type="range" min={0} max={100} step={10} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className={RANGE} />
    </div>
  );
}

export default function BlitzConfigure({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [mix, setMix] = useState<BlitzMix>(() => loadBlitz(userId).mix);
  const counts = useMemo(() => {
    const all = candidatesOf(loadPools(userId));
    return Object.fromEntries(SOURCE_KINDS.map((k) => [k, all.filter((c) => c.kind === k).length]));
  }, [userId]);
  const media = useMemo(() => loadMedia(userId).length, [userId]);
  const change = (patch: Partial<BlitzMix>) => {
    const next = { ...mix, ...patch };
    setMix(next);
    saveMix(userId, next);
  };

  return (
    <section id="configure" aria-label="Configure Blitz" className="space-y-5 rounded-xl border border-border/60 p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-serif text-lg font-semibold">Configure Blitz</h2>
          <p className="text-sm text-muted-foreground">Changes apply to the next deck.</p>
        </div>
        <Button variant="ghost" size="icon" className="shrink-0" aria-label="Close Configure" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <p className={HEAD}>Remix from</p>
        <div className="flex flex-wrap gap-2">
          {SOURCE_KINDS.map((k) => (
            <FilterChip key={k} active={mix.sources[k]} count={counts[k]} onClick={() => change({ sources: { ...mix.sources, [k]: !mix.sources[k] } })}>
              {SOURCE_LABELS[k]}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Slider id="bz-mix" label="Content mix" value={mix.slideshow} onChange={(v) => change({ slideshow: v })}>
          <p className="text-sm text-muted-foreground">Slideshow {mix.slideshow}%, wall of text {100 - mix.slideshow}%</p>
        </Slider>
        <Slider id="bz-remix" label="Remix ratio" value={mix.remix} onChange={(v) => change({ remix: v })}>
          <p className="text-sm text-muted-foreground">
            Remixed {mix.remix}%, from <Link to={links.ideas()} className="text-primary hover:underline">your ideas</Link> {100 - mix.remix}%
          </p>
        </Slider>
        <Slider id="bz-own" label="Own-media mix" value={media ? mix.own : 0} disabled={!media} onChange={(v) => change({ own: v })}>
          <p className="text-sm text-muted-foreground">
            {media ? `Slideshow pictures from your Media ${mix.own}%, stock ${100 - mix.own}%` : "Your Media has no pictures yet. "}
            {!media && <Link to={links.media()} className="text-primary hover:underline">Add some</Link>}
          </p>
        </Slider>
        <div className="space-y-2">
          <p className={HEAD}>Slide rules</p>
          <div className="flex flex-wrap gap-2">
            <FilterChip active={!mix.mood} onClick={() => change({ mood: "" })}>A picture per slide</FilterChip>
            {PHOTO_MOOD_IDS.map((m) => (
              <FilterChip key={m} active={mix.mood === m} onClick={() => change({ mood: m })}>
                {PHOTO_MOODS[m].label}
              </FilterChip>
            ))}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Green screen and hook demo videos, smart text positioning and caption styles aren't in Blitz yet.</p>
    </section>
  );
}
