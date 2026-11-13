import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { CaretLeftIcon, SparkleIcon } from "@phosphor-icons/react";
import FormatTile from "@/components/make/FormatTile";
import PriceChip from "@/components/PriceChip";
import { Button } from "@/components/ui/button";
import { NEED_LINES, pageFor, type FormatDef } from "@/data/formats";
import { useUsesLeft } from "@/lib/aiUsage";
import { links } from "@/lib/links";
import { chipText, reasonText } from "@/lib/prices";
import NotFoundPage from "@/pages/NotFoundPage";

const LABEL = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const MOTION = "(hover: hover) and (prefers-reduced-motion: no-preference)";

export const needLine = (f: Pick<FormatDef, "needs">) => (f.needs ? `${NEED_LINES[f.needs]}.` : "Nothing extra needed.");

const VideoFormatPage = () => {
  const { format } = useParams();
  const def = pageFor(format);
  const leftOf = useUsesLeft(false);
  const navigate = useNavigate();
  const fromGallery = (useLocation().state as { back?: boolean } | null)?.back === true;
  if (!def?.opens) return <NotFoundPage />;
  const price = def.price();
  const plays = typeof window !== "undefined" && window.matchMedia(MOTION).matches;
  const left = def.cap ? leftOf(def.cap) : null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground">
          <Link
            to={links.make()}
            onClick={(e) => {
              if (!fromGallery) return;
              e.preventDefault();
              navigate(-1);
            }}
          >
            <CaretLeftIcon className="h-4 w-4" /> Videos
          </Link>
        </Button>
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">{def.name}</h1>
        <p className="text-sm text-muted-foreground">{def.blurb}</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <figure className="space-y-2">
          <p className={LABEL}>Example</p>
          <div className="aspect-[9/16] w-full max-w-[200px] overflow-hidden rounded-lg border border-border/60 bg-muted shadow-card sm:max-w-[300px]">
            {def.preview ? (
              <video
                src={`/formats/${def.slug}.mp4`}
                poster={`/formats/${def.slug}.webp`}
                muted
                loop
                playsInline
                autoPlay={plays}
                controls
                aria-label={`${def.name} example`}
                className="h-full w-full object-cover"
              />
            ) : (
              <FormatTile f={def} />
            )}
          </div>
        </figure>
        <div className="max-w-xl space-y-5">
          <div className="space-y-1">
            <p className={LABEL}>Works with</p>
            <p className="text-sm text-foreground">{needLine(def)}</p>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild className="gap-1.5 [@media(pointer:coarse)]:min-h-11">
                <Link to={def.opens()}>
                  <SparkleIcon className="h-4 w-4" /> Use this format
                </Link>
              </Button>
              {price === null ? <span className="text-[11px] text-muted-foreground">No AI cost</span> : <PriceChip price={price} left={null} />}
            </div>
            {left !== null && <p className={`min-h-4 text-xs tabular-nums ${left === 0 ? "font-medium text-destructive" : "text-muted-foreground"}`}>{chipText({ price: null, left, leo: false }).text}</p>}
            {left === 0 && <p className="text-xs text-muted-foreground">{reasonText({ left, leo: true })}</p>}
            <p className="text-xs text-muted-foreground">It opens in the video editor.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoFormatPage;
