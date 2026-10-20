// Drawing a slideshow slide on a canvas, for the editor, its thumbnails, Download and Post it for me. The
// layout (layoutBoxes) is pure and tested; painting runs in the browser after ensureCaptionFonts(), so the
// three fonts measure the same on screen and in the PNGs.

import { wrapText, type FontSpec } from "@/lib/carouselLayout";
import { loadBrand } from "@/lib/carousel";
import { getFile } from "@/lib/deviceFiles";
import { downloadStock } from "@/lib/stockMedia";
import { FONTS } from "@/lib/videoEdit";
import { ensureCaptionFonts } from "@/lib/videoMedia";
import type { MediaFile } from "@/lib/autoPost";
import { FRAME_W, frameHeight, type ShowSlide, type Slideshow, type TextBox } from "@/lib/slideshow";

export const LINE_HEIGHT = 1.25;
/** Grey under the words while a picture loads, and on a slide with none. */
export const EMPTY_BG = "#52525B";

export type Measure = (text: string, css: string) => number;
/** The canvas font for a box: FONTS' template at the box's size. */
export const boxCss = (b: Pick<TextBox, "font" | "size">) => FONTS[b.font].css.replace("{px}", String(b.size));
// sticker padding, as shares of the font size
const PAD_X = 0.35;
const PAD_Y = 0.15;
// wrapText wants a carousel FontSpec; the measure below ignores it and uses the box's own css
const SPEC: FontSpec = { family: "sans", weight: 600, size: 0 };

export interface BoxLayout {
  id: string;
  lines: string[];
  px: number;
  /** On the 1080-wide frame, in pixels. */
  rect: { x: number; y: number; w: number; h: number };
}

/** Where each box's lines land. `overflow` when any box block runs past the frame. */
export function layoutBoxes(slide: ShowSlide, size: Slideshow["size"], measure: Measure): { boxes: BoxLayout[]; overflow: boolean } {
  const H = frameHeight(size);
  let overflow = false;
  const boxes = slide.boxes.map((b) => {
    const css = boxCss(b);
    const px = b.size;
    const w = b.w * FRAME_W;
    const lines = wrapText(b.text, Math.max(px, w - 2 * PAD_X * px), SPEC, (t) => measure(t, css));
    const h = Math.max(1, lines.length) * px * LINE_HEIGHT + 2 * PAD_Y * px;
    const rect = { x: b.x * FRAME_W - w / 2, y: b.y * H - h / 2, w, h };
    if (rect.x < -0.5 || rect.y < -0.5 || rect.x + rect.w > FRAME_W + 0.5 || rect.y + rect.h > H + 0.5) overflow = true;
    return { id: b.id, lines, px, rect };
  });
  return { boxes, overflow };
}

/** The key a slide's picture is kept under in a pictures map: its device key, else its Pexels link. */
export const pictureKey = (slide: ShowSlide): string | null => slide.image ?? slide.photo?.src ?? null;

const fetched = new Map<string, Promise<Blob | null>>();
/** The slide's picture: from this device, else downloaded again from Pexels; null when neither has it. */
export async function slidePicture(slide: ShowSlide): Promise<Blob | null> {
  const own = slide.image ? await getFile(slide.image).catch(() => undefined) : undefined;
  if (own) return own;
  const src = slide.photo?.src;
  if (!src) return null;
  if (!fetched.has(src)) fetched.set(src, downloadStock(src).catch(() => (fetched.delete(src), null)));
  return fetched.get(src)!;
}

const bitmaps = new WeakMap<Blob, Promise<ImageBitmap | null>>();
/** A decoded picture, decoded once per file, so dragging a box redraws without decoding again. */
export function bitmapOf(blob: Blob): Promise<ImageBitmap | null> {
  let hit = bitmaps.get(blob);
  if (!hit) bitmaps.set(blob, (hit = createImageBitmap(blob).catch(() => null)));
  return hit;
}

const logos = new Map<string, Promise<HTMLImageElement | null>>();
/** The brand kit logo (a data URL), loaded once. */
export function logoOf(src: string): Promise<HTMLImageElement | null> {
  if (!logos.has(src))
    logos.set(
      src,
      new Promise((resolve) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => resolve(null);
        i.src = src;
      }),
    );
  return logos.get(src)!;
}

/** The overlay look: darkening over the picture and the adviser's handle or logo. */
export interface SlideLook {
  darken?: number;
  handle?: string;
  logo?: string;
}

/** What the Overlay tab picked, filled in from the brand kit. */
export function lookOf(userId: string, s: Pick<Slideshow, "overlay">): SlideLook {
  const brand = s.overlay.mark === "off" ? null : loadBrand(userId);
  return {
    darken: s.overlay.darken,
    ...(s.overlay.mark === "handle" && brand?.handle ? { handle: brand.handle } : {}),
    ...(s.overlay.mark === "logo" && brand?.logo ? { logo: brand.logo } : {}),
  };
}

