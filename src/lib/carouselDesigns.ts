// Carousel designs and sizes (formats-carousel-designs, Leo only for now), as data. layoutSlide in
// carouselLayout.ts reads a design's two switches (its cover and its point slides), so each design is a
// combination of a few drawing changes, never a drawing routine of its own. A design only sets the starting
// font and paper; both stay changeable after it is picked.
//
// Fonts stay system fonts (an SVG drawn into a canvas can't load web fonts; phase 3 brief, carousel-designs).

import { CAROUSEL_DESIGNS, type CarouselDesign } from "@/lib/links";
import { CAROUSEL_SIZES, type CarouselSize } from "@/lib/carousel";
import type { SlideFont, SlidePaper } from "@/lib/carouselLayout";

export { CAROUSEL_DESIGNS, CAROUSEL_SIZES, type CarouselDesign, type CarouselSize };

export interface DesignDef {
  label: string;
  /** The cover: today's, the hook very large, or the cover's own picture full bleed under a dark fade. */
  cover: "plain" | "bold" | "photo";
  /** The point slides: today's, a big number, ticked lines, a social post card, quote marks or ruled paper. */
  point: "plain" | "numbered" | "checklist" | "card" | "quote" | "notebook";
  /** The font and paper a carousel starts on when this design is picked; Clean keeps what the carousel has. */
  font?: SlideFont;
  paper?: SlidePaper;
}

export const DESIGNS: Record<CarouselDesign, DesignDef> = {
  clean: { label: "Clean", cover: "plain", point: "plain" },
  bold: { label: "Bold cover", cover: "bold", point: "plain", font: "modern", paper: "light" },
  numbered: { label: "Numbered", cover: "plain", point: "numbered", font: "modern", paper: "light" },
  checklist: { label: "Checklist", cover: "plain", point: "checklist", font: "classic", paper: "tint" },
  "post-card": { label: "Post card", cover: "plain", point: "card", font: "modern", paper: "light" },
  "photo-cover": { label: "Photo cover", cover: "photo", point: "plain", font: "classic", paper: "dark" },
  quote: { label: "Quote", cover: "plain", point: "quote", font: "serif", paper: "light" },
  notebook: { label: "Notebook", cover: "plain", point: "notebook", font: "serif", paper: "light" },
};

export interface SizeDef {
  label: string;
  width: number;
  height: number;
  /** Where the text (or a slide picture) starts. */
  top: number;
  /** The footer rule; the name, handle and slide number sit between it and footerEnd. */
  footer: number;
  footerEnd: number;
  /** Height of a slide picture above the text. */
  image: number;
  /** LinkedIn takes a PDF document at 4:5 and 1:1; 9:16 is PNGs for TikTok photo mode and Stories. */
  pdf: boolean;
}

/** Text a 9:16 slide keeps out of, at the top and at the bottom, for the app's own buttons. */
export const SAFE_9X16 = 250;

export const SLIDE_SIZES: Record<CarouselSize, SizeDef> = {
  "4x5": { label: "4:5", width: 1080, height: 1350, top: 168, footer: 1176, footerEnd: 1350, image: 470, pdf: true },
  "1x1": { label: "1:1", width: 1080, height: 1080, top: 136, footer: 906, footerEnd: 1080, image: 300, pdf: true },
  "9x16": { label: "9:16", width: 1080, height: 1920, top: 330, footer: 1920 - SAFE_9X16 - 174, footerEnd: 1920 - SAFE_9X16, image: 600, pdf: false },
};

export const isDesign = (v: unknown): v is CarouselDesign => typeof v === "string" && (CAROUSEL_DESIGNS as readonly string[]).includes(v);
export const isSize = (v: unknown): v is CarouselSize => typeof v === "string" && (CAROUSEL_SIZES as readonly string[]).includes(v);

/** The font and paper a carousel moves to when this design is picked: the design's own, or the current ones for Clean. */
export function designLook(design: CarouselDesign, current: { font: SlideFont; paper: SlidePaper }): { font: SlideFont; paper: SlidePaper } {
  const d = DESIGNS[design];
  return { font: d?.font ?? current.font, paper: d?.paper ?? current.paper };
}

/** A slide's SVG drawn at its own size as a PNG or JPEG. Browser only: carouselRender's svgToPng draws 1080x1350 only. */
export async function slideImage(svg: string, size: CarouselSize, type: "image/png" | "image/jpeg", quality?: number): Promise<Blob> {
  const { width, height } = SLIDE_SIZES[size];
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("The slide image couldn't be drawn."));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw images.");
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The image couldn't be created."))), type, quality));
}
