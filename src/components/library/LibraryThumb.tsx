// What a Library card shows of a piece, drawn only once it is on screen: a carousel's, slideshow's or Design's first
// slide, an /image design drawn the way /image draws it, a video's frame, an AI picture. Home's Recent creations and
// Studio's Your latest draw the same thumbs. Each drawing is memoised by id and updatedAt.

import { useEffect, useMemo, useRef, useState } from "react";
import { WarningCircleIcon, ClockIcon, FilmStripIcon, CircleNotchIcon } from "@phosphor-icons/react";
import SlideView from "@/components/design/SlideView";
import { SlideThumb } from "@/components/slideshow/SlideCanvas";
import { DEFAULT_BRAND, loadBrand, type CarouselBrand, type SavedCarousel } from "@/lib/carousel";
import { layoutSlide, readableOn, renderSvg } from "@/lib/carouselLayout";
import { createCanvasMeasure, svgDataUrl } from "@/lib/carouselRender";
import { FORMAT_H, FRAME_W, ensureDesignFonts, type Design } from "@/lib/design";
import { getFile } from "@/lib/deviceFiles";
import { imageBlock, isMeme, layoutImage, secondPicture, staticPhoto } from "@/lib/imageLayout";
import { HEADSHOT, type SavedImage } from "@/lib/images";
import type { LibraryItem } from "@/lib/library";
import type { Slideshow } from "@/lib/slideshow";
import { lookOf } from "@/lib/slideshowDraw";
import { cn } from "@/lib/utils";
import { ensureCaptionFonts } from "@/lib/videoMedia";

/** What the thumbs read besides the item: the brand kit and the pieces by id. */
export interface ThumbSources {
  userId: string;
  brand: CarouselBrand;
  carousels: Map<string, SavedCarousel>;
  shows: Map<string, Slideshow>;
  images: Map<string, SavedImage>;
  designs: Map<string, Design>;
  /** The caption fonts are loaded, so a slideshow's words measure right. */
  fontsReady: boolean;
}

const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
export const thumbSources = (userId: string, s: { brand?: CarouselBrand; carousels: SavedCarousel[]; slideshows: Slideshow[]; images?: SavedImage[]; designs?: Design[] }, fontsReady: boolean): ThumbSources => ({
  userId,
  brand: s.brand ?? DEFAULT_BRAND,
  carousels: byId(s.carousels),
  shows: byId(s.slideshows),
  images: byId(s.images ?? []),
  designs: byId(s.designs ?? []),
  fontsReady,
});
/** The same with this device's brand kit; the stores are the ones the caller already read. */
export const readThumbSources = (userId: string, s: Omit<Parameters<typeof thumbSources>[1], "brand">, fontsReady: boolean): ThumbSources =>
  thumbSources(userId, { ...s, brand: loadBrand(userId) ?? DEFAULT_BRAND }, fontsReady);

/** Slideshow thumbs measure with the caption fonts; only wait for them when there is a slideshow to draw. */
export function useFontsReady(want: boolean) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!want) return;
    let live = true;
    void ensureCaptionFonts().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [want]);
  return ready;
}