let screen: CanvasRenderingContext2D | null = null;
/** A measure for layouts made outside a paint (the editor's handles and overflow line). */
export function screenMeasure(): Measure {
  screen ??= document.createElement("canvas").getContext("2d")!;
  return canvasMeasure(screen);
}

function canvasMeasure(ctx: CanvasRenderingContext2D): Measure {
  return (text, css) => {
    ctx.font = css;
    return ctx.measureText(text).width;
  };
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

/** Paints a slide with everything it needs already decoded (no awaits, so a later paint can't be overtaken). */
export function paintSlide(
  ctx: CanvasRenderingContext2D,
  slide: ShowSlide,
  size: Slideshow["size"],
  picture: ImageBitmap | null,
  look: SlideLook = {},
  logo: HTMLImageElement | null = null,
): void {
  const W = FRAME_W;
  const H = frameHeight(size);
  ctx.save();
  ctx.fillStyle = EMPTY_BG;
  ctx.fillRect(0, 0, W, H);
  if (picture) {
    // cover the frame, cropped to the centre
    const k = Math.max(W / picture.width, H / picture.height);
    const pw = picture.width * k;
    const ph = picture.height * k;
    ctx.drawImage(picture, (W - pw) / 2, (H - ph) / 2, pw, ph);
    if (look.darken) {
      ctx.fillStyle = `rgba(0,0,0,${look.darken})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
  const measure = canvasMeasure(ctx);
  const { boxes } = layoutBoxes(slide, size, measure);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  for (const [i, lay] of boxes.entries()) {
    const b = slide.boxes[i];
    const css = boxCss(b);
    const step = lay.px * LINE_HEIGHT;
    const cx = lay.rect.x + lay.rect.w / 2;
    const top = lay.rect.y + PAD_Y * lay.px;
    if (b.bg === "bar" && lay.lines.length) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, lay.rect.y, W, lay.rect.h);
    }
    ctx.font = css;
    lay.lines.forEach((line, k) => {
      const cy = top + step * (k + 0.5);
      if (b.bg === "white") {
        const tw = measure(line, css);
        ctx.fillStyle = "#FFFFFF";
        rounded(ctx, cx - tw / 2 - PAD_X * lay.px, cy - step / 2, tw + 2 * PAD_X * lay.px, step, lay.px * 0.28);
      }
      if (b.stroke > 0) {
        ctx.lineWidth = b.stroke * 2;
        ctx.strokeStyle = b.strokeColor;
        ctx.strokeText(line, cx, cy);
      }
      ctx.fillStyle = b.color;
      ctx.fillText(line, cx, cy);
    });
  }
  if (look.handle) {
    ctx.font = boxCss({ font: "clean", size: 32 });
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 8;
    ctx.fillText(look.handle, W / 2, H - 56);
    ctx.shadowBlur = 0;
  }
  if (logo) {
    const k = Math.min(140 / logo.naturalWidth, 90 / logo.naturalHeight);
    ctx.drawImage(logo, W - 40 - logo.naturalWidth * k, H - 40 - logo.naturalHeight * k, logo.naturalWidth * k, logo.naturalHeight * k);
  }
  ctx.restore();
}

/** Draws one slide. `pictures` holds the slide's picture under pictureKey(slide). */
export async function drawSlide(
  ctx: CanvasRenderingContext2D,
  slide: ShowSlide,
  size: Slideshow["size"],
  pictures: Map<string, Blob>,
  mark?: SlideLook,
): Promise<void> {
  const key = pictureKey(slide);
  const blob = key ? pictures.get(key) : undefined;
  const [picture, logo] = await Promise.all([blob ? bitmapOf(blob) : null, mark?.logo ? logoOf(mark.logo) : null]);
  paintSlide(ctx, slide, size, picture, mark, logo);
}

const pngOf = (c: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("The image couldn't be created."))), "image/png"));

/**
 * Every slide as a 1080-wide PNG, drawn one at a time on a canvas that is released after each, so a phone
 * never holds ten 1080x1920 canvases. `signal` stops it between slides.
 */
export async function slideshowPngs(
  userId: string,
  s: Slideshow,
  o: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<MediaFile[]> {
  await ensureCaptionFonts();
  const look = lookOf(userId, s);
  const out: MediaFile[] = [];
  for (const [i, slide] of s.slides.entries()) {
    if (o.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const pictures = new Map<string, Blob>();
    const blob = await slidePicture(slide);
    const key = pictureKey(slide);
    if (blob && key) pictures.set(key, blob);
    const c = document.createElement("canvas");
    c.width = FRAME_W;
    c.height = frameHeight(s.size);
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("This browser can't draw images.");
    try {
      await drawSlide(ctx, slide, s.size, pictures, look);
      out.push({ file: await pngOf(c), name: `slide-${i + 1}.png`, type: "image/png" });
    } finally {
      c.width = 0;
      c.height = 0;
    }
    o.onProgress?.(i + 1, s.slides.length);
  }
  return out;
}
