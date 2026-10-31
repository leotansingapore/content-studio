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
import { FRAME_W, frameHeight, type BoxFont, type ShowSlide, type Slideshow, type TextBox } from "@/lib/slideshow";

export const LINE_HEIGHT = 1.25;
/** Grey under the words while a picture loads, and on a slide with none. */
export const EMPTY_BG = "#52525B";

export type Measure = (text: string, css: string) => number;
// the caption fonts, then the faces the 30 Oct teardowns asked for (ensureCaptionFonts loads them all)
const BOX_CSS: Record<BoxFont, string> = {
  heavy: FONTS.heavy.css,
  clean: FONTS.clean.css,
  serif: FONTS.serif.css,
  classic: '700 {px}px "TikTok Sans", "DM Sans", system-ui, sans-serif',
  condensed: '400 {px}px Anton, Impact, "Arial Narrow", sans-serif',
  italic: 'italic 800 {px}px Poppins, "Arial Black", system-ui, sans-serif',
};
/** The canvas font for a box: its font's template at the box's size. */
export const boxCss = (b: Pick<TextBox, "font" | "size">) => BOX_CSS[b.font].replace("{px}", String(b.size));
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
    // the words' own width with the sticker's padding: in a box narrower than the font it passes the box
    const ink = lines.length ? Math.max(...lines.map((l) => measure(l, css))) + 2 * PAD_X * px : 0;
    const h = Math.max(1, lines.length) * px * LINE_HEIGHT + 2 * PAD_Y * px;
    const cx = b.x * FRAME_W;
    const rw = Math.max(w, ink);
    const rect = { x: cx - rw / 2, y: b.y * H - h / 2, w: rw, h };
    // sideways only the words count, so a short line in a wide box can sit near an edge
    if (cx - ink / 2 < -0.5 || cx + ink / 2 > FRAME_W + 0.5 || rect.y < -0.5 || rect.y + rect.h > H + 0.5) overflow = true;
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
  ctx.fillStyle = slide.fill ?? EMPTY_BG;
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
      if (b.shadow) {
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = lay.px * 0.2;
        ctx.shadowOffsetY = lay.px * 0.04;
      }
      if (b.stroke > 0) {
        ctx.lineWidth = b.stroke * 2;
        ctx.strokeStyle = b.strokeColor;
        ctx.strokeText(line, cx, cy);
      }
      ctx.fillStyle = b.color;
      ctx.fillText(line, cx, cy);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
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

// ---- the 2x2 collage (the 30 Oct teardowns: male_aestheticcc and the.atomic.reset post four photos a slide) ----

export const CELL_GAP = 6;

/** The four cells of a 2x2 collage in a W x H frame, left to right then down, with CELL_GAP between them. */
export function cellRects(W: number, H: number, gap = CELL_GAP): { x: number; y: number; w: number; h: number }[] {
  const w = (W - gap) / 2;
  const h = (H - gap) / 2;
  return [0, 1, 2, 3].map((i) => ({ x: (i % 2) * (w + gap), y: Math.floor(i / 2) * (h + gap), w, h }));
}

/**
 * Four pictures drawn into one, a 2x2 grid at the slideshow's size, each cropped to fill its cell from the centre; an
 * empty or unreadable cell is the empty grey. The slide then holds this one picture, so every other path is unchanged.
 * shortcut: drawn at the size it was made at; a later size change crops the grid until a cell is swapped (which draws it again).
 */
export async function composeCollage(cells: (Blob | null)[], size: Slideshow["size"]): Promise<Blob> {
  const W = FRAME_W;
  const H = frameHeight(size);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw images.");
  try {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, H);
    for (const [i, r] of cellRects(W, H).entries()) {
      const blob = cells[i];
      const bmp = blob ? await bitmapOf(blob) : null;
      if (!bmp) {
        ctx.fillStyle = EMPTY_BG;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        continue;
      }
      const k = Math.max(r.w / bmp.width, r.h / bmp.height);
      const sw = r.w / k;
      const sh = r.h / k;
      ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, r.x, r.y, r.w, r.h);
    }
    return await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("The collage couldn't be drawn."))), "image/jpeg", 0.9));
  } finally {
    c.width = 0;
    c.height = 0;
  }
}

/** A slide whose picture can't be had here: drawing it anyway would post a plain grey slide. */
export class MissingPictureError extends Error {
  constructor(slide: number, stock: boolean) {
    super(
      stock
        ? `Couldn't load slide ${slide}'s picture. Check your connection and try again.`
        : `Slide ${slide}'s picture is on the device you added it from. Swap it in the slideshow first.`,
    );
    this.name = "MissingPictureError";
  }
}

const pngOf = (c: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("The image couldn't be created."))), "image/png"));

/**
 * Every slide as a 1080-wide PNG, drawn one at a time on a canvas that is released after each, so a phone
 * never holds ten 1080x1920 canvases. `signal` stops it between slides. A slide whose picture is missing throws
 * MissingPictureError instead of drawing grey.
 */
export async function slideshowPngs(
  userId: string,
  s: Slideshow,
  o: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<MediaFile[]> {
  await ensureCaptionFonts();
  const look = lookOf(userId, s);
  const out: MediaFile[] = [];
  const stop = () => {
    if (o.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  };
  for (const [i, slide] of s.slides.entries()) {
    stop();
    const pictures = new Map<string, Blob>();
    const key = pictureKey(slide);
    if (key) {
      const blob = await slidePicture(slide);
      if (!blob) throw new MissingPictureError(i + 1, !!slide.photo);
      pictures.set(key, blob);
    }
    const c = document.createElement("canvas");
    c.width = FRAME_W;
    c.height = frameHeight(s.size);
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("This browser can't draw images.");
    let file: Blob;
    try {
      await drawSlide(ctx, slide, s.size, pictures, look);
      file = await pngOf(c);
    } finally {
      c.width = 0;
      c.height = 0;
    }
    // a cancel during the draw: no progress after it, so the line it cleared stays gone
    stop();
    out.push({ file, name: `slide-${i + 1}.png`, type: "image/png" });
    o.onProgress?.(i + 1, s.slides.length);
  }
  return out;
}