/** True once the element has come within a screen of view; it stays true. */
export function useOnScreen<T extends Element>(): [React.RefObject<T>, boolean] {
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
/** A device picture as a data URL (an SVG drawn into an <img> can't load a blob: link), or undefined when it isn't on this device. */
const devicePicture = async (key?: string) => {
  const blob = key ? await getFile(key).catch(() => undefined) : undefined;
  return blob ? (await readDataUrl(blob)) || undefined : undefined;
};

let measure: ReturnType<typeof createCanvasMeasure> | null = null;
const drawn = new Map<string, Promise<string>>();
const once = (key: string, draw: () => Promise<string>) => {
  if (!drawn.has(key)) drawn.set(key, draw().catch(() => ""));
  return drawn.get(key)!;
};
const brandKey = (b: CarouselBrand) => `${b.color}|${b.name}|${b.handle}`;

/** A carousel's first slide as an image, the way /carousel draws it; a picture not on this device is left out. */
const firstSlide = (c: SavedCarousel, brand: CarouselBrand) =>
  once(`c|${c.id}|${c.updatedAt}|${brandKey(brand)}`, async () => {
    const s = c.slides[0];
    const image = await devicePicture(s.image);
    measure ??= createCanvasMeasure();
    return svgDataUrl(renderSvg(layoutSlide({ title: s.title, body: s.body, index: 0, total: c.slides.length, brand, image, align: c.align, scale: c.scale, font: c.font, paper: c.paper }, measure)));
  });

/**
 * What /image's preview hands layoutImage for a saved design. One not finished yet (saved before its words, as a
 * campaign's ad is) keeps the preview's grey sample words: without them an empty layout drew a blank tile.
 */
export function imageInput(g: SavedImage, brand: CarouselBrand, picture?: string, picture2?: string) {
  return { layout: g.layout, words: g.words, brand, font: g.font, paper: g.paper, align: g.align, picture, picture2, samples: !!imageBlock(g.layout, g.words) } as const;
}
/** The device keys of the pictures the design's layout draws: its own, and Expectation vs reality's second. */
export function imagePictures(g: Pick<SavedImage, "layout" | "words" | "pictureKey">): [string | undefined, string | undefined] {
  const pictured = g.layout === "headline" || isMeme(g.layout) || !!staticPhoto(g.layout);
  return [pictured ? g.pictureKey : undefined, g.layout === "expectation" ? secondPicture(g.words) : undefined];
}

/** An /image design as /image draws it, a picture not on this device left out: the thumb, and the Library's Download. */
export async function imageDrawing(g: SavedImage, brand: CarouselBrand) {
  const pic = (key?: string) => (key === HEADSHOT ? Promise.resolve(brand.photo) : devicePicture(key));
  const [picture, picture2] = await Promise.all(imagePictures(g).map(pic));
  measure ??= createCanvasMeasure();
  return layoutImage(imageInput(g, brand, picture, picture2), g.size, measure);
}
const drawImage = (g: SavedImage, brand: CarouselBrand) =>
  once(`g|${g.id}|${g.updatedAt}|${brandKey(brand)}|${brand.photo?.length ?? 0}`, async () => svgDataUrl(renderSvg(await imageDrawing(g, brand))));

function Drawn({ draw, contain }: { draw: () => Promise<string>; contain?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void draw().then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [draw]);
  if (url === null) return <div className="h-full w-full animate-pulse bg-muted" />;
  return url ? <img src={url} alt="" className={cn("h-full w-full", contain ? "object-contain" : "object-cover")} /> : <div className="h-full w-full bg-muted" />;
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

/** A Design's first slide, scaled to cover the box, and again when the box resizes. */
function DesignThumb({ d }: { d: Design }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    ensureDesignFonts();
    const el = ref.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const width = box ? Math.max(box.w, Math.ceil((box.h * FRAME_W) / FORMAT_H[d.format])) : 0;
  return (
    <div ref={ref} className="flex h-full w-full items-center justify-center overflow-hidden">
      {width > 0 && d.slides[0] && <SlideView slide={d.slides[0]} format={d.format} width={width} thumb className="shrink-0" />}
    </div>
  );
}

/** The item's picture, filling its parent. `seen` comes from useOnScreen on the card. */
export default function LibraryThumb({ item, sources, seen }: { item: LibraryItem; sources: ThumbSources; seen: boolean }) {
  const { brand, userId, fontsReady } = sources;
  const t = item.thumb;
  const carousel = t?.kind === "slide" ? sources.carousels.get(t.carouselId) : undefined;
  const show = t?.kind === "show" ? sources.shows.get(t.showId) : undefined;
  const image = t?.kind === "image" ? sources.images.get(t.imageId) : undefined;
  const design = t?.kind === "design" ? sources.designs.get(t.designId) : undefined;
  const look = useMemo(() => (show ? lookOf(userId, show) : null), [userId, show]);
  const drawCarousel = useMemo(() => (carousel ? () => firstSlide(carousel, brand) : null), [carousel, brand]);
  const drawAd = useMemo(() => (image ? () => drawImage(image, brand) : null), [image, brand]);
  const has = carousel || (show && look) || image || design || t?.kind === "url" || t?.kind === "media";
  if (has && !seen) return <div className="h-full w-full bg-muted" />;
  if (drawCarousel) return <Drawn draw={drawCarousel} />;
  if (show && look) return <SlideThumb slide={show.slides[0]} size={show.size} look={look} ready={fontsReady} className="h-full w-full rounded-none object-cover" />;
  // an ad's words reach its edges: shown whole, never cropped to the card
  if (drawAd) return <Drawn draw={drawAd} contain />;
  if (design) return <DesignThumb d={design} />;
  if (t?.kind === "url") return <img src={t.url} alt="" loading="lazy" className="h-full w-full object-cover" />;
  if (t?.kind === "media") return <MediaThumb mediaKey={t.key} />;

  const making = item.status === "making";
  // a job has nothing to show yet; a post that failed to go out still shows its words
  if (item.key.startsWith("j:") && (making || item.status === "failed"))
    return (
      <span className="flex h-full w-full items-center justify-center text-muted-foreground">
        {item.waiting ? <ClockIcon className="h-6 w-6" /> : making ? <CircleNotchIcon className="h-6 w-6 animate-spin text-primary" /> : <WarningCircleIcon className="h-6 w-6 text-destructive" />}
      </span>
    );
  if (item.format === "video")
    return (
      <span className="flex h-full w-full items-center justify-center text-muted-foreground">
        <FilmStripIcon className="h-6 w-6" />
      </span>
    );
  return (
    <span className="flex h-full w-full items-center p-3 font-serif text-base font-semibold leading-snug sm:text-lg" style={{ backgroundColor: brand.color, color: readableOn(brand.color) }}>
      <span className="line-clamp-6">{item.title}</span>
    </span>
  );
}
