// The format gallery (/make, Leo's sign-ins only; docs/north-star/items/formats-gallery.md): one card per ready
// entry in src/data/formats.ts, in group order, each with its price and today's uses left before anything is
// spent. A card opens its format's own page (formatHref). Filters live in the URL (?kind=, ?needs=none, replace).
// The page calls no AI and stores nothing; the only read is today's usage counts. While the brand has no saved demo,
// a card's "Needs a demo video" line links to /brand#demo-videos (beside the card's own link, never inside it).

import { useState } from "react";
import { Link } from "react-router-dom";
import { Clapperboard, Diamond, Image as ImageIcon, Layers, Type, VolumeX, type LucideIcon } from "lucide-react";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { FORMATS, NEED_LINES, filterFormats, formatHref, type FormatDef, type FormatKind } from "@/data/formats";
import { useUsesLeft } from "@/lib/aiUsage";
import { demoVideos } from "@/lib/demoVideos";
import { links } from "@/lib/links";
import { chipText } from "@/lib/prices";
import { useLeoUser } from "@/lib/useLeoOnly";
import { useUrlFlag, useUrlState, useUrlUpdate } from "@/lib/urlState";
import NotFoundPage from "@/pages/NotFoundPage";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";
const KIND_LABELS: Record<FormatKind | "all", string> = { all: "All", video: "Video", slides: "Slides", text: "Text", image: "Images" };
const KIND_ICONS: Record<FormatKind, LucideIcon> = { video: Clapperboard, slides: Layers, text: Type, image: ImageIcon };
const KINDS = ["all", "video", "slides", "text", "image"] as const;
// Array sort is stable, so each group keeps the registry's own order.
const READY = FORMATS.filter((f) => f.ready).sort((a, b) => a.group - b.group);
// a kind with no ready format gets no chip; a typed ?kind= for it still lands on the empty state
const KIND_CHIPS = KINDS.filter((k) => k === "all" || READY.some((f) => f.kind === k));
// a mouse, and motion allowed: phones and reduced motion keep the poster
const PLAYS = "(hover: hover) and (prefers-reduced-motion: no-preference)";

export default function MakePage() {
  const leo = useLeoUser();
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage />;
  return <Gallery userId={leo.id} />;
}

function Gallery({ userId }: { userId: string }) {
  const [kind, setKind] = useUrlState<(typeof KINDS)[number]>("kind", "all", { allowed: KINDS });
  const [needsNone, setNeedsNone] = useUrlFlag("needs", "none");
  const update = useUrlUpdate();
  const leftOf = useUsesLeft(false);
  const [noDemo] = useState(() => demoVideos(userId).length === 0);
  const shown = filterFormats(READY, { kind, needsNone });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
            Formats
            <span className="rounded-full bg-muted px-2 py-0.5 font-sans text-xs font-medium tabular-nums text-muted-foreground" aria-label={`${shown.length} shown`}>
              {shown.length}
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">Every format you can make. Pick one to start it.</p>
        </div>
        <p className="max-w-xs text-xs text-muted-foreground lg:text-right">Video prices are for the default length. A longer video costs more.</p>
      </header>

      <div role="group" aria-label="Filter formats" className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {KIND_CHIPS.map((k) => (
          <FilterChip key={k} active={kind === k} onClick={() => setKind(k)}>
            {KIND_LABELS[k]}
          </FilterChip>
        ))}
        <span className="mx-1 w-px shrink-0 self-stretch bg-border" aria-hidden />
        <FilterChip active={needsNone} onClick={() => setNeedsNone(!needsNone)}>
          Needs nothing extra
        </FilterChip>
      </div>

      {shown.length === 0 ? (
        <div className="space-y-3 rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">No formats match these filters.</p>
          <Button variant="outline" onClick={() => update({ kind: null, needs: null })} className={TOUCH}>
            Clear filters
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {shown.map((f) => (
            <li key={f.slug} className="flex min-w-0">
              <FormatCard f={f} left={f.cap ? leftOf(f.cap) : null} needsHref={f.needs === "demo-video" && noDemo ? links.brand({ section: "demo-videos" }) : undefined} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One format: poster or kind icon, name, line, price, uses left, what it needs. The whole card is one link; a need
 * with its own way forward (`needsHref`) sits just under it as a second link. */
function FormatCard({ f, left, needsHref }: { f: FormatDef; left: number | null; needsHref?: string }) {
  const [playing, setPlaying] = useState(false);
  const [broken, setBroken] = useState(false);
  const poster = !!f.preview && !broken;
  const play = () => poster && window.matchMedia(PLAYS).matches && setPlaying(true);
  const stop = () => setPlaying(false);
  const price = f.price();
  const Icon = KIND_ICONS[f.kind];
  const need = f.needs && (
    <>
      <Diamond className="h-3 w-3 shrink-0 fill-warning text-warning" aria-hidden /> {NEED_LINES[f.needs]}
    </>
  );
  const card = (
    <Link
      to={formatHref(f)}
      onMouseEnter={play}
      onMouseLeave={stop}
      onFocus={play}
      onBlur={stop}
      className="group flex w-full flex-col gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl border border-border/60 bg-muted transition-colors group-hover:border-primary/40">
        {poster ? (
          <img src={`/formats/${f.slug}.webp`} alt="" loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Icon className="h-8 w-8 text-muted-foreground/70" aria-hidden />
          </div>
        )}
        {playing && (
          <>
            <video src={`/formats/${f.slug}.mp4`} muted loop autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[11px] font-medium text-foreground">
              <VolumeX className="h-3 w-3" aria-hidden /> Muted preview
            </span>
          </>
        )}
      </div>
      <div className="min-w-0 space-y-1 px-0.5">
        <p className="text-sm font-semibold leading-snug text-foreground">{f.name}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{f.blurb}</p>
        <span className="inline-flex max-w-full rounded-full border border-border px-2 py-0.5">
          {price === null ? <span className="text-[11px] text-muted-foreground">No AI cost</span> : <PriceChip price={price} left={null} />}
        </span>
        {/* blank until today's count is read; "None left today" stays muted, since the card still opens */}
        {f.cap && <p className="min-h-4 text-[11px] tabular-nums text-muted-foreground">{chipText({ price: null, left, leo: false }).text}</p>}
        {need && !needsHref && <p className="flex items-center gap-1 text-[11px] text-muted-foreground">{need}</p>}
      </div>
    </Link>
  );
  if (!need || !needsHref) return card;
  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      {card}
      <Link to={needsHref} className={`flex items-center gap-1 self-start rounded px-0.5 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${TOUCH}`}>
        {need}
      </Link>
    </div>
  );
}
