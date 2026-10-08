// Browser side of the carousel maker: measures text with a canvas, draws a
// slide's SVG onto a 1080x1350 canvas and hands the PNG to the browser as a
// download. The layout itself is pure and tested (carouselLayout.ts).

import { fontCss, SLIDE_HEIGHT, SLIDE_WIDTH, type Measure } from "@/lib/carouselLayout";

export function createCanvasMeasure(): Measure {
  const ctx = document.createElement("canvas").getContext("2d");
  const cache = new Map<string, number>();
  return (text, font) => {
    const css = fontCss(font);
    const key = `${css}\u0000${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    let width: number;
    if (ctx) {
      ctx.font = css;
      width = ctx.measureText(text).width;
    } else {
      width = Array.from(text).length * font.size * 0.55;
    }
    if (cache.size > 20_000) cache.clear();
    cache.set(key, width);
    return width;
  };
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The slide image couldn't be drawn."));
    img.src = src;
  });
}

export async function svgToPng(svg: string): Promise<Blob> {
  return svgToBlob(svg, "image/png");
}

/** JPEG bytes of a slide, for the PDF (a document post). */
export async function svgToJpeg(svg: string): Promise<Uint8Array> {
  return new Uint8Array(await (await svgToBlob(svg, "image/jpeg", 0.92)).arrayBuffer());
}

async function svgToBlob(svg: string, type: string, quality?: number): Promise<Blob> {
  const img = await loadImage(svgDataUrl(svg));
  const canvas = document.createElement("canvas");
  canvas.width = SLIDE_WIDTH;
  canvas.height = SLIDE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw images.");
  ctx.drawImage(img, 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The image couldn't be created."))), type, quality);
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
