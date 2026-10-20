// One card on /library: a thumb drawn only once it is on screen, "<Format> | <title>", the status line and Open,
// plus Schedule on a ready post and Try again on a failure. Thumbs are memoised by id and updatedAt.

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ExternalLink, Film, Loader2 } from "lucide-react";
import { SlideThumb } from "@/components/slideshow/SlideCanvas";
import { Button } from "@/components/ui/button";
import type { CarouselBrand, SavedCarousel } from "@/lib/carousel";
import { layoutSlide, readableOn, renderSvg } from "@/lib/carouselLayout";
import { createCanvasMeasure, svgDataUrl } from "@/lib/carouselRender";
import { getFile } from "@/lib/deviceFiles";
import { FORMAT_LABELS, statusLine, type LibraryItem } from "@/lib/library";
import type { Slideshow } from "@/lib/slideshow";
import { lookOf } from "@/lib/slideshowDraw";
import { platformName } from "@/lib/socialConnect";
import { cn } from "@/lib/utils";

const TOUCH = "[@media(pointer:coarse)]:min-h-11";

/** True once the element has come within a screen of view; it stays true. */
function useOnScreen<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") return setSeen(true);
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setSeen(true), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

const readDataUrl = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => resolve("");
    r.readAsDataURL(blob);
  });

let measure: ReturnType<typeof createCanvasMeasure> | null = null;
const slides = new Map<string, Promise<string>>();
/** A carousel's first slide as an image, the way /carousel draws it; a picture not on this device is left out. */
function firstSlide(c: SavedCarousel, brand: CarouselBrand): Promise<string> {
  const key = `${c.id}|${c.updatedAt}|${brand.color}|${brand.name}|${brand.handle}`;
  if (!slides.has(key))
    slides.set(
      key,
      (async () => {
        const s = c.slides[0];
        const blob = s.image ? await getFile(s.image).catch(() => undefined) : undefined;
        const image = blob ? (await readDataUrl(blob)) || undefined : undefined;
        measure ??= createCanvasMeasure();
        return svgDataUrl(renderSvg(layoutSlide({ title: s.title, body: s.body, index: 0, total: c.slides.length, brand, image, align: c.align, scale: c.scale, font: c.font, paper: c.paper }, measure)));
      })(),
    );
  return slides.get(key)!;
}

const onDevice = new Map<string, Promise<boolean>>();
const fileHere = (key: string) => {
  if (!onDevice.has(key)) onDevice.set(key, getFile(key).then((f) => !!f, () => false));
  return onDevice.get(key)!;
};

function CarouselThumb({ c, brand }: { c: SavedCarousel; brand: CarouselBrand }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let live = true;
    void firstSlide(c, brand).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [c, brand]);
  return url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full animate-pulse bg-muted" />;
}

function MediaThumb({ mediaKey }: { mediaKey: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let made = "";
    void getFile(mediaKey)
      .catch(() => undefined)
      .then((b) => {
        if (!live) return;
        made = b ? URL.createObjectURL(b) : "";
        setUrl(made);
      });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [mediaKey]);
  if (url === null) return <div className="h-full w-full animate-pulse bg-muted" />;
  return url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-muted" />;
}

function LibraryCard({ item, brand, carousel, show, userId, fontsReady }: { item: LibraryItem; brand: CarouselBrand; carousel?: SavedCarousel; show?: Slideshow; userId: string; fontsReady: boolean }) {
  const [ref, seen] = useOnScreen<HTMLDivElement>();
  const [here, setHere] = useState(true);
  useEffect(() => {
    if (!seen || !item.file || item.format !== "video") return;
    let live = true;
    void fileHere(item.file).then((h) => live && setHere(h));
    return () => {
      live = false;
    };
  }, [seen, item.file, item.format]);
  const t = item.thumb;
  const look = useMemo(() => (show ? lookOf(userId, show) : null), [userId, show]);
  const thumb = useMemo(() => {
    if (!seen) return t ? <div className="h-full w-full bg-muted" /> : null;
    if (t?.kind === "slide" && carousel) return <CarouselThumb c={carousel} brand={brand} />;
    if (t?.kind === "show" && show && look) return <SlideThumb slide={show.slides[0]} size={show.size} look={look} ready={fontsReady} className="h-full w-full rounded-none object-cover" />;
    if (t?.kind === "url") return <img src={t.url} alt="" loading="lazy" className="h-full w-full object-cover" />;
    if (t?.kind === "media") return <MediaThumb mediaKey={t.key} />;
    return null;
  }, [seen, t, carousel, show, look, brand, fontsReady]);
  const making = item.status === "making";
  const failed = item.status === "failed";
  // a job has nothing to show yet; a post that failed to go out still shows its words
  const pending = item.key.startsWith("j:") && (making || failed);

  return (
    <article className="flex w-full min-w-0 flex-col gap-2">
      <Link to={item.href} tabIndex={-1} aria-hidden className={cn("relative block overflow-hidden rounded-lg border border-border/60 bg-muted", item.format === "video" ? "aspect-[9/16]" : "aspect-[4/5]")}>
        <div ref={ref} className="h-full w-full">
          {thumb ??
            (pending ? (
              <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                {making ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <AlertCircle className="h-6 w-6 text-destructive" />}
              </span>
            ) : item.format === "video" ? (
              <span className="flex h-full w-full items-center justify-center bg-zinc-800 text-zinc-300">
                <Film className="h-6 w-6" />
              </span>
            ) : (
              <span className="flex h-full w-full items-center p-3 font-serif text-base font-semibold leading-snug sm:text-lg" style={{ backgroundColor: brand.color, color: readableOn(brand.color) }}>
                <span className="line-clamp-6">{item.title}</span>
              </span>
            ))}
        </div>
      </Link>
      <div className="min-w-0 space-y-1">
        <p className="line-clamp-2 text-sm font-medium leading-snug">
          <span className="text-muted-foreground">{FORMAT_LABELS[item.format]} | </span>
          {item.title}
        </p>
        <p className={cn("flex items-start gap-1 text-xs", failed ? "text-destructive" : "text-muted-foreground")}>
          {making && <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin" aria-hidden />}
          <span className="min-w-0 break-words">{statusLine(item)}</span>
        </p>
        {item.autoPost && <span className="inline-block rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Auto-post</span>}
        {item.status === "ready" && item.note && <p className="text-xs text-muted-foreground">{item.note}</p>}
        {!here && <p className="text-xs text-muted-foreground">The video file is on the device that made it.</p>}
        {item.live && (
          <p className="flex flex-wrap gap-x-3 text-xs">
            {item.live.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className={cn("inline-flex items-center gap-1 font-semibold text-primary hover:underline", TOUCH)}>
                {platformName(l.platform)} <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            ))}
          </p>
        )}
      </div>
      <div className="mt-auto flex flex-wrap gap-1">
        <Button asChild size="sm" variant="outline" className={cn("h-8 px-2.5 text-xs", TOUCH)}>
          <Link to={item.href} aria-label={`Open ${item.title}`}>
            Open
          </Link>
        </Button>
        {item.scheduleHref && (
          <Button asChild size="sm" variant="outline" className={cn("h-8 px-2.5 text-xs", TOUCH)}>
            <Link to={item.scheduleHref}>Schedule</Link>
          </Button>
        )}
        {item.retryHref && (
          <Button asChild size="sm" variant="outline" className={cn("h-8 px-2.5 text-xs", TOUCH)}>
            <Link to={item.retryHref}>Try again</Link>
          </Button>
        )}
      </div>
    </article>
  );
}

export default memo(LibraryCard);
